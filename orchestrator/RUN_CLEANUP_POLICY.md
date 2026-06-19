# Run Cleanup Policy

`orchestrator/runs/` 아래에는 worker prompt, result, verification log, diff snapshot, report가 쌓입니다.

`runner:workflow`와 `runner:full`은 실행 종료 후 오래된 run 기록을 자동 정리할 수 있습니다.

## 기본 보존 정책

- 최근 10개 run은 보존합니다.
- 최근 7일 이내 run은 보존합니다.
- 현재 실행 중인 run은 항상 보존합니다.
- 위 조건에 모두 해당하지 않는 오래된 run만 삭제 대상입니다.

환경변수로 기본값을 바꿀 수 있습니다.

```text
RUNNER_CLEANUP_KEEP_LAST=10
RUNNER_CLEANUP_KEEP_DAYS=7
RUNNER_AUTO_CLEANUP=true
RUNNER_CLEANUP_INCLUDE_TRACKED=false
```

## 수동 점검

삭제 대상을 확인만 하려면 dry-run을 사용합니다.

```powershell
npm run runner:cleanup -- --dry-run
```

workflow에서 자동 정리를 dry-run 모드로 실행하려면 아래 옵션을 추가합니다.

```text
--cleanup-dry-run
```

특정 실행에서 자동 정리를 생략하려면 아래 옵션을 사용합니다.

```text
--skip-cleanup
```

## tracked run 보호

Git에 이미 추적된 run artifact는 기본적으로 삭제하지 않습니다.

tracked run까지 의도적으로 정리하려면 별도 cleanup 커밋으로 계획하고 아래 옵션을 사용합니다.

```text
--include-tracked
```

## 안전 규칙

- `run-YYYY-...` 형식의 `runs/` 하위 디렉터리만 정리합니다.
- 심볼릭 링크는 `runs/` 바깥 경로를 삭제하지 않습니다.
- workflow는 현재 run id를 cleanup 보호 대상으로 전달합니다.
- 삭제 전 영향 범위가 걱정되면 항상 `--dry-run`부터 실행합니다.
