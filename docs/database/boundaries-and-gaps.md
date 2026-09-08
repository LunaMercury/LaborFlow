# 데이터 경계와 확인 사항

[DB 문서 홈](README.md) · [최종 스키마](schema.md) · [관계와 흐름](relationships-and-flows.md) · [API 불일치](../api/gaps.md)

## 구현 상태 구분

### 1. 현재 구현·사용 중

- 사무소별 작업자/거래처 프로필과 중앙 identity 재사용
- 작업자 작업 종류·별점, 지급 계좌, 팀, 기본 활동 여부/요일
- 거래처별 여러 현장 마스터와 일정 입력 시 현장 재사용
- 작업 묶음, 날짜별 일정, 등록·익명 작업자 배정
- 근태 입력, 예정대로 근무, 작업 메모, revision, 최근 활동 summary
- 노쇼 처리·대체자 변경·취소와 incident revision
- 작업자 동시 배치 주의, 409 확인 후 저장, override audit
- 작업자·팀·거래처·일정의 애플리케이션 소프트 삭제

### 2. DB 구조는 있으나 사용자 기능과 미연결

- `app_identity_provider`, `app_account_social_identity`, `app_auth_session`: 소셜 로그인과 refresh session 기반
- `labor_agency_worker_availability_exception`: 기간별 휴식·가용 예외
- `work_schedule_assignment_pay_term`: 배정별 작업자/작업별 단가
- `attendance_settlement_period`: 정산 기간과 지급/잠금 상태
- `call_analysis_job`, `call_analysis_result`: 녹음 분석 작업과 임시 추출 결과
- revision 테이블의 사용자 조회·감사 화면

### 3. 기존 문서에 계획되어 있으나 미구현

- 지급 완료 후 수정 차액을 별도 조정 항목으로 만드는 정산 UX
- 반장 등 세분화된 직원 권한과 승인 흐름
- 통화 녹음 업로드→분석→초안 확인→적용 API와 모바일 연결
- DB 기반 서버 페이지네이션/검색으로 전체 작업자 목록을 확장하는 흐름

이 목록은 `database/attendance-data-policy.md`와 기존 API 문서에 근거한다. DB 이름만 보고 추측한 확장 기능은 포함하지 않았다.

### 4. 구현·문서 사이 불일치 또는 확인할 문제

아래 항목은 현재 구조를 정당화하지 않으며, 후속 변경 전에 영향 범위를 확인해야 한다.

## 개인정보와 암호화

### `_encrypted` 저장값 — 높은 우선순위 확인 필요

- migration과 `database/README.md`는 `_encrypted` 컬럼에 암호화된 값을 저장해야 한다고 설명한다.
- 현재 `JdbcWorkforceDao`, `JdbcClientsDao`, `JdbcProfileDao`는 화면 입력을 정규화한 문자열을 `_encrypted` 컬럼 파라미터로 직접 전달한다. DAO 앞단의 별도 암호화 서비스는 조사 범위에서 확인되지 않았다.
- 따라서 컬럼명만으로 저장 시 암호화됐다고 볼 수 없다. 실제 운영 전 암호화 계층, 키 관리, 기존 데이터 이관을 별도 검증해야 한다.
- hash는 PostgreSQL `digest(..., 'sha256')`로 생성하는 코드가 있으나, 단순 hash는 전화번호처럼 후보 공간이 좁은 값의 비밀성 보장이 아니다.

### 개인정보 분리의 실제 의미

- 중앙 `worker_sensitive_profile`과 `farm_owner_sensitive_profile`은 중복 식별에 쓰이고, 사무소별 profile에도 전화·계좌 사본이 있다.
- 테이블 분리는 접근 정책을 설계하기 쉽게 하지만, 자체로 암호화·마스킹·접근 통제를 보장하지 않는다.
- 주민등록번호 컬럼은 DB에 있으나 현재 사용자 API 저장 경로는 확인되지 않았다.
- 문서·예시에 실제 개인정보, 비밀번호, token, seed 비밀값을 기록하지 않는다.

## 사무소 데이터 경계

### 현재 확인된 범위 확인

- DAO SQL은 대체로 `app_account.login_id`에서 `labor_agency_owner_uuid`를 찾고, profile·site·schedule·attendance 쿼리에 같은 사무소 UUID 조건을 적용한다.
- 동시 배치 주의는 `(agency_owner_uuid, worker_profile_uuid)` 복합 FK로 두 작업자가 규칙 소유 사무소에 속하는지 DB에서도 확인한다.
- 한 중앙 worker/farm owner가 여러 사무소 profile에 연결되는 것은 허용된다. 사무소는 다른 사무소 profile의 local 이름·전화·메모를 조회하지 않는다.

### 보장하지 못하는 부분

- Controller가 받는 `loginId`와 일부 기본값 `test`는 요청자가 직접 전달한다. 인증된 principal에서 나온 사무소라고 검증하는 구조는 현재 확인되지 않았다.
- 따라서 사무소 UUID 조건이 SQL에 있다는 사실만으로 인증·인가 격리가 완성됐다고 표현하면 안 된다.
- `app_role`, social identity, session 테이블 존재도 실제 로그인/권한 집행을 뜻하지 않는다.

## 삭제와 보존

| 사용자 동작 | 애플리케이션 처리 | 물리 FK 관점 | 확인 사항 |
|---|---|---|---|
| 작업자 삭제 | worker profile archive, payment/team member soft delete | 중앙 worker와 sensitive row 보존 | skill은 active row로 남아 부모 profile 필터로만 숨겨짐 |
| 팀 삭제 | team archive, member inactive/soft delete | 행 보존 | 같은 복합 PK 재활성화 경로 존재 |
| 거래처 삭제 | agency farm owner profile archive | 중앙 owner, sensitive, client sites, schedules 보존 | site 자체 deleted_at은 변경하지 않음 |
| 일정 날짜/범위 삭제 | assignments soft delete, days archive; 빈 group archive | attendance/no-show FK 행 보존 | 이력 조회 정책은 별도 확인 필요 |
| 계정 탈퇴 | account/agency owner status archive | 자식 행 보존 | `deleted_at`과 개인정보 파기 일정 없음 |

DB의 `ON DELETE CASCADE`는 **물리 DELETE가 실행될 때**만 동작한다. 현재 주요 삭제 API는 대부분 status/`deleted_at`을 바꾸므로 cascade가 실행되지 않는다.

## 이력과 트랜잭션

- `ClientsService`, `WorkforceService`, `ScheduleService`, `ProfileService`의 쓰기 메서드와 Attendance 쓰기 메서드는 Spring `@Transactional`이다.
- Attendance 조회는 `@Transactional(readOnly=true)`다. 여러 데이터소스나 분산 트랜잭션은 확인되지 않았다.
- 근태와 일정 작업 메모 revision은 DB trigger라 같은 DB 트랜잭션에 포함된다.
- 노쇼 revision과 separation override audit은 DAO가 명시적으로 쓰며 호출 Service 트랜잭션에 포함된다.
- 동시 배치 주의 저장은 PostgreSQL transaction advisory lock을 사용한다. 다른 쓰기 경로가 같은 lock key를 사용하지 않으면 전역 충돌 방지가 되는 것은 아니다.
- revision table이 있다고 해서 불변 감사 저장소, 별도 보존 기간, 관리자 조회, 위변조 방지가 완성된 것은 아니다.

## 확인된 불일치와 영향

### 개발 seed가 일반 migration에 포함됨

- migration `007`, `012`, `013`, `015`, `016`, `017`, `019`에는 데모 계정·작업자·일정·팀 데이터 생성 SQL이 포함된다.
- `backend-core/build.gradle`의 `processResources`는 `database/migrations` 전체를 Flyway 위치로 복사하며 환경별 seed 제외 조건이 보이지 않는다.
- `database/README.md`는 seed 계정을 로컬 개발 전용이라고 설명하지만, 소스 패키징만 보면 운영 migration에서도 실행될 가능성이 있다.
- 영향: 운영 데이터 오염과 데모 계정 생성 위험. 실제 배포 profile과 운영 이력을 확인하기 전에는 확정된 사고로 표현하지 않는다.

### 작업자 소프트 삭제 범위

- 기존 API 문서의 삭제 요약은 작업자 skill도 함께 소프트 삭제하는 것으로 읽힐 수 있다.
- 현재 `JdbcWorkforceDao.softDeleteWorkerProfile`은 팀원, 지급 profile, worker profile을 변경하지만 `labor_agency_worker_work_skill.deleted_at`은 갱신하지 않는다.
- 영향: 작업자는 화면에서 숨지만 skill row는 활성 상태로 남는다. 재등록/복원 정책에 따라 의도일 수도 있으므로 정책 확인이 필요하다.

### 일정 묶음과 날짜별 값의 중복

- `farm_work_site`에도 날짜 범위·시간·인원·메모가 있고 `work_schedule_day`에도 날짜별 시간·인원·메모가 있다.
- 현재 조회·수정은 날짜별 값을 우선 사용하며, 제목·거래처·현장·작업 종류는 묶음 단위로 다룬다.
- 단건 `updateTask`는 묶음의 제목·현장과 한 day의 시간·인원·메모를 함께 바꾼다. 범위 전체 수정과 의미가 다르므로 호출 API를 구분해야 한다.
- 영향: 한 날짜만 바꾼다는 UI가 묶음 공통 정보를 바꾸거나, 그룹 기본값이 날짜별 값과 달라질 수 있다.

### 익명 참여자 수정 필드 누락

- 프론트 요청은 소개 유형·소개자·정산 수령자 필드를 보낼 수 있다.
- 현재 `ScheduleService.updateGuestParticipants`/DAO 수정 경로는 이름·승차장소·인원·영역·시간 중심이며 일부 소개/정산 필드를 저장하지 않는다.
- 영향: 화면이 수정 성공처럼 보여도 해당 필드는 유지되지 않을 수 있다. 자세한 계약은 [API gaps](../api/gaps.md)를 따른다.

### 예정대로 근무 후 assignment 상태

- 소스상 `confirmPlanned`의 근태 upsert와 assignment 상태 갱신 조건이 서로 영향을 주어 assignment가 `PLANNED`로 남을 가능성이 기존 API 조사에서 제기됐다.
- 이번 작업은 DB/런타임 실행을 하지 않았으므로 재현된 버그로 확정하지 않는다.
- 영향: 배정 상태와 확정 근태 상태가 어긋나면 노쇼·재배치·화면 상태 판단이 달라질 수 있다.

### 비활성 작업 종류 코드

- 일정 작업 종류 교체 SQL은 `work_type.status='ACTIVE'`인 코드만 INSERT SELECT한다.
- 요청 코드가 없거나 비활성이면 DB 오류 없이 누락될 수 있다.
- 영향: 성공 응답과 사용자의 선택 결과가 달라질 수 있다.

### 인덱스 중복 후보

- 후속 partial index가 추가된 뒤 기존 비부분 인덱스 일부가 남아 있다(예: team owner/status, member team/status, schedule day date/site 계열).
- 실제 사용량과 `EXPLAIN`, 인덱스 통계를 확인하지 않았으므로 불필요하다고 단정하지 않는다.
- 영향: 쓰기 비용과 저장 공간이 늘 수 있으나 조회 패턴에 따라 필요할 수 있다.

## 마이그레이션 적용 구성

- 원본: `database/migrations/NNN_name.sql`.
- `backend-core/build.gradle`의 `processResources`가 이를 `classpath:db/migration/VNNN__name.sql`로 복사하고 파일의 단독 `BEGIN;`/`COMMIT;` 줄을 제거한다.
- `application.properties` 기본값은 Flyway 활성, location `classpath:db/migration`, `baseline-on-migrate=false`, baseline version `0`이다.
- 기존 DB는 검증된 버전에서 한 번만 baseline해야 한다는 운영 지침이 있다.
- 이 문서에서는 Core를 기동하거나 migration을 적용하지 않았다. 실제 운영 DB가 V032인지, 실패·수동 변경·schema drift가 있는지는 `flyway_schema_history`와 카탈로그 대조가 필요하다.

## 후속 질문

1. `_encrypted` 필드의 운영 암호화 방식과 키 회전·검색 hash 정책을 언제 확정할 것인가?
2. 제품 배포에서 demo seed migration을 어떻게 분리하고 이미 적용된 환경은 어떻게 정리할 것인가?
3. 작업자 삭제 시 skill을 보존해 복원할 것인지, 함께 archive할 것인지?
4. 일정 묶음의 시간·인원·메모 컬럼은 기본값인지 캐시인지, 날짜별 day가 유일한 원본인지?
5. 익명 참여자의 소개자·정산 수령자 수정 계약을 유지할 것인지 제거할 것인지?
6. 정산 기간이 `PAID|LOCKED`일 때 근태 수정·삭제를 막거나 차액 기록으로 전환할 것인지?
7. 계정 탈퇴 후 개인정보 보존·파기 기간과 복구 정책은 무엇인지?
8. revision과 override audit의 조회 권한·보존 기간·운영 모니터링은 어떻게 할 것인지?

## 개선 제안, 아직 미확정

- 운영 전 스키마 drift 검사를 배포 검증에 넣고 문서 기준 migration을 자동 대조한다.
- seed를 환경별 migration 또는 별도 개발 데이터 로더로 분리한다.
- 암호화는 DAO 문자열 관례가 아니라 명시적 application/infrastructure 경계와 키 버전 메타데이터로 강제한다.
- 사무소 범위는 `loginId` 요청 파라미터가 아니라 인증 principal과 정책 테스트로 보장한다.
- 삭제/복원/개인정보 파기 정책을 상태 전이표로 확정한 뒤 skill·site 등 자식 처리 범위를 일관되게 만든다.
