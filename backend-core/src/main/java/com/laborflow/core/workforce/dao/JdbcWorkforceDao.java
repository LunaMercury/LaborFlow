package com.laborflow.core.workforce.dao;

import com.laborflow.core.workforce.dto.WorkTypeResponse;
import com.laborflow.core.workforce.dto.WorkerResponse;
import java.sql.ResultSet;
import java.sql.SQLException;
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
                COALESCE(p.pickup_location, '') AS pickup_location
            FROM public.labor_agency_worker_profile p
            JOIN public.app_account a ON a.labor_agency_owner_uuid = p.agency_owner_uuid
            LEFT JOIN public.worker w ON w.uuid = p.worker_uuid
            WHERE a.login_id = ?
            ORDER BY COALESCE(NULLIF(p.local_name, ''), NULLIF(p.local_nickname, ''), w.canonical_name, ''), p.created_at
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

        return workers.stream()
            .map(worker -> new WorkerResponse(
                worker.profileUuid(),
                worker.name(),
                worker.nickname(),
                worker.phone(),
                worker.pickupLocation(),
                workTypeCodesByProfileUuid.getOrDefault(worker.profileUuid(), List.of())
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
            WHERE a.login_id = ? AND p.uuid = ?
            """,
            Integer.class,
            loginId,
            workerProfileUuid
        );

        return count != null && count > 0;
    }

    @Override
    public boolean agencyWorkerProfileExists(UUID agencyOwnerUuid, UUID workerUuid) {
        Integer count = jdbcTemplate.queryForObject(
            """
            SELECT count(*)
            FROM public.labor_agency_worker_profile
            WHERE agency_owner_uuid = ? AND worker_uuid = ?
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
    public void insertWorkerProfile(
        UUID agencyOwnerUuid,
        UUID workerUuid,
        String localName,
        String localNickname,
        String phone,
        String phoneHashSource,
        String pickupLocation,
        String privateMemo
    ) {
        jdbcTemplate.update(
            """
            INSERT INTO public.labor_agency_worker_profile (
                agency_owner_uuid,
                worker_uuid,
                local_name,
                local_nickname,
                local_phone_encrypted,
                local_phone_hash,
                pickup_location,
                private_memo
            )
            VALUES (?, ?, ?, ?, ?, encode(digest(?, 'sha256'), 'hex'), ?, ?)
            """,
            agencyOwnerUuid,
            workerUuid,
            localName,
            localNickname,
            phone,
            phoneHashSource,
            pickupLocation,
            privateMemo
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
            """,
            pickupLocation,
            workerProfileUuid
        );
    }

    @Override
    public void replaceWorkerWorkTypes(UUID workerProfileUuid, List<String> workTypeCodes) {
        jdbcTemplate.update(
            "DELETE FROM public.labor_agency_worker_work_skill WHERE worker_profile_uuid = ?",
            workerProfileUuid
        );

        for (String workTypeCode : workTypeCodes) {
            jdbcTemplate.update(
                """
                INSERT INTO public.labor_agency_worker_work_skill (
                    worker_profile_uuid,
                    work_type_uuid,
                    rating
                )
                SELECT ?, uuid, 0
                FROM public.work_type
                WHERE code = ? AND status = 'ACTIVE'
                ON CONFLICT (worker_profile_uuid, work_type_uuid) DO NOTHING
                """,
                workerProfileUuid,
                workTypeCode
            );
        }
    }

    private Map<UUID, List<String>> findWorkTypeCodesByProfileUuid(List<UUID> profileUuids) {
        Map<UUID, List<String>> workTypeCodesByProfileUuid = new LinkedHashMap<>();

        for (UUID profileUuid : profileUuids) {
            workTypeCodesByProfileUuid.put(profileUuid, new ArrayList<>());
        }

        String placeholders = String.join(",", profileUuids.stream().map(profileUuid -> "?").toList());
        jdbcTemplate.query(
            """
            SELECT s.worker_profile_uuid, wt.code
            FROM public.labor_agency_worker_work_skill s
            JOIN public.work_type wt ON wt.uuid = s.work_type_uuid
            WHERE s.worker_profile_uuid IN (%s)
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

    private WorkerProjection mapWorkerProjection(ResultSet resultSet) throws SQLException {
        return new WorkerProjection(
            resultSet.getObject("profile_uuid", UUID.class),
            resultSet.getString("display_name"),
            resultSet.getString("local_nickname"),
            resultSet.getString("local_phone_encrypted"),
            resultSet.getString("pickup_location")
        );
    }

    private record WorkerProjection(
        UUID profileUuid,
        String name,
        String nickname,
        String phone,
        String pickupLocation
    ) {
    }
}
