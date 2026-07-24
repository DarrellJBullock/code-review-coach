import type { PullRequestChangedFileDto } from '@code-review-coach/shared';
import { FileStatusBadge } from './FileStatusBadge';

interface DiffFileListProps {
  files: PullRequestChangedFileDto[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
}

/**
 * Sidebar list of a PR's changed files. Purely presentational — the parent
 * (a Client Component) owns the "which file is selected" state and passes
 * it in, so this component needs no hooks of its own.
 */
export function DiffFileList({ files, selectedIndex, onSelect }: DiffFileListProps) {
  return (
    <ul className="flex flex-col divide-y divide-gray-200">
      {files.map((file, index) => (
        <li key={file.filename}>
          <button
            type="button"
            onClick={() => onSelect(index)}
            className={`flex w-full flex-col gap-1 px-3 py-2 text-left text-sm hover:bg-gray-50 ${
              selectedIndex === index ? 'bg-indigo-50' : ''
            }`}
          >
            <span
              className="truncate font-mono text-xs text-gray-900"
              title={file.filename}
            >
              {file.filename}
            </span>
            <span className="flex items-center gap-2">
              <FileStatusBadge status={file.status} />
              <span className="text-xs">
                <span className="text-green-700">+{file.additions}</span>{' '}
                <span className="text-red-700">-{file.deletions}</span>
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
