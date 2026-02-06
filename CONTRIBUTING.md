# Contributing to GitLab Copilot Agent

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing to this project.

## Code of Conduct

Be respectful, inclusive, and professional in all interactions.

## Getting Started

1. **Fork the repository** on GitHub/GitLab
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/yourusername/gitlab-copilot-agent.git
   cd gitlab-copilot-agent
   ```
3. **Install dependencies**:
   ```bash
   pnpm install
   ```
4. **Create a branch** for your changes:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development Workflow

### Running the Development Server

```bash
pnpm dev
```

This starts the server with hot reload enabled.

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Generate coverage report
pnpm test:coverage
```

### Code Quality

Before submitting a PR, ensure your code passes all quality checks:

```bash
# Type checking
pnpm typecheck

# Linting
pnpm lint

# Auto-fix linting issues
pnpm lint:fix

# Format code
pnpm format
```

## Coding Standards

### TypeScript

- Use **strict mode** (already configured)
- Prefer **interfaces** over types for object shapes
- Use **explicit return types** for public functions
- Avoid `any` - use `unknown` if type is truly unknown

### Naming Conventions

- **Files**: `kebab-case.ts`
- **Functions**: `camelCase`
- **Classes/Interfaces**: `PascalCase`
- **Constants**: `UPPER_SNAKE_CASE`

### Code Style

- Use **Prettier** for formatting (configured)
- Use **ESLint** for linting (configured)
- Maximum line length: 100 characters
- Use single quotes for strings
- Always use semicolons

### Testing

- Write tests for all new features
- Maintain or improve code coverage
- Use descriptive test names: `it('should do something when condition')`
- Group related tests with `describe` blocks

Example:
```typescript
describe('MyFunction', () => {
  it('should return true when input is valid', () => {
    expect(myFunction('valid')).toBe(true);
  });

  it('should throw error when input is invalid', () => {
    expect(() => myFunction('invalid')).toThrow();
  });
});
```

### Commits

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `test:` Test changes
- `refactor:` Code refactoring
- `chore:` Build/tooling changes

Examples:
```
feat: add support for custom webhook headers
fix: handle null descriptions in issue payloads
docs: update README with deployment instructions
test: add tests for MR note extraction
```

## Pull Request Process

1. **Update tests** to cover your changes
2. **Update documentation** if needed
3. **Run all quality checks**:
   ```bash
   pnpm typecheck && pnpm lint && pnpm test
   ```
4. **Create a pull request** with:
   - Clear title following conventional commits
   - Description of changes
   - Link to related issues
   - Screenshots (if UI changes)

### PR Checklist

- [ ] Tests pass locally
- [ ] Code is formatted (`pnpm format`)
- [ ] No linting errors (`pnpm lint`)
- [ ] Type checking passes (`pnpm typecheck`)
- [ ] Documentation updated
- [ ] Commit messages follow conventions

## Project Structure

```
src/
├── __tests__/          # Test files (*.test.ts)
├── config.ts           # Configuration and validation
├── types.ts            # Type definitions and Zod schemas
├── extractors.ts       # Variable extraction logic
├── pipeline.ts         # GitLab API client
├── utils.ts            # Utility functions
├── gitlab-events-handler.ts  # Main webhook handler
└── index.ts            # Application entry point
```

## Adding New Features

### Adding a New Webhook Event Type

1. **Define Zod schema** in `src/types.ts`:
   ```typescript
   export const newEventSchema = z.object({
     // ... schema definition
   });
   ```

2. **Add to discriminated union**:
   ```typescript
   export const webhookPayloadSchema = z.discriminatedUnion('object_kind', [
     issueHookSchema,
     mrNoteHookSchema,
     mrReviewerHookSchema,
     newEventSchema, // Add here
   ]);
   ```

3. **Create extractor** in `src/extractors.ts`:
   ```typescript
   export function extractNewEventVariables(
     payload: NewEvent,
     config: Config,
   ): PipelineVariables {
     // ... extraction logic
   }
   ```

4. **Update handler** in `src/gitlab-events-handler.ts`:
   ```typescript
   if (payload.object_kind === 'new_event') {
     variables = extractNewEventVariables(payload, config);
   }
   ```

5. **Add tests** in `src/__tests__/extractors.test.ts`

### Adding Configuration Options

1. **Update schema** in `src/config.ts`:
   ```typescript
   export const configSchema = z.object({
     // ... existing fields
     NEW_OPTION: z.string().default('default-value'),
   });
   ```

2. **Update `.env.example`** with documentation

3. **Add tests** in `src/__tests__/config.test.ts`

## Testing Guidelines

### Unit Tests

- Test individual functions in isolation
- Mock external dependencies
- Cover edge cases and error conditions

### Integration Tests

- Test complete workflows
- Use real (but controlled) data
- Verify end-to-end behavior

### Coverage Goals

- Maintain **>80%** overall coverage
- **100%** coverage for critical paths (extractors, validation)

## Documentation

- Update README.md for user-facing changes
- Add JSDoc comments for public APIs
- Update this CONTRIBUTING.md for process changes

## Getting Help

- Open an issue for bugs or feature requests
- Ask questions in discussions
- Tag maintainers for urgent issues

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
