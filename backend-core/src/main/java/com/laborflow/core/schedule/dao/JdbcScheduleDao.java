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
            SELECT
                fo.uuid,
                COALESCE(fp.local_name, fp.local_nickname, fp.local_business_name, fo.canonical_name, '') AS display_name,
                COALESCE(fp.local_business_name, fo.canonical_business_name, '') AS business_name
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
            """,
            (resultSet, rowNumber) -> new FarmOwnerOptionResponse(
                resultSet.getObject("uuid", UUID.class),
                resultSet.getString("display_name"),
                resultSet.getString("business_name")
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
                COALESCE(att.status, '') AS attendance_status
            FROM public.work_schedule_assignment a
            LEFT JOIN public.labor_agency_worker_profile p ON p.uuid = a.worker_profile_uuid
            LEFT JOIN public.worker_attendance_record att
                ON att.assignment_uuid = a.uuid
                AND att.deleted_at IS NULL
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
                        resultSet.getString("attendance_status").toLowerCase()
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
