# System Architecture

## 개요

LaborFlow는 Java Spring Boot 기반 core backend, Rust 기반 hot path backend, React web, Android mobile을 기본 구조로 사용합니다.

새 프로젝트가 이 구조와 다르면 이 문서와 `orchestrator/config/project.yaml`을 먼저 수정합니다.

## 역할 분리

- Java backend-core: 인증, 계정, 권한, 기록, 핵심 비즈니스 규칙.
- Rust backend-fast: 업로드, 실시간 WebSocket, fan-out, 지연 시간이 중요한 처리.
- Web: 사용자 화면, 인증 진입점, 실시간 표시.
- Mobile: 촬영, 업로드, JWT 저장/복원, 사용자 입력.

## 공통 계약

- JWT claim과 서명 정책.
- API base URL과 WebSocket URL.
- CORS/origin 정책.
- 캐시 TTL과 fallback 정책.
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
