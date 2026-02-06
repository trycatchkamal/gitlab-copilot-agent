# CLAUDE.md

GitLab + GitHub Copilot SDK integration. TypeScript/Fastify webhook relay service.

## Quick Reference

- **ESM project** (`"type": "module"`, ES2022 target)
- **Entry**: `src/index.ts` (webhook server), `src/*-cli.ts` (CI/CD scripts)
- **Services**: `src/lib/*-service.ts` (IssueWorkflow, MrUpdate, MrReview)
- **GitLab API**: `src/lib/gitlab-api.ts` wraps @gitbeaker/rest
- **i18n prompts**: `prompts/{lang}/` loaded by `src/lib/prompt-loader.ts`

## Critical Gotchas

**ESM/CJS path resolution** - `__dirname` unavailable in production ESM:
```typescript
const base = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
```

**Testing** - ts-jest doesn't support `import.meta.url`. Fake timers + mockRejectedValue causes issues; use real timers with `delayMs: 1`.

## Commands

```bash
pnpm dev          # Dev server
pnpm build        # Build
pnpm test         # Tests
pnpm typecheck    # Type check
pnpm lint         # Lint
```

## See Also

- [.github/copilot-instructions.md](.github/copilot-instructions.md) - Detailed architecture docs
- [I18N_README.md](I18N_README.md) - Internationalization guide
