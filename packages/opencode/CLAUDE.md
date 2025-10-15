# packages/opencode - Core CLI Server

OpenCode's main CLI server and core logic. AI coding agent with client/server architecture.

**Requires**: Bun 1.3.0+, Node.js 22+

## Quick Start

```bash
bun install
bun dev          # Run CLI
bun typecheck    # Type check
bun test         # Run tests
bun run build    # Build
```

## Architecture

### Entry Point
`src/index.ts` - yargs CLI with commands: run, tui, auth, agent, serve, mcp, debug, models, stats

### Core Components

**Agent System** (`src/agent/`)
- Built-in agents: build, plan, general
- Custom agents via `.opencode/agent/*.md`
- Permission system (allow/deny/ask)
- Mode: primary (user-facing) vs subagent (Task tool only)

**Session System** (`src/session/`)
- Message/part management
- Compaction for context optimization
- Revert capability
- Sharing via `Session.share()`

**Tool System** (`src/tool/`)
- `bash.ts` - Shell execution (tree-sitter parsed, sandboxed)
- `edit.ts` - File editing (9 fallback strategies)
- `multiedit.ts` - Multiple edits per file
- `read.ts` - File reading with offset/limit
- `write.ts` - File writing
- `glob.ts` - File search
- `grep.ts` - Content search (ripgrep)
- `task.ts` - Sub-agent delegation
- `webfetch.ts` - Web content retrieval
- `todo.ts` - TODO management

**Provider System** (`src/provider/`)
- AI model provider management
- Priority: ENV vars → stored API keys → custom loaders → config
- Custom loaders for special providers (Anthropic, Bedrock, OpenAI)
- Cost tracking from models.dev

**LSP Integration** (`src/lsp/`)
- Language server protocol clients
- Built-in: TypeScript, Python, Go, Rust, Java
- Custom servers via config.lsp
- Diagnostics, hover, workspace symbols

**MCP Integration** (`src/mcp/`)
- Model Context Protocol server integration
- Local (stdio) and remote (HTTP/SSE) servers
- Tool namespace: `{serverName}_{toolName}`

**Config System** (`src/config/`)
- Hierarchical: global → project → env vars
- Deep merge strategy
- Variable interpolation: `{env:VAR}`, `{file:path}`

**File System** (`src/file/`)
- Watcher (chokidar/parcel)
- Ignore patterns (.gitignore)
- Ripgrep integration
- FZF fuzzy search

**Bus System** (`src/bus/`)
- Event-driven communication
- Zod-validated events
- Publish/subscribe pattern

## Key Patterns

### Instance State
```typescript
const state = Instance.state(async () => {
  return { data: await init() }
}, async (state) => {
  await cleanup(state.data)
})
```

### Tool Definition
```typescript
export const MyTool = Tool.define("my-tool", {
  description: DESCRIPTION,
  parameters: z.object({ input: z.string() }),
  async execute(params, ctx) {
    return {
      title: "Result",
      output: "...",
      metadata: {}
    }
  }
})
```

### Event Bus
```typescript
Bus.publish(Event.Updated, { data })
Bus.subscribe(Event.Updated, async (evt) => {
  // handle event
})
```

## Critical Directories

```
src/
├── agent/        # Agent definitions and permissions
├── session/      # Session management + prompts
├── tool/         # All AI tools + descriptions
├── provider/     # Model providers
├── lsp/          # LSP integration
├── mcp/          # MCP integration
├── config/       # Configuration system
├── cli/          # CLI commands + UI
├── server/       # Hono API server
├── file/         # File operations
└── util/         # Utilities (log, error, token)
```

## System Prompts

Located in `src/session/prompt/`:
- `anthropic.txt` - Claude
- `gemini.txt` - Gemini
- `beast.txt` - GPT
- `codex.txt` - GPT-5
- `qwen.txt` - Other models

Prompts composed from:
1. Provider-specific header
2. Main prompt template
3. Environment info (cwd, git status, date)
4. Custom instructions (CLAUDE.md, AGENTS.md, config.instructions)

## Development

### Add CLI Command
1. Create `src/cli/cmd/mycmd.ts`
2. Use `cmd()` wrapper
3. Register in `src/index.ts`

### Add Tool
1. Create `src/tool/mytool.ts`
2. Create `src/tool/mytool.txt` (description)
3. Register in `src/tool/registry.ts`

### Add Provider
1. Add to `models.dev`
2. Add custom loader if needed (provider.ts CUSTOM_LOADERS)
3. Document environment variables

### Error Handling
Use `NamedError.create()` for typed errors

### File Paths
Always validate against `Instance.directory` - no access outside worktree

### Testing
Place tests in `src/*.test.ts` using Bun test runner

### Logging
```typescript
const log = Log.create({ service: "name" })
log.info("message", { data })
```

Logs → `~/.opencode/logs/`

## Debug Commands

```bash
opencode debug config      # Show config
opencode debug lsp         # LSP status
opencode debug file        # File operations
opencode debug ripgrep     # Search test
opencode debug snapshot    # Snapshot test
```

## PDF Testing

Test PDF reading functionality with visual viewer:

```bash
cd test
./serve-pdf-viewer.js
# Open http://localhost:3456
```

**Features:**
- Upload PDF and view original rendering (left)
- See structuredContent output (right-top)
- View extracted images (right-bottom)
- Performance timing for each step
- Showcase example for testing without PDF

## Environment Flags

- `OPENCODE_CONFIG` - Custom config path
- `OPENCODE_CONFIG_CONTENT` - Inline config JSON
- `OPENCODE_PERMISSION` - Override permissions
- `OPENCODE_AUTO_SHARE` - Auto-share sessions
- `OPENCODE` - Set to "1" by CLI (detects OpenCode environment)

## Performance

- Use `Promise.all()` for parallel operations
- `Instance.state()` auto-caches per project
- Stream metadata in long-running tools via `ctx.metadata()`
- Limit tool output to ~30KB

## Critical Rules

1. **State isolation**: Use `Instance.state()`, never globals
2. **Path security**: Always validate against `Instance.directory`
3. **Error typing**: Use `NamedError` for typed errors
4. **Event-driven**: Use Bus for cross-system communication
5. **Permission checks**: Verify permissions in tools (especially bash)
