# 작업자·거래처 배치 주의

2026-10-11, `dev` 시작 커밋 `5b433f3` 이후 구현. 배치 금지·숙련도와 별도다.
저장 구조는 [DB 문서](../database/assignment-cautions.md)를 참고한다.

## 관계 관리

| 메서드·경로 | 응답 |
|---|---|
| GET `/api/assignment-cautions` | 활성 관계 배열, 200 |
| POST `/api/assignment-cautions` | 새 관계 또는 동일 활성 조합의 기존 관계, 200 |
| PUT `/api/assignment-cautions/{uuid}` | 요청 주체·메모 수정 결과, 200 |
| DELETE `/api/assignment-cautions/{uuid}` | 해제, 204, 본문 없음 |

모든 API의 쿼리 `loginId`는 필수다. ACTIVE 계정을 통해 사무소·처리자를 찾는다.
이는 **인증된 principal 검증이 아니다.** loginId 사칭 방지는 이번에 해결하지 않았다.
현재 식별 방식 아래에서는 서버가 프로필의 사무소 소속과 삭제 상태를 확인하고 DB 복합 FK도 같은 사무소를 강제한다.

GET의 선택 필터는 `workerProfileUuid`, `clientProfileUuid`, `farmOwnerUuid`다.
앞의 두 프로필이 없거나 타 사무소 소속이면 400이다. 중앙 farmOwner 필터는 사무소 내부 조회에 추가되며 관계가 없으면 빈 배열이다.
필터를 생략하면 사무소 활성 관계 전체다. 페이지네이션은 없다.

POST·PUT 전체 본문 예시:

```json
{
  "workerProfileUuid": "20000000-0000-4000-8000-000000000001",
  "clientProfileUuid": "30000000-0000-4000-8000-000000000001",
  "requestedBy": "WORKER",
  "memo": "가상 농가 근무를 원하지 않음"
}
```

- 프로필 UUID 둘은 필수다. 중앙 worker/farm_owner UUID를 대신 보내지 않는다.
- 요청 주체는 필수: CLIENT / WORKER / BOTH. 메모는 선택, null·생략·공백은 null이다. 바깥 공백 제거, 줄바꿈 보존, Java 문자열 500자 이하.
- PUT은 상대 프로필을 변경할 수 없다. 다른 조합은 해제 후 등록한다.
- 중복 POST는 기존 값을 덮어쓰지 않으며 수정 시각도 바꾸지 않는다. 해제 후 재등록은 새 UUID다.
- 잘못된 주체·소유권·길이·해제된 UUID는 400, 저장 장애는 500과 공통 오류 응답이다. 해제 재시도는 204를 보장하지 않는다.
- 관리 화면의 동시 수정은 마지막 저장 우선이다. 낙관적 버전 충돌 API는 없다.
- 이 관계의 DAO 쓰기 실패는 행의 메모가 포함될 수 있는 SQL 예외를 원인으로 전달하지 않고 일반 500으로 처리한다.

응답은 `uuid`, `workerProfileUuid`, `clientProfileUuid`, `farmOwnerUuid`, `workerName`, `clientName`, `requestedBy`,
nullable `memo`, UTC Instant `createdAt/updatedAt`, nullable `createdByAccountUuid/updatedByAccountUuid`다.
이름은 해당 사무소 프로필 기준이다. 삭제/ARCHIVED 작업자 및 비활성·삭제 거래처의 관계는 조회하지 않는다.
INACTIVE 작업자는 주의 관계 관리가 가능하다.

호출 화면: WorkerProfileModal 수정 하단, ClientsPage 인라인 수정 하단. AssignmentCautionEditor를 공유한다.
2026-10-23 변경: WorkerProfileModal의 추가·수정·해제는 로컬 초안이며 오른쪽 위 저장 시
작업자 PATCH의 `assignmentCautionChanges`로 함께 반영한다. 입력 중 선택한 관계도 저장 시 포함한다.
목록에 추가하거나 해제 확인만 한 상태에서 창을 취소하면 DB 변경은 없다.
ClientsPage의 주의 영역은 기존처럼 다른 거래처 항목 저장과 독립적으로 즉시 반영된다.
작업자 수정 중에는 포커스/갱신 신호로 초안을 덮어쓰지 않는다. 닫고 다시 열면 최신 목록을 읽는다.
작업자 저장 성공 후에만 갱신 신호를 발행한다. 변경하지 않은 관계는 서버에 보내지 않는다.
같은 탭 이벤트, 다른 탭의 개인정보 없는 갱신 신호, 포커스/visibility 복귀 시 재조회한다. 실시간 서버 인프라는 없다.

## 저장 전 확인

일정 PUT과 노쇼 대체 POST·PUT에 선택 필드 `acknowledgedCautions`가 추가된다.
아래는 추가 필드 조각이며 전체 본문에는 [일정 계약](schedule.md)의 필수 항목이 있어야 한다.

```json
{
  "acknowledgedCautions": [
    { "uuid": "50000000-0000-4000-8000-000000000001", "updatedAt": "2026-10-11T01:02:03.123456Z" }
  ]
}
```

서버가 읽은 활성 관계 UUID와 수정 시각이 일치해야 한다. 과거 감사 기록으로 새 배치를 면제하지 않는다.
일정 PUT은 기존 배정 대비 새 작업자 또는 거래처 변경을 검사한다. 메모·인원만 수정하거나 일정 범위를 수정할 때 반복 경고하지 않는다.
노쇼 대체·대체자 변경은 대체 작업자를 검사한다. 노쇼 취소는 기존 흐름을 유지한다.
미확인/수정된 관계는 쓰기 전에 409 `ASSIGNMENT_CAUTION_CONFLICT`를 반환한다.
응답 필드는 `code`, 고정 `message`("배치 주의 관계를 확인해 주세요."), UTC `timestamp`, 관계 응답 객체 배열 `conflicts`다.
기존 작업자 간 `WORKER_SEPARATION_CONFLICT`와 별도다. 확인해도 다른 배치 검증을 우회하지 않는다.
프론트는 수정된 일부 관계를 재확인할 때 다른 유효한 확인 버전을 병합해 보존한다.

## 확인 후 초안, 체크 버튼으로 저장

2026-10-11 사용자 결정에 따라 주의 대상 드롭/팀 드롭도 **확인 후에는 초안만** 반영한다.
확인 전 드롭 취소·닫기·Escape·조회 실패 시 초안의 원래 위치도 유지한다.
조회는 no-store이고 실패를 관계 없음으로 처리하지 않는다. 확인만으로 서버 쓰기 요청은 보내지 않는다.
실제 저장은 기존 일정 PUT의 체크 버튼이다. 실패 시 DB 원배정은 유지하고 작성한 초안도 버리지 않는다.
배치 불러오기도 관계 조회·확인 후 초안에 반영하며 체크 저장에서 서버가 다시 검사한다.

일정 PUT의 추가 선택 필드 `movedWorkerProfileUuids`는 이 화면의 드롭으로 이동한 작업자 UUID 배열이다.
주의 관계가 없는 드롭도 같은 이동 저장 경로를 사용해 대상 저장 실패 시 원배정이 사라지지 않게 한다.
생략/null/빈 배열은 기존 일정 저장과 같다. 배열의 모든 UUID가 대상 `assignments`에 있어야 한다.
체크 저장 시 같은 사무소/날짜의 일정 행을 UUID 순서로 잠그고 대상 저장과 해당 인원의 원배정 제거,
기존 동시 배치 주의 확인과 이 관계 확인 기록을 하나의 트랜잭션에서 처리한다.
원작업의 일정 내용·근태·익명 참여자는 수정하지 않는다. 대상 작업의 수정 초안은 기존 PUT대로 함께 저장한다.
현재 화면은 원배정 제거부터 저장해 대상 저장 실패로 인원이 사라지지 않도록 대상 작업부터 저장을 안내한다.
모든 다른 일반 배치 쓰기가 이 일정 행 잠금 규약을 공유하는 것은 아니다.
배정 재시도는 같은 작업자로 수렴하지만 요청 ID 기반 exactly-once 감사 기록은 보장하지 않는다.
카드의 터치 가능한 주의 아이콘은 현재 관계만 보여주며 과거 경고 상태를 재현하지 않는다.
익명 인원과 신원 없는 동행자는 개별 관계를 검사하지 못한다.

근거: backend-core `cautions/api/AssignmentCautionController`, `application/AssignmentCautionService`
(`list/save/release/validatePlacement/record`), `dao/JdbcAssignmentCautionDao`,
`schedule/application/ScheduleService` (`updateTask/validateReplacementCautions`),
web `api/assignmentCautionsApi.ts`, `pages/WorkSchedulePage.tsx`.

## 작업자 정보와 함께 저장 (2026-10-23)

`PATCH /api/workforce/worker-profiles/{profileUuid}`의 선택 필드 `assignmentCautionChanges`는 변경분 배열이다.
생략·null·빈 배열은 기존 관계를 유지한다. 최대 100건이며 거래처 프로필은 배열 안에서 중복할 수 없다.
기존 작업자 수정 필수 필드와 함께 아래 조각을 전송한다.

```json
{
  "assignmentCautionChanges": [
    {
      "uuid": null,
      "clientProfileUuid": "30000000-0000-4000-8000-000000000001",
      "requestedBy": "WORKER",
      "memo": "가상 메모",
      "released": false
    }
  ]
}
```

- 추가는 `uuid` null/생략, 수정은 기존 `uuid`, 둘 다 `released: false`(생략 시 false)다.
- 해제는 기존 `uuid`, `clientProfileUuid`, `released: true`이며 `requestedBy/memo`는 사용하지 않는다.
- 요청의 작업자 UUID는 경로에서 정한다. 거래처는 같은 사무소 소속이어야 하며,
  기존 관계 UUID는 해당 작업자·거래처 조합에 실제로 속한 활성 관계여야 한다.
- 주체·메모 제약은 기존 POST/PUT과 같다. 잘못된 항목은 400이며 변경분 전체를 먼저 검증한다.
- `WorkforceService.updateWorkerProfile` → `AssignmentCautionService.applyWorkerChanges`는 기존 REQUIRED 트랜잭션에 참여한다.
  주의 관계 쓰기에 실패하면 작업자 수정도 롤백한다. 응답은 기존 작업자 목록이며 별도 주의 목록을 덧붙이지 않는다.
- 새 조합이 동시에 등록된 경우 기존 중복 INSERT 규칙을 따른다(이미 존재하는 사유를 덮어쓰지 않음).
  변경한 기존 관계의 동시 수정은 여전히 마지막 저장 우선이며 버전 충돌 계약은 추가하지 않았다.
- 새 스키마/마이그레이션은 없다. 실제 고객 DB나 실행 중 서버에 검증용 쓰기를 보내지 않는다.

검증(2026-10-23): `.skills/verify-web.ps1` 34개 테스트와 빌드, `.skills/verify-core.ps1` 76개 테스트 통과.
백엔드는 최초 격리 환경의 native-platform.dll 로딩 실패 후 권한 있는 로컬 실행으로 확인했다.
가상 fetch 화면에서 추가/해제 전 저장 요청 0건, 취소 후 원래 목록, 상단 PATCH 1회에 변경분 포함,
수정 실패 후 초안 보존/재시도, 390x844 크기의 저장 접근/가로 넘침 없음을 확인했다.
트랜잭션 프록시 테스트는 성공 시 commit과 주의 처리 실패 시 rollback을 검사한다.
고객 DB 및 실제 PostgreSQL과 Spring의 통합 저장·롤백, 실기기 터치, 다중 사용자 동시 수정은 검증하지 않았다.
변경된 서버 코드를 사용하려면 백엔드를 재시작해야 한다.

## 이번 변경 검증 (2026-10-11)

- `.skills/verify-web.ps1`: 동작 테스트 29개 및 TypeScript/Vite 빌드 통과. 숙련도 기존 테스트도 포함한다.
- `.skills/verify-core.ps1`: Service/DAO 실패 정제/MockMvc 등 66개 테스트 통과. 최초 샌드박스 DLL 접근 실패와 실제 테스트 결과는 구분했다.
- `.skills/verify-assignment-cautions.ps1`: 별도 임시 PostgreSQL에서 migration/DAO SQL 제약 및 원배정 제거 범위 검사 통과.
- 가상 fetch를 사용한 PC 화면: 드롭 확인 전과 확인 후 초안의 쓰기 0, Escape 취소, 대상 되돌리기,
  체크 저장 실패 후 초안 보존·재시도, 양쪽 관계 조회 및 한쪽 수정 후 양쪽 갱신을 확인했다.
- 모바일 크기 390x844에서 배정 카드의 주의 아이콘 클릭과 사유 표시를 확인했다. 실제 스마트폰 터치 드래그 검증은 하지 않았다.
- 최종 해제 확인 팝업, 팀 전체 드래그, 배치 불러오기, 노쇼의 실제 화면 끝단 흐름은 검증하지 못했다.
  브라우저 확인창이 검증 도구 입력을 차단한 이후 해제 UI는 공통 모달로 바꿨고 API/SQL 및 빌드만 확인했다.
- 고객 DB 연결/데이터 쓰기/현재 실행 서버 재시작은 하지 않았다. 전체 migration 업그레이드와 Spring+DB 이동 트랜잭션 통합,
  다중 탭·실제 동시 요청 경합, 인증·권한 전체 보안 검증은 수행하지 않았다.
