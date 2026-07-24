interface DiffPatchViewerProps {
  patch?: string;
}

function lineClassName(line: string): string {
  if (line.startsWith('@@')) {
    return 'bg-blue-50 text-blue-800';
  }
  if (line.startsWith('+++') || line.startsWith('---')) {
    return 'bg-gray-50 text-gray-500';
  }
  if (line.startsWith('+')) {
    return 'bg-green-50 text-green-800';
  }
  if (line.startsWith('-')) {
    return 'bg-red-50 text-red-800';
  }
  return 'text-gray-700';
}

/**
 * Renders a single file's unified diff `patch` string with basic
 * line-by-line syntax coloring (green for additions, red for removals,
 * muted blue for hunk headers, neutral for context). This is a plain
 * split-and-style render rather than a full diff-parsing library — the
 * `patch` format GitHub returns is simple enough that a heavier dependency
 * isn't warranted for this phase.
 *
 * GitHub omits `patch` for binary files, so `patch` is optional — render a
 * placeholder instead of crashing on `undefined`.
 */
export function DiffPatchViewer({ patch }: DiffPatchViewerProps) {
  if (!patch) {
    return (
      <div className="rounded-md border border-dashed border-gray-300 p-4 text-center text-sm text-gray-500">
        Binary file not shown.
      </div>
    );
  }

  const lines = patch.split('\n');

  return (
    <pre className="overflow-x-auto rounded-md border border-gray-200 bg-white font-mono text-xs leading-relaxed">
      <code>
        {lines.map((line, index) => (
          <div key={index} className={`whitespace-pre px-3 py-0.5 ${lineClassName(line)}`}>
            {line.length > 0 ? line : ' '}
          </div>
        ))}
      </code>
    </pre>
  );
}
