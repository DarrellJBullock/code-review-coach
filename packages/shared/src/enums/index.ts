/**
 * Shared enum-like string unions + const arrays.
 * Plain TS (no Prisma enum coupling) so this package stays importable
 * from both the NestJS API and the Next.js web app.
 */

export const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const FINDING_CATEGORIES = [
  'BUG_RISK',
  'TEST_COVERAGE',
  'TYPE_SAFETY',
  'ERROR_HANDLING',
  'SECURITY',
  'PERFORMANCE',
  'ACCESSIBILITY',
  'MAINTAINABILITY',
  'API_CONTRACT_CHANGES',
  'BREAKING_CHANGES',
] as const;
export type FindingCategory = (typeof FINDING_CATEGORIES)[number];

export const REVIEW_STATUSES = ['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const REVIEW_MODES = ['PERFORMANCE', 'SECURITY', 'ACCESSIBILITY'] as const;
export type ReviewMode = (typeof REVIEW_MODES)[number];
