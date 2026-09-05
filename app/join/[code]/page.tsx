import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { code } = await params
  const { error: errorMessage } = await searchParams
  const supabase = await createClient()

  // Signed-out visitors never reach this: middleware sends them to
  // /login?next=/join/<code> and the callback brings them back here.
  const { data: preview } = await supabase
    .rpc('group_preview_by_invite', { code })
    .maybeSingle()

  if (!preview) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-4">
        <p className="text-sm">This invite link is invalid.</p>
        <Button render={<Link href="/" />} nativeButton={false}>
          Go home
        </Button>
      </main>
    )
  }

  // Logged before the redirect below, so an invite opened by somebody
  // already in the group still counts as a click.
  await supabase.rpc('log_invite_visit', {
    p_kind: 'group',
    p_target_id: preview.group_id,
    p_outcome: 'view',
  })

  // Already in: an invite you've accepted is just a link to the group.
  if (preview.my_member_status === 'active') {
    redirect(`/groups/${preview.group_id}`)
  }

  const returning = preview.my_member_status === 'inactive'

  async function join() {
    'use server'
    const supabase = await createClient()
    // Idempotent, and reactivates rather than inserting a second row.
    const { data: groupId, error } = await supabase.rpc(
      'join_group_by_invite',
      { code }
    )
    if (error) {
      redirect(`/join/${code}?error=${encodeURIComponent(error.message)}`)
    }
    await supabase.rpc('log_invite_visit', {
      p_kind: 'group',
      p_target_id: groupId,
      p_outcome: 'joined',
    })
    redirect(`/groups/${groupId}`)
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            {returning ? 'Rejoin' : 'Join'} {preview.group_name}?
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {returning
              ? 'You were in this group before. Rejoining brings back your original record, including every game you played.'
              : `${preview.member_count} ${
                  preview.member_count === 1 ? 'member' : 'members'
                }`}
          </p>
          <form action={join}>
            <Button type="submit" className="h-11 w-full rounded-xl">
              {returning ? 'Rejoin group' : 'Join group'}
            </Button>
          </form>
          {errorMessage && (
            <p className="text-sm text-down">{errorMessage}</p>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
