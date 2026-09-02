import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSessionUser } from '@/lib/supabase/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  RemoveMemberButton,
  ReactivateMemberButton,
} from '@/components/group/member-actions'
import { MemberRoleMenu } from '@/components/group/member-role-menu'
import { GroupSettingsForm } from '@/components/group/group-settings-form'
import { resolveDisplayName } from '@/lib/names'
import { DeleteGroup } from '@/components/group/delete-group'
import { AvatarUpload } from '@/components/avatar-upload'

export default async function EditGroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>
  searchParams: Promise<{ error?: string; saved?: string; rejoin?: string }>
}) {
  const { groupId } = await params
  const { error: errorMessage, saved, rejoin } = await searchParams
  const supabase = await createClient()

  const user = await getSessionUser(supabase)
  if (!user) redirect('/login')

  const [{ data: group }, { data: members }] = await Promise.all([
    supabase
      .from('groups')
      .select(
        'id, name, avatar_url, default_buyin_cents, chips_per_dollar, default_seat_limit'
      )
      .eq('id', groupId)
      .maybeSingle(),
    supabase
      .from('group_members')
      .select('id, display_name, role, profile_id, is_active, profiles(display_name)')
      .eq('group_id', groupId)
      .order('display_name'),
  ])

  if (!group) notFound()

  const me = members?.find((m) => m.profile_id === user.id)
  // RLS is the real guard on every write here; this only decides what to draw.
  if (me?.role !== 'owner' && me?.role !== 'admin') {
    redirect(`/groups/${groupId}`)
  }
  // Roles and deletion are the owner's, not an admin's.
  const isOwner = me.role === 'owner'

  const active = members?.filter((m) => m.is_active) ?? []
  const inactive = members?.filter((m) => !m.is_active) ?? []
  const rejoining = inactive.find((m) => m.id === rejoin)

  async function saveGroupAvatar(path: string | null) {
    'use server'
    const supabase = await createClient()
    const { error } = await supabase
      .from('groups')
      .update({ avatar_url: path })
      .eq('id', groupId)
    return { error: error?.message ?? null }
  }

  async function addMember(formData: FormData) {
    'use server'
    const name = String(formData.get('name') ?? '').trim()
    if (!name) return
    const supabase = await createClient()

    // A returning guest should get their original row back, not a duplicate
    // that splits their history in two.
    const { data: match } = await supabase
      .from('group_members')
      .select('id')
      .eq('group_id', groupId)
      .eq('is_active', false)
      .ilike('display_name', name)
      .maybeSingle()

    if (match) {
      redirect(`/groups/${groupId}/edit?rejoin=${match.id}`)
    }

    const { error } = await supabase
      .from('group_members')
      .insert({ group_id: groupId, display_name: name })
    if (error) {
      redirect(
        `/groups/${groupId}/edit?error=${encodeURIComponent(error.message)}`
      )
    }
    revalidatePath(`/groups/${groupId}`)
    redirect(`/groups/${groupId}/edit`)
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 p-4">
      <header>
        <Link
          href={`/groups/${groupId}`}
          className="text-xs text-muted-foreground"
        >
          &larr; {group.name}
        </Link>
        <h1 className="text-lg font-semibold tracking-tight">Edit group</h1>
      </header>

      {errorMessage && (
        <p className="rounded-xl bg-down-soft px-3 py-2 text-sm text-down">
          {errorMessage}
        </p>
      )}
      {saved && (
        <p className="rounded-xl bg-up-soft px-3 py-2 text-sm text-up">
          Settings saved.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Settings</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* The storage policy checks this group id against owner/admin, so
              hiding the control is presentation, not the guard. */}
          <AvatarUpload
            bucket="group-avatars"
            ownerId={groupId}
            entityId={groupId}
            name={group.name}
            currentUrl={group.avatar_url}
            onSaved={saveGroupAvatar}
          />

          <GroupSettingsForm
            groupId={groupId}
            initial={{
              name: group.name,
              seatLimit: group.default_seat_limit,
              buyinCents: group.default_buyin_cents,
              chipsPerDollar: Number(group.chips_per_dollar),
            }}
          />
        </CardContent>
      </Card>

      <section className="flex flex-col gap-2">
        <h2 className="text-[0.7rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Members ({active.length})
        </h2>
        {active.map((m) => (
          <div
            key={m.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2.5"
          >
            {isOwner ? (
              <MemberRoleMenu
                memberId={m.id}
                role={m.role}
                name={resolveDisplayName(m.display_name, m.profiles?.display_name)}
              >
                <span className="block min-w-0 truncate text-sm">
                  <span className="font-medium">{resolveDisplayName(m.display_name, m.profiles?.display_name)}</span>
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    {m.role}
                  </span>
                </span>
              </MemberRoleMenu>
            ) : (
              <span className="min-w-0 truncate text-sm">
                <span className="font-medium">{resolveDisplayName(m.display_name, m.profiles?.display_name)}</span>
                <span className="ml-1.5 text-xs text-muted-foreground">
                  {m.role}
                </span>
              </span>
            )}
            <span className="flex items-center gap-2">
              {m.role !== 'owner' && (
                <RemoveMemberButton memberId={m.id} name={resolveDisplayName(m.display_name, m.profiles?.display_name)} />
              )}
            </span>
          </div>
        ))}
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add player</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {rejoining && (
            <div className="flex flex-col gap-2 rounded-xl bg-muted px-3 py-2.5">
              <p className="text-sm">
                <span className="font-medium">{rejoining.display_name}</span>{' '}
                is already in this group but inactive. Reactivate them so their
                history comes back?
              </p>
              <div className="flex gap-2">
                <ReactivateMemberButton
                  memberId={rejoining.id}
                  name={rejoining.display_name}
                />
              </div>
            </div>
          )}
          <form action={addMember} className="flex gap-2">
            <Input
              name="name"
              required
              placeholder="Player name"
              maxLength={80}
            />
            <Button type="submit">Add</Button>
          </form>
        </CardContent>
      </Card>

      {inactive.length > 0 && (
        <details className="rounded-2xl border border-border px-3 py-2.5">
          <summary className="cursor-pointer text-sm text-muted-foreground">
            Inactive members ({inactive.length})
          </summary>
          <div className="flex flex-col gap-2 pt-3">
            <p className="text-xs text-muted-foreground">
              Hidden from the roster and from new games. Their past games still
              show their name and numbers.
            </p>
            {inactive.map((m) => (
              <div
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2.5"
              >
                <span className="text-sm">{resolveDisplayName(m.display_name, m.profiles?.display_name)}</span>
                <ReactivateMemberButton
                  memberId={m.id}
                  name={resolveDisplayName(m.display_name, m.profiles?.display_name)}
                />
              </div>
            ))}
          </div>
        </details>
      )}
      {isOwner && <DeleteGroup groupId={groupId} groupName={group.name} />}
    </main>
  )
}
