'use client'

import { formatCents } from '@/lib/money'
import { Card, CardContent } from '@/components/ui/card'
import { ActivityFeed } from './activity-feed'
import { useGameBuyins, type Buyin } from './use-game-buyins'
import type { Player } from './buy-in-grid'

/**
 * Read-only live view for players: what everyone has staked, and the feed of
 * every buy-in as it happens. This is what kills "did you write mine down?".
 */
export function LiveRoster({
  gameId,
  players,
  adminMemberId,
  myMemberId,
  initialBuyins,
}: {
  gameId: string
  players: Player[]
  adminMemberId: string
  myMemberId: string | null
  initialBuyins: Buyin[]
}) {
  const { buyins, totalsByMember, potCents } = useGameBuyins(
    gameId,
    initialBuyins
  )
  const names = new Map(players.map((p) => [p.memberId, p.name]))
  const mine = myMemberId ? totalsByMember.get(myMemberId) : undefined

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between rounded-lg border border-border px-3 py-2">
        <span className="text-sm text-muted-foreground">Pot</span>
        <span className="text-xl font-semibold tabular-nums">
          {formatCents(potCents)}
        </span>
      </div>

      {myMemberId && (
        <div className="flex items-baseline justify-between rounded-lg border border-border px-3 py-2">
          <span className="text-sm text-muted-foreground">You&apos;ve staked</span>
          <span className="font-semibold tabular-nums">
            {formatCents(mine?.cents ?? 0)}
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              ({mine?.count ?? 0})
            </span>
          </span>
        </div>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">
          Confirmed ({players.length})
        </h2>
        {players.map((p) => {
          const total = totalsByMember.get(p.memberId)
          return (
            <Card key={p.memberId}>
              <CardContent className="flex items-center justify-between py-2.5">
                <span className="text-sm">
                  {p.name}
                  {p.memberId === myMemberId && (
                    <span className="text-muted-foreground"> (you)</span>
                  )}
                  {p.memberId === adminMemberId && (
                    <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      admin
                    </span>
                  )}
                </span>
                <span className="text-sm tabular-nums">
                  {formatCents(total?.cents ?? 0)}
                  <span className="ml-1 text-xs text-muted-foreground">
                    ({total?.count ?? 0})
                  </span>
                </span>
              </CardContent>
            </Card>
          )
        })}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Activity</h2>
        <ActivityFeed
          buyins={buyins}
          names={names}
          adminMemberId={adminMemberId}
        />
      </section>
    </div>
  )
}
