# Worker Source Context

OpenAI API worker는 로컬 파일 시스템을 직접 읽을 수 없습니다. 오케스트레이터는 역할별 source preview를 제한된 크기로 worker prompt에 포함합니다.

## 선택 순서

source preview는 아래 순서로 선택합니다.

1. specialist plan의 `touchedAreas`
2. touched source에서 참조하는 같은 모듈의 파일
3. 같은 모듈의 나머지 텍스트 소스

## 제외 대상

아래 항목은 source preview에서 제외합니다.

- `.env`, `.env.local`
- `local.properties`
- `.git`, `.gradle`, `.gradle-user-home`, `.idea`
- `bin`, `build`, `dist`, `node_modules`, `target`

## 기본 용량 제한

- 전체 source preview: `32 KiB`
- 파일별 source preview: `12 KiB`

필요하면 환경변수로 조정할 수 있습니다.

```text
WORKER_SOURCE_CONTEXT_TOTAL_BYTES
WORKER_SOURCE_CONTEXT_FILE_BYTES
```

## 운영 기준

- source preview는 worker가 현재 코드 상태를 이해하기 위한 보조 context입니다.
- 계약 문서, task packet, allowed/blocked paths가 더 우선합니다.
- worker가 source preview만 보고 계약을 바꾸려 하면 `contractsChanged`로 보고해야 합니다.
- 오래된 run의 source preview를 다른 프로젝트에 재사용하지 않습니다.
