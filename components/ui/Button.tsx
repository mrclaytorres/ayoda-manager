import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-surface font-semibold hover:brightness-110',
  secondary: 'bg-surface-2 text-ink border border-line hover:border-ink-dim',
  danger: 'bg-danger text-surface font-semibold hover:brightness-110',
  ghost: 'bg-transparent text-ink-dim hover:text-ink',
};

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-base transition disabled:cursor-not-allowed disabled:opacity-45 ${VARIANTS[variant]} ${className}`}
    />
  );
}
