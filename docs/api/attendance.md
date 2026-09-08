# 근태 API

[API 문서 홈](README.md) · [공통 계약](common.md) · [일정/배치](schedule.md)

## 현재 흐름

1. `/work-schedule`에서 날짜별 등록/익명 작업자를 배치한다.
2. 당일 또는 과거 작업을 “예정대로 근무”로 일괄 처리하거나 `/attendance`에서 행별 실제 상태/시간을 수정한다.
3. 저장할 때 `worker_attendance_record`와 변경 이력이 갱신되고 작업자 최근 근무 요약을 다시 계산한다.

근태 조회는 배정 행뿐 아니라 날짜의 일정 목록을 별도로 반환한다. 따라서 배정이 하나도 없는 일정도 `tasks`에 나타나며 `records`는 빈 배열일 수 있다.

업무 날짜와 예정 시간은 현장 로컬 값이고, 실제 시각 저장/미래 날짜 판정은 `Asia/Seoul`을 사용한다.

## 조회

### `GET /api/attendance/records`

- 목적/화면: `/attendance`의 선택 날짜 일정과 출근 행.
- 쿼리: `loginId` string 필수; `workDate` LocalDate 필수, `yyyy-MM-dd`.
- 성공: `200`, `{ "tasks": AttendanceScheduleDayResponse[], "records": AttendanceRecordResponse[] }`.
- 범위: `loginId`의 사무소 및 해당 날짜. 다른 사무소 배정은 반환하지 않는다.
- 정렬: 일정 시작시간, 작업명, 영역, 배정 생성 순서.
- 재시도: 안전하다.
- 근거: `AttendanceController.getRecords`, `AttendanceService.getRecords`, `JdbcAttendanceDao.findScheduleDays/findRecords`, `fetchAttendanceRecords`, `AttendancePage`.

예시:

```json
{
  "tasks": [
    {
      "scheduleDayUuid": "11111111-1111-4111-8111-111111111111",
      "workDate": "2026-09-08",
      "ownerName": "가상 농장주",
      "workTitle": "마늘 수확",
      "siteName": "동문 제1현장",
      "address": "가상시 동문로 10",
      "taskNote": "현장 확인 완료",
      "plannedStartTime": "07:00",
      "plannedEndTime": "17:00"
    }
  ],
  "records": [
    {
      "assignmentUuid": "22222222-2222-4222-8222-222222222222",
      "attendanceUuid": null,
      "scheduleDayUuid": "11111111-1111-4111-8111-111111111111",
      "workerProfileUuid": "33333333-3333-4333-8333-333333333333",
      "participantType": "registered",
      "displayName": "가상 작업자",
      "pickupLocation": "중앙시장",
      "area": "women",
      "workDate": "2026-09-08",
      "ownerName": "가상 농장주",
      "workTitle": "마늘 수확",
      "siteName": "동문 제1현장",
      "address": "가상시 동문로 10",
      "taskNote": "현장 확인 완료",
      "plannedStartTime": "07:00",
      "plannedEndTime": "17:00",
      "actualStartTime": "",
      "actualEndTime": "",
      "breakMinutes": 0,
      "status": "DRAFT",
      "timeEntryType": "UNKNOWN",
      "confirmed": false
    }
  ]
}
```

`participantType`은 `registered | guest`, `area`는 `men | women`이다. 등록 작업자의 `workerProfileUuid`와 저장 전 `attendanceUuid`는 null일 수 있다. 시간은 `HH:mm` 또는 빈 문자열이다.

## 예정대로 근무

### `POST /api/attendance/confirm-planned`

- 목적/화면: `/work-schedule` 작업 카드의 “예정대로 근무”. 프론트 타입은 네 범위를 모두 지원한다.
- 쿼리: `loginId` string 필수, null/공백 거부.
- 본문:

```json
{
  "scope": "SCHEDULE_DAY",
  "assignmentUuid": null,
  "scheduleDayUuid": "11111111-1111-4111-8111-111111111111",
  "workDate": "2026-09-08"
}
```

| `scope` | 필수 대상 | 적용 범위 |
|---|---|---|
| `ASSIGNMENT` | `assignmentUuid` | 한 배정 |
| `SCHEDULE_DAY` | `scheduleDayUuid` | 한 날짜 일정의 배정 전체 |
| `DATE` | `workDate` | 사무소의 해당 날짜 배정 전체 |
| `WEEK` | `workDate` | 해당 날짜가 속한 월요일~일요일 |

- scope는 trim/대문자화하며 위 네 값 외에는 `400`.
- 오늘 또는 과거의 활성·미취소 배정만 처리한다. 미래 범위는 오류 대신 대상에서 제외되어 `confirmedCount: 0`이 될 수 있다.
- 기존 근태가 `DRAFT`이거나 미확정일 때만 덮어쓴다. 이미 확정된 WORKED/ABSENT/CANCELLED는 유지한다.
- 예정 시작/종료는 배정별 값이 있으면 우선하고 없으면 날짜 일정 시간을 쓴다.
- 저장값: `status=WORKED`, 휴게 60분, 예정 시간이 하나라도 있으면 `timeEntryType=PLANNED`, 둘 다 없으면 `UNKNOWN`, 확인 계정/시각 기록.
- 성공: `200`, `{ "confirmedCount": 3 }`.
- 존재하지 않는 배정과 다른 사무소 배정은 모두 SQL 범위에서 제외되어 현재 `200`/0건으로 구분되지 않는다. 이 동작은 타 사무소 소속 여부를 노출하지 않는다.
- 반복 호출: 이미 확정된 행은 다시 바뀌지 않아 대체로 0건이다. 작업자 활동 요약 새로고침은 매번 수행된다.
- 알려진 의심 동작: 근태 INSERT/UPDATE 후 배정 상태 갱신 SQL이 이미 확정된 근태를 제외하므로, 새로 확정된 배정의 `work_schedule_assignment.status`가 `WORKED`로 바뀌지 않을 가능성이 있다. [gaps.md](gaps.md#확인된-구현-위험) 참고.
- 근거: `AttendanceController.confirmPlanned`, `AttendanceService.confirmPlanned`, `JdbcAttendanceDao.confirmPlanned/refreshWorkerActivitySummary`, `confirmPlannedAttendance`, `WorkSchedulePage`.

## 근태 수정

### `PATCH /api/attendance/records/{assignmentUuid}`

- 목적/화면: `/attendance`의 행 단위 검토/저장.
- 경로: 배정 UUID.
- 쿼리: `loginId` 필수.
- 본문:

```json
{
  "actualStartTime": "07:10",
  "actualEndTime": "16:50",
  "breakMinutes": 60,
  "status": "WORKED",
  "timeEntryType": "EXACT"
}
```

| 필드 | 타입 | 처리 |
|---|---|---|
| `actualStartTime`, `actualEndTime` | LocalTime/null | `HH:mm` 권장. 둘 다 있으면 종료 > 시작. 자정을 넘기는 근무는 현재 표현 불가 |
| `breakMinutes` | integer/null | null -> 0, 허용 `0..1440` |
| `status` | string/null | null -> `DRAFT`; `DRAFT | WORKED | ABSENT | CANCELLED`, 대소문자 무시 |
| `timeEntryType` | string/null | 명시하면 `PLANNED | EXACT | ESTIMATED | UNKNOWN`; 자동 규칙은 아래 참고 |

- 미래 근무일은 `400`으로 거부한다. 현재 날짜 판정은 `Asia/Seoul`.
- `WORKED`: 요청 시간이 없으면 기존 실제시간, 그마저 없으면 예정시간 순서로 보완한다. 예정시간 자체가 없으면 실제시간이 null인 WORKED도 가능하다.
- `ABSENT`/`CANCELLED`: 실제 시작/종료를 null, 휴게를 0, `timeEntryType`을 `UNKNOWN`으로 강제한다.
- 그 밖의 상태에서 `timeEntryType` 생략: 요청 시간이 있으면 `EXACT`, WORKED이며 직접 시간이 없으면 `PLANNED`, 나머지는 `UNKNOWN`.
- 성공: `200`, 저장 후 해당 `AttendanceRecordResponse`.
- 저장/부수 효과: 근태 upsert, 배정 상태를 WORKED/ABSENT/CANCELLED 또는 DRAFT일 때 PLANNED로 동기화, 근태 revision 자동 기록, 작업자 활동 요약 재계산.
- 존재하지 않거나 다른 사무소 배정: 같은 `400 BAD_REQUEST`로 처리되어 소속 여부가 노출되지 않는다. 저장은 수행되지 않는다.
- 재시도: 같은 값이어도 `updated_at`, 확인 시각, revision이 추가될 수 있어 엄격한 멱등성은 없다.
- 근거: `AttendanceController.updateRecord`, `AttendanceService.updateRecord`, `JdbcAttendanceDao.findAssignmentContext/upsertRecord`, `updateAttendanceRecord`, `AttendancePage`.

## 작업 메모

### `PATCH /api/attendance/schedule-days/{scheduleDayUuid}/note`

- 목적/화면: `/attendance` 일정 섹션 하단 메모.
- 경로: 날짜별 일정 UUID.
- 쿼리: `loginId` 필수.
- 본문: `{ "note": "현장 확인 완료" }`.
- 처리: null/공백은 `null`로 저장하여 지운다. trim 후 최대 4000자.
- 성공: `200`, `{ "scheduleDayUuid": "...", "note": "현장 확인 완료" }`; 삭제된 메모는 응답에서 빈 문자열.
- 저장/부수 효과: `work_schedule_day_attendance_summary` upsert 및 summary revision 기록.
- 다른 사무소/없는 일정: 갱신 0건을 확인해 `400`.
- 재시도: upsert와 감사 revision 때문에 엄격한 멱등성 없음.
- 근거: `AttendanceController.updateTaskNote`, `AttendanceService.updateTaskNote`, `JdbcAttendanceDao.upsertTaskNote`, `updateAttendanceTaskNote`, `AttendancePage`.

## 상태와 시간 근거

| 값 | 현재 의미 |
|---|---|
| `DRAFT` | 아직 확정하지 않은 근태 |
| `WORKED` | 근무로 확인 |
| `ABSENT` | 결근/노쇼 등 근무하지 않음 |
| `CANCELLED` | 배정 또는 근무 취소 |
| `PLANNED` | 예정시간을 실제시간 근거로 사용 |
| `EXACT` | 사용자가 실제시간을 직접 입력 |
| `ESTIMATED` | 추정 시간 |
| `UNKNOWN` | 시간 근거가 없거나 결근/취소 |

단가와 정산 기간은 DB에 구조가 있지만 이 API 응답/수정에는 포함되지 않는다. [gaps.md](gaps.md#db에만-있는-영역)를 참고한다.
