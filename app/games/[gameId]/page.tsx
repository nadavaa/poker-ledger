import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSessionUser } from '@/lib/supabase/auth'
import { centsToChips, formatCents } from '@/lib/money'
import type { PaymentSources } from '@/lib/payment'
import { FoodOrders, type FoodOrder } from '@/components/food/food-orders'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { BuyInGrid } from '@/components/game/buy-in-grid'
import { ScheduledView } from '@/components/game/scheduled-view'
import { LiveRoster } from '@/components/game/live-roster'
import { CashoutPanel } from '@/components/game/cashout-panel'
import {
  cashoutFor,
  hasLeftTable,
  type CashoutRecord,
} from '@/lib/table'
import { SettledView } from '@/components/game/settled-view'
import { StatusBanner } from '@/components/game/status-banner'
import { WaitlistPanel } from '@/components/game/waitlist-panel'
import { DangerZone } from '@/components/game/danger-zone'
import { CollapsibleSection } from '@/components/collapsible-section'
import type { Buyin } from '@/components/game/use-game-buyins'
import { resolveDisplayName } from '@/lib/names'
import { ShareGame } from '@/components/game/share-game'
import { EditGameForm } from '@/components/game/edit-game-form'
import { ActivityFeed, type GameEditEntry } from '@/components/game/activity-feed'
import type { GameStatus } from '@/lib/game-edit'
import { joinNotice, type JoinOutcome } from '@/lib/game-join'

const BUYIN_COLUMNS =
  'id, member_id, amount_cents, chips, note, created_at, created_by_member_id, voided_at, void_reason'

/** Start time passed and nobody ever hit Start. Server-rendered, so "now" is
 *  request time. */
function isOverdue(status: string, scheduledAt: string) {
  return status === 'scheduled' && new Date(scheduledAt).getTime() < Date.now()
}

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default async function GamePage({
  params,
  searchParams,
}: {
  params: Promise<{ gameId: string }>
  searchParams: Promise<{ error?: string; joined?: string }>
}) {
  const { gameId } = await params
  const { error: errorMessage, joined } = await searchParams
  const supabase = await createClient()

  const user = await getSessionUser(supabase)
  if (!user) redirect('/login')

  const { data: game } = await supabase
    .from('games')
    .select(
      'id, group_id, name, scheduled_at, location, seat_limit, default_buyin_cents, chips_per_dollar, status, admin_member_id, started_at, settled_at, groups(name)'
    )
    .eq('id', gameId)
    .maybeSingle()

  // RLS hides games in groups you don't belong to.
  if (!game) notFound()

  // Status is known now, which is all the remaining queries needed to know.
  // They used to run in three more waves behind this one; there is no
  // dependency between them, so they go together.
  const counting = game.status === 'reconciling'
  const settled = game.status === 'settled'
  const cancelled = game.status === 'cancelled'

  const [
    { data: signups },
    { data: members },
    { data: buyins },
    { data: totals },
    { data: settlements },
    { data: adjustments },
    { data: paymentRows },
    { data: foodRows },
    { data: cashoutRows },
    { data: editRows },
  ] = await Promise.all([
    supabase
      .from('game_signups')
      .select(
        'id, member_id, status, signup_order, group_members(display_name, profile_id, profiles(display_name, avatar_url))'
      )
      .eq('game_id', gameId)
      .order('signup_order'),
    supabase
      // The profile handle comes back embedded rather than as its own round
      // trip; group mates can read each other's profiles.
      .from('group_members')
      .select(
        'id, display_name, profile_id, is_active, role, profiles(display_name)'
      )
      .eq('group_id', game.group_id)
      .eq('is_active', true)
      .order('display_name'),
    supabase
      .from('buyins')
      .select(BUYIN_COLUMNS)
      .eq('game_id', gameId)
      .order('created_at', { ascending: false }),
    supabase
      .from('game_player_totals')
      .select(
        'member_id, display_name, buyin_cents, buyin_chips, cashout_cents, cashout_chips, adjustment_cents, net_cents'
      )
      .eq('game_id', gameId),
    supabase
      .from('settlements')
      .select(
        'id, from_member_id, to_member_id, amount_cents, status, confirmed_at, confirmed_by_member_id, kind'
      )
      .eq('game_id', gameId)
      .order('amount_cents', { ascending: false }),
    settled || counting
      ? supabase
          .from('game_adjustments')
          .select('id, member_id, amount_cents, reason')
          .eq('game_id', gameId)
      : Promise.resolve({ data: null }),
    // Contact details come back only for settlements this viewer may act on;
    // phone numbers are not readable from the tables at all.
    settled
      ? supabase.rpc('game_payment_details', { p_game_id: gameId })
      : Promise.resolve({ data: null }),
    // RLS returns only orders this viewer is part of, or all of them if they
    // run the game.
    supabase
      .from('food_orders')
      .select(
        'id, paid_by_member_id, description, total_cents, created_by_member_id, food_order_shares(member_id, share_cents, is_fixed)'
      )
      .eq('game_id', gameId)
      .order('created_at'),
    // Who has already cashed out. Needed while the game is still running —
    // it decides who can be bought in for and how much is left on the table.
    supabase
      .from('cashouts')
      .select('member_id, chips, recorded_at, left_table')
      .eq('game_id', gameId),
    // What the admin changed after the game was created.
    supabase
      .from('game_edits')
      .select('id, field, old_value, new_value, edited_by_member_id, created_at')
      .eq('game_id', gameId)
      .order('created_at', { ascending: false }),
  ])

  const edits: GameEditEntry[] = (editRows ?? []).map((e) => ({
    id: e.id,
    field: e.field,
    oldValue: e.old_value,
    newValue: e.new_value,
    editedByMemberId: e.edited_by_member_id,
    createdAt: e.created_at,
  }))

  const cashouts: CashoutRecord[] = (cashoutRows ?? []).map((c) => ({
    memberId: c.member_id,
    chips: c.chips,
    recordedAt: c.recorded_at,
    leftTable: c.left_table,
  }))

  // Asked at the moment it matters, rather than during signup: somebody owes
  // you money and there's nowhere for them to send it.
  const { data: myPayment } = settled
    ? await supabase.rpc('my_payment_details').maybeSingle()
    : { data: null }

  const myMember = members?.find((m) => m.profile_id === user.id) ?? null
  const confirmed = signups?.filter((s) => s.status === 'confirmed') ?? []
  const waitlist = signups?.filter((s) => s.status === 'waitlist') ?? []
  const mySignup = signups?.find((s) => s.member_id === myMember?.id)

  const isAdmin = myMember?.id === game.admin_member_id
  const isGroupOwner = myMember?.role === 'owner'
  const isOpen = game.status === 'scheduled' || game.status === 'active'
  const runsTheGame = isAdmin && isOpen
  const overdue = isOverdue(game.status, game.scheduled_at)

  const signupName = (s: (typeof confirmed)[number]) =>
    resolveDisplayName(
      s.group_members?.display_name,
      s.group_members?.profiles?.display_name
    )

  const players = confirmed.map((s) => ({
    memberId: s.member_id,
    name: signupName(s),
    profileId: s.group_members?.profile_id ?? null,
    avatarUrl: s.group_members?.profiles?.avatar_url ?? null,
  }))
  const foodPlayers = confirmed.map((s) => ({
    memberId: s.member_id,
    name: signupName(s),
    signupOrder: s.signup_order,
  }))
  const foodOrders: FoodOrder[] = (foodRows ?? []).map((o) => ({
    id: o.id,
    paidByMemberId: o.paid_by_member_id,
    description: o.description,
    totalCents: o.total_cents,
    createdByMemberId: o.created_by_member_id,
    shares: (o.food_order_shares ?? []).map((sh) => ({
      memberId: sh.member_id,
      shareCents: sh.share_cents,
      isFixed: sh.is_fixed,
    })),
  }))
  const nameOf = new Map(
    (members ?? []).map((m) => [
      m.id,
      resolveDisplayName(m.display_name, m.profiles?.display_name),
    ])
  )
  const paymentSources = new Map<string, PaymentSources>(
    (paymentRows ?? []).map((r) => [
      r.settlement_id,
      {
        memberVenmo: r.member_venmo,
        profileVenmo: r.profile_venmo,
        memberPhone: r.member_phone,
        profilePhone: r.profile_phone,
        preferred: r.preferred,
      },
    ])
  )

  // Anyone in the group not already in the game. A withdrawn signup can be
  // re-added, so it doesn't count as taken.
  const taken = new Set(
    (signups ?? [])
      .filter((s) => s.status !== 'withdrawn')
      .map((s) => s.member_id)
  )
  const available = (members ?? [])
    .filter((m) => !taken.has(m.id))
    .map((m) => ({
      id: m.id,
      name: resolveDisplayName(m.display_name, m.profiles?.display_name),
    }))

  const liveBuyins = (buyins ?? []).filter((b) => !b.voided_at)
  // Once your money is in the pot you can't take yourself out of the game;
  // the policy enforces it, this only decides what to draw.
  const myLiveBuyins = myMember
    ? liveBuyins.filter((b) => b.member_id === myMember.id).length
    : 0
  const stuckInGame = game.status === 'active' && myLiveBuyins > 0
  const liveBuyinsByMember = new Map<string, number>()
  for (const b of liveBuyins) {
    liveBuyinsByMember.set(
      b.member_id,
      (liveBuyinsByMember.get(b.member_id) ?? 0) + 1
    )
  }
  const blockingSettlements = (settlements ?? []).filter(
    (s) => s.status === 'pending' || s.status === 'paid'
  )
  // Hard delete is only for a game that never happened. Anything that has
  // started, or has money in it, gets cancelled instead.
  const canDelete =
    isAdmin &&
    game.status === 'scheduled' &&
    (buyins?.length ?? 0) === 0 &&
    blockingSettlements.length === 0
  const canCancel =
    (isAdmin || isGroupOwner) &&
    game.status !== 'settled' &&
    game.status !== 'cancelled' &&
    blockingSettlements.length === 0
  const gameLabel = game.name ?? formatDay(game.scheduled_at)

  async function joinGame() {
    'use server'
    const supabase = await createClient()
    if (!myMember) return
    const { error } = mySignup
      ? await supabase
          .from('game_signups')
          .update({ status: 'waitlist' }) // trigger recomputes to confirmed if a seat is free
          .eq('id', mySignup.id)
      : await supabase
          .from('game_signups')
          .insert({ game_id: gameId, member_id: myMember.id })
    if (error) {
      redirect(`/games/${gameId}?error=${encodeURIComponent(error.message)}`)
    }
    revalidatePath(`/games/${gameId}`)
  }

  async function withdraw() {
    'use server'
    const supabase = await createClient()
    if (!mySignup) return
    const { error } = await supabase
      .from('game_signups')
      .update({ status: 'withdrawn' })
      .eq('id', mySignup.id)
    if (error) {
      redirect(`/games/${gameId}?error=${encodeURIComponent(error.message)}`)
    }
    revalidatePath(`/games/${gameId}`)
  }

  async function endGame() {
    'use server'
    const supabase = await createClient()
    const { error } = await supabase.rpc('begin_reconciliation', {
      p_game_id: gameId,
    })
    if (error) {
      redirect(`/games/${gameId}?error=${encodeURIComponent(error.message)}`)
    }
    revalidatePath(`/games/${gameId}`)
  }

  async function reopenGame() {
    'use server'
    const supabase = await createClient()
    const { error } = await supabase.rpc('reopen_game', { p_game_id: gameId })
    if (error) {
      redirect(`/games/${gameId}?error=${encodeURIComponent(error.message)}`)
    }
    revalidatePath(`/games/${gameId}`)
  }

  async function handOff(formData: FormData) {
    'use server'
    const toMemberId = String(formData.get('to_member_id') ?? '')
    const reason = String(formData.get('reason') ?? '')
    if (!toMemberId) return
    const supabase = await createClient()
    const { error } = await supabase.rpc('transfer_game_admin', {
      p_game_id: gameId,
      p_to_member_id: toMemberId,
      p_reason: reason || null,
    })
    if (error) {
      redirect(`/games/${gameId}?error=${encodeURIComponent(error.message)}`)
    }
    // The old admin loses write access immediately.
    revalidatePath(`/games/${gameId}`)
  }

  const myStatusLabel = !mySignup
    ? 'Not signed up'
    : mySignup.status === 'confirmed'
      ? 'You’re in'
      : mySignup.status === 'waitlist'
        ? `Waitlist #${waitlist.findIndex((w) => w.id === mySignup.id) + 1}`
        : 'Withdrawn'

  const chipsPerDollar = Number(game.chips_per_dollar)

  const foodSection =
    game.status === 'active' || settled ? (
      <FoodOrders
        gameId={gameId}
        players={foodPlayers}
        orders={foodOrders}
        myMemberId={myMember?.id ?? null}
        isGameAdmin={isAdmin}
      />
    ) : null

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 p-4">
      <header className="page-header">
        <div className="min-w-0">
          <Link
            href={`/groups/${game.group_id}`}
            className="text-xs text-muted-foreground"
          >
            &larr; {game.groups?.name}
          </Link>
          <h1 className="truncate text-lg font-semibold tracking-tight">
            {game.name ?? formatWhen(game.scheduled_at)}
          </h1>
          <p className="truncate text-sm text-muted-foreground">
            {formatWhen(game.scheduled_at)}
            {game.location && ` · ${game.location}`}
          </p>
        </div>
      </header>

      <StatusBanner
        status={game.status}
        overdue={overdue}
        buyinCents={game.default_buyin_cents}
        chips={centsToChips(game.default_buyin_cents, chipsPerDollar)}
        detail={
          overdue
            ? 'Start time has passed'
            : game.status === 'scheduled'
              ? `${formatCents(game.default_buyin_cents)} = ${centsToChips(
                  game.default_buyin_cents,
                  chipsPerDollar
                )} chips`
              : undefined
        }
      />

      {/* Directly under the state it ends, rather than below the grid and the
          feed, where it drifted further away as the night went on. */}
      {runsTheGame && game.status === 'active' && (
        <form action={endGame}>
          <Button
            variant="outline"
            className="h-12 w-full rounded-xl text-base"
            type="submit"
          >
            End Game
          </Button>
        </form>
      )}

      {errorMessage && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      {/* What just happened, for somebody who arrived from a link in the
          group chat and needs to know what they joined. */}
      {(() => {
        if (!joined) return null
        const notice = joinNotice(joined as JoinOutcome, {
          groupName: game.groups?.name ?? 'this group',
          when: formatWhen(game.scheduled_at),
          position: waitlist.findIndex((s) => s.member_id === myMember?.id) + 1 || null,
        })
        if (!notice) return null
        return (
          <div
            className={`flex flex-col gap-1 rounded-2xl border px-4 py-3 ${
              notice.tone === 'good'
                ? 'border-up/30 bg-up-soft'
                : 'border-pending/30 bg-pending-soft'
            }`}
          >
            <p
              className={`text-sm font-semibold ${
                notice.tone === 'good' ? 'text-up' : 'text-pending'
              }`}
            >
              <span aria-hidden>{notice.tone === 'good' ? '✓' : '○'}</span>{' '}
              {notice.title}
            </p>
            <p className="text-xs text-muted-foreground">{notice.detail}</p>
          </div>
        )
      })()}

      {/* Scheduled and active only: there is nothing to invite anyone to
          once the game is counted or called off. */}
      {isOpen && (
        <ShareGame
          gameId={gameId}
          groupName={game.groups?.name ?? 'Poker'}
          when={formatWhen(game.scheduled_at)}
          location={game.location}
          buyinLabel={
            game.status === 'scheduled'
              ? `${formatCents(game.default_buyin_cents)} buy-in`
              : null
          }
        />
      )}

      {myMember && isOpen && (
        <Card>
          <CardContent className="flex items-center justify-between gap-2 py-3">
            <span className="text-sm font-medium">{myStatusLabel}</span>
            {mySignup && mySignup.status !== 'withdrawn' ? (
              // Nothing where the button was. The RLS policy still refuses the
              // withdrawal; this only drops the explanation.
              stuckInGame ? null : (
                <form action={withdraw}>
                  <Button variant="outline" size="sm" type="submit">
                    Withdraw
                  </Button>
                </form>
              )
            ) : (
              <form action={joinGame}>
                <Button size="sm" type="submit">
                  {confirmed.length >= game.seat_limit
                    ? 'Join waitlist'
                    : "I'm in"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      {/* Each state renders a different page. */}
      {game.status === 'scheduled' && (
        <ScheduledView
          gameId={gameId}
          players={players}
          available={available}
          seatLimit={game.seat_limit}
          defaultBuyinCents={game.default_buyin_cents}
          myMemberId={myMember?.id ?? null}
          isAdmin={isAdmin}
          liveBuyinsByMember={liveBuyinsByMember}
        />
      )}

      {/* A scheduled game has no buy-in feed to fold these into, and a moved
          start time is exactly the thing people need to see before they turn
          up at the old one. */}
      {game.status === 'scheduled' && edits.length > 0 && (
        <CollapsibleSection title="Changes">
          <ActivityFeed
            buyins={[]}
            edits={edits}
            names={nameOf}
            adminMemberId={game.admin_member_id}
            myMemberId={myMember?.id ?? null}
          />
        </CollapsibleSection>
      )}

      {game.status === 'active' &&
        (runsTheGame ? (
          <BuyInGrid
            gameId={gameId}
            players={players}
            adminMemberId={game.admin_member_id}
            defaultBuyinCents={game.default_buyin_cents}
            chipsPerDollar={chipsPerDollar}
            initialBuyins={(buyins ?? []) as Buyin[]}
            available={available}
            startedAt={game.started_at}
            initialCashouts={cashouts}
            edits={edits}
            beforeActivity={foodSection}
          />
        ) : (
          <LiveRoster
            gameId={gameId}
            players={players}
            adminMemberId={game.admin_member_id}
            myMemberId={myMember?.id ?? null}
            initialBuyins={(buyins ?? []) as Buyin[]}
            cashouts={cashouts}
            edits={edits}
            started
            startedAt={game.started_at}
            beforeActivity={foodSection}
          />
        ))}

      {counting &&
        (isAdmin ? (
          <>
            <CashoutPanel
              gameId={gameId}
              chipsPerDollar={chipsPerDollar}
              hasAdjustments={(adjustments?.length ?? 0) > 0}
              rows={(totals ?? []).map((t) => ({
                memberId: t.member_id,
                name: t.display_name,
                buyinCents: t.buyin_cents,
                buyinChips: t.buyin_chips,
                adjustmentCents: t.adjustment_cents,
                chips:
                  t.cashout_chips === null ? null : String(t.cashout_chips),
                recordedAt:
                  cashoutFor(t.member_id, cashouts)?.recordedAt ?? null,
                leftTable: hasLeftTable(t.member_id, cashouts),
              }))}
            />
            {/* An escape hatch, not a primary action. reopen_game() is admin
                only, refuses anything but a game being counted, and touches
                nothing but status — so chip counts already entered survive. */}
            <form action={reopenGame}>
              <Button variant="outline" size="sm" type="submit">
                Resume Game
              </Button>
            </form>
          </>
        ) : (
          <LiveRoster
            gameId={gameId}
            players={players}
            adminMemberId={game.admin_member_id}
            myMemberId={myMember?.id ?? null}
            initialBuyins={(buyins ?? []) as Buyin[]}
            started
            startedAt={game.started_at}
          />
        ))}

      {settled && (
        <SettledView
          rows={(totals ?? []).map((t) => ({
            memberId: t.member_id,
            name: t.display_name,
            buyinCents: t.buyin_cents,
            buyinChips: t.buyin_chips,
            cashoutCents: t.cashout_cents,
            cashoutChips: t.cashout_chips,
            adjustmentCents: t.adjustment_cents,
            netCents: t.net_cents,
          }))}
          transfers={(settlements ?? []).map((s) => ({
            id: s.id,
            fromMemberId: s.from_member_id,
            toMemberId: s.to_member_id,
            amountCents: s.amount_cents,
            status: s.status,
            confirmedAt: s.confirmed_at,
            confirmedByMemberId: s.confirmed_by_member_id,
            kind: s.kind,
          }))}
          adjustments={(adjustments ?? []).map((a) => ({
            id: a.id,
            memberId: a.member_id,
            amountCents: a.amount_cents,
            reason: a.reason,
          }))}
          names={nameOf}
          paymentSources={paymentSources}
          myMemberId={myMember?.id ?? null}
          isAdmin={isAdmin}
          gameLabel={gameLabel}
          startedAt={game.started_at}
          settledAt={game.settled_at}
          beforeSettlements={foodSection}
          needsPaymentMethod={
            !!myMember &&
            !myPayment?.venmo_handle &&
            !myPayment?.phone_number &&
            (settlements ?? []).some(
              (t) => t.to_member_id === myMember.id && t.status !== 'confirmed'
            )
          }
        />
      )}

      {cancelled && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            Roster ({confirmed.length})
          </h2>
          {confirmed.map((s) => (
            <Card key={s.id}>
              <CardContent className="py-2.5 text-sm">
                {signupName(s)}
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      {!settled && !cancelled && (
        <WaitlistPanel
          gameId={gameId}
          entries={waitlist.map((s) => ({
            id: s.id,
            memberId: s.member_id,
            name: signupName(s),
          }))}
          isAdmin={runsTheGame}
          myMemberId={myMember?.id ?? null}
        />
      )}

      {(isAdmin || isGroupOwner) && (
        <CollapsibleSection title="Game settings">
          <>
            {/* Only the game admin, and only while there is something left to
                change. The RLS policy refuses the rest. */}
            {runsTheGame && (
              <div className="flex flex-col gap-2 border-b border-border pb-4">
                <p className="text-sm font-medium">Edit game</p>
                <EditGameForm
                  gameId={gameId}
                  status={game.status as GameStatus}
                  initial={{
                    name: game.name,
                    location: game.location,
                    scheduledAt: game.scheduled_at,
                    seatLimit: game.seat_limit,
                    buyinCents: game.default_buyin_cents,
                    chipsPerDollar: game.chips_per_dollar,
                  }}
                />
              </div>
            )}

            {runsTheGame && (
            <form action={handOff} className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="to_member_id">
                Hand off admin
              </label>
              <p className="text-xs text-muted-foreground">
                They get write access immediately and you lose it. Every
                handoff is logged.
              </p>
              <select
                id="to_member_id"
                name="to_member_id"
                required
                defaultValue=""
                className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
              >
                <option value="" disabled>
                  Pick a member…
                </option>
                {members
                  ?.filter((m) => m.id !== game.admin_member_id)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.display_name}
                    </option>
                  ))}
              </select>
              <input
                name="reason"
                maxLength={120}
                placeholder="Reason (optional)"
                className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
              />
              <Button variant="outline" size="sm" type="submit">
                Transfer admin
              </Button>
            </form>
            )}

            <DangerZone
              gameId={gameId}
              groupId={game.group_id}
              gameLabel={gameLabel}
              status={game.status}
              signupCount={signups?.length ?? 0}
              buyinCount={liveBuyins.length}
              buyinTotalCents={liveBuyins.reduce(
                (sum, b) => sum + b.amount_cents,
                0
              )}
              blockingSettlements={blockingSettlements.map((s) => ({
                id: s.id,
                fromName: nameOf.get(s.from_member_id) ?? 'Someone',
                toName: nameOf.get(s.to_member_id) ?? 'someone',
                amountCents: s.amount_cents,
                status: s.status,
              }))}
              canDelete={canDelete}
              canCancel={canCancel}
            />
          </>
        </CollapsibleSection>
      )}
    </main>
  )
}
