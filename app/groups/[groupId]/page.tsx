import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { formatCents } from '@/lib/money'
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

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default async function GroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { groupId } = await params
  const { tab } = await searchParams
  const activeTab = tab === 'members' ? 'members' : 'games'

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: group }, { data: members }, { data: games }, { data: totals }, { data: lifetime }] =
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
        .select('id, name, scheduled_at, location, seat_limit, status, started_at')
        .eq('group_id', groupId)
        .order('scheduled_at', { ascending: false }),
      supabase
        .from('game_player_totals')
        .select('game_id, member_id, buyin_cents, net_cents')
        .eq('group_id', groupId),
      supabase
        .from('member_lifetime')
        .select('member_id, games_played')
        .eq('group_id', groupId),
    ])

  // RLS hides groups you're not a member of, so this covers both
  // "doesn't exist" and "not yours".
  if (!group) notFound()

  const me = members?.find((m) => m.profile_id === user.id)
  const canManage = me?.role === 'owner' || me?.role === 'admin'

  // Per-game rollups: how many played, what went in, and what you took home.
  const potByGame = new Map<string, number>()
  const playersByGame = new Map<string, number>()
  const myNetByGame = new Map<string, number>()
  for (const t of totals ?? []) {
    potByGame.set(t.game_id, (potByGame.get(t.game_id) ?? 0) + t.buyin_cents)
    playersByGame.set(t.game_id, (playersByGame.get(t.game_id) ?? 0) + 1)
    if (t.member_id === me?.id) myNetByGame.set(t.game_id, t.net_cents)
  }
  // Members tab shows participation, not money. Per-game results stay on the
  // game page; lifetime P/L stays on the home screen.
  const gamesPlayedByMember = new Map(
    (lifetime ?? []).map((l) => [l.member_id, l.games_played])
  )

  // Anything not finished is "in flight". A group can run more than one at
  // once (spec edge case 16), so this is a list, soonest first.
  const live = (games ?? [])
    .filter((g) => g.status === 'scheduled' || g.status === 'active')
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
  const past = (games ?? []).filter(
    (g) => g.status !== 'scheduled' && g.status !== 'active'
  )

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
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 p-4">
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

      {/* Tabs live in the URL so back and shared links land where you expect. */}
      <nav className="flex gap-1 rounded-lg border border-border p-1">
        <Link
          href={`/groups/${groupId}?tab=games`}
          aria-current={activeTab === 'games' ? 'page' : undefined}
          className={`flex-1 rounded-md px-3 py-1.5 text-center text-sm ${
            activeTab === 'games' ? 'bg-muted font-medium' : 'text-muted-foreground'
          }`}
        >
          Games
        </Link>
        <Link
          href={`/groups/${groupId}?tab=members`}
          aria-current={activeTab === 'members' ? 'page' : undefined}
          className={`flex-1 rounded-md px-3 py-1.5 text-center text-sm ${
            activeTab === 'members'
              ? 'bg-muted font-medium'
              : 'text-muted-foreground'
          }`}
        >
          Members
        </Link>
      </nav>

      {activeTab === 'games' ? (
        <>
          <Button
            render={<Link href={`/groups/${groupId}/games/new`} />}
            nativeButton={false}
          >
            New game
          </Button>

          {live.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-medium text-muted-foreground">
                Happening now
              </h2>
              {live.map((g) => (
                <Link key={g.id} href={`/games/${g.id}`}>
                  <Card className="border-foreground/25 transition-colors hover:bg-muted/50">
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
                      <div className="text-right">
                        <p className="text-xs font-medium uppercase">
                          {g.status === 'active' ? 'Live' : 'Scheduled'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {playersByGame.get(g.id) ?? 0}/{g.seat_limit} seats
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </section>
          )}

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">
              History
            </h2>
            {past.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No finished games yet.
              </p>
            )}
            {past.map((g) => {
              const myNet = myNetByGame.get(g.id)
              return (
                <Link key={g.id} href={`/games/${g.id}`}>
                  <Card className="transition-colors hover:bg-muted/50">
                    <CardContent className="flex items-center justify-between gap-2 py-3">
                      <div>
                        <p className="text-sm">{formatDay(g.scheduled_at)}</p>
                        <p className="text-xs text-muted-foreground">
                          {playersByGame.get(g.id) ?? 0} players ·{' '}
                          {formatCents(potByGame.get(g.id) ?? 0)} pot
                          {g.status === 'cancelled' && ' · cancelled'}
                        </p>
                      </div>
                      {myNet !== undefined && g.status === 'settled' && (
                        <span
                          className={`text-sm font-semibold tabular-nums ${
                            myNet >= 0 ? 'text-emerald-600' : 'text-destructive'
                          }`}
                        >
                          {formatCents(myNet)}
                        </span>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </section>
        </>
      ) : (
        <>
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">
              Members ({members?.filter((m) => m.is_active).length ?? 0})
            </h2>
            {members?.map((m) => {
              const played = gamesPlayedByMember.get(m.id) ?? 0
              return (
                <Card key={m.id}>
                  <CardContent className="flex items-center justify-between gap-2 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {m.display_name}
                        {m.profile_id === user.id && (
                          <span className="text-muted-foreground"> (you)</span>
                        )}
                      </p>
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span>{played} games</span>
                        <span>·</span>
                        <span>{m.role}</span>
                        {!m.profile_id && (
                          <span className="rounded bg-muted px-1.5 py-0.5">
                            unclaimed
                          </span>
                        )}
                        {!m.is_active && (
                          <span className="rounded bg-muted px-1.5 py-0.5">
                            inactive
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {canManage && !m.profile_id && m.claim_code && (
                        <CopyLinkButton
                          path={`/claim/${m.claim_code}`}
                          label="Claim link"
                          size="xs"
                        />
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </section>

          {canManage && (
            <section>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Add player</CardTitle>
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
                    Adds them without an account. Send them their claim link
                    later and their history comes with them.
                  </p>
                </CardContent>
              </Card>
            </section>
          )}
        </>
      )}
    </main>
  )
}
