'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, Input } from '@/components/ui/Field';
import { PendingCpBadge } from './PendingCpBadge';
import { removeMember, updateMember } from '@/lib/actions/members';
import { combatPowerFromInput, memberName } from '@/lib/domain/schemas';
import type { Member, RoundLineRow } from '@/lib/types/database';

// T083 — one roster row: name, Combat Power, round state, and edit / remove. FR-011 → FR-015.
export function MemberRow({ member, lineRow }: { member: Member; lineRow: RoundLineRow | null }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [name, setName] = useState(member.name);
  const [cp, setCp] = useState(member.combat_power === null ? '' : String(member.combat_power));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () => {
    const parsedName = memberName.safeParse(name);
    const parsedCp = combatPowerFromInput.safeParse(cp);
    if (!parsedName.success) return setError(parsedName.error.issues[0].message);
    if (!parsedCp.success) return setError(parsedCp.error.issues[0].message);

    startTransition(async () => {
      const result = await updateMember({
        id: member.id,
        name: parsedName.data,
        combatPower: parsedCp.data,
      });
      if (!result.ok) setError(result.message);
      else {
        setError(null);
        setEditing(false);
      }
    });
  };

  if (editing) {
    return (
      <li className="space-y-3 rounded-xl border border-accent/50 bg-surface-2 p-3">
        <Field label="Name" error={error}>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        </Field>
        <Field label="Combat Power" hint="Optional. Applies to the next round, not this one.">
          <Input value={cp} onChange={(e) => setCp(e.target.value)} inputMode="numeric" />
        </Field>
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setEditing(false)}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={save} disabled={pending}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2.5">
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{member.name}</span>
        <span className="block text-xs text-ink-dim">
          {lineRow?.cp_change_pending &&
          lineRow.ranked_cp !== null &&
          lineRow.current_cp !== null ? (
            <PendingCpBadge rankedCp={lineRow.ranked_cp} currentCp={lineRow.current_cp} />
          ) : member.combat_power === null ? (
            <span className="italic">no Combat Power</span>
          ) : (
            <>
              <span className="tabular-nums">{member.combat_power.toLocaleString()}</span> CP
            </>
          )}
          {/* Its own line, not appended to the CP: the Edit and Remove buttons leave a narrow
              column here, and inline it would break a long item name across two ragged lines. */}
          {lineRow && !lineRow.eligible && (
            <span className="block text-good">
              received {lineRow.received_item ?? 'this round'}
            </span>
          )}
        </span>
      </span>

      <button
        onClick={() => setEditing(true)}
        className="min-h-[44px] shrink-0 px-2 text-sm text-ink-dim hover:text-ink"
      >
        Edit
      </button>
      <button
        onClick={() => setConfirming(true)}
        className="min-h-[44px] shrink-0 px-2 text-sm text-danger"
      >
        Remove
      </button>

      <ConfirmDialog
        open={confirming}
        pending={pending}
        title={`Remove ${member.name}?`}
        confirmLabel="Remove"
        body={
          <>
            <p className="mb-2">
              They leave the line immediately. If they were the last member still eligible, the
              round completes.
            </p>
            {/* FR-014 — say so plainly, because it is the officer's main worry. */}
            <p>
              Their past awards and passes stay in the history under the name recorded at the time.
            </p>
          </>
        }
        onCancel={() => setConfirming(false)}
        onConfirm={() =>
          startTransition(async () => {
            await removeMember({ id: member.id });
            setConfirming(false);
          })
        }
      />
    </li>
  );
}
