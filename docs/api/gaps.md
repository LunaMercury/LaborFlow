# 불일치와 미구현 영역

[API 문서 홈](README.md) · [공통 계약](common.md)

이 파일은 현재 구현을 정상 정책으로 정당화하지 않고, 후속 작업에서 확인하거나 수정해야 할 차이를 모은다.

## 프론트와 백엔드 불일치

### 운영 프록시 기본 주소

- `docker-compose.prod.yaml`은 Web 빌드의 `VITE_API_BASE_URL` 기본값을 `/api`로 둔다.
- 프론트 API 함수는 여기에 다시 `/api/...`를 붙인다.
- 기본값 그대로 빌드하면 브라우저 요청이 `/api/api/...`가 된다.
- `deploy/Caddyfile`은 `/api/*`를 접두사 유지 상태로 backend-core에 전달하고 backend-core 경로는 `/api/...`다.

따라서 운영 기본 구성은 Core API 경로가 한 번 중복될 가능성이 높다. 현재 소스만으로 실제 배포 성공을 확인하지 않았으며, 제품 코드 변경 없이 문서에만 기록했다. 후속 작업에서는 `VITE_API_BASE_URL`을 origin 빈 값으로 둘지, API 함수 경로/프록시 strip 정책을 바꿀지 하나의 계약으로 정해야 한다.

### 익명 참여자 수정

`web/src/api/scheduleApi.ts`의 `updateGuestParticipants`는 생성과 같은 payload를 보낸다. 그러나 `ScheduleService.updateGuestParticipants`와 `JdbcScheduleDao.updateGuestParticipants`는 다음 필드를 저장하지 않는다.

- `introductionType`
- `introducedByWorkerProfileUuid`
- `settlementRecipientWorkerProfileUuid`

소개자 UUID는 전달되면 사무소 범위 검증만 하고 무시된다. 인원을 늘릴 때 새 행은 소개 유형 `NONE`, 소개자/정산 수령자 null로 만들어질 수 있다. 사용자 화면에서 값을 수정 가능한 것으로 보이면 저장 결과와 어긋난다.

### nullable/optional 타입

- Java response record에는 nullable 표기가 없지만 실제 SQL은 여러 UUID/날짜/문자열에 null 또는 빈 문자열을 반환한다.
- `web/src/api/scheduleApi.ts`는 `ScheduleAssignment`의 많은 필드를 optional로 두고, 백엔드는 항상 키를 직렬화하되 값이 null/빈 문자열일 수 있다.
- `web/src/data/workerRows.ts`의 일부 필드는 백엔드 `WorkerResponse`보다 더 느슨하다.

런타임 파싱 계층은 없고 TypeScript 단언만 사용한다. 필드 계약 변경 시 컴파일만으로 응답 호환성을 검증할 수 없다.

### 오류 표시

프론트 API 함수 일부는 서버의 `{message}`를 읽지만 일부는 고정 한국어 문구만 사용한다. 백엔드도 대부분 검증 상세를 `Request could not be processed.`로 감춘다. 따라서 사용자는 형식/소유/상태 오류를 구분하기 어렵다. 내부 정보를 노출하지 않는 범위에서 안정된 세부 오류 code가 더 필요하다.

## 확인된 구현 위험

### 인증과 권한

현재 로그인 화면은 비밀번호를 서버에 보내지 않고 localStorage `demoSession`만 만든다. 모든 주요 API는 URL의 `loginId`를 신뢰한다. DAO의 사무소 범위 조건은 있지만 공격자가 다른 login ID를 제출하지 못하게 하는 인증/인가가 없다.

보안 정책 문서의 JWT/역할 계획은 **의도된 정책**이며 구현된 API가 아니다.

### 민감정보 암호화

`JdbcProfileDao.upsertSensitiveProfile`은 전화, 이메일, 주소, 사업자번호, 계좌번호를 이름이 `*_encrypted`인 컬럼에 전달하지만 애플리케이션 암호화 호출이 없다. hash는 PostgreSQL `digest`로 별도 계산한다. 현재 코드만 보면 암호화 컬럼에 원문이 저장된다.

작업자/거래처 DAO도 `*_encrypted` 명칭을 사용하므로 운영 개인정보 투입 전에 실제 저장값, 키 관리, 암복호화 계층을 별도로 검증해야 한다. 컬럼 이름은 보안 보장이 아니다.

### 예정대로 근무의 배정 상태

`JdbcAttendanceDao.confirmPlanned`은 근태를 먼저 `WORKED`/확정으로 upsert한 뒤 배정 상태를 갱신한다. 뒤 SQL은 이미 확정된 비-DRAFT 근태가 있는 배정을 제외하므로, 방금 확정된 배정도 제외되어 `work_schedule_assignment.status`가 기존 `PLANNED`로 남을 가능성이 있다.

근태 응답은 `worker_attendance_record.status`를 읽으므로 화면상 근태는 WORKED로 보일 수 있다. 배정 상태를 사용하는 다른 화면/쿼리와 불일치할 수 있으며 회귀 테스트와 제품 수정이 필요하다.

### 작업 유형 코드

작업자와 일정 API는 알 수 없거나 비활성인 `workTypeCodes`를 오류로 반환하지 않는다. 기존 연결을 먼저 소프트 삭제한 뒤 유효 코드만 다시 삽입하므로 오타가 데이터 누락으로 이어질 수 있다.

### 날짜별 수정의 혼합 범위

`PUT /api/schedule/tasks/{scheduleDayUuid}`는 날짜별 API지만 title/농장주/현장/작업 유형은 공유 묶음에, 시간/인원/메모/배정은 한 날짜에 저장한다. 화면이 이를 구분하지 않으면 일부만 전체 날짜에 반영된 것처럼 보일 수 있다. `/schedule`의 블록 수정은 범위 상세 API를 사용하지만 다른 호출자는 주의해야 한다.

## DB에만 있는 영역

아래 구조는 migration 또는 정책 문서에 있지만 대응 Controller/API가 없다.

| 영역 | 확인된 DB 구조 | 현재 상태 |
|---|---|---|
| 배정별 단가 | `work_schedule_assignment_pay_term`: `HOURLY/DAILY/HALF_DAY/PIECE`, 약정/작업자 금액, 통화 | 조회/등록/수정 API 없음 |
| 정산 기간 | `attendance_settlement_period`: `OPEN/CONFIRMED/PAID/LOCKED` | API 없음 |
| 근태 변경 이력 | `worker_attendance_revision` | DB trigger로 기록되나 조회 API 없음 |
| 노쇼 변경 이력 | `worker_no_show_incident_revision` | 기록되나 조회 API 없음 |
| 동시 배치 확인 감사 | `worker_separation_override_audit` | 저장만 되고 조회 API 없음 |
| 통화 분석 | `call_analysis_job`, `call_analysis_result` | 업로드/분석/초안 조회 API 없음 |
| 작업자 가능일 예외 | `labor_agency_worker_availability_exception` | 현재 작업자 응답은 주간 마스크/메모만 사용; 예외 API 없음 |

DB 테이블이 있다는 이유만으로 위 기능을 프론트에서 사용할 수 있다고 문서화하면 안 된다.

## 계획만 있고 구현되지 않은 경로

- 실제 로그인, 로그아웃, 토큰 갱신, 비밀번호 변경/재설정
- JWT 검증과 역할별 API 인가
- backend-fast 업로드/스트리밍/실시간 fan-out
- WebSocket `/ws`
- 통화 녹음 업로드와 분석 초안
- 단가/정산/지급 확정과 차액 조정
- 감사 이력 조회

## 삭제 동작 요약

| 대상 | 현재 삭제 방식 |
|---|---|
| 작업자 | 사무소 프로필·계좌·팀 관계 소프트 삭제; 중앙 worker 유지 |
| 팀 | 팀/팀원 소프트 삭제 |
| 거래처 | 사무소 거래처 프로필 소프트 삭제; 중앙 farm_owner와 일정 유지 |
| 거래처 현장 | 거래처 수정 시 전체 소프트 삭제 후 본문 현장 복원/생성 |
| 일정 범위 | 배정 소프트 삭제, 날짜 ARCHIVED/deleted_at, 빈 작업 묶음 보관 처리 |
| 익명 참여자 | 배정 deleted_at |
| 노쇼 취소 | incident를 CANCELLED로 상태 전환하고 이전 배정/근태 복원 |
| 계정 탈퇴 | app_account와 labor_agency_owner를 ARCHIVED; 하위 업무 데이터 물리 삭제 안 함 |

DELETE 재호출은 대상별로 `200` 또는 `400`이 달라 일관된 멱등 계약이 아니다.

## 후속 확인 우선순위

1. `loginId` 쿼리 기반 데모 흐름을 실제 인증 주체 기반으로 교체하고 사무소/역할 인가 테스트를 만든다.
2. 운영 `/api` 기본 주소 중복을 배포 테스트로 재현하고 한 가지 base URL 규칙으로 고정한다.
3. 민감 컬럼의 실제 저장값을 비운영 데이터로 확인하고 암호화/키 관리 경계를 구현한다.
4. 예정대로 근무 후 assignment 상태를 통합 테스트로 검증한다.
5. 익명 참여자 소개/정산 필드의 수정 계약을 유지/수정 중 하나로 결정한다.
6. DB-only 단가/정산 계약은 화면과 업무 정책 승인 후 별도 API로 설계한다.
