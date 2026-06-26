package com.laborflow.core.schedule.dao;

import com.laborflow.core.schedule.dto.ScheduleAssignmentRequest;
import com.laborflow.core.schedule.dto.ScheduleAssignmentResponse;
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
            WHERE s.agency_owner_uuid = ? AND d.uuid = ?
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
            WHERE agency_owner_uuid = ? AND uuid = ?
            """,
            Integer.class,
            agencyOwnerUuid,
            workerProfileUuid
        );

        return count != null && count > 0;
    }

    @Override
    public List<ScheduleTaskResponse> findTasks(UUID agencyOwnerUuid, LocalDate workDate) {
        List<ScheduleTaskProjection> tasks = jdbcTemplate.query(
            """
            SELECT
                d.uuid,
                s.uuid AS work_site_uuid,
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
            WHERE s.agency_owner_uuid = ?
                AND s.status = 'ACTIVE'
                AND d.status = 'ACTIVE'
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
                farm_address = ?
            FROM public.work_schedule_day d
            WHERE d.work_site_uuid = public.farm_work_site.uuid
                AND public.farm_work_site.agency_owner_uuid = ?
                AND d.uuid = ?
            """,
            title,
            address,
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
                AND d.uuid = ?
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
            DELETE FROM public.farm_work_site_work_type swt
            USING public.work_schedule_day d, public.farm_work_site s
            WHERE swt.work_site_uuid = d.work_site_uuid
                AND s.uuid = d.work_site_uuid
                AND s.agency_owner_uuid = ?
                AND d.uuid = ?
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
                    AND d.uuid = ?
                ON CONFLICT DO NOTHING
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
        jdbcTemplate.update(
            """
            DELETE FROM public.work_schedule_assignment
            WHERE agency_owner_uuid = ? AND schedule_day_uuid = ?
            """,
            agencyOwnerUuid,
            scheduleDayUuid
        );

        for (ScheduleAssignmentRequest assignment : assignments) {
            jdbcTemplate.update(
                """
                INSERT INTO public.work_schedule_assignment (
                    agency_owner_uuid,
                    work_site_uuid,
                    worker_profile_uuid,
                    work_date,
                    assignment_area,
                    schedule_day_uuid,
                    worker_count
                )
                SELECT
                    ?,
                    d.work_site_uuid,
                    ?,
                    d.work_date,
                    ?,
                    d.uuid,
                    ?
                FROM public.work_schedule_day d
                JOIN public.farm_work_site s ON s.uuid = d.work_site_uuid
                WHERE s.agency_owner_uuid = ?
                    AND d.uuid = ?
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
            SELECT schedule_day_uuid, worker_profile_uuid, assignment_area, worker_count
            FROM public.work_schedule_assignment
            WHERE schedule_day_uuid IN (%s)
            ORDER BY created_at
            """.formatted(placeholders),
            resultSet -> {
                UUID scheduleDayUuid = resultSet.getObject("schedule_day_uuid", UUID.class);
                assignmentsByScheduleDayUuid.computeIfAbsent(scheduleDayUuid, ignored -> new ArrayList<>())
                    .add(new ScheduleAssignmentResponse(
                        resultSet.getObject("worker_profile_uuid", UUID.class),
                        denormalizeAssignmentArea(resultSet.getString("assignment_area")),
                        resultSet.getInt("worker_count")
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

    private String normalizeAssignmentArea(String area) {
        return "women".equalsIgnoreCase(area) ? "WOMEN" : "MEN";
    }

    private String denormalizeAssignmentArea(String area) {
        return "WOMEN".equals(area) ? "women" : "men";
    }

    private record ScheduleTaskProjection(
        UUID id,
        UUID workSiteId,
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
}
