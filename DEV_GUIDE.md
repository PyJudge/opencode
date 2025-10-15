# OpenCode Developer Guide

## What is OpenCode?

OpenCode is an AI-powered coding agent with **client/server architecture**. The core CLI server provides AI capabilities that multiple frontends (desktop app, web console, TUI) can consume through a standardized API.

**Key Value**: Separation of concerns - AI logic lives in the server, UX lives in multiple specialized clients.

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend Clients                          │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │   Desktop   │  │  Web Console │  │   TUI (future)   │   │
│  │  (SolidJS)  │  │ (SolidStart) │  │                  │   │
│  └──────┬──────┘  └──────┬───────┘  └────────┬─────────┘   │
│         │                 │                    │             │
│         └─────────────────┴────────────────────┘             │
│                           │                                  │
│                    @opencode-ai/sdk                          │
│                           │                                  │
└───────────────────────────┼──────────────────────────────────┘
                            │ HTTP/SSE
┌───────────────────────────┼──────────────────────────────────┐
│                    Core CLI Server                           │
│                  (packages/opencode)                         │
│                                                              │
│  ┌────────────┐  ┌────────────┐  ┌─────────────┐           │
│  │   Agent    │  │  Session   │  │    Tool     │           │
│  │  System    │──│  Manager   │──│   System    │           │
│  └────────────┘  └────────────┘  └─────────────┘           │
│                                                              │
│  ┌────────────┐  ┌────────────┐  ┌─────────────┐           │
│  │  Provider  │  │    LSP     │  │     MCP     │           │
│  │   (LLMs)   │  │ (Language) │  │  (Context)  │           │
│  └────────────┘  └────────────┘  └─────────────┘           │
│                                                              │
│  ┌────────────┐  ┌────────────┐  ┌─────────────┐           │
│  │   Config   │  │    Bus     │  │    File     │           │
│  │   System   │  │  (Events)  │  │   System    │           │
│  └────────────┘  └────────────┘  └─────────────┘           │
└──────────────────────────────────────────────────────────────┘
                            │
┌───────────────────────────┼──────────────────────────────────┐
│              Backend Services (Console)                      │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         packages/console/core                        │   │
│  │  Database (Drizzle) + Billing (Stripe) + Email      │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
                            │
                   ┌────────┴────────┐
                   │   PlanetScale   │
                   │   (Database)    │
                   └─────────────────┘
```

## Technology Stack Map

```yaml
Core Server (packages/opencode):
  - Runtime: Bun 1.3.0+, Node.js 22+
  - Framework: Yargs CLI, Hono API server
  - Language: TypeScript
  - Key libs: Zod, chokidar, ripgrep, tree-sitter

Frontend - Desktop (packages/desktop):
  - Framework: SolidJS + Vite 6
  - Styling: Tailwind CSS 4.1
  - UI: Kobalte (accessible components)
  - Rendering: Shiki (code), Marked (markdown)

Frontend - Console (packages/console/app):
  - Framework: SolidStart 1.1+ (SSR)
  - Auth: OpenAuth
  - UI: Kobalte Core
  - Bundler: Vinxi

Backend - Console Core (packages/console/core):
  - Database: Drizzle ORM + PlanetScale (MySQL)
  - Billing: Stripe API
  - Email: JSX Email
  - IDs: ULID

Marketing Site (packages/web):
  - Framework: Astro 5.7
  - UI: SolidJS components
  - Docs: Starlight
  - Deploy: Cloudflare

SDKs:
  - JavaScript: @opencode-ai/sdk (auto-generated from OpenAPI)
  - Plugins: @opencode-ai/plugin (custom extensions)

Infrastructure:
  - IaC: SST (sst.config.ts)
  - Platform: Cloudflare
  - Strategy: Stage-based environments
```

## Package Relationships

```
Core Layer:
  opencode → CLI server, core AI logic, tools, providers, session management
    ├─ Exports OpenAPI spec
    └─ Runs as HTTP server

SDK Layer:
  sdk/js → Auto-generated TypeScript SDK from opencode's OpenAPI spec
    └─ Used by: desktop, console/app, external integrations

  plugin → SDK for creating custom OpenCode plugins
    └─ Extends opencode with custom tools, auth, hooks

Frontend Layer:
  desktop → Standalone desktop app (SolidJS)
    └─ Uses: sdk/js

  console/app → Web console frontend (SolidStart SSR)
    └─ Uses: sdk/js, console/core

  web → Marketing site (Astro)
    └─ Static site with docs

Backend Layer:
  console/core → Backend services (DB, billing, user mgmt)
    └─ Used by: console/app routes
    └─ Database: Planet
    Scale (Drizzle ORM)
    └─ Billing: Stripe

Supporting:
  console/function → Serverless functions
  console/resource → Shared resources
  console/scripts → Build scripts
  console/mail → Email templates
  function → Function utilities
  identity → Auth/ID utilities
```

## Data Flow

### Typical User Interaction:
1. **User → Frontend** (desktop/console): User types prompt
2. **Frontend → SDK**: `client.session.prompt({ parts: [...] })`
3. **SDK → Server**: HTTP POST to `/session/:id/prompt`
4. **Server → Agent**: Session creates/resumes agent with prompt
5. **Agent → Provider**: Calls LLM (Anthropic/OpenAI/etc) with system prompt + tools
6. **LLM → Agent**: Returns tool calls or text response
7. **Agent → Tools**: Executes bash/edit/read/write/etc tools
8. **Tools → File System**: Performs operations, returns results
9. **Agent → Provider**: Sends tool results back to LLM
10. **LLM → Agent**: Final response
11. **Agent → Session**: Updates session with messages
12. **Session → Frontend**: Streams response via SSE
13. **Frontend → User**: Displays formatted response

### Plugin Extension Flow:
1. User creates plugin with custom tools
2. Plugin registered in opencode via config/plugin registry
3. Plugin tools exposed alongside built-in tools
4. LLM can call plugin tools like native tools
5. Plugin hooks intercept events (chat.message, tool.execute, etc)

## Key Concepts

### Agent System
- **Purpose**: Define AI behavior and permissions
- **Types**: Built-in (build, plan, general) + Custom (.opencode/agent/*.md)
- **Modes**: Primary (user-facing) vs Subagent (Task tool only)
- **Permissions**: allow/deny/ask for each tool
- **Location**: `packages/opencode/src/agent/`

### Session Management
- **Purpose**: Maintain conversation state and context
- **Features**:
  - Message/part management
  - Context compaction (optimize token usage)
  - Revert capability (undo operations)
  - Sharing (Session.share())
- **Location**: `packages/opencode/src/session/`

### Tool System
- **Purpose**: Provide LLM with capabilities to interact with codebase
- **Core Tools**:
  - bash: Shell execution (tree-sitter parsed, sandboxed)
  - edit: File editing (9 fallback strategies)
  - multiedit: Multiple edits per file
  - read: File reading (with offset/limit)
  - write: File writing
  - glob: File search
  - grep: Content search (ripgrep)
  - task: Sub-agent delegation
  - webfetch: Web content retrieval
  - todo: TODO management
- **Definition Pattern**:
  ```typescript
  export const MyTool = Tool.define("my-tool", {
    description: DESCRIPTION,
    parameters: z.object({ input: z.string() }),
    async execute(params, ctx) {
      return { title: "Result", output: "..." }
    }
  })
  ```
- **Location**: `packages/opencode/src/tool/`

### Provider System
- **Purpose**: Manage AI model providers (Anthropic, OpenAI, etc)
- **Priority**: ENV vars → stored API keys → custom loaders → config
- **Features**:
  - Custom loaders for special providers (Anthropic, Bedrock, OpenAI)
  - Cost tracking from models.dev
- **Location**: `packages/opencode/src/provider/`

### LSP Integration
- **Purpose**: Language server protocol for code intelligence
- **Built-in**: TypeScript, Python, Go, Rust, Java
- **Custom**: Via config.lsp
- **Capabilities**: Diagnostics, hover, workspace symbols
- **Location**: `packages/opencode/src/lsp/`

### MCP Integration
- **Purpose**: Model Context Protocol for external tool integration
- **Types**: Local (stdio) + Remote (HTTP/SSE)
- **Namespace**: `{serverName}_{toolName}`
- **Location**: `packages/opencode/src/mcp/`

### Config System
- **Purpose**: Hierarchical configuration management
- **Hierarchy**: global → project → env vars
- **Strategy**: Deep merge
- **Interpolation**: `{env:VAR}`, `{file:path}`
- **Location**: `packages/opencode/src/config/`

### Bus System
- **Purpose**: Event-driven communication between components
- **Pattern**: Publish/subscribe
- **Validation**: Zod-validated events
- **Usage**:
  ```typescript
  Bus.publish(Event.Updated, { data })
  Bus.subscribe(Event.Updated, async (evt) => {
    // handle event
  })
  ```
- **Location**: `packages/opencode/src/bus/`

## Development Workflows

### Getting Started
```bash
# 1. Install dependencies
bun install

# 2. Run development server
bun dev                    # Runs packages/opencode/src/index.ts

# 3. Type checking (all packages)
bun typecheck

# 4. Run tests
cd packages/opencode && bun test
```

### Working on Specific Components

**Core Server (packages/opencode)**:
```bash
cd packages/opencode
bun dev                    # CLI with hot reload
bun test                   # Run tests
bun run build              # Build to dist/
```

**Desktop Frontend (packages/desktop)**:
```bash
cd packages/desktop
bun dev                    # Dev server on :3000
bun build                  # Production build
```

**Web Console (packages/console/app)**:
```bash
cd packages/console/app
bun dev                    # Local dev
bun dev:remote             # Dev with remote auth
bun build                  # Build to .output/
```

**Console Backend (packages/console/core)**:
```bash
cd packages/console/core
bun run db                 # Drizzle kit (current stage)
bun run update-models      # Fetch from models.dev
```

**Marketing Site (packages/web)**:
```bash
cd packages/web
bun dev                    # Dev server
bun run build              # Static build
```

**SDK (packages/sdk/js)**:
```bash
# 1. Generate OpenAPI spec from opencode
cd packages/opencode
bun dev generate           # Creates openapi.json

# 2. Build SDK
cd packages/sdk/js
bun run build              # Auto-generates from OpenAPI
```

### Testing Strategy
- **Unit Tests**: Bun test runner in `packages/opencode/src/*.test.ts`
- **E2E Tests**: Run full CLI commands via subprocess
- **Frontend Tests**: (TBD - consider Vitest for SolidJS)
- **API Tests**: Test via SDK against running server

### Deployment Process
```bash
# Infrastructure: SST on Cloudflare
sst deploy --stage dev     # Deploy to dev
sst deploy --stage prod    # Deploy to production

# Database migrations
cd packages/console/core
bun run db-dev             # Dev migrations
bun run db-prod            # Prod migrations
```

## Common Tasks

### Adding a New Feature
1. **Define Requirements**: What does the feature do?
2. **Choose Layer**: Core (opencode) vs Frontend vs Backend
3. **Implement**:
   - Core: Add tool/agent/provider
   - Frontend: Add UI components/routes
   - Backend: Add DB schema/API
4. **Update Types**: Run `bun typecheck`
5. **Test**: Write tests, manual validation
6. **Document**: Update relevant CLAUDE.md

### Creating a Plugin
```typescript
// my-plugin.ts
import { Plugin, tool } from '@opencode-ai/plugin'

export const MyPlugin: Plugin = async ({ client, project, $ }) => {
  return {
    tool: {
      mytool: tool({
        description: "Custom tool",
        args: { input: tool.schema.string() },
        async execute(args) {
          return `Result: ${args.input}`
        }
      })
    },

    async "chat.message"(input, output) {
      // Intercept messages
    }
  }
}
```

Register in config: `~/.opencode/config.json`
```json
{
  "plugins": ["./path/to/my-plugin.ts"]
}
```

### Modifying UI (Desktop)
1. **Navigate**: `cd packages/desktop`
2. **Find Component**: Check `src/components/` or `src/pages/`
3. **Edit**: Modify SolidJS components
4. **Test**: `bun dev` → localhost:3000
5. **Styling**: Use Tailwind CSS classes
6. **Build**: `bun build`

### Database Changes (Console)
1. **Navigate**: `cd packages/console/core`
2. **Edit Schema**: Modify `src/schema/*.sql.ts`
3. **Generate Migration**: `bun run db` (drizzle-kit)
4. **Apply**: Migrations auto-applied on deploy
5. **Update Code**: Update related `src/*.ts` files

### API Changes (OpenCode Core)
1. **Modify Hono Routes**: `packages/opencode/src/server/`
2. **Generate OpenAPI**: `cd packages/opencode && bun dev generate`
3. **Rebuild SDK**: `cd packages/sdk/js && bun run build`
4. **Update Clients**: Import new SDK methods in frontend
5. **Test**: Run full stack locally

## Quick Reference

### File Structure
```
opencode/
├── packages/
│   ├── opencode/          # Core CLI server (MAIN)
│   ├── sdk/js/            # JS SDK (auto-gen)
│   ├── plugin/            # Plugin SDK
│   ├── desktop/           # Desktop app
│   ├── console/
│   │   ├── app/           # Web console UI
│   │   ├── core/          # Backend services
│   │   ├── function/      # Serverless
│   │   ├── resource/      # Shared
│   │   ├── scripts/       # Build
│   │   └── mail/          # Email templates
│   ├── web/               # Marketing site
│   ├── function/          # Function utils
│   └── identity/          # Auth utils
├── infra/                 # SST infrastructure
├── sst.config.ts          # Deployment config
└── bun.lockb              # Bun lockfile
```

### Critical Rules
1. **State Isolation**: Use `Instance.state()`, never globals
2. **Path Security**: Always validate against `Instance.directory`
3. **Error Typing**: Use `NamedError` for typed errors
4. **Event-Driven**: Use Bus for cross-system communication
5. **SDK Generation**: Never manually edit `packages/sdk/js/src/gen/`
6. **SolidJS Reactivity**: Understand signals/effects before frontend work
7. **Database**: Use Drizzle transactions for console/core changes
8. **Performance**: Use `Promise.all()` for parallel operations

### Debug Commands
```bash
opencode debug config      # Show effective config
opencode debug lsp         # LSP status
opencode debug file        # File operations test
opencode debug ripgrep     # Search test
opencode debug snapshot    # Snapshot test
```

### Environment Variables
```bash
# Core
OPENCODE_CONFIG            # Custom config path
OPENCODE_CONFIG_CONTENT    # Inline config JSON
OPENCODE_PERMISSION        # Override permissions
OPENCODE_AUTO_SHARE        # Auto-share sessions

# Console
VITE_AUTH_URL              # Auth server URL
DATABASE_URL               # PlanetScale connection
STRIPE_SECRET_KEY          # Stripe API key
```

### Logs
- Location: `~/.opencode/logs/`
- Pattern: `{service}-{date}.log`
- Usage:
  ```typescript
  const log = Log.create({ service: "myservice" })
  log.info("message", { data })
  ```

## Performance Tips
- Use `Promise.all()` for parallel operations
- `Instance.state()` auto-caches per project
- Stream metadata in long-running tools via `ctx.metadata()`
- Limit tool output to ~30KB
- Use ripgrep for fast search, not bash grep
- Enable context compaction for long sessions

## Architecture Decisions

**Why Client/Server?**
- Reuse core AI logic across multiple UX layers
- Desktop app, web console, future mobile all share same backend
- Easier to maintain single source of truth for AI behavior

**Why SolidJS?**
- Fine-grained reactivity (fast updates)
- Small bundle size
- Great TypeScript support

**Why Bun?**
- Fast package manager and runtime
- Native TypeScript support
- Compatible with Node.js ecosystem

**Why Monorepo?**
- Shared types across packages
- Single source of truth
- Easier to coordinate changes

**Why SST?**
- Type-safe infrastructure
- Great Cloudflare integration
- Stage-based deployments
