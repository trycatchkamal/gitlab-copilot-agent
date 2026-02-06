# Testing

## Test Framework

This project uses **Jest** with **ts-jest** for testing TypeScript code.

## Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage
```

## Test Results

✅ **All tests passing!**

- **Test Suites**: 3 passed
- **Tests**: 25 passed
- **Coverage**: 
  - Config: 100%
  - Utils: 100%
  - Extractors: 90%+

## Test Structure

```
src/__tests__/
├── config.test.ts       # Configuration validation tests
├── utils.test.ts        # Utility function tests
└── extractors.test.ts   # Variable extraction tests
```

## What's Tested

### Configuration (`config.test.ts`)
- ✅ Schema validation for all environment variables
- ✅ Required field validation
- ✅ Default value application
- ✅ Type coercion (strings → numbers/booleans)
- ✅ Email and URL format validation
- ✅ Configuration loading from environment

### Utilities (`utils.test.ts`)
- ✅ Header sanitization (sensitive token redaction)
- ✅ Case-insensitive header handling
- ✅ Text truncation with custom suffixes
- ✅ Edge cases (empty inputs, exact lengths)

### Extractors (`extractors.test.ts`)
- ✅ Issue event variable extraction
- ✅ MR note event variable extraction
- ✅ MR reviewer event variable extraction
- ✅ Copilot-gitlab-agent assignment validation
- ✅ Unsupported action error handling
- ✅ Required field validation
- ✅ Long description truncation

## Writing Tests

Jest provides global test functions (`describe`, `it`, `expect`) automatically - no imports needed!

### Example Test

```typescript
import { myFunction } from '../myModule.js';

describe('MyModule', () => {
  it('should do something', () => {
    const result = myFunction('input');
    expect(result).toBe('expected');
  });

  it('should throw on invalid input', () => {
    expect(() => myFunction(null)).toThrow('Invalid input');
  });
});
```

## Coverage Reports

After running `pnpm test:coverage`, view the HTML report:

```bash
# Open coverage report in browser
start coverage/lcov-report/index.html  # Windows
open coverage/lcov-report/index.html   # macOS
xdg-open coverage/lcov-report/index.html  # Linux
```

## CI/CD Integration

Tests run automatically in CI/CD pipelines:

- **GitLab CI**: `.gitlab-ci.yml`
- **GitHub Actions**: `.github/workflows/ci.yml`

Both pipelines:
1. Run type checking
2. Run linting
3. Run all tests with coverage
4. Upload coverage reports

## Debugging Tests

### Run a single test file
```bash
pnpm test config.test.ts
```

### Run tests matching a pattern
```bash
pnpm test --testNamePattern="should validate"
```

### Run with verbose output
```bash
pnpm test --verbose
```

### Debug in VS Code

Add to `.vscode/launch.json`:

```json
{
  "type": "node",
  "request": "launch",
  "name": "Jest Debug",
  "program": "${workspaceFolder}/node_modules/.bin/jest",
  "args": ["--runInBand", "--no-cache"],
  "console": "integratedTerminal",
  "internalConsoleOptions": "neverOpen"
}
```

## Best Practices

1. **Keep tests focused**: One assertion per test when possible
2. **Use descriptive names**: `it('should extract variables from valid issue hook')`
3. **Test edge cases**: Empty inputs, null values, boundary conditions
4. **Mock external dependencies**: Don't make real HTTP requests in tests
5. **Maintain high coverage**: Aim for >80% overall, 100% for critical paths

## Continuous Testing

For development, use watch mode:

```bash
pnpm test:watch
```

Jest will re-run tests automatically when files change!
