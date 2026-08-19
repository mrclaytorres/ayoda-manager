import Link from 'next/link';
import { NewLineDialog } from '@/components/lines/NewLineDialog';
import { loadLines } from '@/lib/queries/lines';

// The index. A line is one rotation — its own members, its own items, its own round numbering.
export default async function LinesPage() {
  const lines = await loadLines();

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Lines</h1>
        <NewLineDialog />
      </header>

      {lines.length === 0 ? (
        <p className="text-sm text-ink-dim">
          No lines yet. A line is one rotation — weapons and armour can run side by side, each with
          its own members and items.
        </p>
      ) : (
        <ul className="space-y-2">
          {lines.map((line) => (
            <li key={line.id}>
              <Link
                href={`/lines/${line.id}`}
                className="tap flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3 hover:border-ink-dim"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{line.name}</span>
                  <span className="block text-xs text-ink-dim">
                    {line.round_number
                      ? `Round ${line.round_number} · ${line.received} of ${line.member_count} received`
                      : `${line.member_count} member${line.member_count === 1 ? '' : 's'} · no round in progress`}
                    {line.pool_count > 0 && ` · ${line.pool_count} in the pool`}
                  </span>
                </span>
                <span aria-hidden="true" className="shrink-0 text-ink-dim">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
