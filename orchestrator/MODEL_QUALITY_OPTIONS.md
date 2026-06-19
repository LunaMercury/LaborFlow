# Model Quality Options

오케스트레이터는 기본적으로 비용과 안정성의 균형을 우선합니다. 다만 판단 난도가 높은 요청에서는 worker/apply 모델과 reasoning 강도를 명령어로 올릴 수 있습니다.

## 기본 원칙

- `worker`는 파일을 직접 수정하지 않고 `proposedEdits`를 만듭니다.
- `apply`는 승인된 `proposedEdits`를 실제 파일 변경으로 변환합니다.
- worker 모델과 apply 모델은 따로 지정할 수 있습니다.
- reasoning 옵션을 지원하지 않는 모델에는 reasoning 옵션을 보내지 않습니다.
- 신뢰도가 비용 절감보다 우선입니다.

## CLI 옵션

```powershell
--worker-model <model>
--apply-model <model>
--worker-reasoning minimal|low|medium|high|none
--apply-reasoning minimal|low|medium|high|none
```

## 환경변수

```text
OPENAI_WORKER_MODEL
OPENAI_APPLY_MODEL
OPENAI_WORKER_REASONING
OPENAI_APPLY_REASONING
OPENAI_FORCE_REASONING
```

`OPENAI_APPLY_MODEL`이 없으면 `OPENAI_WORKER_MODEL`을 사용합니다.

`OPENAI_APPLY_REASONING`이 없으면 `OPENAI_WORKER_REASONING`을 사용합니다.

## 추천 사용

가벼운 UI 문구/스타일 변경:

```powershell
& "C:\Program Files\nodejs\npm.cmd" run runner:goal -- --roles frontend "로그인 화면 문구를 정리해줘"
```

보안, 인증, JWT, OAuth, 인프라 계약 변경:

```powershell
& "C:\Program Files\nodejs\npm.cmd" run runner:goal -- --roles java,rust --worker-reasoning high --apply-reasoning medium "JWT 계약을 점검하고 필요한 변경을 반영해줘"
```

비용 절감이 중요한 계획 확인:

```powershell
& "C:\Program Files\nodejs\npm.cmd" run runner:plan:budget -- --roles frontend "작은 UI 개선안을 검토해줘"
```

## 비용 표시

`Final Summary`, `report.md`, `report.html`, `runs/index.html`에는 API 사용량과 추정 비용이 표시됩니다.

기본 가격표에 없는 모델은 아래 환경변수로 1M token당 가격을 지정할 수 있습니다.

```powershell
$env:OPENAI_MODEL_PRICING_JSON='{"gpt-4.1":{"input":2,"output":8}}'
```

비용은 `input_tokens`와 `output_tokens`를 각 모델의 입력/출력 단가로 계산합니다. 따라서 `total_tokens`만으로는 정확한 비용을 알 수 없습니다.

## 주의

- reasoning 강도를 올리면 품질이 좋아질 수 있지만 토큰 사용량과 비용도 증가할 수 있습니다.
- 작은 작업에 항상 high reasoning을 쓰는 것은 권장하지 않습니다.
- 모델이 capacity 상태이면 같은 명령을 잠시 후 재시도하거나 다른 모델을 지정합니다.
