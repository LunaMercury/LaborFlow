# 수익·정산 API

2026-10-25 구현 스냅샷. 시작 기준 `dev` / `3576cbd` 이후 변경이며 최종 설계·출시 승인 문서가 아니다.
[공통 계약](common.md) · [저장 구조](../database/finance.md) · [계산·사용 정책](../product/finance-policies.md)

## 공통 규칙

- 기본 경로 `/api/finance`, 모든 경로의 쿼리 `loginId` 필수. ACTIVE 계정에서 사무소·기록자를 찾는다.
- **현재는 loginId 사칭을 막는 인증/역할 인가가 없다.** SQL 소유권 확인이 실제 인증 완료를 의미하지 않는다. 운영 출시 차단 사항이다.
- 날짜는 `yyyy-MM-dd`, UUID는 문자열, 업무 시간대는 `Asia/Seoul`이다.
- 원화는 JSON number, 서버 BigDecimal을 사용한다. 단가·금액/집계 범위는 0..999999999999원(이익·잔액은 음수 허용), 원 단위 HALF_UP이다.
- 수량은 양수, 최대 999999.999, 소수 3자리까지다. 명시적 최종 금액이 있으면 우선하고, 없으면 수량×단가를 계산한다.
- 금액 null/생략은 미입력, 0은 명시적 0원이다. 시간·조퇴·휴게로 금액을 자동 삭감하지 않는다.
- 모든 쓰기는 트랜잭션에서 사무소 advisory lock을 사용한다. 기존 근태/일정의 모든 쓰기가 이 잠금 규약을 공유하는 것은 아니다.
- 프론트는 통신 경계에서 금액을 정확한 숫자로 검증하고 표시·입력 상태에서는 문자열로 취급한다.
- 추가 비용은 작업이익용 실제 사무소 부담액이다. 공급업체에 대한 실제 출금 원장은 이번 범위에 없다.

## HTTP 오류

금융 Controller에 한정된 `FinanceExceptionHandler`가 `{ "code": "FINANCE_CONFLICT", "message": "..." }`를 반환한다.
기존 공통 오류와 달리 timestamp는 없으며, 현재 검증 메시지 일부는 영어다. SQL/행/메모 원문은 응답·로그에 남기지 않는다.

| 상태 | 조건 |
|---|---|
| 400 | 금액·수량·필수값·기간·주체·요청 형식 오류 |
| 404 | 계정 또는 해당 사무소 대상이 없음. 타 사무소 대상과 구분하지 않음 |
| 409 | 버전·원천 변경, 배분 초과, 중복 키의 다른 본문, 이미 취소된 기록 등 충돌 |
| 500 | 그 밖의 처리 불가. 응답만으로 최종 저장 여부를 추정하지 말고 동일 요청 키로 재조회/재시도 |

실제 상태/문구는 `finance/application/FinanceException`, `finance/api/FinanceExceptionHandler`가 근거다.
일정 삭제 보호 트리거의 실패는 기존 일정 API 오류 처리 경로를 따르며 금융 오류 구조로 바뀌지는 않는다.

## 작업 금액

### `GET /work?fromDate&toDate`

`/finance`의 수익 현황. 두 날짜는 선택, 종료<시작 거부. 작업일 기준 원본 일정과 저장된 정산을 합쳐 반환한다.
응답 `{items: Work[], summary: Summary}`. GET은 빈 초안을 생성하지 않는다.
확정 합계만 이익에 포함하고 미확정·재확인 건수를 별도로 센다. 재확인 필요의 기존 확정액은 보존하여 합산한다.
고유 작업자는 등록 프로필만 distinct 집계, 익명은 별도 건수다. 현장별 투입 누계는 같은 사람이 여러 현장에 가면 여러 건이다.

### `POST /work/{scheduleDayUuid}/prepare`

저장 원장의 내부 초기화 API, 본문 없음. 같은 날짜별 일정에는 정산 1건만 만들고 반복 요청은 기존 기록을 반환한다.
2026-10-26 Web은 별도 생성 버튼을 제공하지 않는다. 아직 저장 원장이 없는 작업을 사용자가 저장할 때만 이 API를 호출한 뒤 PUT으로 편집 내용을 저장한다.
원본 근태 중 확인된 WORKED 배정만 금액 행으로 가져온다. 배정 예정 인원만으로 실적을 만들지 않는다.
설정 우선순위는 사무소 → 거래처 → 작업자 예외. 이미 저장된 초안에는 설정을 자동 재적용하지 않는다.

### `GET /work/{workUuid}`

저장된 정산 상세와 현재 근태, 수정 이력. 원본과 확정 스냅샷이 달라지면 `reviewRequired`를 표시하며 금액은 바꾸지 않는다.
현재 원천이 없어도 저장 스냅샷을 없애지 않는다. 타 사무소/없는 정산은 404.

### `PUT /work/{workUuid}`

전체 편집 내용을 저장한다. `version`은 조회한 값과 같아야 하고 원천 fingerprint는 최신 근태와 일치해야 한다.
현재 실제 WORKED 배정의 정확한 집합을 요청해야 한다. 외부 배정·중복·누락은 거부한다.
확정에는 근태 확인, 각 최종 금액 입력, 개인별 배정이 필요하다. `worker_count != 1`은 승인된 정책에 따라 차단한다.
한 번 확정되면 DRAFT로 되돌릴 수 없고, 정정 사유가 필수다. 원본 거래처/현장/프로필이 바뀌면 과거 지급을 이동시키지 않고 차단한다.
확정된 동일 배정의 작업자 식별자/수령자도 다른 사람으로 바꿀 수 없다. 이름만 바뀌었을 때는 당시 표시명을 보존한다.

본문 조각(전체 요청에는 아래 모든 편집 필드를 포함):

```json
{
  "version": 1,
  "status": "CONFIRMED",
  "reason": null,
  "sourceFingerprint": "조회한 currentSource.fingerprint",
  "defaultMode": "OFFICE",
  "defaultChargeRate": 150000,
  "defaultPayRate": 130000,
  "receiptDueDate": "2026-10-25",
  "lines": [{
    "assignmentUuid": "20000000-0000-4000-8000-000000000001",
    "mode": "OFFICE", "quantity": 1,
    "chargeRate": 150000, "payRate": 130000,
    "chargeAmount": 150000, "payAmount": 130000,
    "override": true, "payoutDueDate": "2026-10-26", "note": null
  }],
  "extras": [], "note": null
}
```

- mode `OFFICE|DIRECT`. DIRECT의 청구액은 사무소 소개료이고 작업자 지급액은 농가 직접 지급 확인 대상이다.
- `extras`: UUID, name(필수 최대100자), basis `PER_PERSON|PER_JOB`, quantity, chargeRate/costRate, chargeAmount/costAmount.
- 확정 후 근태를 다시 확인해 저장할 때 과거 입출금은 그대로다. 지급 의무 감소로 잔액이 음수가 되면 OVERPAID로 남긴다.
- 메모 최대1000자, 공백은 null. 개인 override는 기본값 재적용 시 보존하기 위한 UI 메타데이터이며 서버는 명시된 금액을 검증한다.

#### 지급 예정 정보 (2026-10-26, 사용자 승인 확장)

각 `lines[]` 요청·응답에 선택 객체 `payoutPlan`을 추가한다.
`{ "method": "TRANSFER", "timing": "AFTER_COLLECTION" }`처럼 보내며 각 필드는 null도 가능하다.

- method: `CASH|TRANSFER|null` (예정 현금·송금). 실제 지급 수단은 여전히 `finance_cash.method`다.
- timing: `SAME_DAY|AFTER_7_DAYS|AFTER_COLLECTION|CUSTOM|null`.
- 객체를 명시하면 SAME_DAY는 작업일, AFTER_7_DAYS는 작업일+7일로 payoutDueDate를 계산한다. 기존 주급 WEEKLY(다음 주 특정 요일)와 다르다.
- AFTER_COLLECTION은 수금 대기 메모이며 전달된 payoutDueDate를 자동 연기/삭제하지 않는다. 실제 지급 API를 차단하지 않는다. CUSTOM/null은 전달된 날짜를 유지한다.
- 객체 생략/null은 해당 배정의 기존 payoutPlan을 보존한다. 명시적 `{ "method": null, "timing": null }`로 예정 선택을 해제할 수 있다.
- 기존 snapshot JSON에 이 필드가 없어도 읽을 수 있다. 새 필드를 저장하면 work와 revision의 snapshot에 포함된다. 별도 테이블·마이그레이션은 없다.
- 저장만으로 지급 완료·송금·입출금 기록을 만들지 않는다. 금액 확정과 정정 사유·버전 검증은 기존과 같다.

Work의 주요 필드: uuid(null은 미생성), scheduleDayUuid, version, status `UNPREPARED|DRAFT|CONFIRMED`,
sourceStatus `READY|ATTENDANCE_UNCONFIRMED|NO_WORKED_ATTENDANCE|UNAVAILABLE`, reviewRequired,
currentSource, snapshot, totals, revisions. Snapshot에 당시 거래처/현장/작업자와 예정일·금액을 보존한다.
정확한 필드·null 가능성은 `FinanceDtos`의 Source/Assignment/Snapshot/Line/Extra/Work/Summary record가 근거다.

## 일정 청구단가 연결

2026-10-25 migration 038: `currentSource`에 maleChargeRate/femaleChargeRate(nullable 금액),
각 assignments에 area(MEN/WOMEN)를 추가한다. area는 작업자의 성별이 아니라 배치 영역이다.
새 정산 초안에서 OFFICE의 청구 단가는 작업자 예외 → 일정 영역별 단가 → 거래처 기본값 → 사무소 기본값 순으로 선택한다.
일정 단가가 미입력이면 기존 기본값으로 돌아가고, 0원은 유지한다. 작업자 지급 단가에는 적용하지 않는다.
DIRECT의 사무소 청구액은 소개료이므로 일정 인건비를 소개료나 작업자 직접 지급액으로 자동 대입하지 않는다.

조회만으로 저장 원장을 만들지 않는다. 작업 팝업은 미저장 작업도 로컬 편집 상태로 열며, 저장 요청 시 내부 초기화 API에서 기존 설정 우선순위로 기본값을 준비한다.
기존 입력/확정 금액은 조회·일정 단가 수정으로 재계산하지 않는다. 2026-10-26 Web은 DRAFT를 열 때
OFFICE이면서 개별 수정이 없고 chargeRate와 chargeAmount가 모두 null인 행만 일정 단가로 화면에서 자동 보완한다.
저장 전 DB는 변경하지 않으며, 별도 단가 채우기 버튼은 제거했다.
일정 단가는 기본값 제안으로 취급하여 기존 근태 fingerprint의 정의를 바꾸지 않는다. 이미 확정한 금액·입출금은 그대로다.

### 작업 금액 팝업의 계산 표시 (Web)

- 목록의 작업을 열면 농가 청구/작업자 지급을 구분해 바로 편집한다. 별도 초안 생성/초안 저장 버튼은 없다. 내부 DRAFT/CONFIRMED 상태·버전·정정 사유 계약은 유지한다.
- 청구 표는 작업자/실제 근무시간/청구 금액/상세 메모다. 금액·메모 클릭은 로컬 입력칸을 열고 Enter/포커스 이동 시 편집에 반영한다. Escape는 취소이며 DB 저장은 전체 저장 버튼으로 한다. 메모는 여러 줄을 지원한다.
- 근무시간은 실제 기록을 표시하며 누락 시 예정시간으로 채우지 않는다. 청구 금액 수정은 지급 금액·기존 단가·실제 근태를 자동 변경하지 않는다.
- 이름순 표시로 같은 이름을 인접시킨다. 사무소 프로필/배정 ID나 익명 인원을 합치지 않으며 저장 대상은 원래 배정 ID다.
- 지급 표의 지급금액/지급수단/지급예정일 열 위 일괄입력 버튼은 해당 열 전용 모달을 연다. 금액 입력 또는 선택 후 일괄입력을 눌러야 로컬 편집에 반영하며, 닫기/Escape는 변경하지 않는다. 모바일에는 표 위 전용 버튼 모음이 있다.
- 일괄입력 기본 대상은 전체 작업자이며, 선택한 열만 변경한다. 적용 대상의 배치 영역 및 개별 수정행 포함 여부는 모달의 적용 대상에서 바꾼다. 기존 override 메타데이터도 보존한다.
- 지급은 최종 지급 금액 중심으로 편집하고 메모를 직접 클릭한다. 기존 chargeRate/payRate/quantity와 저장 계약은 보존하되 이 화면에서 최종 금액만 수정해도 된다.
- 참값·보너스 등 추가 청구는 기존 extras를 이용한다. 청구 항목 추가 시 비용은 명시적 0원으로 시작하며 작업자 지급액에는 자동 가산하지 않는다. 비용 항목 추가는 반대로 청구 0원으로 시작한다. 한쪽 삭제는 상대쪽 금액을 보존한다.
- 단가별 인원 및 추가 항목의 청구 내역과 합계를 표시한다. 별도 사무소 설정은 필수가 아니며 선택적인 공통 기본값은 작업 팝업 안에서 접근한다.
- 미저장 작업은 확인된 개인별 WORKED 기록과 일정 청구액으로 로컬 편집을 시작한다. 실제 지급액은 임의로 0원으로 채우지 않는다. 첫 저장 시 기본 설정과 사용자가 변경한 필드만 병합한다. 최초 생성 응답이 이미 수정된 버전/확정 상태이면 덮어쓰지 않고 재조회를 안내한다.
- 내부 초기화와 PUT은 별도 트랜잭션이다. 초기화 후 PUT 실패 시 초기 원장이 남을 수 있으며, 프론트는 원장 식별자·버전과 편집 내용을 보존하여 중복 초기화 없이 재시도한다. 저장 응답 유실로 버전이 바뀐 경우 서버의 409 검증을 유지한다.
- 최초 기본 설정에서 수납·지급 경로가 화면의 초기 경로와 다르면 명시적 재검토를 안내한다. 이미 저장된 금액을 조회만으로 덮어쓰거나 새로운 지급을 만들지 않는다.
- 저장된 직접 입력 금액과 0원은 보존한다. 미입력 합계는 0원으로 가정하지 않고 미입력으로 표시하며, 입력 중 계산과 서버 저장 합계를 구분한다.
- 현재 실제 근태의 중복 나열은 제거하고 `근태 확인` 이동 버튼은 유지한다. 서버의 근태·버전·확정 검증은 그대로다.
- 근거: `FinanceWorkEditor`, `FinanceWorkerAmountTable`, `financeWorkPreview.ts`. API와 DB 계약 변경은 없다.

## 잔액과 입출금

### `GET /balances?kind&filter`

kind 필수 `RECEIPT|PAYOUT|DIRECT`, filter 기본 `ALL`, 허용 `ALL|TODAY|OVERDUE|FUTURE`.
작업 기간과 무관한 잔액을 반환한다. ALL에는 과거 미수·미지급·초과 지급을 포함하고 완납 0잔액은 제외한다.
예정일 null은 미정이며 ALL에서만 보인다. 원래 예정일과 현재 예정일을 구분한다.
응답 `{items, totalAmount, totalSettled, totalOutstanding}`. 합계는 반환된 잔액 내역의 합계이며 전체 회계 매출/모든 과거 지급 합계가 아니다.
행에는 workUuid/scheduleDayUuid/workDate, kind, partyKey/partyName, clientName/siteName,
assignmentUuid, amount/settledAmount/outstandingAmount, originalDueDate/dueDate,
status `UNPAID|PARTIAL|PAID|OVERPAID`, overdue/reconciliationRequired/relatedReceiptOutstanding이 있다.
미수와 미지급은 독립적이며, DIRECT는 사무소 입출금에서 제외한다.

### `GET /cash?kind&fromDate&toDate`

모든 필터 선택. **실제 기록일** 기준이며 취소된 원본도 포함한다. `{items: Cash[]}`.
Cash는 uuid, kind, partyKey, cashDate, amount, method, memo, allocations, 처리 계정·생성 시각,
취소 여부/사유/시각과 replacesCashUuid를 반환한다. 최신 응답의 partyName과 배분별 작업일·현장·거래처명은 과거 스냅샷에서 읽는 표시용 필드다.

### `POST /cash`

```json
{
  "requestId": "10000000-0000-4000-8000-000000000001",
  "kind": "PAYOUT",
  "partyKey": "30000000-0000-4000-8000-000000000001",
  "cashDate": "2026-10-26", "amount": 300000,
  "method": "TRANSFER", "memo": null,
  "allocations": [{"obligationUuid": "40000000-0000-4000-8000-000000000001", "amount": 300000}]
}
```

kind는 위 세 종류, method `CASH|TRANSFER|OTHER`. 입출금 사실/직접 지급 확인만 기록하며 송금은 실행하지 않는다.
양수 금액과 고유 배분 대상, 합계 일치, 동일 사무소·kind·partyKey, 잔액 이내를 검증한다. 선급금·초과입금·미배분금은 거부한다.
등록 작업자의 partyKey는 사무소 프로필 UUID, 익명은 `guest:<assignment UUID>`, 수납은 저장된 farm_owner UUID다.
같은 이름으로 익명 인원을 합치지 않는다.
같은 requestId/같은 의미 본문은 기존 결과, 같은 키/다른 본문은 409. 키는 성공 응답 유실 후에도 재사용한다.
배분 응답의 표시용 메타데이터를 요청에 넣어도 서버가 정규화하여 신뢰하지 않는다.

### `POST /cash/{cashUuid}/cancel`

`{requestId, reason}`. 사유 필수 최대1000자. 원본을 삭제하지 않고 취소 기록과 요청 결과를 남겨 배분 잔액을 복원한다.
동일 요청의 재시도는 같은 결과다. 다른 키로 이미 취소된 원본을 다시 취소하면 409.

### `POST /cash/{cashUuid}/correct`

`{requestId, reason, replacement}`. replacement는 POST cash 본문에서 requestId를 뺀 구조다.
원본 배분을 해제한 것으로 보고 새 배분을 검증한 뒤 취소+대체 기록+요청 결과를 같은 트랜잭션에서 저장한다.
대체 저장이 실패하면 원본 취소도 롤백한다. 이전 기록은 그대로 남고 새 기록의 replacesCashUuid로 연결된다.

## 기본값·지급 주기

`GET /settings`, `PUT /settings`. PUT은 조회 version과 필수 reason 및 전체 설정을 받는다.
defaultMode, defaultChargeRate/defaultPayRate, payoutCycle `DAILY|WEEKLY|CUSTOM`, weeklyPayday(ISO 1..7), customDueDate,
workerOverrides(사무소 작업자 프로필별 단가/방식/주기), clientOverrides(거래처 프로필별 방식/단가)다.
기본은 OFFICE/DAILY, 금액은 미입력. WEEKLY는 월~일 작업분을 다음 주 선택 요일에 지급한다.
CUSTOM 날짜 null은 미정이다. 설정 변경은 기존 예정일이나 금액에 소급 적용하지 않는다.
버전/예외 프로필 소유권을 검증하고 수정 이력을 남긴다. 같은 설정을 다른 요청으로 반복 저장하는 엄격한 멱등성은 없다.

## 근거와 검증 범위

`finance/api/FinanceController`, `application/FinanceService`의 listWork/prepareWork/getWork/saveWork/getBalances/recordCash/cancelCash/correctCash/getSettings/saveSettings,
`FinanceRules`, `dao/JdbcFinanceDao`, web `financeApi.ts`, `FinancePage/FinanceWorkEditor/FinanceCashModal/FinanceSettingsModal`.
검증 스크립트·출시 한계와 수동 절차는 [계산·사용 정책](../product/finance-policies.md) 및 [DB 문서](../database/finance.md)에 기록한다.
