import { z } from 'zod';

/**
 * Common schemas
 */
const userSchema = z.object({
  id: z.number(),
  username: z.string(),
  name: z.string().optional(),
  email: z.string().optional(),
});

const projectSchema = z.object({
  id: z.number(),
  name: z.string().optional(),
  path_with_namespace: z.string().optional(),
  http_url: z.string().optional(),
  git_http_url: z.string().optional(),
  default_branch: z.string().optional(),
});

const repositorySchema = z.object({
  name: z.string().optional(),
  url: z.string().optional(),
  homepage: z.string().optional(),
  default_branch: z.string().optional(),
});

/**
 * Issue Hook Schema
 */
const issueObjectAttributesSchema = z.object({
  id: z.number(),
  iid: z.number(),
  project_id: z.number(),
  title: z.string(),
  description: z.string().nullable().optional(),
  state: z.string(),
  action: z.string(),
  url: z.string(),
  author_id: z.number(),
  updated_at: z.string(),
});

const assigneesChangeSchema = z.object({
  current: z.array(userSchema).optional(),
  previous: z.array(userSchema).optional(),
});

const issueChangesSchema = z.object({
  assignees: assigneesChangeSchema.optional(),
});

export const issueHookSchema = z.object({
  object_kind: z.literal('issue'),
  object_attributes: issueObjectAttributesSchema,
  project: projectSchema,
  repository: repositorySchema.optional(),
  user: userSchema,
  changes: issueChangesSchema.optional(),
});

/**
 * Merge Request Note Hook Schema
 */
const noteObjectAttributesSchema = z.object({
  id: z.number(),
  note: z.string(),
  noteable_type: z.string(),
  noteable_id: z.number(),
  author_id: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});

const mergeRequestSchema = z.object({
  id: z.number(),
  iid: z.number(),
  title: z.string(),
  description: z.string().nullable().optional(),
  source_branch: z.string(),
  target_branch: z.string(),
  state: z.string(),
  url: z.string(),
  author_id: z.number(),
  target_project_id: z.number().optional(),
});

export const mrNoteHookSchema = z.object({
  object_kind: z.literal('note'),
  object_attributes: noteObjectAttributesSchema,
  merge_request: mergeRequestSchema,
  project: projectSchema,
  user: userSchema,
});

/**
 * Merge Request Hook Schema (for reviewer assignment)
 */
const reviewerSchema = z.object({
  id: z.number(),
  username: z.string(),
  name: z.string().optional(),
});

const reviewersChangeSchema = z.object({
  current: z.array(reviewerSchema).optional(),
  previous: z.array(reviewerSchema).optional(),
});

const mrChangesSchema = z.object({
  reviewers: reviewersChangeSchema.optional(),
});

const mrObjectAttributesSchema = z.object({
  id: z.number(),
  iid: z.number(),
  title: z.string(),
  description: z.string().nullable().optional(),
  source_branch: z.string(),
  target_branch: z.string(),
  state: z.string(),
  action: z.string(),
  url: z.string(),
  author_id: z.number(),
  target_project_id: z.number().optional(),
});

export const mrReviewerHookSchema = z.object({
  object_kind: z.literal('merge_request'),
  object_attributes: mrObjectAttributesSchema,
  project: projectSchema,
  user: userSchema,
  changes: mrChangesSchema.optional(),
});

/**
 * Union type for all webhook payloads
 */
export const webhookPayloadSchema = z.discriminatedUnion('object_kind', [
  issueHookSchema,
  mrNoteHookSchema,
  mrReviewerHookSchema,
]);

/**
 * TypeScript types inferred from schemas
 */
export type IssueHook = z.infer<typeof issueHookSchema>;
export type MrNoteHook = z.infer<typeof mrNoteHookSchema>;
export type MrReviewerHook = z.infer<typeof mrReviewerHookSchema>;
export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;

/**
 * Pipeline variables type
 */
export interface PipelineVariables {
  TRIGGER_TYPE: 'issue_assignee' | 'mr_note' | 'mr_reviewer';
  [key: string]: string;
}
