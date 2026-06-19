# Orchestrator Runner Workflow

이 문서는 Whiteboard Capture 오케스트레이터의 표준 실행 흐름을 정리합니다.

## 핵심 원칙

- 기본 실행은 파일을 바꾸지 않습니다.
- 실제 파일 변경은 `--apply`가 있을 때만 발생합니다.
- 안전 리허설은 `--rollback-after-verify`로 적용, 검증, 롤백까지 수행합니다.
- 실제 적용은 성공한 리허설 이후 `runner:accept` 또는 `--keep-applied`로 명시합니다.
- 계약 변경, 미해결 질문, 차단 경로, dependency/build manifest 변경은 apply review에서 기본 차단합니다.
- post-apply 품질 게이트는 placeholder, 죽은 코드, inline style, TODO/HACK 같은 위험 신호를 검사합니다.
- 중요한 live 작업 전에는 `runner:readiness:strict`를 먼저 실행합니다.

## 가장 짧은 실사용 흐름

```powershell
cd "D:\개발\whiteboard capture\orchestrator"
& "C:\Program Files\nodejs\npm.cmd" run runner:goal -- --roles frontend "요청 내용"
& "C:\Program Files\nodejs\npm.cmd" run runner:quick
& "C:\Program Files\nodejs\npm.cmd" run runner:accept
```

의미:

1. `runner:goal`: worker/apply/verify/quality/rollback 리허설
2. `runner:quick`: 최신 run 상태와 A/B/C 선택지 확인
3. `runner:accept`: 같은 worker 결과를 실제 keep-applied로 유지

## 중요한 작업 흐름

인증, 보안, 배포, 환경변수, 데이터 삭제 정책처럼 영향이 큰 작업은 사전 점검을 먼저 실행합니다.

```powershell
cd "D:\개발\whiteboard capture\orchestrator"
& "C:\Program Files\nodejs\npm.cmd" run runner:readiness:strict
& "C:\Program Files\nodejs\npm.cmd" run runner:goal -- --roles frontend,java,rust,mobile "요청 내용"
& "C:\Program Files\nodejs\npm.cmd" run runner:quick
& "C:\Program Files\nodejs\npm.cmd" run runner:accept
```

## 계획만 확인

방향성만 보고 싶거나 큰 작업을 쪼개기 전에는 `runner:plan`을 사용합니다.

```powershell
cd "D:\개발\whiteboard capture\orchestrator"
& "C:\Program Files\nodejs\npm.cmd" run runner:plan -- --roles frontend,java,rust,mobile "요청 내용"
```

`runner:plan`은 파일을 적용하지 않습니다. 제안이 마음에 들면 `runner:goal`로 안전 리허설을 다시 실행합니다.

비용 없이 흐름만 확인하려면 mock/test provider를 사용합니다.

```powershell
& "C:\Program Files\nodejs\npm.cmd" run runner:plan:mock -- --roles frontend,java "요청 내용"
```

## 기존 run 이어가기

특정 run의 다음 선택지를 다시 보고 싶으면 `runner:continue`를 사용합니다.

```powershell
& "C:\Program Files\nodejs\npm.cmd" run runner:continue -- <run-id>
```

짧은 출력:

```powershell
& "C:\Program Files\nodejs\npm.cmd" run runner:continue:compact -- <run-id>
```

선택지:

- Option A: 안전 리허설, rollback
- Option B: 같은 proposed edits를 실제 유지
- Option C: 현재 run 폐기, 새 요청 추천

실행 예:

```powershell
& "C:\Program Files\nodejs\npm.cmd" run runner:continue:a:execute -- <run-id>
& "C:\Program Files\nodejs\npm.cmd" run runner:continue:b:execute -- <run-id>
```

## 결과 재사용

worker 결과가 이미 있고 apply 또는 verification만 다시 시도하면 되는 경우 `--reuse-worker-results`를 사용합니다.

```powershell
& "C:\Program Files\nodejs\npm.cmd" run runner:workflow -- <run-id> --compact --roles mobile --reuse-worker-results --apply-provider openai --apply --rollback-after-verify --concurrency 1 --continue-on-error
```

재사용 가드:

- 같은 run id
- 같은 Git HEAD
- 같은 worktree 상태
- 안전한 proposed edit 경로
- 계약 변경/미해결 질문은 명시 승인 필요

## 전체 검증

역할별 검증만으로 부족할 때는 `--verify-all`을 사용합니다.

```powershell
& "C:\Program Files\nodejs\npm.cmd" run runner:workflow -- <run-id> --roles java --apply --rollback-after-verify --verify-all
```

주의:

- `verify-all`은 Web, Rust, Java, Android, orchestrator 검증을 모두 실행하므로 오래 걸릴 수 있습니다.
- OpenAI API 비용은 없지만 로컬 빌드 시간이 필요합니다.

## 실패 상태 읽기

- `succeeded`: 선택한 흐름이 성공했습니다.
- `blocked`: 안전 게이트가 중단했습니다. 질문/계약 변경을 검토해야 합니다.
- `failed`: worker, apply, verification, quality gate, rollback, cleanup 중 하나가 실패했습니다.

마지막 `Final Summary`와 `report.html`을 먼저 확인합니다.

## 권장 운영 습관

- 작업 전 `git status --short`를 확인합니다.
- 중요한 작업 전 `runner:readiness:strict`를 실행합니다.
- 먼저 `runner:goal`로 rollback 리허설을 통과시킵니다.
- 결과가 마음에 들 때만 `runner:accept`를 사용합니다.
- 적용 후 diff를 확인하고 의미 있는 단위로 커밋합니다.
