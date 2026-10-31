// The four screens of the story, as pure functions of a local progress t in
// [0, 1]. Every number comes from lib/landing-demo.ts (the same money helpers
// and settle() as the app), so a screen can never show arithmetic the app
// would not. Invented players only.

import { chipsToCents, formatCents } from '@/lib/money'
import {
  DEMO_BUY_IN_CENTS,
  DEMO_CHIPS_PER_DOLLAR,
  DEMO_PLAYERS,
  buyInCount,
  canSettle,
  countedChips,
  demoNets,
  demoTransfers,
  differenceChips,
  inCents,
  outCents,
  playerName,
  potCents,
  potChips,
  seedBuyIns,
  seedCounts,
} from '@/lib/landing-demo'

export const SCENE_COUNT = 4

export function ramp(t: number, a: number, b: number) {
  return Math.min(1, Math.max(0, (t - a) / (b - a)))
}

const chips = (n: number) => n.toLocaleString('en-US')

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[0.62rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
      {children}
    </span>
  )
}

function Header({ cents, chipsN }: { cents: number; chipsN: number }) {
  return (
    <div className="border-b px-4 pb-2.5 pt-4">
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Label>Pot</Label>
          <span className="flex items-center gap-1.5 text-[0.7rem] text-muted-foreground">
            <span aria-hidden className="size-1.5 rounded-full bg-live" />
            Live
          </span>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="money-display text-[2.1rem] font-semibold">
            {formatCents(cents)}
          </span>
          <span className="money text-[0.68rem] text-muted-foreground">
            {chips(chipsN)} chips
          </span>
        </div>
      </div>
    </div>
  )
}

function PlayerRow({
  name,
  sub,
  right,
  dim,
}: {
  name: string
  sub: string
  right: React.ReactNode
  dim?: boolean
}) {
  return (
    <li
      className={`flex items-center justify-between gap-2 rounded-xl border bg-card px-3 py-1 ${
        dim ? 'opacity-45' : ''
      }`}
    >
      <div className="min-w-0">
        <p className="truncate text-[0.82rem] font-medium">{name}</p>
        <p className="money text-[0.66rem] text-muted-foreground">{sub}</p>
      </div>
      {right}
    </li>
  )
}

/** Scene 0: buy-ins arrive and the pot climbs. */
function LiveScene({ t }: { t: number }) {
  const n = Math.round(ramp(t, 0.02, 0.9) * 10)
  const all = seedBuyIns()
  const log = all.slice(0, n)
  const feed = [...log].reverse().slice(0, 3)
  return (
    <>
      <Header cents={potCents(log)} chipsN={potChips(log)} />
      <ul className="flex flex-col gap-1 px-4 py-2">
        {DEMO_PLAYERS.map((p) => (
          <PlayerRow
            key={p.id}
            name={p.name}
            sub={`${buyInCount(log, p.id)} buy-in${
              buyInCount(log, p.id) === 1 ? '' : 's'
            } · ${formatCents(inCents(log, p.id))}`}
            right={
              <span className="money rounded-md bg-primary px-2.5 py-1.5 text-[0.72rem] font-semibold text-primary-foreground">
                + {formatCents(DEMO_BUY_IN_CENTS)}
              </span>
            }
          />
        ))}
      </ul>
      <div className="mt-auto flex flex-col gap-1 border-t px-4 py-3">
        <Label>Feed</Label>
        {feed.length === 0 && (
          <p className="text-[0.7rem] text-muted-foreground">Waiting for the first buy-in.</p>
        )}
        {feed.map((b) => (
          <p key={b.id} className="text-[0.7rem]">
            {playerName(b.playerId)} · +{formatCents(DEMO_BUY_IN_CENTS)}
          </p>
        ))}
      </div>
    </>
  )
}

/** Scenes 1 and 2: the count, with the settle gate. */
function CountScene({
  t,
  assign,
}: {
  t: number
  /** Scene 2: Sam's miscount is assigned in hundred-chip steps. */
  assign: boolean
}) {
  const log = seedBuyIns()
  const base = seedCounts()
  // Scene 1 types each count in; scene 2 starts complete and closes the gap.
  const k = assign ? 6 : Math.round(ramp(t, 0.02, 0.85) * 6)
  const steps = assign ? Math.min(3, Math.floor(ramp(t, 0.3, 0.72) * 3.999)) : 0
  const counts = Object.fromEntries(
    DEMO_PLAYERS.map((p, i) => [
      p.id,
      i < k ? (p.id === 'sam' ? 4000 + steps * 100 : base[p.id]) : null,
    ])
  )
  const diff = differenceChips(log, counts)
  const counted = k === 6
  const ready = canSettle(log, counts)

  let status = 'Still counting'
  let tone = 'text-pending'
  let glyph = '○'
  if (counted && diff === 0) {
    status = 'Balanced'
    tone = 'text-up'
    glyph = '✓'
  } else if (counted) {
    status = `Short by ${chips(diff)} chips (${formatCents(
      chipsToCents(diff, DEMO_CHIPS_PER_DOLLAR)
    )})`
    tone = 'text-down'
    glyph = '▲'
  }

  return (
    <>
      <Header cents={potCents(log)} chipsN={potChips(log)} />
      <ul className="flex flex-col gap-1 px-4 py-2">
        {DEMO_PLAYERS.map((p) => {
          const c = counts[p.id]
          const isSam = assign && p.id === 'sam'
          return (
            <PlayerRow
              key={p.id}
              name={p.name}
              sub={`In ${formatCents(inCents(log, p.id))}${
                c !== null ? ` · out ${formatCents(outCents(counts, p.id))}` : ''
              }`}
              right={
                <span
                  className={`money w-16 rounded-md border px-2 py-1 text-right text-[0.78rem] ${
                    isSam && steps > 0 ? 'border-foreground' : ''
                  } ${c === null ? 'text-muted-foreground' : ''}`}
                >
                  {c === null ? 'chips' : chips(c)}
                </span>
              }
            />
          )
        })}
      </ul>
      <div className="mt-auto flex flex-col gap-1 border-t px-4 py-2.5">
        <div className="money flex justify-between text-[0.68rem] text-muted-foreground">
          <span>Pot {chips(potChips(log))}</span>
          <span>Counted {chips(countedChips(counts))}</span>
        </div>
        <p className={`text-[0.8rem] font-medium ${tone}`}>
          <span aria-hidden>{glyph} </span>
          {status}
        </p>
        <span
          className={`rounded-lg py-2 text-center text-[0.8rem] font-semibold ${
            ready
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {ready ? 'Settle game' : 'Settle game · locked'}
        </span>
      </div>
    </>
  )
}

/** Scene 3: results, then who pays whom, then the handshake. */
function SettleScene({ t }: { t: number }) {
  const log = seedBuyIns()
  const counts = { ...seedCounts(), sam: 4300 }
  const nets = demoNets(log, counts)
    .slice()
    .sort((a, b) => b.netCents - a.netCents)
  const transfers = demoTransfers(log, counts) ?? []
  return (
    <div className="flex flex-1 flex-col gap-2 overflow-hidden px-4 pb-3 pt-5">
      <Label>Results</Label>
      <ul className="flex flex-col gap-0.5">
        {nets.map((n) => (
          <li key={n.memberId} className="flex justify-between text-[0.76rem]">
            <span>{playerName(n.memberId)}</span>
            <span
              className={`money font-semibold ${
                n.netCents > 0 ? 'text-up' : 'text-down'
              }`}
            >
              {n.netCents > 0 ? '▲ +' : '▼ '}
              {formatCents(n.netCents)}
            </span>
          </li>
        ))}
      </ul>
      <Label>Who pays whom</Label>
      <ul className="flex flex-col gap-1">
        {transfers.map((tr, i) => {
          const shown = t > 0.04 + i * 0.09
          const state =
            i === 0 && t > 0.86
              ? 'confirmed'
              : i === 0 && t > 0.7
                ? 'paid'
                : 'pending'
          return (
            <li
              key={`${tr.fromMemberId}-${tr.toMemberId}`}
              className="flex items-center justify-between gap-2 rounded-lg border bg-card px-2.5 py-1.5 text-[0.72rem]"
              style={{
                opacity: shown ? 1 : 0,
                transform: `translateY(${shown ? 0 : 6}px)`,
                transition: 'opacity 200ms, transform 200ms',
              }}
            >
              <span>
                {playerName(tr.fromMemberId)} pays {playerName(tr.toMemberId)}{' '}
                <span className="money font-semibold">
                  {formatCents(tr.amountCents)}
                </span>
              </span>
              <span
                className={
                  state === 'confirmed'
                    ? 'text-up'
                    : state === 'paid'
                      ? 'text-amber-600'
                      : 'text-pending'
                }
              >
                {state === 'confirmed' ? '✓' : state === 'paid' ? '◐' : '○'}
              </span>
            </li>
          )
        })}
      </ul>
      <p className="mt-auto text-[0.66rem] text-muted-foreground">
        {transfers.length} payments for {nets.length} players.
      </p>
    </div>
  )
}

export function Scene({ i, t }: { i: number; t: number }) {
  return (
    <div className="lp-scene">
      {i === 0 && <LiveScene t={t} />}
      {i === 1 && <CountScene t={t} assign={false} />}
      {i === 2 && <CountScene t={t} assign />}
      {i === 3 && <SettleScene t={t} />}
    </div>
  )
}

export function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="lp-phone">
      <div className="lp-phone-screen">{children}</div>
    </div>
  )
}
