'use client';

import { useRouter, useSearchParams } from 'next/navigation';

// T095 — FR-042.
export function HistoryFilters({
  rounds,
  members,
  lines,
}: {
  rounds: { id: string; round_number: number; line_id: string }[];
  members: { id: string; name: string }[];
  lines: { id: string; name: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const lineFilter = params.get('line') ?? '';

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`/history?${next.toString()}`);
  };

  const selectClass =
    'min-h-[44px] w-full rounded-xl border border-line bg-surface-2 px-3 text-sm text-ink';

  // Round numbers restart on every line, so an unfiltered round list would show several "Round 1"
  // entries with no way to tell them apart. Picking a line narrows it to that line's rounds.
  const visibleRounds = lineFilter ? rounds.filter((r) => r.line_id === lineFilter) : rounds;
  const nameOfLine = (id: string) => lines.find((l) => l.id === id)?.name ?? '';

  return (
    <div className="flex flex-wrap gap-2">
      <label className="min-w-[8rem] flex-1">
        <span className="sr-only">Filter by line</span>
        <select
          className={selectClass}
          value={lineFilter}
          onChange={(e) => {
            // The round filter belongs to the old line; keeping it would return nothing.
            const next = new URLSearchParams(params.toString());
            next.delete('round');
            if (e.target.value) next.set('line', e.target.value);
            else next.delete('line');
            router.push(`/history?${next.toString()}`);
          }}
        >
          <option value="">All lines</option>
          {lines.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>

      <label className="min-w-[8rem] flex-1">
        <span className="sr-only">Filter by round</span>
        <select
          className={selectClass}
          value={params.get('round') ?? ''}
          onChange={(e) => set('round', e.target.value)}
        >
          <option value="">All rounds</option>
          {visibleRounds.map((r) => (
            <option key={r.id} value={r.id}>
              Round {r.round_number}
              {!lineFilter && nameOfLine(r.line_id) && ` · ${nameOfLine(r.line_id)}`}
            </option>
          ))}
        </select>
      </label>

      <label className="min-w-[8rem] flex-1">
        <span className="sr-only">Filter by member</span>
        <select
          className={selectClass}
          value={params.get('member') ?? ''}
          onChange={(e) => set('member', e.target.value)}
        >
          <option value="">All members</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
