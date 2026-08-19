import type { HistoryEntry } from '@/lib/queries/history';

// T094 — FR-041.
function formatWhen(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function HistoryList({ entries }: { entries: HistoryEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-ink-dim">Nothing recorded yet.</p>;
  }

  return (
    <ul className="space-y-2">
      {entries.map((entry) => (
        <li key={entry.id} className="rounded-xl border border-line bg-surface-2 p-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate font-medium">{entry.item_name}</span>
            <span className="shrink-0 text-xs text-ink-dim">
              {entry.line_name} · Round {entry.round_number}
            </span>
          </div>

          <p className="mt-1 text-sm">
            {entry.status === 'awarded' ? (
              <>
                <span className="text-good">{entry.recipient_name}</span>
                {entry.award_mode === 'manual' && (
                  <span className="ml-2 rounded bg-accent/20 px-1.5 py-0.5 text-xs text-accent">
                    manual award
                  </span>
                )}
              </>
            ) : (
              <span className="text-ink-dim">Unclaimed — nobody took it</span>
            )}
          </p>

          {entry.passers.length > 0 && (
            <p className="mt-1 text-xs text-ink-dim">Passed: {entry.passers.join(', ')}</p>
          )}
          <p className="mt-1 text-xs text-ink-dim">
            {formatWhen(entry.closed_at ?? entry.created_at)}
          </p>
        </li>
      ))}
    </ul>
  );
}
