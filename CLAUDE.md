# CLAUDE.md

이 파일은 Claude Code(claude.ai/code)가 이 저장소에서 작업할 때 참고하는 가이드입니다.

## 개요

OpenCode는 **클라이언트/서버 아키텍처**를 가진 AI 코딩 에이전트입니다. 핵심 CLI 서버는 여러 프론트엔드(TUI, 데스크톱 앱, 향후 모바일 앱 등)에서 구동될 수 있습니다.

**요구사항**:
- Bun 1.3.0 (패키지 매니저)
- Golang 1.24.x

**빠른 시작**:
```bash
bun install
bun dev      # packages/opencode/src/index.ts 실행
```

## ⚠️ 제외 사항

**다음 패키지들은 작업 범위에서 제외됩니다:**
- `packages/console/app` - 웹 콘솔 (사용하지 않음)
- `packages/console/core` - 콘솔 백엔드 (사용하지 않음)
- `packages/console/*` - 모든 콘솔 관련 패키지
- `infra/console.ts` - 콘솔 인프라 설정

이 패키지들은 읽기, 수정, 참조하지 마세요.

## 저장소 구조

이 저장소는 모노레포입니다. 각 패키지는 상세한 설명이 담긴 CLAUDE.md를 가지고 있습니다:

### 핵심 패키지

- **[packages/opencode](packages/opencode/CLAUDE.md)** - 메인 CLI 서버 및 핵심 로직
  - 에이전트 시스템, 프로바이더 관리, 툴 시스템
  - 설정, LSP/MCP 통합, 프로젝트 관리

- **[packages/sdk/js](packages/sdk/js/CLAUDE.md)** - OpenCode API용 JavaScript SDK
  - 클라이언트/서버 export, OpenAPI spec에서 생성됨

- **[packages/plugin](packages/plugin/CLAUDE.md)** - 플러그인 SDK
  - 커스텀 OpenCode 플러그인 제작용

### 프론트엔드 패키지

- **[packages/desktop](packages/desktop/CLAUDE.md)** - 데스크톱 애플리케이션
  - Vite + SolidJS, @opencode-ai/sdk 사용

- **[packages/web](packages/web/CLAUDE.md)** - 마케팅 웹사이트
  - Astro 기반

### 기타 패키지

- `packages/function` - 함수 유틸리티
- `packages/identity` - 인증/ID 유틸리티

## 실행 방법

### 1. TUI 모드 (터미널 UI - 가장 안정적, 권장)
```bash
# 프로젝트 루트에서
bun packages/opencode/src/index.ts

# 또는
cd packages/opencode
bun src/index.ts
```

### 2. 데스크톱 앱 (웹 UI)
**CLI 서버**와 **데스크톱 앱**을 각각 실행해야 합니다.

**터미널 1 - CLI 서버:**
```bash
cd packages/opencode
bun dev serve --port 4096
```

**터미널 2 - 데스크톱 앱:**
```bash
cd packages/desktop
bun dev
```

그 다음 브라우저에서 http://localhost:3000 접속

### 3. CLI 모드 (일회성 질문)
```bash
cd packages/opencode
bun src/index.ts run "your question here"
```

### 4. 사용 가능한 모델 확인
```bash
cd packages/opencode
bun src/index.ts models
```

### 프로세스 종료
```bash
pkill -f "bun dev"
```

## 주요 개발 명령어

```bash
# 타입 체크
bun typecheck                # 전체 패키지 타입 체크
bun turbo typecheck          # turbo로 타입 체크

# 테스트
cd packages/opencode && bun test

# 빌드
cd packages/opencode && bun run build
cd packages/desktop && bun run build
cd packages/console/app && bun run build
```

## 특정 컴포넌트 작업 시

특정 패키지에서 작업할 때는 **해당 패키지의 CLAUDE.md를 반드시 참조**하세요. 각 컴포넌트별 상세한 설명, 아키텍처, 패턴이 담겨 있습니다.

## 인프라

SST(sst.config.ts)를 사용한 배포:
- Cloudflare를 주요 플랫폼으로 사용
- 스테이지 기반 환경
- `infra/` 디렉토리에 인프라 코드

## IMPORTANT (공통)
- 너는 20년차 **매우 숙련**된 프로그래머야. 20년차다운 코드품질을 보여줘.
- **가장 짧고, 심플하고, 우아한 대책**만을 내어놓을 것. 예외가 발생할 수 있는 여지 자체를 줄이는 쪽으로 알고리즘을 설계하여야 하고, 예외처리가 개발을 Driven하지 않게 할 것 
- 항상 **테스트, 린트, 문법에러 체크, 품질 평가**를 한 다음에야 종료할 것.
- 모든 경우에 **TDD**: 테스트 케이스는 테스트 시나리오가 무엇인지 사람이 코드를 꼼꼼히 따라가지 않아도 알 수 있도록 만들어야 함. 테스트 실패를 확인하고 시작할 것
- 사이드 이펙트에 유의할 것. 구현을 위해 필요최소한만 고쳐야 함.
- 항상 **한글**로 최종 대답을 형성하고, 마지막에 현재 시간을 확인하여 "최종: YYMMDD HH:MM"를 표시하여 줄 것.
- 구현은 최적으로 해도 되지만, 비지니스 로직이 전체의 실행에 무리를 주는 경우라면, 반드시 사용자에게 알려주고, 그 대안을 알려줘야 하는 문제이지, **절대** 허가없이 추가, 변경, 삭제하지 말 것.
- **Plan Mode**에서는 1. 기능, 2. 제공 함수, 3. 함수의 입출력 데이터 등 데이터 흐름, 4. 예상되는 결과물 등을 중심으로 내어놓고, 구체적 구현 코드를 내어놓지 말 것.
- **Edit Mode**에서는 플랜 모드에서 짠 것들을 항상 코드 전단에 주석화해서 남겨두고, 항상 먼저 짠 코드 중 비슷한 코드가 있는지 살펴본 다음, 이러한 코드와 같은 구현을 유지할 것. 이러한 기능이 반드시 모두 구현되고, 오류 없이 작동하며, 테스트를 통과했을 때에만 중단할 것.
- 문제가 단순히 추측하지 말고 문제를 정확히 파악하여야 하고, 절대 추측을 근거로 문제가 있다는 결론을 속단하면 안 됨.
- 지시사항으로 불충분할 때에는 추측하지 말고 사용자에게 물어볼 것. 꼼꼼하게 물어보고, 그 물어본 것에 대한 사용자의 대답은 반드시 지킬 것
- 마무리하면서는 지금까지 구현을 위해 코딩하면서 부차적으로 문제가 발견된 것이 있다면 반드시 지적할 것. 다만 현재 구현은 반드시 에러없이 하되, 부차적인 문제까지 해결하기 위해 코드를 수정하지는 말 것.
- **의존성이 발견되지 않는다고 그 의존성없이 해보겠다고 삽질하지 말것**. 의존성 다시 깔지 말고 있는 것을 고치거나 추가로 필요한 것만 허가를 받아서 설치할 것.  
- 생각은 영어로 하든 한글로 하든 무방하나, **최종 결과**는 한글로 알려줄 것.

