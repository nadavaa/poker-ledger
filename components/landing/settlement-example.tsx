import { formatCents } from '@/lib/money'
import {
  demoNets,
  demoTransfers,
  playerName,
  seedBuyIns,
  seedCounts,
} from '@/lib/landing-demo'

// Computed with the same settle() the app and the demo use. The count in the
// demo starts $3 short; here Sam owns that $3, as a table might agree.
export function SettlementExample() {
  const buyIns = seedBuyIns()
  const counts = { ...seedCounts(), sam: 4300 }
  const nets = demoNets(buyIns, counts)
  const transfers = demoTransfers(buyIns, counts) ?? []

  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 text-sm">
      <p className="text-muted-foreground">
        Six invented players, $20 buy-ins, 100 chips to the dollar. The pot is
        $200. Sam owned a $3 miscount.
      </p>
      <table className="w-full text-left">
        <caption className="sr-only">Net result for each player</caption>
        <thead>
          <tr className="text-xs uppercase tracking-[0.06em] text-muted-foreground">
            <th scope="col" className="pb-1 font-medium">
              Player
            </th>
            <th scope="col" className="pb-1 text-right font-medium">
              Net
            </th>
          </tr>
        </thead>
        <tbody>
          {nets.map((n) => (
            <tr key={n.memberId} className="border-t">
              <th scope="row" className="py-1.5 font-normal">
                {playerName(n.memberId)}
              </th>
              <td
                className={`money py-1.5 text-right font-medium ${
                  n.netCents > 0 ? 'text-up' : 'text-down'
                }`}
              >
                {n.netCents > 0 ? '+' : ''}
                {formatCents(n.netCents)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div>
        <p className="mb-1 font-medium">
          {transfers.length} payments settle all {nets.length} players
        </p>
        <ol className="flex list-decimal flex-col gap-1 pl-5 text-muted-foreground">
          {transfers.map((t) => (
            <li key={`${t.fromMemberId}-${t.toMemberId}`}>
              {playerName(t.fromMemberId)} pays {playerName(t.toMemberId)}{' '}
              <span className="money font-medium text-foreground">
                {formatCents(t.amountCents)}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
