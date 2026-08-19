// T084 — FR-019. Both values, so it is clear what the round was ranked on and what comes next.
export function PendingCpBadge({ rankedCp, currentCp }: { rankedCp: number; currentCp: number }) {
  return (
    <span className="text-xs text-accent">
      ranked on <span className="tabular-nums">{rankedCp.toLocaleString()}</span> · now{' '}
      <span className="tabular-nums">{currentCp.toLocaleString()}</span>, applies next round
    </span>
  );
}
