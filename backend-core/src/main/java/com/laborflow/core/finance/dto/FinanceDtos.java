package com.laborflow.core.finance.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public final class FinanceDtos {
    private FinanceDtos() { }
    public record Assignment(UUID assignmentUuid, UUID workerProfileUuid, String payeeKey,
        String displayName, String assignmentStatus, String attendanceStatus, boolean confirmed,
        OffsetDateTime actualStartAt, OffsetDateTime actualEndAt, Integer breakMinutes, int workerCount) { }
    public record Source(UUID scheduleDayUuid, LocalDate workDate, UUID clientUuid,
        UUID clientProfileUuid, String clientName, UUID siteUuid, String siteName, String workTitle,
        boolean active, String fingerprint, boolean attendanceReady, List<Assignment> assignments) { }
    public record LineInput(UUID assignmentUuid, String mode, BigDecimal quantity,
        BigDecimal chargeRate, BigDecimal payRate, BigDecimal chargeAmount, BigDecimal payAmount,
        boolean override, LocalDate payoutDueDate, String note) { }
    public record Line(UUID assignmentUuid, UUID workerProfileUuid, String payeeKey,
        String displayName, String attendanceStatus, OffsetDateTime actualStartAt,
        OffsetDateTime actualEndAt, Integer breakMinutes, String mode, BigDecimal quantity,
        BigDecimal chargeRate, BigDecimal payRate, BigDecimal chargeAmount, BigDecimal payAmount,
        boolean override, LocalDate payoutDueDate, String note) { }
    public record Extra(UUID uuid, String name, String basis, BigDecimal quantity,
        BigDecimal chargeRate, BigDecimal costRate, BigDecimal chargeAmount, BigDecimal costAmount) { }
    public record SaveWork(long version, String status, String reason, String sourceFingerprint,
        String defaultMode, BigDecimal defaultChargeRate, BigDecimal defaultPayRate,
        LocalDate receiptDueDate, List<LineInput> lines, List<Extra> extras, String note) { }
    public record Snapshot(LocalDate workDate, UUID clientUuid, UUID clientProfileUuid,
        String clientName, UUID siteUuid, String siteName, String workTitle, String sourceFingerprint,
        String defaultMode, BigDecimal defaultChargeRate, BigDecimal defaultPayRate,
        LocalDate receiptDueDate, List<Line> lines, List<Extra> extras, String note) { }
    public record Totals(BigDecimal officeCharge, BigDecimal officePay, BigDecimal extraCost,
        BigDecimal workProfit, BigDecimal directPay) { }
    public record Revision(long version, String status, String reason, OffsetDateTime changedAt,
        UUID changedByAccountUuid, Snapshot snapshot) { }
    public record Work(UUID uuid, UUID scheduleDayUuid, long version, String status,
        String sourceStatus, boolean reviewRequired, Source currentSource, Snapshot snapshot,
        Totals totals, List<Revision> revisions) { }
    public record Summary(BigDecimal officeCharge, BigDecimal officePay, BigDecimal extraCost,
        BigDecimal workProfit, BigDecimal directPay, int confirmedCount, int unconfirmedCount,
        int reviewCount, int workerDayCount, int uniqueWorkerCount, int guestAttendanceCount) { }
    public record WorkList(List<Work> items, Summary summary) { }
    public record Balance(UUID uuid, UUID workUuid, UUID scheduleDayUuid, LocalDate workDate,
        String kind, String partyKey, String partyName, String clientName, String siteName,
        UUID assignmentUuid, BigDecimal amount, BigDecimal settledAmount,
        BigDecimal outstandingAmount, LocalDate originalDueDate, LocalDate dueDate, String status,
        boolean overdue, boolean reconciliationRequired, BigDecimal relatedReceiptOutstanding) { }
    public record Balances(List<Balance> items, BigDecimal totalAmount, BigDecimal totalSettled,
        BigDecimal totalOutstanding) { }
    public record Allocation(UUID obligationUuid, BigDecimal amount, LocalDate workDate,
        String siteName, String clientName) {
        public Allocation(UUID obligationUuid, BigDecimal amount) { this(obligationUuid,amount,null,null,null); }
    }
    public record CashBody(String kind, String partyKey, LocalDate cashDate, BigDecimal amount,
        String method, String memo, List<Allocation> allocations) { }
    public record RecordCash(UUID requestId, String kind, String partyKey, LocalDate cashDate,
        BigDecimal amount, String method, String memo, List<Allocation> allocations) {
        public CashBody body() { return new CashBody(kind, partyKey, cashDate, amount, method, memo, allocations); }
    }
    public record CancelCash(UUID requestId, String reason) { }
    public record CorrectCash(UUID requestId, String reason, CashBody replacement) { }
    public record Cash(UUID uuid, String kind, String partyKey, LocalDate cashDate,
        BigDecimal amount, String method, String memo, List<Allocation> allocations,
        OffsetDateTime createdAt, UUID createdByAccountUuid, boolean cancelled,
        String cancellationReason, OffsetDateTime cancelledAt, UUID replacesCashUuid, String partyName) {
        public Cash(UUID uuid, String kind, String partyKey, LocalDate cashDate, BigDecimal amount,
            String method, String memo, List<Allocation> allocations, OffsetDateTime createdAt,
            UUID createdByAccountUuid, boolean cancelled, String cancellationReason,
            OffsetDateTime cancelledAt, UUID replacesCashUuid) {
            this(uuid,kind,partyKey,cashDate,amount,method,memo,allocations,createdAt,createdByAccountUuid,
                cancelled,cancellationReason,cancelledAt,replacesCashUuid,null);
        }
    }
    public record CashList(List<Cash> items) { }
    public record WorkerOverride(UUID workerProfileUuid, String defaultMode, BigDecimal chargeRate,
        BigDecimal payRate, String payoutCycle, Integer weeklyPayday, LocalDate customDueDate) { }
    public record ClientOverride(UUID clientProfileUuid, String defaultMode, BigDecimal chargeRate,
        BigDecimal payRate) { }
    public record Settings(long version, String defaultMode, BigDecimal defaultChargeRate,
        BigDecimal defaultPayRate, String payoutCycle, Integer weeklyPayday, LocalDate customDueDate,
        List<WorkerOverride> workerOverrides, List<ClientOverride> clientOverrides) { }
    public record SaveSettings(long version, String defaultMode, BigDecimal defaultChargeRate,
        BigDecimal defaultPayRate, String payoutCycle, Integer weeklyPayday, LocalDate customDueDate,
        List<WorkerOverride> workerOverrides, List<ClientOverride> clientOverrides, String reason) { }
    public record Error(String code, String message) { }
}
