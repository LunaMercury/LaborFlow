package com.laborflow.core.finance.application;

import static com.laborflow.core.finance.application.FinanceRules.*;
import static org.junit.jupiter.api.Assertions.*;
import com.laborflow.core.finance.dto.FinanceDtos.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class FinanceRulesTest {
    private static BigDecimal n(String value) { return new BigDecimal(value); }
    private static final UUID ID=UUID.fromString("10000000-0000-4000-8000-000000000001");
    private static final LocalDate DATE=LocalDate.of(2026,10,25);
    private Line line(String mode,String charge,String pay) {
        return new Line(ID,ID,ID.toString(),"Worker","WORKED",null,null,60,mode,BigDecimal.ONE,
            null,null,charge==null ? null : n(charge),pay==null ? null : n(pay),false,DATE,null);
    }
    private Snapshot snapshot(List<Line> lines,List<Extra> extras) {
        return new Snapshot(DATE,ID,ID,"Client",ID,"Site","Work","hash","OFFICE",null,null,DATE,lines,extras,null);
    }
    @Test void officeProfitIncludesExtrasExactlyOnce() {
        Totals t=totals(snapshot(List.of(line("OFFICE","150000","130000")),
            List.of(new Extra(ID,"Meal","PER_JOB",BigDecimal.ONE,null,null,n("10000"),n("5000")))));
        assertEquals(n("160000"),t.officeCharge()); assertEquals(n("130000"),t.officePay());
        assertEquals(n("25000"),t.workProfit()); assertEquals(BigDecimal.ZERO,t.directPay());
    }
    @Test void directPayIsNotOfficeExpenseOrCash() {
        Totals t=totals(snapshot(List.of(line("DIRECT","20000","130000")),
            List.of(new Extra(ID,"Meal","PER_PERSON",BigDecimal.ONE,null,null,n("10000"),n("5000")))));
        assertEquals(n("30000"),t.officeCharge()); assertEquals(BigDecimal.ZERO,t.officePay());
        assertEquals(n("25000"),t.workProfit()); assertEquals(n("130000"),t.directPay());
    }
    @Test void mixedOfficeAndDirectWorkerExceptionsDoNotDoubleDeductDirectPay() {
        Totals t=totals(snapshot(List.of(line("OFFICE","150000","130000"),line("DIRECT","20000","130000")),List.of()));
        assertEquals(n("170000"),t.officeCharge()); assertEquals(n("130000"),t.officePay());
        assertEquals(n("130000"),t.directPay()); assertEquals(n("40000"),t.workProfit());
    }
    @Test void groupRatesHaveIndependentPayAndExact1440000Charges() {
        var lines=new java.util.ArrayList<Line>();
        for(int i=0;i<8;i++) lines.add(line("OFFICE","140000","110000"));
        for(int i=0;i<2;i++) lines.add(line("OFFICE","160000","120000"));
        Totals t=totals(snapshot(lines,List.of()));
        assertEquals(n("1440000"),t.officeCharge()); assertEquals(n("1120000"),t.officePay());
    }
    @Test void unenteredDoesNotBecomeZeroOrAnApparentlyKnownProfit() {
        assertNull(money(null)); assertNull(amount(BigDecimal.ONE,null,null));
        assertNull(totals(snapshot(List.of(line("OFFICE",null,"0")),List.of())).workProfit());
        assertEquals(BigDecimal.ZERO,totals(snapshot(List.of(line("OFFICE","0","0")),List.of())).workProfit());
    }
    @Test void roundingUsesHalfUpAndExplicitAmountTakesPrecedence() {
        assertEquals(n("2"),money(n("1.5")));
        assertEquals(n("500"),amount(n("0.333"),n("1500"),null));
        assertEquals(n("700"),amount(n("0.333"),n("1500"),n("700")));
    }
    @Test void validatesNegativeAmountsQuantityPrecisionAndAllOutputBounds() {
        assertThrows(FinanceException.class,() -> money(n("-0.1")));
        assertThrows(FinanceException.class,() -> money(MAX.add(BigDecimal.ONE)));
        assertThrows(FinanceException.class,() -> money(new BigDecimal("1E-2147483647")));
        assertThrows(FinanceException.class,() -> quantity(n("1.0001")));
        assertThrows(FinanceException.class,() -> quantity(BigDecimal.ZERO));
        assertEquals(n("1"),quantity(n("1.0000")));
        assertThrows(FinanceException.class,() -> amount(n("999999.999"),MAX,null));
        assertThrows(FinanceException.class,() -> totals(snapshot(List.of(line("OFFICE",MAX.toPlainString(),"0"),line("OFFICE","1","0")),List.of())));
        assertTrue(MAX.compareTo(n("9007199254740991"))<0);
        assertEquals(MAX.negate(),aggregate(MAX.negate()));
    }
    @Test void weeklyMondayThroughSundayPaysChosenFollowingWeekdayAcrossMonth() {
        assertEquals(LocalDate.of(2026,11,2),due(LocalDate.of(2026,10,26),"WEEKLY",1,null));
        assertEquals(LocalDate.of(2026,11,2),due(LocalDate.of(2026,11,1),"WEEKLY",1,null));
        assertEquals(LocalDate.of(2026,11,8),due(LocalDate.of(2026,10,31),"WEEKLY",7,null));
        assertEquals(DATE,due(DATE,"DAILY",1,null)); assertNull(due(DATE,"CUSTOM",1,null));
        assertThrows(FinanceException.class,() -> due(DATE,"WEEKLY",0,null));
    }
    private Assignment assignment(String assignmentStatus,String attendanceStatus,boolean confirmed) {
        return new Assignment(ID,ID,ID.toString(),"Name",assignmentStatus,attendanceStatus,confirmed,
            OffsetDateTime.parse("2026-10-25T08:00:00+09:00"),OffsetDateTime.parse("2026-10-25T12:00:00+09:00"),60,1);
    }
    private Source source(List<Assignment> assignments,String name,LocalDate date) {
        return new Source(ID,date,ID,ID,name,ID,"Site","Work",true,null,true,assignments);
    }
    @Test void actualConfirmedAttendanceIsAuthoritativeEvenIfAssignmentRemainsPlanned() {
        assertTrue(worked(assignment("PLANNED","WORKED",true)));
        assertFalse(worked(assignment("WORKED","DRAFT",false)));
        assertFalse(ready(List.of(assignment("WORKED","DRAFT",false))));
        assertTrue(ready(List.of(assignment("PLANNED","WORKED",true))));
        assertTrue(ready(List.of(assignment("CANCELLED","DRAFT",false))));
    }
    @Test void stableSourceHashIgnoresMutablePersonNamesButTracksActualFieldsDayAndRemoval() {
        Assignment original=assignment("PLANNED","WORKED",true);
        Source a=source(List.of(original),"Old client name",DATE);
        Source renamed=source(List.of(new Assignment(ID,ID,ID.toString(),"Renamed worker",original.assignmentStatus(),
            original.attendanceStatus(),original.confirmed(),original.actualStartAt(),original.actualEndAt(),original.breakMinutes(),1)),"Renamed client",DATE);
        assertEquals(sourceFingerprint(a),sourceFingerprint(renamed));
        assertNotEquals(sourceFingerprint(a),sourceFingerprint(source(List.of(),"Old client name",DATE)));
        assertNotEquals(sourceFingerprint(a),sourceFingerprint(source(List.of(original),"Old client name",DATE.plusDays(1))));
        assertNotEquals(sourceFingerprint(a),sourceFingerprint(source(List.of(assignment("PLANNED","ABSENT",true)),"Old client name",DATE)));
    }
    @Test void snapshotJsonRoundTripPreservesNullAmountsAndDecimalQuantityAndDates() {
        Snapshot s=snapshot(List.of(line("DIRECT",null,"0")),List.of());
        assertEquals(s,FinanceJson.read(FinanceJson.write(s),Snapshot.class));
    }
}
