package com.laborflow.core.journal.dao;

import com.laborflow.core.journal.dto.SalesJournalResponse;
import com.laborflow.core.journal.dto.WorkJournalAttendanceResponse;
import com.laborflow.core.journal.dto.WorkJournalDetailResponse;
import com.laborflow.core.journal.dto.WorkJournalSummaryResponse;
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
public class JdbcJournalDao implements JournalDao {
    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("HH:mm");

    private final JdbcTemplate jdbcTemplate;

    public JdbcJournalDao(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public Optional<AccountContext> findAccountContext(String loginId) {
        return jdbcTemplate.query(
            """
            SELECT uuid, labor_agency_owner_uuid
            FROM public.app_account
            WHERE lower(login_id) = lower(?)
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
    public List<SalesJournalResponse> findSalesJournals(
        UUID agencyOwnerUuid,
        LocalDate fromDate,
        LocalDate toDate,
        String query
    ) {
        StringBuilder sql = new StringBuilder("""
            SELECT uuid, activity_at, content, created_at, updated_at
            FROM public.sales_journal
            WHERE agency_owner_uuid = ?
                AND deleted_at IS NULL
            """);
        List<Object> parameters = new ArrayList<>();
        parameters.add(agencyOwnerUuid);
        if (fromDate != null) {
            sql.append(" AND (activity_at AT TIME ZONE 'Asia/Seoul')::date >= ?");
            parameters.add(fromDate);
        }
        if (toDate != null) {
            sql.append(" AND (activity_at AT TIME ZONE 'Asia/Seoul')::date <= ?");
            parameters.add(toDate);
        }
        if (query != null) {
            sql.append(" AND content ILIKE ? ESCAPE '\\'");
            parameters.add(toContainsPattern(query));
        }
        sql.append(" ORDER BY activity_at DESC, created_at DESC, uuid");

        return jdbcTemplate.query(sql.toString(), this::mapSalesJournal, parameters.toArray());
    }

    @Override
    public Optional<SalesJournalResponse> findSalesJournal(UUID agencyOwnerUuid, UUID journalUuid) {
        return jdbcTemplate.query(
            """
            SELECT uuid, activity_at, content, created_at, updated_at
            FROM public.sales_journal
            WHERE agency_owner_uuid = ?
                AND uuid = ?
                AND deleted_at IS NULL
            """,
            this::mapSalesJournal,
            agencyOwnerUuid,
            journalUuid
        ).stream().findFirst();
    }

    @Override
    public SalesJournalResponse insertSalesJournal(
        UUID agencyOwnerUuid,
        UUID accountUuid,
        OffsetDateTime activityAt,
        String content
    ) {
        return jdbcTemplate.queryForObject(
            """
            INSERT INTO public.sales_journal (
                agency_owner_uuid,
                activity_at,
                content,
                created_by_account_uuid,
                updated_by_account_uuid
            )
            VALUES (?, ?, ?, ?, ?)
            RETURNING uuid, activity_at, content, created_at, updated_at
            """,
            this::mapSalesJournal,
            agencyOwnerUuid,
            activityAt,
            content,
            accountUuid,
            accountUuid
        );
    }

    @Override
    public int updateSalesJournal(
        UUID agencyOwnerUuid,
        UUID accountUuid,
        UUID journalUuid,
        OffsetDateTime activityAt,
        String content
    ) {
        return jdbcTemplate.update(
            """
            UPDATE public.sales_journal
            SET activity_at = ?,
                content = ?,
                updated_by_account_uuid = ?
            WHERE agency_owner_uuid = ?
                AND uuid = ?
                AND deleted_at IS NULL
            """,
            activityAt,
            content,
            accountUuid,
            agencyOwnerUuid,
            journalUuid
        );
    }

    @Override
    public int softDeleteSalesJournal(UUID agencyOwnerUuid, UUID accountUuid, UUID journalUuid) {
        return jdbcTemplate.update(
            """
            UPDATE public.sales_journal
            SET deleted_at = now(),
                updated_by_account_uuid = ?
            WHERE agency_owner_uuid = ?
                AND uuid = ?
                AND deleted_at IS NULL
            """,
            accountUuid,
            agencyOwnerUuid,
            journalUuid
        );
    }

    @Override
    public List<WorkJournalSummaryResponse> findWorkJournals(
        UUID agencyOwnerUuid,
        LocalDate fromDate,
        LocalDate toDate,
        String clientQuery
    ) {
        StringBuilder sql = new StringBuilder("""
            SELECT
                journal.uuid AS journal_uuid,
                day.uuid AS schedule_day_uuid,
                day.work_date,
                COALESCE(
                    NULLIF(profile.local_name, ''),
                    NULLIF(profile.local_nickname, ''),
                    NULLIF(profile.local_business_name, ''),
                    NULLIF(owner.canonical_name, ''),
                    NULLIF(owner.canonical_business_name, ''),
                    ''
                ) AS owner_name,
                COALESCE(site.site_name, '') AS site_name,
                COALESCE(site.farm_address, '') AS address,
                COALESCE(site.work_description, '') AS work_title,
                COALESCE(journal.memo, '') AS memo,
                journal.updated_at
            FROM public.work_journal journal
            JOIN public.work_schedule_day day ON day.uuid = journal.schedule_day_uuid
            JOIN public.farm_work_site site ON site.uuid = day.work_site_uuid
            JOIN public.farm_owner owner ON owner.uuid = site.owner_uuid
            LEFT JOIN public.labor_agency_farm_owner_profile profile
                ON profile.agency_owner_uuid = journal.agency_owner_uuid
                AND profile.farm_owner_uuid = site.owner_uuid
                AND profile.status = 'ACTIVE'
                AND profile.deleted_at IS NULL
            WHERE journal.agency_owner_uuid = ?
                AND site.agency_owner_uuid = journal.agency_owner_uuid
                AND journal.deleted_at IS NULL
                AND day.deleted_at IS NULL
                AND site.deleted_at IS NULL
            """);
        List<Object> parameters = new ArrayList<>();
        parameters.add(agencyOwnerUuid);
        if (fromDate != null) {
            sql.append(" AND day.work_date >= ?");
            parameters.add(fromDate);
        }
        if (toDate != null) {
            sql.append(" AND day.work_date <= ?");
            parameters.add(toDate);
        }
        if (clientQuery != null) {
            sql.append("""
                 AND COALESCE(
                     NULLIF(profile.local_name, ''),
                     NULLIF(profile.local_nickname, ''),
                     NULLIF(profile.local_business_name, ''),
                     NULLIF(owner.canonical_name, ''),
                     NULLIF(owner.canonical_business_name, ''),
                     ''
                 ) ILIKE ? ESCAPE '\\'
                """);
            parameters.add(toContainsPattern(clientQuery));
        }
        sql.append(" ORDER BY day.work_date DESC, journal.updated_at DESC, journal.uuid");

        return jdbcTemplate.query(
            sql.toString(),
            (resultSet, rowNumber) -> new WorkJournalSummaryResponse(
                resultSet.getObject("journal_uuid", UUID.class),
                resultSet.getObject("schedule_day_uuid", UUID.class),
                resultSet.getObject("work_date", LocalDate.class),
                resultSet.getString("owner_name"),
                resultSet.getString("site_name"),
                resultSet.getString("address"),
                resultSet.getString("work_title"),
                resultSet.getString("memo"),
                resultSet.getObject("updated_at", OffsetDateTime.class)
            ),
            parameters.toArray()
        );
    }

    @Override
    public Optional<WorkJournalDetailResponse> findWorkJournalDetail(
        UUID agencyOwnerUuid,
        UUID scheduleDayUuid
    ) {
        return jdbcTemplate.query(
            """
            SELECT
                journal.uuid AS journal_uuid,
                day.uuid AS schedule_day_uuid,
                day.work_date,
                COALESCE(
                    NULLIF(profile.local_name, ''),
                    NULLIF(profile.local_nickname, ''),
                    NULLIF(profile.local_business_name, ''),
                    NULLIF(owner.canonical_name, ''),
                    NULLIF(owner.canonical_business_name, ''),
                    ''
                ) AS owner_name,
                COALESCE(site.site_name, '') AS site_name,
                COALESCE(site.farm_address, '') AS address,
                COALESCE(site.work_description, '') AS work_title,
                COALESCE(journal.memo, '') AS memo,
                journal.created_at,
                journal.updated_at
            FROM public.work_schedule_day day
            JOIN public.farm_work_site site ON site.uuid = day.work_site_uuid
            JOIN public.farm_owner owner ON owner.uuid = site.owner_uuid
            LEFT JOIN public.labor_agency_farm_owner_profile profile
                ON profile.agency_owner_uuid = site.agency_owner_uuid
                AND profile.farm_owner_uuid = site.owner_uuid
                AND profile.status = 'ACTIVE'
                AND profile.deleted_at IS NULL
            LEFT JOIN public.work_journal journal
                ON journal.schedule_day_uuid = day.uuid
                AND journal.agency_owner_uuid = site.agency_owner_uuid
                AND journal.deleted_at IS NULL
            WHERE site.agency_owner_uuid = ?
                AND day.uuid = ?
                AND day.status = 'ACTIVE'
                AND day.deleted_at IS NULL
                AND site.status = 'ACTIVE'
                AND site.deleted_at IS NULL
                AND owner.deleted_at IS NULL
            """,
            (resultSet, rowNumber) -> new WorkJournalDetailResponse(
                resultSet.getObject("journal_uuid", UUID.class),
                resultSet.getObject("schedule_day_uuid", UUID.class),
                resultSet.getObject("work_date", LocalDate.class),
                resultSet.getString("owner_name"),
                resultSet.getString("site_name"),
                resultSet.getString("address"),
                resultSet.getString("work_title"),
                resultSet.getString("memo"),
                resultSet.getObject("created_at", OffsetDateTime.class),
                resultSet.getObject("updated_at", OffsetDateTime.class),
                0,
                List.of()
            ),
            agencyOwnerUuid,
            scheduleDayUuid
        ).stream().findFirst();
    }

    @Override
    public List<WorkJournalAttendanceResponse> findWorkJournalAttendance(
        UUID agencyOwnerUuid,
        UUID scheduleDayUuid
    ) {
        return jdbcTemplate.query(
            """
            SELECT
                CASE
                    WHEN assignment.participant_type = 'GUEST' THEN
                        COALESCE(NULLIF(assignment.participant_display_name, ''), '미등록 작업자')
                    WHEN NULLIF(worker_profile.local_name, '') IS NOT NULL
                        AND NULLIF(worker_profile.local_nickname, '') IS NOT NULL THEN
                        worker_profile.local_name || ' - ' || worker_profile.local_nickname
                    ELSE COALESCE(
                        NULLIF(worker_profile.local_name, ''),
                        NULLIF(worker_profile.local_nickname, ''),
                        NULLIF(worker.canonical_name, ''),
                        '이름 없음'
                    )
                END AS display_name,
                lower(assignment.participant_type) AS participant_type,
                assignment.worker_count,
                CASE WHEN attendance.uuid IS NULL THEN 'UNRECORDED' ELSE attendance.status END AS status,
                (attendance.actual_start_at AT TIME ZONE 'Asia/Seoul')::time AS actual_start_time,
                (attendance.actual_end_at AT TIME ZONE 'Asia/Seoul')::time AS actual_end_time,
                CASE WHEN attendance.uuid IS NULL THEN NULL ELSE attendance.break_minutes END AS break_minutes
            FROM public.work_schedule_assignment assignment
            JOIN public.work_schedule_day day ON day.uuid = assignment.schedule_day_uuid
            JOIN public.farm_work_site site ON site.uuid = day.work_site_uuid
            LEFT JOIN public.labor_agency_worker_profile worker_profile
                ON worker_profile.uuid = assignment.worker_profile_uuid
                AND worker_profile.agency_owner_uuid = assignment.agency_owner_uuid
            LEFT JOIN public.worker worker ON worker.uuid = worker_profile.worker_uuid
            LEFT JOIN public.worker_attendance_record attendance
                ON attendance.assignment_uuid = assignment.uuid
                AND attendance.agency_owner_uuid = assignment.agency_owner_uuid
                AND attendance.deleted_at IS NULL
            WHERE assignment.agency_owner_uuid = ?
                AND site.agency_owner_uuid = assignment.agency_owner_uuid
                AND assignment.schedule_day_uuid = ?
                AND assignment.deleted_at IS NULL
                AND day.deleted_at IS NULL
                AND site.deleted_at IS NULL
            ORDER BY assignment.assignment_area, assignment.created_at, assignment.uuid
            """,
            (resultSet, rowNumber) -> new WorkJournalAttendanceResponse(
                resultSet.getString("display_name"),
                resultSet.getString("participant_type"),
                resultSet.getInt("worker_count"),
                resultSet.getString("status"),
                formatOptionalTime(resultSet.getObject("actual_start_time", LocalTime.class)),
                formatOptionalTime(resultSet.getObject("actual_end_time", LocalTime.class)),
                resultSet.getObject("break_minutes", Integer.class)
            ),
            agencyOwnerUuid,
            scheduleDayUuid
        );
    }

    @Override
    public int upsertWorkJournal(
        UUID agencyOwnerUuid,
        UUID accountUuid,
        UUID scheduleDayUuid,
        String memo
    ) {
        return jdbcTemplate.update(
            """
            INSERT INTO public.work_journal (
                agency_owner_uuid,
                schedule_day_uuid,
                memo,
                created_by_account_uuid,
                updated_by_account_uuid
            )
            SELECT site.agency_owner_uuid, day.uuid, ?, ?, ?
            FROM public.work_schedule_day day
            JOIN public.farm_work_site site ON site.uuid = day.work_site_uuid
            WHERE site.agency_owner_uuid = ?
                AND day.uuid = ?
                AND day.status = 'ACTIVE'
                AND day.deleted_at IS NULL
                AND site.status = 'ACTIVE'
                AND site.deleted_at IS NULL
            ON CONFLICT (schedule_day_uuid) WHERE deleted_at IS NULL
            DO UPDATE SET
                memo = EXCLUDED.memo,
                updated_by_account_uuid = EXCLUDED.updated_by_account_uuid
            WHERE public.work_journal.agency_owner_uuid = EXCLUDED.agency_owner_uuid
            """,
            memo,
            accountUuid,
            accountUuid,
            agencyOwnerUuid,
            scheduleDayUuid
        );
    }

    @Override
    public int softDeleteWorkJournal(UUID agencyOwnerUuid, UUID accountUuid, UUID scheduleDayUuid) {
        return jdbcTemplate.update(
            """
            UPDATE public.work_journal
            SET deleted_at = now(),
                updated_by_account_uuid = ?
            WHERE agency_owner_uuid = ?
                AND schedule_day_uuid = ?
                AND deleted_at IS NULL
            """,
            accountUuid,
            agencyOwnerUuid,
            scheduleDayUuid
        );
    }

    private SalesJournalResponse mapSalesJournal(java.sql.ResultSet resultSet, int rowNumber)
        throws java.sql.SQLException {
        return new SalesJournalResponse(
            resultSet.getObject("uuid", UUID.class),
            resultSet.getObject("activity_at", OffsetDateTime.class),
            resultSet.getString("content"),
            resultSet.getObject("created_at", OffsetDateTime.class),
            resultSet.getObject("updated_at", OffsetDateTime.class)
        );
    }

    private String toContainsPattern(String value) {
        return "%" + value
            .replace("\\", "\\\\")
            .replace("%", "\\%")
            .replace("_", "\\_") + "%";
    }

    private String formatOptionalTime(LocalTime time) {
        return time == null ? null : time.format(TIME_FORMATTER);
    }
}
