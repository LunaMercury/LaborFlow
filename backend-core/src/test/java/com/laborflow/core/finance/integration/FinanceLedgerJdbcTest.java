package com.laborflow.core.finance.integration;

import static org.assertj.core.api.Assertions.*;
import static com.laborflow.core.finance.dto.FinanceDtos.*;

import com.laborflow.core.finance.application.FinanceRules;
import com.laborflow.core.finance.application.FinanceService;
import com.laborflow.core.finance.application.FinanceException;
import com.laborflow.core.finance.application.FinanceJson;
import com.laborflow.core.finance.api.FinanceController;
import com.laborflow.core.finance.api.FinanceExceptionHandler;
import com.laborflow.core.finance.dao.FinanceDao;
import com.laborflow.core.finance.dao.JdbcFinanceDao;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.concurrent.Executors;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.http.MediaType;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

// Only verify-finance creates this database/marker. The app's DB settings are never read.
@EnabledIfEnvironmentVariable(named = "LABORFLOW_FINANCE_TEST_JDBC_URL", matches = "jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/lf_finance_[a-f0-9]{32}")
class FinanceLedgerJdbcTest {
    private static JdbcTemplate jdbc;
    private static JdbcFinanceDao dao;
    private static TransactionTemplate tx;
    private static FinanceService service;
    private UUID office, account, worker, workerProfile, client, clientProfile, site, day, assignment;
    private final LocalDate date = LocalDate.of(2026, 10, 25);

    @BeforeAll static void isolatedDatabaseOnly() {
        var ds = new DriverManagerDataSource(System.getenv("LABORFLOW_FINANCE_TEST_JDBC_URL"), "finance_test", "disposable_test_only");
        jdbc = new JdbcTemplate(ds);
        String token = System.getenv("LABORFLOW_FINANCE_TEST_TOKEN");
        assertThat(token).isNotBlank();
        assertThat(jdbc.queryForObject("SELECT token::text FROM finance_test_marker", String.class)).isEqualTo(token);
        dao = new JdbcFinanceDao(jdbc);
        var manager = new DataSourceTransactionManager(ds);
        tx = new TransactionTemplate(manager);
        var interceptor = new TransactionInterceptor();
        interceptor.setTransactionManager(manager);
        interceptor.setTransactionAttributeSource(new AnnotationTransactionAttributeSource());
        var proxy = new ProxyFactory(new FinanceService(dao, Clock.fixed(Instant.parse("2026-11-05T00:00:00Z"), ZoneId.of("Asia/Seoul"))));
        proxy.addAdvice(interceptor);
        service = (FinanceService) proxy.getProxy();
    }

    @BeforeEach void sourceFixture() {
        office = UUID.randomUUID(); account = UUID.randomUUID(); worker = UUID.randomUUID(); workerProfile = UUID.randomUUID();
        client = UUID.randomUUID(); clientProfile = UUID.randomUUID(); site = UUID.randomUUID(); day = UUID.randomUUID(); assignment = UUID.randomUUID();
        jdbc.update("INSERT INTO labor_agency_owner(uuid) VALUES (?)", office);
        jdbc.update("INSERT INTO app_account(uuid,labor_agency_owner_uuid,login_id) VALUES (?,?,?)", account, office, "fiction-" + account);
        jdbc.update("INSERT INTO worker(uuid,canonical_name) VALUES (?,?)", worker, "Fictional worker");
        jdbc.update("INSERT INTO labor_agency_worker_profile(uuid,agency_owner_uuid,worker_uuid,local_name) VALUES (?,?,?,?)", workerProfile, office, worker, "Worker snapshot");
        jdbc.update("INSERT INTO farm_owner(uuid,canonical_name) VALUES (?,?)", client, "Fictional farm");
        jdbc.update("INSERT INTO labor_agency_farm_owner_profile(uuid,agency_owner_uuid,farm_owner_uuid,local_name) VALUES (?,?,?,?)", clientProfile, office, client, "Client snapshot");
        jdbc.update("INSERT INTO farm_work_site(uuid,agency_owner_uuid,owner_uuid,site_name,work_description) VALUES (?,?,?,?,?)", site, office, client, "Fictional field", "Harvest");
        jdbc.update("INSERT INTO work_schedule_day(uuid,work_site_uuid,work_date) VALUES (?,?,?)", day, site, date);
        jdbc.update("INSERT INTO work_schedule_assignment(uuid,agency_owner_uuid,schedule_day_uuid,work_site_uuid,worker_profile_uuid,work_date) VALUES (?,?,?,?,?,?)", assignment, office, day, site, workerProfile, date);
        jdbc.update("INSERT INTO worker_attendance_record(agency_owner_uuid,assignment_uuid,schedule_day_uuid,worker_profile_uuid,work_date,status,confirmed_at) VALUES (?,?,?,?,?,'WORKED',now())", office, assignment, day, workerProfile, date);
    }

    private FinanceDao.Account actor() { return new FinanceDao.Account(account, office); }
    private String login() { return "fiction-" + account; }
    private BigDecimal amount(long value) { return BigDecimal.valueOf(value); }
    private Snapshot snapshot(String mode, long charge, long pay) {
        Source source = dao.source(office, day).orElseThrow();
        return new Snapshot(date, client, clientProfile, source.clientName(), site, source.siteName(), source.workTitle(),
            source.fingerprint(), mode, amount(charge), amount(pay), date,
            List.of(new Line(assignment, workerProfile, workerProfile.toString(), "Worker snapshot", "WORKED", null, null, 60,
                mode, BigDecimal.ONE, amount(charge), amount(pay), amount(charge), amount(pay), false, date, null)),
            List.of(new Extra(UUID.randomUUID(), "Meal", "PER_JOB", BigDecimal.ONE, amount(10000), amount(5000), amount(10000), amount(5000))), null);
    }
    private FinanceDao.StoredWork confirmed(String mode, long charge, long pay) {
        return tx.execute(status -> {
            dao.lockOffice(office);
            var initial = dao.insertWork(actor(), day, snapshot(mode, charge, pay));
            var result = dao.updateWork(actor(), initial, "CONFIRMED", null, initial.snapshot());
            dao.syncObligations(office, result);
            return result;
        });
    }
    private Balance balance(String kind) { return dao.balances(office, kind, date).getFirst(); }
    private Cash cash(String kind, long value) {
        Balance target = balance(kind);
        return tx.execute(status -> dao.insertCash(actor(), new CashBody(kind, target.partyKey(), date.plusDays(7), amount(value), "CASH", null,
            List.of(new Allocation(target.uuid(), amount(value)))), null));
    }

    @Test void officeAndDirectCalculationsPersistWithSeparateObligationsAndRoundTripSnapshots() {
        var saved = confirmed("OFFICE", 150000, 130000);
        assertThat(FinanceRules.totals(dao.work(office, saved.uuid()).orElseThrow().snapshot()).workProfit()).isEqualByComparingTo("25000");
        assertThat(balance("RECEIPT").amount()).isEqualByComparingTo("160000");
        assertThat(balance("PAYOUT").amount()).isEqualByComparingTo("130000");
        var directSnapshot = snapshot("DIRECT", 20000, 130000);
        tx.executeWithoutResult(status -> {
            var corrected = dao.updateWork(actor(), saved, "CONFIRMED", "Correct operating mode", directSnapshot);
            dao.syncObligations(office, corrected);
        });
        assertThat(FinanceRules.totals(dao.work(office, saved.uuid()).orElseThrow().snapshot()).workProfit()).isEqualByComparingTo("25000");
        assertThat(balance("DIRECT").amount()).isEqualByComparingTo("130000");
        assertThat(balance("PAYOUT").amount()).isZero();
        assertThat(dao.revisions(office, saved.uuid())).hasSize(3);
    }

    @Test void partialPayoutAndCancellationRestoreBalanceWithoutDeletingOriginals() {
        confirmed("OFFICE", 700000, 650000);
        Cash paid = cash("PAYOUT", 300000);
        assertThat(balance("PAYOUT").outstandingAmount()).isEqualByComparingTo("350000");
        assertThat(balance("RECEIPT").settledAmount()).isZero();
        tx.executeWithoutResult(status -> dao.cancelCash(actor(), paid.uuid(), "Entered wrong payment"));
        assertThat(balance("PAYOUT").outstandingAmount()).isEqualByComparingTo("650000");
        assertThat(dao.cash(office, paid.uuid()).orElseThrow().cancelled()).isTrue();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM finance_cash WHERE uuid=?", Integer.class, paid.uuid())).isEqualTo(1);
    }

    @Test void receiptDoesNotMarkPayoutAsPaidAndCashDateIsIndependentFromWorkDate() {
        var work = confirmed("OFFICE", 150000, 130000);
        cash("RECEIPT", 160000);
        assertThat(balance("RECEIPT").outstandingAmount()).isZero();
        assertThat(balance("PAYOUT").outstandingAmount()).isEqualByComparingTo("130000");
        assertThat(dao.cashList(office, "RECEIPT", date.withDayOfMonth(1), date.withDayOfMonth(31))).isEmpty();
        assertThat(dao.cashList(office, "RECEIPT", date.plusDays(7), date.plusDays(7))).hasSize(1);
        assertThat(dao.works(office, date, date)).extracting(FinanceDao.StoredWork::uuid).contains(work.uuid());
    }

    @Test void reducedConfirmedAmountKeepsOriginalPayoutAndExposesOverpayment() {
        var work = confirmed("OFFICE", 150000, 130000);
        Cash paid = cash("PAYOUT", 130000);
        tx.executeWithoutResult(status -> {
            var corrected = dao.updateWork(actor(), work, "CONFIRMED", "Corrected final pay", snapshot("OFFICE", 150000, 100000));
            dao.syncObligations(office, corrected);
        });
        assertThat(balance("PAYOUT").outstandingAmount()).isEqualByComparingTo("-30000");
        assertThat(balance("PAYOUT").reconciliationRequired()).isTrue();
        assertThat(dao.cash(office, paid.uuid()).orElseThrow().amount()).isEqualByComparingTo("130000");
    }

    @Test void foreignOfficeCannotReadWorkCashOrObligation() {
        var work = confirmed("OFFICE", 150000, 130000);
        Cash paid = cash("PAYOUT", 10000);
        UUID foreign = UUID.randomUUID();
        assertThat(dao.work(foreign, work.uuid())).isEmpty();
        assertThat(dao.cash(foreign, paid.uuid())).isEmpty();
        assertThat(dao.obligation(foreign, balance("PAYOUT").uuid(), date)).isEmpty();
    }

    @Test void sourceMutationChangesFingerprintButPersonRenameDoesNotRewriteHistoricalNames() {
        var work = confirmed("OFFICE", 150000, 130000);
        String fingerprint = work.snapshot().sourceFingerprint();
        jdbc.update("UPDATE labor_agency_worker_profile SET local_name='Renamed worker' WHERE uuid=?", workerProfile);
        assertThat(dao.source(office, day).orElseThrow().fingerprint()).isEqualTo(fingerprint);
        assertThat(dao.work(office, work.uuid()).orElseThrow().snapshot().lines().getFirst().displayName()).isEqualTo("Worker snapshot");
        jdbc.update("UPDATE worker_attendance_record SET break_minutes=30 WHERE assignment_uuid=?", assignment);
        assertThat(dao.source(office, day).orElseThrow().fingerprint()).isNotEqualTo(fingerprint);
    }

    @Test void databaseRejectsOverAllocationIncompleteAllocationAndMutationOfCashHistory() {
        confirmed("OFFICE", 150000, 130000);
        Balance target = balance("PAYOUT");
        assertThatThrownBy(() -> cash("PAYOUT", 130001)).isInstanceOf(RuntimeException.class);
        assertThatThrownBy(() -> tx.executeWithoutResult(status -> dao.insertCash(actor(), new CashBody("PAYOUT", target.partyKey(), date,
            amount(20000), "CASH", null, List.of(new Allocation(target.uuid(), amount(10000)))), null))).isInstanceOf(RuntimeException.class);
        assertThat(dao.cashList(office, "PAYOUT", null, null)).isEmpty();
        Cash paid = cash("PAYOUT", 10000);
        assertThatThrownBy(() -> jdbc.update("UPDATE finance_cash SET amount=1 WHERE uuid=?", paid.uuid())).isInstanceOf(RuntimeException.class);
        assertThatThrownBy(() -> jdbc.update("DELETE FROM finance_cash WHERE uuid=?", paid.uuid())).isInstanceOf(RuntimeException.class);
    }

    @Test void confirmedScheduleSoftAndHardDeleteAreRejectedButAttendanceCorrectionRemainsPossible() {
        confirmed("OFFICE", 150000, 130000);
        assertThatThrownBy(() -> jdbc.update("UPDATE work_schedule_day SET deleted_at=now() WHERE uuid=?", day)).isInstanceOf(RuntimeException.class);
        assertThatThrownBy(() -> jdbc.update("UPDATE farm_work_site SET status='ARCHIVED' WHERE uuid=?", site)).isInstanceOf(RuntimeException.class);
        assertThatThrownBy(() -> jdbc.update("DELETE FROM work_schedule_day WHERE uuid=?", day)).isInstanceOf(RuntimeException.class);
        jdbc.update("UPDATE worker_attendance_record SET break_minutes=20 WHERE assignment_uuid=?", assignment);
        assertThat(jdbc.queryForObject("SELECT break_minutes FROM worker_attendance_record WHERE assignment_uuid=?", Integer.class, assignment)).isEqualTo(20);
    }

    private RecordCash request(UUID requestId, String kind, long value) {
        Balance target = balance(kind);
        return new RecordCash(requestId, kind, target.partyKey(), date.plusDays(7), amount(value), "TRANSFER", null,
            List.of(new Allocation(target.uuid(), amount(value))));
    }

    @Test void serviceRetryPersistsOneCashAndRejectsChangedPayloadForTheSameKey() {
        confirmed("OFFICE", 150000, 130000);
        var request = request(UUID.randomUUID(), "PAYOUT", 30000);
        Cash first = service.recordCash(login(), request);
        assertThat(service.recordCash(login(), request).uuid()).isEqualTo(first.uuid());
        assertThatThrownBy(() -> service.recordCash(login(), request(request.requestId(), "PAYOUT", 40000)))
            .isInstanceOf(FinanceException.class);
        assertThat(dao.cashList(office, "PAYOUT", null, null)).hasSize(1);
        assertThat(balance("PAYOUT").outstandingAmount()).isEqualByComparingTo("100000");
    }

    @Test void concurrentDistinctRequestsCannotOverpayTheSameObligation() throws Exception {
        confirmed("OFFICE", 700000, 650000);
        var first = request(UUID.randomUUID(), "PAYOUT", 400000);
        var second = request(UUID.randomUUID(), "PAYOUT", 400000);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var a = pool.submit(() -> { try { service.recordCash(login(), first); return true; } catch (FinanceException failure) { return false; } });
            var b = pool.submit(() -> { try { service.recordCash(login(), second); return true; } catch (FinanceException failure) { return false; } });
            assertThat(List.of(a.get(), b.get())).containsExactlyInAnyOrder(true, false);
        }
        assertThat(dao.cashList(office, "PAYOUT", null, null)).hasSize(1);
        assertThat(balance("PAYOUT").outstandingAmount()).isEqualByComparingTo("250000");
    }

    @Test void concurrentDuplicateRequestReturnsTheSamePersistedRecord() throws Exception {
        confirmed("OFFICE", 150000, 130000);
        var request = request(UUID.randomUUID(), "PAYOUT", 30000);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var a = pool.submit(() -> service.recordCash(login(), request));
            var b = pool.submit(() -> service.recordCash(login(), request));
            assertThat(a.get().uuid()).isEqualTo(b.get().uuid());
        }
        assertThat(dao.cashList(office, "PAYOUT", null, null)).hasSize(1);
    }

    @Test void cashCorrectionIsAtomicAndPreservesCancelledOriginalAndIdempotentReplacement() {
        confirmed("OFFICE", 150000, 130000);
        Cash original = service.recordCash(login(), request(UUID.randomUUID(), "PAYOUT", 100000));
        var invalid = request(UUID.randomUUID(), "PAYOUT", 150000);
        assertThatThrownBy(() -> service.correctCash(login(), original.uuid(),
            new CorrectCash(invalid.requestId(), "Incorrect amount", invalid.body()))).isInstanceOf(FinanceException.class);
        assertThat(dao.cash(office, original.uuid()).orElseThrow().cancelled()).isFalse();
        assertThat(dao.cashList(office, "PAYOUT", null, null)).hasSize(1);
        var valid = request(UUID.randomUUID(), "PAYOUT", 80000);
        var correction = new CorrectCash(valid.requestId(), "Corrected payment fact", valid.body());
        Cash replacement = service.correctCash(login(), original.uuid(), correction);
        assertThat(service.correctCash(login(), original.uuid(), correction).uuid()).isEqualTo(replacement.uuid());
        assertThat(dao.cash(office, original.uuid()).orElseThrow().cancelled()).isTrue();
        assertThat(replacement.replacesCashUuid()).isEqualTo(original.uuid());
        assertThat(balance("PAYOUT").outstandingAmount()).isEqualByComparingTo("50000");
        assertThat(dao.cashList(office, "PAYOUT", null, null)).hasSize(2);
    }

    @Test void attendanceChangeMarksReviewWithoutChangingConfirmedMoneyOrCash() {
        var work = confirmed("OFFICE", 150000, 130000);
        service.recordCash(login(), request(UUID.randomUUID(), "PAYOUT", 130000));
        jdbc.update("UPDATE worker_attendance_record SET break_minutes=120 WHERE assignment_uuid=?", assignment);
        Work current = service.getWork(login(), work.uuid());
        assertThat(current.reviewRequired()).isTrue();
        assertThat(current.totals().workProfit()).isEqualByComparingTo("25000");
        assertThat(balance("PAYOUT").outstandingAmount()).isZero();
        assertThat(service.getBalances(login(), "RECEIPT", "ALL").items()).hasSize(1);
        assertThat(service.listWork(login(), LocalDate.of(2026, 11, 1), LocalDate.of(2026, 11, 30)).items()).isEmpty();
    }

    private SaveWork confirmRequest(Work work, Long charge, Long pay) {
        return new SaveWork(work.version(), "CONFIRMED", null, work.currentSource().fingerprint(), "OFFICE", null, null, date,
            List.of(new LineInput(assignment, "OFFICE", BigDecimal.ONE, null, null,
                charge == null ? null : amount(charge), pay == null ? null : amount(pay), true, date, null)), List.of(), null);
    }

    @Test void explicitZeroCanBeConfirmedButMissingAmountsCannot() {
        Work draft = service.prepareWork(login(), day);
        assertThatThrownBy(() -> service.saveWork(login(), draft.uuid(), confirmRequest(draft, null, null)))
            .isInstanceOf(FinanceException.class);
        assertThat(service.getWork(login(), draft.uuid()).version()).isEqualTo(draft.version());
        Work zero = service.saveWork(login(), draft.uuid(), confirmRequest(draft, 0L, 0L));
        assertThat(zero.status()).isEqualTo("CONFIRMED");
        assertThat(zero.totals().workProfit()).isZero();
    }

    @Test void groupedAssignmentsCannotConfirmAndForeignLoginCannotAccessSavedWork() {
        jdbc.update("UPDATE work_schedule_assignment SET worker_count=2 WHERE uuid=?", assignment);
        Work draft = service.prepareWork(login(), day);
        assertThatThrownBy(() -> service.saveWork(login(), draft.uuid(), confirmRequest(draft, 150000L, 130000L)))
            .isInstanceOf(FinanceException.class);
        UUID foreignOffice = UUID.randomUUID(), foreignAccount = UUID.randomUUID();
        jdbc.update("INSERT INTO labor_agency_owner(uuid) VALUES (?)", foreignOffice);
        jdbc.update("INSERT INTO app_account(uuid,labor_agency_owner_uuid,login_id) VALUES (?,?,?)", foreignAccount, foreignOffice, "foreign-" + foreignAccount);
        assertThatThrownBy(() -> service.getWork("foreign-" + foreignAccount, draft.uuid())).isInstanceOf(FinanceException.class);
    }

    @Test void replacementInsertFailureRollsBackOriginalCancellationAndRequestHistory() {
        confirmed("OFFICE", 150000, 130000);
        Cash original = service.recordCash(login(), request(UUID.randomUUID(), "PAYOUT", 100000));
        var replacement = request(UUID.randomUUID(), "PAYOUT", 80000);
        String guard = "finance_test_fail_" + UUID.randomUUID().toString().replace("-", "");
        jdbc.execute("CREATE FUNCTION " + guard + "() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Intentional isolated finance insertion fault'; END $$");
        jdbc.execute("CREATE TRIGGER " + guard + " BEFORE INSERT ON finance_cash FOR EACH ROW WHEN (NEW.agency_owner_uuid='" + office + "'::uuid AND NEW.replaces_cash_uuid IS NOT NULL) EXECUTE FUNCTION " + guard + "()");
        try {
            assertThatThrownBy(() -> service.correctCash(login(), original.uuid(), new CorrectCash(replacement.requestId(), "Correction test", replacement.body())))
                .isInstanceOf(RuntimeException.class);
            assertThat(dao.cash(office, original.uuid()).orElseThrow().cancelled()).isFalse();
            assertThat(dao.cashList(office, "PAYOUT", null, null)).hasSize(1);
            assertThat(dao.request(office, replacement.requestId())).isEmpty();
            assertThat(balance("PAYOUT").outstandingAmount()).isEqualByComparingTo("30000");
        } finally {
            jdbc.execute("DROP TRIGGER " + guard + " ON finance_cash");
            jdbc.execute("DROP FUNCTION " + guard + "()");
        }
    }

    @Test void confirmedNameSnapshotDoesNotChangeWhenOnlyDueDateIsCorrected() {
        var work = confirmed("OFFICE", 150000, 130000);
        jdbc.update("UPDATE labor_agency_worker_profile SET local_name='New current name' WHERE uuid=?", workerProfile);
        Work current = service.getWork(login(), work.uuid());
        var old = current.snapshot();
        var corrected = service.saveWork(login(), work.uuid(), new SaveWork(current.version(), "CONFIRMED", "Correct due date", current.currentSource().fingerprint(),
            old.defaultMode(), old.defaultChargeRate(), old.defaultPayRate(), date.plusDays(1),
            List.of(new LineInput(assignment, "OFFICE", BigDecimal.ONE, null, null, amount(150000), amount(130000), true, date.plusDays(1), null)), old.extras(), null));
        assertThat(corrected.snapshot().lines().getFirst().displayName()).isEqualTo("Worker snapshot");
        assertThat(balance("PAYOUT").partyName()).isEqualTo("Worker snapshot");
        assertThat(balance("PAYOUT").originalDueDate()).isEqualTo(date);
        assertThat(balance("PAYOUT").dueDate()).isEqualTo(date.plusDays(1));
    }

    @Test void cancelledGroupedSourceStillRequiresIndividualAttendanceBeforeConfirmation() {
        UUID grouped = UUID.randomUUID();
        jdbc.update("INSERT INTO work_schedule_assignment(uuid,agency_owner_uuid,schedule_day_uuid,work_site_uuid,work_date,worker_count,participant_type,status) VALUES (?,?,?,?,?,2,'GUEST','CANCELLED')", grouped, office, day, site, date);
        jdbc.update("INSERT INTO worker_attendance_record(agency_owner_uuid,assignment_uuid,schedule_day_uuid,work_date,status,confirmed_at) VALUES (?,?,?,?,'CANCELLED',now())", office, grouped, day, date);
        Work draft = service.prepareWork(login(), day);
        assertThatThrownBy(() -> service.saveWork(login(), draft.uuid(), confirmRequest(draft, 150000L, 130000L)))
            .isInstanceOf(FinanceException.class);
    }

    @Test void httpCashSerializationAndRequeryUseRealTransactionalLedger() throws Exception {
        confirmed("OFFICE", 150000, 130000);
        var mvc = MockMvcBuilders.standaloneSetup(new FinanceController(service)).setControllerAdvice(new FinanceExceptionHandler()).build();
        var body = request(UUID.randomUUID(), "PAYOUT", 30000);
        mvc.perform(post("/api/finance/cash").param("loginId", login()).contentType(MediaType.APPLICATION_JSON).content(FinanceJson.write(body)))
            .andExpect(status().isOk()).andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
            .andExpect(jsonPath("$.amount").value(30000)).andExpect(jsonPath("$.kind").value("PAYOUT"));
        mvc.perform(get("/api/finance/balances").param("loginId", login()).param("kind", "PAYOUT"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].outstandingAmount").value(100000));
        mvc.perform(post("/api/finance/cash").param("loginId", login()).contentType(MediaType.APPLICATION_JSON).content(FinanceJson.write(body)))
            .andExpect(status().isOk());
        assertThat(dao.cashList(office, "PAYOUT", null, null)).hasSize(1);
    }

    private Work extraWorkedDay(LocalDate workDate, long pay) {
        UUID anotherDay = UUID.randomUUID(), anotherAssignment = UUID.randomUUID();
        jdbc.update("INSERT INTO work_schedule_day(uuid,work_site_uuid,work_date) VALUES (?,?,?)", anotherDay, site, workDate);
        jdbc.update("INSERT INTO work_schedule_assignment(uuid,agency_owner_uuid,schedule_day_uuid,work_site_uuid,worker_profile_uuid,work_date) VALUES (?,?,?,?,?,?)", anotherAssignment, office, anotherDay, site, workerProfile, workDate);
        jdbc.update("INSERT INTO worker_attendance_record(agency_owner_uuid,assignment_uuid,schedule_day_uuid,worker_profile_uuid,work_date,status,confirmed_at) VALUES (?,?,?,?,?,'WORKED',now())", office, anotherAssignment, anotherDay, workerProfile, workDate);
        Work draft = service.prepareWork(login(), anotherDay);
        return service.saveWork(login(), draft.uuid(), new SaveWork(draft.version(), "CONFIRMED", null,
            draft.currentSource().fingerprint(), "OFFICE", null, null, workDate,
            List.of(new LineInput(anotherAssignment, "OFFICE", BigDecimal.ONE, null, null, amount(pay + 20000), amount(pay), true,
                draft.snapshot().lines().getFirst().payoutDueDate(), null)), List.of(), null));
    }

    @Test void weeklyPaymentAcrossMonthBoundaryKeepsDailyWorkAndBulkAllocations() {
        service.saveSettings(login(), new SaveSettings(0, "OFFICE", null, null, "WEEKLY", 1, null, List.of(), List.of(), "Weekly payment configuration"));
        Work friday = extraWorkedDay(LocalDate.of(2026, 10, 30), 325000);
        Work sunday = extraWorkedDay(LocalDate.of(2026, 11, 1), 325000);
        LocalDate monday = LocalDate.of(2026, 11, 2);
        assertThat(friday.snapshot().lines().getFirst().payoutDueDate()).isEqualTo(monday);
        assertThat(sunday.snapshot().lines().getFirst().payoutDueDate()).isEqualTo(monday);
        var targets = dao.balances(office, "PAYOUT", date);
        var allocation = List.of(new Allocation(targets.get(0).uuid(), amount(200000)), new Allocation(targets.get(1).uuid(), amount(100000)));
        var request = new RecordCash(UUID.randomUUID(), "PAYOUT", workerProfile.toString(), monday, amount(300000), "TRANSFER", null, allocation);
        Cash recorded = service.recordCash(login(), request);
        assertThat(recorded.allocations()).hasSize(2);
        assertThat(service.getBalances(login(), "PAYOUT", "ALL").totalOutstanding()).isEqualByComparingTo("350000");
        assertThat(service.listWork(login(), LocalDate.of(2026, 10, 30), LocalDate.of(2026, 10, 31)).summary().officePay()).isEqualByComparingTo("325000");
        assertThat(service.listWork(login(), LocalDate.of(2026, 11, 1), LocalDate.of(2026, 11, 1)).summary().officePay()).isEqualByComparingTo("325000");
        assertThat(service.listCash(login(), "PAYOUT", LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 31)).items()).isEmpty();
        assertThat(service.listCash(login(), "PAYOUT", monday, monday).items()).hasSize(1);
        var receipts = dao.balances(office, "RECEIPT", date);
        var receiptAllocations = receipts.stream().map(b -> new Allocation(b.uuid(), b.amount())).toList();
        BigDecimal receiptTotal = receipts.stream().map(Balance::amount).reduce(BigDecimal.ZERO, BigDecimal::add);
        service.recordCash(login(), new RecordCash(UUID.randomUUID(), "RECEIPT", client.toString(), monday, receiptTotal, "TRANSFER", null, receiptAllocations));
        assertThat(service.getBalances(login(), "RECEIPT", "ALL").items()).isEmpty();
        assertThat(service.getBalances(login(), "PAYOUT", "ALL").totalOutstanding()).isEqualByComparingTo("350000");
    }
}
