import { Suspense } from 'react';
import { DeleteHistoryDialog } from '@/components/history/DeleteHistoryDialog';
import { HistoryFilters } from '@/components/history/HistoryFilters';
import { HistoryList } from '@/components/history/HistoryList';
import { loadDeletableRounds, loadHistory, loadRoundsAndMembers } from '@/lib/queries/history';

// T093
export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ member?: string; round?: string; line?: string }>;
}) {
  const { member, round, line } = await searchParams;
  const [entries, { rounds, members, lines }, deletable] = await Promise.all([
    loadHistory({ memberId: member, roundId: round, lineId: line }),
    loadRoundsAndMembers(),
    loadDeletableRounds(),
  ]);

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <h1 className="text-xl font-semibold">History</h1>
        <DeleteHistoryDialog rounds={deletable} />
      </header>

      <Suspense fallback={null}>
        <HistoryFilters rounds={rounds} members={members} lines={lines} />
      </Suspense>

      <HistoryList entries={entries} />
    </div>
  );
}
