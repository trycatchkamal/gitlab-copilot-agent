import type { Config } from '../config.js';
import {
  extractIssueVariables,
  extractMrNoteVariables,
  extractMrReviewerVariables,
} from '../extractors.js';
import type { IssueHook, MrNoteHook, MrReviewerHook } from '../types.js';

const mockConfig: Config = {
  PIPELINE_TRIGGER_TOKEN: 'test-token',
  PIPELINE_PROJECT_ID: '12345',
  PIPELINE_REF: 'main',
  GITLAB_API_BASE: 'https://gitlab.com',
  WEBHOOK_SECRET_TOKEN: 'secret',
  FALLBACK_TARGET_BRANCH: 'main',
  ORIGINAL_NEEDS_MAX_CHARS: 8192,
  COPILOT_AGENT_USERNAME: 'copilot-gitlab-agent',
  COPILOT_AGENT_COMMIT_EMAIL: 'copilot@github.com',
  ENABLE_INLINE_REVIEW_COMMENTS: true,
  COPILOT_LANGUAGE: 'en',
  COPILOT_MODEL: 'gpt-4.1',
  LISTEN_HOST: '0.0.0.0',
  LISTEN_PORT: 8080,
  LOG_DEBUG: false,
  NODE_ENV: 'test',
};

describe('Extractors', () => {
  describe('extractIssueVariables', () => {
    it('should extract variables from valid issue hook', () => {
      const payload: IssueHook = {
        object_kind: 'issue',
        object_attributes: {
          id: 1,
          iid: 10,
          project_id: 100,
          title: 'Test Issue',
          description: 'Test description',
          state: 'opened',
          action: 'open',
          url: 'https://gitlab.com/project/issues/10',
          author_id: 5,
          updated_at: '2024-01-01T00:00:00Z',
        },
        project: {
          id: 100,
          name: 'test-project',
          path_with_namespace: 'group/test-project',
          http_url: 'https://gitlab.com/group/test-project',
          default_branch: 'main',
        },
        user: {
          id: 5,
          username: 'test-user',
        },
        changes: {
          assignees: {
            current: [
              {
                id: 10,
                username: 'copilot-gitlab-agent',
              },
            ],
          },
        },
      };

      const variables = extractIssueVariables(payload, mockConfig);

      expect(variables.TRIGGER_TYPE).toBe('issue_assignee');
      expect(variables.TARGET_ISSUE_IID).toBe('10');
      expect(variables.ISSUE_TITLE).toBe('Test Issue');
      expect(variables.TARGET_REPO_URL).toBe('https://gitlab.com/group/test-project');
      expect(variables.COPILOT_AGENT_USERNAME).toBe('copilot-gitlab-agent');
    });

    it('should throw error when copilot-gitlab-agent is not assigned', () => {
      const payload: IssueHook = {
        object_kind: 'issue',
        object_attributes: {
          id: 1,
          iid: 10,
          project_id: 100,
          title: 'Test Issue',
          description: 'Test description',
          state: 'opened',
          action: 'open',
          url: 'https://gitlab.com/project/issues/10',
          author_id: 5,
          updated_at: '2024-01-01T00:00:00Z',
        },
        project: {
          id: 100,
          http_url: 'https://gitlab.com/group/test-project',
        },
        user: {
          id: 5,
          username: 'test-user',
        },
        changes: {
          assignees: {
            current: [
              {
                id: 11,
                username: 'other-user',
              },
            ],
          },
        },
      };

      expect(() => extractIssueVariables(payload, mockConfig)).toThrow(
        'copilot-gitlab-agent not assigned',
      );
    });

    it('should throw error for unsupported action', () => {
      const payload: IssueHook = {
        object_kind: 'issue',
        object_attributes: {
          id: 1,
          iid: 10,
          project_id: 100,
          title: 'Test Issue',
          description: 'Test description',
          state: 'closed',
          action: 'close',
          url: 'https://gitlab.com/project/issues/10',
          author_id: 5,
          updated_at: '2024-01-01T00:00:00Z',
        },
        project: {
          id: 100,
          http_url: 'https://gitlab.com/group/test-project',
        },
        user: {
          id: 5,
          username: 'test-user',
        },
      };

      expect(() => extractIssueVariables(payload, mockConfig)).toThrow('Unsupported issue action');
    });

    it('should truncate long descriptions', () => {
      const longDescription = 'A'.repeat(10000);
      const payload: IssueHook = {
        object_kind: 'issue',
        object_attributes: {
          id: 1,
          iid: 10,
          project_id: 100,
          title: 'Test Issue',
          description: longDescription,
          state: 'opened',
          action: 'open',
          url: 'https://gitlab.com/project/issues/10',
          author_id: 5,
          updated_at: '2024-01-01T00:00:00Z',
        },
        project: {
          id: 100,
          http_url: 'https://gitlab.com/group/test-project',
        },
        user: {
          id: 5,
          username: 'test-user',
        },
        changes: {
          assignees: {
            current: [{ id: 10, username: 'copilot-gitlab-agent' }],
          },
        },
      };

      const variables = extractIssueVariables(payload, mockConfig);

      expect(variables.ORIGINAL_NEEDS.length).toBe(mockConfig.ORIGINAL_NEEDS_MAX_CHARS);
      expect(variables.ORIGINAL_NEEDS.endsWith('<!-- truncated -->')).toBe(true);
    });
  });

  describe('extractMrNoteVariables', () => {
    it('should extract variables from valid MR note hook', () => {
      const payload: MrNoteHook = {
        object_kind: 'note',
        object_attributes: {
          id: 1,
          note: '@copilot-gitlab-agent please review this',
          noteable_type: 'MergeRequest',
          noteable_id: 20,
          author_id: 5,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        merge_request: {
          id: 20,
          iid: 5,
          title: 'Test MR',
          description: 'Test MR description',
          source_branch: 'feature',
          target_branch: 'main',
          state: 'opened',
          url: 'https://gitlab.com/project/merge_requests/5',
          author_id: 5,
        },
        project: {
          id: 100,
          http_url: 'https://gitlab.com/group/test-project',
          path_with_namespace: 'group/test-project',
        },
        user: {
          id: 5,
          username: 'test-user',
        },
      };

      const variables = extractMrNoteVariables(payload, mockConfig);

      expect(variables.TRIGGER_TYPE).toBe('mr_note');
      expect(variables.MR_NOTE_INSTRUCTION).toBe('please review this');
      expect(variables.TARGET_MR_IID).toBe('5');
      expect(variables.SOURCE_BRANCH).toBe('feature');
      expect(variables.TARGET_BRANCH).toBe('main');
    });

    it('should throw error when copilot-gitlab-agent is not mentioned', () => {
      const payload: MrNoteHook = {
        object_kind: 'note',
        object_attributes: {
          id: 1,
          note: 'Just a regular comment',
          noteable_type: 'MergeRequest',
          noteable_id: 20,
          author_id: 5,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        merge_request: {
          id: 20,
          iid: 5,
          title: 'Test MR',
          source_branch: 'feature',
          target_branch: 'main',
          state: 'opened',
          url: 'https://gitlab.com/project/merge_requests/5',
          author_id: 5,
        },
        project: {
          id: 100,
          http_url: 'https://gitlab.com/group/test-project',
        },
        user: {
          id: 5,
          username: 'test-user',
        },
      };

      expect(() => extractMrNoteVariables(payload, mockConfig)).toThrow('not mentioned in note');
    });
  });

  describe('extractMrReviewerVariables', () => {
    it('should extract variables from valid MR reviewer hook', () => {
      const payload: MrReviewerHook = {
        object_kind: 'merge_request',
        object_attributes: {
          id: 20,
          iid: 5,
          title: 'Test MR',
          description: 'Test MR description',
          source_branch: 'feature',
          target_branch: 'main',
          state: 'opened',
          action: 'update',
          url: 'https://gitlab.com/project/merge_requests/5',
          author_id: 5,
        },
        project: {
          id: 100,
          http_url: 'https://gitlab.com/group/test-project',
          path_with_namespace: 'group/test-project',
        },
        user: {
          id: 5,
          username: 'test-user',
        },
        changes: {
          reviewers: {
            current: [
              {
                id: 10,
                username: 'copilot-gitlab-agent',
              },
            ],
          },
        },
      };

      const variables = extractMrReviewerVariables(payload, mockConfig);

      expect(variables.TRIGGER_TYPE).toBe('mr_reviewer');
      expect(variables.TARGET_MR_IID).toBe('5');
      expect(variables.MR_TITLE).toBe('Test MR');
      expect(variables.ENABLE_INLINE_REVIEW_COMMENTS).toBe('true');
    });

    it('should throw error when copilot-gitlab-agent is not assigned as reviewer', () => {
      const payload: MrReviewerHook = {
        object_kind: 'merge_request',
        object_attributes: {
          id: 20,
          iid: 5,
          title: 'Test MR',
          source_branch: 'feature',
          target_branch: 'main',
          state: 'opened',
          action: 'update',
          url: 'https://gitlab.com/project/merge_requests/5',
          author_id: 5,
        },
        project: {
          id: 100,
          http_url: 'https://gitlab.com/group/test-project',
        },
        user: {
          id: 5,
          username: 'test-user',
        },
        changes: {
          reviewers: {
            current: [
              {
                id: 11,
                username: 'other-reviewer',
              },
            ],
          },
        },
      };

      expect(() => extractMrReviewerVariables(payload, mockConfig)).toThrow(
        'not assigned as reviewer',
      );
    });

    it('should throw error for unsupported action', () => {
      const payload: MrReviewerHook = {
        object_kind: 'merge_request',
        object_attributes: {
          id: 20,
          iid: 5,
          title: 'Test MR',
          source_branch: 'feature',
          target_branch: 'main',
          state: 'merged',
          action: 'merge',
          url: 'https://gitlab.com/project/merge_requests/5',
          author_id: 5,
        },
        project: {
          id: 100,
          http_url: 'https://gitlab.com/group/test-project',
        },
        user: {
          id: 5,
          username: 'test-user',
        },
      };

      expect(() => extractMrReviewerVariables(payload, mockConfig)).toThrow(
        'Unsupported MR action',
      );
    });
  });
});
