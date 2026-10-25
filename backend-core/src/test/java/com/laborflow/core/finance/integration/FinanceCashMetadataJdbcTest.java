package com.laborflow.core.finance.integration;

import static com.laborflow.core.finance.dto.FinanceDtos.*;
import static org.assertj.core.api.Assertions.*;
import com.laborflow.core.finance.application.FinanceJson;
import com.laborflow.core.finance.application.FinanceService;
import com.laborflow.core.finance.dao.JdbcFinanceDao;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;

// The parent verifier supplies a disposable database and marker, never app DB settings.
@EnabledIfEnvironmentVariable(named="LABORFLOW_FINANCE_TEST_JDBC_URL",
    matches="jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/lf_finance_[a-f0-9]{32}")
class FinanceCashMetadataJdbcTest {
    private static JdbcTemplate jdbc;
    private static JdbcFinanceDao dao;
    private static FinanceService service;
    private static final LocalDate DATE=LocalDate.of(2026,10,25);
    private UUID office,account,worker,workerProfile,client,clientProfile,site,day,assignment;
    private Work work;

    @BeforeAll static void isolatedDatabaseOnly() {
        var ds=new DriverManagerDataSource(System.getenv("LABORFLOW_FINANCE_TEST_JDBC_URL"),
            "finance_test","disposable_test_only");
        jdbc=new JdbcTemplate(ds);
        String token=System.getenv("LABORFLOW_FINANCE_TEST_TOKEN");
        assertThat(token).isNotBlank();
        assertThat(jdbc.queryForObject("SELECT token::text FROM finance_test_marker",String.class)).isEqualTo(token);
        dao=new JdbcFinanceDao(jdbc);
        var interceptor=new TransactionInterceptor();
        interceptor.setTransactionManager(new DataSourceTransactionManager(ds));
        interceptor.setTransactionAttributeSource(new AnnotationTransactionAttributeSource());
        var proxy=new ProxyFactory(new FinanceService(dao,
            Clock.fixed(Instant.parse("2026-11-05T00:00:00Z"),ZoneId.of("Asia/Seoul"))));
        proxy.addAdvice(interceptor);
        service=(FinanceService)proxy.getProxy();
    }

    @BeforeEach void confirmedFixture() {
        office=UUID.randomUUID(); account=UUID.randomUUID(); worker=UUID.randomUUID(); workerProfile=UUID.randomUUID();
        client=UUID.randomUUID(); clientProfile=UUID.randomUUID(); site=UUID.randomUUID(); day=UUID.randomUUID(); assignment=UUID.randomUUID();
        jdbc.update("INSERT INTO labor_agency_owner(uuid) VALUES (?)",office);
        jdbc.update("INSERT INTO app_account(uuid,labor_agency_owner_uuid,login_id) VALUES (?,?,?)",account,office,login());
        jdbc.update("INSERT INTO worker(uuid,canonical_name) VALUES (?,?)",worker,"Fictional metadata worker");
        jdbc.update("INSERT INTO labor_agency_worker_profile(uuid,agency_owner_uuid,worker_uuid,local_name) VALUES (?,?,?,?)",
            workerProfile,office,worker,"Saved worker");
        jdbc.update("INSERT INTO farm_owner(uuid,canonical_name) VALUES (?,?)",client,"Fictional metadata farm");
        jdbc.update("INSERT INTO labor_agency_farm_owner_profile(uuid,agency_owner_uuid,farm_owner_uuid,local_name) VALUES (?,?,?,?)",
            clientProfile,office,client,"Saved client");
        jdbc.update("INSERT INTO farm_work_site(uuid,agency_owner_uuid,owner_uuid,site_name,work_description) VALUES (?,?,?,?,?)",
            site,office,client,"Saved field","Harvest");
        jdbc.update("INSERT INTO work_schedule_day(uuid,work_site_uuid,work_date) VALUES (?,?,?)",day,site,DATE);
        jdbc.update("INSERT INTO work_schedule_assignment(uuid,agency_owner_uuid,schedule_day_uuid,work_site_uuid,worker_profile_uuid,work_date) VALUES (?,?,?,?,?,?)",
            assignment,office,day,site,workerProfile,DATE);
        jdbc.update("INSERT INTO worker_attendance_record(agency_owner_uuid,assignment_uuid,schedule_day_uuid,worker_profile_uuid,work_date,status,confirmed_at) VALUES (?,?,?,?,?,'WORKED',now())",
            office,assignment,day,workerProfile,DATE);
        Work draft=service.prepareWork(login(),day);
        work=service.saveWork(login(),draft.uuid(),new SaveWork(draft.version(),"CONFIRMED",null,
            draft.currentSource().fingerprint(),"OFFICE",null,null,DATE,List.of(new LineInput(assignment,"OFFICE",
                BigDecimal.ONE,null,null,amount(150000),amount(130000),true,DATE,null)),List.of(),null));
    }

    private String login() { return "metadata-"+account; }
    private static BigDecimal amount(long value) { return BigDecimal.valueOf(value); }
    private Balance obligation(String kind) { return dao.balances(office,kind,DATE).getFirst(); }
    private RecordCash request(UUID requestId,String kind,long amount) {
        Balance target=obligation(kind);
        return new RecordCash(requestId,kind,target.partyKey(),DATE.plusDays(7),amount(amount),"TRANSFER",null,
            List.of(new Allocation(target.uuid(),amount(amount))));
    }
    private void assertLabels(Cash cash,String partyName) {
        assertThat(cash.partyName()).isEqualTo(partyName);
        assertThat(cash.allocations()).hasSize(1);
        Allocation allocation=cash.allocations().getFirst();
        assertThat(allocation.workDate()).isEqualTo(DATE);
        assertThat(allocation.siteName()).isEqualTo("Saved field");
        assertThat(allocation.clientName()).isEqualTo("Saved client");
    }

    @Test void fullySettledCashKeepsSnapshotLabelsAfterDirectoryRenameAndDeactivation() {
        UUID requestId=UUID.randomUUID();
        Cash paid=service.recordCash(login(),request(requestId,"PAYOUT",130000));
        assertThat(service.getBalances(login(),"PAYOUT","ALL").items()).isEmpty();
        jdbc.update("UPDATE labor_agency_worker_profile SET local_name='Changed worker',status='INACTIVE',deleted_at=now() WHERE uuid=?",workerProfile);
        jdbc.update("UPDATE labor_agency_farm_owner_profile SET local_name='Changed client',status='INACTIVE',deleted_at=now() WHERE uuid=?",clientProfile);
        jdbc.update("UPDATE farm_owner SET canonical_name='Changed farm',status='INACTIVE',deleted_at=now() WHERE uuid=?",client);
        jdbc.update("UPDATE farm_work_site SET site_name='Unapproved live field rename' WHERE uuid=?",site);
        assertLabels(dao.cash(office,paid.uuid()).orElseThrow(),"Saved worker");
        assertLabels(service.listCash(login(),"PAYOUT",null,null).items().getFirst(),"Saved worker");
        assertLabels(dao.request(office,requestId).orElseThrow().response(),"Saved worker");
        assertThat(dao.work(office,work.uuid()).orElseThrow().snapshot().clientProfileUuid()).isEqualTo(clientProfile);
    }

    @Test void forgedRequestLabelsAreIgnoredAndDifferentLabelsReplayTheSamePersistedResponse() {
        UUID requestId=UUID.randomUUID();
        RecordCash clean=request(requestId,"PAYOUT",30000);
        UUID target=clean.allocations().getFirst().obligationUuid();
        RecordCash forged=new RecordCash(requestId,clean.kind(),clean.partyKey(),clean.cashDate(),clean.amount(),clean.method(),null,
            List.of(new Allocation(target,amount(30000),DATE.minusYears(1),"Forged field","Forged client")));
        Cash first=service.recordCash(login(),forged);
        assertLabels(first,"Saved worker");
        RecordCash differentLabels=new RecordCash(requestId,clean.kind(),clean.partyKey(),clean.cashDate(),clean.amount(),clean.method(),null,
            List.of(new Allocation(target,amount(30000),DATE.plusYears(1),"Another forged field","Another forged client")));
        assertThat(service.recordCash(login(),differentLabels)).isEqualTo(first);
        assertThat(service.recordCash(login(),clean)).isEqualTo(first);
        assertThat(dao.request(office,requestId).orElseThrow().hash()).isEqualTo(FinanceJson.hash(List.of("RECORD",clean.body())));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM finance_cash WHERE agency_owner_uuid=?",Integer.class,office)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM finance_request WHERE agency_owner_uuid=?",Integer.class,office)).isEqualTo(1);
    }

    @Test void originalCancellationAndReplacementBothRoundTripTheirLabels() {
        Cash original=service.recordCash(login(),request(UUID.randomUUID(),"PAYOUT",100000));
        RecordCash replacement=request(UUID.randomUUID(),"PAYOUT",80000);
        CorrectCash correction=new CorrectCash(replacement.requestId(),"Correct payment fact",replacement.body());
        Cash corrected=service.correctCash(login(),original.uuid(),correction);
        assertLabels(corrected,"Saved worker");
        Cash cancelled=dao.cash(office,original.uuid()).orElseThrow();
        assertThat(cancelled.cancelled()).isTrue();
        assertLabels(cancelled,"Saved worker");
        assertThat(service.correctCash(login(),original.uuid(),correction)).isEqualTo(corrected);
        service.cancelCash(login(),corrected.uuid(),new CancelCash(UUID.randomUUID(),"Payment did not occur"));
        assertThat(service.listCash(login(),"PAYOUT",null,null).items()).hasSize(2)
            .allSatisfy(cash -> { assertThat(cash.cancelled()).isTrue(); assertLabels(cash,"Saved worker"); });
    }

    @Test void receiptMetadataUsesClientPartyNameRatherThanWorkerPartyName() {
        Cash receipt=service.recordCash(login(),request(UUID.randomUUID(),"RECEIPT",150000));
        assertLabels(receipt,"Saved client");
        assertLabels(dao.cash(office,receipt.uuid()).orElseThrow(),"Saved client");
        assertThat(service.getBalances(login(),"RECEIPT","ALL").items()).isEmpty();
        assertThat(service.getBalances(login(),"PAYOUT","ALL").items()).hasSize(1);
    }
}
