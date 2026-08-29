import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSessionUser } from '@/lib/supabase/auth'
import { centsToDollars, dollarsToCents } from '@/lib/money'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  RemoveMemberButton,
  ReactivateMemberButton,
} from '@/components/group/member-actions'

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
        'id, name, default_buyin_cents, chips_per_dollar, default_seat_limit'
      )
      .eq('id', groupId)
      .maybeSingle(),
    supabase
      .from('group_members')
      .select('id, display_name, role, profile_id, is_active')
      .eq('group_id', groupId)
      .order('display_name'),
  ])

  if (!group) notFound()

  const me = members?.find((m) => m.profile_id === user.id)
  // RLS is the real guard on every write here; this only decides what to draw.
  if (me?.role !== 'owner' && me?.role !== 'admin') {
    redirect(`/groups/${groupId}`)
  }

  const active = members?.filter((m) => m.is_active) ?? []
  const inactive = members?.filter((m) => !m.is_active) ?? []
  const rejoining = inactive.find((m) => m.id === rejoin)

  async function saveSettings(formData: FormData) {
    'use server'
    const supabase = await createClient()
    const name = String(formData.get('name') ?? '').trim()
    const seats = Number(formData.get('default_seat_limit'))
    const ratio = Number(formData.get('chips_per_dollar'))

    let buyinCents: number
    try {
      buyinCents = dollarsToCents(String(formData.get('default_buyin') ?? ''))
    } catch {
      redirect(`/groups/${groupId}/edit?error=Enter+a+valid+buy-in+amount`)
    }

    // These are defaults for the *next* game. Existing games snapshotted
    // their own values at creation and are unaffected.
    const { error } = await supabase
      .from('groups')
      .update({
        name,
        default_buyin_cents: buyinCents,
        chips_per_dollar: ratio,
        default_seat_limit: seats,
      })
      .eq('id', groupId)

    if (error) {
      redirect(
        `/groups/${groupId}/edit?error=${encodeURIComponent(error.message)}`
      )
    }
    revalidatePath(`/groups/${groupId}`)
    redirect(`/groups/${groupId}/edit?saved=1`)
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
        <CardContent>
          <form action={saveSettings} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Group name</Label>
              <Input
                id="name"
                name="name"
                required
                maxLength={80}
                defaultValue={group.name}
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="default_seat_limit">Seats</Label>
                <Input
                  id="default_seat_limit"
                  name="default_seat_limit"
                  type="number"
                  min={2}
                  max={50}
                  required
                  defaultValue={group.default_seat_limit}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="default_buyin">Buy-in $</Label>
                <Input
                  id="default_buyin"
                  name="default_buyin"
                  inputMode="decimal"
                  required
                  defaultValue={centsToDollars(group.default_buyin_cents)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="chips_per_dollar">Chips/$</Label>
                <Input
                  id="chips_per_dollar"
                  name="chips_per_dollar"
                  type="number"
                  step="0.25"
                  min={0.25}
                  required
                  defaultValue={group.chips_per_dollar}
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              These are the starting values for the next game you create.
              Games already scheduled or played keep the numbers they were
              created with.
            </p>

            <Button className="h-11 rounded-xl" type="submit">
              Save settings
            </Button>
          </form>
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
            <span className="min-w-0 text-sm">
              <span className="font-medium">{m.display_name}</span>
              <span className="ml-1.5 text-xs text-muted-foreground">
                {m.role}
                {!m.profile_id && ' · unclaimed'}
              </span>
            </span>
            {m.role !== 'owner' && (
              <RemoveMemberButton memberId={m.id} name={m.display_name} />
            )}
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
                <span className="text-sm">{m.display_name}</span>
                <ReactivateMemberButton
                  memberId={m.id}
                  name={m.display_name}
                />
              </div>
            ))}
          </div>
        </details>
      )}
    </main>
  )
}
