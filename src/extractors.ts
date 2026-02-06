import type { Config } from './config.js';
import type { IssueHook, MrNoteHook, MrReviewerHook, PipelineVariables } from './types.js';
import { truncateText } from './utils.js';

/**
 * Extract pipeline variables from Issue Hook
 */
export function extractIssueVariables(payload: IssueHook, config: Config): PipelineVariables {
  const { object_attributes: issue, project, repository, user, changes } = payload;

  // Validate action
  const allowedActions = new Set(['open', 'reopen', 'update', 'edited']);
  if (!allowedActions.has(issue.action)) {
    throw new Error(`Unsupported issue action: ${issue.action}`);
  }

  // Check if copilot-gitlab-agent is assigned
  const currentAssignees = changes?.assignees?.current ?? [];
  const isCopilotAssigned = currentAssignees.some(
    (assignee) => assignee.username === config.COPILOT_AGENT_USERNAME,
  );

  if (!isCopilotAssigned) {
    throw new Error(`${config.COPILOT_AGENT_USERNAME} not assigned, ignoring event`);
  }

  // Extract and truncate description
  const originalNeeds = truncateText(issue.description ?? '', config.ORIGINAL_NEEDS_MAX_CHARS);

  // Determine target branch
  const targetBranch =
    project.default_branch ?? repository?.default_branch ?? config.FALLBACK_TARGET_BRANCH;

  // Determine target repo URL
  const targetRepoUrl =
    project.http_url ?? project.git_http_url ?? repository?.url ?? repository?.homepage ?? '';

  if (!targetRepoUrl) {
    throw new Error('Missing target repository URL');
  }

  const targetProjectId = project.id ?? issue.project_id;
  const targetProjectPath = project.path_with_namespace ?? repository?.name ?? '';

  return {
    TRIGGER_TYPE: 'issue_assignee',
    ORIGINAL_NEEDS: originalNeeds,
    TARGET_REPO_URL: targetRepoUrl,
    TARGET_BRANCH: targetBranch,
    TARGET_PROJECT_ID: String(targetProjectId),
    TARGET_PROJECT_PATH: targetProjectPath,
    TARGET_ISSUE_IID: String(issue.iid),
    TARGET_ISSUE_ID: String(issue.id),
    ISSUE_AUTHOR_ID: String(issue.author_id),
    ISSUE_TITLE: issue.title,
    ISSUE_URL: issue.url,
    ISSUE_ACTION: issue.action,
    ISSUE_STATE: issue.state,
    ISSUE_UPDATED_AT: issue.updated_at,
    ISSUE_ASSIGNEE_USERNAME: user.username,
    COPILOT_AGENT_USERNAME: config.COPILOT_AGENT_USERNAME,
    COPILOT_AGENT_COMMIT_EMAIL: config.COPILOT_AGENT_COMMIT_EMAIL,
    COPILOT_LANGUAGE: config.COPILOT_LANGUAGE ?? '',
    COPILOT_MODEL: config.COPILOT_MODEL,
  };
}

/**
 * Extract pipeline variables from MR Note Hook
 */
export function extractMrNoteVariables(payload: MrNoteHook, config: Config): PipelineVariables {
  const { object_attributes: note, merge_request: mr, project, user } = payload;

  // Check if copilot-gitlab-agent is mentioned
  const agentMention = `@${config.COPILOT_AGENT_USERNAME}`;
  if (!note.note.includes(agentMention)) {
    throw new Error(`${agentMention} not mentioned in note`);
  }

  // Extract instruction (remove agent mention)
  const instruction = note.note.replace(agentMention, '').trim();

  // Determine target repo URL
  const targetRepoUrl = project.http_url ?? project.git_http_url ?? '';

  if (!targetRepoUrl) {
    throw new Error('Missing target repository URL');
  }

  const targetProjectId = project.id ?? mr.target_project_id;
  const targetProjectPath = project.path_with_namespace ?? '';

  if (!targetProjectId) {
    throw new Error('Missing target project ID');
  }

  return {
    TRIGGER_TYPE: 'mr_note',
    MR_NOTE_INSTRUCTION: instruction,
    TARGET_REPO_URL: targetRepoUrl,
    TARGET_BRANCH: mr.target_branch,
    SOURCE_BRANCH: mr.source_branch,
    NEW_BRANCH_NAME: mr.source_branch, // Work on existing source branch
    TARGET_PROJECT_ID: String(targetProjectId),
    TARGET_PROJECT_PATH: targetProjectPath,
    TARGET_MR_IID: String(mr.iid),
    TARGET_MR_ID: String(mr.id),
    MR_TITLE: mr.title,
    MR_URL: mr.url,
    MR_AUTHOR_ID: String(mr.author_id),
    NOTE_AUTHOR_ID: String(user.id),
    NOTE_AUTHOR_USERNAME: user.username,
    COPILOT_AGENT_USERNAME: config.COPILOT_AGENT_USERNAME,
    COPILOT_AGENT_COMMIT_EMAIL: config.COPILOT_AGENT_COMMIT_EMAIL,
    COPILOT_LANGUAGE: config.COPILOT_LANGUAGE ?? '',
    COPILOT_MODEL: config.COPILOT_MODEL,
  };
}

/**
 * Extract pipeline variables from MR Reviewer Hook
 */
export function extractMrReviewerVariables(
  payload: MrReviewerHook,
  config: Config,
): PipelineVariables {
  const { object_attributes: mr, project, user, changes } = payload;

  // Validate action
  const allowedActions = new Set(['open', 'reopen', 'update', 'edited']);
  if (!allowedActions.has(mr.action)) {
    throw new Error(`Unsupported MR action: ${mr.action}`);
  }

  // Check if copilot-gitlab-agent is assigned as reviewer
  const currentReviewers = changes?.reviewers?.current ?? [];
  const isCopilotReviewer = currentReviewers.some(
    (reviewer) => reviewer.username === config.COPILOT_AGENT_USERNAME,
  );

  if (!isCopilotReviewer) {
    throw new Error(`${config.COPILOT_AGENT_USERNAME} not assigned as reviewer, ignoring event`);
  }

  // Determine target repo URL
  const targetRepoUrl = project.http_url ?? project.git_http_url ?? '';

  if (!targetRepoUrl) {
    throw new Error('Missing target repository URL');
  }

  const targetProjectId = project.id ?? mr.target_project_id;
  const targetProjectPath = project.path_with_namespace ?? '';

  if (!targetProjectId) {
    throw new Error('Missing target project ID');
  }

  return {
    TRIGGER_TYPE: 'mr_reviewer',
    TARGET_REPO_URL: targetRepoUrl,
    TARGET_BRANCH: mr.target_branch,
    SOURCE_BRANCH: mr.source_branch,
    TARGET_PROJECT_ID: String(targetProjectId),
    TARGET_PROJECT_PATH: targetProjectPath,
    TARGET_MR_IID: String(mr.iid),
    TARGET_MR_ID: String(mr.id),
    MR_TITLE: mr.title,
    MR_DESCRIPTION: mr.description ?? '',
    MR_URL: mr.url,
    MR_AUTHOR_ID: String(mr.author_id),
    MR_ACTION: mr.action,
    MR_STATE: mr.state,
    REVIEWER_ASSIGNER_ID: String(user.id),
    REVIEWER_ASSIGNER_USERNAME: user.username,
    COPILOT_AGENT_USERNAME: config.COPILOT_AGENT_USERNAME,
    COPILOT_AGENT_COMMIT_EMAIL: config.COPILOT_AGENT_COMMIT_EMAIL,
    ENABLE_INLINE_REVIEW_COMMENTS: String(config.ENABLE_INLINE_REVIEW_COMMENTS),
    COPILOT_LANGUAGE: config.COPILOT_LANGUAGE ?? '',
    COPILOT_MODEL: config.COPILOT_MODEL,
  };
}
