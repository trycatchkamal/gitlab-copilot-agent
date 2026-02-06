import { withRetry, COPILOT_RETRY_OPTIONS, GIT_PUSH_RETRY_OPTIONS } from '../lib/retry.js';

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

describe('retry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('withRetry', () => {
    it('should return result on first successful attempt', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      const result = await withRetry(fn, mockLogger, {
        operationName: 'test',
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith(1);
    });

    it('should retry on failure and return on subsequent success', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockResolvedValueOnce('success');

      const result = await withRetry(fn, mockLogger, {
        maxAttempts: 3,
        delayMs: 1,
        operationName: 'test',
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
      expect(fn).toHaveBeenNthCalledWith(1, 1);
      expect(fn).toHaveBeenNthCalledWith(2, 2);
    });

    it('should throw after all retries are exhausted', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockRejectedValueOnce(new Error('fail 3'));

      await expect(
        withRetry(fn, mockLogger, {
          maxAttempts: 3,
          delayMs: 1,
          operationName: 'test',
        }),
      ).rejects.toThrow('fail 3');

      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should abort immediately when shouldRetry returns false', async () => {
      const fn = jest.fn().mockRejectedValueOnce(new Error('non-retryable'));

      await expect(
        withRetry(fn, mockLogger, {
          maxAttempts: 3,
          delayMs: 1,
          operationName: 'test',
          shouldRetry: () => false,
        }),
      ).rejects.toThrow('non-retryable');

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should use default options when none provided', async () => {
      const fn = jest.fn().mockResolvedValue('ok');

      const result = await withRetry(fn);

      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should log warnings on retry and error on final failure', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockRejectedValueOnce(new Error('fail 3'));

      await expect(
        withRetry(fn, mockLogger, {
          maxAttempts: 3,
          delayMs: 1,
          operationName: 'test-op',
        }),
      ).rejects.toThrow('fail 3');

      expect(mockLogger.warn).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should pass attempt number to function', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce('ok');

      await withRetry(fn, mockLogger, {
        maxAttempts: 3,
        delayMs: 1,
        operationName: 'test',
      });

      expect(fn).toHaveBeenNthCalledWith(1, 1);
      expect(fn).toHaveBeenNthCalledWith(2, 2);
      expect(fn).toHaveBeenNthCalledWith(3, 3);
    });
  });

  describe('preset options', () => {
    it('COPILOT_RETRY_OPTIONS should have correct defaults', () => {
      expect(COPILOT_RETRY_OPTIONS.maxAttempts).toBe(3);
      expect(COPILOT_RETRY_OPTIONS.delayMs).toBe(10_000);
      expect(COPILOT_RETRY_OPTIONS.operationName).toBe('Copilot SDK call');
    });

    it('GIT_PUSH_RETRY_OPTIONS should have correct defaults', () => {
      expect(GIT_PUSH_RETRY_OPTIONS.maxAttempts).toBe(3);
      expect(GIT_PUSH_RETRY_OPTIONS.delayMs).toBe(5_000);
      expect(GIT_PUSH_RETRY_OPTIONS.operationName).toBe('git push');
    });
  });
});
