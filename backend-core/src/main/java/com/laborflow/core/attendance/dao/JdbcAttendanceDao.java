package com.laborflow.core.attendance.dao;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcAttendanceDao implements AttendanceDao {
    private static final String SEOUL_TIME_ZONE = "Asia/Seoul";

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
                status = 'WORKED',
                time_entry_type = EXCLUDED.time_entry_type,
                confirmed_at = EXCLUDED.confirmed_at,
                confirmed_by_account_uuid = EXCLUDED.confirmed_by_account_uuid,
                updated_at = now()
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

    private record ScopeCondition(String sql, List<Object> parameters) {
    }
}
