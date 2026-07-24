import { Injectable } from '@nestjs/common';
import type { PullRequestChangedFileDto } from '@code-review-coach/shared';
import type { ReviewGenerationModes } from '../queue/queue.constants';

export interface PromptBuilderInput {
  prTitle: string;
  prDescription: string | null;
  files: PullRequestChangedFileDto[];
  rawDiff: string;
  modes: ReviewGenerationModes;
}

export interface BuiltPrompt {
  system: string;
  user: string;
}

const ALL_CATEGORIES = [
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

/**
 * Builds the system/user prompt pair sent to Claude for a review-generation
 * job. Plain, dependency-free logic (no Prisma/Anthropic imports) so it is
 * trivially unit-testable in isolation — see prompt-builder.service.spec.ts.
 *
 * This is where the product's core differentiator — the mandatory
 * five-field "Senior Engineer Mode" finding shape — is enforced at the
 * prompt level (the Zod schema via `zodOutputFormat` is the second,
 * authoritative enforcement layer at the response-parsing boundary; this
 * prompt is the first line of defense to make the model less likely to need
 * that layer to reject its output at all).
 */
@Injectable()
export class PromptBuilderService {
  build(input: PromptBuilderInput): BuiltPrompt {
    return {
      system: this.buildSystemPrompt(input.modes),
      user: this.buildUserPrompt(input),
    };
  }

  private buildSystemPrompt(modes: ReviewGenerationModes): string {
    const activeModeLabels: string[] = [];
    if (modes.performance) activeModeLabels.push('PERFORMANCE');
    if (modes.security) activeModeLabels.push('SECURITY');
    if (modes.accessibility) activeModeLabels.push('ACCESSIBILITY');

    const modeInstruction =
      activeModeLabels.length > 0
        ? `The requester has specifically enabled the following review focus ` +
          `area(s): ${activeModeLabels.join(', ')}. Weight your findings toward ` +
          `these categories — prioritize surfacing ${activeModeLabels.join('/')} ` +
          `issues first and in greater depth, while still reporting clear, ` +
          `high-confidence issues in other categories if you find them. Do not ` +
          `ignore other categories entirely, but ${activeModeLabels.join('/')} ` +
          `findings should dominate the results.`
        : `No specific review focus area was requested, so perform a ` +
          `general-purpose review, weighting all categories evenly ` +
          `(${ALL_CATEGORIES.join(', ')}) — do not over-index on any single ` +
          `category.`;

    return [
      `You are "Senior Engineer Mode", the AI code reviewer for the PR Review ` +
        `Coach product. Your job is to review a pull request's diff the way a ` +
        `thoughtful, thorough senior engineer would in a real code review — not ` +
        `a superficial linter pass.`,
      '',
      `CRITICAL OUTPUT CONTRACT — every finding you report MUST include ALL ` +
        `FIVE of the following fields, filled in fully and specifically. Do ` +
        `NOT omit, skip, collapse, or merge any of these fields for any ` +
        `finding, even if it feels repetitive or the finding seems minor:`,
      `  1. whyItMatters — explain, specifically, why this issue matters in ` +
        `this PR's context.`,
      `  2. whatCouldBreak — describe a concrete, specific failure scenario ` +
        `this could cause in production.`,
      `  3. riskLevel (exactly one of LOW, MEDIUM, HIGH) AND riskJustification ` +
        `— justify the chosen risk level in your own words.`,
      `  4. suggestedTest — a specific test (unit/integration/manual) that ` +
        `would have caught or would guard against this issue.`,
      `  5. suggestedFix — a concrete, actionable code-level fix or approach.`,
      '',
      `This five-field shape is the core product differentiator of PR Review ` +
        `Coach ("Senior Engineer Mode") — a finding that is missing any of ` +
        `these five fields is a defective response. If you are ever tempted to ` +
        `shorten a finding by leaving one of these fields out, do not: every ` +
        `single finding must have all five fields, with no exceptions, and no ` +
        `two fields merged into one.`,
      '',
      `Additionally, for each finding:`,
      `  - Assign exactly one \`category\` from this fixed list of 10 values: ` +
        `${ALL_CATEGORIES.join(', ')}.`,
      `  - Give a short, specific \`title\` for the finding.`,
      `  - If the finding is tied to a specific changed file/line range, set ` +
        `\`filePath\`/\`lineRangeStart\`/\`lineRangeEnd\`; if you cannot ` +
        `confidently attribute it to a specific location in the diff, set ` +
        `those three fields to \`null\` rather than guessing.`,
      '',
      `At the top level of your response, also provide:`,
      `  - \`overallRiskScore\`: an integer from 0 to 100 summarizing this PR's ` +
        `overall risk (0 = trivial/no risk, 100 = severe risk).`,
      `  - \`summary\`: a short (2-4 sentence) human-readable summary of the ` +
        `PR's overall state.`,
      '',
      modeInstruction,
    ].join('\n');
  }

  private buildUserPrompt(input: PromptBuilderInput): string {
    const fileList =
      input.files.length > 0
        ? input.files
            .map((file) => `- ${file.filename} (${file.status}, +${file.additions}/-${file.deletions})`)
            .join('\n')
        : '(no changed files reported)';

    return [
      `# Pull Request Title`,
      input.prTitle,
      '',
      `# Pull Request Description`,
      input.prDescription ?? 'No description provided.',
      '',
      `# Changed Files (${input.files.length})`,
      fileList,
      '',
      `# Raw Diff`,
      '```diff',
      input.rawDiff,
      '```',
      '',
      `Review this pull request now, following the system instructions exactly.`,
    ].join('\n');
  }
}
