import { formatCents } from '@/lib/money'
import type { Stats } from '@/lib/stats'
import { Card, CardContent } from '@/components/ui/card'

function day(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium tabular-nums">{value}</p>
    </div>
  )
}

function streakLabel(streak: Stats['currentStreak']) {
  if (streak.kind === 'none') return 'None'
  return `${streak.length} ${streak.kind === 'win' ? 'win' : 'loss'}${
    streak.length === 1 ? '' : 'es'
  }`
}

/** One player's record in one group. Settled games only. */
export function MyStats({ stats }: { stats: Stats | null }) {
  if (!stats) {
    return (
      <Card>
        <CardContent className="py-4">
          <p className="text-sm text-muted-foreground">
            No settled games yet. Your stats show up once a game you played in
            has been counted and settled.
          </p>
        </CardContent>
      </Card>
    )
  }

  const positive = stats.totalNetCents >= 0

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <CardContent className="py-4 text-center">
          <p className="text-xs text-muted-foreground">Total net</p>
          <p
            className={`text-4xl font-semibold tabular-nums ${
              positive ? 'text-emerald-600' : 'text-destructive'
            }`}
          >
            {formatCents(stats.totalNetCents)}
          </p>
          <p className="text-xs text-muted-foreground">
            over {stats.gamesPlayed}{' '}
            {stats.gamesPlayed === 1 ? 'game' : 'games'}
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-2">
        <Stat
          label="Average per game"
          value={formatCents(stats.averageNetCents)}
        />
        <Stat
          label="Win rate"
          value={`${Math.round(stats.winRate * 100)}% (${stats.wins}/${stats.gamesPlayed})`}
        />
        <Stat
          label="Best game"
          value={`${formatCents(stats.best.netCents)} · ${day(stats.best.scheduledAt)}`}
        />
        <Stat
          label="Worst game"
          value={`${formatCents(stats.worst.netCents)} · ${day(stats.worst.scheduledAt)}`}
        />
        <Stat label="Current streak" value={streakLabel(stats.currentStreak)} />
        <Stat
          label="Total bought in"
          value={formatCents(stats.totalBoughtInCents)}
        />
        <Stat
          label="Longest win streak"
          value={String(stats.longestWinStreak)}
        />
        <Stat
          label="Longest losing streak"
          value={String(stats.longestLossStreak)}
        />
      </div>
    </div>
  )
}
