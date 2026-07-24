import type { RiskLevel } from '@code-review-coach/shared';

const RISK_STYLES: Record<RiskLevel, string> = {
  LOW: 'bg-green-100 text-green-800',
  MEDIUM: 'bg-amber-100 text-amber-800',
  HIGH: 'bg-red-100 text-red-800',
};

interface RiskLevelBadgeProps {
  level: RiskLevel;
}

/**
 * Small color-coded LOW/MEDIUM/HIGH pill for a finding's risk level. Pure
 * presentational — no hooks or browser APIs, so no 'use client' directive
 * is needed even though it's only ever rendered inside client trees
 * (matches FileStatusBadge's convention).
 */
export function RiskLevelBadge({ level }: RiskLevelBadgeProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold ${RISK_STYLES[level]}`}
    >
      {level}
    </span>
  );
}
