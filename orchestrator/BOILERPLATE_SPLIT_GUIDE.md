# Orchestrator Boilerplate Split Guide

이 문서는 Whiteboard Capture 안에서 검증한 오케스트레이터를 독립 보일러플레이트로 분리할 때의 기준을 정리합니다.

목표는 단순 복사가 아니라, **공통 오케스트레이션 엔진은 재사용하고 프로젝트 고유 정책은 새 프로젝트에서 다시 정의하는 구조**를 만드는 것입니다.

## 현재 판단

현재 오케스트레이터는 실사용 가능한 파이프라인 단계입니다.

- `runner:goal -> runner:quick -> runner:accept` 실사용 흐름 검증 완료
- `runner:readiness:strict`, `ci:dry-run`, accept guard, quality gate 검증 완료
- `project:package`, `project:validate-package`, 복사본 `ci:dry-run` 리허설 완료
- 보일러플레이트 분리는 가능하지만, ArgoCD/Kubernetes 템플릿은 실제 배포 구조가 정해진 뒤 추가하는 편이 안전함

분리 판단은 아래처럼 둡니다.

- 지금 바로 다른 프로젝트에 적용: 가능
- 독립 보일러 repository로 분리: 가능
- 클라우드/ArgoCD까지 포함한 완성형 플랫폼 템플릿화: 아직 보류

따라서 지금 분리 기준은 아래처럼 잡습니다.

```text
공통 보일러 = 실행 엔진, 안전 게이트, 보고서, 비용/재사용/rollback 구조
프로젝트 설정 = 역할 이름, 경로, 검증 스크립트, 보안/인증/API 계약
제품 코드 = web/backend/mobile/rust 등 실제 서비스 구현
```

## 그대로 가져갈 공통 보일러

아래 항목은 다른 프로젝트에서도 큰 틀을 유지할 수 있습니다.

- `orchestrator/src/`
- `orchestrator/package.json`
- `orchestrator/package-lock.json`
- `orchestrator/README.md`
- `orchestrator/OPERATIONS_GUIDE.md`
- `orchestrator/RUNNER_WORKFLOW.md`
- `orchestrator/SAFE_APPLY_MODES.md`
- `orchestrator/APPLY_REVIEW_GATES.md`
- `orchestrator/RUN_CLEANUP_POLICY.md`
- `orchestrator/PACKAGING.md`
- `orchestrator/BOILERPLATE_MIGRATION_CHECKLIST.md`
- `orchestrator/BOILERPLATE_SPLIT_GUIDE.md`
- `orchestrator/MODEL_QUALITY_OPTIONS.md`
- `orchestrator/templates/project-config/`
- `orchestrator/templates/policy-docs/`
- `orchestrator/templates/skills/`

공통으로 가져가는 이유:

- manager/worker/verifier/apply/report/rollback 흐름은 프로젝트와 무관하게 재사용 가능
- `runner:goal`, `runner:quick`, `runner:accept`, `runner:readiness` 같은 운영 alias는 다른 프로젝트에서도 유용
- accept guard, quality gate, argument guard, cost budget, worker result reuse는 일반적인 안전장치
- mock/test provider 기반 smoke test는 API 비용 없이 새 프로젝트에서 파이프라인 자체를 검증할 수 있음

## 새 프로젝트에서 반드시 다시 정해야 할 항목

아래 항목은 복사 직후 그대로 쓰면 안 됩니다. 새 프로젝트의 실제 구조와 계약으로 바꿔야 합니다.

- 루트 `AGENTS.md`
- 루트 `agent_role.md`
- 루트 `security_guidelines.md`
- 루트 `system_architecture.md`
- `.skills/verify-*.ps1`
- `orchestrator/config/project.yaml`
- `orchestrator/config/project-templates.yaml`
- 모듈 이름과 실제 경로
- 역할 목록과 역할별 allowed/blocked path
- API, JWT, OAuth, session, storage, WebSocket 계약
- 환경변수 이름과 secret 주입 방식
- 데이터 보관/삭제 정책
- 클라우드/배포 방식
- 개인정보/보안/감사 정책

예를 들어 Whiteboard Capture는 `web`, `backend-core`, `backend-fast`, `mobile` 구조를 사용하지만, 새 프로젝트가 `apps/web`, `services/api`, `workers/realtime` 구조라면 role policy와 검증 스크립트를 반드시 새 구조에 맞춰 바꿔야 합니다.

## Whiteboard 전용으로 남겨야 할 항목

아래는 독립 보일러플레이트에 기본 포함하지 않는 것이 안전합니다.

- `orchestrator/runs/`
- `.env`, `.env.local`
- `orchestrator/PIPELINE_STATUS.md`의 Whiteboard 실행 이력
- 실제 서비스 코드
  - `web/`
  - `backend-core/`
  - `backend-fast/`
  - `mobile/`
- Whiteboard 전용 Docker/run script/cloud 설정
- 네이버/구글 로그인 실제 운영 계약
- 칠판 사진 업로드, 100개 보관 제한, FIFO 삭제 정책
- Oracle/AWS/Object Storage 등 아직 Whiteboard 운영 맥락에 묶인 결정

단, Whiteboard와 구조가 비슷한 새 프로젝트라면 **정책의 형태**는 참고할 수 있습니다. 하지만 값, 경로, 계약은 반드시 다시 확정합니다.

## 일부 재사용 가능한 정책

아래 정책은 새 프로젝트의 구조가 비슷하면 출발점으로 사용할 수 있습니다.

- Java backend를 core/auth/account 중심으로 두는 구조
- Rust를 hot path/realtime/upload/fan-out 중심으로 두는 구조
- React web과 Android mobile을 별도 역할로 나누는 구조
- auth/JWT 작업에는 Java implement + Rust review를 기본 포함하는 정책
- realtime 작업에는 Rust implement + frontend implement를 기본 포함하는 정책
- Redis 작업에서 일반 캐시는 Java, upload hot path/realtime 캐시는 Rust를 우선 고려하는 정책
- 보안 체크리스트와 secret 노출 금지 규칙
- 비용 절감은 worker 결과 재사용과 역할 축소로만 수행한다는 원칙

재사용 조건:

- 새 프로젝트의 실제 아키텍처가 이 구조와 맞아야 함
- 검증 스크립트가 실제로 존재하고 통과해야 함
- API/JWT/스토리지/WebSocket 계약을 새 프로젝트 기준으로 다시 문서화해야 함

## 분리 전 체크리스트

독립 보일러 repository를 만들기 전, 현재 프로젝트에서 아래가 완료되어 있어야 합니다.

- [x] `npm run ci:dry-run` 통과
- [x] `runner:readiness:strict` 통과
- [x] `runner:accept-guard:smoke` 통과
- [x] `runner:accept-unlock:smoke` 통과
- [x] 최소 1개 frontend 구현 역할 리허설 성공
- [x] 최소 1개 Java 구현 역할 리허설 성공
- [x] Rust review-only 리허설 성공
- [x] Mobile review-only 리허설 성공
- [x] 보일러 패키지 실제 write 리허설 성공
- [x] 패키지 복사본 `npm install` 성공
- [x] 패키지 복사본 `npm run ci:dry-run` 성공
- [x] 문서 인코딩 게이트와 smoke 테스트 성공
- [x] `runner:readiness:strict`에 문서 인코딩 게이트 연결
- [x] 독립 복사본에서 `git init` 후 초기 커밋 성공
- [x] 독립 복사본에서 `runner:readiness:strict` 성공
- [x] 독립 복사본에서 `ci:dry-run` 성공
- [ ] 새 repository 이름과 목적 확정
- [ ] 공통 정책과 Whiteboard 전용 정책 분리 범위 최종 확정
- [ ] ArgoCD/Kubernetes 템플릿을 지금 넣을지, 나중에 넣을지 결정

## 분리 준비 완료 기준

아래 세 조건이 모두 참이면 독립 보일러 repository를 만들어도 됩니다.

1. `runner:readiness:strict`가 통과합니다.
2. `ci:dry-run`이 통과합니다.
3. `project:rehearse-package`가 통과합니다.

이 세 조건은 각각 다른 위험을 확인합니다.

- `runner:readiness:strict`: 현재 프로젝트의 로컬 실행 준비도와 안전 가드
- `ci:dry-run`: 오케스트레이터 자체 파이프라인과 smoke 테스트
- `project:rehearse-package`: 새 프로젝트로 복사 가능한 패키징 구조

위 조건을 통과해도 새 프로젝트의 실제 제품 정책은 자동으로 완성되지 않습니다. 새 프로젝트에서는 `BOILERPLATE_MIGRATION_CHECKLIST.md`를 기준으로 정책 문서, role 경로, 검증 스크립트, 보안 계약을 다시 확정해야 합니다.

## 분리 절차

권장 절차는 아래 순서입니다.

1. 새 빈 repository를 만듭니다.
2. 현재 프로젝트의 orchestrator에서 패키징 명령을 실행합니다.

```powershell
cd "D:\개발\whiteboard capture\orchestrator"
& "C:\Program Files\nodejs\npm.cmd" run project:package -- --target "D:\개발\<new-boilerplate-repo>" --name "<Boilerplate Name>" --goal "Reusable agent orchestration boilerplate" --force
```

3. 새 repository로 이동해 의존성을 설치합니다.

```powershell
cd "D:\개발\<new-boilerplate-repo>\orchestrator"
& "C:\Program Files\nodejs\npm.cmd" install
```

4. 새 repository에서 파이프라인 자체 검증을 실행합니다.

```powershell
& "C:\Program Files\nodejs\npm.cmd" run ci:dry-run
```

5. 새 repository에서 `project:init`으로 프로젝트 이름과 목표를 정리합니다.

```powershell
& "C:\Program Files\nodejs\npm.cmd" run project:init -- --name "<Project Name>" --goal "<Project Goal>" --force
```

6. `BOILERPLATE_MIGRATION_CHECKLIST.md`를 기준으로 Whiteboard 전용 문구와 경로를 제거합니다.
7. 새 프로젝트의 `.skills/verify-*.ps1`을 실제 구조에 맞게 수정합니다.
8. `runner:readiness:strict`와 `ci:dry-run`을 다시 실행합니다.
9. 첫 커밋과 태그를 만듭니다.

```powershell
git add .
git commit -m "Initial orchestrator boilerplate"
git tag v0.1.0
```

## 분리 후 운영 방식

분리 후에는 아래 원칙을 유지합니다.

- 보일러 repository는 엔진, 공통 템플릿, 안전장치, 문서만 관리합니다.
- 제품 repository는 제품별 `project.yaml`, role policy, `.skills`, 계약 문서를 관리합니다.
- 제품 repository에서 발견한 개선은 바로 보일러에 넣지 말고, 다른 프로젝트에도 일반화 가능한지 먼저 판단합니다.
- 보일러 업데이트는 제품 repository로 cherry-pick하거나 패키징 갱신 방식으로 가져옵니다.
- 제품별 worker result, run report, API usage history는 다른 프로젝트로 복사하지 않습니다.

## 아직 보류하는 항목

아래는 보일러 분리 직후가 아니라 배포 구조가 확정된 뒤 추가하는 것이 좋습니다.

- Kubernetes manifest
- Helm chart
- Kustomize overlay
- ArgoCD Application template
- cloud provider별 secret 주입 템플릿
- GitHub Actions 외 다른 CI/CD 공급자별 workflow
- 모델별 가격 메타데이터 자동 업데이트
- 조직 단위 비용/감사 대시보드

보류 이유:

- 배포 구조는 프로젝트마다 차이가 큼
- 잘못된 기본값이 새 프로젝트에 위험한 보안/운영 결정을 강제할 수 있음
- 현재 핵심 목표는 코딩 파이프라인의 안정성이고, 배포 템플릿은 다음 단계의 문제

## 분리 판단 기준

보일러에 넣을지, 제품 프로젝트에 남길지 판단할 때 아래 기준을 사용합니다.

### 보일러에 넣기 좋은 것

- 세 프로젝트 이상에서 재사용 가능할 규칙
- 특정 파일 경로나 도메인에 의존하지 않는 실행 엔진
- 안전성/검증/rollback/report/cost/reuse 관련 공통 기능
- mock/test provider로 검증 가능한 기능
- 새 프로젝트가 값을 채워 넣을 수 있는 템플릿

### 제품 프로젝트에 남겨야 하는 것

- 실제 서비스 경로와 모듈 이름
- 제품별 환경변수, secret, 도메인
- 제품별 인증/인가/JWT claim 계약
- 제품별 데이터 보관 정책
- 제품별 배포 인프라와 cloud provider 세부 설정
- 제품별 디자인 시스템과 비즈니스 규칙
- 실제 worker 실행 이력과 report

### 보류하거나 템플릿으로만 제공할 것

- 클라우드 배포 설정
- ArgoCD/Kubernetes/Helm/Kustomize
- 결제/인증/스토리지 provider별 구현 계약
- 조직별 보안 감사 양식

## 안전 규칙

- 보일러플레이트는 계약의 출발점이지, 새 프로젝트의 최종 계약이 아닙니다.
- 새 프로젝트에서는 `AGENTS.md`, 보안 문서, 아키텍처 문서를 먼저 검토하거나 새로 작성합니다.
- worker는 과거 run 기록이 아니라 현재 파일 상태를 기준으로 판단해야 합니다.
- 다른 프로젝트의 worker result나 report를 새 프로젝트에 재사용하지 않습니다.
- 비용 절감 기능은 같은 repository, 같은 run, 같은 Git 상태에서만 사용합니다.
- 새 프로젝트로 옮긴 직후에는 아래 순서로 검증합니다.

```text
project:validate-package
-> npm install
-> runner:readiness:strict
-> ci:dry-run
-> 단일 role rollback rehearsal
-> 실제 작은 기능 keep-applied rehearsal
```
