# System Architecture

## 개요

LaborFlow는 Java Spring Boot 기반 core backend, Rust 기반 hot path backend, React web, Android mobile을 기본 구조로 사용합니다.

새 프로젝트가 이 구조와 다르면 이 문서와 `orchestrator/config/project.yaml`을 먼저 수정합니다.

## 역할 분리

- Java backend-core: 인증, 계정, 권한, 기록, 핵심 비즈니스 규칙.
- Rust backend-fast: 업로드, 실시간 WebSocket, fan-out, 지연 시간이 중요한 처리.
- Web: 사용자 화면, 인증 진입점, 실시간 표시.
- Mobile: 촬영, 업로드, JWT 저장/복원, 사용자 입력.
- PostgreSQL: 거래성 데이터, 감사 가능한 기록, 개인정보 원본 저장소.
- Redis: 짧은 TTL 캐시, rate limit 카운터, idempotency key, 분산 락, 실시간 fan-out 보조 저장소.

## Backend Core 패키지 정책

`backend-core`는 기능별 패키지를 기본 구조로 사용합니다.

- `common`: 여러 기능에서 공유하는 설정, 에러 응답, 캐시, 락, 보안 보조 코드.
- `identity`: 계정, 인증, 권한, 토큰, 세션 수명 정책.
- `workforce`: 인력 프로필, 조직, 팀, 고용/배정 정보.
- `attendance`: 출근, 퇴근, 수정 요청, 승인, 감사 기록.
- `schedule`: 근무표, 교대, 일정 변경, 캘린더.
- `workflow`: 업무 흐름, 승인 흐름, 알림 라우팅.
- `health`: 런타임 의존성 상태 확인.

각 기능 패키지는 필요한 경우 `api`, `application`, `dto`, `dao`를 둡니다. DB 트랜잭션과 권한 검사는 서버에서 강제하며, API 컨트롤러에는 복잡한 비즈니스 규칙을 두지 않습니다.

## 공통 계약

- JWT claim과 서명 정책.
- API base URL과 WebSocket URL.
- CORS/origin 정책.
- Redis 키 네임스페이스, 캐시 TTL, 무효화, fallback 정책.
- 분산 락 TTL, 획득 실패 처리, idempotency key 보관 기간.
- 데이터 보관/삭제 정책.
- 검증 스크립트와 릴리즈 차단 기준.

## Toolchain 기준

- Java/Spring backend-core는 JDK 26과 Spring Boot 4.x 최신 안정 버전을 기준으로 합니다.
- backend-core Gradle wrapper는 일반 JVM 빌드 기준 최신 안정 Gradle을 사용합니다.
- Android mobile은 Android Gradle Plugin 호환성 표를 우선합니다. AGP 9.2.x는 compileSdk 37과 Gradle 9.4.1 조합을 기준으로 두며, JDK 실행 환경은 JDK 26을 사용합니다.
- Web은 React, TypeScript, Vite의 최신 안정 버전을 사용하고 `npm run build`가 통과해야 합니다.
- Rust는 설치된 stable toolchain 기준으로 `cargo check`가 통과해야 합니다.

## 배포 메모

Kubernetes, ArgoCD, Helm/Kustomize 템플릿은 실제 배포 구조와 secret 주입 방식이 정해진 뒤 추가합니다.
