# 공통 계약과 오류

[API 문서 홈](README.md)

## 기본 주소

프론트엔드는 `web/src/api/apiBaseUrl.ts`의 `getApiBaseUrl()`을 모든 backend-core 호출에 사용한다.

| 실행 방식 | Web | Core | Fast |
|---|---|---|---|
| `run-windows.ps1` | `http://localhost:15580` | `http://localhost:15581` | `http://localhost:15582` |
| Tailscale 실행기 | 선택된 Tailscale IP와 연속 포트 | Web 포트 + 1 | Web 포트 + 2 |
| `.env.example` 기본 예시 | 별도 | `http://localhost:5581` | `http://localhost:5582` |

`VITE_API_BASE_URL`이 없으면 현재 페이지의 protocol/hostname을 유지하고 브라우저 포트에 1을 더한다. 브라우저 URL에 숫자 포트가 없으면 Core 포트 `5581`을 사용한다.

운영 구성의 경로 불일치는 [gaps.md](gaps.md#운영-프록시-기본-주소)를 먼저 확인한다.

## HTTP와 JSON

- JSON 본문을 받는 API는 `Content-Type: application/json`을 사용한다.
- 명시적인 `@ResponseStatus`가 없으므로 정상 처리된 모든 Controller 메서드는 현재 `200 OK`다.
- `void` 반환 API도 현재 `204`가 아니라 `200`과 빈 본문을 반환한다.
- UUID는 하이픈 포함 문자열이다.
- 날짜 요청은 ISO `yyyy-MM-dd` 형식이다.
- 시간 요청은 Spring `LocalTime` 형식이다. 프론트는 `HH:mm`을 보내며 이를 표준 예시로 사용한다.
- 일정/근태 응답 시간은 DAO가 `HH:mm` 문자열로 만든다. 값이 없으면 `null`이 아니라 빈 문자열 `""`인 필드가 있다.
- 대부분의 선택 문자열은 `null`, 생략, 공백 문자열을 같은 값인 `null`로 정규화한다. 예외는 도메인 문서에 적었다.
- 요청 record에는 Bean Validation 애너테이션이 없다. 실제 제약은 Service와 DB에서 적용된다.

## 현재 인증과 사무소 범위

**현재 구현**

- Authorization 헤더, JWT 검증, 서버 세션, 역할 기반 인가 필터가 없다.
- 로그인 화면은 자격 증명을 서버에 검증하지 않고 `web/src/session/demoSession.ts`의 localStorage 세션을 만든다.
- 프론트는 세션의 `loginId`를 URL 쿼리로 보낸다.
- 여러 API의 `loginId` 기본값은 `test`다. Attendance와 일부 Schedule/Workforce API는 쿼리를 반드시 요구한다.
- 서비스/DAO는 `loginId -> app_account -> labor_agency_owner_uuid`로 사무소를 찾고, 사무소 소유 프로필/일정만 조회하거나 변경한다.

따라서 현재의 사무소 범위 SQL은 데이터 혼선을 줄이는 장치이지만, 호출자가 다른 `loginId`를 제출하지 못하게 막는 인증 보장은 아니다. `loginId`를 실제 인증 완료로 표현하면 안 된다.

작업자 중앙 엔터티 `worker`는 전화번호를 기준으로 여러 사무소 프로필이 연결될 수 있다. 한 사무소 API에는 그 사무소의 `labor_agency_worker_profile`만 노출된다. 다른 사무소 소속 여부나 프로필 정보는 응답에 포함되지 않는다.

## 오류 응답

`GlobalExceptionHandler`가 직접 처리하는 일반 오류 형식:

```json
{
  "code": "BAD_REQUEST",
  "message": "Request could not be processed.",
  "timestamp": "2026-09-08T01:23:45.678Z"
}
```

| 상태 | code | 발생 조건 |
|---|---|---|
| `400` | `BAD_REQUEST` | Service/DAO의 `IllegalArgumentException`. 구체 사유는 서버 로그에만 남고 응답 메시지는 고정된다. |
| `400` | `INVALID_WORKER_PHONE` | 작업자 전화번호가 숫자 11자리가 아님 |
| `409` | `DUPLICATE_WORKER_PHONE` | 같은 사무소에 같은 전화번호 작업자 프로필이 있음 |
| `409` | `DUPLICATE_CLIENT_PHONE` | 같은 사무소에 같은 거래처 전화번호가 있거나 중앙 거래처 연결이 충돌함 |
| `500` | `INTERNAL_SERVER_ERROR` | 처리하지 않은 `RuntimeException` |

동시 배치 주의 오류는 conflicts가 추가된다.

```json
{
  "code": "WORKER_SEPARATION_CONFLICT",
  "message": "동시 배치 주의 작업자가 포함되어 있습니다.",
  "timestamp": "2026-09-08T01:23:45.678Z",
  "conflicts": [
    {
      "ruleUuid": "11111111-1111-4111-8111-111111111111",
      "workerProfileUuidA": "22222222-2222-4222-8222-222222222222",
      "workerNameA": "작업자 A",
      "workerProfileUuidB": "33333333-3333-4333-8333-333333333333",
      "workerNameB": "작업자 B",
      "reason": "같은 현장 배치 전 확인"
    }
  ]
}
```

**확인되지 않은 형식**

누락된 필수 쿼리, 잘못된 UUID/날짜, JSON 문법 오류처럼 Spring MVC가 Controller 진입 전에 거부하는 예외는 `GlobalExceptionHandler`에 전용 처리가 없다. 상태는 대체로 `400`이지만 본문이 위 `ApiErrorResponse`와 같다고 보장하지 않는다.

DB 길이/제약 위반이 Service에서 미리 검사되지 않으면 Spring JDBC 예외가 `500 INTERNAL_SERVER_ERROR`로 감춰질 수 있다. 이는 정상적인 검증 정책으로 확정하지 않고 개선 후보로 둔다.

## 재시도와 동시성

- 멱등키, 요청 ID 기반 중복 제거, ETag/버전 기반 낙관적 잠금은 없다.
- `@Transactional`이 붙은 Service 쓰기는 단일 DB 트랜잭션으로 실행된다. 이것이 모든 분산 상황의 원자성을 보장한다는 뜻은 아니다.
- GET만 일반적으로 안전하게 재시도할 수 있다.
- PUT/PATCH라도 감사 행 생성, 전체 교체, 상태 전환 부수 효과가 있어 자동 재시도를 보장하지 않는다.
- 동시 배치 주의 검사는 관련 범위를 DB에서 잠근 뒤 확인하지만, 클라이언트는 409 응답의 rule UUID를 명시적으로 재전송해야 한다.

## 근거 소스

- `backend-core/src/main/java/com/laborflow/core/common/error/GlobalExceptionHandler.java`
- `backend-core/src/main/java/com/laborflow/core/common/error/ApiErrorResponse.java`
- `backend-core/src/main/java/com/laborflow/core/common/error/WorkerSeparationConflictResponse.java`
- `web/src/api/apiBaseUrl.ts`
- `web/src/session/demoSession.ts`
- `run-windows.ps1`
- `run-tailscale-windows.ps1`
- `docker-compose.prod.yaml`
- `deploy/Caddyfile`
