package com.laborflow.core.noshow.integration;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import com.laborflow.core.noshow.application.*;
import com.laborflow.core.noshow.dao.*;
import com.laborflow.core.noshow.dto.NoShowDtos.*;
import com.laborflow.core.attendance.dao.JdbcAttendanceDao;
import com.laborflow.core.attendance.application.AttendanceService;
import com.laborflow.core.attendance.dto.UpdateAttendanceRecordRequest;
import com.laborflow.core.schedule.application.ScheduleService;
import com.laborflow.core.schedule.dao.JdbcScheduleDao;
import java.time.LocalDate;
import java.util.UUID;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.aop.framework.ProxyFactory;

// The shared verification runner creates this DB and verifies an unpredictable ownership marker.
@EnabledIfEnvironmentVariable(named="LABORFLOW_FINANCE_TEST_JDBC_URL",matches="jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/lf_finance_[a-f0-9]{32}")
class NoShowJdbcTest {
    private static JdbcTemplate jdbc;
    private static DataSourceTransactionManager manager;
    private JdbcNoShowDao dao;
    private JdbcScheduleDao schedule;
    private JdbcAttendanceDao attendance;
    private NoShowService service;
    private UUID office,account,worker,profile,owner,site,day,assignment;
    private final LocalDate date=LocalDate.of(2024,3,15);

    @BeforeAll static void ownedDatabase() {
        var ds=new DriverManagerDataSource(System.getenv("LABORFLOW_FINANCE_TEST_JDBC_URL"),"finance_test","disposable_test_only");
        jdbc=new JdbcTemplate(ds);
        assertThat(System.getenv("LABORFLOW_FINANCE_TEST_TOKEN")).isNotBlank();
        assertThat(jdbc.queryForObject("SELECT token::text FROM finance_test_marker",String.class)).isEqualTo(System.getenv("LABORFLOW_FINANCE_TEST_TOKEN"));
        manager=new DataSourceTransactionManager(ds);
    }
    @BeforeEach void fixture() {
        office=UUID.randomUUID(); account=UUID.randomUUID(); worker=UUID.randomUUID(); profile=UUID.randomUUID();
        owner=UUID.randomUUID(); site=UUID.randomUUID(); day=UUID.randomUUID(); assignment=UUID.randomUUID();
        jdbc.update("INSERT INTO labor_agency_owner(uuid) VALUES(?)",office);
        jdbc.update("INSERT INTO app_account(uuid,labor_agency_owner_uuid,login_id) VALUES(?,?,?)",account,office,login());
        jdbc.update("INSERT INTO worker(uuid) VALUES(?)",worker);
        jdbc.update("INSERT INTO labor_agency_worker_profile(uuid,agency_owner_uuid,worker_uuid,local_name) VALUES(?,?,?,'Fiction worker')",profile,office,worker);
        jdbc.update("INSERT INTO farm_owner(uuid,canonical_name) VALUES(?,'Fiction farm')",owner);
        jdbc.update("INSERT INTO farm_work_site(uuid,agency_owner_uuid,owner_uuid,site_name,work_description) VALUES(?,?,?,'Fiction site','Harvest')",site,office,owner);
        jdbc.update("INSERT INTO work_schedule_day(uuid,work_site_uuid,work_date,daily_start_time,daily_end_time) VALUES(?,?,?,'07:00','17:00')",day,site,date);
        jdbc.update("INSERT INTO work_schedule_assignment(uuid,agency_owner_uuid,schedule_day_uuid,work_site_uuid,worker_profile_uuid,work_date) VALUES(?,?,?,?,?,?)",assignment,office,day,site,profile,date);
        jdbc.update("INSERT INTO worker_attendance_record(agency_owner_uuid,assignment_uuid,schedule_day_uuid,worker_profile_uuid,work_date,status,actual_start_at,actual_end_at,break_minutes,confirmed_at) VALUES(?,?,?,?,?,'WORKED',?::date+time '07:00',?::date+time '17:00',30,now())",office,assignment,day,profile,date,date,date);
        dao=new JdbcNoShowDao(jdbc); schedule=new JdbcScheduleDao(jdbc); attendance=new JdbcAttendanceDao(jdbc);
        // The old service's response reads require unrelated calendar tables. Its cancellation DAO is real here.
        var responseBoundary=mock(ScheduleService.class);
        doAnswer(call->{schedule.cancelNoShow(office,account,call.getArgument(1),call.getArgument(2)); return null;})
            .when(responseBoundary).cancelNoShow(anyString(),any(UUID.class),any(UUID.class),any(LocalDate.class));
        var interceptor=new TransactionInterceptor(); interceptor.setTransactionManager(manager);
        interceptor.setTransactionAttributeSource(new AnnotationTransactionAttributeSource());
        var proxy=new ProxyFactory(new NoShowService(dao,attendance,responseBoundary)); proxy.addAdvice(interceptor);
        service=(NoShowService)proxy.getProxy();
    }
    private String login(){return "no-show-fiction-"+account;}
    private String attendanceStatus(){return jdbc.queryForObject("SELECT status FROM worker_attendance_record WHERE assignment_uuid=? AND deleted_at IS NULL",String.class,assignment);}
    private Incident mark(){return service.create(login(),new Create(assignment,"  가상 메모\n둘째 줄  "));}
    private TransactionTemplate tx(){return new TransactionTemplate(manager);}

    @Test void recordNoteAndCancelPreservePriorAttendanceAndHistory() {
        var incident=mark();
        assertThat(incident.status()).isEqualTo("OPEN"); assertThat(incident.note()).isEqualTo("가상 메모\n둘째 줄");
        assertThat(attendanceStatus()).isEqualTo("ABSENT");
        var record=attendance.findRecords(office,date).getFirst();
        assertThat(record.status()).isEqualTo("ABSENT"); assertThat(record.noShowIncidentUuid()).isEqualTo(incident.uuid());
        service.update(login(),incident.uuid(),new Update("수정한 가상 메모"));
        var cancelled=service.cancel(login(),incident.uuid(),new Cancel("오등록 확인"));
        assertThat(cancelled.status()).isEqualTo("CANCELLED");
        assertThat(attendanceStatus()).isEqualTo("WORKED");
        assertThat(jdbc.queryForObject("SELECT break_minutes FROM worker_attendance_record WHERE assignment_uuid=? AND deleted_at IS NULL",Integer.class,assignment)).isEqualTo(30);
        assertThat(cancelled.revisions()).extracting(Revision::action).containsExactly("CREATED","NOTE_UPDATED","CANCELLED");
        assertThat(cancelled.revisions().getLast().note()).isEqualTo("오등록 확인");
        assertThat(attendance.findRecords(office,date).getFirst().noShowIncidentUuid()).isNull();
        assertThat(service.list(login(),profile,null).incidents()).hasSize(1);
    }
    @Test void retryAndConcurrentRecordDoNotDuplicateIncidentOrRevision() throws Exception {
        try(var pool=Executors.newFixedThreadPool(2)) {
            var first=pool.submit(()->mark()); var second=pool.submit(()->mark());
            assertThat(first.get().uuid()).isEqualTo(second.get().uuid());
        }
        assertThat(service.list(login(),profile,null).incidents()).singleElement().satisfies(i->assertThat(i.revisions()).hasSize(1));
    }
    @Test void reopenCancelledIncidentKeepsCancellationRevision() {
        var first=mark(); service.cancel(login(),first.uuid(),new Cancel("가상 취소 사유"));
        var reopened=mark(); assertThat(reopened.uuid()).isEqualTo(first.uuid());
        assertThat(reopened.status()).isEqualTo("OPEN");
        assertThat(reopened.revisions()).extracting(Revision::action).containsExactly("CREATED","CANCELLED","CREATED");
    }
    @Test void activeNoShowCannotBeSilentlyOverwrittenByOrdinaryAttendance() {
        mark(); var svc=new AttendanceService(attendance);
        assertThatThrownBy(()->tx().execute(s->svc.updateRecord(login(),assignment,new UpdateAttendanceRecordRequest(null,null,0,"WORKED","PLANNED"))))
            .isInstanceOf(NoShowException.class);
        assertThat(attendanceStatus()).isEqualTo("ABSENT");
    }
    @Test void attachingAndChangingReplacementRetainsPreNoShowSnapshot() {
        var first=mark(); UUID replacement=anotherWorker(); UUID second=anotherWorker();
        tx().executeWithoutResult(s->schedule.changeNoShowReplacement(office,account,day,assignment,replacement));
        assertThat(dao.find(office,first.uuid()).orElseThrow().status()).isEqualTo("REPLACED");
        tx().executeWithoutResult(s->schedule.changeNoShowReplacement(office,account,day,assignment,second));
        service.cancel(login(),first.uuid(),new Cancel("대체 취소 확인"));
        assertThat(attendanceStatus()).isEqualTo("WORKED");
        assertThat(jdbc.queryForObject("SELECT status FROM work_schedule_assignment WHERE uuid=?",String.class,assignment)).isEqualTo("PLANNED");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM work_schedule_assignment WHERE worker_profile_uuid IN (?,?) AND deleted_at IS NULL",Integer.class,replacement,second)).isZero();
    }
    @Test void anonymousRecordCanBeFoundUnderProfileAfterRegistration() {
        jdbc.update("UPDATE work_schedule_assignment SET participant_type='GUEST',worker_profile_uuid=NULL,participant_display_name='Fiction guest' WHERE uuid=?",assignment);
        jdbc.update("UPDATE worker_attendance_record SET worker_profile_uuid=NULL WHERE assignment_uuid=?",assignment);
        var incident=mark(); assertThat(incident.workerProfileUuid()).isNull();
        assertThat(service.list(login(),null,date).incidents()).hasSize(1);
        jdbc.update("UPDATE work_schedule_assignment SET participant_type='REGISTERED',worker_profile_uuid=? WHERE uuid=?",profile,assignment);
        assertThat(service.list(login(),profile,null).incidents()).singleElement().satisfies(i->assertThat(i.uuid()).isEqualTo(incident.uuid()));
    }
    @Test void foreignOfficeCannotReadChangeOrConnectAnIncident() {
        var incident=mark(); UUID other=UUID.randomUUID(), actor=UUID.randomUUID(); String otherLogin="no-show-foreign-"+actor;
        jdbc.update("INSERT INTO labor_agency_owner(uuid) VALUES(?)",other);
        jdbc.update("INSERT INTO app_account(uuid,labor_agency_owner_uuid,login_id) VALUES(?,?,?)",actor,other,otherLogin);
        assertThatThrownBy(()->service.list(otherLogin,profile,null)).isInstanceOf(NoShowException.class);
        assertThatThrownBy(()->service.create(otherLogin,new Create(assignment,null))).isInstanceOf(NoShowException.class);
        assertThatThrownBy(()->service.update(otherLogin,incident.uuid(),new Update("foreign"))).isInstanceOf(NoShowException.class);
        assertThatThrownBy(()->service.cancel(otherLogin,incident.uuid(),new Cancel("foreign"))).isInstanceOf(NoShowException.class);
        assertThat(dao.find(office,incident.uuid()).orElseThrow().status()).isEqualTo("OPEN");
    }
    @Test void failureAfterAttendanceChangeRollsBackIncidentAttendanceAndRevision() {
        jdbc.execute("CREATE FUNCTION test_no_show_reject_revision() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.note='fail-write-fixture' THEN RAISE EXCEPTION 'fixture failure'; END IF; RETURN NEW; END $$");
        jdbc.execute("CREATE TRIGGER test_no_show_reject_revision BEFORE INSERT ON worker_no_show_incident_revision FOR EACH ROW EXECUTE FUNCTION test_no_show_reject_revision()");
        try {
            assertThatThrownBy(()->service.create(login(),new Create(assignment,"fail-write-fixture"))).isInstanceOf(RuntimeException.class);
            assertThat(dao.byAssignment(office,assignment)).isEmpty(); assertThat(attendanceStatus()).isEqualTo("WORKED");
        } finally {
            jdbc.execute("DROP TRIGGER test_no_show_reject_revision ON worker_no_show_incident_revision");
            jdbc.execute("DROP FUNCTION test_no_show_reject_revision()");
        }
    }
    private UUID anotherWorker() {
        UUID w=UUID.randomUUID(),p=UUID.randomUUID(); jdbc.update("INSERT INTO worker(uuid) VALUES(?)",w);
        jdbc.update("INSERT INTO labor_agency_worker_profile(uuid,agency_owner_uuid,worker_uuid,local_name) VALUES(?,?,?,'Replacement fixture')",p,office,w);
        return p;
    }
}
