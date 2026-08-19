import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'aYoda Manager',
  description: 'Round-robin item loot distribution for RF Online Next guilds.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    /*
     * suppressHydrationWarning on <html> and <body> only.
     *
     * Browser extensions write attributes onto these two elements before React hydrates —
     * Dark Reader adds data-darkreader-*, Grammarly adds data-gr-ext-installed — so the client DOM
     * legitimately differs from the server HTML and React reports a mismatch the app cannot fix.
     *
     * The flag applies one level deep: it silences attribute differences on these elements and
     * nothing else, so a genuine mismatch anywhere inside the tree is still reported.
     */
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh bg-surface text-ink antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
