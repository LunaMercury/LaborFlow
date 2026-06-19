# Safe Apply Modes

오케스트레이터는 파일 변경을 안전하게 다루기 위해 적용 모드를 분리합니다.

## Plan Only

파일을 바꾸지 않고 계획과 worker proposed edits만 확인합니다.

```powershell
npm run runner:plan -- --roles frontend "요청 내용"
```

사용 상황:

- 큰 작업 방향을 먼저 보고 싶을 때
- 비용과 역할 분배를 확인하고 싶을 때
- 아직 적용할지 결정하지 않았을 때

## Safe Rehearsal

실제 파일에 적용하고 검증한 뒤 자동 롤백합니다.

```powershell
npm run runner:goal -- --roles frontend "요청 내용"
```

내부적으로는 `--apply --rollback-after-verify` 흐름입니다.

사용 상황:

- 제안이 실제로 빌드/검증을 통과하는지 보고 싶을 때
- 위험한 작업을 먼저 시험하고 싶을 때
- accept 전에 안전 조건을 만족시키고 싶을 때

## Keep Applied

검증된 변경을 실제 작업 트리에 유지합니다.

```powershell
npm run runner:accept
```

또는 명시적으로:

```powershell
npm run runner:apply -- --roles frontend "요청 내용"
```

사용 상황:

- `runner:goal` 리허설이 성공했음
- `runner:quick`에서 결과와 report를 확인했음
- 같은 worker 결과를 실제로 남기기로 결정했음

## 경로 안전 규칙

- worker가 제안한 allowed paths 안의 파일만 적용합니다.
- blocked paths는 명시 승인 옵션으로도 자동 허용하지 않습니다.
- 절대 경로, 빈 경로, `.`/`..` 경로 조각은 거부합니다.
- apply review의 파일 목록과 실제 적용 파일 목록이 일치해야 합니다.
- worker가 `failed`, `pending`, `running`, 일반 `skipped` 상태이면 파일을 적용하지 않습니다.

## 복구

중단된 적용이나 롤백 상태를 점검하려면 `runner:recover`를 사용합니다.

```powershell
npm run runner:recover -- <run-id>
```

`runner:recover`는 역할별 허용 경로 밖의 파일이나 안전하지 않은 경로를 정리하지 않습니다.
