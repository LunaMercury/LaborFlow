# Whiteboard Capture Orchestrator

현재 파이프라인 완료 상태와 실사용 명령은 [PIPELINE_STATUS.md](./PIPELINE_STATUS.md)를 참고합니다.

이 디렉토리는 Whiteboard Capture 프로젝트용 에이전트 오케스트레이션 파이프라인입니다.

현재 기본 실사용 흐름은 다음과 같습니다.

1. `runner:goal`로 안전 리허설을 실행합니다.
2. `runner:quick`으로 최신 run의 상태와 다음 선택지를 확인합니다.
3. 결과가 마음에 들면 `runner:accept`로 같은 worker 결과를 실제 적용합니다.

중요한 작업은 먼저 `runner:readiness:strict`로 로컬 준비도와 안전 가드를 확인하는 것을 권장합니다.
`runner:readiness`는 문서 인코딩 게이트도 함께 실행하므로, 깨진 Markdown이나 BOM 누락 문서가 있으면 live 작업 전에 먼저 차단됩니다.

## 현재 구조

오케스트레이터는 LangGraph 기반으로 구성되어 있습니다.

- `manager`
- `frontend`
- `rust`
- `java`
- `mobile`
- `task-packets`
- `verifier`
- `merge`

즉, 현재 그래프 흐름은 아래와 같습니다.

```text
manager
  -> frontend
  -> rust
  -> java
  -> mobile
  -> task-packets
  -> verifier
  -> merge
```

## 주요 개념

### 1. 카테고리 정책

사용자 요청은 현재 아래 카테고리로 분류됩니다.

- `auth`
- `design`
- `redis`
- `realtime`

각 카테고리는 모듈별 최소 참여 수준을 강제합니다.

예:

- `auth`
  - java: `implement`
  - rust: 최소 `review`
  - frontend: 최소 `implement`
  - mobile: 요청 범위에 따라 `skip/review/implement`

- `redis`
  - 기본: java `implement`, rust `review`
  - `upload hot path`, `websocket`, `fan-out`, `realtime` 문맥 포함 시 rust도 `implement`

- `realtime`
  - rust: `implement`
  - frontend: `implement`
  - java: 최소 `review`

### 2. 템플릿 레지스트리

카테고리별 설명/계약/검토 포인트는 코드에 하드코딩된 긴 문장 대신 템플릿 레지스트리에서 관리합니다.

관련 파일:

- [templateRegistry.ts](</D:/개발/whiteboard capture/orchestrator/src/templateRegistry.ts>)

결과 보고서 상단에는 사람이 빠르게 읽을 수 있도록 YAML 형태의 `Applied Templates` 섹션이 출력됩니다.

### 3. Worker Task Packet

worker가 실제로 받아야 하는 입력 형식입니다.

포함 필드:

- `role`
- `participationMode`
- `goal`
- `allowedPaths`
- `blockedPaths`
- `touchedAreas`
- `implementationSteps`
- `dependencies`
- `requiredVerification`
- `contracts`
- `handoffOutput`

관련 파일:

- [taskSchemas.ts](</D:/개발/whiteboard capture/orchestrator/src/taskSchemas.ts>)

### 4. Worker Result Packet

worker가 작업 후 master에게 반환해야 하는 출력 형식입니다.

포함 필드:

- `status`
- `changedFiles`
- `summary`
- `contractsChanged`
- `verificationRun`
- `risks`
- `questions`

관련 파일:

- [resultSchemas.ts](</D:/개발/whiteboard capture/orchestrator/src/resultSchemas.ts>)

### 5. Verifier

`verifier`는 아래를 검토합니다.

- manager 결정
- specialist plan
- worker task packet
- worker result packet

집중 포인트:

- 계약 충돌
- 검증 누락
- 숨은 리스크
- 릴리즈 블로커
- worker packet이 실제 실행 가능한지 여부

## 현재 생성되는 산출물

`runner:prepare`를 실행하면 아래 구조가 생성됩니다.

```text
orchestrator/runs/<run-id>/
  report.md
  tasks/
    frontend.task.json
    rust.task.json
    java.task.json
    mobile.task.json
  results/
    frontend.result.json
    rust.result.json
    java.result.json
    mobile.result.json
  workers/
    frontend.prompt.md
    rust.prompt.md
    java.prompt.md
    mobile.prompt.md
  meta/
    manifest.json
    summary.json
```

설명:

- `tasks/*.task.json`
  - worker 입력 패킷
- `results/*.result.json`
  - worker 출력 패킷
- `workers/*.prompt.md`
  - CLI worker에게 넘길 프롬프트 파일
- `report.md`
  - 사람이 읽는 전체 오케스트레이션 보고서
- `meta/manifest.json`
  - run 메타데이터

## 파이프라인 완성도

현재 오케스트레이터는 실사용 가능한 안전 실행 파이프라인 상태입니다.

- manager 계획 및 역할별 worker packet 생성
- OpenAI/test worker provider
- apply review 안전 게이트
- 계약 변경/미해결 질문 차단
- 안전 리허설 후 자동 롤백
- 성공한 리허설 이후에만 accept 허용
- 역할별 `.skills/verify-*` 검증 연결
- post-apply 품질 게이트
- 비용 요약 및 report/html report 생성
- `runner:goal -> runner:quick -> runner:accept` 실사용 alias
- 보일러플레이트 패키징/검증 명령

상세 상태와 최근 검증 기록은 [PIPELINE_STATUS.md](./PIPELINE_STATUS.md)를 참고합니다.

## 현재 사용 가능한 명령

### 0. 실사용 기본 alias

대부분의 작업은 아래 alias 중 하나로 시작합니다. 가장 짧은 확인 흐름은 `runner:goal`로 리허설한 뒤 `runner:quick`으로 최신 run 상태와 다음 선택지를 보는 것입니다.

```powershell
cd orchestrator

# 가장 짧은 실사용 체인
"C:\Program Files\nodejs\npm.cmd" run runner:readiness:compact

# 중요한 live 실행 전 warning까지 실패로 처리
"C:\Program Files\nodejs\npm.cmd" run runner:readiness:strict
"C:\Program Files\nodejs\npm.cmd" run runner:preflight:compact
"C:\Program Files\nodejs\npm.cmd" run runner:goal -- --roles frontend "요청 내용"
"C:\Program Files\nodejs\npm.cmd" run runner:quick
"C:\Program Files\nodejs\npm.cmd" run runner:accept

# 계획과 worker 제안만 확인
"C:\Program Files\nodejs\npm.cmd" run runner:plan -- --roles frontend,java "요청 내용"

# 비용 없이 plan/worker 흐름만 점검
"C:\Program Files\nodejs\npm.cmd" run runner:plan:mock -- --roles frontend,java "요청 내용"

# 목표형 안전 실행: 적용 가능성 검증 후 자동 롤백
"C:\Program Files\nodejs\npm.cmd" run runner:goal -- --roles frontend "요청 내용"

`runner:goal`은 안전 리허설입니다. 성공해도 파일 변경은 롤백되며, 결과가 마음에 들면 `runner:quick`으로 최신 run을 확인한 뒤 `runner:accept`로 같은 worker 결과를 실제 적용합니다.

# 예산 제한이 필요한 안전 실행
"C:\Program Files\nodejs\npm.cmd" run runner:goal:budget -- --roles frontend "요청 내용"

# 비용 없이 목표형 흐름 점검
"C:\Program Files\nodejs\npm.cmd" run runner:goal:mock -- --roles frontend,java "요청 내용"

# 적용 가능성을 검증하고 자동 롤백
"C:\Program Files\nodejs\npm.cmd" run runner:rehearse -- --roles frontend "요청 내용"

# 실제 변경을 남김
"C:\Program Files\nodejs\npm.cmd" run runner:apply -- --roles frontend "요청 내용"

# 기존 run의 worker 결과를 재사용해 apply만 다시 시도
"C:\Program Files\nodejs\npm.cmd" run runner:reuse-apply -- <run-id> --roles mobile

# 적용된 변경의 로컬 품질 게이트만 확인
"C:\Program Files\nodejs\npm.cmd" run runner:quality -- <run-id> --roles frontend

# Markdown 문서 인코딩과 한글 깨짐을 확인
"C:\Program Files\nodejs\npm.cmd" run runner:docs-encoding -- --compact

# 문서 인코딩 게이트가 깨진 문서를 차단하는지 비용 없이 확인
"C:\Program Files\nodejs\npm.cmd" run runner:docs-encoding:smoke

# 품질 게이트가 나쁜 패턴을 실제로 차단하는지 비용 없이 확인
"C:\Program Files\nodejs\npm.cmd" run runner:quality:smoke

# workflow가 품질 게이트 실패를 차단하고 롤백하는지 비용 없이 확인
"C:\Program Files\nodejs\npm.cmd" run runner:workflow:quality-smoke

# 기존 run에서 다음 행동 추천만 확인
"C:\Program Files\nodejs\npm.cmd" run runner:continue -- <run-id>

# 기존 run에서 다음 행동 추천만 짧게 확인
"C:\Program Files\nodejs\npm.cmd" run runner:continue:compact -- <run-id>

# 기존 run의 핵심 요약만 한 화면으로 확인
"C:\Program Files\nodejs\npm.cmd" run runner:status:compact -- <run-id>

# 추천 옵션을 명시적으로 미리보기
"C:\Program Files\nodejs\npm.cmd" run runner:continue -- <run-id> --choose A

# 추천 옵션 실행
"C:\Program Files\nodejs\npm.cmd" run runner:continue -- <run-id> --choose A --execute

# 같은 의미의 짧은 alias
"C:\Program Files\nodejs\npm.cmd" run runner:continue:a -- <run-id>
"C:\Program Files\nodejs\npm.cmd" run runner:continue:b:execute -- <run-id>

# 최신 run 기준으로 바로 확인
"C:\Program Files\nodejs\npm.cmd" run runner:quick
"C:\Program Files\nodejs\npm.cmd" run runner:quick:any
"C:\Program Files\nodejs\npm.cmd" run runner:quick:mock
"C:\Program Files\nodejs\npm.cmd" run runner:latest
"C:\Program Files\nodejs\npm.cmd" run runner:latest:quick
"C:\Program Files\nodejs\npm.cmd" run runner:latest:any
"C:\Program Files\nodejs\npm.cmd" run runner:latest:status
"C:\Program Files\nodejs\npm.cmd" run runner:latest:status:compact
"C:\Program Files\nodejs\npm.cmd" run runner:latest:continue
"C:\Program Files\nodejs\npm.cmd" run runner:latest:continue:compact
"C:\Program Files\nodejs\npm.cmd" run runner:latest:b
"C:\Program Files\nodejs\npm.cmd" run runner:accept:preview
"C:\Program Files\nodejs\npm.cmd" run runner:accept

# 여러 run 리포트 인덱스 생성
"C:\Program Files\nodejs\npm.cmd" run runner:reports
"C:\Program Files\nodejs\npm.cmd" run runner:reports:live
"C:\Program Files\nodejs\npm.cmd" run runner:reports:mock

# 명령이 헷갈릴 때
"C:\Program Files\nodejs\npm.cmd" run runner:help

# live 실행 전 API 키, 모델, 예산, git 상태를 비용 없이 확인
"C:\Program Files\nodejs\npm.cmd" run runner:preflight:compact

# live 실행 준비도와 핵심 안전 가드를 한 번에 확인
"C:\Program Files\nodejs\npm.cmd" run runner:readiness:compact

# npm 옵션 구분자 누락 같은 인자 전달 실수를 비용 없이 확인
"C:\Program Files\nodejs\npm.cmd" run runner:argument-guard:smoke

# plan-only run에서 accept가 잠기는지 비용 없이 확인
"C:\Program Files\nodejs\npm.cmd" run runner:accept-guard:smoke

# 성공한 리허설 뒤 accept가 열리는지 확인
"C:\Program Files\nodejs\npm.cmd" run runner:accept-unlock:smoke
```

### 1. 일반 오케스트레이션 보기

```powershell
cd orchestrator
"C:\Program Files\nodejs\npm.cmd" run demo -- "네이버 로그인 기능을 만들어줘"
```

mock 모드:

```powershell
cd orchestrator
"C:\Program Files\nodejs\npm.cmd" run demo:mock -- "네이버 로그인 기능을 만들어줘"
```

### 2. runner bundle 만들기

```powershell
cd orchestrator
"C:\Program Files\nodejs\npm.cmd" run runner:prepare -- "네이버 로그인 기능을 만들어줘"
```

mock 모드:

```powershell
cd orchestrator
"C:\Program Files\nodejs\npm.cmd" run runner:prepare:mock -- "네이버 로그인 기능을 만들어줘"
```

### 3. run 상태 보기

```powershell
cd orchestrator
"C:\Program Files\nodejs\npm.cmd" run runner:status -- <run-id>
```

### 4. worker prompt 준비

```powershell
cd orchestrator
"C:\Program Files\nodejs\npm.cmd" run worker:prepare -- <run-id> java
```

가능한 role:

- `frontend`
- `rust`
- `java`
- `mobile`

### 5. worker 실제 실행 시도

현재 지원 provider:

- `claude`
- `manual`

예:

```powershell
cd orchestrator
"C:\Program Files\nodejs\npm.cmd" run worker:run -- <run-id> java
```

수동 준비만 하고 싶다면:

```powershell
cd orchestrator
"C:\Program Files\nodejs\npm.cmd" run worker:run -- <run-id> java --provider manual
```

### 6. worker 결과 수집

```powershell
cd orchestrator
"C:\Program Files\nodejs\npm.cmd" run runner:collect -- <run-id>
```

## 남은 작업

남은 작업은 파이프라인 실사용을 막는 핵심 결함이 아니라, 배포와 재사용 편의 개선입니다.

1. 클라우드/ArgoCD/Kubernetes 템플릿 추가
2. 독립 보일러 repository 분리
3. 프로젝트별 정책 팩 분리
4. 장기 비용 최적화와 report retention 정책 조정

## 관련 파일

- [graph.ts](</D:/개발/whiteboard capture/orchestrator/src/graph.ts>)
- [schemas.ts](</D:/개발/whiteboard capture/orchestrator/src/schemas.ts>)
- [taskSchemas.ts](</D:/개발/whiteboard capture/orchestrator/src/taskSchemas.ts>)
- [resultSchemas.ts](</D:/개발/whiteboard capture/orchestrator/src/resultSchemas.ts>)
- [templateRegistry.ts](</D:/개발/whiteboard capture/orchestrator/src/templateRegistry.ts>)
- [packetStore.ts](</D:/개발/whiteboard capture/orchestrator/src/packetStore.ts>)
- [prepareRunner.ts](</D:/개발/whiteboard capture/orchestrator/src/prepareRunner.ts>)
- [runnerStatus.ts](</D:/개발/whiteboard capture/orchestrator/src/runnerStatus.ts>)
- [workerExecutor.ts](</D:/개발/whiteboard capture/orchestrator/src/workerExecutor.ts>)
- [workerRun.ts](</D:/개발/whiteboard capture/orchestrator/src/workerRun.ts>)
- [collectResults.ts](</D:/개발/whiteboard capture/orchestrator/src/collectResults.ts>)
