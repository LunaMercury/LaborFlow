# 노쇼 관리 API

2026-10-25 개발 중 구현 스냅샷. `dev` / `3576cbd` 이후 미커밋 변경과 migration 037 기준.
[근태](attendance.md) · [기존 대체 배정](schedule.md#노쇼-대체) · [DB 구조](../database/schema.md#노쇼)

## 화면과 상태

- 신규 노쇼 기록과 대체자 선택은 `/attendance`에서 한다. `/work-schedule`에는 관리 버튼이 없고 위험 표시만 읽는다.
- `/workers` 작업자 정보 수정의 작업자 활성화 영역에서 `노쇼 이력 관리`를 연다.
- 이력은 날짜·작업자명·상태만 보이는 접힌 상태로 시작하며, 해당 줄을 선택하면 상세와 관리 버튼이 열린다. 접기/펼치기는 저장 요청을 보내지 않고 입력 중인 메모도 유지한다.
- 근태에서 노쇼를 미리 저장하지 않아도 `대체자 선택`을 열어 검색할 수 있다. `대체 적용`은 기존 POST 대체 API 한 번으로 노쇼 기록과 대체 배정을 같은 트랜잭션에 저장한다. 기존 활성 사건이 있으면 그 사건의 대체자를 연결/변경하며 노쇼 전 스냅샷은 보존한다. 팝업 열기·검색·닫기는 저장하지 않는다.
- 대체자 팝업에서 이름·호칭을 브라우저 내에서 검색한다. 비활성 작업자와 해당 날짜의 다른 작업에 배정된 작업자는 제외한다(시간대가 달라도 제외). 취소·대체되어 종료된 배정만 있는 작업자는 후보에 남을 수 있다. 검색이나 팝업 닫기는 저장하지 않는다.
- 후보 목록은 처음에는 숨기고 검색어 입력 후에만 표시한다. 입력을 지우거나 공백만 남으면 목록과 검색 결과 없음 메시지를 숨기고 선택을 해제한다. 검색어 변경은 추가 API 요청을 보내지 않는다.
- 대체자 지정은 선택 사항이다. 미지정이면 노쇼 incident `OPEN`과 원배정의 `ABSENT`를 유지하고, 빈자리를 임의의 작업자로 채우지 않는다. 작업일지의 실제 인원은 `WORKED` 근태의 인원만 합산하므로 10명 중 1명 노쇼·9명 근무 확정이면 9명이다. 미확인 9명을 자동으로 근무 처리하지 않는다.
- 근태의 `ABSENT`와 활성 incident를 합쳐 화면에서 `NO_SHOW`(노쇼)로 표시한다. DB 근태 enum과 기존 PATCH의 허용값은 변경하지 않았다.
- 과거에 근태만 따로 바꾼 데이터는 incident와 근태가 다를 수 있다. 자동 보정하지 않으며 화면에 확인 필요를 표시한다. 기존 정산의 근태 원천/금액을 임의로 바꾸지 않는다.
- 일반 결근은 incident가 없고 노쇼 횟수에 포함하지 않는다. `CANCELLED` 근태는 작업/배정 취소이며, incident의 `CANCELLED`(노쇼 철회)와 다르다.
- 기존 수동 노쇼 위험 태그, 실제 노쇼 횟수, 숙련도는 별도다.

## 공통 계약

- 기본 경로 `/api/no-show/incidents`. 모든 요청 쿼리에 `loginId`가 필요하다.
- ACTIVE 계정의 사무소를 해석하고 배정·프로필·incident의 사무소 범위를 확인한다. **loginId를 신뢰하는 기존 방식이므로 실제 인증·역할 인가 완료가 아니며 운영 출시 차단 사항은 그대로다.**
- UUID는 문자열, 업무 날짜는 `yyyy-MM-dd`, 미래 날짜 판정은 `Asia/Seoul`이다. 이벤트 시각은 offset을 포함한 ISO 날짜·시각이다.
- 성공은 모두 HTTP 200 JSON. 프론트는 쓰기 응답 본문을 사용하지 않고 새로 조회한다.
- 메모와 사유는 trim 후 최대1000자 일반 텍스트다. HTML 실행이나 자동 외부 공유는 하지 않는다.
- 전용 오류 응답은 `{code,message,timestamp}`. 입력/대상/사무소 범위 오류는 `400 NO_SHOW_VALIDATION`, DB 충돌은 `409 NO_SHOW_CONFLICT`, 그 밖의 오류는 `500 NO_SHOW_UNAVAILABLE`.
  미처리 SQL/메모 원문을 전용 핸들러의 응답·로그에 남기지 않는다. 기존 대체 배정 API는 기존 오류 계약을 따른다.

## 이력 조회

`GET /api/no-show/incidents?loginId&workerProfileUuid&workDate`

- `workerProfileUuid` 또는 `workDate` 중 하나 필수. 둘 다 있으면 교집합이다.
- 프로필은 현재 사무소 소유여야 한다. 없는 프로필과 타 사무소 프로필의 실패를 구분해서 노출하지 않는다.
- 응답 `{incidents: Incident[]}`. 취소된 이력도 포함하며 근무일 역순, 생성 시각 역순, UUID 순이다.
- `Incident`: uuid, originalAssignmentUuid, scheduleDayUuid, workDate, workerProfileUuid(nullable), workerName,
  ownerName, siteName, workTitle, status `OPEN|REPLACED|CANCELLED`, note(nullable),
  replacementWorkerProfileUuid(nullable), replacementWorkerName(없으면 빈 문자열), replacementAssignmentUuid(nullable),
  createdAt, updatedAt, cancelledAt(nullable), revisions.
- `revisions`: action `CREATED|REPLACEMENT_CHANGED|NOTE_UPDATED|CANCELLED`, note(nullable), createdAt, performedByAccountUuid(nullable).
- 이름·현장명은 현재 연결된 사무소 정보에서 조회한다. 과거 표시명의 확정 스냅샷 문서는 아니다.
- 익명 참여자는 배정으로 기록한다. 나중에 해당 배정에 작업자 프로필이 연결되면 그 프로필의 조회/횟수에 포함한다.
- 조회는 DB에 빈 기록을 만들지 않는다. 현재 페이지네이션이 없고 이력별 revision 조회가 있어 대량 이력 성능은 별도 검증 대상이다.

## 신규 기록

`POST /api/no-show/incidents?loginId`

```json
{
  "assignmentUuid": "10000000-0000-4000-8000-000000000001",
  "note": "가상 확인 메모"
}
```

- assignmentUuid 필수. note null/생략/공백은 메모 없음이다.
- 현재 사무소의 삭제되지 않은 활성 날짜 일정/현장/배정을 확인한다. 프로필이 있다면 그 사무소 소유인지도 확인한다.
- 오늘/과거 배정만 가능하고 이미 취소되었거나 대체된 배정에 새로 기록하지 않는다.
- 원래 배정 상태와 근태 JSON을 보관하고, incident `OPEN`, 근태 `ABSENT/UNKNOWN`, 실제시간 null, 휴게0, 배정 `ABSENT`로 같은 트랜잭션에서 기록한다.
- 등록·익명 모두 가능하다. 익명을 중앙 worker에 임의 등록하지 않는다.
- 이미 활성 incident가 있으면 기존 결과를 반환하고 메모/스냅샷/근태를 다시 덮어쓰지 않는다.
  취소 후 재등록하면 기존 incident UUID를 재사용하며 이전 revision은 남는다.
- 작업자 최근 근무 요약을 재계산한다. 정산 금액/입출금은 변경하지 않으며 기존 정산의 원천 재확인 규칙을 따른다.

## 메모 수정

`PATCH /api/no-show/incidents/{uuid}?loginId`

본문 `{ "note": "수정한 가상 메모" }`. null/공백은 지움이다.
취소된 이력도 수정 가능하며 `NOTE_UPDATED` revision에 새 값·처리자·시각을 남긴다. 같은 정규화 값이면 no-op이다.

## 노쇼 취소

`POST /api/no-show/incidents/{uuid}/cancel?loginId`

본문 `{ "reason": "오등록 확인" }`. 사유 필수, trim 후 최대1000자.

- OPEN 또는 REPLACED를 취소하고 원래 배정 상태·근태를 복원한다. 취소 전 근태가 없으면 노쇼 근태만 소프트 삭제한다.
- 노쇼 처리로 생성한 대체 배정만 조건부 소프트 삭제하며, 원래 있던 대체자 배정은 삭제하지 않는다.
- 시스템 생성 대체 배정에 WORKED 근태가 있으면 먼저 해당 근태를 검토해야 하므로 취소/대체자 변경이 거부될 수 있다.
- incident를 CANCELLED로 바꾸고 취소 사유·처리자·시각/revision을 보존한다. 사건과 revision을 물리 삭제하지 않는다.
- 이미 취소된 같은 사건의 재요청은 기존 결과다. 원천 배정/일정이 삭제되어 복원할 수 없으면 임의 재생성하지 않고 거부한다.
- 취소와 revision 사유 기록은 같은 트랜잭션이다. 실패하면 원래 사건/근태/대체 배정을 유지한다.

## 대체와 갱신

- 근태의 대체자 선택/변경은 기존 `POST /api/schedule/tasks/{scheduleDayUuid}/no-show-replacement`를 사용한다.
  등록/익명 원배정에 사건이 없으면 생성하고, OPEN/REPLACED가 있으면 대체자만 연결/변경한다. 같은 대체자로 재시도하면 no-op이다. 기존 PUT은 활성 사건 대상의 호환 경로로 유지한다.
- 일정 조회가 OPEN 사건의 상태를 빈 문자열로 반환할 수 있다. UI는 빈 문자열 때문에 근태 메타데이터를 덮어쓰거나 검색을 막지 않는다. 저장된 근태 UUID나 ABSENT 상태를 UI 진입 조건으로 요구하지 않는다. 취소된 실제 배정과 미래 날짜, 사무소 소유권 검사는 유지한다.
- 현재 대체자 팝업은 당일 미배정 작업자만 표시하며 시간 중복 확인 단계를 노출하지 않는다. 이 후보 필터는 프론트 조회 시점 기준이고, 기존 대체 API의 서버 동시 배정 제한을 새로 추가한 것은 아니다. 다른 화면의 동시 변경 가능성과 작업자 간 동시 배치 주의 검증이 이 경로에 없다는 기존 한계도 유지된다.
  거래처-작업자 배치 주의의 409/acknowledgement 확인은 그대로 유지한다.
- 활성 노쇼의 근태를 일반 PATCH로 덮어쓸 수 없다. 이력에서 노쇼를 먼저 취소해야 한다.
- 성공한 변경은 같은 탭 이벤트와 다른 탭 storage 신호로 현재 사무소 데이터를 재조회한다.
  근태는 미저장 입력을 보존하고, 배치 화면은 작업자 위험 표시만 갱신해 배치 초안을 지우지 않는다. WebSocket/새 Redis 기반은 없다.

## 근거와 검증 범위

`noshow/api/NoShowController`, `NoShowExceptionHandler`, `application/NoShowService`, `dao/JdbcNoShowDao`,
`JdbcScheduleDao.changeNoShowReplacement/cancelNoShow`, `AttendanceService.updateRecord`, `JdbcAttendanceDao.findRecords`,
`JdbcWorkforceDao.findWorkers`, web `noShowApi.ts`, `AttendancePage`, `NoShowHistoryModal`, `NoShowCreateModal`, `AttendanceNoShowReplacementModal`.

실제 고객 DB에는 적용/쓰기 검증을 하지 않는다. JUnit/모의 fetch·UI와 전용 임시 DB 검증 결과는 완료 보고에 구분한다.
전체 마이그레이션 001~037의 실제 운영 이행, 실제 인증·직원별 권한 및 대량 트래픽 보장은 별도다.
