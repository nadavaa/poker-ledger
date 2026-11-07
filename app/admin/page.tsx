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
import {
  changesFor,
  formatDelta,
  gamesInLast,
  goneQuiet,
  groupStatus,
  sourceCounts,
  type Change,
  type GroupStatus,
} from '@/lib/admin-tracking'
import { describeSource } from '@/lib/signup-source'

// Nothing here needs to be live. Names are shown (decided 2026-11-06); emails,
// phone numbers and payment handles never are.
const REVALIDATE = 300

const load = unstable_cache(
  async () => {
    const admin = createAdminClient()
    if (!admin) return null
    // "Outside" is relative to the owner. isOwner() already passed, so this
    // is set; an empty string would match nobody and mark every group outside.
    const owner = process.env.OWNER_USER_ID ?? ''
    const [overview, weekly, monthly, cohorts, groups, steps, setup, users] =
      await Promise.all([
        admin.rpc('admin_overview'),
        admin.rpc('admin_weekly'),
        admin.rpc('admin_monthly_signups'),
        admin.rpc('admin_cohorts'),
        admin.rpc('admin_groups_detail', { p_owner: owner }),
        admin.rpc('admin_onboarding'),
        admin.rpc('admin_onboarding_totals'),
        admin.rpc('admin_users_detail', { p_owner: owner }),
      ])
    return {
      m: (overview.data ?? {}) as Record<string, number | null>,
      weekly: weekly.data ?? [],
      monthly: monthly.data ?? [],
      cohorts: cohorts.data ?? [],
      groups: groups.data ?? [],
      users: users.data ?? [],
      steps: steps.data ?? [],
      setup: (setup.data ?? {}) as Record<string, number | null>,
      error:
        overview.error?.message ??
        weekly.error?.message ??
        groups.error?.message ??
        users.error?.message ??
        null,
    }
  },
  ['admin-metrics'],
  { revalidate: REVALIDATE }
)

const TZ = DEFAULT_TIME_ZONE

const STATUS_STYLE: Record<GroupStatus, string> = {
  new: 'bg-live-soft text-live',
  active: 'bg-up-soft text-up',
  quiet: 'bg-muted text-muted-foreground',
}

const SECTION =
  'text-[0.7rem] font-medium uppercase tracking-[0.08em] text-muted-foreground'

function ChangeCell({ c }: { c: Change }) {
  return (
    <td className="money py-2 pl-2 text-right">
      {c.now}{' '}
      <span
        className={
          c.delta > 0
            ? 'text-up'
            : c.delta < 0
              ? 'text-down'
              : 'text-muted-foreground'
        }
      >
        ({formatDelta(c.delta)})
      </span>
    </td>
  )
}

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

  // Not cached with the metrics: a note someone just sent should be here on
  // the next refresh, not in five minutes.
  const { data: feedback, error: feedbackError } = (await createAdminClient()
    ?.from('feedback')
    .select('id, kind, message, page_path, created_at, profiles(display_name)')
    .order('created_at', { ascending: false })
    .limit(50)) ?? { data: null, error: null }

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

  const { m, weekly, monthly, cohorts, groups, users, steps, setup } = data
  // Rendered at most every few minutes for one person; the windows only need
  // to be right to the hour.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  const week = changesFor(users, groups, 7, now)
  const month = changesFor(users, groups, 30, now)
  const quiet = goneQuiet(groups, now)
  const sources = sourceCounts(users, 30, now)
  const CHANGE_ROWS: { label: string; key: 'outsideUsers' | 'signups' | 'groupsCreated' | 'activeGroups' }[] = [
    { label: 'Outside users', key: 'outsideUsers' },
    { label: 'Sign-ups', key: 'signups' },
    { label: 'New groups', key: 'groupsCreated' },
    { label: 'Active groups', key: 'activeGroups' },
  ]
  const o = (k: string) => setup[k] ?? 0
  const STEP_LABEL: Record<string, string> = {
    name: 'Your name',
    pay: 'How you get paid',
    photo: 'Photo',
  }
  const n = (k: string) => m[k] ?? 0

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 p-4">
      <header className="page-header">
        <h1 className="text-lg font-semibold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Refreshed every {REVALIDATE / 60} minutes. Names only, no contact or
          payment details.
        </p>
      </header>

      {data.error && (
        <p className="rounded-xl bg-down-soft px-3 py-2 text-sm text-down">
          {data.error}
        </p>
      )}

      <section className="flex flex-col gap-2">
        <h2 className={SECTION}>Feedback ({feedback?.length ?? 0})</h2>
        {feedbackError && (
          <p className="rounded-xl bg-down-soft px-3 py-2 text-sm text-down">
            {feedbackError.message}
          </p>
        )}
        {!feedbackError && (feedback ?? []).length === 0 && (
          <p className="rounded-xl border border-dashed border-border/70 px-3 py-4 text-center text-sm text-muted-foreground">
            No feedback yet.
          </p>
        )}
        {(feedback ?? []).map((f) => (
          <div key={f.id} className="flex flex-col gap-1 rounded-2xl border border-border bg-card px-3.5 py-3">
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 font-medium ${
                    f.kind === 'bug' ? 'bg-down-soft text-down' : 'bg-live-soft text-live'
                  }`}
                >
                  {f.kind === 'bug' ? 'Bug' : 'Idea'}
                </span>
                {f.profiles?.display_name ?? 'Unnamed'}
              </span>
              <span>{formatTime(f.created_at, TZ, 'day')}</span>
            </div>
            <p className="whitespace-pre-wrap text-sm">{f.message}</p>
            {f.page_path && (
              <p className="text-[0.7rem] text-muted-foreground">from {f.page_path}</p>
            )}
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className={SECTION}>What changed</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-1 pr-2 font-medium" />
              <th className="py-1 pl-2 text-right font-medium">Last 7 days</th>
              <th className="py-1 pl-2 text-right font-medium">Last 30 days</th>
            </tr>
          </thead>
          <tbody>
            {CHANGE_ROWS.map((r) => (
              <tr key={r.key} className="border-t border-border">
                <td className="py-2 pr-2">{r.label}</td>
                <ChangeCell c={week[r.key]} />
                <ChangeCell c={month[r.key]} />
              </tr>
            ))}
            <tr className="border-t border-border">
              <td className="py-2 pr-2">Gone quiet</td>
              <td className="py-2 pl-2 text-right text-muted-foreground">—</td>
              <td className={`money py-2 pl-2 text-right ${quiet > 0 ? 'text-down' : ''}`}>
                {quiet}
              </td>
            </tr>
          </tbody>
        </table>
        <p className="text-[0.7rem] text-muted-foreground">
          Outside user = a signed-in account in a group you&apos;re not in;
          the change is against the total when the window opened. The others
          compare with the window before. Active = a game started. Gone quiet
          = played 30–60 days ago, not since.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className={SECTION}>Sign-ups by source, last 30 days</h2>
        {sources.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No sign-ups in the last 30 days.
          </p>
        ) : (
          <div className="rounded-2xl border border-border bg-card px-3.5 py-1">
            {sources.map((x) => (
              <FunnelRow key={x.source} label={x.source} value={x.count} />
            ))}
          </div>
        )}
        <p className="text-[0.7rem] text-muted-foreground">
          From a ?ref= tag on the link, else the site they came from, else an
          invite link, else direct. Unknown = the sign-in link was opened in a
          different browser.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className={SECTION}>Users ({users.length})</h2>
        {users.length === 0 ? (
          <p className="text-sm text-muted-foreground">No users yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1 pr-2 font-medium">User</th>
                  <th className="py-1 pr-2 text-right font-medium">Groups</th>
                  <th className="py-1 pr-2 text-right font-medium">Games</th>
                  <th className="py-1 text-right font-medium">Last</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => (
                  <tr key={`${u.created_at}-${i}`} className="border-t border-border">
                    <td className="py-2 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span>{u.display_name}</span>
                        {u.outside_groups > 0 && (
                          <span className="rounded-full bg-live-soft px-1.5 text-[0.65rem] text-live">
                            outside
                          </span>
                        )}
                      </div>
                      <div className="text-[0.7rem] text-muted-foreground">
                        {formatTime(u.created_at, TZ, 'shortDay')} ·{' '}
                        {describeSource(u.signup_source)}
                      </div>
                    </td>
                    <td className="money py-2 pr-2 text-right">{u.groups}</td>
                    <td className="money py-2 pr-2 text-right">{u.games}</td>
                    <td className="py-2 text-right text-muted-foreground">
                      {u.last_game ? formatTime(u.last_game, TZ, 'shortDay') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[0.7rem] text-muted-foreground">
          Newest first. Games = games with a buy-in that wasn&apos;t voided.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className={SECTION}>Groups ({groups.length})</h2>
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">No groups yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1 pr-2 font-medium">Group</th>
                  <th className="py-1 pr-2 text-right font-medium">Members</th>
                  <th className="py-1 pr-2 text-right font-medium">Settled</th>
                  <th className="py-1 pr-2 text-right font-medium">30d</th>
                  <th className="py-1 text-right font-medium">Last</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g, i) => {
                  const status = groupStatus(g, now)
                  return (
                    <tr key={`${g.created_at}-${i}`} className="border-t border-border">
                      <td className="py-2 pr-2">
                        <div>{g.name}</div>
                        <div className="flex items-center gap-1.5 text-[0.7rem] text-muted-foreground">
                          <span>{formatTime(g.created_at, TZ, 'shortDay')}</span>
                          <span className={`rounded-full px-1.5 ${STATUS_STYLE[status]}`}>
                            {status}
                          </span>
                          {g.outside && <span>outside</span>}
                        </div>
                      </td>
                      <td className="money py-2 pr-2 text-right">
                        {g.claimed}
                        <span className="text-muted-foreground">/{g.members}</span>
                      </td>
                      <td className="money py-2 pr-2 text-right">{g.settled}</td>
                      <td className="money py-2 pr-2 text-right">
                        {gamesInLast(g, 30, now)}
                      </td>
                      <td className="py-2 text-right text-muted-foreground">
                        {g.last_game ? formatTime(g.last_game, TZ, 'shortDay') : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[0.7rem] text-muted-foreground">
          Newest first. Members = signed in / total. New = created in the last
          14 days; active = a game in the last 30; quiet = neither.
        </p>
      </section>

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
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[0.7rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Onboarding funnel
        </h2>
        <div className="grid grid-cols-3 gap-2">
          <Metric label="Started" value={String(o('started'))} />
          <Metric
            label="Finished"
            value={formatPct(pct(o('completed'), o('started')))}
            sub={`${o('abandoned')} gave up`}
          />
          <Metric
            label="Filled something in"
            value={formatPct(pct(o('completed_with_input'), o('started')))}
            sub={`${o('skipped_everything')} skipped it all`}
          />
        </div>

        {steps.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nobody has been through setup since tracking was added.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1 pr-2 font-medium">Step</th>
                <th className="py-1 pr-2 text-right font-medium">Saw</th>
                <th className="py-1 pr-2 text-right font-medium">Filled</th>
                <th className="py-1 pr-2 text-right font-medium">Skipped</th>
                <th className="py-1 text-right font-medium">Dropped</th>
              </tr>
            </thead>
            <tbody>
              {steps.map((st) => (
                <tr key={st.step} className="border-t border-border">
                  <td className="py-2 pr-2">
                    {STEP_LABEL[st.step] ?? st.step}
                  </td>
                  <td className="money py-2 pr-2 text-right">{st.viewed}</td>
                  <td className="money py-2 pr-2 text-right">{st.saved}</td>
                  <td className="money py-2 pr-2 text-right text-muted-foreground">
                    {st.skipped}
                  </td>
                  <td
                    className={`money py-2 text-right ${
                      st.dropped > 0 ? 'text-down' : 'text-muted-foreground'
                    }`}
                  >
                    {st.dropped}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="text-[0.7rem] text-muted-foreground">
          Dropped = last step they reached before leaving without finishing.
          Skipping every step still counts as finishing, and still leaves
          somebody who can&apos;t be paid — that&apos;s what the second tile
          separates. Counted from the day step tracking was added.
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

    </main>
  )
}
