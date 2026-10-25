package com.laborflow.core.noshow.dao;

import com.laborflow.core.noshow.dto.NoShowDtos.*;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcNoShowDao implements NoShowDao {
    private final JdbcTemplate jdbc;
    public JdbcNoShowDao(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    @Override public void lockOffice(UUID office) {
        jdbc.query("SELECT pg_advisory_xact_lock(hashtextextended('laborflow.no-show:' || ?::text, 0))", rs -> { }, office.toString());
    }
    @Override public Optional<Assignment> lockAssignment(UUID office, UUID uuid) {
        return jdbc.query("""
            SELECT a.uuid, a.schedule_day_uuid, a.worker_profile_uuid, a.work_date, a.status,
                (SELECT to_jsonb(att)::text FROM public.worker_attendance_record att
                    WHERE att.assignment_uuid=a.uuid AND att.agency_owner_uuid=a.agency_owner_uuid
                        AND att.deleted_at IS NULL) AS attendance_data
            FROM public.work_schedule_assignment a
            JOIN public.work_schedule_day d ON d.uuid=a.schedule_day_uuid
            JOIN public.farm_work_site s ON s.uuid=a.work_site_uuid
            WHERE a.uuid=? AND a.agency_owner_uuid=? AND s.agency_owner_uuid=a.agency_owner_uuid
                AND a.deleted_at IS NULL AND d.deleted_at IS NULL AND s.deleted_at IS NULL
                AND d.status='ACTIVE'
            FOR UPDATE OF a
            """, (rs,n) -> new Assignment(rs.getObject("uuid", UUID.class), rs.getObject("schedule_day_uuid", UUID.class),
                rs.getObject("worker_profile_uuid", UUID.class), rs.getObject("work_date", LocalDate.class),
                rs.getString("status"), rs.getString("attendance_data")), uuid, office).stream().findFirst();
    }
    @Override public boolean ownsWorker(UUID office, UUID worker) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM public.labor_agency_worker_profile WHERE uuid=? AND agency_owner_uuid=?)", Boolean.class, worker, office));
    }
    @Override public Optional<Incident> find(UUID office, UUID uuid) { return query(office, " AND i.uuid=?", uuid).stream().findFirst(); }
    @Override public Optional<Incident> byAssignment(UUID office, UUID uuid) { return query(office, " AND i.original_assignment_uuid=?", uuid).stream().findFirst(); }
    @Override public List<Incident> list(UUID office, UUID worker, LocalDate date) {
        String where = "";
        List<Object> args = new ArrayList<>();
        if (worker != null) { where += " AND COALESCE(i.worker_profile_uuid,a.worker_profile_uuid)=?"; args.add(worker); }
        if (date != null) { where += " AND i.occurred_on=?"; args.add(date); }
        return query(office, where, args.toArray());
    }
    private List<Incident> query(UUID office, String filter, Object... values) {
        List<Object> args = new ArrayList<>(); args.add(office); args.addAll(List.of(values));
        return jdbc.query("""
            SELECT i.*, a.schedule_day_uuid, COALESCE(i.worker_profile_uuid,a.worker_profile_uuid) AS effective_worker_uuid,
                COALESCE(NULLIF(p.local_name,''),NULLIF(p.local_nickname,''),NULLIF(a.participant_display_name,''),'미등록 작업자') AS worker_name,
                COALESCE(NULLIF(fp.local_name,''),NULLIF(fp.local_nickname,''),NULLIF(fo.canonical_name,''),'') AS owner_name,
                COALESCE(s.site_name,'') AS site_name, s.work_description AS work_title,
                COALESCE(NULLIF(rp.local_name,''),NULLIF(rp.local_nickname,''),'') AS replacement_name
            FROM public.worker_no_show_incident i
            JOIN public.work_schedule_assignment a ON a.uuid=i.original_assignment_uuid AND a.agency_owner_uuid=i.agency_owner_uuid
            JOIN public.farm_work_site s ON s.uuid=a.work_site_uuid AND s.agency_owner_uuid=i.agency_owner_uuid
            JOIN public.farm_owner fo ON fo.uuid=s.owner_uuid
            LEFT JOIN public.labor_agency_worker_profile p ON p.uuid=COALESCE(i.worker_profile_uuid,a.worker_profile_uuid) AND p.agency_owner_uuid=i.agency_owner_uuid
            LEFT JOIN public.labor_agency_worker_profile rp ON rp.uuid=i.replacement_worker_profile_uuid AND rp.agency_owner_uuid=i.agency_owner_uuid
            LEFT JOIN public.labor_agency_farm_owner_profile fp ON fp.farm_owner_uuid=fo.uuid AND fp.agency_owner_uuid=i.agency_owner_uuid AND fp.deleted_at IS NULL AND fp.status='ACTIVE'
            WHERE i.agency_owner_uuid=? AND i.deleted_at IS NULL
            """ + filter + " ORDER BY i.occurred_on DESC, i.created_at DESC, i.uuid", (rs,n) -> new Incident(
                rs.getObject("uuid", UUID.class), rs.getObject("original_assignment_uuid", UUID.class), rs.getObject("schedule_day_uuid", UUID.class),
                rs.getObject("occurred_on", LocalDate.class), rs.getObject("effective_worker_uuid", UUID.class),
                rs.getString("worker_name"), rs.getString("owner_name"), rs.getString("site_name"), rs.getString("work_title"), rs.getString("status"), rs.getString("note"),
                rs.getObject("replacement_worker_profile_uuid", UUID.class), rs.getString("replacement_name"), rs.getObject("replacement_assignment_uuid", UUID.class),
                rs.getObject("created_at", OffsetDateTime.class), rs.getObject("updated_at", OffsetDateTime.class), rs.getObject("cancelled_at", OffsetDateTime.class),
                revisions(rs.getObject("uuid", UUID.class))), args.toArray());
    }
    private List<Revision> revisions(UUID uuid) {
        return jdbc.query("SELECT action,note,created_at,performed_by_account_uuid FROM public.worker_no_show_incident_revision WHERE incident_uuid=? ORDER BY created_at,uuid",
            (rs,n) -> new Revision(rs.getString("action"),rs.getString("note"),rs.getObject("created_at",OffsetDateTime.class),rs.getObject("performed_by_account_uuid",UUID.class)),uuid);
    }
    @Override public UUID create(UUID office, UUID account, Assignment a, String note) {
        return jdbc.queryForObject("""
            INSERT INTO public.worker_no_show_incident(agency_owner_uuid,worker_profile_uuid,original_assignment_uuid,occurred_on,status,note,
                reported_by_account_uuid,previous_assignment_status,previous_attendance_data,replacement_assignment_created)
            VALUES(?,?,?,?,'OPEN',?,?,?,?::jsonb,false)
            ON CONFLICT(original_assignment_uuid) WHERE deleted_at IS NULL DO UPDATE SET
                worker_profile_uuid=EXCLUDED.worker_profile_uuid, occurred_on=EXCLUDED.occurred_on,status='OPEN',note=EXCLUDED.note,
                reported_by_account_uuid=EXCLUDED.reported_by_account_uuid, previous_assignment_status=EXCLUDED.previous_assignment_status,
                previous_attendance_data=EXCLUDED.previous_attendance_data,replacement_worker_profile_uuid=NULL,replacement_assignment_uuid=NULL,
                replacement_assignment_created=false,resolved_by_account_uuid=NULL,cancelled_at=NULL,updated_at=now()
            RETURNING uuid
            """, UUID.class,office,a.workerProfileUuid(),a.uuid(),a.workDate(),note,account,a.status(),a.previousAttendanceData());
    }
    @Override public void markAbsent(UUID office, UUID account, Assignment a) {
        jdbc.update("""
            INSERT INTO public.worker_attendance_record(agency_owner_uuid,assignment_uuid,schedule_day_uuid,worker_profile_uuid,
                work_date,break_minutes,status,time_entry_type,confirmed_at,confirmed_by_account_uuid)
            VALUES(?,?,?,?,?,0,'ABSENT','UNKNOWN',now(),?)
            ON CONFLICT(assignment_uuid) WHERE deleted_at IS NULL DO UPDATE SET actual_start_at=NULL,actual_end_at=NULL,
                break_minutes=0,status='ABSENT',time_entry_type='UNKNOWN',confirmed_at=now(),confirmed_by_account_uuid=EXCLUDED.confirmed_by_account_uuid,updated_at=now()
            """,office,a.uuid(),a.scheduleDayUuid(),a.workerProfileUuid(),a.workDate(),account);
        jdbc.update("UPDATE public.work_schedule_assignment SET status='ABSENT',updated_at=now() WHERE uuid=? AND agency_owner_uuid=?",a.uuid(),office);
    }
    @Override public void updateNote(UUID office, UUID uuid, String note) {
        jdbc.update("UPDATE public.worker_no_show_incident SET note=?,updated_at=now() WHERE uuid=? AND agency_owner_uuid=? AND deleted_at IS NULL",note,uuid,office);
    }
    @Override public void revision(UUID account, UUID uuid, String action, String note) {
        if ("CANCELLED".equals(action)) {
            int updated = jdbc.update("""
                UPDATE public.worker_no_show_incident_revision SET note=?
                WHERE incident_uuid=? AND action='CANCELLED' AND created_at=transaction_timestamp() AND note IS NULL
                """,note,uuid);
            if (updated > 0) return;
        }
        jdbc.update("INSERT INTO public.worker_no_show_incident_revision(incident_uuid,action,note,performed_by_account_uuid) VALUES(?,?,?,?)",uuid,action,note,account);
    }
}
