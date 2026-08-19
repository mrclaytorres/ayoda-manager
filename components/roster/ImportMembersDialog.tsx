'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { importMembers } from '@/lib/actions/members';
import { parseMembersCsv, planImport, type ImportPlan, type SkippedRow } from '@/lib/domain/csv';

interface Existing {
  name: string;
  combat_power: number | null;
}

export function ImportMembersDialog({
  lineId,
  existing,
  roundInProgress,
}: {
  lineId: string;
  existing: Existing[];
  roundInProgress: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [skipped, setSkipped] = useState<SkippedRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setFileName(null);
    setPlan(null);
    setSkipped([]);
    setError(null);
    setDone(null);
  };

  const close = () => {
    setOpen(false);
    reset();
  };

  const readFile = async (file: File) => {
    reset();
    setFileName(file.name);
    const text = await file.text();
    const parsed = parseMembersCsv(text);
    setSkipped(parsed.skipped);
    setPlan(planImport(parsed.rows, existing));
  };

  const changeCount = plan ? plan.toAdd.length + plan.toUpdate.length : 0;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="min-h-[44px] shrink-0 px-2 text-sm text-ink-dim hover:text-ink"
      >
        Import CSV
      </button>

      <Dialog open={open} onClose={close} title="Import roster from CSV">
        {!done && (
          <>
            <p className="mb-3 text-sm text-ink-dim">
              A file with a name and a Combat Power per line, like{' '}
              <code className="text-ink">ign,combat_power</code>. Members already on the roster have
              their Combat Power updated; nobody is removed.
            </p>

            <label className="mb-4 flex min-h-[44px] cursor-pointer items-center justify-center rounded-xl border border-dashed border-line bg-surface-2 px-3 py-3 text-sm">
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                className="sr-only"
                aria-label="Choose a CSV file"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void readFile(file);
                }}
              />
              {fileName ?? 'Choose a CSV file…'}
            </label>
          </>
        )}

        {done && (
          <p className="mb-4 rounded-xl border border-good/50 bg-good/10 p-3 text-sm">{done}</p>
        )}

        {plan && !done && (
          <div className="mb-4 space-y-3 text-sm">
            <ul className="space-y-1">
              <li className="flex justify-between">
                <span>New members</span>
                <span className="tabular-nums text-good">{plan.toAdd.length}</span>
              </li>
              <li className="flex justify-between">
                <span>Combat Power updated</span>
                <span className="tabular-nums text-accent">{plan.toUpdate.length}</span>
              </li>
              <li className="flex justify-between text-ink-dim">
                <span>Already correct</span>
                <span className="tabular-nums">{plan.unchanged.length}</span>
              </li>
              {skipped.length > 0 && (
                <li className="flex justify-between text-danger">
                  <span>Skipped</span>
                  <span className="tabular-nums">{skipped.length}</span>
                </li>
              )}
            </ul>

            {/* FR-018: say plainly that this cannot disturb the round in progress. */}
            {roundInProgress && plan.toUpdate.length > 0 && (
              <p className="rounded-xl border border-line bg-surface-2 p-3 text-xs text-ink-dim">
                A round is in progress. Updated Combat Power will not reorder it — the new values
                apply from the next round.
              </p>
            )}
            {roundInProgress && plan.toAdd.length > 0 && (
              <p className="rounded-xl border border-line bg-surface-2 p-3 text-xs text-ink-dim">
                {plan.toAdd.length} new member{plan.toAdd.length === 1 ? '' : 's'} will join the
                round in progress, placed by Combat Power.
              </p>
            )}

            {skipped.length > 0 && (
              <details className="rounded-xl border border-danger/40 bg-danger/5 p-3">
                <summary className="cursor-pointer text-danger">
                  {skipped.length} row{skipped.length === 1 ? '' : 's'} will be skipped
                </summary>
                <ul className="mt-2 space-y-1 text-xs text-ink-dim">
                  {skipped.map((row) => (
                    <li key={row.line}>
                      <span className="text-ink">Line {row.line}</span>: {row.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {changeCount === 0 && (
              <p className="text-ink-dim">Nothing to import — the roster already matches.</p>
            )}
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="mb-4 rounded-xl border border-danger/50 bg-danger/10 p-3 text-sm"
          >
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={close} disabled={pending}>
            {done ? 'Close' : 'Cancel'}
          </Button>
          {!done && (
            <Button
              className="flex-1"
              disabled={pending || changeCount === 0}
              onClick={() =>
                startTransition(async () => {
                  if (!plan) return;
                  const rows = [...plan.toAdd, ...plan.toUpdate].map((r) => ({
                    name: r.name,
                    combatPower: r.combatPower,
                  }));
                  const result = await importMembers({ lineId, rows });
                  if (!result.ok) return setError(result.message);
                  const { inserted, updated } = result.data;
                  setDone(
                    `Imported. ${inserted} member${inserted === 1 ? '' : 's'} added, ` +
                      `${updated} Combat Power value${updated === 1 ? '' : 's'} updated.`,
                  );
                })
              }
            >
              {pending
                ? 'Importing…'
                : `Import ${changeCount} change${changeCount === 1 ? '' : 's'}`}
            </Button>
          )}
        </div>
      </Dialog>
    </>
  );
}
