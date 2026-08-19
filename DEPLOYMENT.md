# Deploying aYoda Manager

Supabase hosts the database and the auth; Vercel hosts the Next.js app. About 20 minutes end to end,
most of it waiting for a project to provision.

Nothing here touches your local setup — `supabase start` and `.env.local` keep working exactly as
they do now, against a completely separate database.

---

## 0. Get the code onto GitHub

The repository has **no commits yet**, and Vercel deploys from a Git remote. So, once:

```bash
git add -A
git commit -m "aYoda Manager"
gh repo create ayoda-manager --private --source=. --push
```

`.gitignore` already excludes `.env.local`, so no keys go up with it. Check that before you push:

```bash
git ls-files | grep -c '^\.env\.local$'   # must print 0
```

---

## 1. Create the Supabase project

In [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.

- **Region** — pick the one nearest your guild, not nearest you. Every action is a round trip.
- **Database password** — generate a strong one and put it in a password manager. You need it in
  step 2, and it is not recoverable afterwards; it can only be reset.

Provisioning takes a couple of minutes.

---

## 2. Push the schema

The 28 migrations in `supabase/migrations/` are the entire schema — tables, row-level security,
views, and every rule the app relies on. Push them from your machine:

```bash
npx supabase@latest login
npx supabase@latest link --project-ref <your-project-ref>
npx supabase@latest db push
```

The project ref is the subdomain of your project URL (`https://<ref>.supabase.co`), also shown under
**Project Settings → General**. `db push` will ask for the database password from step 1.

It prints the migrations it is about to apply — check the list runs from `0001_enums` to
`0028_line_scoped_rpcs`, then confirm.

> **Do not run `supabase db reset` against the hosted project.** It drops everything, including
> `auth.users`. Anyone signed in at the time keeps a JWT that still verifies against a user row that
> no longer exists, so the app looks empty and every save fails. It recovers — the app detects it and
> signs you out — but you will have lost the data.

### Verifying it landed

**Table Editor** should list `lines`, `members`, `items`, `rounds`, `round_entries`,
`distributions`, `offer_responses`, and `profiles`. In **Authentication → Policies**, every one of
those should say **RLS enabled** with four policies. If any table shows RLS disabled, stop and
re-check the push — that is the only thing keeping one account's data away from another's.

---

## 3. Configure auth

**Authentication → URL Configuration**:

| Field             | Value                                                          |
| ----------------- | -------------------------------------------------------------- |
| **Site URL**      | `https://<your-app>.vercel.app` (set it properly after step 5) |
| **Redirect URLs** | `https://<your-app>.vercel.app/auth/confirm`                   |

The password-reset link is built from `window.location.origin`, so it adapts to whatever domain the
app is served from — but Supabase refuses to redirect anywhere not on this allow-list. If reset
links land on an error page, this list is why.

To have reset links work on Vercel preview deployments too, add `https://*.vercel.app/auth/confirm`.

### Email confirmation — decide now

**Authentication → Sign In / Providers → Email → Confirm email** is **on** by default, and the app
is not built for it. `signUp` returns no session when confirmation is required, so registering sends
you straight back to the sign-in screen with no explanation.

**Turn it off.** That matches the local configuration (`enable_confirmations = false`) and the way
the register screen behaves.

The trade-off: someone can register with an address they do not own, and a typo'd address cannot
receive a password reset. For a tool where one officer makes one account, that is a fair price for a
registration flow that works.

If you would rather keep confirmations on, the register branch of `components/auth/AuthForm.tsx`
needs a "check your email" state instead of `router.push`, and `signUp` needs
`emailRedirectTo: ${window.location.origin}/auth/confirm`. Ask and I will make that change.

> Supabase's built-in email sender is rate-limited to a handful of messages an hour and is not meant
> for production. It is fine for one officer resetting a password occasionally. If you ever need
> more, set up a custom SMTP provider under **Project Settings → Auth → SMTP**.

---

## 4. Collect the two values the app needs

**Project Settings → API Keys**:

- `NEXT_PUBLIC_SUPABASE_URL` — the Project URL, `https://<ref>.supabase.co`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — the **publishable** key (`sb_publishable_…`). The older
  **anon public** key works identically if that is what your project shows.

Both are public by design. They are safe in the browser because row-level security decides what they
can actually read, which is why step 2's RLS check mattered.

**The service role key does not go to Vercel.** It bypasses RLS entirely. This project uses it only
to create and destroy throwaway users in the integration tests, and it belongs nowhere near a
deployed app.

---

## 5. Deploy to Vercel

[vercel.com/new](https://vercel.com/new) → import the GitHub repository.

Framework, build command, and output are already pinned in `vercel.json`; leave them alone.

Add both environment variables from step 4, ticked for **Production**, **Preview**, and
**Development**:

```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…
```

Then **Deploy**.

When it finishes, go back to Supabase and set **Site URL** to the real domain from step 3.

---

## 6. Smoke test the deployment

In a fresh browser profile, against the live URL:

1. **Register** → you land on Lines, signed in. _(If you land back on sign-in, email confirmation is
   still on — step 3.)_
2. **New line** → name it, and it opens the roster.
3. **Add member** twice, then **Start a round**.
4. **Add items**, tap one, record a pass and an award.
5. **History** shows the award.
6. **Sign out**, sign back in — everything is still there.
7. Open the app in a **second browser profile** and register a different account. It must see no
   lines, no members, no history. This is the one test worth doing by hand every time, because it is
   the failure that would matter most.

---

## 7. Afterwards

**Shipping a schema change.** Write a new numbered file in `supabase/migrations/`, apply it locally
with `npx supabase@latest migration up`, then:

```bash
npx supabase@latest db push
```

Push code and schema together. A deploy whose code expects a column the database does not have yet
will fail at runtime, not at build.

**Preview deployments** share the production database, because they read the same environment
variables. Anything you do in a preview is real data. If that becomes a problem, make a second
Supabase project and point the Preview environment at it.

**Backups.** The free tier keeps daily backups for 7 days. `delete_round_history` and deleting a line
are both permanent and immediate — the confirmation prompts are the only safety net in front of
them.

**Costs.** A guild-sized roster and its history sit far inside the free tiers of both services. The
usual reason to pay Supabase is the free tier pausing a project after a week of inactivity; it
resumes on the next request, but the first officer to open the app after a quiet week waits a few
seconds for it.
