package com.laborflow.core.finance.application;

import static com.laborflow.core.finance.application.FinanceException.invalid;
import com.laborflow.core.finance.dto.FinanceDtos.*;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;

public final class FinanceRules {
    public static final BigDecimal MAX = new BigDecimal("999999999999");
    public static final BigDecimal ZERO = BigDecimal.ZERO;
    private FinanceRules() { }
    public static BigDecimal money(BigDecimal value) {
        if (value == null) return null;
        if (value.scale()>1000 || value.precision()>1000) throw invalid("Amount has too many decimal digits.");
        if (value.signum() < 0 || value.compareTo(MAX) > 0) throw invalid("Amount must be between 0 and 999999999999 KRW.");
        return value.setScale(0, RoundingMode.HALF_UP);
    }
    public static BigDecimal aggregate(BigDecimal value) {
        if (value.abs().compareTo(MAX) > 0) throw invalid("Total exceeds the supported KRW range; use a shorter period.");
        return value.setScale(0, RoundingMode.UNNECESSARY);
    }
    public static BigDecimal quantity(BigDecimal value) {
        if (value == null || value.signum() <= 0 || value.compareTo(new BigDecimal("999999.999")) > 0
            || value.stripTrailingZeros().scale() > 3) throw invalid("Quantity must be positive with at most 3 decimal places.");
        return value.stripTrailingZeros();
    }
    public static BigDecimal amount(BigDecimal quantity, BigDecimal rate, BigDecimal explicit) {
        return explicit != null ? money(explicit) : rate == null ? null : money(quantity.multiply(rate));
    }
    public static String choice(String value, Set<String> options, String field) {
        if (value == null || !options.contains(value)) throw invalid("Choose a valid " + field + ".");
        return value;
    }
    public static String mode(String value) { return choice(value, Set.of("OFFICE", "DIRECT"), "payment mode"); }
    public static String kind(String value) { return choice(value, Set.of("RECEIPT", "PAYOUT", "DIRECT"), "ledger kind"); }
    public static String text(String value, int max) {
        if (value == null || value.isBlank()) return null;
        String result = value.trim();
        if (result.length() > max) throw invalid("Text exceeds " + max + " characters.");
        return result;
    }
    public static String requiredText(String value, int max, String field) {
        String result = text(value, max);
        if (result == null) throw invalid(field + " is required.");
        return result;
    }
    public static LocalDate due(LocalDate workDate, String cycle, Integer weekday, LocalDate custom) {
        choice(cycle, Set.of("DAILY", "WEEKLY", "CUSTOM"), "payout cycle");
        if (weekday == null || weekday < 1 || weekday > 7) throw invalid("Weekly payday must be 1 (Monday) through 7 (Sunday).");
        return switch (cycle) {
            case "DAILY" -> workDate;
            case "WEEKLY" -> workDate.minusDays(workDate.getDayOfWeek().getValue() - 1L).plusDays(7L + weekday - 1L);
            default -> custom;
        };
    }
    public static boolean worked(Assignment a) { return a.confirmed() && "WORKED".equals(a.attendanceStatus()); }
    public static boolean ready(List<Assignment> assignments) {
        return assignments.stream().filter(a -> worked(a)
            || !("CANCELLED".equals(a.assignmentStatus()) || "REPLACED".equals(a.assignmentStatus())))
            .allMatch(a -> a.confirmed() && !"DRAFT".equals(a.attendanceStatus()));
    }
    public static String sourceFingerprint(Source source) {
        var facts=source.assignments().stream().sorted(java.util.Comparator.comparing(a -> a.assignmentUuid().toString()))
            .map(a -> java.util.Arrays.asList(a.assignmentUuid(),a.workerProfileUuid(),a.payeeKey(),a.assignmentStatus(),
                a.attendanceStatus(),a.confirmed(),a.actualStartAt(),a.actualEndAt(),a.breakMinutes(),a.workerCount())).toList();
        return FinanceJson.hash(java.util.Arrays.asList(source.scheduleDayUuid(),source.workDate(),source.clientUuid(),
            source.siteUuid(),source.siteName(),source.workTitle(),source.active(),facts));
    }
    public static Totals totals(Snapshot snapshot) {
        BigDecimal charge = ZERO, pay = ZERO, cost = ZERO, direct = ZERO;
        boolean complete = true;
        for (Line line : snapshot.lines()) {
            complete &= line.chargeAmount() != null && line.payAmount() != null;
            if (line.chargeAmount() != null) charge = charge.add(line.chargeAmount());
            if (line.payAmount() != null) {
                if ("OFFICE".equals(line.mode())) pay = pay.add(line.payAmount());
                else direct = direct.add(line.payAmount());
            }
        }
        for (Extra extra : snapshot.extras()) {
            complete &= extra.chargeAmount() != null && extra.costAmount() != null;
            if (extra.chargeAmount() != null) charge = charge.add(extra.chargeAmount());
            if (extra.costAmount() != null) cost = cost.add(extra.costAmount());
        }
        return new Totals(aggregate(charge), aggregate(pay), aggregate(cost),
            complete ? aggregate(charge.subtract(pay).subtract(cost)) : null, aggregate(direct));
    }
    public static Totals zeroTotals() { return new Totals(ZERO, ZERO, ZERO, ZERO, ZERO); }
}
