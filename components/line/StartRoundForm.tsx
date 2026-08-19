'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { startRound } from '@/lib/actions/rounds';
import type { OrderingMode } from '@/lib/types/database';

// T063 — FR-020. "Rank by current Combat Power" is preselected, but the choice is explicit:
// applying it silently would make the decision retroactive.
export function StartRoundForm({
  lineId,
  hasPrevious,
  previousNumber,
  pendingChanges,
  preview,
}: {
  lineId: string;
  hasPrevious: boolean;
  previousNumber: number | null;
  pendingChanges: number;
  preview: { name: string; cp: number | null }[];
}) {
  const [mode, setMode] = useState<OrderingMode>('current_cp');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const options: { value: OrderingMode; title: string; detail: string }[] = [
    {
      value: 'current_cp',
      title: 'Rank by current Combat Power',
      detail: pendingChanges
        ? `Applies ${pendingChanges} pending Combat Power change${pendingChanges === 1 ? '' : 's'}.`
        : 'Sequences the round by everyone’s Combat Power as it stands now.',
    },
    {
      value: 'carry_previous',
      title: `Reuse round ${previousNumber ?? ''} sequence`.trim(),
      detail: pendingChanges
        ? `Keeps the previous order. ${pendingChanges} Combat Power change${pendingChanges === 1 ? '' : 's'} stay pending.`
        : 'Keeps exactly the order the last round used. New members are appended.',
    },
    {
      value: 'manual',
      title: 'Arrange by hand',
      detail:
        'Starts from the Combat Power order, then you set it yourself. Combat Power is ignored.',
    },
  ];

  return (
    <div className="space-y-4">
      {/* Shown from the first round now: "arrange by hand" is a choice even with nothing to
          carry forward. carry_previous is the one that needs a previous round. */}
      <fieldset className="space-y-2">
        <legend className="sr-only">Ordering for the new round</legend>
        {options
          .filter((option) => hasPrevious || option.value !== 'carry_previous')
          .map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${
                mode === option.value ? 'border-accent bg-accent/10' : 'border-line bg-surface-2'
              }`}
            >
              <input
                type="radio"
                name="orderingMode"
                value={option.value}
                checked={mode === option.value}
                onChange={() => setMode(option.value)}
                className="mt-1 shrink-0"
              />
              <span className="min-w-0">
                <span className="block font-medium">{option.title}</span>
                <span className="block text-xs text-ink-dim">{option.detail}</span>
              </span>
            </label>
          ))}
      </fieldset>

      <section>
        <h2 className="mb-1.5 text-sm font-medium text-ink-dim">
          {mode === 'carry_previous' ? 'Members in this round' : 'The new line'}
        </h2>
        <ol className="space-y-1">
          {preview.map((m, index) => (
            <li
              key={m.name}
              className="flex items-center gap-3 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm"
            >
              {mode !== 'carry_previous' && (
                <span className="w-5 shrink-0 tabular-nums text-ink-dim">{index + 1}</span>
              )}
              <span className="min-w-0 flex-1 truncate">{m.name}</span>
              <span className="shrink-0 tabular-nums text-ink-dim">
                {m.cp === null ? '—' : m.cp.toLocaleString()}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {error && (
        <p role="alert" className="rounded-xl border border-danger/50 bg-danger/10 p-3 text-sm">
          {error}
        </p>
      )}

      <Button
        className="w-full"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await startRound({ lineId, orderingMode: mode });
            if (!result.ok) setError(result.message);
            else router.push(`/lines/${lineId}`);
          })
        }
      >
        {pending ? 'Starting…' : 'Start round'}
      </Button>
    </div>
  );
}
