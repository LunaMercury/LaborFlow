package com.laborflow.core.schedule.dao;

import com.laborflow.core.schedule.dto.ScheduleAssignmentRequest;
import com.laborflow.core.schedule.dto.ScheduleAssignmentResponse;
import com.laborflow.core.schedule.dto.FarmOwnerOptionResponse;
import com.laborflow.core.schedule.dto.ScheduleTaskResponse;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcScheduleDao implements ScheduleDao {
    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("HH:mm");

    private final JdbcTemplate jdbcTemplate;

    public JdbcScheduleDao(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
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
        List<UUID> accountUuids = jdbcTemplate.query(
            """
            SELECT uuid
            FROM public.app_account
            WHERE login_id = ? AND status = 'ACTIVE'
            """,
            (resultSet, rowNumber) -> resultSet.getObject("uuid", UUID.class),
            loginId
        );
        return accountUuids.stream().findFirst();
    }

    @Override
    public boolean scheduleDayBelongsToAgencyOwner(UUID agencyOwnerUuid, UUID scheduleDayUuid) {
        Integer count = jdbcTemplate.queryForObject(
            """
            SELECT count(*)
            FROM public.work_schedule_day d
            JOIN public.farm_work_site s ON s.uuid = d.work_site_uuid
            WHERE s.agency_owner_uuid = ?
                AND d.uuid = ?
                AND s.deleted_at IS NULL
                AND d.deleted_at IS NULL
            """,
            Integer.class,
            agencyOwnerUuid,
            scheduleDayUuid
        );

        return count != null && count > 0;
    }

    @Override
    public boolean workerProfileBelongsToAgencyOwner(UUID agencyOwnerUuid, UUID workerProfileUuid) {
        Integer count = jdbcTemplate.queryForObject(
            """
            SELECT count(*)
            FROM public.labor_agency_worker_profile
            WHERE agency_owner_uuid = ?
                AND uuid = ?
                AND status = 'ACTIVE'
                AND deleted_at IS NULL
            """,
            Integer.class,
            agencyOwnerUuid,
            workerProfileUuid
        );

        return count != null && count > 0;
    }

    @Override
    public boolean farmOwnerBelongsToAgencyOwner(UUID agencyOwnerUuid, UUID farmOwnerUuid) {
        Integer count = jdbcTemplate.queryForObject(
            """
            SELECT count(*)
            FROM public.labor_agency_farm_owner_profile
            WHERE agency_owner_uuid = ?
                AND farm_owner_uuid = ?
                AND status = 'ACTIVE'
                AND deleted_at IS NULL
            """,
            Integer.class,
            agencyOwnerUuid,
            farmOwnerUuid
        );

        return count != null && count > 0;
    }

    @Override
    public List<FarmOwnerOptionResponse> findFarmOwners(UUID agencyOwnerUuid, String query) {
        String normalizedQuery = query == null ? "" : query.trim();
        String likeQuery = "%" + normalizedQuery + "%";

        return jdbcTemplate.query(
            """
            WITH matched_owner AS (
                SELECT
                    fp.agency_owner_uuid,
                    fo.uuid,
                    COALESCE(fp.local_name, fp.local_nickname, fp.local_business_name, fo.canonical_name, '') AS display_name,
                    COALESCE(fp.local_name, '') AS name,
                    COALESCE(fp.local_nickname, '') AS nickname,
                    COALESCE(fp.local_business_name, fo.canonical_business_name, '') AS business_name,
                    COALESCE(fp.local_phone_encrypted, '') AS phone
                FROM public.labor_agency_farm_owner_profile fp
                JOIN public.farm_owner fo ON fo.uuid = fp.farm_owner_uuid
                WHERE fp.agency_owner_uuid = ?
                    AND fp.status = 'ACTIVE'
                    AND fp.deleted_at IS NULL
                    AND fo.status = 'ACTIVE'
                    AND fo.deleted_at IS NULL
                    AND (
                        ? = ''
                        OR COALESCE(fp.local_name, '') ILIKE ?
                        OR COALESCE(fp.local_nickname, '') ILIKE ?
                        OR COALESCE(fp.local_business_name, '') ILIKE ?
                        OR COALESCE(fo.canonical_name, '') ILIKE ?
                        OR COALESCE(fo.canonical_business_name, '') ILIKE ?
                    )
                ORDER BY display_name, business_name
                LIMIT 20
            )
            SELECT
                matched_owner.uuid,
                matched_owner.display_name,
                matched_owner.name,
                matched_owner.nickname,
                matched_owner.business_name,
                matched_owner.phone,
                COALESCE(recent.work_description, '') AS recent_title,
                COALESCE(recent.site_name, '') AS recent_site_name,
                COALESCE(recent.farm_address, '') AS recent_address,
                recent.daily_start_time AS recent_start_time,
                recent.daily_end_time AS recent_end_time
            FROM matched_owner
            LEFT JOIN LATERAL (
                SELECT
                    site.work_description,
                    site.site_name,
                    site.farm_address,
                    COALESCE(day.daily_start_time, site.daily_start_time) AS daily_start_time,
                    COALESCE(day.daily_end_time, site.daily_end_time) AS daily_end_time
                FROM public.farm_work_site site
                LEFT JOIN LATERAL (
                    SELECT schedule_day.daily_start_time, schedule_day.daily_end_time
                    FROM public.work_schedule_day schedule_day
                    WHERE schedule_day.work_site_uuid = site.uuid
                        AND schedule_day.status = 'ACTIVE'
                        AND schedule_day.deleted_at IS NULL
                    ORDER BY schedule_day.work_date DESC, schedule_day.updated_at DESC
                    LIMIT 1
                ) day ON true
                WHERE site.agency_owner_uuid = matched_owner.agency_owner_uuid
                    AND site.owner_uuid = matched_owner.uuid
                    AND site.status = 'ACTIVE'
                    AND site.deleted_at IS NULL
                ORDER BY site.updated_at DESC, site.created_at DESC
                LIMIT 1
            ) recent ON true
            ORDER BY matched_owner.display_name, matched_owner.business_name
            """,
            (resultSet, rowNumber) -> new FarmOwnerOptionResponse(
                resultSet.getObject("uuid", UUID.class),
                resultSet.getString("display_name"),
                resultSet.getString("name"),
                resultSet.getString("nickname"),
                resultSet.getString("business_name"),
                resultSet.getString("phone"),
                resultSet.getObject("recent_title", String.class),
                resultSet.getObject("recent_site_name", String.class),
                resultSet.getObject("recent_address", String.class),
                resultSet.getObject("recent_start_time", LocalTime.class),
                resultSet.getObject("recent_end_time", LocalTime.class)
            ),
            agencyOwnerUuid,
            normalizedQuery,
            likeQuery,
            likeQuery,
            likeQuery,
            likeQuery,
            likeQuery
        );
    }

    @Override
    public List<ScheduleTaskResponse> findTasks(UUID agencyOwnerUuid, LocalDate workDate) {
        List<ScheduleTaskProjection> tasks = jdbcTemplate.query(
            """
            SELECT
                d.uuid,
                s.uuid AS work_site_uuid,
                s.owner_uuid,
                s.work_description,
                COALESCE(fp.local_name, fp.local_nickname, fp.local_business_name, fo.canonical_name, '') AS owner_name,
                COALESCE(s.site_name, '') AS site_name,
                s.farm_address,
                d.male_required_count,
                d.female_required_count,
                COALESCE(d.memo, '') AS memo,
                d.daily_start_time,
                d.daily_end_time
            FROM public.work_schedule_day d
            JOIN public.farm_work_site s ON s.uuid = d.work_site_uuid
            JOIN public.farm_owner fo ON fo.uuid = s.owner_uuid
            LEFT JOIN public.labor_agency_farm_owner_profile fp
                ON fp.agency_owner_uuid = s.agency_owner_uuid
                AND fp.farm_owner_uuid = s.owner_uuid
                AND fp.status = 'ACTIVE'
                AND fp.deleted_at IS NULL
            WHERE s.agency_owner_uuid = ?
                AND s.status = 'ACTIVE'
                AND s.deleted_at IS NULL
                AND d.status = 'ACTIVE'
                AND d.deleted_at IS NULL
                AND fo.deleted_at IS NULL
                AND d.work_date = ?
            ORDER BY d.daily_start_time NULLS LAST, s.work_description, d.created_at
            """,
            (resultSet, rowNumber) -> mapTaskProjection(resultSet),
            agencyOwnerUuid,
            workDate
        );

        if (tasks.isEmpty()) {
            return List.of();
        }

        List<UUID> scheduleDayUuids = tasks.stream().map(ScheduleTaskProjection::id).toList();
        List<UUID> siteUuids = tasks.stream().map(ScheduleTaskProjection::workSiteId).toList();
        Map<UUID, List<String>> workTypeCodesBySiteUuid = findWorkTypeCodesBySiteUuid(siteUuids);
        Map<UUID, List<ScheduleAssignmentResponse>> assignmentsByScheduleDayUuid =
            findAssignmentsByScheduleDayUuid(scheduleDayUuids);

        return tasks.stream()
            .map(task -> new ScheduleTaskResponse(
                task.id(),
                task.workSiteId(),
                task.ownerUuid(),
                task.title(),
                task.ownerName(),
                task.siteName(),
                task.address(),
                formatTimeRange(task.startTime(), task.endTime()),
                formatOptionalTime(task.startTime()),
                formatOptionalTime(task.endTime()),
                task.requiredMen(),
                task.requiredWomen(),
                workTypeCodesBySiteUuid.getOrDefault(task.workSiteId(), List.of()),
                task.memo(),
                assignmentsByScheduleDayUuid.getOrDefault(task.id(), List.of())
            ))
            .toList();
    }

    @Override
    public Optional<ScheduleTaskResponse> findTask(UUID agencyOwnerUuid, UUID scheduleDayUuid, LocalDate workDate) {
        return findTasks(agencyOwnerUuid, workDate).stream()
            .filter(task -> task.id().equals(scheduleDayUuid))
            .findFirst();
    }

    @Override
    public void updateTask(
        UUID agencyOwnerUuid,
        UUID scheduleDayUuid,
        UUID ownerUuid,
        String title,
        String address,
        LocalTime startTime,
        LocalTime endTime,
        int requiredMen,
        int requiredWomen,
        String memo
    ) {
        jdbcTemplate.update(
            """
            UPDATE public.farm_work_site
            SET work_description = ?,
                farm_address = ?,
                owner_uuid = COALESCE(?, owner_uuid)
            FROM public.work_schedule_day d
            WHERE d.work_site_uuid = public.farm_work_site.uuid
                AND public.farm_work_site.agency_owner_uuid = ?
                AND public.farm_work_site.deleted_at IS NULL
                AND d.uuid = ?
                AND d.deleted_at IS NULL
            """,
            title,
            address,
            ownerUuid,
            agencyOwnerUuid,
            scheduleDayUuid
        );

        jdbcTemplate.update(
            """
            UPDATE public.work_schedule_day d
            SET
                daily_start_time = ?,
                daily_end_time = ?,
                male_required_count = ?,
                female_required_count = ?,
                memo = ?
            FROM public.farm_work_site s
            WHERE s.uuid = d.work_site_uuid
                AND s.agency_owner_uuid = ?
                AND s.deleted_at IS NULL
                AND d.uuid = ?
                AND d.deleted_at IS NULL
            """,
            startTime,
            endTime,
            requiredMen,
            requiredWomen,
            memo,
            agencyOwnerUuid,
            scheduleDayUuid
        );
    }

    @Override
    public void replaceTaskWorkTypes(UUID agencyOwnerUuid, UUID scheduleDayUuid, List<String> workTypeCodes) {
        jdbcTemplate.update(
            """
            UPDATE public.farm_work_site_work_type swt
            SET deleted_at = COALESCE(swt.deleted_at, now())
            FROM public.work_schedule_day d, public.farm_work_site s
            WHERE swt.work_site_uuid = d.work_site_uuid
                AND s.uuid = d.work_site_uuid
                AND s.agency_owner_uuid = ?
                AND s.deleted_at IS NULL
                AND d.uuid = ?
                AND d.deleted_at IS NULL
                AND swt.deleted_at IS NULL
            """,
            agencyOwnerUuid,
            scheduleDayUuid
        );

        for (String workTypeCode : workTypeCodes) {
            jdbcTemplate.update(
                """
                INSERT INTO public.farm_work_site_work_type (
                    work_site_uuid,
                    work_type_uuid
                )
                SELECT d.work_site_uuid, wt.uuid
                FROM public.work_schedule_day d
                JOIN public.farm_work_site s ON s.uuid = d.work_site_uuid
                JOIN public.work_type wt ON wt.code = ? AND wt.status = 'ACTIVE'
                WHERE s.agency_owner_uuid = ?
                    AND s.deleted_at IS NULL
                    AND d.uuid = ?
                    AND d.deleted_at IS NULL
                ON CONFLICT (work_site_uuid, work_type_uuid) DO UPDATE
                SET deleted_at = NULL
                """,
                workTypeCode,
                agencyOwnerUuid,
                scheduleDayUuid
            );
        }
    }

    @Override
    public void replaceAssignments(
        UUID agencyOwnerUuid,
        UUID scheduleDayUuid,
        List<ScheduleAssignmentRequest> assignments
    ) {
        List<UUID> workerProfileUuids = assignments.stream()
            .map(ScheduleAssignmentRequest::workerProfileUuid)
            .toList();

        if (workerProfileUuids.isEmpty()) {
            jdbcTemplate.update(
                """
                UPDATE public.work_schedule_assignment
                SET deleted_at = COALESCE(deleted_at, now()),
                    updated_at = now()
                WHERE agency_owner_uuid = ?
                    AND schedule_day_uuid = ?
                    AND participant_type = 'REGISTERED'
                    AND status <> 'REPLACED'
                    AND deleted_at IS NULL
                """,
                agencyOwnerUuid,
                scheduleDayUuid
            );
        } else {
            String placeholders = String.join(",", workerProfileUuids.stream().map(ignored -> "?").toList());
            List<Object> deleteParams = new ArrayList<>();
            deleteParams.add(agencyOwnerUuid);
            deleteParams.add(scheduleDayUuid);
            deleteParams.addAll(workerProfileUuids);
            jdbcTemplate.update(
                """
                UPDATE public.work_schedule_assignment
                SET deleted_at = COALESCE(deleted_at, now()),
                    updated_at = now()
                WHERE agency_owner_uuid = ?
                    AND schedule_day_uuid = ?
                    AND participant_type = 'REGISTERED'
                    AND status <> 'REPLACED'
                    AND worker_profile_uuid NOT IN (%s)
                    AND deleted_at IS NULL
                """.formatted(placeholders),
                deleteParams.toArray()
            );
        }

        for (ScheduleAssignmentRequest assignment : assignments) {
            int updatedRows = jdbcTemplate.update(
                """
                UPDATE public.work_schedule_assignment
                SET assignment_area = ?,
                    worker_count = ?,
                    status = 'PLANNED',
                    updated_at = now()
                WHERE agency_owner_uuid = ?
                    AND schedule_day_uuid = ?
                    AND participant_type = 'REGISTERED'
                    AND worker_profile_uuid = ?
                    AND deleted_at IS NULL
                """,
                normalizeAssignmentArea(assignment.area()),
                assignment.workerCount(),
                agencyOwnerUuid,
                scheduleDayUuid,
                assignment.workerProfileUuid()
            );

            if (updatedRows > 0) {
                continue;
            }

            jdbcTemplate.update(
                """
                INSERT INTO public.work_schedule_assignment (
                    agency_owner_uuid,
                    work_site_uuid,
                    worker_profile_uuid,
                    work_date,
                    assignment_area,
                    schedule_day_uuid,
                    worker_count,
                    participant_type,
                    status
                )
                SELECT
                    ?,
                    d.work_site_uuid,
                    ?,
                    d.work_date,
                    ?,
                    d.uuid,
                    ?,
                    'REGISTERED',
                    'PLANNED'
                FROM public.work_schedule_day d
                JOIN public.farm_work_site s ON s.uuid = d.work_site_uuid
                WHERE s.agency_owner_uuid = ?
                    AND s.deleted_at IS NULL
                    AND d.uuid = ?
                    AND d.deleted_at IS NULL
                """,
                agencyOwnerUuid,
                assignment.workerProfileUuid(),
                normalizeAssignmentArea(assignment.area()),
                assignment.workerCount(),
                agencyOwnerUuid,
                scheduleDayUuid
            );
        }
    }

    @Override
    public void addGuestParticipants(
        UUID agencyOwnerUuid,
        UUID scheduleDayUuid,
        UUID participantGroupUuid,
        String area,
        int participantCount,
        String displayName,
        String pickupLocation,
        String introductionType,
        UUID introducedByWorkerProfileUuid,
        UUID settlementRecipientWorkerProfileUuid,
        LocalTime plannedStartTime,
        LocalTime plannedEndTime
    ) {
        jdbcTemplate.update(
            """
            INSERT INTO public.work_schedule_assignment (
                agency_owner_uuid,
                work_site_uuid,
                worker_profile_uuid,
                work_date,
                assignment_area,
                schedule_day_uuid,
                worker_count,
                participant_group_uuid,
                participant_type,
                participant_display_name,
                participant_pickup_location,
                introduction_type,
                introduced_by_worker_profile_uuid,
                settlement_recipient_worker_profile_uuid,
                planned_start_time,
                planned_end_time,
                status
            )
            SELECT
                ?,
                d.work_site_uuid,
                NULL,
                d.work_date,
                ?,
                d.uuid,
                1,
                ?,
                'GUEST',
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                'PLANNED'
            FROM public.work_schedule_day d
            JOIN public.farm_work_site s ON s.uuid = d.work_site_uuid
            CROSS JOIN generate_series(1, ?)
            WHERE d.uuid = ?
                AND d.deleted_at IS NULL
                AND s.agency_owner_uuid = ?
                AND s.deleted_at IS NULL
            """,
            agencyOwnerUuid,
            normalizeAssignmentArea(area),
            participantGroupUuid,
            displayName,
            pickupLocation,
            introductionType,
            introducedByWorkerProfileUuid,
            settlementRecipientWorkerProfileUuid,
            plannedStartTime,
            plannedEndTime,
            participantCount,
            scheduleDayUuid,
            agencyOwnerUuid
        );
    }

    @Override
    public void updateGuestParticipants(
        UUID agencyOwnerUuid,
        UUID scheduleDayUuid,
        UUID participantGroupUuid,
        String area,
        int participantCount,
        String displayName,
        String pickupLocation,
        LocalTime plannedStartTime,
        LocalTime plannedEndTime
    ) {
        List<UUID> assignmentUuids = jdbcTemplate.queryForList(
            """
            SELECT a.uuid
            FROM public.work_schedule_assignment a
            WHERE a.agency_owner_uuid = ?
                AND a.schedule_day_uuid = ?
                AND a.participant_group_uuid = ?
                AND a.participant_type = 'GUEST'
                AND a.deleted_at IS NULL
            ORDER BY a.created_at, a.uuid
            """,
            UUID.class,
            agencyOwnerUuid,
            scheduleDayUuid,
            participantGroupUuid
        );
        if (assignmentUuids.isEmpty()) {
            throw new IllegalArgumentException("Guest participant group was not found.");
        }

        jdbcTemplate.update(
            """
            UPDATE public.work_schedule_assignment
            SET assignment_area = ?,
                participant_display_name = ?,
                participant_pickup_location = ?,
                planned_start_time = ?,
                planned_end_time = ?,
                updated_at = now()
            WHERE agency_owner_uuid = ?
                AND schedule_day_uuid = ?
                AND participant_group_uuid = ?
                AND participant_type = 'GUEST'
                AND deleted_at IS NULL
            """,
            normalizeAssignmentArea(area),
            displayName,
            pickupLocation,
            plannedStartTime,
            plannedEndTime,
            agencyOwnerUuid,
            scheduleDayUuid,
            participantGroupUuid
        );

        if (assignmentUuids.size() > participantCount) {
            List<UUID> surplusAssignmentUuids = assignmentUuids.subList(
                participantCount,
                assignmentUuids.size()
            );
            String placeholders = String.join(
                ",",
                surplusAssignmentUuids.stream().map(ignored -> "?").toList()
            );
            jdbcTemplate.update(
                """
                UPDATE public.work_schedule_assignment
                SET deleted_at = now(), updated_at = now()
                WHERE uuid IN (%s)
                """.formatted(placeholders),
                surplusAssignmentUuids.toArray()
            );
        } else if (assignmentUuids.size() < participantCount) {
            addGuestParticipants(
                agencyOwnerUuid,
                scheduleDayUuid,
                participantGroupUuid,
                area,
                participantCount - assignmentUuids.size(),
                displayName,
                pickupLocation,
                "NONE",
                null,
                null,
                plannedStartTime,
                plannedEndTime
            );
        }
    }

    @Override
    public void deleteGuestParticipants(
        UUID agencyOwnerUuid,
        UUID scheduleDayUuid,
        UUID participantGroupUuid
    ) {
        int updatedRows = jdbcTemplate.update(
            """
            UPDATE public.work_schedule_assignment
            SET deleted_at = now(), updated_at = now()
            WHERE agency_owner_uuid = ?
                AND schedule_day_uuid = ?
                AND participant_group_uuid = ?
                AND participant_type = 'GUEST'
                AND deleted_at IS NULL
            """,
            agencyOwnerUuid,
            scheduleDayUuid,
            participantGroupUuid
        );
        if (updatedRows == 0) {
            throw new IllegalArgumentException("Guest participant group was not found.");
        }
    }

    @Override
    public void replaceNoShow(
        UUID agencyOwnerUuid,
        UUID accountUuid,
        UUID scheduleDayUuid,
        UUID originalAssignmentUuid,
        UUID replacementWorkerProfileUuid
    ) {
        NoShowAssignmentContext original = jdbcTemplate.query(
            """
            SELECT a.worker_profile_uuid,
                   a.assignment_area,
                   a.work_date,
                   a.work_site_uuid,
                   a.planned_start_time,
                   a.planned_end_time,
                   a.status
            FROM public.work_schedule_assignment a
            WHERE a.agency_owner_uuid = ?
                AND a.schedule_day_uuid = ?
                AND a.uuid = ?
                AND a.participant_type = 'REGISTERED'
                AND a.worker_profile_uuid IS NOT NULL
                AND a.deleted_at IS NULL
            """,
            (resultSet, rowNumber) -> new NoShowAssignmentContext(
                resultSet.getObject("worker_profile_uuid", UUID.class),
                resultSet.getString("assignment_area"),
                resultSet.getObject("work_date", LocalDate.class),
                resultSet.getObject("work_site_uuid", UUID.class),
                resultSet.getObject("planned_start_time", LocalTime.class),
                resultSet.getObject("planned_end_time", LocalTime.class),
                resultSet.getString("status")
            ),
            agencyOwnerUuid,
            scheduleDayUuid,
            originalAssignmentUuid
        ).stream().findFirst().orElseThrow(
            () -> new IllegalArgumentException("Original assignment was not found.")
        );
        if (original.workerProfileUuid().equals(replacementWorkerProfileUuid)) {
            throw new IllegalArgumentException("The no-show worker cannot replace themselves.");
        }
        if ("REPLACED".equalsIgnoreCase(original.status())) {
            UUID persistedReplacementWorkerUuid = jdbcTemplate.query(
                """
                SELECT replacement_worker_profile_uuid
                FROM public.worker_no_show_incident
                WHERE agency_owner_uuid = ?
                    AND original_assignment_uuid = ?
                    AND deleted_at IS NULL
                """,
                (resultSet, rowNumber) -> resultSet.getObject(
                    "replacement_worker_profile_uuid",
                    UUID.class
                ),
                agencyOwnerUuid,
                originalAssignmentUuid
            ).stream().findFirst().orElse(null);
            if (replacementWorkerProfileUuid.equals(persistedReplacementWorkerUuid)) {
                return;
            }
            throw new IllegalArgumentException("The no-show assignment was already replaced.");
        }

        String previousAttendanceData = jdbcTemplate.query(
            """
            SELECT to_jsonb(att)::text AS attendance_data
            FROM public.worker_attendance_record att
            WHERE att.assignment_uuid = ?
                AND att.deleted_at IS NULL
            """,
            (resultSet, rowNumber) -> resultSet.getString("attendance_data"),
            originalAssignmentUuid
        ).stream().findFirst().orElse(null);

        jdbcTemplate.update(
            """
            INSERT INTO public.worker_attendance_record (
                agency_owner_uuid,
                assignment_uuid,
                schedule_day_uuid,
                worker_profile_uuid,
                work_date,
                break_minutes,
                status,
                time_entry_type,
                confirmed_at,
                confirmed_by_account_uuid
            )
            VALUES (?, ?, ?, ?, ?, 0, 'ABSENT', 'UNKNOWN', now(), ?)
            ON CONFLICT (assignment_uuid) WHERE deleted_at IS NULL DO UPDATE
            SET actual_start_at = NULL,
                actual_end_at = NULL,
                break_minutes = 0,
                status = 'ABSENT',
                time_entry_type = 'UNKNOWN',
                confirmed_at = now(),
                confirmed_by_account_uuid = EXCLUDED.confirmed_by_account_uuid,
                updated_at = now()
            """,
            agencyOwnerUuid,
            originalAssignmentUuid,
            scheduleDayUuid,
            original.workerProfileUuid(),
            original.workDate(),
            accountUuid
        );
        jdbcTemplate.update(
            """
            UPDATE public.work_schedule_assignment
            SET status = 'REPLACED', updated_at = now()
            WHERE uuid = ? AND agency_owner_uuid = ? AND deleted_at IS NULL
            """,
            originalAssignmentUuid,
            agencyOwnerUuid
        );

        ReplacementAssignmentResult replacement = findOrCreateReplacementAssignment(
            agencyOwnerUuid,
            scheduleDayUuid,
            replacementWorkerProfileUuid,
            original
        );

        UUID incidentUuid = jdbcTemplate.queryForObject(
            """
            INSERT INTO public.worker_no_show_incident (
                agency_owner_uuid,
                worker_profile_uuid,
                original_assignment_uuid,
                replacement_worker_profile_uuid,
                replacement_assignment_uuid,
                occurred_on,
                status,
                reported_by_account_uuid,
                previous_assignment_status,
                previous_attendance_data,
                replacement_assignment_created,
                resolved_by_account_uuid,
                cancelled_at
            )
            VALUES (?, ?, ?, ?, ?, ?, 'REPLACED', ?, ?, CAST(? AS jsonb), ?, NULL, NULL)
            ON CONFLICT (original_assignment_uuid) WHERE deleted_at IS NULL DO UPDATE
            SET replacement_worker_profile_uuid = EXCLUDED.replacement_worker_profile_uuid,
                replacement_assignment_uuid = EXCLUDED.replacement_assignment_uuid,
                status = 'REPLACED',
                reported_by_account_uuid = EXCLUDED.reported_by_account_uuid,
                previous_assignment_status = EXCLUDED.previous_assignment_status,
                previous_attendance_data = EXCLUDED.previous_attendance_data,
                replacement_assignment_created = EXCLUDED.replacement_assignment_created,
                resolved_by_account_uuid = NULL,
                cancelled_at = NULL,
                updated_at = now()
            RETURNING uuid
            """,
            UUID.class,
            agencyOwnerUuid,
            original.workerProfileUuid(),
            originalAssignmentUuid,
            replacementWorkerProfileUuid,
            replacement.assignmentUuid(),
            original.workDate(),
            accountUuid,
            original.status(),
            previousAttendanceData,
            replacement.created()
        );
        recordNoShowRevision(
            incidentUuid,
            "CREATED",
            null,
            replacementWorkerProfileUuid,
            null,
            replacement.assignmentUuid(),
            accountUuid
        );
    }

    @Override
    public void changeNoShowReplacement(
        UUID agencyOwnerUuid,
        UUID accountUuid,
        UUID scheduleDayUuid,
        UUID originalAssignmentUuid,
        UUID replacementWorkerProfileUuid
    ) {
        NoShowIncidentContext incident = findActiveNoShowIncident(
            agencyOwnerUuid,
            scheduleDayUuid,
            originalAssignmentUuid
        );
        if (incident.originalWorkerProfileUuid().equals(replacementWorkerProfileUuid)) {
            throw new IllegalArgumentException("The no-show worker cannot replace themselves.");
        }
        if (replacementWorkerProfileUuid.equals(incident.replacementWorkerProfileUuid())) {
            return;
        }

        ReplacementAssignmentResult replacement = findOrCreateReplacementAssignment(
            agencyOwnerUuid,
            scheduleDayUuid,
            replacementWorkerProfileUuid,
            incident.assignmentContext()
        );
        removeNoShowReplacementAssignment(
            agencyOwnerUuid,
            incident.replacementAssignmentUuid(),
            incident.replacementAssignmentCreated()
        );
        jdbcTemplate.update(
            """
            UPDATE public.worker_no_show_incident
            SET replacement_worker_profile_uuid = ?,
                replacement_assignment_uuid = ?,
                replacement_assignment_created = ?,
                reported_by_account_uuid = ?,
                updated_at = now()
            WHERE uuid = ?
                AND agency_owner_uuid = ?
                AND status = 'REPLACED'
                AND deleted_at IS NULL
            """,
            replacementWorkerProfileUuid,
            replacement.assignmentUuid(),
            replacement.created(),
            accountUuid,
            incident.incidentUuid(),
            agencyOwnerUuid
        );
        recordNoShowRevision(
            incident.incidentUuid(),
            "REPLACEMENT_CHANGED",
            incident.replacementWorkerProfileUuid(),
            replacementWorkerProfileUuid,
            incident.replacementAssignmentUuid(),
            replacement.assignmentUuid(),
            accountUuid
        );
    }

    @Override
    public void cancelNoShow(
        UUID agencyOwnerUuid,
        UUID accountUuid,
        UUID scheduleDayUuid,
        UUID originalAssignmentUuid
    ) {
        NoShowIncidentContext incident = findActiveNoShowIncident(
            agencyOwnerUuid,
            scheduleDayUuid,
            originalAssignmentUuid
        );
        removeNoShowReplacementAssignment(
            agencyOwnerUuid,
            incident.replacementAssignmentUuid(),
            incident.replacementAssignmentCreated()
        );
        jdbcTemplate.update(
            """
            UPDATE public.work_schedule_assignment
            SET status = ?, updated_at = now()
            WHERE uuid = ?
                AND agency_owner_uuid = ?
                AND deleted_at IS NULL
            """,
            incident.previousAssignmentStatus(),
            originalAssignmentUuid,
            agencyOwnerUuid
        );
        restoreAttendanceAfterNoShow(originalAssignmentUuid, incident.previousAttendanceData());
        jdbcTemplate.update(
            """
            UPDATE public.worker_no_show_incident
            SET status = 'CANCELLED',
                resolved_by_account_uuid = ?,
                cancelled_at = now(),
                updated_at = now()
            WHERE uuid = ?
                AND agency_owner_uuid = ?
                AND status = 'REPLACED'
                AND deleted_at IS NULL
            """,
            accountUuid,
            incident.incidentUuid(),
            agencyOwnerUuid
        );
        recordNoShowRevision(
            incident.incidentUuid(),
            "CANCELLED",
            incident.replacementWorkerProfileUuid(),
            null,
            incident.replacementAssignmentUuid(),
            null,
            accountUuid
        );
    }

    private ReplacementAssignmentResult findOrCreateReplacementAssignment(
        UUID agencyOwnerUuid,
        UUID scheduleDayUuid,
        UUID replacementWorkerProfileUuid,
        NoShowAssignmentContext original
    ) {
        UUID existingAssignmentUuid = jdbcTemplate.query(
            """
            SELECT uuid
            FROM public.work_schedule_assignment
            WHERE agency_owner_uuid = ?
                AND schedule_day_uuid = ?
                AND worker_profile_uuid = ?
                AND participant_type = 'REGISTERED'
                AND status <> 'REPLACED'
                AND deleted_at IS NULL
            """,
            (resultSet, rowNumber) -> resultSet.getObject("uuid", UUID.class),
            agencyOwnerUuid,
            scheduleDayUuid,
            replacementWorkerProfileUuid
        ).stream().findFirst().orElse(null);
        if (existingAssignmentUuid != null) {
            return new ReplacementAssignmentResult(existingAssignmentUuid, false);
        }

        UUID assignmentUuid = jdbcTemplate.queryForObject(
            """
            INSERT INTO public.work_schedule_assignment (
                agency_owner_uuid,
                work_site_uuid,
                worker_profile_uuid,
                work_date,
                assignment_area,
                schedule_day_uuid,
                worker_count,
                participant_group_uuid,
                participant_type,
                planned_start_time,
                planned_end_time,
                status
            )
            VALUES (?, ?, ?, ?, ?, ?, 1, gen_random_uuid(), 'REGISTERED', ?, ?, 'PLANNED')
            RETURNING uuid
            """,
            UUID.class,
            agencyOwnerUuid,
            original.workSiteUuid(),
            replacementWorkerProfileUuid,
            original.workDate(),
            original.assignmentArea(),
            scheduleDayUuid,
            original.plannedStartTime(),
            original.plannedEndTime()
        );
        return new ReplacementAssignmentResult(assignmentUuid, true);
    }

    private NoShowIncidentContext findActiveNoShowIncident(
        UUID agencyOwnerUuid,
        UUID scheduleDayUuid,
        UUID originalAssignmentUuid
    ) {
        return jdbcTemplate.query(
            """
            SELECT incident.uuid AS incident_uuid,
                   incident.worker_profile_uuid,
                   incident.replacement_worker_profile_uuid,
                   incident.replacement_assignment_uuid,
                   incident.replacement_assignment_created,
                   incident.previous_assignment_status,
                   incident.previous_attendance_data::text AS previous_attendance_data,
                   assignment.assignment_area,
                   assignment.work_date,
                   assignment.work_site_uuid,
                   assignment.planned_start_time,
                   assignment.planned_end_time,
                   assignment.status AS assignment_status
            FROM public.worker_no_show_incident incident
            JOIN public.work_schedule_assignment assignment
                ON assignment.uuid = incident.original_assignment_uuid
            WHERE incident.agency_owner_uuid = ?
                AND assignment.schedule_day_uuid = ?
                AND incident.original_assignment_uuid = ?
                AND incident.status = 'REPLACED'
                AND incident.deleted_at IS NULL
                AND assignment.deleted_at IS NULL
            """,
            (resultSet, rowNumber) -> new NoShowIncidentContext(
                resultSet.getObject("incident_uuid", UUID.class),
                resultSet.getObject("worker_profile_uuid", UUID.class),
                resultSet.getObject("replacement_worker_profile_uuid", UUID.class),
                resultSet.getObject("replacement_assignment_uuid", UUID.class),
                resultSet.getBoolean("replacement_assignment_created"),
                resultSet.getString("previous_assignment_status"),
                resultSet.getString("previous_attendance_data"),
                new NoShowAssignmentContext(
                    resultSet.getObject("worker_profile_uuid", UUID.class),
                    resultSet.getString("assignment_area"),
                    resultSet.getObject("work_date", LocalDate.class),
                    resultSet.getObject("work_site_uuid", UUID.class),
                    resultSet.getObject("planned_start_time", LocalTime.class),
                    resultSet.getObject("planned_end_time", LocalTime.class),
                    resultSet.getString("assignment_status")
                )
            ),
            agencyOwnerUuid,
            scheduleDayUuid,
            originalAssignmentUuid
        ).stream().findFirst().orElseThrow(
            () -> new IllegalArgumentException("Active no-show incident was not found.")
        );
    }

    private void removeNoShowReplacementAssignment(
        UUID agencyOwnerUuid,
        UUID replacementAssignmentUuid,
        boolean replacementAssignmentCreated
    ) {
        if (!replacementAssignmentCreated || replacementAssignmentUuid == null) {
            return;
        }
        Integer workedCount = jdbcTemplate.queryForObject(
            """
            SELECT count(*)
            FROM public.worker_attendance_record
            WHERE assignment_uuid = ?
                AND agency_owner_uuid = ?
                AND status = 'WORKED'
                AND deleted_at IS NULL
            """,
            Integer.class,
            replacementAssignmentUuid,
            agencyOwnerUuid
        );
        if (workedCount != null && workedCount > 0) {
            throw new IllegalArgumentException("Confirmed replacement attendance must be corrected first.");
        }
        jdbcTemplate.update(
            """
            UPDATE public.worker_attendance_record
            SET deleted_at = now(), updated_at = now()
            WHERE assignment_uuid = ?
                AND agency_owner_uuid = ?
                AND deleted_at IS NULL
            """,
            replacementAssignmentUuid,
            agencyOwnerUuid
        );
        jdbcTemplate.update(
            """
            UPDATE public.work_schedule_assignment
            SET status = 'CANCELLED', deleted_at = now(), updated_at = now()
            WHERE uuid = ?
                AND agency_owner_uuid = ?
                AND deleted_at IS NULL
            """,
            replacementAssignmentUuid,
            agencyOwnerUuid
        );
    }

    private void restoreAttendanceAfterNoShow(UUID assignmentUuid, String previousAttendanceData) {
        if (previousAttendanceData == null) {
            jdbcTemplate.update(
                """
                UPDATE public.worker_attendance_record
                SET deleted_at = now(), updated_at = now()
                WHERE assignment_uuid = ? AND deleted_at IS NULL
                """,
                assignmentUuid
            );
            return;
        }
        jdbcTemplate.update(
            """
            WITH snapshot AS (SELECT CAST(? AS jsonb) AS data)
            UPDATE public.worker_attendance_record attendance
            SET actual_start_at = NULLIF(snapshot.data ->> 'actual_start_at', '')::timestamptz,
                actual_end_at = NULLIF(snapshot.data ->> 'actual_end_at', '')::timestamptz,
                break_minutes = COALESCE((snapshot.data ->> 'break_minutes')::integer, 0),
                status = snapshot.data ->> 'status',
                time_entry_type = snapshot.data ->> 'time_entry_type',
                confirmed_at = NULLIF(snapshot.data ->> 'confirmed_at', '')::timestamptz,
                confirmed_by_account_uuid = NULLIF(snapshot.data ->> 'confirmed_by_account_uuid', '')::uuid,
                deleted_at = NULL,
                updated_at = now()
            FROM snapshot
            WHERE attendance.assignment_uuid = ?
                AND attendance.deleted_at IS NULL
            """,
            previousAttendanceData,
            assignmentUuid
        );
    }

    private void recordNoShowRevision(
        UUID incidentUuid,
        String action,
        UUID previousReplacementWorkerProfileUuid,
        UUID newReplacementWorkerProfileUuid,
        UUID previousReplacementAssignmentUuid,
        UUID newReplacementAssignmentUuid,
        UUID accountUuid
    ) {
        jdbcTemplate.update(
            """
            INSERT INTO public.worker_no_show_incident_revision (
                incident_uuid,
                action,
                previous_replacement_worker_profile_uuid,
                new_replacement_worker_profile_uuid,
                previous_replacement_assignment_uuid,
                new_replacement_assignment_uuid,
                performed_by_account_uuid
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            incidentUuid,
            action,
            previousReplacementWorkerProfileUuid,
            newReplacementWorkerProfileUuid,
            previousReplacementAssignmentUuid,
            newReplacementAssignmentUuid,
            accountUuid
        );
    }

    @Override
    public UUID createTask(
        UUID agencyOwnerUuid,
        UUID farmOwnerUuid,
        LocalDate startDate,
        LocalDate endDate,
        String title,
        String siteName,
        String address,
        int requiredMen,
        int requiredWomen,
        LocalTime startTime,
        LocalTime endTime,
        String memo,
        List<String> workTypeCodes
    ) {
        UUID workSiteUuid = UUID.randomUUID();
        jdbcTemplate.update(
            """
            INSERT INTO public.farm_work_site (
                uuid,
                owner_uuid,
                site_name,
                farm_address,
                male_required_count,
                female_required_count,
                work_description,
                work_start_date,
                work_end_date,
                daily_start_time,
                daily_end_time,
                memo,
                agency_owner_uuid,
                status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
            """,
            workSiteUuid,
            farmOwnerUuid,
            siteName,
            address,
            requiredMen,
            requiredWomen,
            title,
            startDate,
            endDate,
            startTime,
            endTime,
            memo,
            agencyOwnerUuid
        );

        for (String workTypeCode : workTypeCodes) {
            jdbcTemplate.update(
                """
                INSERT INTO public.farm_work_site_work_type (
                    work_site_uuid,
                    work_type_uuid
                )
                SELECT ?, wt.uuid
                FROM public.work_type wt
                WHERE wt.code = ? AND wt.status = 'ACTIVE'
                ON CONFLICT (work_site_uuid, work_type_uuid) DO UPDATE
                SET deleted_at = NULL
                """,
                workSiteUuid,
                workTypeCode
            );
        }

        UUID firstScheduleDayUuid = null;
        for (LocalDate workDate : enumerateDates(startDate, endDate)) {
            UUID scheduleDayUuid = UUID.randomUUID();
            if (firstScheduleDayUuid == null) {
                firstScheduleDayUuid = scheduleDayUuid;
            }

            jdbcTemplate.update(
                """
                INSERT INTO public.work_schedule_day (
                    uuid,
                    work_site_uuid,
                    work_date,
                    daily_start_time,
                    daily_end_time,
                    male_required_count,
                    female_required_count,
                    memo,
                    status
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
                """,
                scheduleDayUuid,
                workSiteUuid,
                workDate,
                startTime,
                endTime,
                requiredMen,
                requiredWomen,
                memo
            );
        }

        return firstScheduleDayUuid;
    }

    @Override
    public void rescheduleTaskRange(
        UUID agencyOwnerUuid,
        List<UUID> scheduleDayUuids,
        LocalDate startDate,
        LocalDate endDate
    ) {
        List<ScheduleDayRecord> scheduleDays = findScheduleDayRecords(agencyOwnerUuid, scheduleDayUuids);
        if (scheduleDays.size() != scheduleDayUuids.stream().distinct().count()) {
            throw new IllegalArgumentException("Schedule day was not found.");
        }

        UUID workSiteUuid = scheduleDays.get(0).workSiteUuid();
        if (scheduleDays.stream().anyMatch(scheduleDay -> !scheduleDay.workSiteUuid().equals(workSiteUuid))) {
            throw new IllegalArgumentException("Schedule days must belong to one work site.");
        }

        List<LocalDate> targetDates = enumerateDates(startDate, endDate);
        ensureTargetDatesAreAvailable(workSiteUuid, scheduleDayUuids, targetDates);

        for (int index = 0; index < scheduleDays.size(); index++) {
            LocalDate temporaryDate = startDate.minusDays(10_000L + index);
            updateScheduleDayDate(scheduleDays.get(index).uuid(), temporaryDate);
        }

        int reusableCount = Math.min(scheduleDays.size(), targetDates.size());
        for (int index = 0; index < reusableCount; index++) {
            updateScheduleDayDate(scheduleDays.get(index).uuid(), targetDates.get(index));
        }

        if (scheduleDays.size() > targetDates.size()) {
            deleteScheduleDays(scheduleDays.subList(targetDates.size(), scheduleDays.size()));
        }

        if (targetDates.size() > scheduleDays.size()) {
            ScheduleDayRecord template = scheduleDays.get(scheduleDays.size() - 1);
            for (int index = scheduleDays.size(); index < targetDates.size(); index++) {
                insertScheduleDayFromTemplate(template, targetDates.get(index));
            }
        }

        refreshWorkSiteDateRange(workSiteUuid);
    }

    @Override
    public void deleteTaskRange(UUID agencyOwnerUuid, List<UUID> scheduleDayUuids) {
        List<ScheduleDayRecord> scheduleDays = findScheduleDayRecords(agencyOwnerUuid, scheduleDayUuids);
        if (scheduleDays.size() != scheduleDayUuids.stream().distinct().count()) {
            throw new IllegalArgumentException("Schedule day was not found.");
        }

        UUID workSiteUuid = scheduleDays.get(0).workSiteUuid();
        if (scheduleDays.stream().anyMatch(scheduleDay -> !scheduleDay.workSiteUuid().equals(workSiteUuid))) {
            throw new IllegalArgumentException("Schedule days must belong to one work site.");
        }

        deleteScheduleDays(scheduleDays);
        refreshWorkSiteDateRange(workSiteUuid);
        archiveWorkSiteIfEmpty(workSiteUuid);
    }

    private List<ScheduleDayRecord> findScheduleDayRecords(UUID agencyOwnerUuid, List<UUID> scheduleDayUuids) {
        String placeholders = String.join(",", scheduleDayUuids.stream().map(ignored -> "?").toList());
        List<Object> params = new ArrayList<>();
        params.add(agencyOwnerUuid);
        params.addAll(scheduleDayUuids);

        return jdbcTemplate.query(
            """
            SELECT
                d.uuid,
                d.work_site_uuid,
                d.work_date,
                d.daily_start_time,
                d.daily_end_time,
                d.male_required_count,
                d.female_required_count,
                d.memo,
                d.status
            FROM public.work_schedule_day d
            JOIN public.farm_work_site s ON s.uuid = d.work_site_uuid
            WHERE s.agency_owner_uuid = ?
                AND s.deleted_at IS NULL
                AND d.uuid IN (%s)
                AND d.deleted_at IS NULL
            ORDER BY d.work_date, d.created_at
            """.formatted(placeholders),
            (resultSet, rowNumber) -> new ScheduleDayRecord(
                resultSet.getObject("uuid", UUID.class),
                resultSet.getObject("work_site_uuid", UUID.class),
                resultSet.getObject("work_date", LocalDate.class),
                Optional.ofNullable(resultSet.getObject("daily_start_time", LocalTime.class)),
                Optional.ofNullable(resultSet.getObject("daily_end_time", LocalTime.class)),
                resultSet.getInt("male_required_count"),
                resultSet.getInt("female_required_count"),
                resultSet.getString("memo"),
                resultSet.getString("status")
            ),
            params.toArray()
        );
    }

    private List<LocalDate> enumerateDates(LocalDate startDate, LocalDate endDate) {
        List<LocalDate> dates = new ArrayList<>();
        LocalDate currentDate = startDate;

        while (!currentDate.isAfter(endDate)) {
            dates.add(currentDate);
            currentDate = currentDate.plusDays(1);
        }

        return dates;
    }

    private void ensureTargetDatesAreAvailable(
        UUID workSiteUuid,
        List<UUID> scheduleDayUuids,
        List<LocalDate> targetDates
    ) {
        String datePlaceholders = String.join(",", targetDates.stream().map(ignored -> "?").toList());
        String uuidPlaceholders = String.join(",", scheduleDayUuids.stream().map(ignored -> "?").toList());
        List<Object> params = new ArrayList<>();
        params.add(workSiteUuid);
        params.addAll(targetDates);
        params.addAll(scheduleDayUuids);

        Integer count = jdbcTemplate.queryForObject(
            """
            SELECT count(*)
            FROM public.work_schedule_day
            WHERE work_site_uuid = ?
                AND work_date IN (%s)
                AND uuid NOT IN (%s)
                AND deleted_at IS NULL
            """.formatted(datePlaceholders, uuidPlaceholders),
            Integer.class,
            params.toArray()
        );

        if (count != null && count > 0) {
            throw new IllegalArgumentException("Target schedule dates already exist.");
        }
    }

    private void updateScheduleDayDate(UUID scheduleDayUuid, LocalDate workDate) {
        jdbcTemplate.update(
            """
            UPDATE public.work_schedule_day
            SET work_date = ?
            WHERE uuid = ?
                AND deleted_at IS NULL
            """,
            workDate,
            scheduleDayUuid
        );
        jdbcTemplate.update(
            """
            UPDATE public.work_schedule_assignment
            SET work_date = ?
            WHERE schedule_day_uuid = ?
                AND deleted_at IS NULL
            """,
            workDate,
            scheduleDayUuid
        );
    }

    private void deleteScheduleDays(List<ScheduleDayRecord> scheduleDays) {
        for (ScheduleDayRecord scheduleDay : scheduleDays) {
            jdbcTemplate.update(
                """
                UPDATE public.work_schedule_assignment
                SET deleted_at = COALESCE(deleted_at, now()),
                    updated_at = now()
                WHERE schedule_day_uuid = ?
                    AND deleted_at IS NULL
                """,
                scheduleDay.uuid()
            );
            jdbcTemplate.update(
                """
                UPDATE public.work_schedule_day
                SET status = 'ARCHIVED',
                    deleted_at = COALESCE(deleted_at, now())
                WHERE uuid = ?
                    AND deleted_at IS NULL
                """,
                scheduleDay.uuid()
            );
        }
    }

    private void insertScheduleDayFromTemplate(ScheduleDayRecord template, LocalDate workDate) {
        jdbcTemplate.update(
            """
            INSERT INTO public.work_schedule_day (
                work_site_uuid,
                work_date,
                daily_start_time,
                daily_end_time,
                male_required_count,
                female_required_count,
                memo,
                status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
            ON CONFLICT (work_site_uuid, work_date) WHERE deleted_at IS NULL DO NOTHING
            """,
            template.workSiteUuid(),
            workDate,
            template.startTime().orElse(null),
            template.endTime().orElse(null),
            template.requiredMen(),
            template.requiredWomen(),
            template.memo()
        );
    }

    private void refreshWorkSiteDateRange(UUID workSiteUuid) {
        jdbcTemplate.update(
            """
            UPDATE public.farm_work_site
            SET work_start_date = range_dates.start_date,
                work_end_date = range_dates.end_date
            FROM (
                SELECT MIN(work_date) AS start_date, MAX(work_date) AS end_date
                FROM public.work_schedule_day
                WHERE work_site_uuid = ?
                    AND status = 'ACTIVE'
                    AND deleted_at IS NULL
            ) range_dates
            WHERE uuid = ?
                AND deleted_at IS NULL
            """,
            workSiteUuid,
            workSiteUuid
        );
    }

    private void archiveWorkSiteIfEmpty(UUID workSiteUuid) {
        jdbcTemplate.update(
            """
            UPDATE public.farm_work_site
            SET status = 'ARCHIVED',
                deleted_at = COALESCE(deleted_at, now())
            WHERE uuid = ?
                AND deleted_at IS NULL
                AND NOT EXISTS (
                    SELECT 1
                    FROM public.work_schedule_day
                    WHERE work_site_uuid = ?
                        AND status = 'ACTIVE'
                        AND deleted_at IS NULL
                )
            """,
            workSiteUuid,
            workSiteUuid
        );
    }

    private Map<UUID, List<String>> findWorkTypeCodesBySiteUuid(List<UUID> siteUuids) {
        Map<UUID, List<String>> workTypeCodesBySiteUuid = new LinkedHashMap<>();
        for (UUID siteUuid : siteUuids) {
            workTypeCodesBySiteUuid.put(siteUuid, new ArrayList<>());
        }

        String placeholders = String.join(",", siteUuids.stream().map(siteUuid -> "?").toList());
        jdbcTemplate.query(
            """
            SELECT swt.work_site_uuid, wt.code
            FROM public.farm_work_site_work_type swt
            JOIN public.work_type wt ON wt.uuid = swt.work_type_uuid
            WHERE swt.work_site_uuid IN (%s)
                AND swt.deleted_at IS NULL
                AND wt.status = 'ACTIVE'
            ORDER BY wt.name
            """.formatted(placeholders),
            resultSet -> {
                UUID siteUuid = resultSet.getObject("work_site_uuid", UUID.class);
                workTypeCodesBySiteUuid.computeIfAbsent(siteUuid, ignored -> new ArrayList<>())
                    .add(resultSet.getString("code"));
            },
            siteUuids.toArray()
        );

        return workTypeCodesBySiteUuid;
    }

    private Map<UUID, List<ScheduleAssignmentResponse>> findAssignmentsByScheduleDayUuid(
        List<UUID> scheduleDayUuids
    ) {
        Map<UUID, List<ScheduleAssignmentResponse>> assignmentsByScheduleDayUuid = new LinkedHashMap<>();
        for (UUID scheduleDayUuid : scheduleDayUuids) {
            assignmentsByScheduleDayUuid.put(scheduleDayUuid, new ArrayList<>());
        }

        String placeholders = String.join(",", scheduleDayUuids.stream().map(scheduleDayUuid -> "?").toList());

        jdbcTemplate.query(
            """
            SELECT
                a.schedule_day_uuid,
                a.uuid AS assignment_uuid,
                a.participant_group_uuid,
                a.worker_profile_uuid,
                a.participant_type,
                COALESCE(a.participant_display_name, '') AS participant_display_name,
                COALESCE(a.participant_pickup_location, '') AS participant_pickup_location,
                a.assignment_area,
                a.worker_count,
                a.planned_start_time,
                a.planned_end_time,
                a.status AS assignment_status,
                COALESCE(att.status, '') AS attendance_status,
                incident.uuid AS no_show_incident_uuid,
                incident.replacement_worker_profile_uuid AS no_show_replacement_worker_profile_uuid,
                incident.replacement_assignment_uuid AS no_show_replacement_assignment_uuid,
                COALESCE(incident.status, '') AS no_show_incident_status
            FROM public.work_schedule_assignment a
            LEFT JOIN public.labor_agency_worker_profile p ON p.uuid = a.worker_profile_uuid
            LEFT JOIN public.worker_attendance_record att
                ON att.assignment_uuid = a.uuid
                AND att.deleted_at IS NULL
            LEFT JOIN public.worker_no_show_incident incident
                ON incident.original_assignment_uuid = a.uuid
                AND incident.status = 'REPLACED'
                AND incident.deleted_at IS NULL
            WHERE a.schedule_day_uuid IN (%s)
                AND a.deleted_at IS NULL
                AND (
                    a.participant_type = 'GUEST'
                    OR (p.status = 'ACTIVE' AND p.deleted_at IS NULL)
                )
            ORDER BY a.created_at
            """.formatted(placeholders),
            resultSet -> {
                UUID scheduleDayUuid = resultSet.getObject("schedule_day_uuid", UUID.class);
                assignmentsByScheduleDayUuid.computeIfAbsent(scheduleDayUuid, ignored -> new ArrayList<>())
                    .add(new ScheduleAssignmentResponse(
                        resultSet.getObject("assignment_uuid", UUID.class),
                        resultSet.getObject("participant_group_uuid", UUID.class),
                        resultSet.getObject("worker_profile_uuid", UUID.class),
                        resultSet.getString("participant_type").toLowerCase(),
                        resultSet.getString("participant_display_name"),
                        resultSet.getString("participant_pickup_location"),
                        denormalizeAssignmentArea(resultSet.getString("assignment_area")),
                        resultSet.getInt("worker_count"),
                        formatOptionalTime(resultSet.getObject("planned_start_time", LocalTime.class)),
                        formatOptionalTime(resultSet.getObject("planned_end_time", LocalTime.class)),
                        resultSet.getString("assignment_status").toLowerCase(),
                        resultSet.getString("attendance_status").toLowerCase(),
                        resultSet.getObject("no_show_incident_uuid", UUID.class),
                        resultSet.getObject("no_show_replacement_worker_profile_uuid", UUID.class),
                        resultSet.getObject("no_show_replacement_assignment_uuid", UUID.class),
                        resultSet.getString("no_show_incident_status").toLowerCase()
                    ));
            },
            scheduleDayUuids.toArray()
        );

        return assignmentsByScheduleDayUuid;
    }

    private ScheduleTaskProjection mapTaskProjection(ResultSet resultSet) throws SQLException {
        return new ScheduleTaskProjection(
            resultSet.getObject("uuid", UUID.class),
            resultSet.getObject("work_site_uuid", UUID.class),
            resultSet.getObject("owner_uuid", UUID.class),
            resultSet.getString("work_description"),
            resultSet.getString("owner_name"),
            resultSet.getString("site_name"),
            resultSet.getString("farm_address"),
            resultSet.getInt("male_required_count"),
            resultSet.getInt("female_required_count"),
            resultSet.getString("memo"),
            resultSet.getObject("daily_start_time", LocalTime.class),
            resultSet.getObject("daily_end_time", LocalTime.class)
        );
    }

    private String formatTimeRange(LocalTime startTime, LocalTime endTime) {
        if (startTime == null && endTime == null) {
            return "";
        }

        if (startTime == null) {
            return TIME_FORMATTER.format(endTime);
        }

        if (endTime == null) {
            return TIME_FORMATTER.format(startTime);
        }

        return "%s - %s".formatted(TIME_FORMATTER.format(startTime), TIME_FORMATTER.format(endTime));
    }

    private String formatOptionalTime(LocalTime value) {
        return value == null ? "" : TIME_FORMATTER.format(value);
    }

    private String normalizeAssignmentArea(String area) {
        return "women".equalsIgnoreCase(area) ? "WOMEN" : "MEN";
    }

    private String denormalizeAssignmentArea(String area) {
        return "WOMEN".equals(area) ? "women" : "men";
    }

    private record ScheduleTaskProjection(
        UUID id,
        UUID workSiteId,
        UUID ownerUuid,
        String title,
        String ownerName,
        String siteName,
        String address,
        int requiredMen,
        int requiredWomen,
        String memo,
        LocalTime startTime,
        LocalTime endTime
    ) {
    }

    private record NoShowAssignmentContext(
        UUID workerProfileUuid,
        String assignmentArea,
        LocalDate workDate,
        UUID workSiteUuid,
        LocalTime plannedStartTime,
        LocalTime plannedEndTime,
        String status
    ) {
    }

    private record ReplacementAssignmentResult(UUID assignmentUuid, boolean created) {
    }

    private record NoShowIncidentContext(
        UUID incidentUuid,
        UUID originalWorkerProfileUuid,
        UUID replacementWorkerProfileUuid,
        UUID replacementAssignmentUuid,
        boolean replacementAssignmentCreated,
        String previousAssignmentStatus,
        String previousAttendanceData,
        NoShowAssignmentContext assignmentContext
    ) {
    }

    private record ScheduleDayRecord(
        UUID uuid,
        UUID workSiteUuid,
        LocalDate workDate,
        Optional<LocalTime> startTime,
        Optional<LocalTime> endTime,
        int requiredMen,
        int requiredWomen,
        String memo,
        String status
    ) {
    }
}
