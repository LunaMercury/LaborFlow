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
    public boolean workSiteBelongsToAgencyOwner(UUID agencyOwnerUuid, UUID workSiteUuid) {
        Integer count = jdbcTemplate.queryForObject(
            """
            SELECT count(*)
            FROM public.farm_work_site
            WHERE agency_owner_uuid = ? AND uuid = ?
            """,
            Integer.class,
            agencyOwnerUuid,
            workSiteUuid
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
                s.uuid,
                s.work_description,
                COALESCE(fp.local_name, fp.local_nickname, fp.local_business_name, fo.canonical_name, '') AS owner_name,
                COALESCE(s.site_name, '') AS site_name,
                s.farm_address,
                s.male_required_count,
                s.female_required_count,
                COALESCE(s.memo, '') AS memo,
                s.daily_start_time,
                s.daily_end_time
            FROM public.farm_work_site s
            JOIN public.farm_owner fo ON fo.uuid = s.owner_uuid
            LEFT JOIN public.labor_agency_farm_owner_profile fp
                ON fp.agency_owner_uuid = s.agency_owner_uuid
                AND fp.farm_owner_uuid = s.owner_uuid
            WHERE s.agency_owner_uuid = ?
                AND s.status = 'ACTIVE'
                AND (s.work_start_date IS NULL OR s.work_start_date <= ?)
                AND (s.work_end_date IS NULL OR s.work_end_date >= ?)
            ORDER BY s.daily_start_time NULLS LAST, s.work_description, s.created_at
            """,
            (resultSet, rowNumber) -> mapTaskProjection(resultSet),
            agencyOwnerUuid,
            workDate,
            workDate
        );

        if (tasks.isEmpty()) {
            return List.of();
        }

        List<UUID> siteUuids = tasks.stream().map(ScheduleTaskProjection::id).toList();
        Map<UUID, List<String>> workTypeCodesBySiteUuid = findWorkTypeCodesBySiteUuid(siteUuids);
        Map<UUID, List<ScheduleAssignmentResponse>> assignmentsBySiteUuid =
            findAssignmentsBySiteUuid(siteUuids, workDate);

        return tasks.stream()
            .map(task -> new ScheduleTaskResponse(
                task.id(),
                task.title(),
                task.ownerName(),
                task.siteName(),
                task.address(),
                formatTimeRange(task.startTime(), task.endTime()),
                task.requiredMen(),
                task.requiredWomen(),
                workTypeCodesBySiteUuid.getOrDefault(task.id(), List.of()),
                task.memo(),
                assignmentsBySiteUuid.getOrDefault(task.id(), List.of())
            ))
            .toList();
    }

    @Override
    public Optional<ScheduleTaskResponse> findTask(UUID agencyOwnerUuid, UUID workSiteUuid, LocalDate workDate) {
        return findTasks(agencyOwnerUuid, workDate).stream()
            .filter(task -> task.id().equals(workSiteUuid))
            .findFirst();
    }

    @Override
    public void updateTask(
        UUID agencyOwnerUuid,
        UUID workSiteUuid,
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
                male_required_count = ?,
                female_required_count = ?,
                memo = ?
            WHERE agency_owner_uuid = ? AND uuid = ?
            """,
            title,
            address,
            requiredMen,
            requiredWomen,
            memo,
            agencyOwnerUuid,
            workSiteUuid
        );
    }

    @Override
    public void replaceTaskWorkTypes(UUID workSiteUuid, List<String> workTypeCodes) {
        jdbcTemplate.update(
            "DELETE FROM public.farm_work_site_work_type WHERE work_site_uuid = ?",
            workSiteUuid
        );

        for (String workTypeCode : workTypeCodes) {
            jdbcTemplate.update(
                """
                INSERT INTO public.farm_work_site_work_type (
                    work_site_uuid,
                    work_type_uuid
                )
                SELECT ?, uuid
                FROM public.work_type
                WHERE code = ? AND status = 'ACTIVE'
                ON CONFLICT DO NOTHING
                """,
                workSiteUuid,
                workTypeCode
            );
        }
    }

    @Override
    public void replaceAssignments(
        UUID agencyOwnerUuid,
        UUID workSiteUuid,
        LocalDate workDate,
        List<ScheduleAssignmentRequest> assignments
    ) {
        jdbcTemplate.update(
            """
            DELETE FROM public.work_schedule_assignment
            WHERE agency_owner_uuid = ? AND work_site_uuid = ? AND work_date = ?
            """,
            agencyOwnerUuid,
            workSiteUuid,
            workDate
        );

        for (ScheduleAssignmentRequest assignment : assignments) {
            jdbcTemplate.update(
                """
                INSERT INTO public.work_schedule_assignment (
                    agency_owner_uuid,
                    work_site_uuid,
                    worker_profile_uuid,
                    work_date,
                    assignment_area
                )
                VALUES (?, ?, ?, ?, ?)
                """,
                agencyOwnerUuid,
                workSiteUuid,
                assignment.workerProfileUuid(),
                workDate,
                normalizeAssignmentArea(assignment.area())
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

    private Map<UUID, List<ScheduleAssignmentResponse>> findAssignmentsBySiteUuid(
        List<UUID> siteUuids,
        LocalDate workDate
    ) {
        Map<UUID, List<ScheduleAssignmentResponse>> assignmentsBySiteUuid = new LinkedHashMap<>();
        for (UUID siteUuid : siteUuids) {
            assignmentsBySiteUuid.put(siteUuid, new ArrayList<>());
        }

        String placeholders = String.join(",", siteUuids.stream().map(siteUuid -> "?").toList());
        Object[] params = new Object[siteUuids.size() + 1];
        for (int index = 0; index < siteUuids.size(); index += 1) {
            params[index] = siteUuids.get(index);
        }
        params[siteUuids.size()] = workDate;

        jdbcTemplate.query(
            """
            SELECT work_site_uuid, worker_profile_uuid, assignment_area
            FROM public.work_schedule_assignment
            WHERE work_site_uuid IN (%s)
                AND work_date = ?
            ORDER BY created_at
            """.formatted(placeholders),
            resultSet -> {
                UUID siteUuid = resultSet.getObject("work_site_uuid", UUID.class);
                assignmentsBySiteUuid.computeIfAbsent(siteUuid, ignored -> new ArrayList<>())
                    .add(new ScheduleAssignmentResponse(
                        resultSet.getObject("worker_profile_uuid", UUID.class),
                        denormalizeAssignmentArea(resultSet.getString("assignment_area"))
                    ));
            },
            params
        );

        return assignmentsBySiteUuid;
    }

    private ScheduleTaskProjection mapTaskProjection(ResultSet resultSet) throws SQLException {
        return new ScheduleTaskProjection(
            resultSet.getObject("uuid", UUID.class),
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
