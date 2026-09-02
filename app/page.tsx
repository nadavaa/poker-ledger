import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSessionUser } from '@/lib/supabase/auth'
import { formatCents } from '@/lib/money'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { InstallPrompt } from '@/components/pwa/install-prompt'
import { Avatar } from '@/components/avatar'

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error: errorMessage } = await searchParams
  const supabase = await createClient()

  const user = await getSessionUser(supabase)
  if (!user) redirect('/login')

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase
      .from('profiles')
      .select('display_name, avatar_url, onboarding_completed_at')
      .eq('id', user.id)
      .single(),
    supabase
      .from('group_members')
      .select('id, group_id, groups(id, name, avatar_url)')
      .eq('profile_id', user.id)
      .eq('is_active', true)
      .order('created_at'),
  ])

  // New account, or one that closed the browser mid-flow.
  if (profile && !profile.onboarding_completed_at) redirect('/welcome')

  const groupIds = (memberships ?? []).map((m) => m.group_id)
  const myMemberIds = (memberships ?? []).map((m) => m.id)

  const [{ data: allMembers }, { data: lifetime }] = await Promise.all([
    groupIds.length
      ? supabase
          .from('group_members')
          .select('id, group_id')
          .in('group_id', groupIds)
          .eq('is_active', true)
      : Promise.resolve({ data: [] }),
    myMemberIds.length
      ? supabase
          .from('member_lifetime')
          .select('member_id, lifetime_net_cents')
          .in('member_id', myMemberIds)
      : Promise.resolve({ data: [] }),
  ])

  const memberCount = new Map<string, number>()
  for (const m of allMembers ?? []) {
    memberCount.set(m.group_id, (memberCount.get(m.group_id) ?? 0) + 1)
  }
  const netByMemberId = new Map(
    (lifetime ?? []).map((l) => [l.member_id, l.lifetime_net_cents])
  )

  async function createGroup(formData: FormData) {
    'use server'
    const name = String(formData.get('name') ?? '').trim()
    if (!name) return
    const supabase = await createClient()
    const { data: groupId, error } = await supabase.rpc('create_group', {
      group_name: name,
    })
    if (error) {
      redirect(`/?error=${encodeURIComponent(error.message)}`)
    }
    redirect(`/groups/${groupId}`)
  }

  async function signOut() {
    'use server'
    const supabase = await createClient()
    await supabase.auth.signOut()
    redirect('/login')
  }

  const hasGroups = (memberships?.length ?? 0) > 0

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 p-4">
      <header className="page-header flex items-center justify-between">
        {/* No label, and no placeholder: without a photo the name simply sits
            where it would, rather than beside an empty circle. */}
        <div className="flex min-w-0 items-center gap-3">
          <Avatar
            id={user.id}
            name={profile?.display_name ?? user.email}
            url={profile?.avatar_url ?? null}
            size={40}
            fallback="none"
          />
          <h1 className="truncate text-lg font-semibold">
            {profile?.display_name ?? user.email}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Settings"
            title="Settings"
            render={<Link href="/settings" />}
            nativeButton={false}
          >
            <svg viewBox="0 0 24 24" aria-hidden className="size-5">
              <path
                fill="currentColor"
                d="M12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Zm7.43-2.53c.04-.32.07-.64.07-.97s-.03-.65-.07-.97l2.11-1.65a.5.5 0 0 0 .12-.64l-2-3.46a.5.5 0 0 0-.61-.22l-2.49 1a7.3 7.3 0 0 0-1.69-.98l-.38-2.65a.49.49 0 0 0-.49-.43h-4a.49.49 0 0 0-.49.43l-.38 2.65c-.61.25-1.17.58-1.69.98l-2.49-1a.5.5 0 0 0-.61.22l-2 3.46a.5.5 0 0 0 .12.64l2.11 1.65c-.04.32-.07.65-.07.97s.03.65.07.97L2.46 14.6a.5.5 0 0 0-.12.64l2 3.46c.14.24.42.34.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.25.24.43.49.43h4c.25 0 .46-.18.49-.43l.38-2.65c.61-.25 1.17-.58 1.69-.98l2.49 1c.19.12.47.02.61-.22l2-3.46a.5.5 0 0 0-.12-.64l-2.11-1.65Z"
              />
            </svg>
          </Button>
        </div>
      </header>

      <InstallPrompt />

      {errorMessage && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      {hasGroups ? (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-[0.7rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Your groups
            </h2>
            {memberships?.map(
              (m) =>
                m.groups && (
                  <Link key={m.id} href={`/groups/${m.groups.id}`}>
                    <Card className="transition-colors hover:bg-muted/50">
                      <CardContent className="flex items-center justify-between gap-3 py-4">
                        <div className="flex min-w-0 items-center gap-3">
                          <Avatar
                            id={m.groups.id}
                            name={m.groups.name}
                            url={m.groups.avatar_url}
                            bucket="group-avatars"
                            size={44}
                          />
                          <div className="min-w-0">
                          <p className="truncate text-[0.95rem] font-medium">
                            {m.groups.name}
                          </p>
                          <p className="money text-xs text-muted-foreground">
                            {memberCount.get(m.group_id) ?? 0}{' '}
                            {memberCount.get(m.group_id) === 1
                              ? 'member'
                              : 'members'}
                          </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end">
                          <p
                            className={`money-display text-2xl font-semibold ${
                              (netByMemberId.get(m.id) ?? 0) > 0
                                ? 'text-up'
                                : (netByMemberId.get(m.id) ?? 0) < 0
                                  ? 'text-down'
                                  : 'text-muted-foreground'
                            }`}
                          >
                            {(netByMemberId.get(m.id) ?? 0) > 0 ? '+' : ''}
                            {formatCents(netByMemberId.get(m.id) ?? 0)}
                          </p>
                          <p className="text-[0.7rem] uppercase tracking-[0.06em] text-muted-foreground">
                            lifetime
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                )
            )}
          </section>

          <section>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Create group</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={createGroup} className="flex gap-2">
                  <Input
                    name="name"
                    required
                    placeholder="Tuesday crew"
                    maxLength={80}
                  />
                  <Button type="submit">Create</Button>
                </form>
              </CardContent>
            </Card>
          </section>
        </>
      ) : (
        <section className="flex flex-col gap-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Start with a group
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                A group is the crew you play with. It holds your players, your
                games, and the running balances between you. Games live inside
                a group, so make one to get started — or ask someone to send
                you their group&apos;s invite link.
              </p>
              <form action={createGroup} className="flex gap-2">
                <Input
                  name="name"
                  required
                  placeholder="Tuesday crew"
                  maxLength={80}
                />
                <Button type="submit">Create group</Button>
              </form>
            </CardContent>
          </Card>
        </section>
      )}
      {/* Away from everything else: it used to sit 8px from Profile, and in an
          installed PWA a mis-tap means signing back in with Google mid-game. */}
      <form action={signOut} className="mt-2 flex justify-center">
        <Button variant="ghost" size="sm" type="submit">
          Sign out
        </Button>
      </form>
    </main>
  )
}
