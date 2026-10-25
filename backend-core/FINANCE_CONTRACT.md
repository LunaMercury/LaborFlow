# Finance API v1 (implementation contract)

Base: `/api/finance`. Every route requires query `loginId`, resolved against an
ACTIVE app_account with labor_agency_owner_uuid. This is the existing demo
identity convention, NOT verified authentication or real RBAC. Production blocker.
Dates are ISO yyyy-MM-dd, UUIDs strings, enums uppercase, KRW JSON numbers (exact
integer after server HALF_UP rounding). Null means unentered, never zero.
All writes are transactional and serialized by office advisory transaction lock.
Errors: `{code, message}` with 400 validation, 404 unavailable/foreign target,
409 stale version, changed-source, idempotency conflict or over-allocation.

## Work

`GET /work?fromDate=...&toDate=...` returns:
```
{items: Work[], summary: {officeCharge, officePay, extraCost, workProfit,
  directPay, confirmedCount, unconfirmedCount, reviewCount,
  workerDayCount, uniqueWorkerCount, guestAttendanceCount}}
```
Items include unprepared active source days AND saved historical work. Dates
filter work date, never filter the balances endpoint. Summary uses CONFIRMED
snapshots only, including unchanged confirmed amounts while review is pending.
workerDayCount counts confirmed worked assignment rows (site-level attendance
instances, not unique people or unique person-days). uniqueWorkerCount counts only
distinct registered workerProfileUuid. guestAttendanceCount counts guest assignment
instances separately; anonymous people cannot be deduplicated across days/sites.

`POST /work/{scheduleDayUuid}/prepare` (no body) explicitly creates one persisted
DRAFT if absent, returning Work. Repeated prepare returns existing work without
overwriting it. GET never writes. A draft has lines ONLY for actual confirmed
WORKED attendance, never assignment-only inferred work.

`GET /work/{workUuid}` returns Work.

`PUT /work/{workUuid}` body:
```
{version: 1, status: "DRAFT"|"CONFIRMED", reason: null|"correction reason",
 sourceFingerprint: "from latest GET Work.currentSource.fingerprint",
 defaultMode: "OFFICE"|"DIRECT", defaultChargeRate: null|150000,
 defaultPayRate: null|130000, receiptDueDate: null|"2026-10-25",
 lines: [{assignmentUuid, mode:"OFFICE"|"DIRECT", quantity:1,
   chargeRate:null|150000, payRate:null|130000,
   chargeAmount:null|150000, payAmount:null|130000,
   override:true, payoutDueDate:null|"2026-10-26", note:null|"..."}],
 extras: [{uuid:"client-generated UUID", name:"Meal", basis:"PER_PERSON"|"PER_JOB",
   quantity:1, chargeRate:null|10000, costRate:null|5000,
   chargeAmount:null|10000, costAmount:null|5000}], note:null|"..."}
```
Full replacement of editable snapshot. Amount overrides take precedence; otherwise
quantity * rate HALF_UP(0), no time-based prorating. Quantity max 3 decimals.
Round each line/item amount first, then sum integer results; never round binary
floating-point totals. Money input exponent/precision is bounded against excessive
decimal representations before rounding.
Server requires exact current worked assignment set on save. Refetch currentSource
after source change and explicitly review old values; no automatic changes.
Confirmed edits require nonblank reason, retain CONFIRMED status, append immutable
revision, and never replace cash. Changing due dates after first confirmation also
requires reason. Original due dates remain in obligations. Use null for unknown due.
Draft `override` is metadata for UI default reapplication; client must preserve
overrides when applying group/default rates. Server accepts explicit full values.
Confirmed lines/extras require all final monetary fields entered, explicit zero valid.

Work shape:
```
{uuid:null|UUID, scheduleDayUuid, version:0|positive, status:"UNPREPARED"|"DRAFT"|"CONFIRMED",
 sourceStatus:"READY"|"ATTENDANCE_UNCONFIRMED"|"NO_WORKED_ATTENDANCE"|"UNAVAILABLE",
 reviewRequired:boolean, currentSource: Source|null,
 snapshot: Snapshot|null, totals:{officeCharge,officePay,extraCost,workProfit,directPay},
 revisions:[{version,status,reason,changedAt,changedByAccountUuid,snapshot:Snapshot}]}
```
Snapshot contains workDate, clientUuid (farm_owner UUID), clientProfileUuid, clientName, siteUuid,
siteName, workTitle, sourceFingerprint, defaultMode/defaultChargeRate/defaultPayRate,
receiptDueDate, lines/extras/note as above. Saved lines additionally contain payeeKey,
workerProfileUuid (nullable), displayName, attendanceStatus, actualStartAt,
actualEndAt, breakMinutes. Source: `{scheduleDayUuid,workDate,clientUuid,clientName,
clientProfileUuid,siteUuid,siteName,workTitle,active,fingerprint,attendanceReady,assignments:[
{assignmentUuid,workerProfileUuid,payeeKey,displayName,assignmentStatus,
attendanceStatus,confirmed,actualStartAt,actualEndAt,breakMinutes,workerCount}]}`.
Registered payeeKey is worker profile UUID string, guest key `guest:<assignment UUID>`.
Each guest must be individual worker_count=1; grouped legacy rows are rejected.
Stable fingerprint covers meaningful day/assignment/attendance values, not updated_at
or confirmation timestamps. Display names are historical snapshot values.

OFFICE profit = charges + extra charges - OFFICE pay - extra costs.
DIRECT charge is office fee; DIRECT pay tracked separately, never office expense.
Totals.officeCharge includes extra charges. Extra costs are recorded actual office
cost amounts for work-profit; v1 does not offer vendor cash disbursement recording.

## Balances

`GET /balances?kind=RECEIPT|PAYOUT|DIRECT&filter=ALL|TODAY|OVERDUE|FUTURE`
returns `{items:Balance[], totalAmount,totalSettled,totalOutstanding}`.
No work-date filter. ALL includes outstanding AND overpaid historical obligations,
not zero settled rows. TODAY/OVERDUE/FUTURE use Asia/Seoul date; null due only ALL.
```
Balance = {uuid,workUuid,scheduleDayUuid,workDate,kind,partyKey,partyName,
 clientName,siteName,assignmentUuid:null|UUID,amount,settledAmount,outstandingAmount,
 originalDueDate,dueDate,status:"UNPAID"|"PARTIAL"|"PAID"|"OVERPAID",
 overdue:boolean,reconciliationRequired:boolean,relatedReceiptOutstanding}
```
Negative outstanding remains visible after confirmed reductions. Receipt partyKey
is farm_owner UUID string, PAYOUT/DIRECT partyKey is payeeKey.
For payout rows relatedReceiptOutstanding shows independent farm balance.

## Cash (and direct payment confirmations)

`POST /cash` body:
```
{requestId:UUID,kind:"RECEIPT"|"PAYOUT"|"DIRECT",partyKey:string,
 cashDate:"2026-10-25",amount:300000,method:"CASH"|"TRANSFER"|"OTHER",
 memo:null|"...",allocations:[{obligationUuid:UUID,amount:300000}]}
```
Positive amount, positive allocations, unique obligations, sum allocations == amount,
same office+kind+party and allocation <= current outstanding. No prepayment or
unallocated money. DIRECT records confirmation of farm-to-worker payment, not
office cash. All requests UUID idempotent with canonical semantic hash; replay of
same request returns original result, changed semantic payload rejects 409.

`GET /cash?kind=...&fromDate=...&toDate=...` returns `{items:Cash[]}`;
dates filter actual cashDate, includes cancelled rows for audit.
`POST /cash/{cashUuid}/cancel` body `{requestId:UUID,reason:string}` returns Cash.
`POST /cash/{cashUuid}/correct` body `{requestId:UUID,reason:string,replacement:
 {kind,partyKey,cashDate,amount,method,memo,allocations}}` returns replacement Cash.
Correction is atomic cancellation + new immutable cash/allocations; validates all
targets before completion. No edited/deleted originals. Replay creates no new audit.
```
Cash = {uuid,kind,partyKey,cashDate,amount,method,memo,allocations,
 createdAt,createdByAccountUuid,cancelled:boolean,cancellationReason:null|string,
 cancelledAt:null|timestamp,replacesCashUuid:null|UUID,partyName:string}
```
Response allocations additionally contain read-only `workDate`, `siteName`,
`clientName` derived from the retained obligation/work snapshot, including fully
settled and cancelled history. Request allocation metadata is always discarded
before validation, hashing and persistence; only obligationUuid/amount are trusted.
Party names come from the original obligation snapshot, not the active directory.
Work labels use the retained work's latest explicitly saved financial snapshot,
not current live schedule/profile labels. The persisted idempotency response keeps
the labels returned by the original request; replay returns that exact response.
The old Java Allocation(UUID,BigDecimal) and Cash(14 original args) constructors
remain available for request callers and tests.

## Defaults

`GET /settings` returns Settings. `PUT /settings` accepts full Settings plus
`reason` (required) and `version` compare-and-set; appends setting audit.
```
Settings = {version:0|positive,defaultMode:"OFFICE"|"DIRECT",
 defaultChargeRate:null|150000,defaultPayRate:null|130000,
 payoutCycle:"DAILY"|"WEEKLY"|"CUSTOM",weeklyPayday:1..7,
 customDueDate:null|ISO,workerOverrides:[{workerProfileUuid,
   defaultMode:null|"OFFICE"|"DIRECT",chargeRate:null|number,payRate:null|number,
   payoutCycle:"DAILY"|"WEEKLY"|"CUSTOM",weeklyPayday:1..7,
   customDueDate:null|ISO}]}
```
Weekly aggregates Monday-Sunday and pays chosen weekday of following week (ISO
1=Monday). Defaults apply only explicit initial prepare; never mutate saved history.
Receipt due defaults to work date; payout due is nullable CUSTOM when unspecified.
Settings additionally supports optional `clientOverrides:[{clientProfileUuid,
defaultMode:null|"OFFICE"|"DIRECT",chargeRate:null|number,payRate:null|number}]`.
Explicit prepare applies office -> original client profile preset -> worker override.
`saveSettings` requires full replacement of both override collections (omitted means
empty); a UI save-current-work-as-client-preset command must merge other settings.
The first prepared clientProfileUuid is retained even after deactivation/re-register.
Source client/site identity changes show review and block further monetary saves;
cash is never silently moved to another client/site. Create/correct the source
separately while retaining the historical ledger. Existing confirmed reductions to
zero worked lines are allowed with reason after all current attendance is resolved.
New confirmation still requires at least one actual confirmed worked assignment.
All current source workerCount != 1 rows (including cancelled/replaced rows) block
financial confirmation under the explicitly approved person-level verification policy.
Confirmed revisions preserve the original display name per assignment. Changing an
existing assignment's workerProfileUuid/payeeKey is rejected rather than transferring
historical debt or cash; use a separate individual verified assignment.
Every scalar AND aggregate monetary output has absolute bound 999999999999 KRW,
comfortably below Number.MAX_SAFE_INTEGER; larger totals reject with readable 400.

## Schema / isolated fixture

036 appends public.finance_work, finance_work_revision, finance_obligation,
finance_cash, finance_cash_allocation, finance_cash_cancellation, finance_request,
finance_settings, finance_settings_revision. Old pay_term / settlement_period are
planning/attendance-only, not receipt ledger, untouched and never auto-imported.
Migration needs existing public.labor_agency_owner(uuid), app_account(uuid),
work_schedule_day(uuid,work_site_uuid,status,deleted_at),
farm_work_site(uuid,agency_owner_uuid,status,deleted_at),
labor_agency_worker_profile(uuid), labor_agency_farm_owner_profile(uuid), farm_owner(uuid). Foreign keys RESTRICT preserve
ledger sources; day/site deletion/status cancellation protected once ever confirmed.
No customer fixtures or runtime network/DB calls are executed by this implementation.
Parent owns isolated PostgreSQL verification and verify-core execution.

Integration construction: `new JdbcFinanceDao(JdbcTemplate)` and
`new FinanceService(FinanceDao)` (optional `FinanceService(FinanceDao, Clock)` for
business-date tests). Apply Spring transaction proxy / TransactionTemplate for real
transactions. Public method names are listWork, prepareWork, getWork, saveWork,
getBalances, listCash, recordCash, cancelCash, correctCash, getSettings, saveSettings.
All accept loginId first. Work/cash detail mutations accept target UUID second,
then corresponding request record. getBalances accepts kind/filter strings.
FinanceDtos.Source and Assignment record signatures are the source of truth.
`FinanceCashMetadataJdbcTest` adds four environment/marker-guarded real JDBC tests
for fully settled/deactivated history, request-label tampering and semantic replay,
cancellation/correction round trips, and receipt-vs-worker party labels. It must run
through the parent's disposable-DB verifier, not against application DB settings.
