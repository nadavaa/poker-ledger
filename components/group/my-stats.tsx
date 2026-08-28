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
    <div className="rounded-2xl border border-border bg-card px-3.5 py-3">
      <p className="text-[0.7rem] font-medium uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </p>
      <p className="money mt-1 text-[0.95rem] font-semibold">{value}</p>
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
        <CardContent className="py-6 text-center">
          <p className="text-sm text-muted-foreground">
            No settled games yet. Your stats show up once a game you played in
            has been counted and settled.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <CardContent className="py-6 text-center">
          <p className="text-[0.7rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Total net
          </p>
          <p
            className={`money-display my-1.5 text-[3.25rem] font-semibold ${
              stats.totalNetCents > 0
                ? 'text-up'
                : stats.totalNetCents < 0
                  ? 'text-down'
                  : 'text-foreground'
            }`}
          >
            {stats.totalNetCents > 0 ? '+' : ''}
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
