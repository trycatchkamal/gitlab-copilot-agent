import { sanitizeHeaders, truncateText } from '../utils.js';

describe('Utils', () => {
  describe('sanitizeHeaders', () => {
    it('should redact sensitive headers', () => {
      const headers = {
        'x-gitlab-token': 'secret-token',
        authorization: 'Bearer secret',
        'private-token': 'private-secret',
        'content-type': 'application/json',
      };

      const sanitized = sanitizeHeaders(headers);

      expect(sanitized['x-gitlab-token']).toBe('***');
      expect(sanitized['authorization']).toBe('***');
      expect(sanitized['private-token']).toBe('***');
      expect(sanitized['content-type']).toBe('application/json');
    });

    it('should handle case-insensitive header names', () => {
      const headers = {
        'X-GitLab-Token': 'secret-token',
        Authorization: 'Bearer secret',
      };

      const sanitized = sanitizeHeaders(headers);

      expect(sanitized['X-GitLab-Token']).toBe('***');
      expect(sanitized['Authorization']).toBe('***');
    });

    it('should handle empty headers', () => {
      const sanitized = sanitizeHeaders({});
      expect(sanitized).toEqual({});
    });
  });

  describe('truncateText', () => {
    it('should not truncate text shorter than max length', () => {
      const text = 'Short text';
      const result = truncateText(text, 100);
      expect(result).toBe(text);
    });

    it('should truncate text longer than max length', () => {
      const text = 'A'.repeat(200);
      const result = truncateText(text, 100);

      expect(result.length).toBe(100);
      expect(result.endsWith('<!-- truncated -->')).toBe(true);
    });

    it('should use custom suffix', () => {
      const text = 'A'.repeat(200);
      const suffix = '...';
      const result = truncateText(text, 100, suffix);

      expect(result.length).toBe(100);
      expect(result.endsWith(suffix)).toBe(true);
    });

    it('should handle exact length match', () => {
      const text = 'A'.repeat(100);
      const result = truncateText(text, 100);
      expect(result).toBe(text);
    });
  });
});
