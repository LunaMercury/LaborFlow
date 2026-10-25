package com.laborflow.core.finance.application;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import com.laborflow.core.finance.dao.FinanceDao;
import com.laborflow.core.finance.dao.FinanceDao.*;
import com.laborflow.core.finance.dto.FinanceDtos.*;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.annotation.Transactional;

class FinanceServiceTest {
    private FinanceDao dao;
    private FinanceService service;
    private static final UUID OFFICE=id(1),ACCOUNT=id(2),DAY=id(3),SITE=id(4),CLIENT=id(5),PROFILE=id(6),WORKER=id(7),ASSIGNMENT=id(8),WORK=id(9),OBLIGATION=id(10),CASH=id(11),REQUEST=id(12);
    private static final LocalDate DATE=LocalDate.of(2026,10,25);
    private static UUID id(int n) { return UUID.fromString("10000000-0000-4000-8000-"+String.format("%012d",n)); }
    private static BigDecimal n(long value) { return BigDecimal.valueOf(value); }
    @BeforeEach void setup() {
        dao=mock(FinanceDao.class);
        service=new FinanceService(dao,Clock.fixed(Instant.parse("2026-10-24T16:00:00Z"),ZoneOffset.UTC));
        when(dao.account("demo")).thenReturn(Optional.of(new Account(ACCOUNT,OFFICE)));
        when(dao.ownsWorker(OFFICE,WORKER)).thenReturn(true);
        when(dao.source(OFFICE,DAY)).thenReturn(Optional.of(source("stable",List.of(assignment(true,1)))));
        when(dao.work(OFFICE,WORK)).thenReturn(Optional.of(stored(false,snapshot(n(150000),n(130000)))));
        when(dao.updateWork(any(),any(),anyString(),nullable(String.class),any())).thenAnswer(call -> {
            StoredWork old=call.getArgument(1);
            return new StoredWork(WORK,DAY,old.version()+1,call.getArgument(2),
                old.everConfirmed() || "CONFIRMED".equals(call.getArgument(2)),call.getArgument(4));
        });
        when(dao.insertWork(any(),eq(DAY),any())).thenAnswer(call -> stored(false,call.getArgument(2)));
    }
    private Assignment assignment(boolean confirmed,int workerCount) {
        return new Assignment(ASSIGNMENT,WORKER,WORKER.toString(),"Worker","PLANNED",
            confirmed ? "WORKED" : "DRAFT",confirmed,null,null,60,workerCount);
    }
    private Source source(String fingerprint,List<Assignment> rows) {
        return new Source(DAY,DATE,CLIENT,PROFILE,"Client",SITE,"Site","Work",true,fingerprint,FinanceRules.ready(rows),rows);
    }
    private Snapshot snapshot(BigDecimal charge,BigDecimal pay) {
        return new Snapshot(DATE,CLIENT,PROFILE,"Client",SITE,"Site","Work","stable","OFFICE",null,null,DATE,
            List.of(new Line(ASSIGNMENT,WORKER,WORKER.toString(),"Worker","WORKED",null,null,60,"OFFICE",BigDecimal.ONE,
                null,null,charge,pay,true,DATE,"early finish manually reviewed")),List.of(),null);
    }
    private StoredWork stored(boolean confirmed,Snapshot snapshot) {
        return new StoredWork(WORK,DAY,1,confirmed ? "CONFIRMED" : "DRAFT",confirmed,snapshot);
    }
    private SaveWork save(String status,String reason,BigDecimal charge,BigDecimal pay) {
        return new SaveWork(1,status,reason,"stable","OFFICE",n(140000),n(120000),DATE,
            List.of(new LineInput(ASSIGNMENT,"OFFICE",BigDecimal.ONE,null,null,charge,pay,true,DATE,"early finish")),List.of(),null);
    }
    private Balance balance(UUID id,String kind,String party,long amount,long settled) {
        BigDecimal remaining=n(amount-settled);
        return new Balance(id,WORK,DAY,DATE,kind,party,"Party","Client","Site",kind.equals("RECEIPT") ? null : ASSIGNMENT,
            n(amount),n(settled),remaining,DATE,DATE,settled==0 ? "UNPAID" : remaining.signum()<0 ? "OVERPAID" : "PARTIAL",
            false,remaining.signum()<0,n(150000));
    }
    private Cash cash(boolean cancelled) {
        return new Cash(CASH,"PAYOUT",WORKER.toString(),DATE,n(300000),"TRANSFER",null,List.of(new Allocation(OBLIGATION,n(300000))),
            OffsetDateTime.parse("2026-10-25T09:00:00Z"),ACCOUNT,cancelled,cancelled ? "Wrong amount" : null,
            cancelled ? OffsetDateTime.parse("2026-10-25T10:00:00Z") : null,null);
    }
    private RecordCash record(UUID request,long amount) {
        return new RecordCash(request,"PAYOUT",WORKER.toString(),DATE,n(amount),"TRANSFER",null,List.of(new Allocation(OBLIGATION,n(amount))));
    }
    @Test void noActualAttendanceMeansNoInferredDraftLinesAndPrepareIsExplicitAndRepeatable() {
        when(dao.source(OFFICE,DAY)).thenReturn(Optional.of(source("draft",List.of(assignment(false,1)))));
        Work prepared=service.prepareWork("demo",DAY);
        assertTrue(prepared.snapshot().lines().isEmpty()); assertEquals("ATTENDANCE_UNCONFIRMED",prepared.sourceStatus());
        verify(dao).insertWork(any(),eq(DAY),any());
        when(dao.workByDay(OFFICE,DAY)).thenReturn(Optional.of(stored(false,prepared.snapshot())));
        service.prepareWork("demo",DAY);
        verify(dao,times(1)).insertWork(any(),eq(DAY),any());
        verify(dao,never()).syncObligations(any(),any());
    }
    @Test void settingsApplyOfficeThenOriginalClientThenWorkerWithoutChangingQuantityForBundle() {
        when(dao.source(OFFICE,DAY)).thenReturn(Optional.of(source("bundle",List.of(assignment(true,3)))));
        when(dao.settings(OFFICE)).thenReturn(Optional.of(new Settings(4,"OFFICE",n(150000),n(130000),"DAILY",1,null,
            List.of(new WorkerOverride(WORKER,null,null,n(135000),"WEEKLY",1,null)),
            List.of(new ClientOverride(PROFILE,"DIRECT",n(20000),null)))));
        Work draft=service.prepareWork("demo",DAY);
        Line line=draft.snapshot().lines().getFirst();
        assertEquals("DIRECT",line.mode()); assertEquals(n(20000),line.chargeAmount());
        assertEquals(n(135000),line.payAmount()); assertEquals(BigDecimal.ONE,line.quantity());
        assertEquals(LocalDate.of(2026,10,26),line.payoutDueDate()); assertTrue(line.override());
    }
    @Test void confirmedActualAttendanceAllowsPlannedAssignmentButEarlyFinishDoesNotProrateMoney() {
        Work saved=service.saveWork("demo",WORK,save("CONFIRMED",null,n(150000),n(130000)));
        assertEquals(n(150000),saved.totals().officeCharge()); assertEquals(n(130000),saved.totals().officePay());
        assertEquals(n(140000),saved.snapshot().defaultChargeRate());
        assertEquals(n(150000),saved.snapshot().lines().getFirst().chargeAmount());
        assertTrue(saved.snapshot().lines().getFirst().override());
        verify(dao).syncObligations(eq(OFFICE),any());
    }
    @Test void unconfirmedAndAmbiguousBundleFinancialConfirmationAreBlocked() {
        when(dao.source(OFFICE,DAY)).thenReturn(Optional.of(source("stable",List.of(assignment(false,1)))));
        assertThrows(FinanceException.class,() -> service.saveWork("demo",WORK,save("CONFIRMED",null,n(1),n(1))));
        when(dao.source(OFFICE,DAY)).thenReturn(Optional.of(source("stable",List.of(assignment(true,2)))));
        assertTrue(assertThrows(FinanceException.class,() -> service.saveWork("demo",WORK,save("CONFIRMED",null,n(1),n(1))))
            .getMessage().contains("individual assignments"));
        verify(dao,never()).updateWork(any(),any(),anyString(),any(),any());
    }
    @Test void confirmationRequiresEnteredAmountsButExplicitZeroIsValid() {
        assertThrows(FinanceException.class,() -> service.saveWork("demo",WORK,save("CONFIRMED",null,null,n(0))));
        Work zero=service.saveWork("demo",WORK,save("CONFIRMED",null,n(0),n(0)));
        assertEquals(BigDecimal.ZERO,zero.totals().workProfit());
    }
    @Test void draftMayKeepNullWithoutCreatingObligations() {
        Work draft=service.saveWork("demo",WORK,save("DRAFT",null,null,n(0)));
        assertNull(draft.snapshot().lines().getFirst().chargeAmount()); assertNull(draft.totals().workProfit());
        verify(dao,never()).syncObligations(any(),any());
    }
    @Test void staleVersionAndChangedSourceRejectBeforeAnyMoneyMutation() {
        SaveWork r=save("CONFIRMED",null,n(1),n(1));
        SaveWork stale=new SaveWork(0,r.status(),r.reason(),r.sourceFingerprint(),r.defaultMode(),r.defaultChargeRate(),r.defaultPayRate(),r.receiptDueDate(),r.lines(),r.extras(),r.note());
        assertEquals(409,assertThrows(FinanceException.class,() -> service.saveWork("demo",WORK,stale)).status());
        when(dao.source(OFFICE,DAY)).thenReturn(Optional.of(source("changed",List.of(assignment(true,1)))));
        assertThrows(FinanceException.class,() -> service.saveWork("demo",WORK,r));
        verify(dao,never()).updateWork(any(),any(),anyString(),any(),any());
    }
    @Test void confirmedRevisionsRequireReasonCannotDemoteAndKeepOriginalCash() {
        when(dao.work(OFFICE,WORK)).thenReturn(Optional.of(stored(true,snapshot(n(150000),n(130000)))));
        assertThrows(FinanceException.class,() -> service.saveWork("demo",WORK,save("CONFIRMED"," ",n(50000),n(40000))));
        assertThrows(FinanceException.class,() -> service.saveWork("demo",WORK,save("DRAFT","reason",n(50000),n(40000))));
        Work revision=service.saveWork("demo",WORK,save("CONFIRMED","Attendance reviewed",n(50000),n(40000)));
        assertEquals(2,revision.version());
        verify(dao).updateWork(any(),any(),eq("CONFIRMED"),eq("Attendance reviewed"),any());
        verify(dao,never()).cancelCash(any(),any(),any()); verify(dao,never()).insertCash(any(),any(),any());
    }
    @Test void changedAttendanceShowsReviewWithoutReplacingApprovedAmount() {
        Snapshot snapshot=snapshot(n(150000),n(130000));
        when(dao.work(OFFICE,WORK)).thenReturn(Optional.of(stored(true,snapshot)));
        when(dao.source(OFFICE,DAY)).thenReturn(Optional.of(source("changed",List.of())));
        Work detail=service.getWork("demo",WORK);
        assertTrue(detail.reviewRequired()); assertEquals(n(150000),detail.totals().officeCharge()); assertEquals(snapshot,detail.snapshot());
        verify(dao,never()).updateWork(any(),any(),anyString(),any(),any());
    }
    @Test void confirmedDueOrAmountCorrectionKeepsHistoricalWorkerNameAndRejectsSameAssignmentRetarget() {
        when(dao.work(OFFICE,WORK)).thenReturn(Optional.of(stored(true,snapshot(n(150000),n(130000)))));
        Assignment renamed=new Assignment(ASSIGNMENT,WORKER,WORKER.toString(),"New profile display name","PLANNED","WORKED",true,null,null,60,1);
        when(dao.source(OFFICE,DAY)).thenReturn(Optional.of(source("stable",List.of(renamed))));
        Work corrected=service.saveWork("demo",WORK,save("CONFIRMED","Rescheduled after review",n(150000),n(130000)));
        assertEquals("Worker",corrected.snapshot().lines().getFirst().displayName());
        assertEquals("New profile display name",corrected.currentSource().assignments().getFirst().displayName());
        Assignment guest=new Assignment(ASSIGNMENT,null,"guest:"+ASSIGNMENT,"Guest","PLANNED","WORKED",true,null,null,60,1);
        when(dao.source(OFFICE,DAY)).thenReturn(Optional.of(source("stable",List.of(guest))));
        assertThrows(FinanceException.class,() -> service.saveWork("demo",WORK,save("CONFIRMED","Identity edited",n(150000),n(130000))));
    }
    @Test void cancelledGroupedAssignmentAlsoBlocksConfirmationUnderApprovedPolicy() {
        Assignment cancelled=new Assignment(id(77),null,"guest:"+id(77),"Group","CANCELLED","DRAFT",false,null,null,0,2);
        when(dao.source(OFFICE,DAY)).thenReturn(Optional.of(source("stable",List.of(assignment(true,1),cancelled))));
        assertThrows(FinanceException.class,() -> service.saveWork("demo",WORK,save("CONFIRMED",null,n(150000),n(130000))));
    }
    @Test void uniqueWorkersCountOnlyRegisteredProfilesWhileGuestRowsAreSeparateAttendanceInstances() {
        Snapshot guestSnapshot=new Snapshot(DATE,CLIENT,PROFILE,"Client",SITE,"Site","Work","stable","OFFICE",null,null,DATE,
            List.of(new Line(ASSIGNMENT,WORKER,WORKER.toString(),"Registered","WORKED",null,null,60,"OFFICE",BigDecimal.ONE,null,null,n(100),n(50),false,DATE,null),
                new Line(id(33),null,"guest:"+id(33),"Guest","WORKED",null,null,60,"OFFICE",BigDecimal.ONE,null,null,n(100),n(50),false,DATE,null)),List.of(),null);
        when(dao.works(OFFICE,null,null)).thenReturn(List.of(stored(true,guestSnapshot)));
        Summary summary=service.listWork("demo",null,null).summary();
        assertEquals(2,summary.workerDayCount()); assertEquals(1,summary.uniqueWorkerCount()); assertEquals(1,summary.guestAttendanceCount());
    }
    @Test void changedPartyIdentityBlocksReconfirmationAndDoesNotRetargetCash() {
        Source original=source("stable",List.of(assignment(true,1)));
        Source foreignClient=new Source(DAY,DATE,id(99),null,"Different client",SITE,"Site","Work",true,"stable",true,original.assignments());
        when(dao.source(OFFICE,DAY)).thenReturn(Optional.of(foreignClient));
        assertThrows(FinanceException.class,() -> service.saveWork("demo",WORK,save("CONFIRMED","review",n(1),n(1))));
        verify(dao,never()).syncObligations(any(),any());
    }
    @Test void duplicateAssignmentsAndMissingActualWorkedRowsReject() {
        SaveWork r=save("CONFIRMED",null,n(1),n(1));
        assertThrows(FinanceException.class,() -> service.saveWork("demo",WORK,new SaveWork(1,r.status(),null,"stable","OFFICE",null,null,DATE,
            List.of(r.lines().getFirst(),r.lines().getFirst()),List.of(),null)));
        assertThrows(FinanceException.class,() -> service.saveWork("demo",WORK,new SaveWork(1,r.status(),null,"stable","OFFICE",null,null,DATE,List.of(),List.of(),null)));
    }
    @Test void partialWeeklyPaymentAndOldOverpaymentsRemainVisibleIndependentOfProfitDateFilters() {
        Balance partial=balance(OBLIGATION,"PAYOUT",WORKER.toString(),650000,300000);
        Balance overpaid=balance(id(44),"PAYOUT",WORKER.toString(),20000,30000);
        when(dao.balances(OFFICE,"PAYOUT",DATE)).thenReturn(List.of(partial,overpaid));
        Balances result=service.getBalances("demo","PAYOUT","ALL");
        assertEquals(2,result.items().size()); assertEquals(n(340000),result.totalOutstanding());
        assertEquals(n(-10000),result.items().get(1).outstandingAmount()); assertTrue(result.items().get(1).reconciliationRequired());
    }
    @Test void seoulDateNotServerUtcControlsDueToday() {
        when(dao.balances(OFFICE,"PAYOUT",DATE)).thenReturn(List.of(balance(OBLIGATION,"PAYOUT",WORKER.toString(),1,0)));
        assertEquals(1,service.getBalances("demo","PAYOUT","TODAY").items().size());
    }
    @Test void aggregateOverflowRejectsRatherThanReturningUnsafeJsonNumbers() {
        when(dao.balances(OFFICE,"PAYOUT",DATE)).thenReturn(List.of(balance(OBLIGATION,"PAYOUT",WORKER.toString(),999999999999L,0),
            balance(id(44),"PAYOUT",WORKER.toString(),1,0)));
        assertThrows(FinanceException.class,() -> service.getBalances("demo","PAYOUT","ALL"));
    }
    @Test void cashRequestLocksOfficeBeforeIdempotencyAndBalanceValidation() {
        when(dao.obligation(OFFICE,OBLIGATION,DATE)).thenReturn(Optional.of(balance(OBLIGATION,"PAYOUT",WORKER.toString(),650000,0)));
        when(dao.insertCash(any(),any(),isNull())).thenReturn(cash(false));
        service.recordCash("demo",record(REQUEST,300000));
        var order=inOrder(dao);
        order.verify(dao).account("demo"); order.verify(dao).lockOffice(OFFICE);
        order.verify(dao).request(OFFICE,REQUEST); order.verify(dao).obligation(OFFICE,OBLIGATION,DATE);
        order.verify(dao).insertCash(any(),any(),isNull()); order.verify(dao).saveRequest(eq(OFFICE),eq(REQUEST),anyString(),any());
    }
    @Test void requestAllocationLabelsAreIgnoredAndCannotChangeIdempotencyOrHistoricalNames() {
        when(dao.obligation(OFFICE,OBLIGATION,DATE)).thenReturn(Optional.of(balance(OBLIGATION,"PAYOUT",WORKER.toString(),650000,0)));
        when(dao.insertCash(any(),any(),isNull())).thenReturn(cash(false));
        RecordCash request=new RecordCash(REQUEST,"PAYOUT",WORKER.toString(),DATE,n(300000),"TRANSFER",null,
            List.of(new Allocation(OBLIGATION,n(300000),DATE.minusYears(1),"Forged site","Forged client")));
        service.recordCash("demo",request);
        verify(dao).insertCash(any(),argThat(body -> body.allocations().getFirst().workDate()==null
            && body.allocations().getFirst().siteName()==null && body.allocations().getFirst().clientName()==null),isNull());
        verify(dao).saveRequest(eq(OFFICE),eq(REQUEST),eq(FinanceJson.hash(List.of("RECORD",record(REQUEST,300000).body()))),any());
    }
    @Test void idempotentReplayNormalizesMoneyAndDoesNotReallocateOrDuplicateAudit() {
        CashBody body=record(REQUEST,300000).body();
        String hash=FinanceJson.hash(List.of("RECORD",body));
        when(dao.request(OFFICE,REQUEST)).thenReturn(Optional.of(new RequestResult(hash,cash(false))));
        RecordCash retry=new RecordCash(REQUEST,"PAYOUT",WORKER.toString(),DATE,new BigDecimal("300000.0"),"TRANSFER"," ",
            List.of(new Allocation(OBLIGATION,new BigDecimal("300000.00"))));
        assertEquals(CASH,service.recordCash("demo",retry).uuid());
        verify(dao,never()).obligation(any(),any(),any()); verify(dao,never()).insertCash(any(),any(),any());
        verify(dao,never()).saveRequest(any(),any(),any(),any());
        assertEquals(409,assertThrows(FinanceException.class,() -> service.recordCash("demo",record(REQUEST,300001))).status());
    }
    @Test void allocationsCannotOverpayUseForeignTargetsOrMixedPartyAndKind() {
        when(dao.obligation(OFFICE,OBLIGATION,DATE)).thenReturn(Optional.of(balance(OBLIGATION,"PAYOUT",WORKER.toString(),300000,200000)));
        assertThrows(FinanceException.class,() -> service.recordCash("demo",record(REQUEST,100001)));
        when(dao.obligation(OFFICE,OBLIGATION,DATE)).thenReturn(Optional.empty());
        assertEquals(404,assertThrows(FinanceException.class,() -> service.recordCash("demo",record(REQUEST,1))).status());
        when(dao.obligation(OFFICE,OBLIGATION,DATE)).thenReturn(Optional.of(balance(OBLIGATION,"DIRECT",WORKER.toString(),300000,0)));
        assertThrows(FinanceException.class,() -> service.recordCash("demo",record(REQUEST,1)));
        when(dao.obligation(OFFICE,OBLIGATION,DATE)).thenReturn(Optional.of(balance(OBLIGATION,"PAYOUT",id(90).toString(),300000,0)));
        assertThrows(FinanceException.class,() -> service.recordCash("demo",record(REQUEST,1)));
        verify(dao,never()).insertCash(any(),any(),any());
    }
    @Test void allocationSumDuplicatesAndNonpositiveAmountsRejectBeforePersistence() {
        assertThrows(FinanceException.class,() -> service.recordCash("demo",record(REQUEST,0)));
        assertThrows(FinanceException.class,() -> service.recordCash("demo",new RecordCash(REQUEST,"PAYOUT",WORKER.toString(),DATE,n(2),"TRANSFER",null,List.of(new Allocation(OBLIGATION,n(1))))));
        assertThrows(FinanceException.class,() -> service.recordCash("demo",new RecordCash(REQUEST,"PAYOUT",WORKER.toString(),DATE,n(2),"TRANSFER",null,List.of(new Allocation(OBLIGATION,n(1)),new Allocation(OBLIGATION,n(1))))));
        verify(dao,never()).insertCash(any(),any(),any());
    }
    @Test void cancellationRequiresReasonAndIsIdempotentIncludingNoSecondAudit() {
        assertThrows(FinanceException.class,() -> service.cancelCash("demo",CASH,new CancelCash(REQUEST," ")));
        when(dao.cash(OFFICE,CASH)).thenReturn(Optional.of(cash(false)),Optional.of(cash(true)));
        Cash cancelled=service.cancelCash("demo",CASH,new CancelCash(REQUEST,"Wrong amount"));
        String hash=FinanceJson.hash(List.of("CANCEL",CASH,"Wrong amount"));
        when(dao.request(OFFICE,REQUEST)).thenReturn(Optional.of(new RequestResult(hash,cancelled)));
        assertTrue(service.cancelCash("demo",CASH,new CancelCash(REQUEST,"Wrong amount")).cancelled());
        verify(dao,times(1)).cancelCash(any(),eq(CASH),eq("Wrong amount"));
        verify(dao,times(1)).saveRequest(any(),any(),any(),any());
    }
    @Test void correctionValidatesAllTargetsBeforeCancellationAndCanReuseReleasedAllocation() {
        when(dao.cash(OFFICE,CASH)).thenReturn(Optional.of(cash(false)));
        when(dao.obligation(OFFICE,OBLIGATION,DATE)).thenReturn(Optional.of(balance(OBLIGATION,"PAYOUT",WORKER.toString(),650000,300000)));
        when(dao.insertCash(any(),any(),eq(CASH))).thenReturn(cash(false));
        service.correctCash("demo",CASH,new CorrectCash(REQUEST,"Fix amount",record(REQUEST,650000).body()));
        var order=inOrder(dao);
        order.verify(dao).obligation(OFFICE,OBLIGATION,DATE); order.verify(dao).cancelCash(any(),eq(CASH),eq("Fix amount"));
        order.verify(dao).insertCash(any(),any(),eq(CASH));
        clearInvocations(dao);
        when(dao.obligation(OFFICE,OBLIGATION,DATE)).thenReturn(Optional.empty());
        assertThrows(FinanceException.class,() -> service.correctCash("demo",CASH,new CorrectCash(id(25),"bad target",record(REQUEST,1).body())));
        verify(dao,never()).cancelCash(any(),any(),any());
    }
    @Test void settingsRequireVersionReasonAndOfficeOwnershipBeforeAudit() {
        SaveSettings r=new SaveSettings(0,"OFFICE",n(1),n(1),"DAILY",1,null,List.of(),List.of(new ClientOverride(PROFILE,null,n(5),null)),"Save client preset");
        assertEquals(404,assertThrows(FinanceException.class,() -> service.saveSettings("demo",r)).status());
        when(dao.ownsClient(OFFICE,PROFILE)).thenReturn(true);
        assertEquals(1,service.saveSettings("demo",r).version());
        verify(dao).saveSettings(any(),any(),eq("Save client preset"));
    }
    @Test void missingOrInactiveAccountCannotReadOrWrite() {
        assertEquals(404,assertThrows(FinanceException.class,() -> service.getWork("unknown",WORK)).status());
        assertThrows(FinanceException.class,() -> service.prepareWork(" ",DAY));
        verify(dao,never()).lockOffice(any());
    }
    @Test void allPublicMoneyMutationsDeclareTransactionsForAtomicRollback() throws Exception {
        for (String name : List.of("prepareWork","saveWork","recordCash","cancelCash","correctCash","saveSettings")) {
            var method=java.util.Arrays.stream(FinanceService.class.getMethods()).filter(m -> m.getName().equals(name)).findFirst().orElseThrow();
            assertNotNull(method.getAnnotation(Transactional.class),name);
            assertFalse(method.getAnnotation(Transactional.class).readOnly());
        }
    }
}
