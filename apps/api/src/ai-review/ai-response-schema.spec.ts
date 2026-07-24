import { AiResponseSchema } from '@code-review-coach/shared';

/**
 * Exercises the exact same Zod schema the real ai-review pipeline uses to
 * validate `parsed_output` from `client.messages.parse()`. No real
 * Anthropic API call is made here — this just proves the schema
 * accepts/rejects the shapes it's supposed to.
 */
describe('AiResponseSchema', () => {
  const validFinding = {
    category: 'SECURITY',
    riskLevel: 'HIGH',
    riskJustification: 'This exposes user tokens in logs.',
    title: 'Access token logged in plaintext',
    whyItMatters: 'Logs are often shipped to third parties.',
    whatCouldBreak: 'A leaked log could let an attacker impersonate a user.',
    suggestedFix: 'Redact the token before logging.',
    suggestedTest: 'Assert the log output never contains the raw token.',
    filePath: 'src/auth/auth.service.ts',
    lineRangeStart: 10,
    lineRangeEnd: 12,
  };

  const validResponse = {
    overallRiskScore: 72,
    summary: 'This PR introduces a token-logging issue that should be fixed before merge.',
    findings: [validFinding],
  };

  it('accepts a fully valid payload', () => {
    const result = AiResponseSchema.safeParse(validResponse);
    expect(result.success).toBe(true);
  });

  it('accepts a valid payload with zero findings', () => {
    const result = AiResponseSchema.safeParse({ ...validResponse, findings: [] });
    expect(result.success).toBe(true);
  });

  it('rejects a payload where a finding is missing a required field (whatCouldBreak)', () => {
    const { whatCouldBreak: _omit, ...findingMissingField } = validFinding;
    const result = AiResponseSchema.safeParse({
      ...validResponse,
      findings: [findingMissingField],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a payload missing riskJustification', () => {
    const { riskJustification: _omit, ...findingMissingField } = validFinding;
    const result = AiResponseSchema.safeParse({
      ...validResponse,
      findings: [findingMissingField],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a payload with an invalid category enum value', () => {
    const result = AiResponseSchema.safeParse({
      ...validResponse,
      findings: [{ ...validFinding, category: 'NOT_A_REAL_CATEGORY' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a payload with an invalid riskLevel enum value', () => {
    const result = AiResponseSchema.safeParse({
      ...validResponse,
      findings: [{ ...validFinding, riskLevel: 'CRITICAL' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an overallRiskScore outside the 0-100 range', () => {
    const result = AiResponseSchema.safeParse({ ...validResponse, overallRiskScore: 150 });
    expect(result.success).toBe(false);
  });
});
