# 일지 API

[API 문서 홈](README.md) · [공통 계약](common.md) · [DB 관계](../database/relationships-and-flows.md)

## 공통 범위

- 현재 화면은 `demoSession`의 `loginId`를 쿼리로 전달하고, 서버는 활성 계정의 `agency_owner_uuid`를 모든 읽기·쓰기에 적용한다. 이는 SQL 범위 조건이며 실제 인증 완료를 뜻하지 않는다.
- 날짜는 `yyyy-MM-dd`, 영업 활동 일시는 `yyyy-MM-ddTHH:mm` 요청을 기준으로 서버가 `Asia/Seoul` 시각으로 해석한다.
- DELETE는 `deleted_at`을 기록하는 소프트 삭제다. 본문과 메모는 일반 문자열로 처리하며 HTML 실행 계약은 없다.

## 영업일지

### 목록 조회

`GET /api/journals/sales`

- 화면: `/sales-journals`
- 쿼리: `loginId` 필수, `fromDate`·`toDate`·`query` 선택.
- 날짜 범위는 양 끝을 포함한다. 종료일이 시작일보다 빠르면 `400 BAD_REQUEST`다.
- `query`는 본문 대소문자 비구분 포함 검색이다. 빈 값은 필터하지 않는다.
- 성공 `200`: `SalesJournalResponse[]`, `activityAt DESC, createdAt DESC` 순서.

```json
[
  {
    "uuid": "11111111-1111-4111-8111-111111111111",
    "activityAt": "2026-09-11T14:30:00+09:00",
    "content": "구지 방면 작물 상태 확인\n추석 이후 작업 예정",
    "createdAt": "2026-09-11T14:31:00+09:00",
    "updatedAt": "2026-09-11T14:31:00+09:00"
  }
]
```

### 상세 조회

`GET /api/journals/sales/{journalUuid}`

- 현재 사무소의 활성 일지가 아니면 `400 BAD_REQUEST`다. 다른 사무소의 일지 존재 여부는 응답으로 구분하지 않는다.
- 성공 `200`: 단일 `SalesJournalResponse`.

### 작성과 수정

- 작성: `POST /api/journals/sales?loginId={loginId}`
- 수정: `PUT /api/journals/sales/{journalUuid}?loginId={loginId}`
- 본문: `activityAt` 필수 `LocalDateTime`, `content` 필수 비공백 문자열. 줄바꿈은 보존하고 바깥 공백만 제거한다.
- 제목·거래처·연락처·후속 조치 필드는 없고 같은 날짜에 여러 행을 저장할 수 있다.
- 성공 `200`: 저장된 `SalesJournalResponse`. 요청 멱등키가 없어 POST 자동 재시도는 중복 일지를 만들 수 있다.

### 삭제

`DELETE /api/journals/sales/{journalUuid}?loginId={loginId}`

- 성공 `200`, 빈 본문. 일지의 `deleted_at`과 수정 계정만 갱신하며 거래처·일정은 변경하지 않는다.

## 작업일지

### 저장된 목록 조회

`GET /api/journals/work`

- 화면: `/work-journals`
- 쿼리: `loginId` 필수, `fromDate`·`toDate`·`clientQuery` 선택.
- 저장된 활성 `work_journal`만 반환한다. 일지를 열기만 한 일정은 자동 생성되거나 목록에 포함되지 않는다.
- 날짜는 `work_schedule_day.work_date`, 거래처 검색은 현재 사무소 표시 이름의 포함 검색이다.
- 성공 `200`: `WorkJournalSummaryResponse[]`, 작업일 최신순.

### 일정별 상세 조회

`GET /api/journals/work/{scheduleDayUuid}?loginId={loginId}`

- 일정관리의 작업 수정 화면에서 선택한 날짜 또는 저장된 목록이 호출한다.
- `/work-journals`의 `작업일지 작성`은 작업일과 거래처·현장·작업 검색으로 기존 일정을 먼저 선택한다. 일정 선택 목록은 기존 `GET /api/schedule/tasks`를 사용하며, 선택만으로 빈 일지를 저장하지 않는다.
- 현재 사무소의 활성 일정이면 저장된 일지가 없어도 `200`이며 `journalUuid`, `createdAt`, `updatedAt`은 `null`, `memo`는 `""`다.
- 거래처·현장·주소·작업 내용은 현재 일정 원본을 읽는다. 근태 배열은 활성 배정별 현재 근태를 읽고, 레코드가 없으면 `status="UNRECORDED"`와 null 실제 시간·휴게를 반환한다.
- `actualWorkerCount`는 `status="WORKED"`인 배정의 `workerCount` 합계다. 등록 작업자는 1명이고 익명 참여자 묶음은 저장된 배정 인원수를 사용한다. 배정·DRAFT를 실제 근무로 간주하거나 작업자별 시간을 서로 보완하지 않는다.

```json
{
  "journalUuid": null,
  "scheduleDayUuid": "22222222-2222-4222-8222-222222222222",
  "workDate": "2026-09-11",
  "ownerName": "가상 거래처",
  "siteName": "가상 현장",
  "address": "가상 주소",
  "workTitle": "마늘 심기",
  "memo": "",
  "createdAt": null,
  "updatedAt": null,
  "actualWorkerCount": 1,
  "attendance": [
    {
      "displayName": "가상 작업자",
      "participantType": "registered",
      "workerCount": 1,
      "status": "WORKED",
      "actualStartTime": "07:10",
      "actualEndTime": "16:20",
      "breakMinutes": 60
    }
  ]
}
```

### 메모 저장

`PUT /api/journals/work/{scheduleDayUuid}?loginId={loginId}`

- 본문: `{ "memo": "진행 내용\n남은 작업" }`. 메모는 선택이며 공백만 입력하면 null로 저장한다.
- 같은 날짜별 작업에는 활성 일지 최대 한 행만 존재한다. 같은 식별자로 다시 저장하면 INSERT가 아니라 UPDATE된다.
- 성공 `200`: 저장 후 현재 원본을 다시 읽은 `WorkJournalDetailResponse`.
- 일정·배정·근태·정산은 수정하지 않는다.

### 일지 삭제

`DELETE /api/journals/work/{scheduleDayUuid}?loginId={loginId}`

- 성공 `200`, 빈 본문. `work_journal`만 소프트 삭제하고 원본 일정·배정·근태는 유지한다.

## 근거 소스

- `backend-core/src/main/java/com/laborflow/core/journal/api/JournalController.java`
- `backend-core/src/main/java/com/laborflow/core/journal/application/JournalService.java`
- `backend-core/src/main/java/com/laborflow/core/journal/dao/JdbcJournalDao.java`
- `web/src/api/journalApi.ts`
- `web/src/pages/SalesJournalPage.tsx`
- `web/src/pages/WorkJournalPage.tsx`

사진 첨부, 외부 공유, 법정서식 자동 작성의 선행조건과 비구현 범위는
[일지 후속 기능 검토](../product/journal-follow-ups.md)에 기록한다.
