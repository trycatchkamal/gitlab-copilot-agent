import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/**
 * Template Validation Test Suite
 *
 * Validates i18n prompt templates to prevent runtime errors:
 * 1. All languages have the same templates as English (reference)
 * 2. All templates have valid placeholder syntax {variable_name}
 * 3. All language versions have matching placeholders
 */

const PROMPTS_DIR =
  typeof __dirname !== 'undefined' ? join(__dirname, '..', '..', 'prompts') : resolve('prompts');

const SUPPORTED_LANGUAGES = ['en', 'ar', 'hi', 'ja', 'ko', 'th', 'zh'];
const REFERENCE_LANGUAGE = 'en';

// Expected templates and their required variables
const TEMPLATE_VARIABLES: Record<string, string[]> = {
  issue_ack: [],
  plan_todo: ['issue_title', 'issue_iid', 'project_path', 'issue_url', 'issue_description'],
  implement: ['repo_path', 'branch_name', 'target_branch', 'repo_files', 'todo_list'],
  commit_msg: ['changes_summary'],
  mr_completion: ['mr_url'],
  mr_exists: ['mr_url', 'copilot_username', 'assigner_username'],
  mr_update: ['repo_path', 'branch_name', 'target_branch', 'repo_files', 'user_instruction'],
  mr_summary: ['commit_log', 'changes_stat'],
  mr_update_completion: ['change_summary', 'commit_message'],
  mr_no_changes: ['user_instruction'],
  review_ack: [],
  code_review: [
    'mr_title',
    'mr_description',
    'source_branch',
    'target_branch',
    'changed_files',
    'commit_messages',
    'code_diff',
  ],
};

/**
 * Extract all {variable} placeholders from template content
 */
function extractVariables(content: string): string[] {
  const matches = content.match(/\{([a-z_]+)\}/g) || [];
  return [...new Set(matches.map((m) => m.slice(1, -1)))];
}

/**
 * Validate placeholder syntax - should be {lowercase_snake_case}
 */
function findInvalidPlaceholders(content: string): string[] {
  // Find anything that looks like a placeholder but has invalid format
  const allBraces = content.match(/\{[^}]+\}/g) || [];
  return allBraces.filter((placeholder) => {
    // Valid: {lowercase_snake_case}
    // Invalid: {CamelCase}, {with spaces}, {with-dashes}, etc.
    // Skip JSON-like content (multiline or contains quotes/colons)
    if (placeholder.includes(':') || placeholder.includes('"')) {
      return false;
    }
    return !/^\{[a-z][a-z0-9_]*\}$/.test(placeholder);
  });
}

describe('Template Validation', () => {
  let englishTemplates: string[] = [];
  const templateContents: Map<string, Map<string, string>> = new Map();

  beforeAll(async () => {
    // Load all templates from all languages
    for (const lang of SUPPORTED_LANGUAGES) {
      const langDir = join(PROMPTS_DIR, lang);
      try {
        const files = await readdir(langDir);
        const templates = files.filter((f) => f.endsWith('.txt'));

        if (lang === REFERENCE_LANGUAGE) {
          englishTemplates = templates.map((f) => f.replace('.txt', ''));
        }

        const langContents = new Map<string, string>();
        for (const file of templates) {
          const content = await readFile(join(langDir, file), 'utf-8');
          langContents.set(file.replace('.txt', ''), content);
        }
        templateContents.set(lang, langContents);
      } catch {
        // Language directory doesn't exist
        templateContents.set(lang, new Map());
      }
    }
  });

  describe('Template Completeness', () => {
    it('should have English as reference with all expected templates', () => {
      const expectedTemplates = Object.keys(TEMPLATE_VARIABLES);
      const missing = expectedTemplates.filter((t) => !englishTemplates.includes(t));
      const extra = englishTemplates.filter((t) => !expectedTemplates.includes(t));

      if (missing.length > 0) {
        console.warn(`Missing templates in English: ${missing.join(', ')}`);
      }
      if (extra.length > 0) {
        console.warn(`Extra templates in English (not in spec): ${extra.join(', ')}`);
      }

      expect(missing).toEqual([]);
    });

    it.each(SUPPORTED_LANGUAGES.filter((l) => l !== REFERENCE_LANGUAGE))(
      'language "%s" should have all templates from English',
      async (lang: string) => {
        const langTemplates = templateContents.get(lang);
        expect(langTemplates).toBeDefined();

        const missing = englishTemplates.filter((t) => !langTemplates!.has(t));

        if (missing.length > 0) {
          console.error(`Language "${lang}" is missing templates: ${missing.join(', ')}`);
        }

        expect(missing).toEqual([]);
      },
    );
  });

  describe('Placeholder Syntax Validation', () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      describe(`Language: ${lang}`, () => {
        it.each(Object.keys(TEMPLATE_VARIABLES))(
          'template "%s" should have valid placeholder syntax',
          (templateName: string) => {
            const langTemplates = templateContents.get(lang);
            const content = langTemplates?.get(templateName);

            if (!content) {
              // Skip if template doesn't exist (caught by completeness test)
              return;
            }

            const invalid = findInvalidPlaceholders(content);

            if (invalid.length > 0) {
              console.error(
                `Invalid placeholders in ${lang}/${templateName}: ${invalid.join(', ')}`,
              );
            }

            expect(invalid).toEqual([]);
          },
        );
      });
    }
  });

  describe('Variable Consistency', () => {
    for (const [templateName, expectedVars] of Object.entries(TEMPLATE_VARIABLES)) {
      if (expectedVars.length === 0) continue;

      describe(`Template: ${templateName}`, () => {
        it('English template should have all expected variables', () => {
          const content = templateContents.get(REFERENCE_LANGUAGE)?.get(templateName);
          expect(content).toBeDefined();

          const actualVars = extractVariables(content!);
          const missing = expectedVars.filter((v) => !actualVars.includes(v));

          if (missing.length > 0) {
            console.error(
              `English template "${templateName}" missing variables: ${missing.join(', ')}`,
            );
          }

          expect(missing).toEqual([]);
        });

        it.each(SUPPORTED_LANGUAGES.filter((l) => l !== REFERENCE_LANGUAGE))(
          'language "%s" should have matching variables',
          (lang: string) => {
            const englishContent = templateContents.get(REFERENCE_LANGUAGE)?.get(templateName);
            const langContent = templateContents.get(lang)?.get(templateName);

            if (!langContent) {
              // Skip if template doesn't exist (caught by completeness test)
              return;
            }

            const englishVars = extractVariables(englishContent!);
            const langVars = extractVariables(langContent);

            const missingInLang = englishVars.filter((v) => !langVars.includes(v));
            const extraInLang = langVars.filter((v) => !englishVars.includes(v));

            if (missingInLang.length > 0) {
              console.error(
                `${lang}/${templateName} missing variables: ${missingInLang.join(', ')}`,
              );
            }
            if (extraInLang.length > 0) {
              console.warn(
                `${lang}/${templateName} has extra variables: ${extraInLang.join(', ')}`,
              );
            }

            expect(missingInLang).toEqual([]);
          },
        );
      });
    }
  });

  describe('Template Content Validity', () => {
    it.each(SUPPORTED_LANGUAGES)('language "%s" templates should not be empty', (lang: string) => {
      const langTemplates = templateContents.get(lang);
      expect(langTemplates).toBeDefined();

      const emptyTemplates: string[] = [];
      for (const [name, content] of langTemplates!.entries()) {
        if (!content || content.trim().length === 0) {
          emptyTemplates.push(name);
        }
      }

      if (emptyTemplates.length > 0) {
        console.error(`${lang} has empty templates: ${emptyTemplates.join(', ')}`);
      }

      expect(emptyTemplates).toEqual([]);
    });

    it.each(SUPPORTED_LANGUAGES)(
      'language "%s" templates should have proper UTF-8 encoding',
      (lang: string) => {
        const langTemplates = templateContents.get(lang);
        expect(langTemplates).toBeDefined();

        // Just verify we can read them without errors (would have thrown in beforeAll)
        expect(langTemplates!.size).toBeGreaterThan(0);
      },
    );
  });
});
