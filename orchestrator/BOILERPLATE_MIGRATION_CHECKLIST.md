# Orchestrator Boilerplate Migration Checklist

이 문서는 현재 오케스트레이터를 새 프로젝트로 옮긴 뒤 반드시 확인해야 할 항목을 정리합니다.

독립 보일러플레이트 repository로 분리하기 전에는 [BOILERPLATE_SPLIT_GUIDE.md](./BOILERPLATE_SPLIT_GUIDE.md)를 함께 확인합니다.

## 1. 프로젝트 기본 정책

- [ ] `AGENTS.md`의 프로젝트 목적과 우선순위가 새 프로젝트와 일치합니다.
- [ ] `agent_role.md`의 역할 설명이 새 프로젝트 팀/모듈 구조와 맞습니다.
- [ ] `system_architecture.md`가 실제 모듈, 배포 구조, 데이터 흐름과 맞습니다.
- [ ] `security_guidelines.md`가 인증, 토큰, 스토리지, 네트워크 보안 정책과 충돌하지 않습니다.
- [ ] Whiteboard 전용 문구, 칠판 사진, 100개 제한, 네이버 OAuth 같은 제품 고유 내용이 남아 있지 않습니다.

## 2. 오케스트레이터 설정

- [ ] `orchestrator/config/project.yaml`의 `name`, `goal`, `priorities`를 새 프로젝트 기준으로 수정했습니다.
- [ ] `orchestrator/config/project.yaml`의 `modules` 경로가 실제 폴더 구조와 일치합니다.
- [ ] 각 role의 `allowedPaths`와 `blockedPaths`가 실제 코드베이스 기준으로 안전합니다.
- [ ] `orchestrator/config/project.yaml`의 `contracts`에 API, JWT, DB, WebSocket, storage, cloud 환경변수 계약을 명시했습니다.
- [ ] `orchestrator/config/project-templates.yaml`의 `auth`, `design`, `redis`, `realtime` 정책을 새 프로젝트 구조에 맞게 조정했습니다.
- [ ] 새 프로젝트에 없는 모듈은 `project.yaml`과 검증 스크립트에서 제거하거나 `skip/review` 정책을 명확히 했습니다.
- [ ] 공통 보일러 정책과 제품 전용 정책의 경계를 정했습니다.

## 3. 검증 스크립트

- [ ] `.skills/verify-web.ps1`이 실제 web 빌드/테스트 명령과 일치합니다.
- [ ] `.skills/verify-core.ps1`이 실제 Java/Spring 검증 명령과 JDK 버전을 반영합니다.
- [ ] `.skills/verify-fast.ps1`이 실제 Rust hot path 검증 명령과 일치합니다.
- [ ] `.skills/verify-mobile.ps1`이 실제 Android SDK/JDK/Gradle 환경과 맞습니다.
- [ ] `.skills/verify-orchestrator.ps1`이 새 프로젝트의 orchestrator 위치와 명령을 사용합니다.
- [ ] `.skills/verify-all.ps1`이 필요한 검증만 올바른 순서로 실행합니다.
- [ ] 모바일 검증이 필요하면 `ANDROID_HOME` 또는 `mobile/local.properties`의 `sdk.dir`가 실제 SDK 경로를 가리킵니다.

## 4. 보안과 비밀값

- [ ] `.env`, `.env.local`, secret 파일이 패키징 결과나 Git에 포함되지 않습니다.
- [ ] OpenAI API key, OAuth client secret, DB password, JWT secret은 새 프로젝트의 secret manager 또는 로컬 `.env`에서만 다룹니다.
- [ ] 프론트엔드에 provider client secret, access token, private API key가 노출되지 않습니다.
- [ ] JWT claim 구조, signing algorithm, secret env 이름을 관련 모듈이 동일하게 이해합니다.
- [ ] HTTPS/WSS, CORS, allowed origin, mobile cleartext policy가 환경별로 분리되어 있습니다.
- [ ] 개인정보, 로그, 파일 업로드, 데이터 보관/삭제 정책을 새 프로젝트 기준으로 문서화했습니다.

## 5. 패키징 직후 첫 실행 순서

새 프로젝트로 옮긴 직후에는 아래 순서로 진행합니다.

```powershell
cd "D:\개발\<new-project>\orchestrator"
& "C:\Program Files\nodejs\npm.cmd" install
& "C:\Program Files\nodejs\npm.cmd" run project:init -- --name "<project name>" --goal "<project goal>" --force
& "C:\Program Files\nodejs\npm.cmd" run runner:readiness:strict
& "C:\Program Files\nodejs\npm.cmd" run runner:docs-encoding -- --compact
& "C:\Program Files\nodejs\npm.cmd" run ci:dry-run
```

그 다음 실제 작은 작업으로 리허설합니다.

```powershell
& "C:\Program Files\nodejs\npm.cmd" run runner:goal -- --roles <role> "작은 기능 요청"
& "C:\Program Files\nodejs\npm.cmd" run runner:quick
```

결과가 마음에 들면 실제로 유지합니다.

```powershell
& "C:\Program Files\nodejs\npm.cmd" run runner:accept
```

## 6. 완료 기준

- [ ] `npm run runner:readiness:strict`가 통과합니다.
- [ ] `npm run runner:docs-encoding -- --compact`가 통과합니다.
- [ ] `npm run ci:dry-run`이 통과합니다.
- [ ] `.skills/verify-all.ps1`이 새 프로젝트 환경에서 통과합니다.
- [ ] 최소 1개 구현 role에서 `runner:goal` 리허설이 성공하고 rollback됩니다.
- [ ] 최소 1개 review-only role에서 worker 결과가 합리적인 `skipped` 또는 `succeeded` 상태로 수집됩니다.
- [ ] `report.md`, `report.html`, `runs/index.html`이 생성되고 열람 가능합니다.
- [ ] `runner:quick`이 최신 run 상태와 다음 행동을 정확히 안내합니다.
- [ ] `runner:accept`는 성공한 리허설 이후에만 실행 가능합니다.
- [ ] 새 프로젝트에서 반드시 바꿔야 할 Whiteboard 전용 문구가 남아 있지 않습니다.
- [ ] 독립 보일러플레이트 repository로 분리하는 경우, `PIPELINE_STATUS.md`와 `runs/` 같은 실행 산출물이 포함되지 않습니다.

## 7. 복사 리허설 기준 체크

새 프로젝트로 옮기기 전에 실제 임시 폴더에 복사해 아래 항목을 확인합니다.

```powershell
cd "D:\개발\whiteboard capture\orchestrator"
& "C:\Program Files\nodejs\npm.cmd" run project:rehearse-package
```

수동 검증이 필요하면 명시적인 대상 폴더를 사용합니다.

```powershell
cd "D:\개발\whiteboard capture\orchestrator"
& "C:\Program Files\nodejs\npm.cmd" run project:package -- --target "D:\개발\boilerplate-test\sample-project-1" --name "Sample Project 1" --goal "Reusable orchestrator boilerplate rehearsal" --force
& "C:\Program Files\nodejs\npm.cmd" run project:validate-package -- --target "D:\개발\boilerplate-test\sample-project-1"

cd "D:\개발\boilerplate-test\sample-project-1\orchestrator"
& "C:\Program Files\nodejs\npm.cmd" install
& "C:\Program Files\nodejs\npm.cmd" run runner:readiness:strict
& "C:\Program Files\nodejs\npm.cmd" run ci:dry-run
```

복사 직후 확인:

- [ ] 루트 `.gitignore`가 생성되었습니다.
- [ ] 루트 `초기설정.txt`가 생성되었습니다.
- [ ] `orchestrator/package.json`이 생성되었습니다.
- [ ] `orchestrator/package-lock.json`이 생성되었습니다.
- [ ] `orchestrator/src/`가 생성되었습니다.
- [ ] `orchestrator/config/project.yaml`이 생성되었습니다.
- [ ] `orchestrator/config/project-templates.yaml`이 생성되었습니다.
- [ ] `orchestrator/OPERATIONS_GUIDE.md`가 생성되었습니다.
- [ ] `orchestrator/BOILERPLATE_SPLIT_GUIDE.md`가 생성되었습니다.
- [ ] `orchestrator/BOILERPLATE_MIGRATION_CHECKLIST.md`가 생성되었습니다.
- [ ] `.skills/verify-all.ps1`이 생성되었습니다.
- [ ] 루트 `AGENTS.md`가 생성되었습니다.
- [ ] 루트 `security_guidelines.md`가 생성되었습니다.
- [ ] `orchestrator/PIPELINE_STATUS.md`는 복사되지 않았습니다.
- [ ] `orchestrator/runs/`는 복사되지 않았습니다.
- [ ] `.env`와 `.env.local`은 복사되지 않았습니다.

## 8. 필수 alias 확인

- [ ] `runner:goal`
- [ ] `runner:quick`
- [ ] `runner:accept`
- [ ] `runner:readiness:strict`
- [ ] `runner:plan`
- [ ] `runner:plan:mock`
- [ ] `runner:goal:budget`
- [ ] `runner:reuse-apply`
- [ ] `runner:quality`
- [ ] `runner:quality:smoke`
- [ ] `runner:workflow:quality-smoke`
- [ ] `runner:accept-guard:smoke`
- [ ] `runner:accept-unlock:smoke`
- [ ] `runner:docs-encoding`
- [ ] `runner:docs-encoding:smoke`
- [ ] `project:package`
- [ ] `project:rehearse-package`
- [ ] `project:validate-package`

## 9. 복사본 검증 기준

- [ ] 원본 orchestrator에서 `npm run project:validate-package -- --target "<target>"`가 성공합니다.
- [ ] 복사본에서 `npm install`이 성공합니다.
- [ ] `npm audit` 결과에 치명적인 취약점이 없습니다.
- [ ] 복사본에서 `npm run runner:readiness:strict`가 성공합니다.
- [ ] 복사본에서 `npm run runner:docs-encoding -- --compact`가 성공합니다.
- [ ] 복사본에서 `npm run ci:dry-run`이 성공합니다.
- [ ] `ci:dry-run`의 `API cost`가 `$0.0000`입니다.
- [ ] `ci:dry-run`의 `Status`가 `succeeded`입니다.
- [ ] `ci:dry-run`에서 `runner:workflow: exit=0`이 출력됩니다.
- [ ] `project:validate-package`가 `node_modules` 또는 `runs` 경고를 출력하더라도, 이는 `npm install` 또는 `ci:dry-run` 이후의 런타임 산출물이므로 실패로 보지 않습니다.

## 10. 새 프로젝트에서 반드시 바꿀 것

- [ ] 루트 `초기설정.txt`를 읽고 초기 실행 순서를 확인
- [ ] 루트 `AGENTS.md`의 프로젝트 목적과 우선순위
- [ ] 루트 `agent_role.md`의 역할 설명
- [ ] 루트 `security_guidelines.md`의 보안 정책
- [ ] 루트 `system_architecture.md`의 실제 아키텍처
- [ ] `orchestrator/config/project.yaml`의 모듈 이름, 경로, 계약
- [ ] `orchestrator/config/project-templates.yaml`의 category 참여 정책
- [ ] `.skills/verify-*.ps1`의 실제 빌드/테스트 명령
- [ ] 배포 도메인, secret 주입 방식, 운영 URL 계약

## 11. 최종 완료 기준

- [ ] 새 프로젝트 복사본에서 mock/test provider 기반 dry-run이 API 비용 없이 동작합니다.
- [ ] 새 프로젝트 전용 정책 문서와 검증 스크립트가 현재 코드베이스와 일치합니다.
- [ ] 첫 실제 기능 리허설은 `runner:goal`로 실행하고 성공 기록을 남겼습니다.
- [ ] 첫 실제 기능 적용은 `runner:quick`으로 확인한 뒤 `runner:accept`로 유지하고 커밋했습니다.
