# Apply Review Gates

`runner:workflow`와 `runner:full`은 worker 제안을 실제 파일에 적용하기 전에 apply review를 실행합니다.

## 기본 차단 조건

아래 조건은 기본적으로 apply를 중단합니다.

- worker가 `contractsChanged`를 보고한 경우
- worker가 미해결 `questions`를 보고한 경우
- dependency 또는 build manifest 변경이 포함된 경우
- 허용 경로 밖의 파일을 수정하려는 경우
- 차단 경로를 수정하려는 경우
- 역할별 필수 검증 스크립트가 없는 경우
- proposed edits가 worker의 allowed paths와 맞지 않는 경우

## 명시적 승인 옵션

계약 변경 내용을 사람이 검토했고 의도적으로 진행하려면 아래 옵션을 사용합니다.

```text
--approve-contract-changes
```

미해결 질문을 사람이 확인했고 현재 범위에서 진행해도 안전하면 아래 옵션을 사용합니다.

```text
--approve-open-questions
```

두 옵션은 의미가 다르므로 필요한 경우에만 각각 사용합니다.

## 계속 차단되는 항목

명시 승인 옵션이 있어도 아래 항목은 자동 허용하지 않습니다.

- blocked path 침범
- dependency/build manifest 변경
- unsafe path traversal
- worker result가 `failed`, `pending`, `running`인 경우
- apply 대상 파일과 실제 적용 파일 목록 불일치

## 운영 기준

- `blocked`는 실패가 아니라 안전 게이트가 작동한 상태입니다.
- 계약 변경이 실제로 필요하면 새 요청에서 계약 변경 자체를 명확히 다룹니다.
- 질문이 많이 남는 run은 계속 승인하기보다 요청을 다시 작성하는 편이 안전합니다.
- `runner:quick` 또는 `runner:continue`의 Option C는 이럴 때 사용하는 재계획 경로입니다.
