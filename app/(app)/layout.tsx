import Link from 'next/link';
import { Footer } from '@/components/ui/Footer';
import { Mark } from '@/components/ui/Mark';
import { createClient } from '@/lib/supabase/server';
import { signOut } from '@/lib/actions/auth';

const NAV = [
  { href: '/', label: 'Lines' },
  { href: '/history', label: 'History' },
] as const;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = (data?.claims as { email?: string } | undefined)?.email ?? '';

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
      {/* Title row and tabs ride together and stay put while the line scrolls, so the
          tabs are always one thumb-reach away without covering the end of the page. */}
      <div className="sticky top-0 z-10 bg-surface">
        <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          {/* min-w-0 is what lets truncate actually work inside a flex row; without it a long
              name forces the header wider than a 360px screen. */}
          <span className="flex min-w-0 items-center gap-2">
            <Mark className="h-6 w-6 shrink-0" />
            <span className="truncate text-sm font-semibold tracking-wide">aYoda Manager</span>
          </span>
          <div className="flex shrink-0 items-center">
            {/* Labelled, not a glyph: the accessible name and the visible text are the same
                word, which a "?" cannot manage. */}
            <Link
              href="/guide"
              className="tap flex min-h-[44px] items-center px-2 text-sm text-ink-dim hover:text-ink"
            >
              Help
            </Link>
            <form action={signOut} className="flex items-center">
              <span className="mr-2 hidden text-xs text-ink-dim sm:inline">{email}</span>
              <button className="min-h-[44px] px-2 text-sm text-ink-dim hover:text-ink">
                Sign out
              </button>
            </form>
          </div>
        </header>

        <nav className="flex border-b border-line">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="tap flex flex-1 items-center justify-center py-3 text-sm text-ink-dim hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>

      <main className="flex-1 px-4 pb-8 pt-4">{children}</main>

      <Footer />
    </div>
  );
}
