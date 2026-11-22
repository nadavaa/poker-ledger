import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { remainingNets, settleByMethod } from '@/lib/settle'

/**
 * Compute the transfers with the pure solver, then hand them to settle_game,
 * which refuses anything that doesn't actually zero every player out. The
 * reconciliation gate lives in the database, not here.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const { gameId } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  const { data: nets, error: netsError } = await supabase.rpc('game_nets', {
    p_game_id: gameId,
  })
  if (netsError) {
    return NextResponse.json({ error: netsError.message }, { status: 400 })
  }
  if (!nets?.length) {
    return NextResponse.json(
      { error: 'Nobody is in this game.' },
      { status: 400 }
    )
  }

  // Only a hybrid game needs to know who pays cash. In the other two modes
  // the database stamps the method itself, so the solver runs as before.
  const { data: game } = await supabase
    .from('games')
    .select('payment_mode')
    .eq('id', gameId)
    .maybeSingle()
  let cashIds = new Set<string>()
  if (game?.payment_mode === 'hybrid') {
    const { data: methods, error: methodsError } = await supabase.rpc(
      'game_payment_methods',
      { p_game_id: gameId }
    )
    if (methodsError) {
      return NextResponse.json({ error: methodsError.message }, { status: 400 })
    }
    cashIds = new Set(
      (methods ?? []).filter((m) => m.pays_cash).map((m) => m.member_id)
    )
  }

  // A game that was unsettled and is being settled again may already have
  // confirmed payments. That money moved; it is applied first and only what
  // is still owed gets new transfers. settle_game checks the sum either way.
  const { data: confirmed, error: confirmedError } = await supabase
    .from('settlements')
    .select('from_member_id, to_member_id, amount_cents')
    .eq('game_id', gameId)
    .eq('kind', 'poker')
    .eq('status', 'confirmed')
  if (confirmedError) {
    return NextResponse.json({ error: confirmedError.message }, { status: 400 })
  }

  let transfers
  try {
    transfers = settleByMethod(
      remainingNets(
        nets.map((n) => ({ memberId: n.member_id, netCents: n.net_cents })),
        (confirmed ?? []).map((c) => ({
          fromMemberId: c.from_member_id,
          toMemberId: c.to_member_id,
          amountCents: c.amount_cents,
        }))
      ),
      cashIds
    )
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Could not settle.' },
      { status: 400 }
    )
  }

  const { data: written, error } = await supabase.rpc('settle_game', {
    p_game_id: gameId,
    p_transfers: transfers.map((t) => ({
      from: t.fromMemberId,
      to: t.toMemberId,
      amount: t.amountCents,
      method: t.method,
    })),
  })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ transfers: written })
}
