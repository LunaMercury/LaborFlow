# Orchestrator Operations Guide

이 문서는 오케스트레이터를 실제 작업에 사용할 때 어떤 명령과 옵션을 선택해야 하는지 정리한 운영형 사용 설명서입니다.

## 기본 원칙

- 신뢰도가 비용 절감보다 우선입니다.
- 토큰 절감은 판단을 생략하는 방식이 아니라, 이미 확보한 결과를 안전하게 재사용하는 방식으로만 합니다.
- 실제 파일을 바꾸는 실행은 항상 `--apply`가 필요합니다.
- 테스트 적용은 `--rollback-after-verify`, 실제 적용은 `--keep-applied`를 사용합니다.
- `runner:quick`은 읽기 전용입니다. 상태와 다음 선택지만 보여주며 파일을 적용하거나 롤백하지 않습니다.
- apply 이후에는 로컬 `runner:quality` 게이트가 실행되어 임시값, 주석 처리된 코드, JSX inline style 같은 품질 문제를 차단합니다.
- 계약 변경이나 미해결 질문은 기본적으로 차단합니다.
- `blocked`는 실패가 아니라 안전 게이트가 작동한 상태입니다. 내용을 확인한 뒤 명시적으로 승인하거나 요청을 보완합니다.

## 현재 운영 단계

오케스트레이터는 현재 실사용 가능한 파이프라인 단계입니다. 일반 작업은 `runner:goal -> runner:quick -> runner:accept` 흐름으로 진행하고, 인증/보안/배포/환경변수처럼 영향이 큰 작업은 `runner:readiness:strict`를 먼저 실행합니다.

보일러플레이트 분리와 ArgoCD/Kubernetes 템플릿은 파이프라인 핵심 기능이 아니라 배포/재사용 단계의 후속 작업으로 둡니다.

## 가장 많이 쓰는 명령

먼저 아래 핵심 alias만 기억하면 됩니다. 기본 흐름은 `runner:goal`로 안전 리허설을 만들고, `runner:quick`으로 상태와 다음 선택지를 확인한 뒤, 의도적으로 유지할 때만 `runner:accept`를 실행하는 것입니다.

| alias | 언제 사용하나 | 파일 변경 |
| --- | --- | --- |
| `runner:plan` | 계획과 worker 제안만 확인 | 없음 |
| `runner:plan:mock` | 비용 없이 plan/worker 흐름만 점검 | 없음 |
| `runner:preflight` | live 실행 전 API 키, 모델, 예산, git 상태 확인 | 없음 |
| `runner:readiness` | live 실행 준비도와 핵심 안전 가드를 한 번에 확인 | 없음 |
| `runner:readiness:strict` | 중요한 live 실행 전 warning도 실패로 다루는 준비도 점검 | 없음 |
| `runner:argument-guard:smoke` | npm 옵션 구분자 누락 감지 가드 자체 점검 | 없음 |
| `runner:accept-guard:smoke` | 리허설 전 accept 잠금 자체 점검 | 없음 |
| `runner:accept-unlock:smoke` | 리허설 성공 후 accept 해제 자체 점검 | 검증 후 롤백 |
| `runner:docs-encoding` | Markdown 문서의 한글 깨짐과 BOM 누락 확인 | 없음 |
| `runner:docs-encoding:smoke` | 문서 인코딩 게이트가 깨진 문서를 차단하는지 자체 점검 | 임시 파일 생성 후 삭제 |
| `runner:goal` | 적용 가능성을 검증하고 자동 롤백 | 검증 후 롤백 |
| `runner:quick` | 최신 live run의 상태와 다음 선택지 확인 | 없음 |
| `runner:rehearse` | 실제 적용 가능성을 검증하고 자동 롤백 | 검증 후 롤백 |
| `runner:apply` | 검증된 작업을 실제로 남김 | 변경 유지 |
| `runner:reuse-apply` | 기존 worker 결과를 재사용해 apply만 재시도 | 검증 후 롤백 |
| `runner:continue` | 기존 run 상태를 읽고 다음 명령 추천 | 없음 |
| `runner:accept` | 최신 live run의 제안 변경을 실제로 유지 | 변경 유지 |
| `runner:quality` | 적용된 변경의 기본 품질 게이트 확인 | 없음 |
| `runner:quality:smoke` | 품질 게이트가 나쁜 패턴을 차단하는지 자체 점검 | 없음 |
| `runner:workflow:quality-smoke` | workflow가 품질 실패를 차단하고 롤백하는지 자체 점검 | 없음 |

```powershell
cd "D:\개발\whiteboard capture\orchestrator"

# 계획과 worker 결과만 확인
& "C:\Program Files\nodejs\npm.cmd" run runner:plan -- --roles frontend,java "요청 내용"

# live 실행 전 계기판 확인
& "C:\Program Files\nodejs\npm.cmd" run runner:preflight:compact

# live 실행 준비도와 핵심 안전 가드 한 번에 확인
& "C:\Program Files\nodejs\npm.cmd" run runner:readiness:compact

# 중요한 live 실행 전 warning도 실패 처리
& "C:\Program Files\nodejs\npm.cmd" run runner:readiness:strict

# npm `--` 누락 같은 인자 전달 실수가 차단되는지 확인
& "C:\Program Files\nodejs\npm.cmd" run runner:argument-guard:smoke

# 안전 리허설 전 accept가 잠기는지 확인
& "C:\Program Files\nodejs\npm.cmd" run runner:accept-guard:smoke

# 안전 리허설 후 accept가 열리는지 확인
& "C:\Program Files\nodejs\npm.cmd" run runner:accept-unlock:smoke

# Markdown 문서 인코딩과 한글 깨짐 확인
& "C:\Program Files\nodejs\npm.cmd" run runner:docs-encoding -- --compact

# 문서 인코딩 게이트 자체 점검
& "C:\Program Files\nodejs\npm.cmd" run runner:docs-encoding:smoke

# 비용 없이 plan/worker 흐름만 점검
& "C:\Program Files\nodejs\npm.cmd" run runner:plan:mock -- --roles frontend,java "요청 내용"

# 목표형 안전 실행: 적용 가능성 검증 후 자동 롤백
& "C:\Program Files\nodejs\npm.cmd" run runner:goal -- --roles frontend "요청 내용"

`runner:goal`은 안전 리허설입니다. 성공해도 파일 변경은 롤백되며, 결과가 마음에 들면 `runner:quick`으로 최신 run을 확인한 뒤 `runner:accept`로 같은 worker 결과를 실제 적용합니다.

# 예산 제한이 필요한 안전 실행
& "C:\Program Files\nodejs\npm.cmd" run runner:goal:budget -- --roles frontend "요청 내용"

# 비용 없이 목표형 흐름 점검
& "C:\Program Files\nodejs\npm.cmd" run runner:goal:mock -- --roles frontend,java "요청 내용"

# 안전 리허설: 적용, 검증, 자동 롤백
& "C:\Program Files\nodejs\npm.cmd" run runner:rehearse -- --roles frontend "요청 내용"

# 실제 적용: 성공한 변경을 worktree에 유지
& "C:\Program Files\nodejs\npm.cmd" run runner:apply -- --roles frontend "요청 내용"

# 기존 run의 worker 결과를 재사용해 apply만 다시 시도
& "C:\Program Files\nodejs\npm.cmd" run runner:reuse-apply -- <run-id> --roles mobile

# 기존 run에서 다음 행동 추천만 확인
& "C:\Program Files\nodejs\npm.cmd" run runner:continue -- <run-id>

# 기존 run에서 다음 행동 추천만 짧게 확인
& "C:\Program Files\nodejs\npm.cmd" run runner:continue:compact -- <run-id>

# 기존 run의 핵심 요약만 한 화면으로 확인
& "C:\Program Files\nodejs\npm.cmd" run runner:status:compact -- <run-id>

# 추천 옵션을 명시적으로 미리보기
& "C:\Program Files\nodejs\npm.cmd" run runner:continue -- <run-id> --choose A

# 추천 옵션 실행
& "C:\Program Files\nodejs\npm.cmd" run runner:continue -- <run-id> --choose A --execute

# 같은 의미의 짧은 alias
& "C:\Program Files\nodejs\npm.cmd" run runner:continue:a -- <run-id>
& "C:\Program Files\nodejs\npm.cmd" run runner:continue:b:execute -- <run-id>

# 최신 run 기준으로 바로 확인
& "C:\Program Files\nodejs\npm.cmd" run runner:quick
& "C:\Program Files\nodejs\npm.cmd" run runner:quick:any
& "C:\Program Files\nodejs\npm.cmd" run runner:quick:mock
& "C:\Program Files\nodejs\npm.cmd" run runner:latest
& "C:\Program Files\nodejs\npm.cmd" run runner:latest:quick
& "C:\Program Files\nodejs\npm.cmd" run runner:latest:any
& "C:\Program Files\nodejs\npm.cmd" run runner:latest:status
& "C:\Program Files\nodejs\npm.cmd" run runner:latest:status:compact
& "C:\Program Files\nodejs\npm.cmd" run runner:latest:continue
& "C:\Program Files\nodejs\npm.cmd" run runner:latest:continue:compact
& "C:\Program Files\nodejs\npm.cmd" run runner:latest:b
& "C:\Program Files\nodejs\npm.cmd" run runner:accept:preview
& "C:\Program Files\nodejs\npm.cmd" run runner:accept

# 여러 run 리포트 인덱스 생성
& "C:\Program Files\nodejs\npm.cmd" run runner:reports
& "C:\Program Files\nodejs\npm.cmd" run runner:reports:live
& "C:\Program Files\nodejs\npm.cmd" run runner:reports:mock

`runner:reports`는 `orchestrator/runs/index.html`을 갱신합니다. 실작업 기록만 보고 싶으면 `runner:reports:live`, CI/mock 리허설만 보고 싶으면 `runner:reports:mock`을 사용합니다. 목록을 훑은 뒤 최신 항목만 빠르게 판단하려면 `runner:quick`, `runner:quick:any`, `runner:quick:mock`을 사용합니다.

# 명령이 헷갈릴 때
& "C:\Program Files\nodejs\npm.cmd" run runner:help
```

### 0. 작업 전 빠른 점검

로컬 도구, 필수 스크립트, 정책 문서, 검증 파일이 준비되어 있는지 확인합니다. OpenAI API를 호출하지 않으므로 비용이 들지 않습니다.

```powershell
cd "D:\개발\whiteboard capture\orchestrator"
& "C:\Program Files\nodejs\npm.cmd" run runner:doctor -- --compact
```

복사 직후 아직 Git 저장소가 아닌 프로젝트에서는 `git worktree`가 warning으로 표시될 수 있습니다. 실제 apply workflow를 사용하기 전에는 대상 프로젝트에서 `git init`과 첫 커밋을 완료하는 것이 좋습니다.

warning도 CI에서 실패로 다루고 싶다면 `--strict`를 추가합니다.

```powershell
& "C:\Program Files\nodejs\npm.cmd" run runner:doctor -- --compact --strict
```

보일러플레이트 복사가 가능한지 빠르게 확인하려면 다음 명령을 사용합니다. 임시 폴더에 패키징하고 검증한 뒤 기본적으로 삭제합니다.
기본 리허설 경로는 `D:\개발\boilerplate-test` 아래이며, 필요하면 `--target` 또는 `ORCHESTRATOR_REHEARSAL_ROOT`로 바꿀 수 있습니다.

```powershell
& "C:\Program Files\nodejs\npm.cmd" run project:rehearse-package
```

### 1. 계획과 worker 결과만 확인

실제 파일은 수정하지 않습니다. 비용과 작업 범위를 먼저 확인할 때 사용합니다.

```powershell
cd "D:\개발\whiteboard capture\orchestrator"
& "C:\Program Files\nodejs\npm.cmd" run runner:full -- --compact --roles frontend,java,rust,mobile --worker-provider openai --concurrency 2 "네이버 로그인 기능을 만들어줘"
```

### 2. 안전 리허설

실제 파일에 적용하고 검증한 뒤 자동 롤백합니다. 파이프라인 테스트와 위험한 작업 검증에 사용합니다.

```powershell
cd "D:\개발\whiteboard capture\orchestrator"
& "C:\Program Files\nodejs\npm.cmd" run runner:full -- --compact --roles frontend --worker-provider openai --apply-provider openai --apply --rollback-after-verify --concurrency 1 --continue-on-error "로그인 화면 하단에 개인정보 처리방침 링크를 추가해줘"
```

성공 여부는 마지막 `Final Summary`에서 확인합니다.

```text
Status: succeeded
Verification: passed 또는 recorded
Rollback: succeeded
runner:workflow: exit=0
```

### 3. 실제 적용

검증 후 변경을 유지합니다. 작업트리가 깨끗하고, 요청이 충분히 명확할 때만 사용합니다.

```powershell
cd "D:\개발\whiteboard capture\orchestrator"
& "C:\Program Files\nodejs\npm.cmd" run runner:full -- --compact --roles frontend --worker-provider openai --apply-provider openai --apply --keep-applied --concurrency 1 --continue-on-error "로그인 화면에 베타 안내 문구를 추가해줘"
```

적용 후에는 직접 diff를 확인하고 커밋합니다.

```powershell
git diff --stat
git diff
git status --short
```

### 4. 실패 후 worker 결과 재사용

worker 계획은 이미 성공했고 apply나 verification에서만 실패한 경우 사용합니다. OpenAI worker 호출을 다시 하지 않아 비용을 줄입니다.

```powershell
cd "D:\개발\whiteboard capture\orchestrator"
& "C:\Program Files\nodejs\npm.cmd" run runner:workflow -- <run-id> --compact --roles mobile --reuse-worker-results --apply-provider openai --apply --rollback-after-verify --concurrency 1 --continue-on-error
```

재사용은 같은 `run-id`, 같은 Git HEAD, 같은 worktree 상태에서만 허용됩니다. worker 결과 생성 이후 commit, 파일 수정, untracked 파일 추가 등이 있으면 안전 가드가 재사용을 차단합니다.

미해결 질문이 운영자가 확인 가능한 수준이고, 임시값이나 계약 변경을 만들지 않는다면 다음 옵션을 추가할 수 있습니다.

```powershell
--approve-open-questions
```

계약 변경은 더 엄격합니다. 실제 계약 변경을 사람이 승인했을 때만 다음 옵션을 사용합니다.

```powershell
--approve-contract-changes
```

## 옵션 선택 기준

| 상황 | 추천 옵션 |
| --- | --- |
| 계획만 보고 싶음 | `runner:plan` |
| 비용 없이 plan 흐름만 점검 | `runner:plan:mock` |
| 실제 적용 전 리허설 | `runner:rehearse` |
| 실제 변경 유지 | `runner:apply` |
| 비용을 줄여 재시도 | `runner:reuse-apply` |
| 출력 줄이기 | `--compact` |
| TPM rate limit 완화 | `--concurrency 1` 또는 `--concurrency 2` |
| 전체 검증까지 수행 | `--verify-all` |
| worker 없이 현재 결과 검증 | `--skip-workers --verify-all` |

## 비용 절감 규칙

좋은 절감 방식:

- 실패 후 같은 `run-id`에서 `--reuse-worker-results`로 재시도
- 같은 Git HEAD와 같은 worktree 상태에서만 `--reuse-worker-results` 사용
- 관련 역할만 `--roles`로 선택
- review-only 역할은 apply하지 않음
- `--compact`로 터미널 출력 축소
- 상세 로그는 `runs/<run-id>/report.md`와 `report.html`에서 확인
- 간단한 plan 흐름 확인은 `runner:plan:mock` 사용
- 전체 mock 파이프라인 확인은 `runner:full:mock` 또는 `ci:dry-run` 사용
- `ci:dry-run`은 타입 체크, doctor, 품질 게이트 smoke, mock full flow를 순서대로 실행
- `runner:workflow:quality-smoke`는 workflow 내부 apply 이후 품질 실패가 exit=1로 차단되고 rollback되는지 확인
- run 산출물이 많이 쌓였는지 확인하려면 `runner:cleanup -- --dry-run --keep-last 3 --keep-days 0`으로 먼저 삭제 예정 목록을 확인

피해야 할 절감 방식:

- 코드가 바뀐 뒤 오래된 worker 결과를 그대로 믿기
- auth/JWT 작업에서 Rust 리뷰를 빼기
- 모바일 영향이 있는 로그인 작업에서 모바일 검토를 임의로 생략하기
- verifier가 확인해야 할 계약 정보를 prompt에서 제거하기
- 검증 실패를 비용 문제로 무시하고 커밋하기

## Final Summary 읽는 법

우선 아래 항목만 보면 됩니다.

```text
Status: succeeded | blocked | failed
Workers: ...
Applied roles: ...
Changed files recorded: ...
Proposed edits: ...
API usage: ...
API cost: ...
Verification: ...
Rollback: ...
Report: ...
HTML report: ...
runner:workflow: exit=...
```

판단 기준:

- `Status: succeeded`와 `runner:workflow: exit=0`이면 흐름은 성공입니다.
- `Status: blocked`는 안전 차단입니다. 질문 또는 계약 변경 내용을 보고 승인 여부를 결정합니다.
- `Status: failed`는 worker, apply, verification, rollback, cleanup 중 하나가 실패한 상태입니다.
- `Rollback: succeeded`이면 테스트 적용으로 생긴 파일 변경은 되돌아간 상태입니다.
- `Verification: recorded`는 worker가 검증 수행 사실을 기록한 상태입니다. 실제 로컬 검증 로그가 필요하면 해당 `.skills` 스크립트를 직접 실행합니다.
- `Next action`은 현재 결과에서 이어갈 추천 행동입니다. 짧은 판단에는 이 항목을 먼저 보고, 자세한 근거는 `report.md` 또는 `report.html`에서 확인합니다.
- 기존 run에서 다음 행동만 다시 확인하려면 `runner:continue -- <run-id>`를 사용합니다. 이 명령은 파일을 수정하지 않습니다.
- `runner:continue`는 blocked, failed, ready-for-apply 상태를 구분하고 `Option A/B/C` 형태로 승인 진행, 새 요청 재계획, 상세 확인 경로를 보여줍니다.
- `API cost`는 OpenAI provider 호출의 추정 비용입니다. `.skills/verify-*.ps1` 자체는 OpenAI API 비용을 만들지 않습니다.
- `Final Summary`의 `API cost`는 짧은 총액 요약만 표시합니다.
- 더 자세한 비용 분해는 `runs/<run-id>/report.md`의 `API Cost Breakdown` 또는 `report.html`의 `Cost by stage and role` 표에서 확인합니다.

## 비용 한도 가드

apply를 실행하기 전에 현재까지의 OpenAI API 추정 비용이 지정한 한도를 넘었는지 확인할 수 있습니다.

```powershell
& "C:\Program Files\nodejs\npm.cmd" run runner:full:rehearse -- --roles frontend --worker-provider openai --apply-provider openai --max-cost-usd 0.10 "요청 내용"
```

또는 환경변수로 기본값을 줄 수 있습니다.

```powershell
$env:RUNNER_MAX_COST_USD="0.10"
& "C:\Program Files\nodejs\npm.cmd" run runner:full:rehearse -- --roles frontend --worker-provider openai --apply-provider openai "요청 내용"
```

주의:

- 비용 한도는 apply 단계 진입 전에 확인합니다.
- worker 호출 자체의 비용을 사전에 완벽히 예측하지는 않습니다.
- 한도를 넘으면 추가 apply를 멈추고 실패 상태로 종료합니다.
- `--rollback-after-verify`를 함께 쓰면 적용 중단 후에도 기존 롤백 흐름이 동작합니다.

## 검증 명령

프로젝트 루트에서 전체 검증:

```powershell
cd "D:\개발\whiteboard capture"
powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ".\.skills\verify-all.ps1"
```

orchestrator 폴더에서 전체 검증:

```powershell
cd "D:\개발\whiteboard capture\orchestrator"
powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "..\.skills\verify-all.ps1"
```

전체 검증은 로컬 빌드와 테스트만 실행하므로 OpenAI API 비용이 없습니다. 다만 Docker, Gradle, Android SDK, Rust build cache 상태에 따라 시간이 오래 걸릴 수 있습니다.

## 운영 체크리스트

- 작업 전 `git status --short`가 깨끗한지 확인
- 먼저 `--rollback-after-verify`로 리허설
- 성공하면 `report.html` 또는 `report.md`에서 risks/questions 확인
- 실제 반영은 `--keep-applied`로 다시 실행하거나, 리허설 결과를 바탕으로 수동 적용
- 적용 후 `.skills/verify-*` 또는 `.skills/verify-all.ps1` 실행
- diff 확인 후 의미 있는 단위로 커밋
- push 전 `git status --short` 확인

## 비용 절감 기본 alias

기본 `runner:full`과 `runner:workflow`의 동작은 유지합니다. 대신 자주 쓰는 저비용/안전 조합은 package script alias로 제공합니다.
운영 기본 alias는 `runner:plan`, `runner:rehearse`, `runner:apply`, `runner:reuse-apply`입니다. 비용 없는 흐름 점검은 `runner:plan:mock`을 사용합니다.
`runner:full:safe`, `runner:full:balanced`, `runner:workflow:*` 계열은 세부 조정이 필요할 때 사용하는 호환/고급 alias입니다.

### 계획과 worker 결과 확인

가장 안전하고 저렴한 기본 실행입니다. 출력은 compact이고 worker는 한 번에 하나씩 실행합니다.

```powershell
& "C:\Program Files\nodejs\npm.cmd" run runner:full:safe -- --roles frontend,java "요청 내용"
```

조금 더 빠르게 실행하고 싶을 때는 동시성을 2로 올린 balanced alias를 사용합니다.

```powershell
& "C:\Program Files\nodejs\npm.cmd" run runner:full:balanced -- --roles frontend,java,rust,mobile "요청 내용"
```

### 적용 리허설

실제 파일에 적용하고 검증한 뒤 자동 롤백합니다. 파이프라인 테스트와 위험도 확인에 사용합니다.

```powershell
& "C:\Program Files\nodejs\npm.cmd" run runner:full:rehearse -- --roles frontend --worker-provider openai --apply-provider openai --continue-on-error "요청 내용"
```

기존 run을 대상으로 리허설할 때는 다음 alias를 사용합니다.

```powershell
& "C:\Program Files\nodejs\npm.cmd" run runner:workflow:rehearse -- <run-id> --roles java --worker-provider openai --apply-provider openai --continue-on-error
```

### 실패 후 재시도

worker 결과가 이미 생성되어 있고 apply 또는 verification만 다시 시도하면 되는 경우 사용합니다.

```powershell
& "C:\Program Files\nodejs\npm.cmd" run runner:workflow:reuse -- <run-id> --roles mobile --apply-provider openai --apply --rollback-after-verify --continue-on-error
```

### alias 선택 기준

| alias | 목적 | 비용 특성 |
| --- | --- | --- |
| `runner:full:safe` | 기본 계획/worker 확인 | 가장 보수적 |
| `runner:full:balanced` | 전체 역할을 조금 빠르게 확인 | 속도와 TPM 균형 |
| `runner:full:rehearse` | 적용 후 검증 및 자동 롤백 | apply 비용 포함 |
| `runner:workflow:safe` | 기존 run을 compact/concurrency 1로 처리 | 재실행 범위 제어 |
| `runner:workflow:balanced` | 기존 run을 compact/concurrency 2로 처리 | 역할이 많을 때 사용 |
| `runner:workflow:rehearse` | 기존 run에서 적용 리허설 | 안전 검증용 |
| `runner:workflow:reuse` | worker 결과 재사용 | 실패 재시도 비용 절감 |

운영 기본값은 `safe`입니다. `balanced`는 요청이 명확하고 rate limit 여유가 있을 때만 사용합니다.
