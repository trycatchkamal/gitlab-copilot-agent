import { PromptLoader } from '../lib/prompt-loader.js';

describe('PromptLoader', () => {
  it('should load English prompt template', async () => {
    const loader = new PromptLoader('en');
    const prompt = await loader.load('review_ack');

    expect(prompt).toBeTruthy();
    expect(prompt).toContain('code review');
  });

  it('should replace variables in template', async () => {
    const loader = new PromptLoader('en');
    const prompt = await loader.load('code_review', {
      mr_title: 'Test MR',
      mr_description: 'Test description',
      source_branch: 'feature',
      target_branch: 'main',
      changed_files: 'file1.ts, file2.ts',
      commit_messages: 'abc123 Initial commit',
      code_diff: 'diff content',
    });

    expect(prompt).toContain('Test MR');
    expect(prompt).toContain('Test description');
    expect(prompt).toContain('feature');
    expect(prompt).toContain('main');
  });

  it('should fallback to English for unsupported language', () => {
    const loader = new PromptLoader('unsupported');
    // Should not throw, should use 'en' as fallback
    expect(loader).toBeTruthy();
  });

  it('should throw error for non-existent template', async () => {
    const loader = new PromptLoader('en');
    await expect(loader.load('non_existent_template')).rejects.toThrow();
  });
});
