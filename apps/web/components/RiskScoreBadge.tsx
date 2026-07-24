interface RiskScoreBadgeProps {
  score: number | null;
}

interface Band {
  bg: string;
  text: string;
  label: string;
}

/**
 * `overallRiskScore` is a 0-100 scale where a *higher* number means *higher*
 * risk. These thresholds (>=70 high, >=40 medium, else low) are shared with
 * the backend — `GET /reviews`'s `riskLevel` filter buckets scores using the
 * same cutoffs (see apps/api/src/reviews/reviews.controller.ts) — so this is
 * the canonical definition of the LOW/MEDIUM/HIGH bands, not a guess.
 */
function bandFor(score: number): Band {
  if (score >= 70) return { bg: 'bg-red-100', text: 'text-red-800', label: 'High risk' };
  if (score >= 40) return { bg: 'bg-amber-100', text: 'text-amber-800', label: 'Medium risk' };
  return { bg: 'bg-green-100', text: 'text-green-800', label: 'Low risk' };
}

/**
 * Prominent overall-risk-score badge, red/amber/green banded. Pure
 * presentational — no hooks or browser APIs needed.
 */
export function RiskScoreBadge({ score }: RiskScoreBadgeProps) {
  if (score === null) {
    return (
      <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-sm font-semibold text-gray-500">
        Score pending
      </span>
    );
  }

  const band = bandFor(score);

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${band.bg} ${band.text}`}
    >
      <span className="text-lg font-bold leading-none">{score}</span>
      <span>{band.label}</span>
    </span>
  );
}
