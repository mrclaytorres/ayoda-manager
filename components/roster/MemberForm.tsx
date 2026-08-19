'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { addMember } from '@/lib/actions/members';
import { combatPowerFromInput, memberName } from '@/lib/domain/schemas';

// T045 / T085 — add a member, with field-level validation feedback.
export function MemberForm({ lineId }: { lineId: string }) {
  const [name, setName] = useState('');
  const [cp, setCp] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [cpError, setCpError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    const parsedName = memberName.safeParse(name);
    const parsedCp = combatPowerFromInput.safeParse(cp);
    setNameError(parsedName.success ? null : parsedName.error.issues[0].message);
    setCpError(parsedCp.success ? null : parsedCp.error.issues[0].message);
    if (!parsedName.success || !parsedCp.success) return;

    startTransition(async () => {
      const result = await addMember({
        lineId,
        name: parsedName.data,
        combatPower: parsedCp.data,
      });
      if (!result.ok) {
        // FR-009 — a duplicate name is a name problem, so it belongs on the name field.
        if (result.code === 'DUP_NAME') setNameError(result.message);
        else setCpError(result.message);
        return;
      }
      setName('');
      setCp('');
      setNameError(null);
      setCpError(null);
    });
  };

  return (
    <form
      className="space-y-3 rounded-2xl border border-line bg-surface-2 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Field label="Member name" error={nameError}>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          autoComplete="off"
        />
      </Field>
      <Field
        label="Combat Power"
        error={cpError}
        hint="Optional. Leave blank on a hand-ordered line."
      >
        <Input
          value={cp}
          onChange={(e) => setCp(e.target.value)}
          inputMode="numeric"
          autoComplete="off"
        />
      </Field>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Adding…' : 'Add member'}
      </Button>
    </form>
  );
}
