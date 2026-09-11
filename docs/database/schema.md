# 최종 스키마 기준표

[DB 문서 홈](README.md) · [관계와 흐름](relationships-and-flows.md) · [경계와 확인 사항](boundaries-and-gaps.md)

이 문서는 migration `001`부터 `032`까지를 순서대로 읽어 `ALTER`, 인덱스 재생성, 제약 삭제·추가를 반영한 **파일상 최종 상태**를 적는다. 운영 DB 적용 상태는 확인하지 않았다.

## 표기법과 공통 규칙

- `NN`: `NOT NULL`; 표기가 없으면 null 허용이다.
- `PK`, `FK`, `UQ`: 기본키, 외래키, 고유 제약/인덱스.
- UUID PK는 별도 표기가 없으면 `DEFAULT gen_random_uuid()`다.
- `created_at`, `updated_at`은 별도 표기가 없으면 `timestamptz NN DEFAULT now()`이고, 두 컬럼이 있는 변경 가능 테이블은 대체로 `set_updated_at()` 트리거가 `updated_at`을 갱신한다.
- `deleted_at`은 `timestamptz` nullable이며 값이 있으면 애플리케이션 조회에서 숨기는 소프트 삭제 표식이다.
- `_encrypted`는 컬럼 이름일 뿐 실제 암호화 보장이 아니다. 현재 저장 코드 상태는 [개인정보 경계](boundaries-and-gaps.md#개인정보와-암호화)를 본다.

## 전체 테이블 목록

| 도메인 | 테이블 | 상태 | 주 용도 |
|---|---|---|---|
| 계정 | `labor_agency_owner`, `labor_agency_owner_sensitive_profile`, `app_account`, `app_role`, `app_account_role` | 사용 중 | 사무소·계정·프로필 |
| 계정 | `app_identity_provider`, `app_account_social_identity`, `app_auth_session` | DB 기반 | 소셜 로그인·세션 기반 |
| 작업자 | `worker`, `worker_sensitive_profile`, `labor_agency_worker_profile`, `labor_agency_worker_work_skill`, `labor_agency_worker_payment_profile` | 사용 중 | 중앙 작업자와 사무소별 정보 |
| 작업자 | `labor_agency_worker_availability_exception` | DB 기반 | 기간별 가용성 예외 |
| 작업자 | `labor_agency_worker_team`, `labor_agency_worker_team_member`, `worker_risk_flag`, `labor_agency_worker_separation_rule`, `worker_separation_override_audit` | 사용 중 | 팀·위험·동시 배치 주의 |
| 거래처 | `farm_owner`, `farm_owner_sensitive_profile`, `labor_agency_farm_owner_profile`, `labor_agency_farm_owner_site` | 사용 중 | 중앙 거래처·사무소별 거래처·등록 현장 |
| 일정 | `farm_work_site`, `farm_work_site_work_type`, `work_schedule_day`, `work_schedule_assignment` | 사용 중 | 작업 묶음·날짜·배정 |
| 근태 | `worker_attendance_record`, `worker_attendance_revision`, `worker_activity_summary`, `work_schedule_day_attendance_summary`, `work_schedule_day_attendance_summary_revision` | 사용 중 | 근태·메모·이력·최근 활동 |
| 노쇼 | `worker_no_show_incident`, `worker_no_show_incident_revision` | 사용 중 | 노쇼 원배정·대체·취소 이력 |
| 정산 | `work_schedule_assignment_pay_term`, `attendance_settlement_period` | DB 기반 | 배정 단가·정산 기간 |
| 통화 분석 | `call_analysis_job`, `call_analysis_result` | DB 기반 | 녹음 분석 작업·임시 결과 |

총 39개다.

## 코드 근거 지도

- 스키마와 데이터 이관: `database/migrations/*.sql`
- Flyway 패키징: `backend-core/build.gradle`의 `processResources`
- Flyway 실행 설정: `backend-core/src/main/resources/application.properties`
- 작업자·팀·위험·동시 배치 주의: `backend-core/src/main/java/com/laborflow/core/workforce/dao/JdbcWorkforceDao.java`
- 거래처와 등록 현장: `backend-core/src/main/java/com/laborflow/core/clients/dao/JdbcClientsDao.java`
- 일정·배정·노쇼: `backend-core/src/main/java/com/laborflow/core/schedule/dao/JdbcScheduleDao.java`
- 근태·메모·활동 요약: `backend-core/src/main/java/com/laborflow/core/attendance/dao/JdbcAttendanceDao.java`
- 계정 프로필·탈퇴: `backend-core/src/main/java/com/laborflow/core/profile/dao/JdbcProfileDao.java`
- 트랜잭션 경계: 각 도메인의 `application/*Service.java`에 선언된 `@Transactional`

각 테이블 항목의 메서드명은 위 파일을 기준으로 한다. 줄 번호는 코드 변경에 취약하므로 기준으로 사용하지 않는다.

## 사무소와 계정

### `labor_agency_owner` — 사용 중

- 목적: 인력사무소의 비민감 기본 정보이자 사무소 범위의 루트.
- 컬럼: `uuid uuid PK`, `name varchar(100) NN`, `agency_name varchar(150)`, `business_registration_number_hash char(64)`, `memo text`, `status varchar(16) NN DEFAULT 'ACTIVE'`, `created_at`, `updated_at`.
- 제약: `name` 비공백, hash는 64자리 소문자 hex, status는 `ACTIVE|INACTIVE|ARCHIVED`.
- 관계: 다수의 계정·작업자 프로필·거래처 프로필·일정·근태를 가진다. 자식의 삭제 정책은 각 테이블에서 다르다.
- 부수 효과: `set_updated_at()` 트리거.
- 코드: `JdbcProfileDao.updateProfile`, `withdrawAccount`; 모든 업무 DAO의 `loginId`→사무소 UUID 조회.

### `labor_agency_owner_sensitive_profile` — 사용 중

- 목적: 사무소 대표자의 전화·주소·계좌·이메일·사업자등록번호.
- 컬럼: `owner_uuid uuid PK/FK`, `phone_encrypted text`, `phone_hash char(64)`, `bank_account_encrypted text`, `bank_account_hash char(64)`, `email_encrypted text`, `email_hash char(64)`, `business_registration_number_encrypted text`, `extra_sensitive_information_encrypted text`, `office_phone_encrypted text`, `office_phone_hash char(64)`, `office_address_encrypted text`, `bank_name varchar(80)`, `bank_account_holder_name varchar(100)`, `created_at`, `updated_at`.
- FK: `owner_uuid → labor_agency_owner.uuid ON DELETE CASCADE`; 따라서 선택적 1:1이다.
- 제약: 모든 hash는 nullable 64자리 hex; `bank_name`, 계좌주가 있으면 비공백. 별도 unique hash 인덱스는 없다.
- 부수 효과: `set_updated_at()` 트리거.
- 코드: `JdbcProfileDao.findProfile`, `upsertSensitiveProfile`.

### `app_account` — 사용 중

- 목적: 로그인 식별자와 표시 이름, 사무소 연결, 알림 설정.
- 컬럼: `uuid uuid PK`, `login_id varchar(80) NN UQ`, `password_hash text`, `display_name varchar(100)`, `labor_agency_owner_uuid uuid FK`, `status varchar(16) NN DEFAULT 'ACTIVE'`, `must_change_password boolean NN DEFAULT true`, `primary_auth_method varchar(24) NN DEFAULT 'PASSWORD'`, `last_login_at timestamptz`, `login_notification_enabled boolean NN DEFAULT true`, `schedule_notification_enabled boolean NN DEFAULT true`, `created_at`, `updated_at`.
- FK: 사무소는 `ON DELETE RESTRICT`.
- 제약/인덱스: `lower(login_id)` UQ, 비공백 login, nullable bcrypt 형식 password, auth method `PASSWORD|GOOGLE|NAVER|KAKAO`, status `ACTIVE|LOCKED|DISABLED|ARCHIVED`; 사무소 FK 부분 인덱스.
- 부수 효과: `set_updated_at()` 트리거.
- 코드: 각 DAO의 `loginId` 범위 조회; `JdbcProfileDao.updateProfile`, `withdrawAccount`. **인증 완료를 뜻하지는 않는다.**

### `app_role`, `app_account_role` — 일부 사용 중

- `app_role`: `code varchar(40) PK`, `name varchar(100) NN`, `description text`, `created_at`; code/name 비공백. 역할 사전.
- `app_account_role`: `account_uuid uuid NN FK`, `role_code varchar(40) NN FK`, `created_at`, 복합 PK. 계정은 `ON DELETE CASCADE`, 역할은 `RESTRICT`.
- 코드: `JdbcProfileDao`가 표시용 역할을 조회한다. 별도 권한 집행 필터는 현재 범위에서 확인되지 않았다.

### `app_identity_provider`, `app_account_social_identity`, `app_auth_session` — DB 기반

- `app_identity_provider`: `code varchar(24) PK`, `name varchar(80) NN`, `provider_type varchar(24) NN DEFAULT 'OIDC'`, `enabled boolean NN DEFAULT true`, timestamps. 유형 `OIDC|OAUTH2`; updated trigger.
- `app_account_social_identity`: `uuid PK`, `account_uuid NN FK CASCADE`, `provider_code NN FK RESTRICT`, `provider_subject_hash char(64) NN`, `provider_subject_encrypted text`, `email_encrypted text`, `email_hash char(64)`, `display_name_encrypted text`, `profile_image_url_encrypted text`, `linked_at timestamptz NN DEFAULT now()`, `last_login_at timestamptz`, timestamps. `(provider_code, provider_subject_hash)`와 `(account_uuid, provider_code)` UQ; hash 형식; updated trigger.
- `app_auth_session`: `uuid PK`, `account_uuid NN FK CASCADE`, `refresh_token_family_uuid uuid NN`, `refresh_token_hash char(64) NN UQ`, `previous_refresh_token_hash char(64)`, `replaced_by_session_uuid uuid FK self SET NULL`, `remember_login boolean NN DEFAULT false`, `issued_at timestamptz NN DEFAULT now()`, `access_expires_at timestamptz NN`, `refresh_expires_at timestamptz NN`, `rotated_at`, `revoked_at`, `revoke_reason varchar(80)`, `ip_address_hash`, `user_agent_hash`, timestamps. Access 최대 12시간, refresh는 일반 12시간/기억 30일, hash 형식, active account 부분 인덱스; updated trigger.
- 코드: 현재 backend-core DAO/Service의 사용자 로그인·세션 읽기/쓰기가 확인되지 않았다.

## 작업자

### `worker` — 사용 중

- 목적: 여러 사무소가 공유할 수 있는 중앙 작업자 식별자.
- 컬럼: `uuid uuid PK`, `canonical_name varchar(100)`, `gender varchar(16) NN DEFAULT 'UNKNOWN'`, `age smallint`, `created_at`, `updated_at`.
- 최종 변경: `name`은 `canonical_name`으로 변경됐고 nullable이다. `canonical_nickname`은 migration `014`에서 삭제됐다. `age`도 nullable이다.
- 제약: 이름이 있으면 비공백, gender `MALE|FEMALE|OTHER|UNKNOWN`, age `0..150`.
- 관계: 사무소별 프로필 1:N. 중앙 행 자체에는 `deleted_at`이 없다.
- 부수 효과: `set_updated_at()` 트리거.
- 코드: `JdbcWorkforceDao`의 등록·신원 수정 및 조회 보조. 화면은 사무소 프로필 값을 우선한다.

### `worker_sensitive_profile` — 사용 중

- 목적: 중앙 전화 중복 식별과 주민등록번호·주소 저장 기반.
- 컬럼: `worker_uuid uuid PK/FK`, `phone_encrypted text`, `phone_hash char(64)`, `resident_registration_number_encrypted text`, `resident_registration_number_hash char(64)`, `address_encrypted text`, timestamps.
- FK: worker `ON DELETE CASCADE`; 선택적 1:1.
- 제약/인덱스: 전화·주민번호 hash 형식; `phone_hash IS NOT NULL`일 때 전역 UQ.
- 부수 효과: updated trigger.
- 코드: `JdbcWorkforceDao`가 전화 기반 중앙 worker 재사용과 전화 수정에 사용한다.

### `labor_agency_worker_profile` — 사용 중

- 목적: 한 사무소만 보는 작업자 이름·호칭·전화·메모·승차·가용성.
- 컬럼: `uuid uuid PK`, `agency_owner_uuid uuid NN FK`, `worker_uuid uuid NN FK`, `local_name varchar(100)`, `local_nickname varchar(100)`, `local_phone_encrypted text`, `local_phone_hash char(64)`, `private_memo text`, `status varchar(16) NN DEFAULT 'ACTIVE'`, `pickup_location varchar(200)`, `is_active boolean NN DEFAULT true`, `available_days_mask smallint NN DEFAULT 127`, `availability_memo text`, timestamps, `deleted_at`.
- FK: 사무소 `CASCADE`, 중앙 worker `RESTRICT`. migration `032`의 `(agency_owner_uuid, uuid)` UQ가 동시 배치 주의의 동일 사무소 복합 FK를 지원한다.
- 제약: local name/nickname/pickup/availability memo가 있으면 비공백, phone hash 형식, status `ACTIVE|INACTIVE|ARCHIVED`, day mask `0..127`; 이름·호칭·전화 hash·메모 중 하나 이상 필요.
- 부분 UQ/인덱스: 활성 행 기준 `(agency_owner_uuid,worker_uuid)` UQ, phone hash가 있을 때 `(agency_owner_uuid,local_phone_hash)` UQ; 활성 사무소 조회 및 가용성 인덱스.
- 부수 효과: updated trigger.
- 코드: `JdbcWorkforceDao` 대부분의 작업자 CRUD와 `JdbcScheduleDao`, `JdbcAttendanceDao`의 표시·범위 확인.

### `work_type`, `labor_agency_worker_work_skill` — 사용 중

- `work_type`: `uuid PK`, `code varchar(80) NN UQ`, `name varchar(100) NN`, `description text`, `status varchar(16) NN DEFAULT 'ACTIVE'`, timestamps. `lower(code)` UQ, name 인덱스, 비공백과 status 제약, updated trigger.
- `labor_agency_worker_work_skill`: `worker_profile_uuid uuid NN FK CASCADE`, `work_type_uuid uuid NN FK RESTRICT`, `rating smallint NN DEFAULT 0`, `note text`, timestamps, `deleted_at`, 복합 PK. 최종 rating `0..5`; 활성 프로필 부분 인덱스; updated trigger. Web은 이 숫자를 A~D/미평가 등급으로 환산하지만 원래 숫자를 보존하며, DB에 별도 등급 컬럼은 없다.
- 코드: `JdbcWorkforceDao.findWorkTypes`, 작업자 상세 조회와 `replaceWorkerWorkTypes`.

### `labor_agency_worker_payment_profile` — 사용 중

- 목적: 사무소별 작업자 지급 계좌.
- 컬럼: `worker_profile_uuid uuid PK/FK`, `bank_code varchar(16)`, `bank_name varchar(50)`, `account_number_encrypted text`, `account_number_hash char(64)`, `account_holder_name varchar(100)`, `verification_status varchar(24) NN DEFAULT 'NOT_VERIFIED'`, `verification_provider varchar(50)`, `verified_at timestamptz`, timestamps, `deleted_at`.
- FK: worker profile `ON DELETE CASCADE`; 선택적 1:1.
- 제약/인덱스: 문자열 비공백, hash 형식, status `NOT_VERIFIED|PENDING|VERIFIED|FAILED`; bank 및 non-null account hash 인덱스, 활성 profile 부분 인덱스. account hash는 UQ가 아니다.
- 부수 효과: updated trigger.
- 코드: `JdbcWorkforceDao` 작업자 조회·저장·프로필 소프트 삭제.

### `labor_agency_worker_availability_exception` — DB 기반

- 컬럼: `uuid PK`, `worker_profile_uuid uuid NN FK CASCADE`, `exception_type varchar(24) NN`, `starts_on date NN`, `ends_on date NN`, `reason text`, `created_by_account_uuid uuid FK SET NULL`, timestamps.
- 제약/인덱스: 유형 `AVAILABLE|UNAVAILABLE|RESTING`, 종료일≥시작일, reason 비공백; worker/date 및 type/date 인덱스; updated trigger.
- 코드: 현재 DAO의 읽기·쓰기가 확인되지 않았다. 기본 `is_active`/요일 mask만 작업자 API에 연결되어 있다.

### `labor_agency_worker_team`, `labor_agency_worker_team_member` — 사용 중

- team 컬럼: `uuid PK`, `agency_owner_uuid uuid NN FK CASCADE`, `name varchar(100) NN`, `leader_worker_profile_uuid uuid FK SET NULL`, `description text`, `sort_order integer NN DEFAULT 0`, `status varchar(16) NN DEFAULT 'ACTIVE'`, timestamps, `deleted_at`.
- team 제약/인덱스: 이름 비공백, sort≥0, status; 활성 행에서 `(agency_owner_uuid,lower(name))` UQ, 활성 사무소/정렬 부분 인덱스; updated trigger.
- member 컬럼: `team_uuid uuid NN FK CASCADE`, `worker_profile_uuid uuid NN FK CASCADE`, `role varchar(16) NN DEFAULT 'MEMBER'`, `display_order integer NN DEFAULT 0`, `active_from date`, `active_to date`, `status varchar(16) NN DEFAULT 'ACTIVE'`, timestamps, `deleted_at`; 복합 PK.
- member 제약/인덱스: role `LEADER|MEMBER|MANAGER`, 날짜·정렬·status 제약; 작업자당 활성 팀 하나 UQ(`status='ACTIVE' AND active_to IS NULL AND deleted_at IS NULL`); active team 인덱스; updated trigger.
- 코드: `JdbcWorkforceDao` 팀 CRUD와 팀원 이동 처리, `JdbcScheduleDao` 작업자 목록의 팀 표시.

### `worker_risk_flag` — 사용 중

- 컬럼: `uuid PK`, `agency_owner_uuid uuid NN FK RESTRICT`, `worker_profile_uuid uuid NN FK RESTRICT`, `risk_type varchar(24) NN`, `status varchar(16) NN DEFAULT 'ACTIVE'`, `source varchar(16) NN DEFAULT 'MANUAL'`, `reason text`, `created_by_account_uuid uuid FK SET NULL`, `cleared_by_account_uuid uuid FK SET NULL`, `cleared_at timestamptz`, timestamps, `deleted_at`.
- 제약/인덱스: 현재 risk type은 `NO_SHOW`만, status `ACTIVE|CLEARED`, source `MANUAL|AUTOMATED`; 활성 `(agency,worker,risk_type)` 부분 UQ와 작업자 이력 인덱스; updated trigger.
- 코드: `JdbcWorkforceDao`가 작업자 수정에서 수동 위험 플래그를 저장·조회한다. 노쇼 발생이 이 테이블을 자동 생성하는 코드는 확인되지 않았다.

### `labor_agency_worker_separation_rule`, `worker_separation_override_audit` — 사용 중

- rule 컬럼: `uuid PK`, `agency_owner_uuid uuid NN FK CASCADE`, `worker_profile_uuid_a uuid NN`, `worker_profile_uuid_b uuid NN`, `reason varchar(500)`, `status varchar(16) NN DEFAULT 'ACTIVE'`, `created_by_account_uuid uuid FK SET NULL`, timestamps, `deleted_at`.
- rule 관계/제약: A와 B는 각각 `(agency_owner_uuid,uuid) → labor_agency_worker_profile` 복합 FK `CASCADE`; `A < B`로 정규화, status `ACTIVE|ARCHIVED`, 활성 쌍 부분 UQ, A/B 검색 부분 인덱스; updated trigger.
- audit 컬럼: `uuid PK`, `agency_owner_uuid uuid NN FK RESTRICT`, `separation_rule_uuid uuid NN FK RESTRICT`, `schedule_day_uuid uuid NN FK RESTRICT`, `acknowledged_by_account_uuid uuid FK SET NULL`, `action varchar(32) NN DEFAULT 'ASSIGNMENT_SAVE'`, `created_at`.
- audit 제약/인덱스: action은 `ASSIGNMENT_SAVE`; day/rule 이력 인덱스. 불변 감사 행으로 updated/deleted 컬럼과 trigger가 없다.
- 코드: `JdbcWorkforceDao.replaceWorkerSeparationRules`, `recordWorkerSeparationOverrides`; `ScheduleService.updateTask`가 충돌 확인 후 감사 저장. DAO는 일정·사무소·현장 키로 `pg_advisory_xact_lock`을 획득한다.

## 거래처와 등록 현장

### `farm_owner`, `farm_owner_sensitive_profile` — 사용 중

- central 컬럼: `uuid PK`, `canonical_name varchar(100)`, `canonical_nickname varchar(100)`, `canonical_business_name varchar(150)`, `business_registration_number_hash char(64)`, `internal_memo text`, `status varchar(16) NN DEFAULT 'ACTIVE'`, timestamps, `deleted_at`.
- central 제약: canonical 값이 있으면 비공백, hash 형식, status `ACTIVE|INACTIVE|ARCHIVED`; updated trigger.
- sensitive 컬럼: `owner_uuid uuid PK/FK CASCADE`, `phone_encrypted text`, `phone_hash char(64)`, `bank_account_encrypted text`, `bank_account_hash char(64)`, `business_registration_number_encrypted text`, `extra_sensitive_information_encrypted text`, timestamps.
- sensitive 제약/인덱스: hash 형식, non-null `phone_hash` 전역 UQ; updated trigger.
- 코드: `JdbcClientsDao`의 전화 기반 중앙 거래처 조회·생성·수정. 중앙 `internal_memo`는 화면용 사무소 메모가 아니다.

### `labor_agency_farm_owner_profile` — 사용 중

- 컬럼: `uuid PK`, `agency_owner_uuid uuid NN FK CASCADE`, `farm_owner_uuid uuid NN FK RESTRICT`, `local_name varchar(100)`, `local_nickname varchar(100)`, `local_business_name varchar(150)`, `local_phone_encrypted text`, `local_phone_hash char(64)`, `local_bank_account_encrypted text`, `local_bank_account_hash char(64)`, `private_memo text`, `status varchar(16) NN DEFAULT 'ACTIVE'`, timestamps, `deleted_at`.
- 제약: local 문자열 비공백, hash 형식, status; 이름·호칭·상호·전화 hash·메모 중 하나 이상.
- 부분 UQ/인덱스: 활성 `(agency_owner_uuid,farm_owner_uuid)` UQ, non-null phone hash 활성 사무소 UQ, farm owner 및 활성 owner 인덱스; updated trigger.
- 코드: `JdbcClientsDao` 거래처 CRUD, `JdbcScheduleDao` 거래처 선택·표시.

### `labor_agency_farm_owner_site` — 사용 중

- 목적: 거래처별 반복 사용 가능한 사무소 전용 현장 마스터.
- 컬럼: `uuid PK`, `farm_owner_profile_uuid uuid NN FK CASCADE`, `site_name varchar(150) NN`, `farm_address text`, `memo text`, `display_order integer NN DEFAULT 0`, `status varchar(16) NN DEFAULT 'ACTIVE'`, timestamps, `deleted_at`.
- 제약/인덱스: 이름 비공백, 주소가 있으면 비공백, order≥0, status; 활성 `(profile,lower(site_name),lower(coalesce(address,'')))` UQ와 표시 순서 부분 인덱스; updated trigger.
- 코드: `JdbcClientsDao.replaceClientWorkSites`, 거래처 목록 조회; `ClientsService.resolveWorkSite`가 일정 입력을 기존/신규 현장으로 해석한다.

## 일정과 배정

### `farm_work_site` — 사용 중

- 실제 역할: 이름과 달리 단일 현장 마스터가 아니라 **거래처 작업 묶음**이다.
- 컬럼: `uuid PK`, `owner_uuid uuid NN FK RESTRICT`, `agency_owner_uuid uuid NN FK CASCADE`, `client_work_site_uuid uuid FK SET NULL`, `site_name varchar(150)`, `farm_address text NN`, `male_required_count smallint NN DEFAULT 0`, `female_required_count smallint NN DEFAULT 0`, `work_description text NN`, `work_start_date date`, `work_end_date date`, `daily_start_time time`, `daily_end_time time`, `wage_memo text`, `memo text`, `status varchar(16) NN DEFAULT 'ACTIVE'`, timestamps, `deleted_at`.
- 제약: 주소·작업내용 비공백, 인원 `0..10000`, 날짜/시간 순서, status `ACTIVE|INACTIVE|ARCHIVED`.
- 인덱스: 중앙 거래처, 사무소, 사무소+거래처, 활성 사무소/시작일, non-null client site 부분 인덱스; updated trigger.
- 코드: `JdbcScheduleDao.createTask`, `updateTask`, 범위 이동/수정/삭제. 묶음의 제목·거래처·현장과 전체 날짜 범위를 보관한다.

### `farm_work_site_work_type` — 사용 중

- 컬럼: `work_site_uuid uuid NN FK CASCADE`, `work_type_uuid uuid NN FK RESTRICT`, `created_at`, `deleted_at`; 복합 PK.
- 인덱스: work type 인덱스와 활성 site/type 부분 인덱스. updated 컬럼/trigger는 없다.
- 코드: `JdbcScheduleDao.replaceTaskWorkTypes`, 일정 조회. 작업 종류는 날짜가 아니라 묶음 전체에 연결된다.

### `work_schedule_day` — 사용 중

- 목적: 작업 묶음 안의 실제 날짜별 일정.
- 컬럼: `uuid PK`, `work_site_uuid uuid NN FK CASCADE`, `work_date date NN`, `daily_start_time time`, `daily_end_time time`, `male_required_count smallint NN DEFAULT 0`, `female_required_count smallint NN DEFAULT 0`, `memo text`, `status varchar(16) NN DEFAULT 'ACTIVE'`, timestamps, `deleted_at`.
- 제약: 인원 `0..10000`, 종료>시작, status `ACTIVE|CANCELLED|INACTIVE|ARCHIVED`.
- 부분 UQ/인덱스: 활성 `(work_site_uuid,work_date)` UQ; 날짜/status와 site/status 활성 부분 인덱스. 초기 비부분 인덱스도 일부 남아 있다; updated trigger.
- 코드: `JdbcScheduleDao` 일정 CRUD/범위 처리, `JdbcAttendanceDao` 날짜별 근태 조회. 새 날짜는 템플릿의 시간·인원·메모를 복사하지만 배정은 복사하지 않는다.

### `work_schedule_assignment` — 사용 중

- 목적: 한 날짜 일정의 등록 작업자 또는 익명 참여자 배정.
- 컬럼: `uuid PK`, `agency_owner_uuid uuid NN FK CASCADE`, `work_site_uuid uuid NN FK CASCADE`, `worker_profile_uuid uuid FK RESTRICT`, `work_date date NN`, `assignment_area varchar(16) NN`, `schedule_day_uuid uuid NN FK CASCADE`, `worker_count smallint NN DEFAULT 1`, `participant_group_uuid uuid NN DEFAULT gen_random_uuid()`, `participant_type varchar(16) NN DEFAULT 'REGISTERED'`, `participant_display_name varchar(100)`, `participant_pickup_location varchar(200)`, `introduction_type varchar(16) NN DEFAULT 'NONE'`, `introduced_by_worker_profile_uuid uuid FK RESTRICT`, `settlement_recipient_worker_profile_uuid uuid FK SET NULL`, `planned_start_time time`, `planned_end_time time`, `status varchar(16) NN DEFAULT 'PLANNED'`, timestamps, `deleted_at`.
- 제약: area `MEN|WOMEN`; count `1..100`; participant `REGISTERED|GUEST`; 등록은 worker FK 필수, guest는 반드시 null; introduction `NONE|WORKER|EXTERNAL|UNKNOWN`이며 `WORKER`만 소개자 필수; 종료>시작; status `PLANNED|WORKED|ABSENT|CANCELLED|REPLACED`.
- 최종 UQ: 활성 등록 배정에만 `(schedule_day_uuid,worker_profile_uuid)` UQ. migration `027`에서 worker/date 및 site/worker/date UQ를 제거했으므로 한 작업자가 하루 여러 현장에 배정될 수 있다.
- 인덱스: day, site/date, 등록 작업자 이력, guest day/group 부분 인덱스.
- 부수 효과: updated trigger.
- 코드: `JdbcScheduleDao` 배정 교체·익명 CRUD·노쇼 대체, `JdbcAttendanceDao` 근태 원본. 등록 작업자의 `worker_count`는 현재 1로 정규화되고, 동행자는 guest 행으로 분리된다.

## 근태, 정산, 활동 요약

### `worker_attendance_record` — 사용 중

- 컬럼: `uuid PK`, `agency_owner_uuid uuid NN FK RESTRICT`, `assignment_uuid uuid NN FK RESTRICT`, `schedule_day_uuid uuid NN FK RESTRICT`, `worker_profile_uuid uuid FK SET NULL`, `work_date date NN`, `actual_start_at timestamptz`, `actual_end_at timestamptz`, `break_minutes integer NN DEFAULT 0`, `status varchar(16) NN DEFAULT 'DRAFT'`, `time_entry_type varchar(16) NN DEFAULT 'UNKNOWN'`, `confirmed_at timestamptz`, `confirmed_by_account_uuid uuid FK SET NULL`, `settlement_period_uuid uuid FK SET NULL`, timestamps, `deleted_at`.
- 제약/인덱스: 종료>시작, 휴게 `0..1440`, status `DRAFT|WORKED|ABSENT|CANCELLED`, time type `PLANNED|EXACT|ESTIMATED|UNKNOWN`; 활성 assignment당 한 행 UQ, 사무소/날짜와 작업자/날짜 부분 인덱스.
- 부수 효과: updated trigger와 모든 INSERT/UPDATE에 대한 revision trigger.
- 코드: `JdbcAttendanceDao.upsertAttendance`, `confirmPlanned`, 조회; `JdbcScheduleDao` 노쇼 처리/복구.

### `worker_attendance_revision` — 사용 중

- 컬럼: `uuid PK`, `attendance_uuid uuid NN FK RESTRICT`, `changed_by_account_uuid uuid FK SET NULL`, `change_type varchar(24) NN`, `before_data jsonb`, `after_data jsonb NN`, `change_reason text`, `changed_at timestamptz NN DEFAULT now()`.
- 제약/인덱스: type `CREATE|UPDATE|CONFIRM_PLANNED|CORRECTION|STATUS_CHANGE`, reason 비공백, attendance/date 인덱스.
- 생성: DB 함수 `record_worker_attendance_revision()`가 근태 INSERT/UPDATE 후 자동 생성한다. 현재 함수는 `CONFIRM_PLANNED`, `CREATE`, `UPDATE`만 자동 판별한다.
- 코드: 애플리케이션의 직접 조회 API는 확인되지 않았다.

### `worker_activity_summary` — 사용 중인 읽기 모델

- 컬럼: `agency_owner_uuid uuid NN FK CASCADE`, `worker_profile_uuid uuid NN FK CASCADE`, `last_assigned_date date`, `last_worked_date date`, `total_work_days integer NN DEFAULT 0`, `updated_at timestamptz NN DEFAULT now()`; 복합 PK.
- 제약/인덱스: total≥0, 최근 근무 인덱스. created/deleted 컬럼과 trigger는 없다.
- 코드: `JdbcAttendanceDao.refreshWorkerActivitySummary`가 근태 저장/예정대로 근무 후 재계산하고, `JdbcWorkforceDao`가 최근 근무 정렬에 읽는다.

### `work_schedule_day_attendance_summary`와 revision — 사용 중

- summary: `schedule_day_uuid uuid PK/FK CASCADE`, `agency_owner_uuid uuid NN FK RESTRICT`, `note text`, `updated_by_account_uuid uuid FK SET NULL`, timestamps, `deleted_at`. note 비공백, 활성 owner/day 부분 인덱스, updated trigger.
- revision: `uuid PK`, `schedule_day_uuid uuid NN FK RESTRICT`, `changed_by_account_uuid uuid FK SET NULL`, `before_data jsonb`, `after_data jsonb NN`, `changed_at timestamptz NN DEFAULT now()`; day/date 인덱스.
- 생성: `record_work_schedule_day_attendance_summary_revision()` 트리거가 summary INSERT/UPDATE 후 생성.
- 코드: `JdbcAttendanceDao.upsertTaskNote`, 근태 조회.

### `work_schedule_assignment_pay_term`, `attendance_settlement_period` — DB 기반

- pay term: `assignment_uuid uuid PK/FK CASCADE`, `rate_type varchar(16) NN`, `agreed_rate_amount numeric(14,2) NN`, `agency_fee_amount numeric(14,2)`, `worker_pay_amount numeric(14,2)`, `currency_code char(3) NN DEFAULT 'KRW'`, timestamps, `deleted_at`. rate `HOURLY|DAILY|HALF_DAY|PIECE`, 금액≥0, 통화 대문자 3자리; updated trigger.
- settlement: `uuid PK`, `agency_owner_uuid uuid NN FK RESTRICT`, `period_start date NN`, `period_end date NN`, `status varchar(16) NN DEFAULT 'OPEN'`, `confirmed_at`, `confirmed_by_account_uuid FK SET NULL`, `paid_at`, `locked_at`, timestamps, `deleted_at`. 범위, status `OPEN|CONFIRMED|PAID|LOCKED`, 활성 owner/range UQ; updated trigger.
- 코드: 현재 DAO/API 사용이 확인되지 않는다. 근태 레코드의 `settlement_period_uuid`만 FK 기반으로 준비돼 있다.

## 노쇼

### `worker_no_show_incident` — 사용 중

- 컬럼: `uuid PK`, `agency_owner_uuid uuid NN FK RESTRICT`, `worker_profile_uuid uuid NN FK RESTRICT`, `original_assignment_uuid uuid NN FK RESTRICT`, `replacement_worker_profile_uuid uuid FK SET NULL`, `replacement_assignment_uuid uuid FK SET NULL`, `occurred_on date NN`, `status varchar(16) NN DEFAULT 'OPEN'`, `note text`, `reported_by_account_uuid uuid FK SET NULL`, timestamps, `deleted_at`, `previous_assignment_status varchar(16) NN`, `previous_attendance_data jsonb`, `replacement_assignment_created boolean NN DEFAULT true`, `resolved_by_account_uuid uuid FK SET NULL`, `cancelled_at timestamptz`.
- 제약/인덱스: status `OPEN|REPLACED|CANCELLED`, previous status `PLANNED|WORKED|ABSENT|CANCELLED`, note 비공백; 활성 원배정당 한 incident UQ, 취소 제외 작업자 이력 부분 인덱스; updated trigger.
- 코드: `JdbcScheduleDao.replaceNoShow`, `changeNoShowReplacement`, `cancelNoShow`; 작업자 노쇼 횟수 표시 조회.

### `worker_no_show_incident_revision` — 사용 중

- 컬럼: `uuid PK`, `incident_uuid uuid NN FK RESTRICT`, 이전/새 `replacement_worker_profile_uuid` 각각 FK SET NULL, 이전/새 `replacement_assignment_uuid` 각각 FK SET NULL, `performed_by_account_uuid uuid FK SET NULL`, `action varchar(24) NN`, `created_at`.
- 제약/인덱스: action `CREATED|REPLACEMENT_CHANGED|CANCELLED`, incident/date 인덱스. updated/deleted 컬럼과 trigger가 없다.
- 생성: DB trigger가 아니라 `JdbcScheduleDao`가 노쇼 작업과 같은 서비스 트랜잭션 안에서 명시적으로 INSERT한다.

## 통화 분석

### `call_analysis_job`, `call_analysis_result` — DB 기반

- job: `uuid PK`, `agency_owner_uuid uuid NN FK CASCADE`, `source_type varchar(32) NN`, `source_file_key text`, `original_file_name text`, `source_phone_hash char(64)`, `target_type varchar(32) NN`, `matched_entity_uuid uuid`, `status varchar(24) NN DEFAULT 'PENDING'`, `confidence_score numeric(5,4)`, `error_code varchar(80)`, `expires_at timestamptz NN DEFAULT now()+7 days`, timestamps, `deleted_at`.
- job 제약/인덱스: source `AUDIO_FILE|MOBILE_CALL_RECORD`, target `FARM_OWNER|WORKER|WORK_SCHEDULE`, status `PENDING|PROCESSING|COMPLETED|FAILED|APPLIED|DISCARDED|EXPIRED`, hash와 0..1 confidence; agency/status 및 expiry 부분 인덱스; updated trigger. `matched_entity_uuid`는 다형 참조라 실제 FK가 없다.
- result: `job_uuid uuid PK/FK CASCADE`, `transcript_encrypted text`, `summary_encrypted text`, `extracted_payload_json jsonb NN DEFAULT '{}'`, `model_name varchar(120)`, `analyzed_at timestamptz`, timestamps, `deleted_at`; updated trigger.
- 코드: 현재 backend-core DAO/API 연결이 확인되지 않는다. 기존 제품 계획의 분석→초안→사용자 확인 흐름을 위한 DB 기반이다.
