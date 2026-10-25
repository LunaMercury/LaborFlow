package com.laborflow.core.finance.dao;

import static com.laborflow.core.finance.application.FinanceException.conflict;
import static com.laborflow.core.finance.application.FinanceRules.*;
import com.laborflow.core.finance.application.FinanceJson;
import com.laborflow.core.finance.dto.FinanceDtos.*;
import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcFinanceDao implements FinanceDao {
    private final JdbcTemplate jdbc;
    public JdbcFinanceDao(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Override public Optional<Account> account(String loginId) {
        return jdbc.query("""
            SELECT uuid, labor_agency_owner_uuid FROM public.app_account
            WHERE lower(login_id)=lower(?) AND status='ACTIVE' AND labor_agency_owner_uuid IS NOT NULL
            """, (r,n) -> new Account(uuid(r,"uuid"),uuid(r,"labor_agency_owner_uuid")), loginId).stream().findFirst();
    }
    @Override public void lockOffice(UUID office) {
        jdbc.query("SELECT pg_advisory_xact_lock(hashtextextended('finance:' || ?::text, 0))", r -> { }, office.toString());
    }
    @Override public Optional<Source> source(UUID office, UUID day) {
        var headers = jdbc.query("""
            SELECT d.uuid, d.work_date, s.uuid site_uuid, s.owner_uuid client_uuid,
                fp.uuid client_profile_uuid,
                COALESCE(NULLIF(fp.local_name,''),NULLIF(fp.local_nickname,''),NULLIF(fp.local_business_name,''),
                    NULLIF(fo.canonical_name,''),fo.canonical_business_name,'') client_name,
                COALESCE(s.site_name,'') site_name, COALESCE(s.work_description,'') work_title,
                (d.status='ACTIVE' AND d.deleted_at IS NULL AND s.status='ACTIVE' AND s.deleted_at IS NULL) active
            FROM public.work_schedule_day d
            JOIN public.farm_work_site s ON s.uuid=d.work_site_uuid
            JOIN public.farm_owner fo ON fo.uuid=s.owner_uuid
            LEFT JOIN public.finance_work fw ON fw.schedule_day_uuid=d.uuid AND fw.agency_owner_uuid=s.agency_owner_uuid
            LEFT JOIN LATERAL (
                SELECT p.* FROM public.labor_agency_farm_owner_profile p
                WHERE p.agency_owner_uuid=s.agency_owner_uuid AND p.farm_owner_uuid=s.owner_uuid
                    AND ((fw.uuid IS NOT NULL AND p.uuid=fw.client_profile_uuid)
                        OR (fw.uuid IS NULL AND p.status='ACTIVE' AND p.deleted_at IS NULL))
                ORDER BY p.uuid LIMIT 1
            ) fp ON true
            WHERE s.agency_owner_uuid=? AND d.uuid=?
            """, (r,n) -> new Source(day,r.getObject("work_date",LocalDate.class),uuid(r,"client_uuid"),
                uuid(r,"client_profile_uuid"),r.getString("client_name"),uuid(r,"site_uuid"),r.getString("site_name"),
                r.getString("work_title"),r.getBoolean("active"),null,false,List.of()), office,day);
        if (headers.isEmpty()) return Optional.empty();
        Source h = headers.getFirst();
        var assignments = jdbc.query("""
            SELECT a.uuid, a.worker_profile_uuid,
                CASE WHEN a.participant_type='GUEST' THEN 'guest:'||a.uuid::text ELSE a.worker_profile_uuid::text END payee_key,
                CASE WHEN a.participant_type='GUEST' THEN COALESCE(NULLIF(a.participant_display_name,''),'Guest')
                    ELSE COALESCE(NULLIF(p.local_name,''),NULLIF(p.local_nickname,''),w.canonical_name,'Worker') END display_name,
                a.status assignment_status, COALESCE(att.status,'DRAFT') attendance_status,
                (att.confirmed_at IS NOT NULL) confirmed, att.actual_start_at, att.actual_end_at,
                att.break_minutes, a.worker_count, a.work_date, a.work_site_uuid,
                att.work_date attendance_work_date, att.schedule_day_uuid attendance_day_uuid,
                att.worker_profile_uuid attendance_worker_profile_uuid
            FROM public.work_schedule_assignment a
            JOIN public.work_schedule_day d ON d.uuid=a.schedule_day_uuid
            JOIN public.farm_work_site s ON s.uuid=d.work_site_uuid AND s.agency_owner_uuid=a.agency_owner_uuid
            LEFT JOIN public.labor_agency_worker_profile p ON p.uuid=a.worker_profile_uuid AND p.agency_owner_uuid=a.agency_owner_uuid
            LEFT JOIN public.worker w ON w.uuid=p.worker_uuid
            LEFT JOIN public.worker_attendance_record att ON att.assignment_uuid=a.uuid
                AND att.agency_owner_uuid=a.agency_owner_uuid AND att.deleted_at IS NULL
            WHERE a.agency_owner_uuid=? AND a.schedule_day_uuid=? AND a.deleted_at IS NULL
            ORDER BY a.uuid
            """, (r,n) -> {
                boolean consistent = h.workDate().equals(r.getObject("work_date",LocalDate.class))
                    && h.siteUuid().equals(uuid(r,"work_site_uuid"))
                    && (r.getObject("attendance_work_date") == null || h.workDate().equals(r.getObject("attendance_work_date",LocalDate.class)))
                    && (uuid(r,"attendance_day_uuid") == null || day.equals(uuid(r,"attendance_day_uuid")))
                    && java.util.Objects.equals(uuid(r,"worker_profile_uuid"),uuid(r,"attendance_worker_profile_uuid"));
                return new Assignment(uuid(r,"uuid"),uuid(r,"worker_profile_uuid"),r.getString("payee_key"),
                    r.getString("display_name"),r.getString("assignment_status"),r.getString("attendance_status"),
                    r.getBoolean("confirmed") && consistent,r.getObject("actual_start_at",OffsetDateTime.class),
                    r.getObject("actual_end_at",OffsetDateTime.class),r.getObject("break_minutes",Integer.class),r.getInt("worker_count"));
            }, office,day);
        // Deliberately omit updated_at, confirmation timestamps, notes and mutable person names.
        String fingerprint = sourceFingerprint(new Source(day,h.workDate(),h.clientUuid(),h.clientProfileUuid(),h.clientName(),
            h.siteUuid(),h.siteName(),h.workTitle(),h.active(),null,false,assignments));
        return Optional.of(new Source(day,h.workDate(),h.clientUuid(),h.clientProfileUuid(),h.clientName(),h.siteUuid(),
            h.siteName(),h.workTitle(),h.active(),fingerprint,ready(assignments),List.copyOf(assignments)));
    }
    @Override public List<UUID> sourceDays(UUID office, LocalDate from, LocalDate to) {
        return jdbc.query("""
            SELECT d.uuid FROM public.work_schedule_day d JOIN public.farm_work_site s ON s.uuid=d.work_site_uuid
            WHERE s.agency_owner_uuid=? AND d.status='ACTIVE' AND d.deleted_at IS NULL
                AND s.status='ACTIVE' AND s.deleted_at IS NULL
                AND (?::date IS NULL OR d.work_date>=?) AND (?::date IS NULL OR d.work_date<=?) ORDER BY d.work_date,d.uuid
            """, (r,n) -> uuid(r,"uuid"), office,from,from,to,to);
    }
    @Override public Optional<StoredWork> work(UUID office, UUID id) {
        return jdbc.query("SELECT * FROM public.finance_work WHERE agency_owner_uuid=? AND uuid=?",this::mapWork,office,id).stream().findFirst();
    }
    @Override public Optional<StoredWork> workByDay(UUID office, UUID day) {
        return jdbc.query("SELECT * FROM public.finance_work WHERE agency_owner_uuid=? AND schedule_day_uuid=?",this::mapWork,office,day).stream().findFirst();
    }
    @Override public List<StoredWork> works(UUID office, LocalDate from, LocalDate to) {
        return jdbc.query("""
            SELECT * FROM public.finance_work WHERE agency_owner_uuid=?
                AND (?::date IS NULL OR work_date>=?) AND (?::date IS NULL OR work_date<=?) ORDER BY work_date,uuid
            """,this::mapWork,office,from,from,to,to);
    }
    private StoredWork mapWork(ResultSet r, int n) throws SQLException {
        return new StoredWork(uuid(r,"uuid"),uuid(r,"schedule_day_uuid"),r.getLong("version"),
            r.getString("status"),r.getBoolean("ever_confirmed"),FinanceJson.read(r.getString("snapshot"),Snapshot.class));
    }
    @Override public List<Revision> revisions(UUID office, UUID work) {
        return jdbc.query("""
            SELECT r.* FROM public.finance_work_revision r JOIN public.finance_work w ON w.uuid=r.work_uuid
            WHERE w.agency_owner_uuid=? AND w.uuid=? ORDER BY r.version DESC
            """,(r,n) -> new Revision(r.getLong("version"),r.getString("status"),r.getString("reason"),
                r.getObject("changed_at",OffsetDateTime.class),uuid(r,"changed_by_account_uuid"),
                FinanceJson.read(r.getString("snapshot"),Snapshot.class)),office,work);
    }
    @Override public StoredWork insertWork(Account account, UUID day, Snapshot snapshot) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO public.finance_work(uuid,agency_owner_uuid,schedule_day_uuid,site_uuid,client_uuid,
                client_profile_uuid,version,status,work_date,snapshot) VALUES (?,?,?,?,?,?,1,'DRAFT',?,?::jsonb)
            """,id,account.agencyOwnerUuid(),day,snapshot.siteUuid(),snapshot.clientUuid(),snapshot.clientProfileUuid(),
            snapshot.workDate(),FinanceJson.write(snapshot));
        StoredWork result = new StoredWork(id,day,1,"DRAFT",false,snapshot);
        revision(account,result,null);
        return result;
    }
    @Override public StoredWork updateWork(Account account, StoredWork previous, String status, String reason, Snapshot snapshot) {
        long version = previous.version()+1;
        int count = jdbc.update("""
            UPDATE public.finance_work SET version=?,status=?,work_date=?,snapshot=?::jsonb,
                ever_confirmed=ever_confirmed OR ? WHERE agency_owner_uuid=? AND uuid=? AND version=?
            """,version,status,snapshot.workDate(),FinanceJson.write(snapshot),"CONFIRMED".equals(status),
            account.agencyOwnerUuid(),previous.uuid(),previous.version());
        if (count != 1) throw conflict("This work was changed. Refresh before saving.");
        StoredWork result = new StoredWork(previous.uuid(),previous.scheduleDayUuid(),version,status,
            previous.everConfirmed() || "CONFIRMED".equals(status),snapshot);
        revision(account,result,reason);
        return result;
    }
    private void revision(Account account, StoredWork w, String reason) {
        jdbc.update("""
            INSERT INTO public.finance_work_revision(work_uuid,version,status,reason,snapshot,changed_by_account_uuid)
            VALUES (?,?,?,?,?::jsonb,?)
            """,w.uuid(),w.version(),w.status(),reason,FinanceJson.write(w.snapshot()),account.accountUuid());
    }
    @Override public void syncObligations(UUID office, StoredWork w) {
        jdbc.update("UPDATE public.finance_obligation SET amount=0 WHERE agency_owner_uuid=? AND work_uuid=?",office,w.uuid());
        Snapshot s = w.snapshot();
        putObligation(office,w.uuid(),"RECEIPT",s.clientUuid().toString(),s.clientName(),null,totals(s).officeCharge(),s.receiptDueDate());
        for (Line l : s.lines()) putObligation(office,w.uuid(),"DIRECT".equals(l.mode()) ? "DIRECT" : "PAYOUT",
            l.payeeKey(),l.displayName(),l.assignmentUuid(),l.payAmount(),l.payoutDueDate());
    }
    private void putObligation(UUID office, UUID work, String kind, String party, String name, UUID assignment, BigDecimal amount, LocalDate due) {
        jdbc.update("""
            INSERT INTO public.finance_obligation(agency_owner_uuid,work_uuid,kind,party_key,party_name,assignment_uuid,
                amount,original_due_date,due_date) VALUES (?,?,?,?,?,?,?,?,?)
            ON CONFLICT (work_uuid,kind,party_key) DO UPDATE SET amount=EXCLUDED.amount,due_date=EXCLUDED.due_date
            WHERE finance_obligation.agency_owner_uuid=EXCLUDED.agency_owner_uuid
            """,office,work,kind,party,name,assignment,amount,due,due);
    }
    private static final String BALANCE_SQL = """
        WITH paid AS (
            SELECT a.obligation_uuid,sum(a.amount) settled FROM public.finance_cash_allocation a
            WHERE a.agency_owner_uuid=? AND NOT EXISTS (SELECT 1 FROM public.finance_cash_cancellation x WHERE x.cash_uuid=a.cash_uuid)
            GROUP BY a.obligation_uuid
        ), balance AS (
            SELECT o.*,COALESCE(p.settled,0) settled FROM public.finance_obligation o LEFT JOIN paid p ON p.obligation_uuid=o.uuid
            WHERE o.agency_owner_uuid=?
        ), receipts AS (
            SELECT work_uuid,sum(amount-settled) outstanding FROM balance WHERE kind='RECEIPT' GROUP BY work_uuid
        )
        SELECT b.*,w.schedule_day_uuid,w.work_date,w.snapshot->>'clientName' client_name,w.snapshot->>'siteName' site_name,
            COALESCE(receipts.outstanding,0) receipt_outstanding
        FROM balance b JOIN public.finance_work w ON w.uuid=b.work_uuid AND w.agency_owner_uuid=b.agency_owner_uuid
        LEFT JOIN receipts ON receipts.work_uuid=b.work_uuid
        WHERE (?::text IS NULL OR b.kind=?) AND (?::uuid IS NULL OR b.uuid=?) ORDER BY b.due_date NULLS LAST,w.work_date,b.uuid
        """;
    @Override public List<Balance> balances(UUID office, String kind, LocalDate today) {
        return jdbc.query(BALANCE_SQL,(r,n) -> mapBalance(r,today),office,office,kind,kind,null,null);
    }
    @Override public Optional<Balance> obligation(UUID office, UUID id, LocalDate today) {
        return jdbc.query(BALANCE_SQL,(r,n) -> mapBalance(r,today),office,office,null,null,id,id).stream().findFirst();
    }
    private Balance mapBalance(ResultSet r, LocalDate today) throws SQLException {
        BigDecimal amount = r.getBigDecimal("amount"), paid = aggregate(r.getBigDecimal("settled")), outstanding = aggregate(amount.subtract(paid));
        LocalDate due = r.getObject("due_date",LocalDate.class);
        String status = outstanding.signum()<0 ? "OVERPAID" : outstanding.signum()==0 ? "PAID" : paid.signum()>0 ? "PARTIAL" : "UNPAID";
        return new Balance(uuid(r,"uuid"),uuid(r,"work_uuid"),uuid(r,"schedule_day_uuid"),r.getObject("work_date",LocalDate.class),
            r.getString("kind"),r.getString("party_key"),r.getString("party_name"),r.getString("client_name"),r.getString("site_name"),
            uuid(r,"assignment_uuid"),amount,paid,outstanding,r.getObject("original_due_date",LocalDate.class),due,status,
            outstanding.signum()>0 && due!=null && due.isBefore(today),outstanding.signum()<0,aggregate(r.getBigDecimal("receipt_outstanding")));
    }
    @Override public Optional<Cash> cash(UUID office, UUID id) {
        return jdbc.query("""
            SELECT c.*,x.reason,x.cancelled_at FROM public.finance_cash c LEFT JOIN public.finance_cash_cancellation x ON x.cash_uuid=c.uuid
            WHERE c.agency_owner_uuid=? AND c.uuid=?
            """,(r,n) -> mapCash(r,office),office,id).stream().findFirst();
    }
    @Override public List<Cash> cashList(UUID office, String kind, LocalDate from, LocalDate to) {
        return jdbc.query("""
            SELECT c.*,x.reason,x.cancelled_at FROM public.finance_cash c LEFT JOIN public.finance_cash_cancellation x ON x.cash_uuid=c.uuid
            WHERE c.agency_owner_uuid=? AND (?::text IS NULL OR c.kind=?)
                AND (?::date IS NULL OR c.cash_date>=?) AND (?::date IS NULL OR c.cash_date<=?) ORDER BY c.cash_date DESC,c.created_at DESC,c.uuid
            """,(r,n) -> mapCash(r,office),office,kind,kind,from,from,to,to);
    }
    private Cash mapCash(ResultSet r, UUID office) throws SQLException {
        UUID id = uuid(r,"uuid");
        var details = jdbc.query("""
            SELECT a.obligation_uuid,a.amount,o.party_name,w.work_date,
                w.snapshot->>'siteName' site_name,w.snapshot->>'clientName' client_name
            FROM public.finance_cash_allocation a
            JOIN public.finance_obligation o ON o.uuid=a.obligation_uuid AND o.agency_owner_uuid=a.agency_owner_uuid
            JOIN public.finance_work w ON w.uuid=o.work_uuid AND w.agency_owner_uuid=o.agency_owner_uuid
            WHERE a.agency_owner_uuid=? AND a.cash_uuid=? ORDER BY a.obligation_uuid
            """,(a,n) -> new CashAllocation(new Allocation(uuid(a,"obligation_uuid"),a.getBigDecimal("amount"),
                a.getObject("work_date",LocalDate.class),a.getString("site_name"),a.getString("client_name")),a.getString("party_name")),office,id);
        List<Allocation> allocations=details.stream().map(CashAllocation::allocation).toList();
        OffsetDateTime cancelled = r.getObject("cancelled_at",OffsetDateTime.class);
        return new Cash(id,r.getString("kind"),r.getString("party_key"),r.getObject("cash_date",LocalDate.class),r.getBigDecimal("amount"),
            r.getString("method"),r.getString("memo"),allocations,r.getObject("created_at",OffsetDateTime.class),
            uuid(r,"created_by_account_uuid"),cancelled!=null,r.getString("reason"),cancelled,uuid(r,"replaces_cash_uuid"),
            details.isEmpty() ? r.getString("party_key") : details.getFirst().partyName());
    }
    private record CashAllocation(Allocation allocation, String partyName) { }
    @Override public Cash insertCash(Account account, CashBody body, UUID replaces) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO public.finance_cash(uuid,agency_owner_uuid,kind,party_key,cash_date,amount,method,memo,created_by_account_uuid,replaces_cash_uuid)
            VALUES (?,?,?,?,?,?,?,?,?,?)
            """,id,account.agencyOwnerUuid(),body.kind(),body.partyKey(),body.cashDate(),body.amount(),body.method(),body.memo(),account.accountUuid(),replaces);
        for (Allocation allocation : body.allocations()) jdbc.update("""
            INSERT INTO public.finance_cash_allocation(agency_owner_uuid,cash_uuid,obligation_uuid,amount) VALUES (?,?,?,?)
            """,account.agencyOwnerUuid(),id,allocation.obligationUuid(),allocation.amount());
        return cash(account.agencyOwnerUuid(),id).orElseThrow();
    }
    @Override public void cancelCash(Account account, UUID cash, String reason) {
        jdbc.update("""
            INSERT INTO public.finance_cash_cancellation(cash_uuid,agency_owner_uuid,reason,cancelled_by_account_uuid)
            VALUES (?,?,?,?)
            """,cash,account.agencyOwnerUuid(),reason,account.accountUuid());
    }
    @Override public Optional<RequestResult> request(UUID office, UUID id) {
        return jdbc.query("SELECT payload_hash,response FROM public.finance_request WHERE agency_owner_uuid=? AND request_id=?",
            (r,n) -> new RequestResult(r.getString("payload_hash"),FinanceJson.read(r.getString("response"),Cash.class)),office,id).stream().findFirst();
    }
    @Override public void saveRequest(UUID office, UUID id, String hash, Cash response) {
        jdbc.update("INSERT INTO public.finance_request(agency_owner_uuid,request_id,payload_hash,response) VALUES (?,?,?,?::jsonb)",
            office,id,hash,FinanceJson.write(response));
    }
    @Override public Optional<Settings> settings(UUID office) {
        return jdbc.query("SELECT settings FROM public.finance_settings WHERE agency_owner_uuid=?",
            (r,n) -> FinanceJson.read(r.getString("settings"),Settings.class),office).stream().findFirst();
    }
    @Override public void saveSettings(Account account, Settings s, String reason) {
        int count = jdbc.update("""
            INSERT INTO public.finance_settings(agency_owner_uuid,version,settings) VALUES (?,?,?::jsonb)
            ON CONFLICT (agency_owner_uuid) DO UPDATE SET version=EXCLUDED.version,settings=EXCLUDED.settings
            WHERE finance_settings.version=EXCLUDED.version-1
            """,account.agencyOwnerUuid(),s.version(),FinanceJson.write(s));
        if (count != 1) throw conflict("Settings changed. Refresh before saving.");
        jdbc.update("""
            INSERT INTO public.finance_settings_revision(agency_owner_uuid,version,settings,reason,changed_by_account_uuid)
            VALUES (?,?,?::jsonb,?,?)
            """,account.agencyOwnerUuid(),s.version(),FinanceJson.write(s),reason,account.accountUuid());
    }
    @Override public boolean ownsWorker(UUID office, UUID worker) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM public.labor_agency_worker_profile WHERE agency_owner_uuid=? AND uuid=?)",Boolean.class,office,worker));
    }
    @Override public boolean ownsClient(UUID office, UUID client) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM public.labor_agency_farm_owner_profile WHERE agency_owner_uuid=? AND uuid=?)",Boolean.class,office,client));
    }
    private static UUID uuid(ResultSet r, String column) throws SQLException { return r.getObject(column,UUID.class); }
}
