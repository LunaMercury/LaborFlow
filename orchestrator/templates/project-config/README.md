# Project Config Template

이 디렉터리는 Whiteboard Capture 오케스트레이터를 새 프로젝트에 재사용할 때 사용하는 시작 템플릿입니다.

## 적용 방법

1. 새 프로젝트 루트에 오케스트레이터 공통 파일을 복사합니다.
2. 복사된 `orchestrator` 디렉터리에서 초기화 명령을 실행합니다.

```powershell
& "C:\Program Files\nodejs\npm.cmd" run project:init -- --name "프로젝트 이름" --goal "프로젝트 목표"
```

3. 프로젝트 이름, 목표, 모듈 경로, 환경변수, API/JWT/WebSocket 계약을 실제 값으로 수정합니다.
4. 새 프로젝트의 `AGENTS.md`, 보안 지침, 아키텍처 문서를 `policySources`에 연결합니다.
5. `.skills/verify-*.ps1` 스크립트를 새 프로젝트 구조에 맞게 작성합니다.
6. `runner:plan:mock` 또는 `ci:dry-run`으로 역할 라우팅과 applied templates를 확인합니다.

기존 프로젝트 설정은 기본적으로 덮어쓰지 않습니다. 교체가 필요한 경우 현재 설정을 백업하고 `--force`를 명시적으로 사용합니다.

## 유지할 수 있는 파일

아래 파일은 Java Core, Rust Hot Path, Web, Mobile이라는 공통 개발 방향을 유지한다면 가능한 한 그대로 사용할 수 있습니다.

- `orchestrator/config/base-context.yaml`
- `orchestrator/config/base-templates.yaml`

## 반드시 교체하거나 검토할 파일

- `orchestrator/config/project.yaml`
- `orchestrator/config/project-templates.yaml`

Whiteboard 전용 네이버 OAuth 경로, JWT claim 세부 계약, 이미지 보관 정책 등을 새 프로젝트에 그대로 남기지 않습니다.
