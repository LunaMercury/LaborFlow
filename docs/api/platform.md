# 프로필, 헬스, backend-fast

[API 문서 홈](README.md) · [공통 계약](common.md) · [불일치/미구현](gaps.md)

## 프로필 API

주요 화면은 `/profile`이다. 현재 비밀번호 변경 API와 실제 로그인 API는 없다.

### 응답

```json
{
  "loginId": "sample-user",
  "accountRole": "AGENCY_OWNER",
  "accountStatus": "ACTIVE",
  "ownerName": "가상 대표자",
  "agencyName": "가상 인력사무소",
  "phone": "01012345678",
  "email": "owner@example.invalid",
  "officePhone": "0212345678",
  "officeAddress": "가상시 중앙로 1",
  "businessRegistrationNumber": "1234567890",
  "bankName": "가상은행",
  "bankAccount": "123456789012",
  "bankAccountHolderName": "가상 대표자",
  "loginNotificationEnabled": true,
  "scheduleNotificationEnabled": true,
  "passwordUpdatedAt": "2026-09-08",
  "twoFactorStatus": "DISABLED"
}
```

`accountRole`은 역할 코드를 쉼표로 이어 반환한다. 선택 문자열은 DB null일 때 빈 문자열이다. `twoFactorStatus`는 현재 DB 상태 조회가 아니라 항상 `DISABLED`다. `passwordUpdatedAt`은 현재 `app_account.updated_at`의 날짜를 사용하므로 실제 비밀번호 변경일이라는 보장은 없다.

### `GET /api/profile`

- 목적/화면: `/profile` 내 정보 로딩.
- 쿼리: `loginId` string, 생략/공백 시 `test`.
- 성공: `200`, `ProfileResponse`.
- 범위: 해당 login ID의 미보관 계정과 연결된 사무소 대표자.
- 실패: 계정/프로필 없음은 `400 BAD_REQUEST`.
- 재시도: 안전하다.
- 근거: `ProfileController.getProfile`, `ProfileService.getProfile`, `JdbcProfileDao.findProfileByLoginId`, `fetchProfile`, `ProfilePage`.

### `PUT /api/profile`

```json
{
  "ownerName": "가상 대표자",
  "agencyName": "가상 인력사무소",
  "phone": "010-1234-5678",
  "email": "owner@example.invalid",
  "officePhone": "02-1234-5678",
  "officeAddress": "가상시 중앙로 1",
  "businessRegistrationNumber": "123-45-67890",
  "bankName": "가상은행",
  "bankAccount": "123-456-789012",
  "bankAccountHolderName": "가상 대표자",
  "loginNotificationEnabled": true,
  "scheduleNotificationEnabled": true
}
```

| 필드 | 필수/처리 |
|---|---|
| `ownerName` | 필수, trim 후 빈 문자열 불가; DB `varchar(100)` |
| `phone` | 필수, 숫자만 남겨 `10..11`자리 |
| `agencyName` | 선택, 공백 -> null; DB `varchar(150)` |
| `email` | 선택, 공백 -> null; `@`가 처음/끝이 아니고 포함되어야 함. 완전한 RFC 이메일 검증은 아님 |
| `officePhone` | 선택, 숫자 `8..11`자리 |
| `officeAddress` | 선택, 공백 -> null |
| `businessRegistrationNumber` | 선택, 숫자 정확히 10자리 |
| `bankName`, `bankAccountHolderName` | 선택, 공백 -> null |
| `bankAccount` | 선택, 숫자 `8..20`자리 |
| 두 알림 boolean | null/생략 -> `true` |

- 성공: `200`, 저장 후 `ProfileResponse`.
- 저장/부수 효과: 알림 설정을 `app_account`, 대표자/사무소명을 `labor_agency_owner`, 전화·메일·사업자번호·은행 정보를 민감 프로필에 upsert한다. 검색용 hash를 함께 계산한다.
- 보안 주의: 현재 `*_encrypted` 컬럼에 애플리케이션 암호화 없이 정규화 원문을 전달하는 것으로 확인된다. 컬럼 이름만으로 암호화 완료라고 판단하지 않는다. [gaps.md](gaps.md#확인된-구현-위험) 참고.
- 재시도: 같은 값 저장은 가능하지만 수정 시각이 바뀔 수 있다. 멱등키 없음.
- 근거: `ProfileController.updateProfile`, `ProfileService.updateProfile`, `JdbcProfileDao.updateProfile/upsertSensitiveProfile`, `updateProfile`, `ProfilePage`.

### `DELETE /api/profile`

- 목적/화면: `/profile` 하단 계정 탈퇴.
- 쿼리: `loginId` 기본 `test`.
- 성공: `200`, 빈 본문. 프론트는 로컬 demoSession을 지우고 로그인 화면으로 이동한다.
- 삭제 방식: 실제 삭제가 아니다. `app_account.status`와 `labor_agency_owner.status`를 `ARCHIVED`로 바꾸고 `must_change_password=true`로 만든다. 하위 작업자/거래처/일정 행을 물리 삭제하지 않는다.
- 반복 호출: 첫 호출 후 계정을 다시 찾지 못해 `400`.
- 근거: `ProfileController.withdrawAccount`, `ProfileService.withdrawAccount`, `JdbcProfileDao.withdrawAccount`, `withdrawAccount`, `ProfilePage`.

## backend-core health

### `GET /api/health`

- 목적: Core와 PostgreSQL/Redis 의존성 상태 확인. `web/src/data/healthItems.ts`에 경로가 표시된다.
- 파라미터/인증: 없음.
- 성공: 의존성 장애가 있어도 현재 HTTP 상태는 `200`이다.

```json
{
  "service": "laborflow-core",
  "status": "ok",
  "timestamp": "2026-09-08T01:23:45.678Z",
  "dependencies": [
    { "name": "postgres", "status": "ok" },
    { "name": "redis", "status": "ok" }
  ]
}
```

하나라도 실패하면 최상위 `status`는 `degraded`, 해당 의존성은 `unavailable`이다. 의존성 검사 예외는 응답에 내부 내용을 노출하지 않는다.

근거: `HealthController.health`, `HealthService.getHealth`, `PostgresHealthDependencyDao`, `RedisHealthDependencyDao`.

## backend-fast

### `GET /health`

- 기본 로컬 주소: `http://localhost:15582/health` 또는 환경변수 `LABORFLOW_FAST_BIND_ADDR`.
- 파라미터/인증: 없음.
- 성공: `200`, `{ "service": "backend-fast", "status": "ok" }`.
- 다른 모든 요청: `404`, `{ "error": "not_found" }`.
- 구현은 단순 TCP HTTP 처리이며 요청 본문, keep-alive, WebSocket 업그레이드 등을 구현하지 않는다.
- 근거: `backend-fast/src/main.rs#handle_connection`.

운영 Caddy의 `handle_path /fast/*`는 `/fast` 접두사를 제거하므로 외부 `GET /fast/health`가 내부 `GET /health`로 전달된다. `/ws`는 backend-fast로 전달되지만 현재 backend-fast가 404를 반환한다.
