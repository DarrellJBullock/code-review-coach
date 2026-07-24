import type { ReviewMode } from '@code-review-coach/shared';

const MODE_LABELS: Record<ReviewMode, string> = {
  PERFORMANCE: 'Performance',
  SECURITY: 'Security',
  ACCESSIBILITY: 'Accessibility',
};

interface ReviewModeTogglesProps {
  modes: Record<ReviewMode, boolean>;
  onChange: (mode: ReviewMode, enabled: boolean) => void;
}

/**
 * Three mode checkboxes (Performance / Security / Accessibility). Purely
 * presentational — the parent Client Component owns the actual state, and
 * maps it into the `modes` object sent on `POST /reviews` when "Run Review"
 * is clicked, so this component needs no hooks of its own.
 */
export function ReviewModeToggles({ modes, onChange }: ReviewModeTogglesProps) {
  return (
    <fieldset className="flex flex-wrap items-center gap-4">
      <legend className="sr-only">Review modes</legend>
      {(Object.keys(MODE_LABELS) as ReviewMode[]).map((mode) => (
        <label key={mode} className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={modes[mode]}
            onChange={(e) => onChange(mode, e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          {MODE_LABELS[mode]}
        </label>
      ))}
    </fieldset>
  );
}
