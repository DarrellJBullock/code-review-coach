interface LoadingSpinnerProps {
  label?: string;
}

/** Small inline spinner + label, reused across every screen's loading state. */
export function LoadingSpinner({ label = 'Loading…' }: LoadingSpinnerProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent"
        role="status"
        aria-label={label}
      />
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  );
}
