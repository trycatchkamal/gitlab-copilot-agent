# 🌍 Internationalization (i18n) Implementation Guide

## Overview

This project now supports multiple languages for Copilot-generated content including plans, MRs, comments, and code reviews.

## Supported Languages

- **English** (`en`) - Default
- **Chinese** (`zh`) - 中文
- **Japanese** (`ja`) - 日本語
- **Hindi** (`hi`) - हिन्दी
- **Korean** (`ko`) - 한국어
- **Thai** (`th`) - ภาษาไทย
- **Arabic** (`ar`) - العربية

## Architecture

### Directory Structure

```
prompts/
├── en/               # English prompts
│   ├── issue_ack.txt
│   ├── plan_todo.txt
│   ├── implement.txt
│   ├── commit_msg.txt
│   ├── mr_completion.txt
│   ├── mr_exists.txt
│   ├── mr_update.txt
│   ├── mr_summary.txt
│   ├── mr_update_completion.txt
│   ├── mr_no_changes.txt
│   ├── review_ack.txt
│   └── code_review.txt
├── zh/               # Chinese prompts
│   ├── issue_ack.txt
│   ├── plan_todo.txt
│   ├── implement.txt
│   ├── commit_msg.txt
│   ├── mr_completion.txt
│   ├── mr_exists.txt
│   ├── mr_update.txt
│   ├── mr_summary.txt
│   ├── mr_update_completion.txt
│   ├── mr_no_changes.txt
│   ├── review_ack.txt
│   └── code_review.txt
├── ja/               # Japanese prompts
│   ├── issue_ack.txt
│   ├── plan_todo.txt
│   ├── implement.txt
│   ├── commit_msg.txt
│   ├── mr_completion.txt
│   ├── mr_exists.txt
│   ├── mr_update.txt
│   ├── mr_summary.txt
│   ├── mr_update_completion.txt
│   ├── mr_no_changes.txt
│   ├── review_ack.txt
│   └── code_review.txt
├── hi/               # Hindi prompts
│   ├── issue_ack.txt
│   ├── plan_todo.txt
│   ├── implement.txt
│   ├── commit_msg.txt
│   ├── mr_completion.txt
│   ├── mr_exists.txt
│   ├── mr_update.txt
│   ├── mr_summary.txt
│   ├── mr_update_completion.txt
│   ├── mr_no_changes.txt
│   ├── review_ack.txt
│   └── code_review.txt
├── ko/               # Korean prompts
│   ├── issue_ack.txt
│   ├── plan_todo.txt
│   ├── implement.txt
│   ├── commit_msg.txt
│   ├── mr_completion.txt
│   ├── mr_exists.txt
│   ├── mr_update.txt
│   ├── mr_summary.txt
│   ├── mr_update_completion.txt
│   ├── mr_no_changes.txt
│   ├── review_ack.txt
│   └── code_review.txt
├── th/               # Thai prompts
│   ├── issue_ack.txt
│   ├── plan_todo.txt
│   ├── implement.txt
│   ├── commit_msg.txt
│   ├── mr_completion.txt
│   ├── mr_exists.txt
│   ├── mr_update.txt
│   ├── mr_summary.txt
│   ├── mr_update_completion.txt
│   ├── mr_no_changes.txt
│   ├── review_ack.txt
│   └── code_review.txt
└── ar/               # Arabic prompts
    ├── issue_ack.txt
    ├── plan_todo.txt
    ├── implement.txt
    ├── commit_msg.txt
    ├── mr_completion.txt
    ├── mr_exists.txt
    ├── mr_update.txt
    ├── mr_summary.txt
    ├── mr_update_completion.txt
    ├── mr_no_changes.txt
    ├── review_ack.txt
    └── code_review.txt
```

### Prompt Loader Utility

**File**: `src/lib/prompt-loader.ts`

**Features**:
- Automatic language selection based on `COPILOT_LANGUAGE` environment variable
- Fallback to English if language not found
- Template variable replacement using `{variable_name}` syntax
- TypeScript implementation with proper error handling

**Usage**:
```typescript
import { loadPrompt } from './lib/prompt-loader.js';

// Load a prompt with variable substitution
const prompt = loadPrompt('issue_ack', 'en', {
  timestamp: new Date().toISOString()
});
```

## Configuration

### Environment Variable

Add to `.env`:
```bash
# Language for Copilot-generated content
# Supported: en (English), zh (Chinese), ja (Japanese), hi (Hindi), ko (Korean), th (Thai), ar (Arabic)
COPILOT_LANGUAGE=en
```

### Webhook Service

The language setting is passed through the webhook service to CI/CD pipelines as an environment variable.

## Adding a New Language

### Step 1: Create Language Directory

```bash
mkdir -p prompts/<lang_code>
```

### Step 2: Create Prompt Templates

Create the following files in `prompts/<lang_code>/`:

1. **issue_ack.txt** - Issue acknowledgment message
   ```
   Variables: (none)
   ```

2. **plan_todo.txt** - Planning prompt
   ```
   Variables: {issue_title}, {issue_iid}, {project_path}, {issue_url}, {issue_description}
   ```

3. **implement.txt** - Implementation prompt
   ```
   Variables: {repo_path}, {branch_name}, {target_branch}, {repo_files}, {todo_list}
   ```

4. **commit_msg.txt** - Commit message generation
   ```
   Variables: {changes_summary}
   ```

5. **mr_completion.txt** - MR completion message
   ```
   Variables: {mr_url}
   ```

6. **mr_exists.txt** - MR already exists notification
   ```
   Variables: {mr_url}, {copilot_username}, {assigner_username}
   ```

7. **mr_update.txt** - MR update implementation prompt
   ```
   Variables: {repo_path}, {branch_name}, {target_branch}, {repo_files}, {user_instruction}
   ```

8. **mr_summary.txt** - Changes summary generation
   ```
   Variables: {commit_log}, {changes_stat}
   ```

9. **mr_update_completion.txt** - MR update completion message
   ```
   Variables: {change_summary}, {commit_message}
   ```

10. **mr_no_changes.txt** - No changes needed message
    ```
    Variables: {user_instruction}
    ```

11. **review_ack.txt** - Code review acknowledgment message
    ```
    Variables: (none)
    ```

12. **code_review.txt** - Code review prompt
    ```
    Variables: {mr_title}, {mr_description}, {source_branch}, {target_branch},
               {changed_files}, {commit_messages}, {code_diff}
    ```

### Step 3: Test the New Language

```bash
export COPILOT_LANGUAGE=<lang_code>
# Test in a GitLab pipeline
```

## Template Variable Format

Templates use `{variable_name}` format for variable substitution:

```
Issue: {issue_title}
Project: {project_path}
```

The loader automatically replaces these with actual values.

## Benefits

1. **Native Language Support**: Users can work in their preferred language
2. **Better Understanding**: Clearer communication in native language
3. **Easy Extension**: Simple process to add new languages
4. **Maintainable**: Centralized prompt management
5. **Flexible**: Supports both environment variables and explicit parameters

## Implementation Status

### Completed ✅
- Directory structure created
- English (en) prompts
- Chinese (zh) prompts
- Japanese (ja) prompts
- Hindi (hi) prompts
- Korean (ko) prompts
- Thai (th) prompts
- Arabic (ar) prompts
- TypeScript prompt loader (`src/lib/prompt-loader.ts`) with safe variable handling
- Webhook service configuration
- Environment variable support
- Full integration in all workflow CLI tools:
  - `src/issue-workflow-cli.ts` → `pnpm run issue-workflow`
  - `src/mr-update-cli.ts` → `pnpm run mr-update`
  - `src/mr-review-cli.ts` → `pnpm run mr-review`
- Windows/Linux cross-platform path handling
- UTF-8 encoding support for emoji and special characters
- README files in all supported languages:
  - README.md (English) - Root directory
  - docs/README_CN.md (Chinese)
  - docs/README_JA.md (Japanese)
  - docs/README_HI.md (Hindi)
  - docs/README_KO.md (Korean)
  - docs/README_TH.md (Thai)
  - docs/README_AR.md (Arabic)

### Pending 🔄
- UI messages localization (optional)

## Automatic Language Detection

The agent automatically detects users' preferred language from their GitLab profile settings. This provides a personalized experience without requiring manual configuration.

### How It Works

1. If `COPILOT_LANGUAGE` env var is set → use that language for all users (explicit override)
2. If `COPILOT_LANGUAGE` is not set → detect from GitLab user's `preferred_language` profile field
3. Falls back to English if:
   - User's language is not supported
   - API call fails
   - No user ID available

### Supported GitLab Language Mappings

| GitLab Locale | i18n Code | Language |
|--------------|-----------|----------|
| en, en-US, en-GB | en | English |
| zh, zh-CN, zh-TW | zh | Chinese |
| ja, ja-JP | ja | Japanese |
| ko, ko-KR | ko | Korean |
| th, th-TH | th | Thai |
| hi, hi-IN | hi | Hindi |
| ar, ar-SA | ar | Arabic |

### Configuration

```bash
# Option 1: Automatic detection (recommended)
# Don't set COPILOT_LANGUAGE - the agent will detect from user profiles

# Option 2: Force a specific language for all users
COPILOT_LANGUAGE=ja   # All responses in Japanese
```

## Automated Template Validation

Template validation tests ensure consistency and prevent runtime errors:

```bash
# Run template validation tests
pnpm test -- template-validation
```

### What's Validated

1. **Template Completeness** - All languages have the same templates as English
2. **Placeholder Syntax** - All `{variable}` placeholders use valid lowercase_snake_case
3. **Variable Consistency** - All language versions have matching placeholders
4. **Content Validity** - No empty templates, proper UTF-8 encoding

## Examples

### English Output
```
👀 Got it! Copilot Coding task 🚀 started at 2025-12-03T10:30:00Z.
```

### Chinese Output
```
👀 收到！Copilot 编码任务 🚀 开始于 2025-12-03T10:30:00Z。
```

### Japanese Output
```
👀 了解しました！Copilot コーディングタスク 🚀 が 2025-12-03T10:30:00Z に開始されました。
```

### Hindi Output
```
👀 मिल गया! Copilot कोडिंग कार्य 🚀 शुरू हो गया है।
```

### Korean Output
```
👀 확인했습니다! Copilot 코딩 작업 🚀이 시작되었습니다.
```

### Thai Output
```
👀 รับทราบแล้ว! งานเขียนโค้ด Copilot 🚀 เริ่มต้นแล้ว
```

### Arabic Output
```
👀 تم الاستلام! مهمة برمجة Copilot 🚀 بدأت.
```

## Best Practices

1. **Keep Templates Consistent**: Ensure all language versions have the same structure
2. **Use Clear Variables**: Variable names should be self-explanatory
3. **Test Thoroughly**: Verify output in each language
4. **Maintain Parity**: When updating prompts, update all languages
5. **Cultural Sensitivity**: Consider cultural nuances in each language

## Troubleshooting

### Issue: Wrong language showing
**Solution**: Check `COPILOT_LANGUAGE` environment variable in webhook service

### Issue: Template not found
**Solution**: Ensure all required templates exist in the language directory

### Issue: Variables not replaced
**Solution**: Variable names in templates use lowercase (e.g., `{timestamp}`). The loader automatically handles case conversion.

### Issue: Special characters in variables
**Solution**: The TypeScript loader handles special characters, newlines, and emojis correctly with proper string replacement.

## Future Enhancements

### Completed
- [x] Dynamic language detection from GitLab user preferences
- [x] Automated template validation

### Planned
- [ ] Language-specific formatting rules (date/number formats)
- [ ] Additional language support (Spanish, Portuguese, French, German, etc.)

### High Priority

1. **External Issue Tracker Integration (Jira/TFS/Azure DevOps)**
   - Trigger agent directly from Jira/TFS tickets (not just GitLab issues)
   - Use MCP servers to fetch rich context:
     - `@modelcontextprotocol/server-atlassian` for Jira
     - Azure DevOps MCP server for TFS/ADO
   - Pull acceptance criteria, user stories, subtasks, and linked specs
   - **Workflow**: Jira/TFS Ticket → Webhook → Agent → Draft MR → Human Review & Approve
   - Benefits:
     - Teams stay in their preferred project management tool
     - Automates initial implementation, humans handle review/approval
     - Richer context = better code generation

2. **Context-Aware Prompts**
   - Different prompts for different project types (frontend, backend, mobile)
   - Industry-specific terminology (fintech, healthcare, gaming)

3. **Fallback Chain**
   - If user's language unavailable, try regional variant → base language → English
   - Example: pt-BR → pt → en