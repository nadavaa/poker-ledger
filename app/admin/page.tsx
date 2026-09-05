import { notFound } from 'next/navigation'
import { unstable_cache } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSessionUser } from '@/lib/supabase/auth'
import { createAdminClient, isOwner } from '@/lib/supabase/admin'
import { formatCents } from '@/lib/money'
import { DEFAULT_TIME_ZONE, formatTime } from '@/lib/time'
import {
  formatDuration,
  formatHours,
  formatNumber,
  formatPct,
  pct,
} from '@/lib/admin'
import { BarChart, FunnelRow, Metric } from '@/components/admin/bar-chart'

// Nothing here needs to be live, and every number is an aggregate over the
// whole database.
const REVALIDATE = 300

const load = unstable_cache(
  async () => {
    const admin = createAdminClient()
    if (!admin) return null
    const [overview, weekly, monthly, cohorts, groups] = await Promise.all([
      admin.rpc('admin_overview'),
      admin.rpc('admin_weekly'),
      admin.rpc('admin_monthly_signups'),
      admin.rpc('admin_cohorts'),
      admin.rpc('admin_groups'),
    ])
    return {
      m: (overview.data ?? {}) as Record<string, number | null>,
      weekly: weekly.data ?? [],
      monthly: monthly.data ?? [],
      cohorts: cohorts.data ?? [],
      groups: groups.data ?? [],
      error:
        overview.error?.message ??
        weekly.error?.message ??
        groups.error?.message ??
        null,
    }
  },
  ['admin-metrics'],
  { revalidate: REVALIDATE }
)

const TZ = DEFAULT_TIME_ZONE

function shortDay(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

function shortMonth(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    timeZone: 'UTC',
  })
}

export default async function AdminPage() {
  const supabase = await createClient()
  const user = await getSessionUser(supabase)

  // The second of two gates. The middleware already rewrote this away for
  // anyone else; this is what holds if that check is ever changed or bypassed.
  // notFound(), never a 403 — the route does not exist for anyone but me.
  if (!isOwner(user?.id)) notFound()

  const data = await load()

  if (!data) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-col gap-3 p-4">
        <h1 className="text-lg font-semibold">Analytics</h1>
        <p className="rounded-xl bg-pending-soft px-3 py-2 text-sm text-pending">
          SUPABASE_SERVICE_ROLE_KEY is not set. The analytics functions are
          revoked from every other role, so nothing can read them without it.
        </p>
      </main>
    )
  }

  const { m, weekly, monthly, cohorts, groups } = data
  const n = (k: string) => m[k] ?? 0

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 p-4">
      <header className="page-header">
        <h1 className="text-lg font-semibold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Aggregates only, refreshed every {REVALIDATE / 60} minutes.
        </p>
      </header>

      {data.error && (
        <p className="rounded-xl bg-down-soft px-3 py-2 text-sm text-down">
          {data.error}
        </p>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-[0.7rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Growth
        </h2>
        <div className="grid grid-cols-3 gap-2">
          <Metric label="Users" value={String(n('users'))} />
          <Metric label="Groups" value={String(n('groups'))} />
          <Metric label="Games" value={String(n('games_played'))} />
          <Metric label="DAU" value={String(n('dau'))} />
          <Metric label="WAU" value={String(n('wau'))} />
          <Metric label="MAU" value={String(n('mau'))} />
        </div>

        <BarChart
          label="Signups per week"
          data={weekly.map((w) => ({
            label: shortDay(w.week),
            value: w.signups,
          }))}
        />
        <BarChart
          label="Signups per month"
          data={monthly.map((x) => ({
            label: shortMonth(x.month),
            value: x.signups,
          }))}
        />

        <div className="grid grid-cols-2 gap-2">
          <Metric
            label="Google"
            value={String(n('signup_google'))}
            sub={formatPct(
              pct(n('signup_google'), n('signup_google') + n('signup_magic_link'))
            )}
          />
          <Metric
            label="Magic link"
            value={String(n('signup_magic_link'))}
            sub={formatPct(
              pct(
                n('signup_magic_link'),
                n('signup_google') + n('signup_magic_link')
              )
            )}
          />
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[0.7rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Retention by signup week
        </h2>
        {cohorts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No cohorts yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1 pr-2 font-medium">Week</th>
                <th className="py-1 pr-2 text-right font-medium">Size</th>
                <th className="py-1 pr-2 text-right font-medium">Wk 2</th>
                <th className="py-1 text-right font-medium">Wk 4</th>
              </tr>
            </thead>
            <tbody>
              {cohorts.map((c) => (
                <tr key={c.cohort} className="border-t border-border">
                  <td className="py-2 pr-2">{shortDay(c.cohort)}</td>
                  <td className="money py-2 pr-2 text-right">{c.size}</td>
                  <td className="money py-2 pr-2 text-right">
                    {formatPct(pct(c.week2, c.size))}
                  </td>
                  <td className="money py-2 text-right">
                    {formatPct(pct(c.week4, c.size))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="text-[0.7rem] text-muted-foreground">
          Returned = did something in the app on days 7–14 and 21–28 after
          signing up. Sign-in alone doesn&apos;t count; sessions last weeks.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[0.7rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Setup
        </h2>
        <div className="grid grid-cols-3 gap-2">
          <Metric
            label="Onboarded"
            value={formatPct(
              pct(n('onboarding_finished'), n('onboarding_total'))
            )}
            sub={`${n('onboarding_finished')} of ${n('onboarding_total')}`}
          />
          <Metric
            label="Can be paid"
            value={formatPct(pct(n('payable'), n('onboarding_total')))}
            sub={`${n('pay_venmo')} Venmo · ${n('pay_zelle')} Zelle`}
          />
          <Metric
            label="Has photo"
            value={formatPct(pct(n('with_photo'), n('onboarding_total')))}
          />
        </div>
        <p className="text-[0.7rem] text-muted-foreground">
          Onboarding stores one timestamp, set whether you finish or skip, and
          records no step — so completed-vs-skipped and the drop-off step
          can&apos;t be answered without new instrumentation.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[0.7rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Engagement
        </h2>
        <BarChart
          label="Games created per week"
          data={weekly.map((w) => ({
            label: shortDay(w.week),
            value: w.games,
          }))}
        />
        <div className="grid grid-cols-2 gap-2">
          <Metric
            label="Players / game"
            value={formatNumber(m.median_players)}
            sub="median"
          />
          <Metric
            label="Game length"
            value={formatDuration(m.median_minutes)}
            sub="median"
          />
          <Metric
            label="Buy-ins / player"
            value={formatNumber(m.median_buyins_per_player)}
            sub="median"
          />
          <Metric
            label="Settled through app"
            value={formatCents(n('cents_settled'))}
            sub="cumulative"
          />
          <Metric
            label="With a food order"
            value={formatPct(pct(n('games_with_food'), n('games_started')))}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[0.7rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Product health
        </h2>
        <div className="grid grid-cols-2 gap-2">
          <Metric
            label="Needed an adjustment"
            value={formatPct(
              pct(n('games_needing_adjustment'), n('games_started'))
            )}
            sub={
              m.median_discrepancy_cents === null
                ? 'no discrepancies'
                : `median ${formatCents(
                    Math.round(m.median_discrepancy_cents ?? 0)
                  )}`
            }
          />
          <Metric
            label="Settlements confirmed"
            value={formatPct(
              pct(n('settlements_confirmed'), n('settlements_total'))
            )}
            sub={`median ${formatHours(m.median_confirm_hours)} to confirm`}
          />
          <Metric
            label="Stale > 7 days"
            value={String(n('settlements_stale'))}
            sub="pending settlements"
          />
          <Metric
            label="Voids / game"
            value={formatNumber(m.median_voids_per_game)}
            sub="median mis-taps"
          />
          <Metric
            label="Abandoned"
            value={String(n('games_abandoned'))}
            sub="started, never settled"
          />
          <Metric
            label="Admin handed off"
            value={String(n('games_with_handoff'))}
            sub="games"
          />
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[0.7rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Invite funnel
        </h2>
        <div className="rounded-2xl border border-border bg-card px-3.5 py-1">
          <FunnelRow label="Group invite opened" value={n('group_invite_clicks')} />
          <FunnelRow
            label="Joined the group"
            value={n('group_invite_joins')}
            of={n('group_invite_clicks')}
          />
          <FunnelRow
            label="Went on to play"
            value={n('invited_who_played')}
            of={n('group_invite_joins') + n('game_link_joins')}
          />
        </div>
        <div className="rounded-2xl border border-border bg-card px-3.5 py-1">
          <FunnelRow label="Game link opened" value={n('game_link_clicks')} />
          <FunnelRow
            label="Signed up or queued"
            value={n('game_link_joins')}
            of={n('game_link_clicks')}
          />
        </div>
        <p className="text-[0.7rem] text-muted-foreground">
          Counted from the day link tracking was added, so early invites
          aren&apos;t in here.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[0.7rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Groups
        </h2>
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">No groups yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1 pr-2 font-medium">Group</th>
                  <th className="py-1 pr-2 text-right font-medium">Members</th>
                  <th className="py-1 pr-2 text-right font-medium">Games</th>
                  <th className="py-1 text-right font-medium">Last</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.name} className="border-t border-border">
                    <td className="py-2 pr-2">{g.name}</td>
                    <td className="money py-2 pr-2 text-right">{g.members}</td>
                    <td className="money py-2 pr-2 text-right">{g.games}</td>
                    <td className="py-2 text-right text-muted-foreground">
                      {g.last_game
                        ? formatTime(g.last_game, TZ, 'shortDay')
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}
