import { loadConfig, configSchema } from '../config.js';

describe('Config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv };
  });

  describe('configSchema', () => {
    it('should validate valid configuration', () => {
      const validConfig = {
        PIPELINE_TRIGGER_TOKEN: 'test-token',
        PIPELINE_PROJECT_ID: '12345',
        PIPELINE_REF: 'main',
        GITLAB_API_BASE: 'https://gitlab.com',
        LISTEN_HOST: '0.0.0.0',
        LISTEN_PORT: '8080',
      };

      const result = configSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    it('should fail when required fields are missing', () => {
      const invalidConfig = {
        PIPELINE_REF: 'main',
      };

      const result = configSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it('should apply default values', () => {
      const minimalConfig = {
        PIPELINE_TRIGGER_TOKEN: 'test-token',
        PIPELINE_PROJECT_ID: '12345',
      };

      const result = configSchema.safeParse(minimalConfig);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.PIPELINE_REF).toBe('main');
        expect(result.data.GITLAB_API_BASE).toBe('https://gitlab.com');
        expect(result.data.COPILOT_AGENT_USERNAME).toBe('copilot-gitlab-agent');
        expect(result.data.LISTEN_PORT).toBe(8080);
      }
    });

    it('should transform boolean strings correctly', () => {
      const config = {
        PIPELINE_TRIGGER_TOKEN: 'test-token',
        PIPELINE_PROJECT_ID: '12345',
        LOG_DEBUG: 'true',
        ENABLE_INLINE_REVIEW_COMMENTS: '1',
      };

      const result = configSchema.safeParse(config);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.LOG_DEBUG).toBe(true);
        expect(result.data.ENABLE_INLINE_REVIEW_COMMENTS).toBe(true);
      }
    });

    it('should coerce port to number', () => {
      const config = {
        PIPELINE_TRIGGER_TOKEN: 'test-token',
        PIPELINE_PROJECT_ID: '12345',
        LISTEN_PORT: '3000',
      };

      const result = configSchema.safeParse(config);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.LISTEN_PORT).toBe(3000);
        expect(typeof result.data.LISTEN_PORT).toBe('number');
      }
    });

    it('should validate email format', () => {
      const invalidConfig = {
        PIPELINE_TRIGGER_TOKEN: 'test-token',
        PIPELINE_PROJECT_ID: '12345',
        COPILOT_AGENT_COMMIT_EMAIL: 'invalid-email',
      };

      const result = configSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it('should validate URL format', () => {
      const invalidConfig = {
        PIPELINE_TRIGGER_TOKEN: 'test-token',
        PIPELINE_PROJECT_ID: '12345',
        GITLAB_API_BASE: 'not-a-url',
      };

      const result = configSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });
  });

  describe('loadConfig', () => {
    it('should load configuration from environment', () => {
      process.env.PIPELINE_TRIGGER_TOKEN = 'test-token';
      process.env.PIPELINE_PROJECT_ID = '12345';

      const config = loadConfig();

      expect(config.PIPELINE_TRIGGER_TOKEN).toBe('test-token');
      expect(config.PIPELINE_PROJECT_ID).toBe('12345');
    });

    it('should throw error when required fields are missing', () => {
      delete process.env.PIPELINE_TRIGGER_TOKEN;
      delete process.env.PIPELINE_PROJECT_ID;

      expect(() => loadConfig()).toThrow('Invalid configuration');
    });
  });
});
