# Copilot Instructions for gitlab-copilot-agent

## Project Overview

TypeScript + Fastify webhook relay service that bridges GitLab with GitHub Copilot SDK. Enables autonomous code implementation and intelligent code review through GitLab issues, MR comments, and reviewer assignments.

## Tech Stack

- **Runtime**: Node.js 20+, ESM (`"type": "module"`)
- **Framework**: Fastify 5
- **Language**: TypeScript (strict mode, ES2022 target)
- **AI SDK**: @github/copilot-sdk
- **GitLab API**: @gitbeaker/rest
- **Git Operations**: simple-git
- **Validation**: Zod
- **Testing**: Jest + ts-jest (ESM mode)
- **Logging**: Pino
- **Queue**: p-queue

## Architecture

### Entry Points

- `src/index.ts` - Fastify webhook relay server (receives webhooks, triggers pipelines)
- `src/issue-workflow-cli.ts` - CLI for issue workflow (`pnpm run issue-workflow`)
- `src/mr-update-cli.ts` - CLI for MR updates (`pnpm run mr-update`)
- `src/mr-review-cli.ts` - CLI for MR review (`pnpm run mr-review`)

### Core Services (`src/lib/`)

- `gitlab-api.ts` - Wraps @gitbeaker/rest for all GitLab API operations
- `issue-workflow-service.ts` - Handles issue → MR automation
- `mr-update-service.ts` - Handles MR comment-triggered updates
- `mr-review-service.ts` - Handles code review workflow
- `prompt-loader.ts` - i18n prompt template loader
- `git-helpers.ts` - Git utility functions
- `retry.ts` - Retry utility with exponential backoff

### i18n Prompts

Located in `prompts/{lang}/` (en, zh, ja, hi, ko, th, ar). Loaded by `src/lib/prompt-loader.ts`.

## Critical Gotchas

### ESM/CJS Compatibility

- `__dirname` is available in tsx dev mode and ts-jest (CJS transform)
- `__dirname` is NOT available in production ESM (`node dist/index.js`)
- Use this pattern for path resolution:
  ```typescript
  const base = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
  ```
- Docker WORKDIR is `/app`, so `resolve('prompts')` works in production

### Testing

- ts-jest does NOT properly support `import.meta.url` even with `useESM: true`
- Fake timers + `mockRejectedValue` causes unhandled rejection issues
- Use real timers with `delayMs: 1` instead of fake timers when testing retries
- Jest config uses module name mapper: `'^(\\.{1,2}/.*)\\.js$': '$1'`

## Development Commands

```bash
pnpm install      # Install dependencies
pnpm dev          # Dev server with hot reload
pnpm build        # Build for production
pnpm start        # Run production server
pnpm test         # Run tests
pnpm test:watch   # Watch mode
pnpm typecheck    # Type checking
pnpm lint         # Linting
pnpm format       # Format code
```

## File Patterns

- Service classes: `src/lib/*-service.ts`
- CLI entry points: `src/*-cli.ts`
- Tests: `src/__tests__/*.test.ts`
- Prompt templates: `prompts/{lang}/*.md`
- Config with Zod validation: `src/config.ts`
- Types and schemas: `src/types.ts`

## Intermediate Files (auto-generated, gitignored)

- `patch_raw.txt` - Raw Copilot output
- `todo.md` / `todo_completed.md` - Task checklists
- `plan.json` - Implementation plan
- `commit_msg.txt` - Generated commit message
- `mr_summary.txt` - Change summary
