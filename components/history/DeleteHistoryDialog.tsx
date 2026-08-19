'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input } from '@/components/ui/Field';
import { deleteRoundHistory } from '@/lib/actions/history';
import { DELETE_CONFIRMATION } from '@/lib/domain/schemas';

/**
 * T098 — the guarded deletion dialog. FR-044, FR-046.
 *
 * The disabled button is a courtesy, not the guard: the server re-checks the literal, so a direct
 * call with no confirmation is refused too.
 */
export function DeleteHistoryDialog({
  rounds,
}: {
  rounds: { id: string; round_number: number; line_name: string; distribution_count: number }[];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const chosen = rounds.filter((r) => selected.includes(r.id));
  const distributionCount = chosen.reduce((n, r) => n + r.distribution_count, 0);
  const matches = confirmation === DELETE_CONFIRMATION;

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const close = () => {
    setOpen(false);
    setSelected([]);
    setConfirmation('');
    setError(null);
  };

  if (rounds.length === 0) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="min-h-[44px] shrink-0 px-2 text-sm text-danger"
      >
        Delete history
      </button>

      <Dialog open={open} onClose={close} title="Delete round history">
        <p className="mb-3 text-sm text-ink-dim">
          Completed rounds only. The round in progress cannot be deleted — reset it instead.
        </p>

        <ul className="mb-4 space-y-1.5">
          {rounds.map((round) => (
            <li key={round.id}>
              <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border border-line bg-surface-2 px-3">
                <input
                  type="checkbox"
                  checked={selected.includes(round.id)}
                  onChange={() => toggle(round.id)}
                />
                <span className="flex-1">
                  {round.line_name} · Round {round.round_number}
                </span>
                <span className="text-xs text-ink-dim">
                  {round.distribution_count} distribution{round.distribution_count === 1 ? '' : 's'}
                </span>
              </label>
            </li>
          ))}
        </ul>

        {selected.length > 0 && (
          <>
            {/* FR-046 — say exactly what is about to be destroyed, before asking. */}
            <p className="mb-3 rounded-xl border border-danger/50 bg-danger/10 p-3 text-sm">
              This permanently destroys <strong>{selected.length}</strong> round
              {selected.length === 1 ? '' : 's'} and <strong>{distributionCount}</strong> recorded
              distribution{distributionCount === 1 ? '' : 's'}. It cannot be undone.
            </p>

            <Field
              label={`Type ${DELETE_CONFIRMATION} to confirm`}
              error={error}
              hint="Case sensitive."
            >
              <Input
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-label={`Type ${DELETE_CONFIRMATION} to confirm`}
              />
            </Field>
          </>
        )}

        <div className="mt-4 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={close} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            disabled={pending || selected.length === 0 || !matches}
            onClick={() =>
              startTransition(async () => {
                const result = await deleteRoundHistory({
                  roundIds: selected,
                  confirmation,
                });
                if (!result.ok) setError(result.message);
                else close();
              })
            }
          >
            {pending ? 'Deleting…' : 'Delete permanently'}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
