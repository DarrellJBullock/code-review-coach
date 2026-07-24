import { z } from 'zod';
import { FINDING_CATEGORIES, RISK_LEVELS } from '../enums';

/**
 * Zod schema for a single AI-generated finding.
 *
 * This is the enforcement mechanism for the "five-field Senior Engineer
 * Mode" shape: whyItMatters, whatCouldBreak, riskLevel + riskJustification,
 * suggestedTest, suggestedFix. Every field is required on purpose — the AI
 * response layer must not be allowed to collapse/omit any of these fields,
 * so no `.optional()` is used here. Later phases enforce this at the
 * ai-review response-parsing boundary.
 */
export const FindingSchema = z.object({
  category: z.enum(FINDING_CATEGORIES),
  riskLevel: z.enum(RISK_LEVELS),
  riskJustification: z.string(),
  title: z.string(),
  whyItMatters: z.string(),
  whatCouldBreak: z.string(),
  suggestedFix: z.string(),
  suggestedTest: z.string(),
  filePath: z.string().nullable(),
  lineRangeStart: z.number().nullable(),
  lineRangeEnd: z.number().nullable(),
});

export type Finding = z.infer<typeof FindingSchema>;
