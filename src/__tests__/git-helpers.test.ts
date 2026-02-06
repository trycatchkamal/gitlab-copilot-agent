import { stageFilesSelectively, pushWithRetry } from '../lib/git-helpers.js';

// Use short delay for pushWithRetry tests by mocking the retry module
jest.mock('../lib/retry.js', () => {
  const actual = jest.requireActual('../lib/retry.js');
  return {
    ...actual,
    GIT_PUSH_RETRY_OPTIONS: {
      ...actual.GIT_PUSH_RETRY_OPTIONS,
      delayMs: 1, // Override to 1ms for tests
    },
  };
});

const mockGit = {
  add: jest.fn().mockResolvedValue(undefined),
  raw: jest.fn().mockResolvedValue(''),
  diff: jest.fn().mockResolvedValue(''),
  push: jest.fn().mockResolvedValue(undefined),
};

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  fatal: jest.fn(),
  trace: jest.fn(),
  child: jest.fn(),
  silent: jest.fn(),
  level: 'info',
} as any;

describe('git-helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('stageFilesSelectively', () => {
    it('should stage tracked changes with git add -u', async () => {
      mockGit.raw.mockResolvedValue('');
      mockGit.diff.mockResolvedValue('');

      await stageFilesSelectively(mockGit as any, mockLogger);

      expect(mockGit.add).toHaveBeenCalledWith(['-u']);
    });

    it('should add untracked files that are not intermediate', async () => {
      mockGit.raw.mockResolvedValue('src/new-file.ts\nREADME.md\n');
      mockGit.diff.mockResolvedValue(' 2 files changed');

      const result = await stageFilesSelectively(mockGit as any, mockLogger);

      expect(mockGit.add).toHaveBeenCalledWith(['src/new-file.ts', 'README.md']);
      expect(result.hasChanges).toBe(true);
      expect(result.stagedFiles).toEqual(['src/new-file.ts', 'README.md']);
    });

    it('should filter out intermediate files', async () => {
      mockGit.raw.mockResolvedValue(
        'src/new-file.ts\npatch_raw.txt\ncopilot.patch\ntodo.md\nplan.json\ncommit_msg.txt\n',
      );
      mockGit.diff.mockResolvedValue(' 1 file changed');

      const result = await stageFilesSelectively(mockGit as any, mockLogger);

      expect(mockGit.add).toHaveBeenCalledWith(['src/new-file.ts']);
      expect(result.stagedFiles).toEqual(['src/new-file.ts']);
    });

    it('should filter out .pyc files', async () => {
      mockGit.raw.mockResolvedValue('src/app.ts\ncache.pyc\n');
      mockGit.diff.mockResolvedValue(' 1 file changed');

      const result = await stageFilesSelectively(mockGit as any, mockLogger);

      expect(mockGit.add).toHaveBeenCalledWith(['src/app.ts']);
      expect(result.stagedFiles).toEqual(['src/app.ts']);
    });

    it('should return hasChanges=false when no changes are staged', async () => {
      mockGit.raw.mockResolvedValue('');
      mockGit.diff.mockResolvedValue('');

      const result = await stageFilesSelectively(mockGit as any, mockLogger);

      expect(result.hasChanges).toBe(false);
      expect(result.stagedFiles).toEqual([]);
    });

    it('should not call add for untracked files when all are intermediate', async () => {
      mockGit.raw.mockResolvedValue('patch_raw.txt\nplan.json\n');
      mockGit.diff.mockResolvedValue('');

      await stageFilesSelectively(mockGit as any, mockLogger);

      expect(mockGit.add).toHaveBeenCalledTimes(1);
      expect(mockGit.add).toHaveBeenCalledWith(['-u']);
    });

    it('should handle empty lines in untracked files list', async () => {
      mockGit.raw.mockResolvedValue('\n\nsrc/file.ts\n\n');
      mockGit.diff.mockResolvedValue(' 1 file changed');

      const result = await stageFilesSelectively(mockGit as any, mockLogger);

      expect(mockGit.add).toHaveBeenCalledWith(['src/file.ts']);
      expect(result.stagedFiles).toEqual(['src/file.ts']);
    });

    it('should filter out review-related intermediate files', async () => {
      mockGit.raw.mockResolvedValue(
        'review_findings.json\nreview_summary.txt\nreview_summary_final.txt\nreview_raw.txt\nreview_comment.txt\nsrc/actual-code.ts\n',
      );
      mockGit.diff.mockResolvedValue(' 1 file changed');

      const result = await stageFilesSelectively(mockGit as any, mockLogger);

      expect(result.stagedFiles).toEqual(['src/actual-code.ts']);
    });
  });

  describe('pushWithRetry', () => {
    it('should push successfully on first attempt', async () => {
      mockGit.push.mockResolvedValue(undefined);

      await pushWithRetry(mockGit as any, 'feature-branch', mockLogger);

      expect(mockGit.push).toHaveBeenCalledWith(['origin', 'feature-branch']);
      expect(mockGit.push).toHaveBeenCalledTimes(1);
    });

    it('should retry on push failure and succeed', async () => {
      mockGit.push.mockRejectedValueOnce(new Error('push failed')).mockResolvedValueOnce(undefined);

      await pushWithRetry(mockGit as any, 'feature-branch', mockLogger);

      expect(mockGit.push).toHaveBeenCalledTimes(2);
    });

    it('should throw after all push retries fail', async () => {
      mockGit.push
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockRejectedValueOnce(new Error('fail 3'));

      await expect(pushWithRetry(mockGit as any, 'feature-branch', mockLogger)).rejects.toThrow(
        'fail 3',
      );

      expect(mockGit.push).toHaveBeenCalledTimes(3);
    });
  });
});
