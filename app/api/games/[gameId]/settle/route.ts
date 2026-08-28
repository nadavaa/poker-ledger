import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { settle } from '@/lib/settle'

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

  let transfers
  try {
    transfers = settle(
      nets.map((n) => ({ memberId: n.member_id, netCents: n.net_cents }))
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
    })),
  })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ transfers: written })
}
