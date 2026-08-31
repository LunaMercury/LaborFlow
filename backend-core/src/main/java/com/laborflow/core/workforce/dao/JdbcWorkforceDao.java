package com.laborflow.core.workforce.dao;

import com.laborflow.core.workforce.dto.WorkTypeResponse;
import com.laborflow.core.workforce.dto.WorkerResponse;
import com.laborflow.core.workforce.dto.WorkerSeparationRuleRequest;
import com.laborflow.core.workforce.dto.WorkerSeparationRuleResponse;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcWorkforceDao implements WorkforceDao {
    private final JdbcTemplate jdbcTemplate;

    public JdbcWorkforceDao(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public List<WorkerResponse> findWorkersByLoginId(String loginId) {
        List<WorkerProjection> workers = jdbcTemplate.query(
            """
            SELECT
                p.uuid AS profile_uuid,
                COALESCE(p.local_name, w.canonical_name, '') AS display_name,
                p.local_nickname,
                COALESCE(p.local_phone_encrypted, '') AS local_phone_encrypted,
                w.age,
                w.gender,
                COALESCE(p.private_memo, '') AS private_memo,
                COALESCE(p.pickup_location, '') AS pickup_location,
                COALESCE(p.is_active, true) AS is_active,
                COALESCE(p.available_days_mask, 127) AS available_days_mask,
                COALESCE(p.availability_memo, '') AS availability_memo,
                COALESCE(pay.bank_code, '') AS bank_code,
                COALESCE(pay.bank_name, '') AS bank_name,
                COALESCE(pay.account_number_encrypted, '') AS account_number_encrypted,
                COALESCE(pay.account_holder_name, '') AS account_holder_name,
                COALESCE(pay.verification_status, 'NOT_VERIFIED') AS payment_verification_status,
                t.uuid AS team_uuid,
                t.name AS team_name,
                tm.role AS team_role,
                tm.display_order AS team_display_order,
                activity.last_worked_date,
                COALESCE(activity.total_work_days, 0) AS total_work_days,
                (risk.has_active_flag OR no_show.no_show_count > 0) AS no_show_risk,
                risk.has_manual_flag AS no_show_risk_manual,
                COALESCE(no_show.no_show_count, 0) AS no_show_count
            FROM public.labor_agency_worker_profile p
            JOIN public.app_account a ON a.labor_agency_owner_uuid = p.agency_owner_uuid
            LEFT JOIN public.worker w ON w.uuid = p.worker_uuid
            LEFT JOIN public.labor_agency_worker_payment_profile pay
                ON pay.worker_profile_uuid = p.uuid
                AND pay.deleted_at IS NULL
            LEFT JOIN public.labor_agency_worker_team_member tm
                ON tm.worker_profile_uuid = p.uuid
                AND tm.status = 'ACTIVE'
                AND tm.deleted_at IS NULL
                AND (tm.active_from IS NULL OR tm.active_from <= CURRENT_DATE)
                AND (tm.active_to IS NULL OR tm.active_to >= CURRENT_DATE)
            LEFT JOIN public.labor_agency_worker_team t
                ON t.uuid = tm.team_uuid
                AND t.agency_owner_uuid = p.agency_owner_uuid
                AND t.status = 'ACTIVE'
                AND t.deleted_at IS NULL
            LEFT JOIN public.worker_activity_summary activity
                ON activity.agency_owner_uuid = p.agency_owner_uuid
                AND activity.worker_profile_uuid = p.uuid
            LEFT JOIN LATERAL (
                SELECT count(*)::integer AS no_show_count
                FROM public.worker_no_show_incident incident
                WHERE incident.agency_owner_uuid = p.agency_owner_uuid
                    AND incident.worker_profile_uuid = p.uuid
                    AND incident.status <> 'CANCELLED'
                    AND incident.deleted_at IS NULL
            ) no_show ON true
            LEFT JOIN LATERAL (
                SELECT count(*) > 0 AS has_active_flag,
                       count(*) FILTER (WHERE risk.source = 'MANUAL') > 0 AS has_manual_flag
                FROM public.worker_risk_flag risk
                WHERE risk.agency_owner_uuid = p.agency_owner_uuid
                    AND risk.worker_profile_uuid = p.uuid
                    AND risk.risk_type = 'NO_SHOW'
                    AND risk.status = 'ACTIVE'
                    AND risk.deleted_at IS NULL
            ) risk ON true
            WHERE a.login_id = ?
                AND p.status = 'ACTIVE'
                AND p.deleted_at IS NULL
            ORDER BY
                COALESCE(t.sort_order, 2147483647),
                COALESCE(tm.display_order, 2147483647),
                COALESCE(NULLIF(p.local_name, ''), NULLIF(p.local_nickname, ''), w.canonical_name, ''),
                p.created_at
            """,
            (resultSet, rowNumber) -> mapWorkerProjection(resultSet),
            loginId
        );

        if (workers.isEmpty()) {
            return List.of();
        }

        Map<UUID, List<String>> workTypeCodesByProfileUuid = findWorkTypeCodesByProfileUuid(
            workers.stream().map(WorkerProjection::profileUuid).toList()
        );
        Map<UUID, Map<String, Integer>> workTypeRatingsByProfileUuid = findWorkTypeRatingsByProfileUuid(
            workers.stream().map(WorkerProjection::profileUuid).toList()
        );

        return workers.stream()
            .map(worker -> new WorkerResponse(
                worker.profileUuid(),
                worker.name(),
                worker.nickname(),
                worker.phone(),
                worker.age(),
                worker.gender(),
                worker.memo(),
                worker.pickupLocation(),
                worker.isActive(),
                worker.availableDaysMask(),
                worker.availabilityMemo(),
                worker.bankCode(),
                worker.bankName(),
                worker.accountNumber(),
                worker.accountHolderName(),
                worker.paymentVerificationStatus(),
                worker.teamUuid(),
                worker.teamName(),
                worker.teamRole(),
                worker.teamDisplayOrder(),
                worker.lastWorkedDate(),
                worker.totalWorkDays(),
                worker.noShowRisk(),
                worker.noShowRiskManual(),
                worker.noShowCount(),
                workTypeCodesByProfileUuid.getOrDefault(worker.profileUuid(), List.of()),
                workTypeRatingsByProfileUuid.getOrDefault(worker.profileUuid(), Map.of())
            ))
            .toList();
    }

    @Override
    public List<WorkTypeResponse> findActiveWorkTypes() {
        return jdbcTemplate.query(
            """
            SELECT code, name
            FROM public.work_type
            WHERE status = 'ACTIVE'
            ORDER BY name
            """,
            (resultSet, rowNumber) -> new WorkTypeResponse(
                resultSet.getString("code"),
                resultSet.getString("name")
            )
        );
    }

    @Override
    public Optional<UUID> findAgencyOwnerUuidByLoginId(String loginId) {
        List<UUID> ownerUuids = jdbcTemplate.query(
            """
            SELECT labor_agency_owner_uuid
            FROM public.app_account
            WHERE login_id = ?
                AND labor_agency_owner_uuid IS NOT NULL
                AND status = 'ACTIVE'
            """,
            (resultSet, rowNumber) -> resultSet.getObject("labor_agency_owner_uuid", UUID.class),
            loginId
        );

        return ownerUuids.stream().findFirst();
    }

    @Override
    public Optional<UUID> findAccountUuidByLoginId(String loginId) {
        return jdbcTemplate.query(
            """
            SELECT uuid
            FROM public.app_account
            WHERE login_id = ? AND status = 'ACTIVE'
            """,
            (resultSet, rowNumber) -> resultSet.getObject("uuid", UUID.class),
            loginId
        ).stream().findFirst();
    }

    @Override
    public Optional<UUID> findWorkerUuidByPhoneHashSource(String phoneHashSource) {
        List<UUID> workerUuids = jdbcTemplate.query(
            """
            SELECT worker_uuid
            FROM public.worker_sensitive_profile
            WHERE phone_hash = encode(digest(?, 'sha256'), 'hex')
            """,
            (resultSet, rowNumber) -> resultSet.getObject("worker_uuid", UUID.class),
            phoneHashSource
        );

        return workerUuids.stream().findFirst();
    }

    @Override
    public boolean workerProfileBelongsToLoginId(String loginId, UUID workerProfileUuid) {
        Integer count = jdbcTemplate.queryForObject(
            """
            SELECT count(*)
            FROM public.labor_agency_worker_profile p
            JOIN public.app_account a ON a.labor_agency_owner_uuid = p.agency_owner_uuid
            WHERE a.login_id = ?
                AND p.uuid = ?
                AND p.status = 'ACTIVE'
                AND p.deleted_at IS NULL
            """,
            Integer.class,
            loginId,
            workerProfileUuid
        );

        return count != null && count > 0;
    }

    @Override
    public boolean workerTeamBelongsToLoginId(String loginId, UUID teamUuid) {
        Integer count = jdbcTemplate.queryForObject(
            """
            SELECT count(*)
            FROM public.labor_agency_worker_team t
            JOIN public.app_account a ON a.labor_agency_owner_uuid = t.agency_owner_uuid
            WHERE a.login_id = ?
                AND t.uuid = ?
                AND t.status = 'ACTIVE'
                AND t.deleted_at IS NULL
            """,
            Integer.class,
            loginId,
            teamUuid
        );

        return count != null && count > 0;
    }

    @Override
    public boolean guestAssignmentBelongsToLoginId(String loginId, UUID assignmentUuid) {
        Integer count = jdbcTemplate.queryForObject(
            """
            SELECT count(*)
            FROM public.work_schedule_assignment assignment
            JOIN public.app_account account
                ON account.labor_agency_owner_uuid = assignment.agency_owner_uuid
            WHERE account.login_id = ?
                AND account.status = 'ACTIVE'
                AND assignment.uuid = ?
                AND assignment.participant_type = 'GUEST'
                AND assignment.deleted_at IS NULL
            """,
            Integer.class,
            loginId,
            assignmentUuid
        );
        return count != null && count > 0;
    }

    @Override
    public Optional<UUID> findWorkerProfileUuidByPhoneHashSource(String loginId, String phoneHashSource) {
        return jdbcTemplate.query(
            """
            SELECT profile.uuid
            FROM public.labor_agency_worker_profile profile
            JOIN public.app_account account
                ON account.labor_agency_owner_uuid = profile.agency_owner_uuid
            WHERE account.login_id = ?
                AND account.status = 'ACTIVE'
                AND profile.local_phone_hash = encode(digest(?, 'sha256'), 'hex')
                AND profile.deleted_at IS NULL
            """,
            (resultSet, rowNumber) -> resultSet.getObject("uuid", UUID.class),
            loginId,
            phoneHashSource
        ).stream().findFirst();
    }

    @Override
    public boolean agencyWorkerProfileExists(UUID agencyOwnerUuid, UUID workerUuid) {
        Integer count = jdbcTemplate.queryForObject(
            """
            SELECT count(*)
            FROM public.labor_agency_worker_profile
            WHERE agency_owner_uuid = ?
                AND worker_uuid = ?
                AND status = 'ACTIVE'
                AND deleted_at IS NULL
            """,
            Integer.class,
            agencyOwnerUuid,
            workerUuid
        );

        return count != null && count > 0;
    }

    @Override
    public UUID insertWorker(String canonicalName, String gender, Integer age) {
        return jdbcTemplate.queryForObject(
            """
            INSERT INTO public.worker (
                canonical_name,
                gender,
                age
            )
            VALUES (?, ?, ?)
            RETURNING uuid
            """,
            UUID.class,
            canonicalName,
            gender,
            age
        );
    }

    @Override
    public void upsertWorkerSensitiveProfile(UUID workerUuid, String phone, String phoneHashSource) {
        jdbcTemplate.update(
            """
            INSERT INTO public.worker_sensitive_profile (
                worker_uuid,
                phone_encrypted,
                phone_hash
            )
            VALUES (?, ?, encode(digest(?, 'sha256'), 'hex'))
            ON CONFLICT (worker_uuid) DO UPDATE
            SET phone_encrypted = EXCLUDED.phone_encrypted,
                phone_hash = EXCLUDED.phone_hash
            """,
            workerUuid,
            phone,
            phoneHashSource
        );
    }

    @Override
    public UUID insertWorkerProfile(
        UUID agencyOwnerUuid,
        UUID workerUuid,
        String localName,
        String localNickname,
        String phone,
        String phoneHashSource,
        String pickupLocation,
        String privateMemo,
        boolean isActive,
        int availableDaysMask,
        String availabilityMemo
    ) {
        return jdbcTemplate.queryForObject(
            """
            INSERT INTO public.labor_agency_worker_profile (
                agency_owner_uuid,
                worker_uuid,
                local_name,
                local_nickname,
                local_phone_encrypted,
                local_phone_hash,
                pickup_location,
                private_memo,
                is_active,
                available_days_mask,
                availability_memo
            )
            VALUES (?, ?, ?, ?, ?, encode(digest(?, 'sha256'), 'hex'), ?, ?, ?, ?, ?)
            RETURNING uuid
            """,
            UUID.class,
            agencyOwnerUuid,
            workerUuid,
            localName,
            localNickname,
            phone,
            phoneHashSource,
            pickupLocation,
            privateMemo,
            isActive,
            availableDaysMask,
            availabilityMemo
        );
    }

    @Override
    public void updateWorkerIdentity(UUID workerProfileUuid, String name, String nickname) {
        jdbcTemplate.update(
            """
            UPDATE public.labor_agency_worker_profile
            SET local_name = ?,
                local_nickname = ?
            WHERE uuid = ?
                AND deleted_at IS NULL
            """,
            name,
            nickname,
            workerProfileUuid
        );
    }

    @Override
    public boolean localPhoneExistsForOtherProfile(String loginId, UUID workerProfileUuid, String phoneHashSource) {
        Integer count = jdbcTemplate.queryForObject(
            """
            SELECT count(*)
            FROM public.labor_agency_worker_profile p
            JOIN public.app_account a ON a.labor_agency_owner_uuid = p.agency_owner_uuid
            WHERE a.login_id = ?
                AND p.uuid <> ?
                AND p.local_phone_hash = encode(digest(?, 'sha256'), 'hex')
                AND p.status = 'ACTIVE'
                AND p.deleted_at IS NULL
            """,
            Integer.class,
            loginId,
            workerProfileUuid,
            phoneHashSource
        );

        return count != null && count > 0;
    }

    @Override
    public void updateWorkerPhone(UUID workerProfileUuid, String phone, String phoneHashSource) {
        jdbcTemplate.update(
            """
            UPDATE public.labor_agency_worker_profile
            SET local_phone_encrypted = ?,
                local_phone_hash = encode(digest(?, 'sha256'), 'hex')
            WHERE uuid = ?
                AND deleted_at IS NULL
            """,
            phone,
            phoneHashSource,
            workerProfileUuid
        );
    }

    @Override
    public void updateWorkerPickupLocation(UUID workerProfileUuid, String pickupLocation) {
        jdbcTemplate.update(
            """
            UPDATE public.labor_agency_worker_profile
            SET pickup_location = ?
            WHERE uuid = ?
                AND deleted_at IS NULL
            """,
            pickupLocation,
            workerProfileUuid
        );
    }

    @Override
    public void updateWorkerGender(UUID workerProfileUuid, String gender) {
        jdbcTemplate.update(
            """
            UPDATE public.worker w
            SET gender = ?
            FROM public.labor_agency_worker_profile p
            WHERE p.worker_uuid = w.uuid
                AND p.uuid = ?
                AND p.deleted_at IS NULL
            """,
            gender,
            workerProfileUuid
        );
    }

    @Override
    public void updateWorkerCoreDetails(UUID workerProfileUuid, String gender, Integer age) {
        jdbcTemplate.update(
            """
            UPDATE public.worker w
            SET gender = ?,
                age = ?
            FROM public.labor_agency_worker_profile p
            WHERE p.worker_uuid = w.uuid
                AND p.uuid = ?
                AND p.deleted_at IS NULL
            """,
            gender,
            age,
            workerProfileUuid
        );
    }

    @Override
    public void updateWorkerProfileDetails(
        UUID workerProfileUuid,
        String pickupLocation,
        String privateMemo,
        boolean isActive,
        int availableDaysMask,
        String availabilityMemo
    ) {
        jdbcTemplate.update(
            """
            UPDATE public.labor_agency_worker_profile
            SET pickup_location = ?,
                private_memo = ?,
                is_active = ?,
                available_days_mask = ?,
                availability_memo = ?
            WHERE uuid = ?
                AND deleted_at IS NULL
            """,
            pickupLocation,
            privateMemo,
            isActive,
            availableDaysMask,
            availabilityMemo,
            workerProfileUuid
        );
    }

    @Override
    public void setWorkerNoShowRisk(UUID workerProfileUuid, boolean enabled) {
        if (enabled) {
            jdbcTemplate.update(
                """
                INSERT INTO public.worker_risk_flag (
                    agency_owner_uuid,
                    worker_profile_uuid,
                    risk_type,
                    status,
                    source
                )
                SELECT p.agency_owner_uuid, p.uuid, 'NO_SHOW', 'ACTIVE', 'MANUAL'
                FROM public.labor_agency_worker_profile p
                WHERE p.uuid = ?
                    AND p.deleted_at IS NULL
                    AND NOT EXISTS (
                        SELECT 1
                        FROM public.worker_risk_flag risk
                        WHERE risk.agency_owner_uuid = p.agency_owner_uuid
                            AND risk.worker_profile_uuid = p.uuid
                            AND risk.risk_type = 'NO_SHOW'
                            AND risk.source = 'MANUAL'
                            AND risk.status = 'ACTIVE'
                            AND risk.deleted_at IS NULL
                    )
                """,
                workerProfileUuid
            );
            return;
        }

        jdbcTemplate.update(
            """
            UPDATE public.worker_risk_flag
            SET status = 'CLEARED', cleared_at = now(), updated_at = now()
            WHERE worker_profile_uuid = ?
                AND risk_type = 'NO_SHOW'
                AND source = 'MANUAL'
                AND status = 'ACTIVE'
                AND deleted_at IS NULL
            """,
            workerProfileUuid
        );
    }

    @Override
    public List<WorkerSeparationRuleResponse> findWorkerSeparationRules(UUID agencyOwnerUuid) {
        return findWorkerSeparationRules(agencyOwnerUuid, List.of());
    }

    @Override
    public List<WorkerSeparationRuleResponse> findWorkerSeparationRules(
        UUID agencyOwnerUuid,
        List<UUID> workerProfileUuids
    ) {
        List<Object> parameters = new ArrayList<>();
        parameters.add(agencyOwnerUuid);
        String workerFilter = "";
        if (!workerProfileUuids.isEmpty()) {
            String workerPlaceholders = placeholders(workerProfileUuids.size());
            workerFilter = " AND (rule.worker_profile_uuid_a IN (%s) OR rule.worker_profile_uuid_b IN (%s))"
                .formatted(workerPlaceholders, workerPlaceholders);
            parameters.addAll(workerProfileUuids);
            parameters.addAll(workerProfileUuids);
        }

        return jdbcTemplate.query(
            """
            SELECT
                rule.uuid,
                rule.worker_profile_uuid_a,
                COALESCE(profile_a.local_name, profile_a.local_nickname, worker_a.canonical_name, '') AS worker_name_a,
                rule.worker_profile_uuid_b,
                COALESCE(profile_b.local_name, profile_b.local_nickname, worker_b.canonical_name, '') AS worker_name_b,
                COALESCE(rule.reason, '') AS reason
            FROM public.labor_agency_worker_separation_rule rule
            JOIN public.labor_agency_worker_profile profile_a
                ON profile_a.uuid = rule.worker_profile_uuid_a
                AND profile_a.agency_owner_uuid = rule.agency_owner_uuid
            JOIN public.worker worker_a ON worker_a.uuid = profile_a.worker_uuid
            JOIN public.labor_agency_worker_profile profile_b
                ON profile_b.uuid = rule.worker_profile_uuid_b
                AND profile_b.agency_owner_uuid = rule.agency_owner_uuid
            JOIN public.worker worker_b ON worker_b.uuid = profile_b.worker_uuid
            WHERE rule.agency_owner_uuid = ?
                AND rule.status = 'ACTIVE'
                AND rule.deleted_at IS NULL
                AND profile_a.status = 'ACTIVE'
                AND profile_a.deleted_at IS NULL
                AND profile_b.status = 'ACTIVE'
                AND profile_b.deleted_at IS NULL
            %s
            ORDER BY worker_name_a, worker_name_b, rule.created_at
            """.formatted(workerFilter),
            (resultSet, rowNumber) -> new WorkerSeparationRuleResponse(
                resultSet.getObject("uuid", UUID.class),
                resultSet.getObject("worker_profile_uuid_a", UUID.class),
                resultSet.getString("worker_name_a"),
                resultSet.getObject("worker_profile_uuid_b", UUID.class),
                resultSet.getString("worker_name_b"),
                resultSet.getString("reason")
            ),
            parameters.toArray()
        );
    }

    @Override
    public void replaceWorkerSeparationRules(
        UUID agencyOwnerUuid,
        UUID accountUuid,
        UUID workerProfileUuid,
        List<WorkerSeparationRuleRequest> separationRules
    ) {
        jdbcTemplate.queryForList(
            "SELECT pg_advisory_xact_lock(hashtextextended(?, 0))",
            "laborflow:worker-separation:" + agencyOwnerUuid
        );

        jdbcTemplate.update(
            """
            UPDATE public.labor_agency_worker_separation_rule
            SET status = 'ARCHIVED',
                deleted_at = COALESCE(deleted_at, now()),
                updated_at = now()
            WHERE agency_owner_uuid = ?
                AND (worker_profile_uuid_a = ? OR worker_profile_uuid_b = ?)
                AND status = 'ACTIVE'
                AND deleted_at IS NULL
            """,
            agencyOwnerUuid,
            workerProfileUuid,
            workerProfileUuid
        );

        for (WorkerSeparationRuleRequest rule : separationRules) {
            UUID otherWorkerProfileUuid = rule.otherWorkerProfileUuid();
            UUID firstWorkerProfileUuid = canonicalFirst(workerProfileUuid, otherWorkerProfileUuid);
            UUID secondWorkerProfileUuid = firstWorkerProfileUuid.equals(workerProfileUuid)
                ? otherWorkerProfileUuid
                : workerProfileUuid;
            jdbcTemplate.update(
                """
                INSERT INTO public.labor_agency_worker_separation_rule (
                    agency_owner_uuid,
                    worker_profile_uuid_a,
                    worker_profile_uuid_b,
                    reason,
                    created_by_account_uuid
                )
                VALUES (?, ?, ?, ?, ?)
                """,
                agencyOwnerUuid,
                firstWorkerProfileUuid,
                secondWorkerProfileUuid,
                rule.reason(),
                accountUuid
            );
        }
    }

    @Override
    public void recordWorkerSeparationOverrides(
        UUID agencyOwnerUuid,
        UUID accountUuid,
        UUID scheduleDayUuid,
        List<UUID> separationRuleUuids
    ) {
        for (UUID separationRuleUuid : separationRuleUuids) {
            jdbcTemplate.update(
                """
                INSERT INTO public.worker_separation_override_audit (
                    agency_owner_uuid,
                    separation_rule_uuid,
                    schedule_day_uuid,
                    acknowledged_by_account_uuid
                )
                SELECT ?, rule.uuid, ?, ?
                FROM public.labor_agency_worker_separation_rule rule
                WHERE rule.uuid = ?
                    AND rule.agency_owner_uuid = ?
                    AND rule.status = 'ACTIVE'
                    AND rule.deleted_at IS NULL
                """,
                agencyOwnerUuid,
                scheduleDayUuid,
                accountUuid,
                separationRuleUuid,
                agencyOwnerUuid
            );
        }
    }

    @Override
    public void upsertWorkerPaymentProfile(
        UUID workerProfileUuid,
        String bankCode,
        String bankName,
        String accountNumber,
        String accountNumberHashSource,
        String accountHolderName
    ) {
        jdbcTemplate.update(
            """
            INSERT INTO public.labor_agency_worker_payment_profile (
                worker_profile_uuid,
                bank_code,
                bank_name,
                account_number_encrypted,
                account_number_hash,
                account_holder_name,
                verification_status
            )
            VALUES (
                ?,
                ?,
                ?,
                ?,
                CASE
                    WHEN CAST(? AS text) IS NULL THEN NULL
                    ELSE encode(digest(CAST(? AS text), 'sha256'), 'hex')
                END,
                ?,
                'NOT_VERIFIED'
            )
            ON CONFLICT (worker_profile_uuid) DO UPDATE
            SET bank_code = EXCLUDED.bank_code,
                bank_name = EXCLUDED.bank_name,
                account_number_encrypted = EXCLUDED.account_number_encrypted,
                account_number_hash = EXCLUDED.account_number_hash,
                account_holder_name = EXCLUDED.account_holder_name,
                deleted_at = NULL,
                verification_status = CASE
                    WHEN public.labor_agency_worker_payment_profile.account_number_hash IS DISTINCT FROM EXCLUDED.account_number_hash
                        OR public.labor_agency_worker_payment_profile.bank_code IS DISTINCT FROM EXCLUDED.bank_code
                    THEN 'NOT_VERIFIED'
                    ELSE public.labor_agency_worker_payment_profile.verification_status
                END
            """,
            workerProfileUuid,
            bankCode,
            bankName,
            accountNumber,
            accountNumberHashSource,
            accountNumberHashSource,
            accountHolderName
        );
    }

    @Override
    public void replaceWorkerWorkTypes(
        UUID workerProfileUuid,
        List<String> workTypeCodes,
        Map<String, Integer> workTypeRatings
    ) {
        jdbcTemplate.update(
            """
            UPDATE public.labor_agency_worker_work_skill
            SET deleted_at = COALESCE(deleted_at, now()),
                updated_at = now()
            WHERE worker_profile_uuid = ?
                AND deleted_at IS NULL
            """,
            workerProfileUuid
        );

        for (String workTypeCode : workTypeCodes) {
            int rating = Optional.ofNullable(workTypeRatings.get(workTypeCode)).orElse(0);
            jdbcTemplate.update(
                """
                INSERT INTO public.labor_agency_worker_work_skill (
                    worker_profile_uuid,
                    work_type_uuid,
                    rating
                )
                SELECT ?, uuid, ?
                FROM public.work_type
                WHERE code = ? AND status = 'ACTIVE'
                ON CONFLICT (worker_profile_uuid, work_type_uuid) DO UPDATE
                SET rating = EXCLUDED.rating,
                    deleted_at = NULL,
                    updated_at = now()
                """,
                workerProfileUuid,
                rating,
                workTypeCode
            );
        }
    }

    @Override
    public void linkGuestAssignmentToWorkerProfile(UUID assignmentUuid, UUID workerProfileUuid) {
        Integer duplicateCount = jdbcTemplate.queryForObject(
            """
            SELECT count(*)
            FROM public.work_schedule_assignment guest
            JOIN public.work_schedule_assignment registered
                ON registered.schedule_day_uuid = guest.schedule_day_uuid
                AND registered.worker_profile_uuid = ?
                AND registered.participant_type = 'REGISTERED'
                AND registered.deleted_at IS NULL
            WHERE guest.uuid = ?
                AND guest.participant_type = 'GUEST'
                AND guest.deleted_at IS NULL
            """,
            Integer.class,
            workerProfileUuid,
            assignmentUuid
        );
        if (duplicateCount != null && duplicateCount > 0) {
            throw new IllegalArgumentException("Worker is already assigned to this schedule day.");
        }

        jdbcTemplate.update(
            """
            UPDATE public.work_schedule_assignment
            SET worker_profile_uuid = ?,
                participant_type = 'REGISTERED',
                participant_display_name = NULL,
                updated_at = now()
            WHERE uuid = ?
                AND participant_type = 'GUEST'
                AND deleted_at IS NULL
            """,
            workerProfileUuid,
            assignmentUuid
        );

        jdbcTemplate.update(
            """
            UPDATE public.worker_attendance_record
            SET worker_profile_uuid = ?,
                updated_at = now()
            WHERE assignment_uuid = ?
                AND deleted_at IS NULL
            """,
            workerProfileUuid,
            assignmentUuid
        );
    }

    @Override
    public UUID createWorkerTeam(UUID agencyOwnerUuid, String teamName, List<UUID> workerProfileUuids) {
        UUID leaderWorkerProfileUuid = workerProfileUuids.get(0);
        UUID teamUuid = jdbcTemplate.queryForObject(
            """
            INSERT INTO public.labor_agency_worker_team (
                agency_owner_uuid,
                name,
                leader_worker_profile_uuid,
                sort_order
            )
            VALUES (
                ?,
                ?,
                ?,
                COALESCE((
                    SELECT MAX(sort_order) + 10
                    FROM public.labor_agency_worker_team
                    WHERE agency_owner_uuid = ?
                        AND deleted_at IS NULL
                ), 10)
            )
            RETURNING uuid
            """,
            UUID.class,
            agencyOwnerUuid,
            teamName,
            leaderWorkerProfileUuid,
            agencyOwnerUuid
        );

        String placeholders = placeholders(workerProfileUuids.size());
        List<Object> deactivateParams = new ArrayList<>();
        deactivateParams.add(agencyOwnerUuid);
        deactivateParams.addAll(workerProfileUuids);
        jdbcTemplate.update(
            """
            UPDATE public.labor_agency_worker_team_member tm
            SET status = 'INACTIVE',
                active_to = CURRENT_DATE,
                deleted_at = COALESCE(tm.deleted_at, now()),
                updated_at = now()
            FROM public.labor_agency_worker_profile p
            WHERE tm.worker_profile_uuid = p.uuid
                AND p.agency_owner_uuid = ?
                AND p.deleted_at IS NULL
                AND tm.worker_profile_uuid IN (%s)
                AND tm.status = 'ACTIVE'
                AND tm.deleted_at IS NULL
            """.formatted(placeholders),
            deactivateParams.toArray()
        );

        upsertTeamMembers(teamUuid, workerProfileUuids);

        return teamUuid;
    }

    @Override
    public void updateWorkerTeam(UUID agencyOwnerUuid, UUID teamUuid, String teamName, List<UUID> workerProfileUuids) {
        UUID leaderWorkerProfileUuid = workerProfileUuids.get(0);
        jdbcTemplate.update(
            """
            UPDATE public.labor_agency_worker_team
            SET name = ?,
                leader_worker_profile_uuid = ?,
                updated_at = now()
            WHERE uuid = ?
                AND agency_owner_uuid = ?
                AND status = 'ACTIVE'
                AND deleted_at IS NULL
            """,
            teamName,
            leaderWorkerProfileUuid,
            teamUuid,
            agencyOwnerUuid
        );

        jdbcTemplate.update(
            """
            UPDATE public.labor_agency_worker_team_member
            SET status = 'INACTIVE',
                active_to = CURRENT_DATE,
                deleted_at = COALESCE(deleted_at, now()),
                updated_at = now()
            WHERE team_uuid = ?
                AND status = 'ACTIVE'
                AND deleted_at IS NULL
            """,
            teamUuid
        );

        String placeholders = placeholders(workerProfileUuids.size());
        List<Object> deactivateParams = new ArrayList<>();
        deactivateParams.add(agencyOwnerUuid);
        deactivateParams.add(teamUuid);
        deactivateParams.addAll(workerProfileUuids);
        jdbcTemplate.update(
            """
            UPDATE public.labor_agency_worker_team_member tm
            SET status = 'INACTIVE',
                active_to = CURRENT_DATE,
                deleted_at = COALESCE(tm.deleted_at, now()),
                updated_at = now()
            FROM public.labor_agency_worker_profile p
            WHERE tm.worker_profile_uuid = p.uuid
                AND p.agency_owner_uuid = ?
                AND p.deleted_at IS NULL
                AND tm.team_uuid <> ?
                AND tm.worker_profile_uuid IN (%s)
                AND tm.status = 'ACTIVE'
                AND tm.deleted_at IS NULL
            """.formatted(placeholders),
            deactivateParams.toArray()
        );

        upsertTeamMembers(teamUuid, workerProfileUuids);
    }

    @Override
    public void softDeleteWorkerProfile(String loginId, UUID workerProfileUuid) {
        jdbcTemplate.update(
            """
            UPDATE public.labor_agency_worker_team_member tm
            SET status = 'INACTIVE',
                active_to = CURRENT_DATE,
                deleted_at = COALESCE(tm.deleted_at, now()),
                updated_at = now()
            FROM public.labor_agency_worker_profile p
            JOIN public.app_account a ON a.labor_agency_owner_uuid = p.agency_owner_uuid
            WHERE tm.worker_profile_uuid = p.uuid
                AND a.login_id = ?
                AND p.uuid = ?
                AND tm.status = 'ACTIVE'
                AND tm.deleted_at IS NULL
            """,
            loginId,
            workerProfileUuid
        );

        jdbcTemplate.update(
            """
            UPDATE public.labor_agency_worker_payment_profile
            SET deleted_at = COALESCE(deleted_at, now()),
                updated_at = now()
            WHERE worker_profile_uuid = ?
                AND deleted_at IS NULL
            """,
            workerProfileUuid
        );

        jdbcTemplate.update(
            """
            UPDATE public.labor_agency_worker_profile p
            SET status = 'ARCHIVED',
                deleted_at = COALESCE(p.deleted_at, now()),
                updated_at = now()
            FROM public.app_account a
            WHERE a.labor_agency_owner_uuid = p.agency_owner_uuid
                AND a.login_id = ?
                AND p.uuid = ?
                AND p.deleted_at IS NULL
            """,
            loginId,
            workerProfileUuid
        );
    }

    @Override
    public void softDeleteWorkerTeam(String loginId, UUID teamUuid) {
        jdbcTemplate.update(
            """
            UPDATE public.labor_agency_worker_team_member tm
            SET status = 'INACTIVE',
                active_to = CURRENT_DATE,
                deleted_at = COALESCE(tm.deleted_at, now()),
                updated_at = now()
            FROM public.labor_agency_worker_team t
            JOIN public.app_account a ON a.labor_agency_owner_uuid = t.agency_owner_uuid
            WHERE tm.team_uuid = t.uuid
                AND a.login_id = ?
                AND t.uuid = ?
                AND tm.status = 'ACTIVE'
                AND tm.deleted_at IS NULL
            """,
            loginId,
            teamUuid
        );

        jdbcTemplate.update(
            """
            UPDATE public.labor_agency_worker_team t
            SET status = 'ARCHIVED',
                deleted_at = COALESCE(t.deleted_at, now()),
                updated_at = now()
            FROM public.app_account a
            WHERE a.labor_agency_owner_uuid = t.agency_owner_uuid
                AND a.login_id = ?
                AND t.uuid = ?
                AND t.deleted_at IS NULL
            """,
            loginId,
            teamUuid
        );
    }

    private void upsertTeamMembers(UUID teamUuid, List<UUID> workerProfileUuids) {
        for (int index = 0; index < workerProfileUuids.size(); index++) {
            jdbcTemplate.update(
                """
                INSERT INTO public.labor_agency_worker_team_member (
                    team_uuid,
                    worker_profile_uuid,
                    role,
                    display_order,
                    active_from,
                    active_to,
                    status
                )
                VALUES (?, ?, ?, ?, CURRENT_DATE, NULL, 'ACTIVE')
                ON CONFLICT (team_uuid, worker_profile_uuid) DO UPDATE
                SET role = EXCLUDED.role,
                    display_order = EXCLUDED.display_order,
                    active_from = CURRENT_DATE,
                    active_to = NULL,
                    status = 'ACTIVE',
                    deleted_at = NULL,
                    updated_at = now()
                """,
                teamUuid,
                workerProfileUuids.get(index),
                index == 0 ? "LEADER" : "MEMBER",
                index
            );
        }
    }

    private Map<UUID, List<String>> findWorkTypeCodesByProfileUuid(List<UUID> profileUuids) {
        Map<UUID, List<String>> workTypeCodesByProfileUuid = new LinkedHashMap<>();

        for (UUID profileUuid : profileUuids) {
            workTypeCodesByProfileUuid.put(profileUuid, new ArrayList<>());
        }

        String placeholders = placeholders(profileUuids.size());
        jdbcTemplate.query(
            """
            SELECT s.worker_profile_uuid, wt.code
            FROM public.labor_agency_worker_work_skill s
            JOIN public.work_type wt ON wt.uuid = s.work_type_uuid
            WHERE s.worker_profile_uuid IN (%s)
                AND s.deleted_at IS NULL
                AND wt.status = 'ACTIVE'
            ORDER BY wt.name
            """.formatted(placeholders),
            resultSet -> {
                UUID profileUuid = resultSet.getObject("worker_profile_uuid", UUID.class);
                workTypeCodesByProfileUuid.computeIfAbsent(profileUuid, ignored -> new ArrayList<>())
                    .add(resultSet.getString("code"));
            },
            profileUuids.toArray()
        );

        return workTypeCodesByProfileUuid;
    }

    private Map<UUID, Map<String, Integer>> findWorkTypeRatingsByProfileUuid(List<UUID> profileUuids) {
        Map<UUID, Map<String, Integer>> workTypeRatingsByProfileUuid = new LinkedHashMap<>();

        for (UUID profileUuid : profileUuids) {
            workTypeRatingsByProfileUuid.put(profileUuid, new LinkedHashMap<>());
        }

        String placeholders = placeholders(profileUuids.size());
        jdbcTemplate.query(
            """
            SELECT s.worker_profile_uuid, wt.code, s.rating
            FROM public.labor_agency_worker_work_skill s
            JOIN public.work_type wt ON wt.uuid = s.work_type_uuid
            WHERE s.worker_profile_uuid IN (%s)
                AND s.deleted_at IS NULL
                AND wt.status = 'ACTIVE'
            ORDER BY wt.name
            """.formatted(placeholders),
            resultSet -> {
                UUID profileUuid = resultSet.getObject("worker_profile_uuid", UUID.class);
                workTypeRatingsByProfileUuid.computeIfAbsent(profileUuid, ignored -> new LinkedHashMap<>())
                    .put(resultSet.getString("code"), resultSet.getInt("rating"));
            },
            profileUuids.toArray()
        );

        return workTypeRatingsByProfileUuid;
    }

    private WorkerProjection mapWorkerProjection(ResultSet resultSet) throws SQLException {
        return new WorkerProjection(
            resultSet.getObject("profile_uuid", UUID.class),
            resultSet.getString("display_name"),
            resultSet.getString("local_nickname"),
            resultSet.getString("local_phone_encrypted"),
            resultSet.getObject("age", Integer.class),
            resultSet.getString("gender"),
            resultSet.getString("private_memo"),
            resultSet.getString("pickup_location"),
            resultSet.getBoolean("is_active"),
            resultSet.getInt("available_days_mask"),
            resultSet.getString("availability_memo"),
            resultSet.getString("bank_code"),
            resultSet.getString("bank_name"),
            resultSet.getString("account_number_encrypted"),
            resultSet.getString("account_holder_name"),
            resultSet.getString("payment_verification_status"),
            resultSet.getObject("team_uuid", UUID.class),
            resultSet.getString("team_name"),
            resultSet.getString("team_role"),
            Optional.ofNullable(resultSet.getObject("team_display_order", Integer.class)).orElse(0),
            resultSet.getObject("last_worked_date", LocalDate.class),
            resultSet.getInt("total_work_days"),
            resultSet.getBoolean("no_show_risk"),
            resultSet.getBoolean("no_show_risk_manual"),
            resultSet.getInt("no_show_count")
        );
    }

    private String placeholders(int size) {
        return String.join(",", java.util.Collections.nCopies(size, "?"));
    }

    private UUID canonicalFirst(UUID leftWorkerProfileUuid, UUID rightWorkerProfileUuid) {
        return leftWorkerProfileUuid.toString().compareTo(rightWorkerProfileUuid.toString()) < 0
            ? leftWorkerProfileUuid
            : rightWorkerProfileUuid;
    }

    private record WorkerProjection(
        UUID profileUuid,
        String name,
        String nickname,
        String phone,
        Integer age,
        String gender,
        String memo,
        String pickupLocation,
        boolean isActive,
        int availableDaysMask,
        String availabilityMemo,
        String bankCode,
        String bankName,
        String accountNumber,
        String accountHolderName,
        String paymentVerificationStatus,
        UUID teamUuid,
        String teamName,
        String teamRole,
        int teamDisplayOrder,
        LocalDate lastWorkedDate,
        int totalWorkDays,
        boolean noShowRisk,
        boolean noShowRiskManual,
        int noShowCount
    ) {
    }
}
