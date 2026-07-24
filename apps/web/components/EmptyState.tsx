interface EmptyStateProps {
  message: string;
}

/** Reusable "nothing here" panel for empty lists. */
export function EmptyState({ message }: EmptyStateProps) {
  return (
    <div className="rounded-md border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
      {message}
    </div>
  );
}
