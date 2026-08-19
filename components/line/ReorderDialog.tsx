'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { setRoundOrder } from '@/lib/actions/rounds';
import type { RoundLineRow } from '@/lib/types/database';

/**
 * Arrange the line by hand (FR-057).
 *
 * Move buttons rather than drag-and-drop: dragging a list inside a scrolling dialog on a phone is
 * fiddly and unreachable by keyboard, and this is the screen where getting the order wrong is the
 * whole problem.
 *
 * The draft is local until Save, so a half-finished rearrangement is never what the line shows.
 */
export function ReorderDialog({ roundId, line }: { roundId: string; line: RoundLineRow[] }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<RoundLineRow[]>(line);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const start = () => {
    setDraft(line);
    setError(null);
    setOpen(true);
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= draft.length) return;
    const next = [...draft];
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row);
    setDraft(next);
  };

  const save = () => {
    startTransition(async () => {
      const result = await setRoundOrder({
        roundId,
        memberIds: draft.map((row) => row.member_id),
      });
      if (!result.ok) return setError(result.message);
      setOpen(false);
    });
  };

  return (
    <>
      <Button variant="secondary" className="w-full" onClick={start}>
        Rearrange the line
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} title="Rearrange the line">
        <p className="mb-3 text-sm text-ink-dim">
          Move members into the order you want. Nothing changes until you save.
        </p>

        {error && (
          <p
            role="alert"
            className="mb-3 rounded-xl border border-danger/50 bg-danger/10 p-3 text-sm"
          >
            {error}
          </p>
        )}

        <ol className="mb-4 space-y-1.5">
          {draft.map((row, index) => (
            <li
              key={row.member_id}
              className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 py-1.5 pl-3 pr-1.5"
            >
              <span className="w-5 shrink-0 text-sm tabular-nums text-ink-dim">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate text-sm">
                {row.name}
                {!row.eligible && <span className="ml-2 text-xs text-good">received</span>}
              </span>
              <button
                onClick={() => move(index, index - 1)}
                disabled={index === 0}
                aria-label={`Move ${row.name} up`}
                className="shrink-0 px-2.5 text-ink-dim hover:text-ink disabled:opacity-30"
              >
                ▲
              </button>
              <button
                onClick={() => move(index, index + 1)}
                disabled={index === draft.length - 1}
                aria-label={`Move ${row.name} down`}
                className="shrink-0 px-2.5 text-ink-dim hover:text-ink disabled:opacity-30"
              >
                ▼
              </button>
            </li>
          ))}
        </ol>

        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button className="flex-1" onClick={save} disabled={pending}>
            {pending ? 'Saving…' : 'Save order'}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
