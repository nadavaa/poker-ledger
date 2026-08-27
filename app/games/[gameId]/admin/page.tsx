import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatCents } from '@/lib/money'
import { Button } from '@/components/ui/button'
import { BuyInGrid } from '@/components/game/buy-in-grid'
import { PreStartPanel } from '@/components/game/pre-start-panel'
import type { Buyin } from '@/components/game/use-game-buyins'

const BUYIN_COLUMNS =
  'id, member_id, amount_cents, chips, note, created_at, created_by_member_id, voided_at, void_reason'

export default async function GameAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ gameId: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { gameId } = await params
  const { error: errorMessage } = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: game } = await supabase
    .from('games')
    .select(
      'id, group_id, name, scheduled_at, location, status, default_buyin_cents, chips_per_dollar, admin_member_id, groups(name)'
    )
    .eq('id', gameId)
    .maybeSingle()

  if (!game) notFound()

  const [{ data: signups }, { data: members }, { data: buyins }, { data: transfers }] =
    await Promise.all([
      supabase
        .from('game_signups')
        .select('member_id, status, signup_order, group_members(display_name)')
        .eq('game_id', gameId)
        .eq('status', 'confirmed')
        .order('signup_order'),
      supabase
        .from('group_members')
        .select('id, display_name, profile_id, is_active')
        .eq('group_id', game.group_id)
        .eq('is_active', true)
        .order('display_name'),
      supabase
        .from('buyins')
        .select(BUYIN_COLUMNS)
        .eq('game_id', gameId)
        .order('created_at', { ascending: false }),
      supabase
        .from('game_admin_transfers')
        .select('id, created_at, was_forced, from_member_id, to_member_id')
        .eq('game_id', gameId)
        .order('created_at', { ascending: false }),
    ])

  const me = members?.find((m) => m.profile_id === user.id)
  // RLS is the real guard on every write below; this is just so a non-admin
  // doesn't land on a screen of buttons that will all fail.
  if (!me || me.id !== game.admin_member_id) {
    redirect(`/games/${gameId}`)
  }

  const players = (signups ?? []).map((s) => ({
    memberId: s.member_id,
    name: s.group_members?.display_name ?? 'Unknown',
  }))
  const nameOf = new Map((members ?? []).map((m) => [m.id, m.display_name]))

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
      redirect(`/games/${gameId}/admin?error=${encodeURIComponent(error.message)}`)
    }
    // The old admin loses write access immediately.
    redirect(`/games/${gameId}`)
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 p-4">
      <header>
        <Link href={`/games/${gameId}`} className="text-xs text-muted-foreground">
          &larr; Game
        </Link>
        <h1 className="text-lg font-semibold">
          {game.name ?? game.groups?.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          {formatCents(game.default_buyin_cents)} default ·{' '}
          {game.chips_per_dollar} chips/$ · {game.status}
        </p>
      </header>

      {errorMessage && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      {game.status === 'scheduled' ? (
        <PreStartPanel
          gameId={gameId}
          players={players}
          defaultBuyinCents={game.default_buyin_cents}
        />
      ) : (
        <BuyInGrid
          gameId={gameId}
          players={players}
          adminMemberId={game.admin_member_id}
          defaultBuyinCents={game.default_buyin_cents}
          chipsPerDollar={Number(game.chips_per_dollar)}
          initialBuyins={(buyins ?? []) as Buyin[]}
        />
      )}

      <details className="rounded-lg border border-border px-3 py-2">
        <summary className="cursor-pointer text-sm text-muted-foreground">
          Game settings
        </summary>
        <div className="flex flex-col gap-3 pt-3">
          <form action={handOff} className="flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor="to_member_id">
              Hand off admin
            </label>
            <p className="text-xs text-muted-foreground">
              They get write access immediately and you lose it. Every handoff
              is logged.
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

          {transfers && transfers.length > 0 && (
            <div className="flex flex-col gap-1">
              <h3 className="text-xs font-medium text-muted-foreground">
                Handoff history
              </h3>
              {transfers.map((t) => (
                <p key={t.id} className="text-xs text-muted-foreground">
                  {nameOf.get(t.from_member_id) ?? 'someone'} →{' '}
                  {nameOf.get(t.to_member_id) ?? 'someone'}
                  {t.was_forced && ' (forced)'} ·{' '}
                  {new Date(t.created_at).toLocaleString()}
                </p>
              ))}
            </div>
          )}
        </div>
      </details>
    </main>
  )
}
