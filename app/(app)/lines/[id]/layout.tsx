import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LineSettings } from '@/components/lines/LineSettings';
import { loadLine } from '@/lib/queries/lines';

/**
 * Everything below here is scoped to one line. The name and its two screens live in the layout so
 * they survive navigation between the board and the roster.
 */
export default async function LineLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const line = await loadLine(id);
  if (!line) notFound();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link
          href="/"
          aria-label="Back to all lines"
          className="tap -ml-2 flex min-h-[44px] items-center px-2 text-ink-dim hover:text-ink"
        >
          ‹
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{line.name}</h1>
        <LineSettings line={line} />
      </div>

      <nav className="flex gap-2 border-b border-line">
        <Link
          href={`/lines/${id}`}
          className="tap flex min-h-[44px] items-center px-3 text-sm text-ink-dim hover:text-ink"
        >
          Line
        </Link>
        <Link
          href={`/lines/${id}/roster`}
          className="tap flex min-h-[44px] items-center px-3 text-sm text-ink-dim hover:text-ink"
        >
          Roster
        </Link>
      </nav>

      {children}
    </div>
  );
}
