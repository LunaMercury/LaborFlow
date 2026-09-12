# 작업자와 팀 API

[API 문서 홈](README.md) · [공통 계약](common.md)

## 모델과 범위

- 중앙 작업자 `worker`와 전화번호 민감정보는 사람 식별에 사용된다.
- 사무소별 이름/호칭, 전화번호, 메모, 승차장소, 활동 여부, 작업 능력, 계좌, 팀, 위험 표시는 `labor_agency_worker_profile`을 중심으로 관리한다.
- 같은 중앙 작업자가 여러 사무소에 연결될 수 있다. 각 사무소에는 별도의 `profileUuid`가 생기며 다른 사무소 프로필은 조회되지 않는다.
- 주요 화면은 `/workers`, `/teams`, `/work-schedule`, `/attendance`와 `WorkerProfileModal`, `TeamCompositionModal`이다.

## 공통 작업자 응답

모든 작업자 생성/수정/삭제 API는 변경된 한 건이 아니라 현재 사무소의 전체 목록을 `{ "workers": [...] }`로 반환한다.

```json
{
  "workers": [
    {
      "profileUuid": "11111111-1111-4111-8111-111111111111",
      "name": "가상 작업자",
      "nickname": "동문 김씨",
      "phone": "010-1234-5678",
      "age": 52,
      "gender": "FEMALE",
      "memo": "",
      "pickupLocation": "중앙시장",
      "isActive": true,
      "availableDaysMask": 127,
      "availabilityMemo": "",
      "bankCode": "",
      "bankName": "",
      "accountNumber": "",
      "accountHolderName": "",
      "paymentVerificationStatus": "UNVERIFIED",
      "teamUuid": null,
      "teamName": "",
      "teamRole": "",
      "teamDisplayOrder": 0,
      "lastWorkedDate": null,
      "totalWorkDays": 0,
      "noShowRisk": false,
      "noShowRiskManual": false,
      "noShowCount": 0,
      "workTypeCodes": ["garlic_harvest"],
      "workTypeRatings": { "garlic_harvest": 3 }
    }
  ]
}
```

`name`, `nickname`, `age`, 팀 UUID, 최근 근무일 등은 데이터에 따라 `null`일 수 있다. DAO는 많은 선택 문자열을 빈 문자열로 반환하지만 DTO 자체는 nullable 애너테이션이 없으므로 새 프론트 코드는 둘 다 방어하는 편이 안전하다.

## 입력 규칙

### 작업자 등록 `CreateWorkerRequest`

| 필드 | 타입 | 필수/기본값 | 처리와 제약 |
|---|---|---|---|
| `workerName` | string | 호칭과 둘 중 하나 필수 | 공백은 `null`; DB `varchar(100)` |
| `localNickname` | string | 이름과 둘 중 하나 필수 | 공백은 `null`; DB `varchar(100)` |
| `phone` | string | 필수 | 숫자가 아닌 문자를 제거한 결과가 정확히 11자리여야 함; `010-1234-5678`로 저장/표시 |
| `age` | integer/null | 선택 | `0..150` |
| `gender` | string | 생략 시 `UNKNOWN` | `M`/`MALE` -> `MALE`, `F`/`FEMALE` -> `FEMALE`, 그 밖의 값 -> `UNKNOWN` |
| `pickupLocation`, `memo` | string | 선택 | 공백은 `null`; 별도 애플리케이션 길이 제한 없음 |
| `isActive` | boolean/null | `true` | `null`도 `true` |
| `availableDaysMask` | integer/null | `127` | `0..127`; 요일 비트마스크 |
| `availabilityMemo` | string | 선택 | 공백은 `null` |
| `bankCode`, `bankName`, `accountHolderName` | string | 선택 | 공백은 `null` |
| `accountNumber` | string | 선택 | 숫자 아닌 문자를 제거한 결과 `8..20`자리 |
| `noShowRisk` | boolean/null | `false` | `true`일 때 수동 노쇼 위험 표시 활성화 |
| `workTypeCodes` | string[]/null | 빈 목록 | 중복/공백 제거; 존재하지 않거나 비활성인 코드는 오류 없이 저장되지 않음 |
| `workTypeRatings` | object/null | 코드별 `0` | 값은 코드별로 `0..5` 범위로 잘라 저장; `workTypeCodes`에 없는 키는 무시 |

### 작업 숙련도 UI와 숫자 계약

API와 DB의 `workTypeRatings` 값은 계속 `0..5` 숫자다. Web은 이 숫자를
`5=A(숙련)`, `4=B(보통)`, `2~3=C(초보)`, `1=D(미숙)`, `0` 또는 값 없음은
`—(미평가)`로 환산해 표시한다. 이 등급은 작업 종류별 평가이며 작업자 전체 등급이 아니다.

사용자가 다른 등급을 선택할 때만 `A=5`, `B=4`, `C=3`, `D=1`, `미평가=0`을
대표값으로 보낸다. 같은 화면 등급을 다시 선택하면 기존 숫자를 유지하므로 기존 `2`가
`C`로 보이더라도 자동으로 `3`이 되지 않는다. 다른 필드 조회·수정도 평점을 변환하지
않는다. 작업 종류를 새로 추가하면 `0`으로 시작하며, 미평가 선택과 작업 종류 삭제는
서로 다른 요청 상태다. 등급은 배치 허용·금지나 피해 이력을 뜻하지 않는다.

전체 수정 `UpdateWorkerProfileRequest`는 `workerName/localNickname` 대신 `name/nickname`을 사용하고 `separationRules`를 추가한다. 이름과 호칭 중 하나, 전화번호는 수정 시에도 필수다. 선택 필드를 생략하면 대부분 기본값 또는 `null`로 덮어쓰므로 PATCH라는 이름과 달리 부분 병합 계약이 아니다.

`separationRules`는 다음 배열이다. 생략/`null`이면 기존 규칙을 유지하고 빈 배열이면 모두 해제한다. 최대 100건, 자기 자신/중복/다른 사무소 프로필은 거부하며 `reason`은 공백을 `null`로 바꾸고 최대 500자다.

```json
{
  "otherWorkerProfileUuid": "22222222-2222-4222-8222-222222222222",
  "reason": "같은 현장 배치 전 확인"
}
```

## 조회 API

### `GET /api/workforce/workers`

- 목적/화면: 작업자 목록, 팀, 작업자 배치, 근태 수정 모달의 작업자 데이터.
- 쿼리: `loginId` string, 생략/공백 시 `test`.
- 성공: `200`, `WorkerListResponse`.
- 범위: `loginId`에 연결된 사무소의 활성·미삭제 프로필만 반환한다.
- 실패: 계정/사무소가 없거나 DB 오류 시 공통 오류.
- 재시도: 읽기 요청으로 안전하다.
- 근거: `WorkforceController.getWorkers`, `WorkforceService.getWorkers`, `JdbcWorkforceDao.findWorkersByLoginId`, `web/src/api/workforceApi.ts#fetchWorkers`.

### `GET /api/workforce/work-types`

- 목적/화면: 작업자 능력, 일정 작업 종류, 필터 선택지.
- 쿼리: `loginId` string, 생략/공백 시 `test`.
- 사무소 범위: 시스템 기본 작업(`agency_owner_uuid IS NULL`)과 현재 사무소가 만든 활성 사용자 정의 작업만 반환한다. 다른 사무소의 사용자 정의 작업은 반환하지 않는다.
- 성공: `200`, `[{ "code": "garlic_harvest", "name": "마늘 수확" }]`.
- 재시도: 안전하다.
- 근거: `WorkforceController.getWorkTypes`, `WorkforceService.getWorkTypes`, `JdbcWorkforceDao.findActiveWorkTypes`, `fetchWorkTypes`.

### `POST /api/workforce/work-types`

- 목적/화면: `/workers`의 작업자 등록·수정 모달에서 기존 목록에 없는 작업 종류를 현재 사무소의 사용자 정의 작업으로 추가한다.
- 쿼리: `loginId` string, 생략/공백 시 `test`.
- 본문: `{ "name": string }`. 앞뒤 공백 제거 후 필수이며 최대 100자다.
- 성공: `200`, `{ "code": "custom_가상코드", "name": "마늘 심기" }`. 새 작업의 숙련도는 이 API가 저장하지 않으며, 작업자에게 연결할 때 `rating=0`(미평가)로 시작한다.
- 중복: 시스템 기본 작업 또는 현재 사무소 작업 중 공백·대소문자를 정규화한 같은 이름이 있으면 새 행을 만들지 않고 기존 항목을 반환한다.
- 저장/범위: `work_type.agency_owner_uuid`와 `created_by_account_uuid`를 기록한다. 생성된 코드는 서버가 발급하며 클라이언트가 지정하지 않는다.
- 실패: 이름 누락·공백·100자 초과, 활성 계정/사무소를 찾지 못한 경우 `400 BAD_REQUEST`; 기타 미처리 오류는 공통 오류 계약을 따른다.
- 재시도: 같은 사무소의 같은 이름은 DB 부분 UNIQUE와 재조회로 중복 생성을 막지만, 별도의 멱등키 계약은 없다.
- 인증 한계: 현재는 요청의 `loginId`로 계정과 사무소를 찾는 데모 범위이며 검증된 인증 주체로 대체되지 않았다.
- 근거: `WorkforceController.createWorkType`, `WorkforceService.createWorkType`, `JdbcWorkforceDao.findVisibleWorkTypeByName/insertAgencyWorkType`, `createWorkType`.

### `GET /api/workforce/worker-separation-rules`

- 목적/화면: 작업자 정보 수정과 작업자 배치 충돌 표시.
- 쿼리: `loginId` string, 기본 `test`.
- 성공: `200`, `WorkerSeparationRuleResponse[]`.
- 범위: 해당 사무소의 활성 규칙만 반환한다. 한 쌍은 정규화된 A/B 순서로 한 번만 저장된다.
- 근거: `WorkforceController.getWorkerSeparationRules`, `WorkforceService.getWorkerSeparationRules`, `fetchWorkerSeparationRules`.

## 작업자 API

### `POST /api/workforce/workers`

- 목적/화면: `/workers`의 인력 등록 모달.
- 쿼리: `loginId` string, 기본 `test`.
- 본문: 위 `CreateWorkerRequest`.
- 성공: `200`, 전체 `WorkerListResponse`.
- 저장/부수 효과: 전화번호로 중앙 `worker`를 재사용하거나 생성하고, 현재 사무소 프로필·민감 전화·능력·수동 노쇼 위험·선택 계좌 프로필을 저장한다.
- 중복: 현재 사무소에 같은 전화번호가 있으면 `409 DUPLICATE_WORKER_PHONE`; 다른 사무소에만 있으면 중앙 작업자를 재사용하고 새 사무소 프로필을 만든다.
- 재시도: 생성 멱등키가 없다. 같은 정상 응답을 받지 못한 뒤 재시도하면 중복 전화 `409`가 될 수 있다.
- 근거: `WorkforceController.createWorker`, `WorkforceService.createWorker`, `WorkerProfileModal`, `createWorker`.

### `POST /api/workforce/workers/from-guest-assignment/{assignmentUuid}`

- 목적/화면: `/attendance`에서 익명 참여자를 정식 작업자로 등록.
- 경로: `assignmentUuid` UUID, 기존의 미삭제 `GUEST` 배정이어야 한다.
- 쿼리: `loginId` 필수.
- 본문: `CreateWorkerRequest`; 전화번호 11자리 필수.
- 성공: `200`, 전체 `WorkerListResponse`.
- 저장/부수 효과: 현재 사무소에 같은 전화번호 프로필이 있으면 그 프로필을 사용하고, 없으면 일반 등록 흐름을 수행한다. 해당 배정을 `REGISTERED`로 바꾸고 연결된 근태 행의 `worker_profile_uuid`도 갱신한다.
- 실패: 다른 사무소/비게스트/삭제 배정은 `400`; 같은 일정 날짜에 그 작업자가 이미 등록 배정되어 있으면 `400`.
- 재시도: 첫 성공 후 배정이 더는 GUEST가 아니므로 반복 호출은 `400`; 자동 재시도 금지.
- 근거: `WorkforceController.createWorkerFromGuestAssignment`, `WorkforceService.createWorkerFromGuestAssignment`, `JdbcWorkforceDao.linkGuestAssignmentToWorkerProfile`, `WorkerProfileModal`.

### `PATCH /api/workforce/worker-profiles/{profileUuid}`

- 목적/화면: `/workers`와 `/attendance`의 작업자 정보/평가 모달.
- 경로: 현재 사무소의 `profileUuid` UUID.
- 쿼리: `loginId` 기본 `test`.
- 본문: 전체 `UpdateWorkerProfileRequest`.
- 성공: `200`, 전체 `WorkerListResponse`.
- 저장/부수 효과: 이름/호칭, 전화, 중앙 성별/나이, 사무소 상세, 계좌, 작업 능력, 노쇼 위험을 교체한다. `separationRules != null`이면 해당 작업자의 동시 배치 주의 관계 전체를 교체하고 감사 주체 계정을 기록한다.
- 실패: 소유 범위, 이름/호칭, 전화 중복/형식, 나이, 요일 마스크, 계좌, 관계 검증 오류.
- 재시도: 값 자체는 교체형이지만 관계 및 수정 시각이 갱신되므로 외부 부수 효과까지 엄격한 멱등성은 보장하지 않는다.
- 근거: `WorkforceController.updateWorkerProfile`, `WorkforceService.updateWorkerProfile`, `WorkerProfileModal`, `updateWorkerProfile`.

### `DELETE /api/workforce/worker-profiles/{profileUuid}`

- 목적/화면: 작업자 정보 모달의 삭제.
- 성공: `200`, 삭제 후 전체 목록.
- 삭제 방식: 중앙 `worker`는 삭제하지 않는다. 사무소 프로필을 `ARCHIVED`/`deleted_at`, 계좌를 `deleted_at`, 활성 팀원을 `INACTIVE`/`deleted_at`으로 소프트 삭제한다.
- 반복 호출: 두 번째 호출은 소유 확인에서 찾지 못해 `400`이므로 멱등하지 않다.
- 근거: `WorkforceController.deleteWorkerProfile`, `WorkforceService.deleteWorkerProfile`, `JdbcWorkforceDao.softDeleteWorkerProfile`.

## 부분 수정 API

다음 API는 모두 `profileUuid`가 현재 `loginId`의 사무소에 속하는지 확인하고, 성공 시 `200` 전체 작업자 목록을 반환한다. API 함수는 존재하지만 현재 주요 화면은 전체 수정 모달을 우선 사용한다.

| 메서드와 경로 | 본문 | 규칙/영향 |
|---|---|---|
| `PATCH .../{profileUuid}/identity` | `{ "name": string, "nickname": string }` | 둘 중 하나 필수; 공백은 `null`; 중앙 이름과 사무소 이름/호칭 갱신 |
| `PATCH .../{profileUuid}/phone` | `{ "phone": string }` | 숫자 11자리, 같은 사무소 중복 금지; 민감/로컬 전화 갱신 |
| `PATCH .../{profileUuid}/pickup-location` | `{ "pickupLocation": string }` | 공백/생략은 `null`로 지움 |
| `PATCH .../{profileUuid}/gender` | `{ "gender": string }` | `M/MALE`, `F/FEMALE`, 나머지는 `UNKNOWN` |
| `PUT .../{profileUuid}/work-types` | `{ "workTypeCodes": string[], "workTypeRatings": object }` | 현재 능력 전체 교체; 시스템 기본 작업 또는 해당 프로필과 같은 사무소의 사용자 정의 작업만 연결; 내부 평점 `0..5`로 보정. Web의 A~D/미평가 표시는 위 환산 규칙을 사용 |

근거: `WorkforceController.updateWorkerIdentity/updateWorkerPhone/updateWorkerPickupLocation/updateWorkerGender/updateWorkerWorkTypes`, 대응하는 `WorkforceService` 메서드와 `web/src/api/workforceApi.ts`.

## 팀 API

팀 본문:

```json
{
  "teamName": "가상 1팀",
  "workerProfileUuids": [
    "11111111-1111-4111-8111-111111111111"
  ]
}
```

- `teamName`: 필수, 공백 불가. DB `varchar(150)`이나 Service 최대 길이 선검사는 없다.
- `workerProfileUuids`: null/중복/null 원소를 제거한 뒤 최소 1명. 모두 현재 사무소 프로필이어야 한다.
- 한 작업자가 다른 활성 팀에 있으면 API가 충돌로 거부하지 않고 이전 팀에서 비활성화한 뒤 새 팀으로 이동한다. 프론트 확인 팝업은 사용자 경험일 뿐 서버 계약이 아니다.

| 메서드와 경로 | 목적 | 성공/삭제/반복 |
|---|---|---|
| `POST /api/workforce/worker-teams` | `/teams` 팀 구성 | `200` 전체 작업자 목록; 새 팀과 순서 있는 팀원 생성; 재요청 시 별도 팀 생성 가능 |
| `PATCH /api/workforce/worker-teams/{teamUuid}` | 팀 수정 모달 | `200` 전체 목록; 팀명/팀원 전체 교체 |
| `DELETE /api/workforce/worker-teams/{teamUuid}` | 팀 삭제 | 팀과 팀원을 소프트 삭제; 반복 시 `400` |

근거: `WorkforceController.createWorkerTeam/updateWorkerTeam/deleteWorkerTeam`, `WorkforceService`, `JdbcWorkforceDao.createWorkerTeam/updateWorkerTeam/softDeleteWorkerTeam`, `TeamCompositionModal`, `TeamsPage`.

## 동시 배치 주의 저장 흐름

1. 작업자 전체 수정에서 `separationRules`를 저장한다. A-B 관계는 한 쌍으로 저장되므로 B를 먼저 배치한 뒤 A를 배치해도 같은 규칙이 조회된다.
2. 일정의 `assignments`를 포함해 저장하면 Schedule 서비스가 같은 날짜·현장 범위의 배정과 규칙을 검사한다.
3. 미확인 관계가 있으면 `409 WORKER_SEPARATION_CONFLICT`와 `conflicts`를 반환하고 일정 변경 트랜잭션은 저장되지 않는다.
4. 사용자가 확인하면 프론트는 `acknowledgedSeparationRuleUuids`에 충돌 UUID를 담아 동일 저장 요청을 다시 보낸다.
5. 서버는 저장을 허용하고 `worker_separation_override_audit`에 확인 기록을 추가한다.

충돌 응답과 일정 저장 본문은 [schedule.md](schedule.md#동시-배치-주의-확인-후-저장)를 참고한다.
