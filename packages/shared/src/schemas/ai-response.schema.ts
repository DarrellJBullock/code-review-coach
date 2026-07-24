import { z } from 'zod';
import { FindingSchema } from './finding.schema';

/**
 * Zod schema wrapping the full AI review response: an overall risk score,
 * a human-readable summary, and the list of individual findings.
 */
export const AiResponseSchema = z.object({
  overallRiskScore: z.number().min(0).max(100),
  summary: z.string(),
  findings: z.array(FindingSchema),
});

export type AiResponse = z.infer<typeof AiResponseSchema>;
