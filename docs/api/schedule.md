# 일정과 배치 API

[API 문서 홈](README.md) · [공통 계약](common.md) · [거래처/현장](clients.md) · [근태](attendance.md)

## 식별자와 화면

- `workSiteId`: 여러 날짜를 묶는 작업 묶음 `farm_work_site` UUID.
- `id` 또는 `scheduleDayUuid`: 묶음 안 특정 날짜 `work_schedule_day` UUID.
- `clientWorkSiteUuid`: 거래처에 등록된 현장 마스터 UUID. 일정 묶음 UUID와 다르다.
- `assignmentUuid`: 등록 작업자 또는 익명 한 명의 배정 UUID.
- `participantGroupUuid`: 익명 인원 여러 명을 한 UI 토큰으로 묶는 UUID.

`/schedule` 달력 화면은 생성, 다일 이동/크기 조정, 범위 상세 수정/삭제를 사용한다. `/work-schedule` 작업자 배치 화면은 날짜 조회, 날짜별 상세/배정 수정, 익명 참여자, 노쇼, 예정 근무를 사용한다.

## 공통 일정 응답

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "workSiteId": "22222222-2222-4222-8222-222222222222",
  "clientWorkSiteUuid": "33333333-3333-4333-8333-333333333333",
  "ownerUuid": "44444444-4444-4444-8444-444444444444",
  "title": "마늘 수확",
  "ownerName": "가상 농장주",
  "siteName": "동문 제1현장",
  "address": "가상시 동문로 10",
  "siteMemo": "진입로 확인",
  "timeRange": "07:00 - 17:00",
  "startTime": "07:00",
  "endTime": "17:00",
  "requiredMen": 2,
  "requiredWomen": 5,
  "workTypeCodes": ["garlic_harvest"],
  "memo": "장갑 준비",
  "assignments": [
    {
      "assignmentUuid": "55555555-5555-4555-8555-555555555555",
      "participantGroupUuid": "66666666-6666-4666-8666-666666666666",
      "workerProfileUuid": "77777777-7777-4777-8777-777777777777",
      "participantType": "registered",
      "displayName": "가상 작업자",
      "pickupLocation": "중앙시장",
      "area": "women",
      "workerCount": 1,
      "plannedStartTime": "",
      "plannedEndTime": "",
      "assignmentStatus": "planned",
      "attendanceStatus": "",
      "noShowIncidentUuid": null,
      "noShowReplacementWorkerProfileUuid": null,
      "noShowReplacementAssignmentUuid": null,
      "noShowIncidentStatus": ""
    }
  ]
}
```

- `startTime`, `endTime`, 배정 예정 시간은 `HH:mm` 또는 빈 문자열이다.
- `timeRange`는 둘 다 있으면 `HH:mm - HH:mm`, 하나만 있으면 그 값, 둘 다 없으면 빈 문자열이다.
- `participantType`: `registered | guest`; `area`: `men | women`.
- 배정/근태/노쇼 상태는 DB 값을 소문자로 반환하며 DTO enum으로 강제하지 않는다. 현재 대표 값은 `planned`, `replaced`, `draft`, `worked`, `absent`, `cancelled`, 빈 문자열이다.

## 조회 API

### `GET /api/schedule/tasks`

- 목적/화면: `/schedule` 월 범위의 날짜별 로딩과 `/work-schedule` 선택 날짜 작업 목록.
- 쿼리: `loginId` string 기본 `test`; `workDate` LocalDate 필수, `yyyy-MM-dd`.
- 성공: `200`, `{ "tasks": ScheduleTaskResponse[] }`.
- 범위: 현재 사무소의 활성·미삭제 일정만 해당 날짜로 조회. 등록 작업자는 현재 활성 프로필인 경우만 보이고 guest는 프로필 없이 보인다.
- 실패: `workDate` 누락/형식 오류는 Controller 진입 전 400 계열; 계정/사무소 없음은 공통 `400`.
- 재시도: 안전하다.
- 근거: `ScheduleController.getTasks`, `ScheduleService.getTasks`, `JdbcScheduleDao.findTasks`, `fetchScheduleTasks`, `ScheduleCalendarPage`, `WorkSchedulePage`.

### `GET /api/schedule/farm-owners`

- 목적/화면: 일정 추가/수정의 농장주 자동완성.
- 쿼리: `loginId` 기본 `test`; `query` 기본 빈 문자열.
- 검색: 이름, 호칭, 상호/농장명을 대소문자 무시 부분 일치. 빈 검색은 정렬된 앞 20개, 결과 최대 20개.
- 성공: `200`, `FarmOwnerOptionResponse[]`. 각 항목은 `profileUuid`, 중앙 `uuid`, 표시/개별 이름, 전화, 직전 일정 title/site/address/time, 현재 거래처 현장 `workSites`를 포함한다.
- 범위: 현재 사무소의 활성 거래처만.
- 근거: `ScheduleController.getFarmOwners`, `ScheduleService.getFarmOwners`, `JdbcScheduleDao.findFarmOwners`, `fetchFarmOwners`, `ScheduleCalendarPage`.

## 일정 생성

### `POST /api/schedule/tasks`

본문:

```json
{
  "ownerUuid": "44444444-4444-4444-8444-444444444444",
  "ownerName": "",
  "ownerNickname": "",
  "ownerPhone": "",
  "startDate": "2026-09-10",
  "endDate": "2026-09-12",
  "title": "마늘 수확",
  "clientWorkSiteUuid": "33333333-3333-4333-8333-333333333333",
  "siteName": "동문 제1현장",
  "address": "가상시 동문로 10",
  "siteMemo": "진입로 확인",
  "requiredMen": 2,
  "requiredWomen": 5,
  "startTime": "07:00",
  "endTime": "17:00",
  "memo": "장갑 준비",
  "workTypeCodes": ["garlic_harvest"]
}
```

| 필드 | 필수/규칙 |
|---|---|
| `ownerUuid` | 기존 거래처면 필수. 현재 사무소 중앙 농장주 UUID여야 함 |
| `ownerName`, `ownerNickname`, `ownerPhone` | `ownerUuid: null`일 때 거래처 자동 생성용. 이름/호칭 중 하나와 숫자 10~11자리 전화 필수. 기존 거래처에 전화가 없으면 `ownerPhone`으로 보완하며 이미 있으면 입력을 무시 |
| `startDate`, `endDate` | 둘 다 필수, 종료 >= 시작, 최대 370개 날짜(시작부터 +369일) |
| `title` | 필수, trim 후 빈 문자열 불가 |
| `clientWorkSiteUuid` | 선택. 있으면 해당 거래처/사무소 현장이어야 함 |
| `siteName` | 선택. UUID 없이 값이 있으면 거래처 현장 마스터에 저장/재사용 |
| `address` | 최종적으로 필수. 기존 현장을 선택하면 마스터 주소가 우선 |
| `siteMemo`, `memo` | 선택, 공백은 `null` |
| `requiredMen`, `requiredWomen` | JSON integer 필드, 각각 `0..10000`; 생략 시 primitive 기본 `0` |
| `startTime`, `endTime` | 각각 선택; 둘 다 있으면 종료가 시작보다 뒤여야 함 |
| `workTypeCodes` | null/빈 배열 가능, 중복/공백 제거; 미등록/비활성 코드는 조용히 무시 |

- 성공: `200`, 생성 범위의 첫 날짜 `ScheduleTaskResponse`만 반환한다.
- 저장: 하나의 `farm_work_site` 작업 묶음과 날짜별 `work_schedule_day`를 생성하고 작업 유형을 묶음에 연결한다. 배정은 생성하지 않는다.
- 재시도: 멱등키가 없어 같은 내용의 별도 작업 묶음이 생성될 수 있다.
- 근거: `ScheduleController.createTask`, `ScheduleService.createTask`, `JdbcScheduleDao.createTask`, `createScheduleTask`, `ScheduleCalendarPage`.

## 날짜별 일정과 배치 수정

### `PUT /api/schedule/tasks/{scheduleDayUuid}`

- 목적/화면: `/work-schedule`의 작업 내용 수정과 등록 작업자 배정 저장.
- 경로: 현재 사무소의 날짜별 일정 UUID.
- 쿼리: `loginId` 기본 `test`; `workDate` 필수이며 수정 대상 일정의 현재 날짜와 일치해야 응답을 찾을 수 있다. 불일치하면 마지막 조회가 실패해 트랜잭션이 롤백된다.
- 본문:

```json
{
  "ownerUuid": "44444444-4444-4444-8444-444444444444",
  "title": "마늘 수확",
  "clientWorkSiteUuid": "33333333-3333-4333-8333-333333333333",
  "siteName": "동문 제1현장",
  "address": "가상시 동문로 10",
  "siteMemo": "진입로 확인",
  "startTime": "07:00",
  "endTime": "17:00",
  "requiredMen": 2,
  "requiredWomen": 5,
  "memo": "장갑 준비",
  "workTypeCodes": ["garlic_harvest"],
  "assignments": [
    {
      "workerProfileUuid": "77777777-7777-4777-8777-777777777777",
      "area": "women",
      "workerCount": 1
    }
  ],
  "acknowledgedSeparationRuleUuids": []
}
```

- `ownerUuid`, `title`, 최종 `address`는 필수다. 인원/시간/작업 유형 규칙은 생성과 같다.
- `assignments` 생략/`null`: 등록 작업자 배정을 건드리지 않는다.
- `assignments: []`: 기존 등록 배정 중 `REPLACED`가 아닌 행을 모두 소프트 삭제한다. 익명 배정과 교체된 원배정은 유지한다.
- 각 배정의 `workerProfileUuid`: null 항목은 무시, 나머지는 현재 사무소의 활성 프로필이어야 한다.
- `area`: 대소문자 무시 `women`만 여성 영역, 그 밖의 값/null은 남성 영역.
- `workerCount`: `<= 0`은 1, 최대 100.
- 성공: `200`, 수정한 날짜의 `ScheduleTaskResponse`.

**영향 범위 주의**

한 날짜 API지만 `title`, 농장주, 현장명/주소, `clientWorkSiteUuid`, `workTypeCodes`는 공유 `farm_work_site`에 저장되어 묶음의 다른 날짜에도 보인다. 시간, 필요 인원, 일정 메모, 배정은 해당 `scheduleDayUuid`에만 적용된다. 다일 묶음의 모든 날짜 상세를 일관되게 바꾸려면 범위 API를 사용한다.

근거: `ScheduleController.updateTask`, `ScheduleService.updateTask`, `JdbcScheduleDao.updateTask/replaceTaskWorkTypes/replaceAssignments`, `updateScheduleTask`, `WorkSchedulePage`.

## 동시 배치 주의 확인 후 저장

`assignments`를 포함한 날짜별 수정에만 서버 충돌 검사가 실행된다.

- 비교 범위: 같은 사무소, 날짜, 같은 거래처 현장 UUID. 현장 UUID가 없으면 같은 농장주+정규화 주소.
- 시간: 양쪽 시간이 모두 있으면 구간이 실제로 겹칠 때만 비교. 어느 한쪽 시간이 없으면 충돌 가능 대상으로 본다.
- 현재 일정 자체는 제외하고 다른 일정의 `REGISTERED`, 미교체, 활성 배정을 비교한다.
- 미확인 규칙이 있으면 `409 WORKER_SEPARATION_CONFLICT`; 트랜잭션이 롤백되어 일정/배정이 저장되지 않는다.
- 확인 후 `conflicts[].ruleUuid`를 `acknowledgedSeparationRuleUuids`에 넣어 동일 요청을 다시 보내면 저장되고 override 감사 행이 추가된다.
- 클라이언트가 관련 없는 UUID를 보내도 서버는 현재 충돌을 실제로 다시 계산한다. 다만 인정 UUID 자체가 현재 사무소 규칙인지 별도 선검사되는 계약은 확인되지 않았다.

일정 생성, 범위 상세 수정, 익명 인원, 노쇼 대체 API에는 이 충돌 흐름이 적용되지 않는다.

## 익명 참여자

등록 작업자와 달리 중앙 `worker`나 사무소 작업자 프로필을 만들지 않고, 인원수만큼 `work_schedule_assignment`의 `GUEST` 행을 만든다. 같은 `participantGroupUuid`로 묶인다.

요청:

```json
{
  "area": "men",
  "participantCount": 2,
  "displayName": "현장 합류 2명",
  "pickupLocation": "현장 직행",
  "introductionType": "NONE",
  "introducedByWorkerProfileUuid": null,
  "settlementRecipientWorkerProfileUuid": null,
  "plannedStartTime": "07:00",
  "plannedEndTime": "17:00"
}
```

### `POST /api/schedule/tasks/{scheduleDayUuid}/guest-participants`

- 쿼리: `loginId`, `workDate` 모두 필수.
- `participantCount`: `<= 0`이면 1, 최대 100.
- `introductionType`: null -> `NONE`; `NONE | WORKER | EXTERNAL | UNKNOWN`. `WORKER`면 `introducedByWorkerProfileUuid`가 현재 사무소 프로필로 필수, 다른 유형이면 소개자 UUID를 지운다.
- 정산 수령 작업자 UUID가 있으면 현재 사무소 프로필이어야 한다.
- 시간은 선택이며 둘 다 있으면 종료 > 시작.
- 성공: `200`, 갱신된 일정.
- 재시도: 호출마다 새 그룹과 배정을 만들므로 멱등하지 않다.

### `PUT /api/schedule/tasks/{scheduleDayUuid}/guest-participants/{participantGroupUuid}`

- 쿼리: `loginId`, `workDate` 필수.
- `participantCount`: 반드시 `1..100`.
- 현재 구현은 area, 인원, 표시명, 승차장소, 예정시간만 갱신한다.
- **프론트/DTO 차이**: 프론트는 생성과 같은 `introductionType`, 소개자, 정산 수령자를 보내지만 수정 DAO는 이 세 필드를 변경하지 않는다. 소개자 UUID가 본문에 있으면 소유 검증은 하지만 값은 저장하지 않는다.
- 인원 감소분은 소프트 삭제, 증원분은 새 guest 행을 추가한다. 증원된 행의 소개/정산 정보는 `NONE`/null로 생성된다.
- 성공: `200`, 갱신된 일정. 그룹/일정이 없을 때 일부 DAO 갱신은 0행이어도 즉시 오류가 나지 않을 수 있으며 최종 조회 결과만 반환할 수 있어 개선 확인이 필요하다.

### `DELETE /api/schedule/tasks/{scheduleDayUuid}/guest-participants/{participantGroupUuid}`

- 쿼리: `loginId`, `workDate` 필수.
- 삭제 방식: 해당 사무소/일정/group의 guest 배정을 모두 `deleted_at`으로 소프트 삭제.
- 성공: `200`, 갱신된 일정.
- 반복 호출: 두 번째는 그룹을 찾지 못해 `400`.

근거: `ScheduleController.addGuestParticipants/updateGuestParticipants/deleteGuestParticipants`, `ScheduleService`, `JdbcScheduleDao`, `WorkSchedulePage`, 대응 `scheduleApi` 함수.

## 노쇼 대체

세 API 모두 등록 작업자의 원배정과 현재 사무소의 대체 작업자 프로필을 사용한다.

```json
{
  "originalAssignmentUuid": "55555555-5555-4555-8555-555555555555",
  "replacementWorkerProfileUuid": "88888888-8888-4888-8888-888888888888"
}
```

### `POST /api/schedule/tasks/{scheduleDayUuid}/no-show-replacement`

- 쿼리: `loginId`, `workDate` 필수.
- 검증: 일정/대체 작업자 사무소 범위, 두 UUID 필수, 원배정은 해당 일정의 활성 REGISTERED, 자기 자신 대체 금지.
- 저장: 원배정 근태를 `ABSENT/UNKNOWN`, 실제시간 null, 휴게 0으로 upsert하고 원배정을 `REPLACED`로 바꾼다. 대체자가 같은 일정에 이미 있으면 기존 배정을 연결하고, 없으면 원배정 영역/시간을 복사한 새 REGISTERED 배정을 만든다. 노쇼 incident와 revision을 기록한다.
- 같은 대체자로 동일 요청: 이미 교체된 상태면 성공 no-op 후 일정 반환. 다른 대체자로 POST 반복은 `400`; 변경 API를 사용해야 한다.

### `PUT /api/schedule/tasks/{scheduleDayUuid}/no-show-replacement`

- 활성 `REPLACED` incident가 있어야 한다.
- 새 대체자가 같으면 no-op. 다르면 새 대체 배정을 연결/생성하고, 이전에 API가 생성했던 대체 배정은 제거하며 incident/revision을 갱신한다.
- 성공: `200`, 갱신된 일정.

### `DELETE /api/schedule/tasks/{scheduleDayUuid}/no-show-replacement/{originalAssignmentUuid}`

- 활성 교체 incident가 있어야 한다.
- API가 만든 대체 배정을 제거하고 원배정 상태 및 노쇼 전 근태 JSON을 복원한다. incident는 `CANCELLED`로 상태 전환하고 revision을 남긴다.
- 성공: `200`, 갱신된 일정. 반복 호출은 활성 incident를 찾지 못해 `400`.

**미구현 보장**

- 대체자가 같은 시간 다른 현장에 이미 배정되었는지 서버가 거부하거나 경고하는 검증은 이 API에 없다. 현재 후보의 “현재 배정” 표시는 프론트 정보다.
- 동시 배치 주의 규칙도 노쇼 대체 API에는 적용되지 않는다.

근거: `ScheduleController.replaceNoShow/changeNoShowReplacement/cancelNoShow`, `ScheduleService`, `JdbcScheduleDao.replaceNoShow/changeNoShowReplacement/cancelNoShow`, `WorkSchedulePage`, 대응 `scheduleApi` 함수.

## 다일 일정 범위

모든 범위 API에서 `taskIds`는 날짜별 `scheduleDayUuid` 목록이다. null/빈 목록/모두 null이면 `400`; 중복과 null 원소는 제거된다. 모든 ID가 현재 사무소에 속하고 같은 `workSiteId`여야 한다.

### `PUT /api/schedule/tasks/range`

- 목적/화면: `/schedule`에서 카드 이동 및 좌우 크기 조정.
- 본문: `{ "taskIds": UUID[], "startDate": "yyyy-MM-dd", "endDate": "yyyy-MM-dd" }`.
- 날짜: 종료 >= 시작, 최대 370개 날짜.
- 동작: 기존 날짜 ID를 새 범위 앞쪽부터 재사용한다. 줄이면 남는 날짜와 배정을 소프트 삭제하고, 늘리면 마지막 날짜를 템플릿으로 새 날짜를 만든다.
- 배정 보존: 재사용된 날짜의 배정은 날짜와 함께 이동한다. 새로 늘어난 날짜에는 배정을 복사하지 않는다.
- 대상 작업 묶음에 이미 다른 활성 날짜가 있으면 `400 Target schedule dates already exist`가 공통 메시지로 감춰진다.
- 성공: `200`, 빈 본문.
- 재시도: 범위 확장으로 새 UUID가 생길 수 있고 응답에 새 ID가 없으므로 엄격한 재시도 계약이 아니다. 성공 후 다시 조회해야 한다.

### `PUT /api/schedule/tasks/range/details`

- 목적/화면: `/schedule` 작업내용 수정 팝업에서 한 블록 전체 수정.
- 본문: `taskIds/startDate/endDate` + 생성 요청의 `ownerUuid,title,clientWorkSiteUuid,siteName,address,siteMemo,startTime,endTime,requiredMen,requiredWomen,memo,workTypeCodes`.
- `ownerUuid`는 기존 현재 사무소 거래처만 가능하다. 새 농장주 자동 생성 필드는 없다.
- 먼저 모든 ID를 검증하고 같은 상세 값을 각 날짜에 적용한 뒤 범위를 재조정한다. 메서드는 단일 DB 트랜잭션이다.
- 등록/익명 배정을 `replaceAssignments`하지 않으므로 재사용 날짜의 배정을 보존한다. 범위 축소/확장의 배정 규칙은 위와 같다.
- 성공: `200`, 빈 본문. 저장 후 달력은 재조회해야 한다.

### `DELETE /api/schedule/tasks/range`

- 목적/화면: `/schedule` 수정 팝업 또는 `/work-schedule` 작업 카드 삭제.
- 본문: `{ "taskIds": UUID[] }`.
- 삭제 방식: 포함 날짜의 모든 배정을 소프트 삭제하고 날짜를 `ARCHIVED/deleted_at` 처리한다. 묶음 날짜가 하나도 없으면 `farm_work_site`도 보관 상태로 전환한다.
- 성공: `200`, 빈 본문. 반복 호출은 날짜를 찾지 못해 `400`.

근거: `ScheduleController.rescheduleTaskRange/updateTaskRange/deleteTaskRange`, `ScheduleService`, `JdbcScheduleDao.rescheduleTaskRange/deleteTaskRange`, `ScheduleCalendarPage`, `WorkSchedulePage`, 대응 `scheduleApi` 함수.
