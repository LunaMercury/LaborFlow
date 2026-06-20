# Enterprise Policies

## 목표

LaborFlow는 티켓 예매 서비스처럼 특정 시간대에 트래픽이 급증할 수 있는 업무 시스템을 전제로 설계합니다. 기본 정책은 빠른 응답, 서버 강제 권한 검증, 재현 가능한 검증, 개인정보 최소 노출입니다.

## 데이터 저장소 원칙

- PostgreSQL은 사용자, 인력, 근태, 일정, 업무 흐름, 감사 로그의 원본 저장소입니다.
- Redis는 캐시, rate limit, idempotency key, 분산 락, 짧은 수명의 실시간 상태 보조 저장소입니다.
- Redis 데이터는 TTL을 기본으로 하며, 영구 원본으로 사용하지 않습니다.
- 개인정보 원문은 Redis key/value에 저장하지 않습니다. 필요한 경우 비식별 ID만 사용합니다.

## Backend Core 구조 원칙

- 기능별 패키지 아래에 `api`, `application`, `dto`, `dao` 계층을 둡니다.
- `api`는 요청/응답 변환과 인증 컨텍스트 전달만 담당합니다.
- `application`은 유스케이스, 트랜잭션 경계, 권한 검사를 담당합니다.
- `dao`는 외부 저장소 접근 계약과 구현을 담당합니다.
- `dto`는 API와 계층 간 데이터 전달 형식을 담당합니다.
- 여러 기능에서 공유되는 코드만 `common`에 둡니다.

## 대규모 트래픽 정책

- 읽기 빈도가 높은 목록/요약은 Redis 캐시 후보로 검토합니다.
- 쓰기 경로는 PostgreSQL 성공 이후 이벤트를 발행하고, 캐시는 명시적으로 무효화합니다.
- 동일 자원에 대한 중복 제출 위험이 있으면 idempotency key를 먼저 설계합니다.
- 분산 락은 짧은 TTL과 명확한 실패 응답이 있는 경로에만 사용합니다.
- WebSocket/SSE는 변경 알림과 상태 갱신에 사용하고, 원본 저장은 REST API와 PostgreSQL 기준으로 유지합니다.

## 운영 준비 정책

- 모든 신규 모듈은 `.skills/verify-*.ps1`로 검증 가능해야 합니다.
- Docker 로컬 환경은 PostgreSQL과 Redis를 함께 띄울 수 있어야 합니다.
- 운영 배포 전에는 secret store, TLS, CORS/origin, 로그 마스킹, 백업/복구 정책을 문서화해야 합니다.
