'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { recordAward } from '@/lib/actions/distribution';
import type { RoundLineRow } from '@/lib/types/database';

/**
 * T049 — the manual award override (FR-031).
 * Only eligible members are listed, so FR-033 cannot be violated from the interface. The database
 * rejects it too, which is what actually guarantees it.
 */
export function ManualAwardDialog({
  distributionId,
  line,
  onError,
}: {
  distributionId: string;
  line: RoundLineRow[];
  onError: (message: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const eligible = line.filter((row) => row.eligible);

  const award = (memberId: string) => {
    const clientActionId = crypto.randomUUID();
    startTransition(async () => {
      const result = await recordAward({
        distributionId,
        memberId,
        mode: 'manual',
        clientActionId,
      });
      if (!result.ok) onError(result.message);
      else {
        onError(null);
        setOpen(false);
      }
    });
  };

  return (
    <>
      <Button variant="secondary" className="w-full" onClick={() => setOpen(true)}>
        Award manually…
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} title="Award manually">
        <p className="mb-4 text-sm text-ink-dim">
          Skips the line. The award is recorded as manual so the history stays honest.
        </p>
        <ul className="space-y-1.5">
          {eligible.map((row) => (
            <li key={row.member_id}>
              <button
                disabled={pending}
                onClick={() => award(row.member_id)}
                className="flex min-h-[44px] w-full items-center justify-between rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-left hover:border-accent disabled:opacity-50"
              >
                <span className="min-w-0 truncate">{row.name}</span>
                <span className="ml-3 shrink-0 text-xs tabular-nums text-ink-dim">
                  #{row.position} · {row.ranked_cp === null ? '—' : row.ranked_cp.toLocaleString()}{' '}
                  CP
                </span>
              </button>
            </li>
          ))}
        </ul>
        {eligible.length === 0 && (
          <p className="text-sm text-ink-dim">Nobody is eligible in this round.</p>
        )}
      </Dialog>
    </>
  );
}
