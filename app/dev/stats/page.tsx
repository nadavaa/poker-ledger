import { MyStats } from '@/components/group/my-stats'
import { BalanceChart } from '@/components/group/balance-chart'
import type { BalancePoint, Stats } from '@/lib/stats'

// Totals with odd cents on purpose: they should render as whole dollars,
// while best/worst (single games) keep their cents.
const stats: Stats = {
  gamesPlayed: 7,
  totalNetCents: 23450,
  averageNetCents: 3350,
  totalBoughtInCents: 105075,
  wins: 4,
  losses: 3,
  breakEvens: 0,
  winRate: 4 / 7,
  best: { gameId: 'g3', netCents: 18725, buyinCents: 10000, playedAt: '2026-10-06T02:00:00Z' },
  worst: { gameId: 'g5', netCents: -12050, buyinCents: 20000, playedAt: '2026-10-20T02:00:00Z' },
  currentStreak: { kind: 'win', length: 2 },
  longestWinStreak: 2,
  longestLossStreak: 2,
}

const balance: BalancePoint[] = [4000, -2500, 16225, 9000, -3050, 12000, 23450].map(
  (balanceCents, i) => ({
    gameId: `g${i}`,
    playedAt: `2026-10-${String(i + 1).padStart(2, '0')}T02:00:00Z`,
    balanceCents,
  }),
)

export default function Page() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <MyStats stats={stats} timeZone="America/New_York" />
      <BalanceChart points={balance} />
    </main>
  )
}
