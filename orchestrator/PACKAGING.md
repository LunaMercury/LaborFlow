# Orchestrator Packaging

이 문서는 현재 오케스트레이터를 다른 프로젝트에서 재사용할 수 있는 패키지 형태로 복사하는 방법을 정리합니다.

## 목적

`project:package`는 대상 프로젝트 루트에 다음 항목을 생성합니다.

- `orchestrator/`: manager, worker, apply, verify, rollback, report 파이프라인 코드
- `.skills/`: Web, Java, Rust, Mobile, Orchestrator 검증 스크립트 시작 템플릿
- `AGENTS.md`, `agent_role.md`, `security_guidelines.md`, `system_architecture.md`: 기본 정책 문서 템플릿
- `orchestrator/config/project.yaml`, `orchestrator/config/project-templates.yaml`: 프로젝트별 설정 시작 템플릿
- `orchestrator/BOILERPLATE_MIGRATION_CHECKLIST.md`: 새 프로젝트 이식 점검 체크리스트
- `orchestrator/BOILERPLATE_SPLIT_GUIDE.md`: 독립 보일러플레이트 repository로 분리할 때의 기준

## 기본 사용법

먼저 dry-run으로 생성될 파일과 충돌 여부를 확인합니다.

```powershell
cd "D:\개발\whiteboard capture\orchestrator"
& "C:\Program Files\nodejs\npm.cmd" run project:package -- --target "D:\개발\new-project" --name "New Project" --goal "Describe the product outcome" --dry-run
```

문제가 없으면 실제로 생성합니다.

```powershell
& "C:\Program Files\nodejs\npm.cmd" run project:package -- --target "D:\개발\new-project" --name "New Project" --goal "Describe the product outcome"
```

## 복사 리허설

보일러플레이트 복사가 가능한지 빠르게 확인하려면 임시 폴더에 패키징하고 `project:validate-package`까지 자동 실행합니다.

OpenAI API를 호출하지 않으며, 기본 실행 후 임시 폴더를 삭제합니다.

기본 리허설 경로는 `D:\개발\boilerplate-test\orchestrator-package-rehearsal-*`입니다.

다른 위치를 사용하려면 `--target`을 지정하거나 `ORCHESTRATOR_REHEARSAL_ROOT` 환경변수를 설정합니다.

```powershell
cd "D:\개발\whiteboard capture\orchestrator"
& "C:\Program Files\nodejs\npm.cmd" run project:rehearse-package
```

생성된 임시 폴더를 보존하고 싶다면 `--keep`을 사용합니다.

```powershell
& "C:\Program Files\nodejs\npm.cmd" run project:rehearse-package -- --keep
```

## 패키지 검증

`project:validate-package`는 **패키징된 복사본**을 검증하는 명령입니다. 원본 Whiteboard 프로젝트에 직접 실행하면 `.env`나 `orchestrator/PIPELINE_STATUS.md` 같은 원본 전용 파일 때문에 실패하는 것이 정상입니다.

올바른 사용 예:

```powershell
cd "D:\개발\whiteboard capture\orchestrator"
& "C:\Program Files\nodejs\npm.cmd" run project:validate-package -- --target "D:\개발\new-project"
```

원본 프로젝트의 오케스트레이터 상태를 확인하려면 아래 명령을 사용합니다.

```powershell
& "C:\Program Files\nodejs\npm.cmd" run runner:doctor -- --compact
& "C:\Program Files\nodejs\npm.cmd" run ci:dry-run
```

## 안전장치

- 현재 프로젝트 루트에는 패키징하지 않습니다.
- 현재 `orchestrator/` 내부 또는 하위 폴더에는 패키징하지 않습니다.
- 기존 파일은 기본적으로 덮어쓰지 않습니다.
- 덮어쓰기가 필요하면 대상 프로젝트를 검토한 뒤 `--force`를 명시적으로 사용합니다.
- `.env`, `.env.local`, `node_modules`, `dist`, `runs`, 현재 프로젝트의 `PIPELINE_STATUS.md`는 복사하지 않습니다.

## 대상 프로젝트에서 다음에 할 일

```powershell
cd "D:\개발\new-project\orchestrator"
& "C:\Program Files\nodejs\npm.cmd" install
& "C:\Program Files\nodejs\npm.cmd" run project:init -- --name "New Project" --goal "Describe the product outcome" --force
```

그 다음 [BOILERPLATE_MIGRATION_CHECKLIST.md](./BOILERPLATE_MIGRATION_CHECKLIST.md)를 따라 아래 파일을 새 프로젝트 실제 구조에 맞게 검토합니다.

- `AGENTS.md`
- `agent_role.md`
- `security_guidelines.md`
- `system_architecture.md`
- `.skills/verify-*.ps1`
- `orchestrator/config/project.yaml`
- `orchestrator/config/project-templates.yaml`

독립 보일러플레이트 repository로 분리하려면 [BOILERPLATE_SPLIT_GUIDE.md](./BOILERPLATE_SPLIT_GUIDE.md)를 함께 확인합니다.

## 첫 검증 순서

새 프로젝트로 옮긴 직후에는 아래 순서로 검증합니다.

1. `npm run project:validate-package -- --target "<target>"`
2. 대상 프로젝트에서 `npm install`
3. 대상 프로젝트에서 `npm run runner:readiness:strict`
4. 대상 프로젝트에서 `npm run ci:dry-run`
5. 작은 구현 역할 하나로 `--rollback-after-verify` 리허설
6. review-only 역할 하나로 worker 결과 요약 확인
7. 문제가 없으면 작은 변경 하나를 `runner:goal -> runner:quick -> runner:accept` 흐름으로 실제 적용 후 커밋
