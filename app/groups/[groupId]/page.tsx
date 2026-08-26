import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { CopyLinkButton } from '@/components/copy-link-button'

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default async function GroupPage({
  params,
}: {
  params: Promise<{ groupId: string }>
}) {
  const { groupId } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: group }, { data: members }, { data: games }] =
    await Promise.all([
      supabase
        .from('groups')
        .select('id, name, invite_code')
        .eq('id', groupId)
        .maybeSingle(),
      supabase
        .from('group_members')
        .select('id, display_name, role, profile_id, claim_code, is_active')
        .eq('group_id', groupId)
        .order('created_at'),
      supabase
        .from('games')
        .select(
          'id, name, scheduled_at, location, seat_limit, status, game_signups(status)'
        )
        .eq('group_id', groupId)
        .order('scheduled_at', { ascending: false }),
    ])

  // RLS hides groups you're not a member of, so this covers both
  // "doesn't exist" and "not yours".
  if (!group) notFound()

  const me = members?.find((m) => m.profile_id === user.id)
  const canManage = me?.role === 'owner' || me?.role === 'admin'

  // A game is "upcoming" until it's settled or cancelled — a game that ran
  // long past its start time is still the one you care about. Spec edge case
  // 16: a group can have more than one game in flight, so this is a list.
  const upcoming =
    games?.filter((g) => g.status === 'scheduled' || g.status === 'active') ??
    []
  const past =
    games?.filter((g) => g.status !== 'scheduled' && g.status !== 'active') ??
    []

  const seatsTaken = (g: (typeof upcoming)[number]) =>
    g.game_signups.filter((s) => s.status === 'confirmed').length

  async function addMember(formData: FormData) {
    'use server'
    const name = String(formData.get('name') ?? '').trim()
    if (!name) return
    const supabase = await createClient()
    const { error } = await supabase
      .from('group_members')
      .insert({ group_id: groupId, display_name: name })
    if (error) throw new Error(error.message)
    revalidatePath(`/groups/${groupId}`)
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 p-4">
      <header className="flex items-center justify-between gap-2">
        <div>
          <Link href="/" className="text-xs text-muted-foreground">
            &larr; All groups
          </Link>
          <h1 className="text-lg font-semibold">{group.name}</h1>
        </div>
        <CopyLinkButton
          path={`/join/${group.invite_code}`}
          label="Copy invite link"
        />
      </header>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Games</h2>
          <Button
            size="sm"
            render={<Link href={`/games/new?group=${groupId}`} />}
            nativeButton={false}
          >
            New game
          </Button>
        </div>
        {upcoming.length === 0 && past.length === 0 && (
          <p className="text-sm text-muted-foreground">No games yet.</p>
        )}
        {upcoming.map((g) => (
          <Link key={g.id} href={`/games/${g.id}`}>
            <Card className="transition-colors hover:bg-muted/50">
              <CardContent className="flex items-center justify-between gap-2 py-3">
                <div>
                  <p className="text-sm font-medium">
                    {g.name ?? formatWhen(g.scheduled_at)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatWhen(g.scheduled_at)}
                    {g.location && ` · ${g.location}`}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {seatsTaken(g)}/{g.seat_limit} seats
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
        {past.map((g) => (
          <Link key={g.id} href={`/games/${g.id}`}>
            <Card className="transition-colors hover:bg-muted/50">
              <CardContent className="flex items-center justify-between gap-2 py-3">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    {g.name ?? formatWhen(g.scheduled_at)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatWhen(g.scheduled_at)}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {g.status}
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">
          Members ({members?.filter((m) => m.is_active).length ?? 0})
        </h2>
        {members?.map((m) => (
          <Card key={m.id}>
            <CardContent className="flex items-center justify-between gap-2 py-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">
                  {m.display_name}
                  {m.profile_id === user.id && (
                    <span className="text-muted-foreground"> (you)</span>
                  )}
                </span>
                {!m.profile_id && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    unclaimed
                  </span>
                )}
                {!m.is_active && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    inactive
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{m.role}</span>
                {canManage && !m.profile_id && m.claim_code && (
                  <CopyLinkButton
                    path={`/claim/${m.claim_code}`}
                    label="Copy claim link"
                    size="xs"
                  />
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      {canManage && (
        <section>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Add a player</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <form action={addMember} className="flex gap-2">
                <Input
                  name="name"
                  required
                  placeholder="Player name"
                  maxLength={80}
                />
                <Button type="submit">Add</Button>
              </form>
              <p className="text-xs text-muted-foreground">
                Adds them without an account. Send them their claim link later
                and their history comes with them.
              </p>
            </CardContent>
          </Card>
        </section>
      )}
    </main>
  )
}
