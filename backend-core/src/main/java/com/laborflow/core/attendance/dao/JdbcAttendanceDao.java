package com.laborflow.core.attendance.dao;

import com.laborflow.core.attendance.dto.AttendanceRecordResponse;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcAttendanceDao implements AttendanceDao {
    private static final String SEOUL_TIME_ZONE = "Asia/Seoul";
    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("HH:mm");

    private final JdbcTemplate jdbcTemplate;

    public JdbcAttendanceDao(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public Optional<AccountContext> findAccountContext(String loginId) {
        return jdbcTemplate.query(
            """
            SELECT uuid, labor_agency_owner_uuid
            FROM public.app_account
            WHERE login_id = ?
                AND labor_agency_owner_uuid IS NOT NULL
                AND status = 'ACTIVE'
            """,
            (resultSet, rowNumber) -> new AccountContext(
                resultSet.getObject("uuid", UUID.class),
                resultSet.getObject("labor_agency_owner_uuid", UUID.class)
            ),
            loginId
        ).stream().findFirst();
    }

    @Override
    public Optional<AttendanceAssignmentContext> findAssignmentContext(
        UUID agencyOwnerUuid,
        UUID assignmentUuid
    ) {
        return jdbcTemplate.query(
            """
            SELECT
                a.work_date,
                COALESCE(a.planned_start_time, d.daily_start_time) AS planned_start_time,
                COALESCE(a.planned_end_time, d.daily_end_time) AS planned_end_time,
                (att.actual_start_at AT TIME ZONE 'Asia/Seoul')::time AS actual_start_time,
                (att.actual_end_at AT TIME ZONE 'Asia/Seoul')::time AS actual_end_time
            FROM public.work_schedule_assignment a
            JOIN public.work_schedule_day d ON d.uuid = a.schedule_day_uuid
            JOIN public.farm_work_site s ON s.uuid = a.work_site_uuid
            LEFT JOIN public.worker_attendance_record att
                ON att.assignment_uuid = a.uuid
                AND att.deleted_at IS NULL
            WHERE a.agency_owner_uuid = ?
                AND a.uuid = ?
                AND s.agency_owner_uuid = a.agency_owner_uuid
                AND a.deleted_at IS NULL
                AND d.deleted_at IS NULL
                AND s.deleted_at IS NULL
            """,
            (resultSet, rowNumber) -> new AttendanceAssignmentContext(
                resultSet.getObject("work_date", LocalDate.class),
                resultSet.getObject("planned_start_time", LocalTime.class),
                resultSet.getObject("planned_end_time", LocalTime.class),
                resultSet.getObject("actual_start_time", LocalTime.class),
                resultSet.getObject("actual_end_time", LocalTime.class)
            ),
            agencyOwnerUuid,
            assignmentUuid
        ).stream().findFirst();
    }

    @Override
    public List<AttendanceRecordResponse> findRecords(UUID agencyOwnerUuid, LocalDate workDate) {
        return jdbcTemplate.query(
            """
            SELECT
                a.uuid AS assignment_uuid,
                att.uuid AS attendance_uuid,
                a.schedule_day_uuid,
                a.worker_profile_uuid,
                lower(a.participant_type) AS participant_type,
                CASE
                    WHEN a.participant_type = 'GUEST' THEN
                        COALESCE(NULLIF(a.participant_display_name, ''), '미등록 작업자')
                    WHEN NULLIF(p.local_name, '') IS NOT NULL
                        AND NULLIF(p.local_nickname, '') IS NOT NULL THEN
                        p.local_name || ' - ' || p.local_nickname
                    ELSE COALESCE(
                        NULLIF(p.local_name, ''),
                        NULLIF(p.local_nickname, ''),
                        NULLIF(w.canonical_name, ''),
                        '이름 없음'
                    )
                END AS display_name,
                COALESCE(
                    NULLIF(a.participant_pickup_location, ''),
                    NULLIF(p.pickup_location, ''),
                    ''
                ) AS pickup_location,
                lower(a.assignment_area) AS assignment_area,
                a.work_date,
                COALESCE(
                    NULLIF(fp.local_name, ''),
                    NULLIF(fp.local_nickname, ''),
                    NULLIF(fp.local_business_name, ''),
                    NULLIF(fo.canonical_name, ''),
                    NULLIF(fo.canonical_business_name, ''),
                    ''
                ) AS owner_name,
                s.work_description AS work_title,
                COALESCE(s.site_name, '') AS site_name,
                s.farm_address,
                COALESCE(att_summary.note, '') AS task_note,
                COALESCE(a.planned_start_time, d.daily_start_time) AS planned_start_time,
                COALESCE(a.planned_end_time, d.daily_end_time) AS planned_end_time,
                (att.actual_start_at AT TIME ZONE 'Asia/Seoul')::time AS actual_start_time,
                (att.actual_end_at AT TIME ZONE 'Asia/Seoul')::time AS actual_end_time,
                COALESCE(att.break_minutes, 0) AS break_minutes,
                COALESCE(att.status, 'DRAFT') AS attendance_status,
                COALESCE(att.time_entry_type, 'UNKNOWN') AS time_entry_type,
                att.confirmed_at IS NOT NULL AS confirmed
            FROM public.work_schedule_assignment a
            JOIN public.work_schedule_day d ON d.uuid = a.schedule_day_uuid
            JOIN public.farm_work_site s ON s.uuid = a.work_site_uuid
            JOIN public.farm_owner fo ON fo.uuid = s.owner_uuid
            LEFT JOIN public.labor_agency_farm_owner_profile fp
                ON fp.agency_owner_uuid = a.agency_owner_uuid
                AND fp.farm_owner_uuid = s.owner_uuid
                AND fp.status = 'ACTIVE'
                AND fp.deleted_at IS NULL
            LEFT JOIN public.labor_agency_worker_profile p
                ON p.uuid = a.worker_profile_uuid
                AND p.agency_owner_uuid = a.agency_owner_uuid
            LEFT JOIN public.worker w ON w.uuid = p.worker_uuid
            LEFT JOIN public.worker_attendance_record att
                ON att.assignment_uuid = a.uuid
                AND att.agency_owner_uuid = a.agency_owner_uuid
                AND att.deleted_at IS NULL
            LEFT JOIN public.work_schedule_day_attendance_summary att_summary
                ON att_summary.schedule_day_uuid = a.schedule_day_uuid
                AND att_summary.agency_owner_uuid = a.agency_owner_uuid
                AND att_summary.deleted_at IS NULL
            WHERE a.agency_owner_uuid = ?
                AND a.work_date = ?
                AND s.agency_owner_uuid = a.agency_owner_uuid
                AND a.deleted_at IS NULL
                AND d.deleted_at IS NULL
                AND s.deleted_at IS NULL
                AND fo.deleted_at IS NULL
            ORDER BY
                d.daily_start_time NULLS LAST,
                s.work_description,
                a.assignment_area,
                a.created_at
            """,
            (resultSet, rowNumber) -> new AttendanceRecordResponse(
                resultSet.getObject("assignment_uuid", UUID.class),
                resultSet.getObject("attendance_uuid", UUID.class),
                resultSet.getObject("schedule_day_uuid", UUID.class),
                resultSet.getObject("worker_profile_uuid", UUID.class),
                resultSet.getString("participant_type"),
                resultSet.getString("display_name"),
                resultSet.getString("pickup_location"),
                resultSet.getString("assignment_area"),
                resultSet.getObject("work_date", LocalDate.class),
                resultSet.getString("owner_name"),
                resultSet.getString("work_title"),
                resultSet.getString("site_name"),
                resultSet.getString("farm_address"),
                resultSet.getString("task_note"),
                formatOptionalTime(resultSet.getObject("planned_start_time", LocalTime.class)),
                formatOptionalTime(resultSet.getObject("planned_end_time", LocalTime.class)),
                formatOptionalTime(resultSet.getObject("actual_start_time", LocalTime.class)),
                formatOptionalTime(resultSet.getObject("actual_end_time", LocalTime.class)),
                resultSet.getInt("break_minutes"),
                resultSet.getString("attendance_status"),
                resultSet.getString("time_entry_type"),
                resultSet.getBoolean("confirmed")
            ),
            agencyOwnerUuid,
            workDate
        );
    }

    @Override
    public int upsertTaskNote(
        UUID agencyOwnerUuid,
        UUID accountUuid,
        UUID scheduleDayUuid,
        String note
    ) {
        return jdbcTemplate.update(
            """
            INSERT INTO public.work_schedule_day_attendance_summary (
                schedule_day_uuid,
                agency_owner_uuid,
                note,
                updated_by_account_uuid
            )
            SELECT
                d.uuid,
                s.agency_owner_uuid,
                ?,
                ?
            FROM public.work_schedule_day d
            JOIN public.farm_work_site s ON s.uuid = d.work_site_uuid
            WHERE d.uuid = ?
                AND s.agency_owner_uuid = ?
                AND d.deleted_at IS NULL
                AND s.deleted_at IS NULL
            ON CONFLICT (schedule_day_uuid)
            DO UPDATE SET
                note = EXCLUDED.note,
                updated_by_account_uuid = EXCLUDED.updated_by_account_uuid,
                deleted_at = NULL,
                updated_at = now()
            """,
            note,
            accountUuid,
            scheduleDayUuid,
            agencyOwnerUuid
        );
    }

    @Override
    public int confirmPlanned(
        UUID agencyOwnerUuid,
        UUID accountUuid,
        String scope,
        UUID assignmentUuid,
        UUID scheduleDayUuid,
        LocalDate rangeStart,
        LocalDate rangeEnd
    ) {
        ScopeCondition scopeCondition = createScopeCondition(
            scope,
            assignmentUuid,
            scheduleDayUuid,
            rangeStart,
            rangeEnd
        );
        List<Object> parameters = new ArrayList<>();
        parameters.add(SEOUL_TIME_ZONE);
        parameters.add(SEOUL_TIME_ZONE);
        parameters.add(accountUuid);
        parameters.add(agencyOwnerUuid);
        parameters.addAll(scopeCondition.parameters());

        int confirmedCount = jdbcTemplate.update(
            """
            INSERT INTO public.worker_attendance_record (
                agency_owner_uuid,
                assignment_uuid,
                schedule_day_uuid,
                worker_profile_uuid,
                work_date,
                actual_start_at,
                actual_end_at,
                break_minutes,
                status,
                time_entry_type,
                confirmed_at,
                confirmed_by_account_uuid
            )
            SELECT
                a.agency_owner_uuid,
                a.uuid,
                a.schedule_day_uuid,
                a.worker_profile_uuid,
                a.work_date,
                CASE
                    WHEN COALESCE(a.planned_start_time, d.daily_start_time) IS NULL THEN NULL
                    ELSE (a.work_date + COALESCE(a.planned_start_time, d.daily_start_time)) AT TIME ZONE ?
                END,
                CASE
                    WHEN COALESCE(a.planned_end_time, d.daily_end_time) IS NULL THEN NULL
                    ELSE (a.work_date + COALESCE(a.planned_end_time, d.daily_end_time)) AT TIME ZONE ?
                END,
                60,
                'WORKED',
                CASE
                    WHEN COALESCE(a.planned_start_time, d.daily_start_time) IS NOT NULL
                        OR COALESCE(a.planned_end_time, d.daily_end_time) IS NOT NULL
                        THEN 'PLANNED'
                    ELSE 'UNKNOWN'
                END,
                now(),
                ?
            FROM public.work_schedule_assignment a
            JOIN public.work_schedule_day d ON d.uuid = a.schedule_day_uuid
            JOIN public.farm_work_site s ON s.uuid = a.work_site_uuid
            WHERE a.agency_owner_uuid = ?
                AND s.agency_owner_uuid = a.agency_owner_uuid
                AND a.deleted_at IS NULL
                AND d.deleted_at IS NULL
                AND s.deleted_at IS NULL
                AND a.status <> 'CANCELLED'
                AND a.work_date <= (now() AT TIME ZONE 'Asia/Seoul')::date
                AND %s
            ON CONFLICT (assignment_uuid) WHERE deleted_at IS NULL
            DO UPDATE SET
                worker_profile_uuid = EXCLUDED.worker_profile_uuid,
                work_date = EXCLUDED.work_date,
                actual_start_at = EXCLUDED.actual_start_at,
                actual_end_at = EXCLUDED.actual_end_at,
                break_minutes = EXCLUDED.break_minutes,
                status = 'WORKED',
                time_entry_type = EXCLUDED.time_entry_type,
                confirmed_at = EXCLUDED.confirmed_at,
                confirmed_by_account_uuid = EXCLUDED.confirmed_by_account_uuid,
                updated_at = now()
            WHERE worker_attendance_record.status = 'DRAFT'
                OR worker_attendance_record.confirmed_at IS NULL
            """.formatted(scopeCondition.sql()),
            parameters.toArray()
        );

        List<Object> assignmentParameters = new ArrayList<>();
        assignmentParameters.add(agencyOwnerUuid);
        assignmentParameters.addAll(scopeCondition.parameters());
        jdbcTemplate.update(
            """
            UPDATE public.work_schedule_assignment a
            SET status = 'WORKED',
                updated_at = now()
            FROM public.work_schedule_day d
            WHERE d.uuid = a.schedule_day_uuid
                AND a.agency_owner_uuid = ?
                AND a.deleted_at IS NULL
                AND d.deleted_at IS NULL
                AND a.work_date <= (now() AT TIME ZONE 'Asia/Seoul')::date
                AND NOT EXISTS (
                    SELECT 1
                    FROM public.worker_attendance_record att
                    WHERE att.assignment_uuid = a.uuid
                        AND att.deleted_at IS NULL
                        AND att.status <> 'DRAFT'
                        AND att.confirmed_at IS NOT NULL
                )
                AND %s
            """.formatted(scopeCondition.sql()),
            assignmentParameters.toArray()
        );

        return confirmedCount;
    }

    @Override
    public void refreshWorkerActivitySummary(UUID agencyOwnerUuid) {
        jdbcTemplate.update(
            """
            INSERT INTO public.worker_activity_summary (
                agency_owner_uuid,
                worker_profile_uuid,
                last_assigned_date,
                last_worked_date,
                total_work_days,
                updated_at
            )
            SELECT
                p.agency_owner_uuid,
                p.uuid,
                MAX(a.work_date) FILTER (
                    WHERE a.deleted_at IS NULL AND a.status <> 'CANCELLED'
                ),
                MAX(att.work_date) FILTER (
                    WHERE att.deleted_at IS NULL AND att.status = 'WORKED'
                ),
                COUNT(DISTINCT att.work_date) FILTER (
                    WHERE att.deleted_at IS NULL AND att.status = 'WORKED'
                )::integer,
                now()
            FROM public.labor_agency_worker_profile p
            LEFT JOIN public.work_schedule_assignment a
                ON a.worker_profile_uuid = p.uuid
                AND a.agency_owner_uuid = p.agency_owner_uuid
            LEFT JOIN public.worker_attendance_record att
                ON att.assignment_uuid = a.uuid
                AND att.agency_owner_uuid = p.agency_owner_uuid
            WHERE p.agency_owner_uuid = ?
                AND p.deleted_at IS NULL
            GROUP BY p.agency_owner_uuid, p.uuid
            ON CONFLICT (agency_owner_uuid, worker_profile_uuid)
            DO UPDATE SET
                last_assigned_date = EXCLUDED.last_assigned_date,
                last_worked_date = EXCLUDED.last_worked_date,
                total_work_days = EXCLUDED.total_work_days,
                updated_at = now()
            """,
            agencyOwnerUuid
        );
    }

    @Override
    public void upsertRecord(
        UUID agencyOwnerUuid,
        UUID accountUuid,
        UUID assignmentUuid,
        OffsetDateTime actualStartAt,
        OffsetDateTime actualEndAt,
        int breakMinutes,
        String status,
        String timeEntryType
    ) {
        boolean confirmed = !"DRAFT".equals(status);
        int updatedRows = jdbcTemplate.update(
            """
            INSERT INTO public.worker_attendance_record (
                agency_owner_uuid,
                assignment_uuid,
                schedule_day_uuid,
                worker_profile_uuid,
                work_date,
                actual_start_at,
                actual_end_at,
                break_minutes,
                status,
                time_entry_type,
                confirmed_at,
                confirmed_by_account_uuid
            )
            SELECT
                a.agency_owner_uuid,
                a.uuid,
                a.schedule_day_uuid,
                a.worker_profile_uuid,
                a.work_date,
                ?,
                ?,
                ?,
                ?,
                ?,
                CASE WHEN ? THEN now() ELSE NULL END,
                CASE WHEN ? THEN ? ELSE NULL END
            FROM public.work_schedule_assignment a
            JOIN public.work_schedule_day d ON d.uuid = a.schedule_day_uuid
            JOIN public.farm_work_site s ON s.uuid = a.work_site_uuid
            WHERE a.agency_owner_uuid = ?
                AND a.uuid = ?
                AND s.agency_owner_uuid = a.agency_owner_uuid
                AND a.deleted_at IS NULL
                AND d.deleted_at IS NULL
                AND s.deleted_at IS NULL
            ON CONFLICT (assignment_uuid) WHERE deleted_at IS NULL
            DO UPDATE SET
                worker_profile_uuid = EXCLUDED.worker_profile_uuid,
                work_date = EXCLUDED.work_date,
                actual_start_at = EXCLUDED.actual_start_at,
                actual_end_at = EXCLUDED.actual_end_at,
                break_minutes = EXCLUDED.break_minutes,
                status = EXCLUDED.status,
                time_entry_type = EXCLUDED.time_entry_type,
                confirmed_at = EXCLUDED.confirmed_at,
                confirmed_by_account_uuid = EXCLUDED.confirmed_by_account_uuid,
                updated_at = now()
            """,
            actualStartAt,
            actualEndAt,
            breakMinutes,
            status,
            timeEntryType,
            confirmed,
            confirmed,
            accountUuid,
            agencyOwnerUuid,
            assignmentUuid
        );

        if (updatedRows == 0) {
            throw new IllegalArgumentException("Attendance assignment was not found.");
        }

        jdbcTemplate.update(
            """
            UPDATE public.work_schedule_assignment
            SET status = CASE ?
                    WHEN 'WORKED' THEN 'WORKED'
                    WHEN 'ABSENT' THEN 'ABSENT'
                    WHEN 'CANCELLED' THEN 'CANCELLED'
                    ELSE 'PLANNED'
                END,
                updated_at = now()
            WHERE uuid = ?
                AND agency_owner_uuid = ?
                AND deleted_at IS NULL
            """,
            status,
            assignmentUuid,
            agencyOwnerUuid
        );
    }

    private ScopeCondition createScopeCondition(
        String scope,
        UUID assignmentUuid,
        UUID scheduleDayUuid,
        LocalDate rangeStart,
        LocalDate rangeEnd
    ) {
        return switch (scope) {
            case "ASSIGNMENT" -> new ScopeCondition("a.uuid = ?", List.of(assignmentUuid));
            case "SCHEDULE_DAY" -> new ScopeCondition("a.schedule_day_uuid = ?", List.of(scheduleDayUuid));
            case "DATE", "WEEK" -> new ScopeCondition(
                "a.work_date BETWEEN ? AND ?",
                List.of(rangeStart, rangeEnd)
            );
            default -> throw new IllegalArgumentException("Attendance confirmation scope is invalid.");
        };
    }

    private String formatOptionalTime(LocalTime value) {
        return value == null ? "" : TIME_FORMATTER.format(value);
    }

    private record ScopeCondition(String sql, List<Object> parameters) {
    }
}
