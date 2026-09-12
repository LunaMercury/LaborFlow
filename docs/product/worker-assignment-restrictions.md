# 작업자 배치 금지 설계안

> 상태: **제안, 미구현**  
> 작성 기준: 2026-09-11, `dev` 브랜치의 현재 일정·배치·노쇼·동시 배치 주의 구현  
> 이번 문서는 DB, API, 차단 로직, 권한, 화면을 구현하거나 승인하는 문서가 아니다.

## 목적과 경계

배치 금지는 특정 작업자가 특정 작업 종류·거래처·현장에 배치되지 않도록 하는 별도
업무 규칙이다. 작업 종류별 숙련등급과 독립적으로 관리한다. A~D와 미평가 어느 상태에도
금지를 설정할 수 있고, D를 선택해도 금지를 자동 생성하지 않는다.

다음 기존 기능과도 의미가 다르다.

- `labor_agency_worker_profile.is_active`: 작업자 전체의 기본 활동 여부
- `labor_agency_worker_availability_exception`: 특정 기간 출근 가능 여부
- `labor_agency_worker_separation_rule`: 작업자 두 명을 같은 현장에 배치할 때 확인하는 주의
- 이 문서의 배치 금지: 특정 작업·거래처·현장에 대한 한 작업자의 제한

사유는 “일 못함” 같은 평가 대신 “수확 중 과실 손상 반복”처럼 확인 가능한 관찰 사실을
기록하도록 제안한다. 숙련등급이나 과거 숫자 평점으로 사유·피해 이력을 자동 생성하지 않는다.

## 제안 데이터 모델

### 제안 제한 테이블

`labor_agency_worker_assignment_restriction` 테이블을 제안한다.

| 컬럼 | 제안 타입/규칙 | 목적 |
|---|---|---|
| `uuid` | uuid PK | 제한 식별자 |
| `agency_owner_uuid` | uuid NN FK | 사무소 데이터 경계 |
| `worker_profile_uuid` | uuid NN FK | 제한 대상 사무소별 작업자 |
| `scope_type` | varchar NN CHECK | `WORK_TYPE`, `CLIENT`, `SITE` |
| `work_type_uuid` | uuid nullable FK | 작업 종류 제한일 때만 사용 |
| `client_profile_uuid` | uuid nullable FK | 거래처 제한일 때 사용 |
| `client_work_site_uuid` | uuid nullable FK | 등록 현장 제한일 때 사용 |
| `reason_observation` | text NN | 관찰 사실. 공백 금지 |
| `status` | varchar NN | `ACTIVE`, `CLEARED` |
| `set_by_account_uuid` | uuid NN FK | 설정자 |
| `set_at` | timestamptz NN | 설정일 |
| `review_due_at` | timestamptz nullable | 재평가 시점 |
| `review_required` | boolean NN | 재검토 필요 표시 |
| `cleared_reason` | text nullable | 해제 사유 |
| `cleared_by_account_uuid` | uuid nullable FK | 해제자 |
| `cleared_at` | timestamptz nullable | 해제일 |
| `created_at`, `updated_at` | timestamptz NN | 관리 시각 |

`scope_type`에 따라 대상 FK가 정확히 하나의 유효한 조합이 되도록 CHECK가 필요하다.
`SITE`는 `client_work_site_uuid`, `CLIENT`는 `client_profile_uuid`, `WORK_TYPE`은
`work_type_uuid`를 요구한다. 같은 사무소·작업자·범위·대상에 활성 제한은 하나만 허용하는
부분 UNIQUE 인덱스를 제안한다. FK 대상도 같은 사무소 소유인지 Service에서 검증해야 한다.

현장 제한은 등록 현장 UUID가 있는 일정에 가장 명확하게 적용된다. 자유 입력 현장처럼
`client_work_site_uuid`가 없는 일정까지 주소 문자열로 영구 제한하는 방식은 주소 변경과
표기 차이로 오판할 수 있으므로 별도 정책 결정 전에는 제안하지 않는다.

### 변경 이력과 예외 투입

현재 행의 덮어쓰기만으로는 누가 왜 제한을 바꾸었는지 보존하기 어렵다. 다음 두 감사
테이블을 분리하는 안을 제안한다.

- `worker_assignment_restriction_revision`: 생성, 사유 수정, 재검토일 변경, 해제, 재활성화의
  이전/이후 값과 수행 계정·시각을 보존한다.
- `worker_assignment_restriction_override_audit`: 권한 있는 사용자가 차단을 넘겨 배치한 경우
  제한 UUID, 일정 UUID, 작업자 UUID, 예외 사유, 승인 계정, 시각을 보존한다.

일반 배치는 활성 제한과 충돌하면 서버가 `409`와 안정된 오류 code, 해당 제한의 사용자용
요약을 반환하는 방식을 제안한다. 권한이 있는 사용자가 구체적인 예외 사유와 충돌 UUID를
포함해 같은 명령을 다시 보내면 서버가 현재 충돌을 재계산한 뒤 저장하고 감사를 남긴다.
프론트 확인만으로 제한을 보장하거나 임의 UUID 제출을 신뢰하면 안 된다.

현재는 `loginId` 쿼리 기반 데모 흐름이며 인증 principal과 직원 역할 인가가 완성되지 않았다.
따라서 누가 금지를 설정·해제·예외 승인할 수 있는지는 지금 구현할 수 없고, 실제 인증과
`OWNER/MANAGER` 등 역할 정책을 먼저 확정해야 한다.

## 제안 API

현재 API와 구분하기 위해 아래는 모두 후보 경로다.

- `GET /api/workforce/worker-profiles/{profileUuid}/assignment-restrictions`
- `POST /api/workforce/worker-profiles/{profileUuid}/assignment-restrictions`
- `PATCH /api/workforce/worker-profiles/{profileUuid}/assignment-restrictions/{restrictionUuid}`
- `POST /api/workforce/worker-profiles/{profileUuid}/assignment-restrictions/{restrictionUuid}/clear`
- `GET /api/workforce/worker-profiles/{profileUuid}/assignment-restrictions/history`

설정·수정·해제 요청은 사무소 소유, 범위별 대상 존재, 사유 길이, 설정자 권한을 검증한다.
동시 수정에는 낙관적 버전이나 `updated_at` 조건을 두어 먼저 저장된 변경을 조용히 덮어쓰지
않도록 한다. 조회 응답은 현재 제한과 최근 이력을 구분하고 숙련등급은 별도 필드로 유지한다.

## 배치 검증 지점

제한은 작업자를 일정에 넣는 모든 서버 쓰기 경로에서 같은 정책 서비스로 검사해야 한다.

| 경로 | 제안 검증 |
|---|---|
| 일반 드래그 배치와 일정 저장 | 작업 종류, 거래처, 등록 현장 제한을 모두 검사 |
| 팀 배치 | 팀을 개인 목록으로 펼친 뒤 각 작업자를 검사하고 충돌자를 개별 표시 |
| 전일 작업자 불러오기 | 화면 초안 단계에서 경고하되, 최종 저장 시 서버가 다시 검사 |
| 노쇼 대체·대체자 변경 | 대체 작업자에 동일한 제한 검사 및 예외 승인 적용 |
| 일정의 작업 종류·거래처·현장 수정 | 이미 배치된 작업자와 새 조건을 모두 재검사 |
| 익명 인원 배치 | 특정 작업자 식별자가 없어 검사 불가임을 화면과 기록에 명시 |
| 익명 인원을 정식 작업자로 전환 | 연결 시 현재·향후 일정에 대한 처리 정책 필요 |

현재 동시 배치 주의는 `assignments`를 포함한 날짜별 일정 수정에서만 서버 충돌 검사가
확인되며, 일정 생성·범위 상세 수정·익명 인원·노쇼 대체에는 동일 흐름이 적용되지 않는다.
새 배치 금지는 이 제한을 그대로 복제하지 말고 위 쓰기 경로 전체를 계약 테스트로 고정해야 한다.

## 화면 제안

작업자 정보 수정 하단에 “배치 제한” 영역을 두고 숙련등급 영역과 시각적으로 분리한다.
각 항목은 `금지` 문구, 범위(작업/거래처/현장), 대상명, 관찰 사유, 설정일, 재검토 상태를
텍스트로 함께 보여준다. 색상만으로 상태를 구분하지 않는다.

배치 화면에서는 작업자 토큰에 제한 여부를 미리 표시하되 최종 판정은 서버가 한다. 충돌
팝업은 제한 대상·사유·설정일을 보여주고 일반 사용자는 취소만, 권한 있는 사용자는 예외
사유 입력 후 투입할 수 있게 한다. 등급과 금지가 함께 표시되더라도 서로 다른 라벨과 설명을
사용한다. 이번 단계에서는 작동하지 않는 버튼이나 화면을 만들지 않는다.

## 과거·현재·미래 배정

제안 기본 원칙은 제한 설정 시점 이후의 새 배정과 미래 일정 변경을 막고, 이미 완료된 과거
배정·근태는 수정하거나 지우지 않는 것이다. 이미 배치된 미래 일정은 자동 삭제하지 않고
“재검토 필요” 목록으로 올리는 편이 감사와 운영 안전에 유리하다. 다만 실제 정책은 아래
질문에 대한 사용자 결정 후 확정해야 한다.

## 먼저 결정할 질문

1. 제한을 설정하면 이미 배치된 오늘·미래 일정은 경고만 할지, 저장 자체를 막을지?
2. 거래처 제한이 그 거래처의 모든 등록 현장과 자유 입력 현장에도 적용되는지?
3. 현장 제한 대상은 등록 현장만 허용할지, 자유 입력 현장을 나중에 마스터로 승격할지?
4. 예외 투입 권한을 소장만 가질지, 반장·관리자에게도 줄지?
5. 예외 사유의 최소 길이와 첨부 증빙, 감사 이력 보존 기간은 얼마인지?
6. 재검토일 도래 시 알림만 할지, 제한 상태를 유지한 채 확인을 요구할지?
7. 익명 인원을 정식 작업자로 전환할 때 이미 끝난 익명 근무와 제한 이력을 연결할지?
8. 제한 해제 후 같은 사유로 재설정할 때 새 행을 만들지 기존 행을 재활성화할지?

## 이번에 구현하지 않는 범위

- 마이그레이션과 DB 테이블
- Controller, DTO, Service, DAO와 오류 계약
- 배치 차단, 예외 권한, 감사 저장 로직
- 작업자 정보·배치 화면의 금지 버튼이나 상태 표시
- 기존 일정·배정 데이터 변경

구현을 시작할 때에는 이 제안보다 최신 사용자 결정과 실제 API/DB 코드를 다시 확인해야 한다.
