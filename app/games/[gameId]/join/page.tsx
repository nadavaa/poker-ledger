import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { joinDestination, type JoinOutcome } from '@/lib/game-join'

/**
 * The shared link. Everything is decided server-side and the visitor is
 * redirected — there is deliberately no join screen, because someone who
 * followed a link from the group chat has already said yes.
 *
 * Signed-out visitors never get here: the proxy sends them to
 * /login?next=/games/<id>/join, and both auth callbacks honour ?next, so the
 * Google round trip comes back to this route rather than the home page.
 *
 * A GET that writes is unusual, and safe here only because
 * join_game_by_link() is idempotent by construction: five clicks produce one
 * membership and one signup.
 */
export default async function JoinGamePage({
  params,
}: {
  params: Promise<{ gameId: string }>
}) {
  const { gameId } = await params
  const supabase = await createClient()

  const { data, error } = await supabase
    .rpc('join_game_by_link', { p_game_id: gameId })
    .maybeSingle()

  if (error || !data) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-4 text-center">
        <p className="text-sm text-muted-foreground">
          {error?.message ?? 'That game link is no longer valid.'}
        </p>
        <Button render={<Link href="/" />} nativeButton={false}>
          Go home
        </Button>
      </main>
    )
  }

  redirect(
    joinDestination({
      gameId,
      groupId: data.group_id,
      outcome: data.outcome as JoinOutcome,
    })
  )
}
