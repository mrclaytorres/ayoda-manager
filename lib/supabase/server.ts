// T020 — server client for Server Components, Server Actions, and Route Handlers.
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  // Next 16 removed the synchronous form entirely — this await is required, not stylistic.
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        // Only getAll/setAll. The individual get/set/remove methods are deprecated and break
        // session handling.
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot write cookies. The proxy refreshes the session instead,
            // so swallowing this is correct rather than merely convenient.
          }
        },
      },
    },
  );
}
