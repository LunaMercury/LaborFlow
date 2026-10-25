package com.laborflow.core.finance.application;

import static com.laborflow.core.finance.application.FinanceException.*;
import static com.laborflow.core.finance.application.FinanceRules.*;
import com.laborflow.core.finance.dao.FinanceDao;
import com.laborflow.core.finance.dao.FinanceDao.*;
import com.laborflow.core.finance.dto.FinanceDtos.*;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Supplier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class FinanceService {
    private static final ZoneId BUSINESS_ZONE = ZoneId.of("Asia/Seoul");
    private final FinanceDao dao;
    private final Clock clock;
    @Autowired public FinanceService(FinanceDao dao) { this(dao,Clock.system(BUSINESS_ZONE)); }
    public FinanceService(FinanceDao dao, Clock clock) { this.dao=dao; this.clock=clock; }

    @Transactional(readOnly=true)
    public WorkList listWork(String loginId, LocalDate fromDate, LocalDate toDate) {
        range(fromDate,toDate);
        Account account=account(loginId);
        UUID office=account.agencyOwnerUuid();
        Map<UUID,StoredWork> saved=new LinkedHashMap<>();
        for (StoredWork work : dao.works(office,fromDate,toDate)) saved.put(work.scheduleDayUuid(),work);
        Set<UUID> days=new HashSet<>(saved.keySet());
        days.addAll(dao.sourceDays(office,fromDate,toDate));
        List<Work> items=new ArrayList<>();
        for (UUID day : days) {
            // A moved day may now have a different work date; retain the old confirmed
            // period until explicitly reapproved instead of double-counting it.
            StoredWork stored=saved.get(day);
            if (stored==null) {
                var historical=dao.workByDay(office,day);
                if (historical.isPresent()) continue;
            }
            Work item=view(office,day,stored,false);
            if (item.snapshot()!=null || item.currentSource()!=null) items.add(item);
        }
        items.sort(Comparator.comparing((Work w) -> w.snapshot()!=null ? w.snapshot().workDate() : w.currentSource().workDate())
            .reversed().thenComparing(w -> w.scheduleDayUuid().toString()));
        return new WorkList(List.copyOf(items),summary(items));
    }

    @Transactional
    public Work prepareWork(String loginId, UUID scheduleDayUuid) {
        Account account=locked(loginId);
        UUID office=account.agencyOwnerUuid();
        var previous=dao.workByDay(office,requiredId(scheduleDayUuid));
        if (previous.isPresent()) return view(office,scheduleDayUuid,previous.get(),true);
        Source source=dao.source(office,scheduleDayUuid).orElseThrow(FinanceException::missing);
        if (!source.active()) throw conflict("This schedule day is not active.");
        Settings defaults=settings(office);
        ClientOverride client=defaults.clientOverrides().stream()
            .filter(c -> c.clientProfileUuid().equals(source.clientProfileUuid())).findFirst().orElse(null);
        String mode=client!=null && client.defaultMode()!=null ? client.defaultMode() : defaults.defaultMode();
        BigDecimal charge=client!=null && client.chargeRate()!=null ? client.chargeRate() : defaults.defaultChargeRate();
        BigDecimal pay=client!=null && client.payRate()!=null ? client.payRate() : defaults.defaultPayRate();
        List<Line> lines=new ArrayList<>();
        for (Assignment assignment : source.assignments()) {
            if (!worked(assignment)) continue;
            WorkerOverride worker=defaults.workerOverrides().stream()
                .filter(w -> w.workerProfileUuid().equals(assignment.workerProfileUuid())).findFirst().orElse(null);
            String lineMode=worker!=null && worker.defaultMode()!=null ? worker.defaultMode() : mode;
            BigDecimal scheduledCharge="WOMEN".equals(assignment.area()) ? source.femaleChargeRate()
                : "MEN".equals(assignment.area()) ? source.maleChargeRate() : null;
            // Farm labour charges must not become the agency referral fee in DIRECT mode.
            BigDecimal lineCharge=worker!=null && worker.chargeRate()!=null ? worker.chargeRate()
                : "OFFICE".equals(lineMode) && scheduledCharge!=null ? scheduledCharge : charge;
            BigDecimal linePay=worker!=null && worker.payRate()!=null ? worker.payRate() : pay;
            LocalDate payout=worker==null ? due(source.workDate(),defaults.payoutCycle(),defaults.weeklyPayday(),defaults.customDueDate())
                : due(source.workDate(),worker.payoutCycle(),worker.weeklyPayday(),worker.customDueDate());
            lines.add(line(assignment,new LineInput(assignment.assignmentUuid(),lineMode,BigDecimal.ONE,
                lineCharge,linePay,null,null,worker!=null,payout,null)));
        }
        Snapshot snapshot=new Snapshot(source.workDate(),source.clientUuid(),source.clientProfileUuid(),source.clientName(),
            source.siteUuid(),source.siteName(),source.workTitle(),source.fingerprint(),mode,charge,pay,
            source.workDate(),List.copyOf(lines),List.of(),null);
        totals(snapshot);
        StoredWork created=dao.insertWork(account,scheduleDayUuid,snapshot);
        return view(office,scheduleDayUuid,created,true);
    }

    @Transactional(readOnly=true)
    public Work getWork(String loginId, UUID workUuid) {
        UUID office=account(loginId).agencyOwnerUuid();
        StoredWork stored=dao.work(office,requiredId(workUuid)).orElseThrow(FinanceException::missing);
        return view(office,stored.scheduleDayUuid(),stored,true);
    }

    @Transactional
    public Work saveWork(String loginId, UUID workUuid, SaveWork request) {
        if (request==null) throw invalid("Work details are required.");
        Account account=locked(loginId);
        UUID office=account.agencyOwnerUuid();
        StoredWork previous=dao.work(office,requiredId(workUuid)).orElseThrow(FinanceException::missing);
        if (request.version()!=previous.version()) throw conflict("This work was changed. Refresh before saving.");
        String status=choice(request.status(),Set.of("DRAFT","CONFIRMED"),"confirmation state");
        String reason=text(request.reason(),1000);
        if (previous.everConfirmed()) {
            if (!"CONFIRMED".equals(status)) throw conflict("Confirmed work cannot return to draft.");
            reason=requiredText(reason,1000,"Revision reason");
        }
        Source source=dao.source(office,previous.scheduleDayUuid()).orElseThrow(FinanceException::missing);
        if (!source.active()) throw conflict("The source schedule is unavailable. Keep the historical ledger.");
        if (!Objects.equals(request.sourceFingerprint(),source.fingerprint())) throw conflict("Attendance or schedule changed. Refresh and review the latest attendance.");
        Snapshot original=previous.snapshot();
        if (!original.siteUuid().equals(source.siteUuid()) || !original.clientUuid().equals(source.clientUuid())
            || !Objects.equals(original.clientProfileUuid(),source.clientProfileUuid()))
            throw conflict("The source client or site changed. Retain this historical ledger; do not transfer its payments.");
        boolean confirming="CONFIRMED".equals(status);
        if (confirming) {
            if (!source.attendanceReady()) throw conflict("Confirm actual attendance before confirming money.");
            if (source.assignments().stream().anyMatch(a -> a.workerCount()!=1))
                throw invalid("Grouped assignments require individual assignments and verified attendance before financial confirmation.");
            if (!previous.everConfirmed() && source.assignments().stream().noneMatch(FinanceRules::worked))
                throw invalid("No confirmed worked attendance is available.");
        }
        List<LineInput> inputs=requiredList(request.lines(),"Worker lines");
        Map<UUID,Assignment> actual=new LinkedHashMap<>();
        for (Assignment a : source.assignments()) if (worked(a)) actual.put(a.assignmentUuid(),a);
        Set<UUID> used=new HashSet<>();
        List<Line> lines=new ArrayList<>();
        for (LineInput input : inputs) {
            if (input==null || !used.add(requiredId(input.assignmentUuid()))) throw invalid("Duplicate or missing assignment.");
            Assignment assignment=actual.get(input.assignmentUuid());
            if (assignment==null) throw invalid("Choose only this day's confirmed worked assignments.");
            if (assignment.payeeKey()==null || (assignment.workerProfileUuid()!=null && !dao.ownsWorker(office,assignment.workerProfileUuid())))
                throw missing();
            Line saved=line(assignment,input);
            if (previous.everConfirmed()) {
                Line historical=original.lines().stream().filter(l -> l.assignmentUuid().equals(input.assignmentUuid())).findFirst().orElse(null);
                if (historical!=null) {
                    if (!historical.payeeKey().equals(saved.payeeKey())
                        || !Objects.equals(historical.workerProfileUuid(),saved.workerProfileUuid()))
                        throw conflict("This assignment's worker identity changed. Retain the original ledger and use a separate verified assignment.");
                    saved=new Line(saved.assignmentUuid(),historical.workerProfileUuid(),historical.payeeKey(),historical.displayName(),
                        saved.attendanceStatus(),saved.actualStartAt(),saved.actualEndAt(),saved.breakMinutes(),saved.mode(),saved.quantity(),
                        saved.chargeRate(),saved.payRate(),saved.chargeAmount(),saved.payAmount(),saved.override(),saved.payoutDueDate(),saved.note());
                }
            }
            if (confirming && (saved.chargeAmount()==null || saved.payAmount()==null)) throw invalid("Enter both charge and pay amounts, including explicit zero where applicable.");
            lines.add(saved);
        }
        if (!used.equals(actual.keySet())) throw conflict("Include every actual worked assignment. Refresh the attendance details.");
        List<Extra> extras=new ArrayList<>();
        Set<UUID> extraIds=new HashSet<>();
        for (Extra extra : requiredList(request.extras(),"Extra items")) {
            if (extra==null || !extraIds.add(requiredId(extra.uuid()))) throw invalid("Duplicate or missing extra item.");
            BigDecimal q=quantity(extra.quantity()), chargeRate=money(extra.chargeRate()), costRate=money(extra.costRate());
            Extra saved=new Extra(extra.uuid(),requiredText(extra.name(),100,"Extra item name"),
                choice(extra.basis(),Set.of("PER_PERSON","PER_JOB"),"extra basis"),q,chargeRate,costRate,
                amount(q,chargeRate,extra.chargeAmount()),amount(q,costRate,extra.costAmount()));
            if (confirming && (saved.chargeAmount()==null || saved.costAmount()==null)) throw invalid("Enter extra charge and actual office cost, including explicit zero where applicable.");
            extras.add(saved);
        }
        lines.sort(Comparator.comparing(l -> l.assignmentUuid().toString()));
        extras.sort(Comparator.comparing(e -> e.uuid().toString()));
        Snapshot snapshot=new Snapshot(source.workDate(),original.clientUuid(),original.clientProfileUuid(),original.clientName(),
            original.siteUuid(),source.siteName(),source.workTitle(),source.fingerprint(),mode(request.defaultMode()),
            money(request.defaultChargeRate()),money(request.defaultPayRate()),request.receiptDueDate(),List.copyOf(lines),
            List.copyOf(extras),text(request.note(),1000));
        totals(snapshot);
        StoredWork saved=dao.updateWork(account,previous,status,reason,snapshot);
        if (confirming) dao.syncObligations(office,saved);
        return view(office,previous.scheduleDayUuid(),saved,true);
    }

    @Transactional(readOnly=true)
    public Balances getBalances(String loginId, String kind, String filter) {
        UUID office=account(loginId).agencyOwnerUuid();
        kind(kind);
        choice(filter,Set.of("ALL","TODAY","OVERDUE","FUTURE"),"due-date filter");
        LocalDate today=today();
        List<Balance> items=dao.balances(office,kind,today).stream().filter(b -> b.outstandingAmount().signum()!=0)
            .filter(b -> switch(filter) {
                case "TODAY" -> today.equals(b.dueDate());
                case "OVERDUE" -> b.overdue();
                case "FUTURE" -> b.dueDate()!=null && b.dueDate().isAfter(today);
                default -> true;
            }).toList();
        return new Balances(items,sum(items.stream().map(Balance::amount).toList()),
            sum(items.stream().map(Balance::settledAmount).toList()),sum(items.stream().map(Balance::outstandingAmount).toList()));
    }

    @Transactional(readOnly=true)
    public CashList listCash(String loginId, String kind, LocalDate fromDate, LocalDate toDate) {
        range(fromDate,toDate);
        UUID office=account(loginId).agencyOwnerUuid();
        if (kind!=null) kind(kind);
        return new CashList(dao.cashList(office,kind,fromDate,toDate));
    }

    @Transactional
    public Cash recordCash(String loginId, RecordCash request) {
        if (request==null) throw invalid("Cash details are required.");
        Account account=locked(loginId);
        CashBody body=normalizeCash(request.body());
        return idempotent(account,request.requestId(),List.of("RECORD",body),() -> {
            validateAllocations(account.agencyOwnerUuid(),body,null);
            return dao.insertCash(account,body,null);
        });
    }

    @Transactional
    public Cash cancelCash(String loginId, UUID cashUuid, CancelCash request) {
        if (request==null) throw invalid("Cancellation details are required.");
        Account account=locked(loginId);
        String reason=requiredText(request.reason(),1000,"Cancellation reason");
        requiredId(cashUuid);
        return idempotent(account,request.requestId(),List.of("CANCEL",cashUuid,reason),() -> {
            Cash original=dao.cash(account.agencyOwnerUuid(),cashUuid).orElseThrow(FinanceException::missing);
            if (original.cancelled()) throw conflict("This cash record is already cancelled.");
            dao.cancelCash(account,cashUuid,reason);
            return dao.cash(account.agencyOwnerUuid(),cashUuid).orElseThrow(FinanceException::missing);
        });
    }

    @Transactional
    public Cash correctCash(String loginId, UUID cashUuid, CorrectCash request) {
        if (request==null) throw invalid("Correction details are required.");
        Account account=locked(loginId);
        requiredId(cashUuid);
        String reason=requiredText(request.reason(),1000,"Correction reason");
        CashBody body=normalizeCash(request.replacement());
        return idempotent(account,request.requestId(),List.of("CORRECT",cashUuid,reason,body),() -> {
            Cash original=dao.cash(account.agencyOwnerUuid(),cashUuid).orElseThrow(FinanceException::missing);
            if (original.cancelled()) throw conflict("This cash record is already cancelled.");
            // Validate with the old allocations released, without a partial write.
            validateAllocations(account.agencyOwnerUuid(),body,original);
            dao.cancelCash(account,cashUuid,reason);
            return dao.insertCash(account,body,cashUuid);
        });
    }

    @Transactional(readOnly=true)
    public Settings getSettings(String loginId) { return settings(account(loginId).agencyOwnerUuid()); }

    @Transactional
    public Settings saveSettings(String loginId, SaveSettings request) {
        if (request==null) throw invalid("Settings are required.");
        Account account=locked(loginId);
        Settings previous=settings(account.agencyOwnerUuid());
        if (request.version()!=previous.version()) throw conflict("Settings changed. Refresh before saving.");
        String reason=requiredText(request.reason(),1000,"Settings change reason");
        String mode=mode(request.defaultMode());
        validateCycle(request.payoutCycle(),request.weeklyPayday(),request.customDueDate());
        List<WorkerOverride> workers=new ArrayList<>();
        Set<UUID> used=new HashSet<>();
        for (WorkerOverride worker : optionalList(request.workerOverrides())) {
            if (worker==null || !used.add(requiredId(worker.workerProfileUuid()))) throw invalid("Duplicate or missing worker exception.");
            if (!dao.ownsWorker(account.agencyOwnerUuid(),worker.workerProfileUuid())) throw missing();
            if (worker.defaultMode()!=null) mode(worker.defaultMode());
            validateCycle(worker.payoutCycle(),worker.weeklyPayday(),worker.customDueDate());
            workers.add(new WorkerOverride(worker.workerProfileUuid(),worker.defaultMode(),money(worker.chargeRate()),
                money(worker.payRate()),worker.payoutCycle(),worker.weeklyPayday(),worker.customDueDate()));
        }
        List<ClientOverride> clients=new ArrayList<>();
        used.clear();
        for (ClientOverride client : optionalList(request.clientOverrides())) {
            if (client==null || !used.add(requiredId(client.clientProfileUuid()))) throw invalid("Duplicate or missing client preset.");
            if (!dao.ownsClient(account.agencyOwnerUuid(),client.clientProfileUuid())) throw missing();
            if (client.defaultMode()!=null) mode(client.defaultMode());
            clients.add(new ClientOverride(client.clientProfileUuid(),client.defaultMode(),money(client.chargeRate()),money(client.payRate())));
        }
        workers.sort(Comparator.comparing(w -> w.workerProfileUuid().toString()));
        clients.sort(Comparator.comparing(c -> c.clientProfileUuid().toString()));
        Settings saved=new Settings(previous.version()+1,mode,money(request.defaultChargeRate()),money(request.defaultPayRate()),
            request.payoutCycle(),request.weeklyPayday(),request.customDueDate(),List.copyOf(workers),List.copyOf(clients));
        dao.saveSettings(account,saved,reason);
        return saved;
    }

    private void validateCycle(String cycle, Integer day, LocalDate custom) { due(today(),cycle,day,custom); }
    private Settings settings(UUID office) {
        return dao.settings(office).orElseGet(() -> new Settings(0,"OFFICE",null,null,"DAILY",1,null,List.of(),List.of()));
    }
    private Account account(String loginId) {
        return dao.account(requiredText(loginId,100,"Login ID")).orElseThrow(FinanceException::missing);
    }
    private Account locked(String loginId) {
        Account account=account(loginId);
        dao.lockOffice(account.agencyOwnerUuid());
        return account;
    }
    private Work view(UUID office, UUID day, StoredWork stored, boolean history) {
        Source source=dao.source(office,day).orElse(null);
        String sourceStatus=source==null || !source.active() ? "UNAVAILABLE" : !source.attendanceReady() ? "ATTENDANCE_UNCONFIRMED"
            : source.assignments().stream().noneMatch(FinanceRules::worked) ? "NO_WORKED_ATTENDANCE" : "READY";
        boolean review=stored!=null && stored.everConfirmed() && (source==null || !source.active()
            || !stored.snapshot().sourceFingerprint().equals(source.fingerprint()));
        return new Work(stored==null ? null : stored.uuid(),day,stored==null ? 0 : stored.version(),
            stored==null ? "UNPREPARED" : stored.status(),sourceStatus,review,source,stored==null ? null : stored.snapshot(),
            stored==null ? zeroTotals() : totals(stored.snapshot()),stored!=null && history ? dao.revisions(office,stored.uuid()) : List.of());
    }
    private Line line(Assignment a, LineInput i) {
        BigDecimal q=quantity(i.quantity()), chargeRate=money(i.chargeRate()), payRate=money(i.payRate());
        return new Line(a.assignmentUuid(),a.workerProfileUuid(),a.payeeKey(),a.displayName(),a.attendanceStatus(),
            a.actualStartAt(),a.actualEndAt(),a.breakMinutes(),mode(i.mode()),q,chargeRate,payRate,
            amount(q,chargeRate,i.chargeAmount()),amount(q,payRate,i.payAmount()),i.override(),i.payoutDueDate(),text(i.note(),1000));
    }
    private Summary summary(List<Work> items) {
        BigDecimal charge=ZERO,pay=ZERO,cost=ZERO,profit=ZERO,direct=ZERO;
        int confirmed=0,pending=0,review=0,count=0,guests=0;
        Set<UUID> unique=new HashSet<>();
        for (Work work : items) {
            if (work.reviewRequired()) review++;
            if (!"CONFIRMED".equals(work.status())) { pending++; continue; }
            confirmed++;
            Totals t=work.totals(); charge=charge.add(t.officeCharge()); pay=pay.add(t.officePay());
            cost=cost.add(t.extraCost()); profit=profit.add(t.workProfit()); direct=direct.add(t.directPay());
            for (Line l : work.snapshot().lines()) { count++; if (l.workerProfileUuid()!=null) unique.add(l.workerProfileUuid()); else guests++; }
        }
        return new Summary(aggregate(charge),aggregate(pay),aggregate(cost),aggregate(profit),aggregate(direct),confirmed,pending,review,count,unique.size(),guests);
    }
    private CashBody normalizeCash(CashBody body) {
        if (body==null) throw invalid("Cash details are required.");
        String kind=kind(body.kind());
        String party=requiredText(body.partyKey(),80,"Party");
        if (!party.matches("(?:guest:)?[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")) throw invalid("Party must be a registered or guest ledger key.");
        party=party.toLowerCase(java.util.Locale.ROOT);
        if (body.cashDate()==null) throw invalid("Cash date is required.");
        BigDecimal amount=positive(body.amount());
        String method=choice(body.method(),Set.of("CASH","TRANSFER","OTHER"),"payment method");
        Set<UUID> seen=new HashSet<>();
        List<Allocation> allocations=new ArrayList<>();
        for (Allocation allocation : requiredList(body.allocations(),"Allocations")) {
            if (allocation==null || !seen.add(requiredId(allocation.obligationUuid()))) throw invalid("Duplicate or missing allocation target.");
            allocations.add(new Allocation(allocation.obligationUuid(),positive(allocation.amount())));
        }
        if (allocations.isEmpty() || sum(allocations.stream().map(Allocation::amount).toList()).compareTo(amount)!=0)
            throw invalid("Allocation total must equal the cash amount. Prepayments are not supported.");
        allocations.sort(Comparator.comparing(a -> a.obligationUuid().toString()));
        return new CashBody(kind,party,body.cashDate(),amount,method,text(body.memo(),1000),List.copyOf(allocations));
    }
    private void validateAllocations(UUID office, CashBody body, Cash released) {
        for (Allocation allocation : body.allocations()) {
            Balance target=dao.obligation(office,allocation.obligationUuid(),today()).orElseThrow(FinanceException::missing);
            if (!body.kind().equals(target.kind()) || !body.partyKey().equals(target.partyKey())) throw invalid("All allocations must use the same party and payment kind.");
            BigDecimal available=target.outstandingAmount();
            if (released!=null) for (Allocation old : released.allocations()) if (old.obligationUuid().equals(target.uuid())) available=available.add(old.amount());
            if (allocation.amount().compareTo(available)>0) throw conflict("An allocation exceeds the remaining balance. Refresh and check reconciliation.");
        }
    }
    private Cash idempotent(Account account, UUID requestId, Object semantic, Supplier<Cash> action) {
        requiredId(requestId);
        String hash=FinanceJson.hash(semantic);
        var previous=dao.request(account.agencyOwnerUuid(),requestId);
        if (previous.isPresent()) {
            if (!previous.get().hash().equals(hash)) throw conflict("This request ID was already used with different details.");
            return previous.get().response();
        }
        Cash result=action.get();
        dao.saveRequest(account.agencyOwnerUuid(),requestId,hash,result);
        return result;
    }
    private BigDecimal positive(BigDecimal value) {
        BigDecimal amount=money(value);
        if (amount==null || amount.signum()<=0) throw invalid("Cash and allocation amounts must be at least 1 KRW.");
        return amount;
    }
    private static BigDecimal sum(List<BigDecimal> values) { return aggregate(values.stream().reduce(ZERO,BigDecimal::add)); }
    private LocalDate today() { return LocalDate.now(clock.withZone(BUSINESS_ZONE)); }
    private static UUID requiredId(UUID id) { if (id==null) throw invalid("A record or request UUID is required."); return id; }
    private static <T> List<T> requiredList(List<T> list,String field) {
        if (list==null) throw invalid(field + " must be supplied as a list.");
        if (list.size()>10000) throw invalid(field + " exceeds 10000 entries.");
        return list;
    }
    private static <T> List<T> optionalList(List<T> list) { return list==null ? List.of() : requiredList(list,"Settings exceptions"); }
    private static void range(LocalDate from,LocalDate to) {
        if (from!=null && to!=null && to.isBefore(from)) throw invalid("End date must not precede start date.");
    }
}
