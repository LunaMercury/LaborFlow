# LaborFlow API 계약

이 문서는 프론트엔드와 백엔드 개발 에이전트가 현재 구현된 계약을 같은 기준으로 확인하기 위한 진입점이다. 계획이나 DB 구조만 존재하는 기능은 구현된 API와 구분한다.

## 조사 기준

- 브랜치: `dev`
- 커밋: `219fbbb8014c6b404de01ae5f94d2220664d3ad2`
- 조사 시작 상태: 추적 중인 미커밋 변경 없음, `origin/dev`보다 3커밋 앞섬
- 조사 방식: Controller, DTO, Service, 예외 처리, 필요한 DAO/DB 제약, `web/src/api`와 호출 화면을 소스로 대조
- 실행 검증: 수행하지 않음. 이 문서는 위 커밋의 소스 계약을 기준으로 한다.

작업 중 코드가 바뀌면 먼저 이 기준 커밋과 현재 HEAD의 차이를 확인한다. 줄 번호가 아니라 아래에 적힌 클래스와 메서드명을 근거로 삼는다.

## 문서 구성

- [공통 계약과 오류](common.md): 기본 주소, 형식, 성공/오류, 현재 인증 상태, 프록시 차이
- [작업자와 팀](workforce.md): 작업자, 작업 유형, 팀, 동시 배치 주의
- [거래처와 현장](clients.md): 농장주/거래처와 거래처별 여러 현장
- [일정과 배치](schedule.md): 달력, 날짜별 배치, 익명 인원, 충돌 확인, 노쇼, 다일 범위
- [근태](attendance.md): 조회, 수정, 예정대로 근무, 작업 메모
- [프로필, 헬스, backend-fast](platform.md): 내 정보, 탈퇴, 상태 확인, Rust 경로
- [불일치와 미구현 영역](gaps.md): 프론트/백엔드 차이, DB만 있는 기능, 개선 후보

## 현재 등록 경로 목록

backend-core Controller에 등록된 40개 경로를 기준으로 했다.

| 도메인 | 메서드와 경로 | 상세 문서 |
|---|---|---|
| Health | `GET /api/health` | [platform.md](platform.md#backend-core-health) |
| Profile | `GET /api/profile` | [platform.md](platform.md#프로필-api) |
| Profile | `PUT /api/profile` | [platform.md](platform.md#프로필-api) |
| Profile | `DELETE /api/profile` | [platform.md](platform.md#프로필-api) |
| Clients | `GET /api/clients` | [clients.md](clients.md#api) |
| Clients | `POST /api/clients` | [clients.md](clients.md#api) |
| Clients | `PATCH /api/clients/{profileUuid}` | [clients.md](clients.md#api) |
| Clients | `DELETE /api/clients/{profileUuid}` | [clients.md](clients.md#api) |
| Workforce | `GET /api/workforce/workers` | [workforce.md](workforce.md#조회-api) |
| Workforce | `GET /api/workforce/work-types` | [workforce.md](workforce.md#조회-api) |
| Workforce | `GET /api/workforce/worker-separation-rules` | [workforce.md](workforce.md#조회-api) |
| Workforce | `POST /api/workforce/workers` | [workforce.md](workforce.md#작업자-api) |
| Workforce | `POST /api/workforce/workers/from-guest-assignment/{assignmentUuid}` | [workforce.md](workforce.md#작업자-api) |
| Workforce | `POST /api/workforce/worker-teams` | [workforce.md](workforce.md#팀-api) |
| Workforce | `PATCH /api/workforce/worker-teams/{teamUuid}` | [workforce.md](workforce.md#팀-api) |
| Workforce | `DELETE /api/workforce/worker-teams/{teamUuid}` | [workforce.md](workforce.md#팀-api) |
| Workforce | `PATCH /api/workforce/worker-profiles/{profileUuid}` | [workforce.md](workforce.md#작업자-api) |
| Workforce | `DELETE /api/workforce/worker-profiles/{profileUuid}` | [workforce.md](workforce.md#작업자-api) |
| Workforce | `PATCH /api/workforce/worker-profiles/{profileUuid}/identity` | [workforce.md](workforce.md#부분-수정-api) |
| Workforce | `PATCH /api/workforce/worker-profiles/{profileUuid}/phone` | [workforce.md](workforce.md#부분-수정-api) |
| Workforce | `PATCH /api/workforce/worker-profiles/{profileUuid}/pickup-location` | [workforce.md](workforce.md#부분-수정-api) |
| Workforce | `PATCH /api/workforce/worker-profiles/{profileUuid}/gender` | [workforce.md](workforce.md#부분-수정-api) |
| Workforce | `PUT /api/workforce/worker-profiles/{profileUuid}/work-types` | [workforce.md](workforce.md#부분-수정-api) |
| Schedule | `GET /api/schedule/tasks` | [schedule.md](schedule.md#조회-api) |
| Schedule | `GET /api/schedule/farm-owners` | [schedule.md](schedule.md#조회-api) |
| Schedule | `POST /api/schedule/tasks` | [schedule.md](schedule.md#일정-생성) |
| Schedule | `PUT /api/schedule/tasks/{scheduleDayUuid}` | [schedule.md](schedule.md#날짜별-일정과-배치-수정) |
| Schedule | `POST /api/schedule/tasks/{scheduleDayUuid}/guest-participants` | [schedule.md](schedule.md#익명-참여자) |
| Schedule | `PUT /api/schedule/tasks/{scheduleDayUuid}/guest-participants/{participantGroupUuid}` | [schedule.md](schedule.md#익명-참여자) |
| Schedule | `DELETE /api/schedule/tasks/{scheduleDayUuid}/guest-participants/{participantGroupUuid}` | [schedule.md](schedule.md#익명-참여자) |
| Schedule | `POST /api/schedule/tasks/{scheduleDayUuid}/no-show-replacement` | [schedule.md](schedule.md#노쇼-대체) |
| Schedule | `PUT /api/schedule/tasks/{scheduleDayUuid}/no-show-replacement` | [schedule.md](schedule.md#노쇼-대체) |
| Schedule | `DELETE /api/schedule/tasks/{scheduleDayUuid}/no-show-replacement/{originalAssignmentUuid}` | [schedule.md](schedule.md#노쇼-대체) |
| Schedule | `PUT /api/schedule/tasks/range` | [schedule.md](schedule.md#다일-일정-범위) |
| Schedule | `PUT /api/schedule/tasks/range/details` | [schedule.md](schedule.md#다일-일정-범위) |
| Schedule | `DELETE /api/schedule/tasks/range` | [schedule.md](schedule.md#다일-일정-범위) |
| Attendance | `POST /api/attendance/confirm-planned` | [attendance.md](attendance.md#예정대로-근무) |
| Attendance | `GET /api/attendance/records` | [attendance.md](attendance.md#조회) |
| Attendance | `PATCH /api/attendance/records/{assignmentUuid}` | [attendance.md](attendance.md#근태-수정) |
| Attendance | `PATCH /api/attendance/schedule-days/{scheduleDayUuid}/note` | [attendance.md](attendance.md#작업-메모) |

backend-fast에는 `GET /health` 하나만 구현되어 있다. `/ws`나 `/fast/*`에 대응하는 애플리케이션 경로는 현재 없다.

## 계약 상태 표기

- **현재 구현**: 위 기준 커밋에서 Controller부터 저장 계층까지 확인한 동작
- **의도된 정책**: 기존 정책 문서나 화면 흐름에 나타나지만 API가 완성되었다고 단정할 수 없는 사항
- **개선 제안**: 후속 구현 시 검토할 내용이며 현재 계약이 아님

## 가장 중요한 주의점

1. 현재 인증은 완성된 인증이 아니다. 브라우저의 `demoSession`에서 읽은 `loginId`를 쿼리 문자열로 보내고 서버가 그 값으로 사무소를 찾는다.
2. 다일 일정의 한 날짜는 `scheduleDayUuid`, 전체 묶음은 `workSiteId`로 구분된다. 날짜별 수정과 범위 수정의 영향 범위가 다르다.
3. 작업자와 거래처의 중앙 식별자는 여러 사무소가 공유할 수 있지만, API 조회와 변경은 사무소별 프로필을 기준으로 제한한다.
4. 삭제는 대부분 소프트 삭제 또는 상태 전환이지만, 모든 DELETE의 반복 호출 결과가 같지는 않다.
5. 요청 멱등키는 구현되어 있지 않다. 네트워크 오류 뒤 쓰기 요청을 자동 재시도하지 않는다.
