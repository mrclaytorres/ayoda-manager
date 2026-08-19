import Link from 'next/link';
import { Mark } from '@/components/ui/Mark';

export const metadata = {
  title: 'Guide · aYoda Manager',
  description: 'How to run a loot rotation in aYoda Manager.',
};

const SECTIONS = [
  ['what-it-does', 'What this app does'],
  ['first-run', 'Setting up the first time'],
  ['lines', 'Lines'],
  ['roster', 'The roster'],
  ['import', 'Importing a roster from CSV'],
  ['starting', 'Starting a round'],
  ['reading', 'Reading the line'],
  ['rearranging', 'Rearranging the line'],
  ['pool', 'The item pool'],
  ['distributing', 'Handing an item out'],
  ['mistakes', 'Fixing mistakes'],
  ['completion', 'Finishing a round'],
  ['history', 'History'],
  ['safety', 'What the app will not let you get wrong'],
  ['reference', 'Every button, in one place'],
] as const;

function H({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-4 border-b border-line pb-1.5 pt-6 text-lg font-semibold">
      {children}
    </h2>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="pt-4 text-sm font-semibold text-ink">{children}</h3>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="pt-2 text-sm leading-relaxed text-ink-dim">{children}</p>;
}

function UL({ children }: { children: React.ReactNode }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5 pt-2 text-sm leading-relaxed text-ink-dim">
      {children}
    </ul>
  );
}

/** A control the reader will look for on screen, spelled exactly as the button is labelled. */
function B({ children }: { children: React.ReactNode }) {
  return <span className="font-medium text-ink">{children}</span>;
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 rounded-xl border border-line bg-surface-2 p-3 text-sm leading-relaxed text-ink-dim">
      {children}
    </p>
  );
}

export default function GuidePage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-16">
      <header className="sticky top-0 z-10 -mx-4 flex items-center gap-2 border-b border-line bg-surface px-4 py-3">
        <Mark className="h-6 w-6 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold tracking-wide">
          aYoda Manager · Guide
        </span>
        <Link
          href="/"
          className="tap flex min-h-[44px] shrink-0 items-center px-2 text-sm text-ink-dim hover:text-ink"
        >
          Close
        </Link>
      </header>

      <nav className="pt-5">
        <h1 className="text-xl font-semibold">How to use this app</h1>
        <ol className="mt-3 space-y-1 text-sm">
          {SECTIONS.map(([id, label], index) => (
            <li key={id} className="flex gap-2">
              <span className="w-5 shrink-0 tabular-nums text-ink-dim">{index + 1}.</span>
              <a href={`#${id}`} className="text-accent hover:underline">
                {label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <H id="what-it-does">What this app does</H>
      <P>
        A guild drops loot faster than it can argue about who gets it. This app keeps the answer
        written down.
      </P>
      <P>
        Everyone stands in a line. The item is offered to whoever is first. They take it or they
        pass. If they pass, it moves to the next person, and so on down the line. Whoever takes an
        item steps out of the line for the rest of the round — passing costs nothing, so a member
        who passes stays exactly where they are and can take the next item. When the last eligible
        member has received something, the round is complete and everybody starts again.
      </P>
      <P>
        Nothing about that rule is enforced by memory or goodwill. The app records every pass and
        every award, shows the same order to every device, and refuses to give one member two items
        in a round.
      </P>

      <H id="first-run">Setting up the first time</H>
      <UL>
        <li>
          Create an account with an email address and a password of at least 8 characters. One
          account holds the whole guild&rsquo;s data; members do not sign in.
        </li>
        <li>
          Forgotten passwords are reset from <B>Forgot password?</B> on the sign-in screen. The
          reply is the same whether or not the address has an account, so nobody can use the form to
          find out who is registered.
        </li>
        <li>
          Create your first line, add its members, then start a round. Those three steps are the
          whole setup.
        </li>
      </UL>

      <H id="lines">Lines</H>
      <P>
        A <B>line</B> is one rotation. It has its own members, its own item pool, and its own round
        numbering. The app opens on the list of them.
      </P>
      <P>
        You can run as many as you need at the same time. If weapons and armour are handed out
        separately, make them separate lines: each keeps its own round, so an award on one does not
        take anybody out of the other. Every line has its own Round 1.
      </P>
      <P>
        Members belong to the line, not to the account. The same person taking part in two lines is
        two separate entries, each with its own Combat Power, edited separately. That is deliberate
        — someone can sit near the top of one rotation and the bottom of another.
      </P>
      <H3>Renaming and deleting</H3>
      <P>
        <B>Settings</B>, at the top right of a line, renames it. The same panel deletes it, which
        also destroys that line&rsquo;s members, its item pool, every round it has run, and their
        history. Nothing outside the line is touched. Because none of that comes back, you have to
        type the line&rsquo;s name — exactly, capitals included — before the delete button will
        work.
      </P>

      <H id="roster">The roster</H>
      <P>
        The <B>Roster</B> tab inside a line is who takes part in it. Add a member with a name and,
        optionally, a Combat Power.
      </P>
      <H3>Combat Power is optional</H3>
      <P>
        Leave it blank on a line whose order you set by agreement rather than by numbers. Blank and
        zero are different answers: zero is a real ranking and sorts above blank, while blank means
        &ldquo;not measured&rdquo; and sorts below everyone who has a number. A member with no
        Combat Power shows <B>no Combat Power</B> rather than 0.
      </P>
      <H3>Editing</H3>
      <UL>
        <li>Names must be unique within the line, ignoring capitals and surrounding spaces.</li>
        <li>
          Combat Power can be edited at any time, including mid-round. It will <em>not</em> reorder
          a round that is already running — the round was ranked on the values as they stood when it
          started. The row shows the old and new values side by side until a new round adopts the
          new one.
        </li>
        <li>
          <B>Remove</B> takes a member out of the line immediately. Their past awards and passes
          stay in the history under the name recorded at the time. If they were the last member
          still eligible, removing them completes the round.
        </li>
        <li>
          Someone added while a round is running joins that round straight away, placed by Combat
          Power. If there is nothing to place them by — the order was set by hand, or they have no
          Combat Power — they go to the back rather than to a guessed position.
        </li>
      </UL>

      <H id="import">Importing a roster from CSV</H>
      <P>
        <B>Import CSV</B> on the roster reads a file with a name and a Combat Power per line:
      </P>
      <pre className="mt-2 overflow-x-auto rounded-xl border border-line bg-surface-2 p-3 text-xs text-ink">
        {`ign,combat_power
LaLlorona,120993
Atherine,111153
BeeLzieBuB,`}
      </pre>
      <UL>
        <li>
          The first column may be headed <code className="text-ink">ign</code>,{' '}
          <code className="text-ink">name</code>, or{' '}
          <code className="text-ink">character name</code>; the second{' '}
          <code className="text-ink">combat_power</code>, <code className="text-ink">cp</code>, or{' '}
          <code className="text-ink">power</code>.
        </li>
        <li>
          Windows line endings, a spreadsheet&rsquo;s byte-order mark, quoted fields, and thousands
          separators pasted out of the game client are all handled.
        </li>
        <li>A blank Combat Power imports as unranked. A negative or non-numeric one is skipped.</li>
        <li>
          You see exactly what will happen — how many are new, how many change, how many already
          match, and every skipped row with its line number — <em>before</em> anything is written.
        </li>
        <li>
          Importing adds and updates. It never removes: somebody on the roster but absent from the
          file is left alone, because removing a member is a deliberate act with its own
          confirmation.
        </li>
        <li>
          It is all-or-nothing. If any row is rejected, nothing is imported, so you are never left
          guessing which half landed.
        </li>
      </UL>

      <H id="starting">Starting a round</H>
      <P>
        With members on the roster, <B>Start a round</B> asks how to sequence it. The choice is
        always explicit — the app never starts a round for you, because the ordering decision would
        then be made retroactively.
      </P>
      <UL>
        <li>
          <B>Rank by current Combat Power</B> — sequences by everyone&rsquo;s Combat Power as it
          stands now, highest first. This applies any edits made since the last round.
        </li>
        <li>
          <B>Reuse round N sequence</B> — keeps exactly the order the previous round used. Members
          who joined since are appended to the end. Combat Power edits stay pending. Offered only
          once there is a previous round to reuse.
        </li>
        <li>
          <B>Arrange by hand</B> — starts from the Combat Power order and then leaves it to you.
          Combat Power is ignored for this round, so a line with none works fine.
        </li>
      </UL>
      <Note>
        Once a round starts, its order is fixed. No edit to anybody&rsquo;s Combat Power will
        reshuffle it. The only thing that changes a live round&rsquo;s order is you rearranging it
        deliberately.
      </Note>

      <H id="reading">Reading the line</H>
      <P>Each row shows the position, the name, and the Combat Power the round was ranked on.</P>
      <UL>
        <li>
          A dimmed row with <B>received &lt;item&gt;</B> on the right is somebody who has already
          had their turn this round, and what they took.
        </li>
        <li>
          <B>passed</B> on the right marks somebody who has passed on the item currently being
          handed out. They are still eligible.
        </li>
        <li>
          <B>→ 90,000 next round</B> means their Combat Power was edited after this round started.
          The round still uses the old value; the new one applies from the next round.
        </li>
        <li>
          <B>tied</B> marks equal Combat Power, so you can settle it by whatever convention the
          guild uses. The app keeps tied members in a fixed order rather than shuffling them between
          page loads.
        </li>
      </UL>

      <H id="rearranging">Rearranging the line</H>
      <P>
        <B>Rearrange the line</B> opens the order with a ▲ and ▼ beside every member. Move people
        where you want them and press <B>Save order</B>. Nothing changes until you save, so a
        half-finished rearrangement is never what the guild sees.
      </P>
      <P>
        This works at any point while the round is active, including after items have been handed
        out. If you move somebody to the top while an item is being offered, the offer moves to
        them.
      </P>
      <P>
        A round that started from Combat Power and was then rearranged says so —{' '}
        <B>ranked by current Combat Power, then rearranged</B> — rather than pretending it was
        arranged by hand all along.
      </P>

      <H id="pool">The item pool</H>
      <P>
        <B>Add items</B> takes a whole loot list at once, one item per line. Paste or type them all
        and add them in one go.
      </P>
      <UL>
        <li>
          Duplicates are kept apart. Two of the same item can drop in one night, and merging them
          would lose one.
        </li>
        <li>
          The pool belongs to the line and survives closing the app, so a list entered after a raid
          is still there tomorrow and on another device.
        </li>
        <li>
          Each item is a button. Tap the name to hand that one out — any of them, in any order. The
          pool is a list to pick from, not a queue.
        </li>
        <li>
          <B>×</B> beside an item removes it without handing it out, for the ones typed by mistake.
        </li>
      </UL>

      <H id="distributing">Handing an item out</H>
      <P>
        Tapping an item&rsquo;s name starts a distribution. The screen leads with the item and whose
        turn it is, then two buttons:
      </P>
      <UL>
        <li>
          <B>&lt;name&gt; passes</B> — they do not want it. The offer moves to the next eligible
          member and they keep their place for the next item.
        </li>
        <li>
          <B>Award to &lt;name&gt;</B> — they take it. They leave the line for the rest of the round
          and the item is recorded against their name.
        </li>
      </UL>
      <H3>When the sequence is not the answer</H3>
      <UL>
        <li>
          <B>Award manually…</B> gives the item to any eligible member, skipping the sequence. Use
          it for an agreement made outside the app. It is marked as a manual award in the history,
          so the record stays honest.
        </li>
        <li>
          <B>Record as unclaimed</B> appears once everybody eligible has passed. Nobody leaves the
          line, the round position is unchanged, and the history records that the item was offered
          and refused.
        </li>
      </UL>

      <H id="mistakes">Fixing mistakes</H>
      <UL>
        <li>
          <B>Undo last action</B> takes back the most recent pass or award and puts the line back
          exactly as it was. If the award completed the round, undoing it reopens the round.
        </li>
        <li>
          <B>← Back to the pool</B> abandons the whole distribution — for when you started on the
          wrong item. The item returns to the pool and nothing reaches the history, because nothing
          happened. If passes have already been recorded it tells you how many will be discarded and
          asks first.
        </li>
      </UL>
      <Note>
        <B>Record as unclaimed</B> and <B>← Back to the pool</B> are not the same. Unclaimed means
        the item was offered and nobody took it, which is a real event worth recording. Back to the
        pool means the distribution should never have started, so it leaves no trace.
      </Note>

      <H id="completion">Finishing a round</H>
      <P>
        When the last eligible member has received an item, the round is complete. The app does not
        start the next one by itself — it waits, and asks how you want the next round sequenced.
      </P>
      <P>
        A round also completes if the last member who had not yet received anything is removed from
        the roster, so a departure cannot leave a round stuck with an empty line.
      </P>
      <H3>Resetting</H3>
      <P>
        <B>Reset</B> beside the round number restarts the round in progress. Everyone becomes
        eligible again, every award and pass recorded in that round is cleared, and the items it had
        handed out return to the pool. The round keeps its number and its order — resetting is not
        re-ranking. It asks for confirmation first, because the progress is gone for good.
      </P>

      <H id="history">History</H>
      <P>
        <B>History</B> lists every settled distribution, newest first: the item, who took it,
        whether it was a manual award, everybody who passed, the line, the round number, and the
        time. Removed members keep the name they had at the time.
      </P>
      <P>
        Filter by line, by round, or by member. Filtering by member shows everything they took part
        in, not only what they won. Round numbers restart on each line, so the round filter narrows
        to one line&rsquo;s rounds once a line is chosen.
      </P>
      <H3>Deleting history</H3>
      <P>
        <B>Delete history</B> permanently destroys whole completed rounds — their distributions and
        every response in them. It is guarded three ways: you can only pick rounds that have
        finished, you are told how many rounds and distributions will go, and you have to type{' '}
        <B>YES</B> in capitals. Near misses like &ldquo;yes&rdquo; or &ldquo;Y&rdquo; are refused
        rather than quietly accepted. The check is enforced by the server, not just the screen.
      </P>
      <P>The round in progress cannot be deleted. Reset it instead.</P>

      <H id="safety">What the app will not let you get wrong</H>
      <UL>
        <li>
          <B>No double dipping.</B> A member cannot receive two items in the same round, even if two
          devices try at the same moment.
        </li>
        <li>
          <B>No duplicate records.</B> If a tap fails on a bad connection, retrying is safe — the
          same action cannot be recorded twice.
        </li>
        <li>
          <B>One distribution at a time per line.</B> A second cannot start while one is open, so
          two people can never be mid-offer on the same rotation.
        </li>
        <li>
          <B>Your data is yours.</B> No other account can read or change anything of yours by any
          route through the app.
        </li>
        <li>
          <B>Stale screens are refused, not obeyed.</B> If a second device is showing an old line,
          its pass or award names the wrong member and is rejected with a message rather than
          silently applied to whoever happens to be first.
        </li>
      </UL>

      <H id="reference">Every button, in one place</H>
      {/* A list rather than a table: three columns at 360px means either a squeezed
          description or sideways scrolling, and this is the page someone reads on their phone. */}
      <dl className="mt-3 space-y-2">
        {(
          [
            ['New line', 'Lines', 'Creates a rotation and opens its roster'],
            ['Settings', 'Inside a line', 'Renames the line, or deletes it and everything in it'],
            ['Add member', 'Roster', 'Adds one person; Combat Power optional'],
            ['Import CSV', 'Roster', 'Bulk adds and updates from a file, previewed first'],
            ['Edit / Remove', 'Roster row', 'Changes a member, or takes them out of the line'],
            ['Start a round', 'Line', 'Asks how to sequence it, then opens the round'],
            ['Add items', 'Line', 'Adds a whole loot list, one item per line'],
            ['The item name', 'Item pool', 'Starts handing that item out'],
            ['\u00d7', 'Item pool', 'Removes an item without handing it out'],
            ['Rearrange the line', 'Line', 'Sets the order by hand, mid-round included'],
            ['<name> passes', 'Distribution', 'Moves the offer on; they stay eligible'],
            ['Award to <name>', 'Distribution', 'Gives them the item; they leave the line'],
            [
              'Award manually\u2026',
              'Distribution',
              'Gives it to anyone eligible, marked as manual',
            ],
            ['Record as unclaimed', 'Distribution', 'Settles an item nobody took'],
            ['Undo last action', 'Distribution', 'Takes back the last pass or award'],
            [
              '\u2190 Back to the pool',
              'Distribution',
              'Abandons it; the item returns and nothing is recorded',
            ],
            ['Reset', 'Round header', 'Restarts the round; progress is cleared'],
            ['Delete history', 'History', 'Destroys completed rounds; needs YES in capitals'],
          ] as const
        ).map(([control, where, does]) => (
          <div key={control} className="rounded-xl border border-line bg-surface-2 p-3">
            <dt className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium text-ink">{control}</span>
              <span className="text-xs text-ink-dim">{where}</span>
            </dt>
            <dd className="pt-1 text-sm leading-relaxed text-ink-dim">{does}</dd>
          </div>
        ))}
      </dl>

      <p className="pt-8 text-sm">
        <Link href="/" className="text-accent hover:underline">
          ‹ Back to the app
        </Link>
      </p>
    </div>
  );
}
