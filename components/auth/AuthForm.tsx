'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { createClient } from '@/lib/supabase/client';
import { emailInput, passwordInput } from '@/lib/domain/schemas';

type Mode = 'login' | 'register' | 'forgot' | 'reset';

const COPY: Record<Mode, { title: string; submit: string }> = {
  login: { title: 'Sign in', submit: 'Sign in' },
  register: { title: 'Create an account', submit: 'Create account' },
  forgot: { title: 'Reset your password', submit: 'Send reset link' },
  reset: { title: 'Choose a new password', submit: 'Save password' },
};

type Href = Parameters<ReturnType<typeof useRouter>['push']>[0];

export function AuthForm({ mode, next = '/' }: { mode: Mode; next?: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const submit = () => {
    setError(null);
    setNotice(null);

    if (mode !== 'reset') {
      const parsed = emailInput.safeParse(email);
      if (!parsed.success) return setError(parsed.error.issues[0].message);
    }
    if (mode !== 'forgot') {
      const parsed = passwordInput.safeParse(password);
      if (!parsed.success) return setError(parsed.error.issues[0].message);
    }

    startTransition(async () => {
      const supabase = createClient();

      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return setError('That email and password do not match an account.');
        // `next` arrives from the query string, so it cannot be a typed route literal.
        router.push(next as Href);
        router.refresh();
        return;
      }

      if (mode === 'register') {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) return setError(error.message);
        router.push(next as Href);
        router.refresh();
        return;
      }

      if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/confirm?next=/reset-password`,
        });
        if (error) return setError(error.message);
        // Deliberately not "we found your account" — that would leak which emails are registered.
        return setNotice('If that email has an account, a reset link is on its way.');
      }

      const { error } = await supabase.auth.updateUser({ password });
      if (error) return setError(error.message);
      router.push('/');
      router.refresh();
    });
  };

  return (
    <form
      className="space-y-4 rounded-2xl border border-line bg-surface-2 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <h2 className="text-lg font-semibold">{COPY[mode].title}</h2>

      {mode !== 'reset' && (
        <Field label="Email">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </Field>
      )}

      {mode !== 'forgot' && (
        <Field
          label={mode === 'reset' ? 'New password' : 'Password'}
          hint={mode !== 'login' ? 'At least 8 characters.' : undefined}
        >
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
          />
        </Field>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {notice && <p className="text-sm text-good">{notice}</p>}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Working…' : COPY[mode].submit}
      </Button>

      <div className="flex justify-between text-sm text-ink-dim">
        {mode === 'login' && (
          <>
            <Link href="/register" className="hover:text-ink">
              Create an account
            </Link>
            <Link href="/forgot-password" className="hover:text-ink">
              Forgot password?
            </Link>
          </>
        )}
        {mode !== 'login' && (
          <Link href="/login" className="hover:text-ink">
            Back to sign in
          </Link>
        )}
      </div>
    </form>
  );
}
