'use client';

import { useState, useTransition } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { resetRound } from '@/lib/actions/rounds';

// T065 — FR-040. The warning names what is lost; it does not merely say "are you sure?".
export function ResetRoundDialog({
  roundId,
  roundNumber,
  received,
}: {
  roundId: string;
  roundNumber: number;
  received: number;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="min-h-[44px] shrink-0 px-2 text-sm text-ink-dim hover:text-ink"
      >
        Reset
      </button>
      <ConfirmDialog
        open={open}
        pending={pending}
        title={`Reset round ${roundNumber}?`}
        confirmLabel="Reset round"
        body={
          <>
            <p className="mb-2">
              Every distribution recorded in this round will be deleted, and all {received} member
              {received === 1 ? '' : 's'} who have received a skill will become eligible again.
            </p>
            <p>The pick order and round number stay as they are. This cannot be undone.</p>
          </>
        }
        onCancel={() => setOpen(false)}
        onConfirm={() =>
          startTransition(async () => {
            await resetRound({ roundId });
            setOpen(false);
          })
        }
      />
    </>
  );
}
