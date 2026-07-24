import { PromptBuilderService } from './prompt-builder.service';
import type { PromptBuilderInput } from './prompt-builder.service';

describe('PromptBuilderService', () => {
  let builder: PromptBuilderService;

  const baseInput: PromptBuilderInput = {
    prTitle: 'Add rate limiting to login endpoint',
    prDescription: 'Prevents brute-force attempts by throttling /login.',
    files: [
      { filename: 'src/auth/login.controller.ts', status: 'modified', additions: 20, deletions: 3, patch: '@@ -1,3 +1,20 @@' },
      { filename: 'src/auth/rate-limiter.ts', status: 'added', additions: 40, deletions: 0, patch: '@@ -0,0 +1,40 @@' },
    ],
    rawDiff: 'diff --git a/src/auth/login.controller.ts b/src/auth/login.controller.ts\n+ some added line',
    modes: { performance: false, security: false, accessibility: false },
  };

  beforeEach(() => {
    builder = new PromptBuilderService();
  });

  it('includes the PR title and description in the user prompt', () => {
    const { user } = builder.build(baseInput);
    expect(user).toContain(baseInput.prTitle);
    expect(user).toContain(baseInput.prDescription);
  });

  it('includes the list of changed files in the user prompt', () => {
    const { user } = builder.build(baseInput);
    expect(user).toContain('src/auth/login.controller.ts');
    expect(user).toContain('src/auth/rate-limiter.ts');
  });

  it('includes the raw diff text in the user prompt', () => {
    const { user } = builder.build(baseInput);
    expect(user).toContain(baseInput.rawDiff);
  });

  it('falls back to a placeholder when there is no PR description', () => {
    const { user } = builder.build({ ...baseInput, prDescription: null });
    expect(user).toContain('No description provided.');
  });

  it('instructs the model that every finding requires all five fields, with no collapsing/skipping', () => {
    const { system } = builder.build(baseInput);
    for (const field of [
      'whyItMatters',
      'whatCouldBreak',
      'riskLevel',
      'riskJustification',
      'suggestedTest',
      'suggestedFix',
    ]) {
      expect(system).toContain(field);
    }
    expect(system.toLowerCase()).toContain('all five');
    expect(system.toLowerCase()).toMatch(/do not|must/);
  });

  it('instructs the model to assign one of the 10 category values and an overall risk score + summary', () => {
    const { system } = builder.build(baseInput);
    expect(system).toContain('category');
    for (const category of [
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
    ]) {
      expect(system).toContain(category);
    }
    expect(system).toContain('overallRiskScore');
    expect(system).toContain('summary');
  });

  it('weights the prompt toward active modes when set', () => {
    const { system } = builder.build({
      ...baseInput,
      modes: { performance: false, security: true, accessibility: false },
    });
    expect(system).toContain('SECURITY');
    expect(system.toLowerCase()).toContain('weight your findings toward');
  });

  it('does not add mode-weighting instructions when no modes are active', () => {
    const { system } = builder.build(baseInput);
    expect(system.toLowerCase()).toContain('general-purpose review');
    expect(system.toLowerCase()).not.toContain('weight your findings toward');
  });

  it('lists multiple active modes together when more than one is enabled', () => {
    const { system } = builder.build({
      ...baseInput,
      modes: { performance: true, security: true, accessibility: false },
    });
    expect(system).toContain('PERFORMANCE');
    expect(system).toContain('SECURITY');
  });
});
