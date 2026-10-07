// Plain-text game summary for pasting into the group chat.
//
// Pure, like settle.ts and stats.ts: no Supabase, no React. WhatsApp is where
// this group actually lives, so the app's job is to produce text worth
// pasting rather than to compete with it as a notification channel.

import { formatCents } from './money'

export type SummaryPlayer = { name: string; netCents: number }
export type SummaryTransfer = {
  fromName: string
  toName: string
  amountCents: number
  confirmed: boolean
}

export function gameSummary({
  title,
  potCents,
  players,
  transfers,
}: {
  title: string
  potCents: number
  players: SummaryPlayer[]
  transfers: SummaryTransfer[]
}): string {
  const lines: string[] = []

  lines.push(`🃏 ${title}`)
  lines.push(
    `${formatCents(potCents)} pot · ${players.length} player${
      players.length === 1 ? '' : 's'
    }`
  )
  lines.push('')

  // Winners first — that's the part people scroll for.
  for (const p of [...players].sort((a, b) => b.netCents - a.netCents)) {
    const sign = p.netCents > 0 ? '+' : ''
    lines.push(`${p.name}  ${sign}${formatCents(p.netCents)}`)
  }

  if (transfers.length > 0) {
    lines.push('')
    lines.push('Payments')
    for (const t of transfers) {
      lines.push(
        `${t.confirmed ? '✅' : '•'} ${t.fromName} → ${t.toName}  ${formatCents(
          t.amountCents
        )}`
      )
    }
    const done = transfers.filter((t) => t.confirmed).length
    lines.push('')
    lines.push(`${done} of ${transfers.length} settled`)
  }

  return lines.join('\n')
}

/**
 * The summary for a settled game, from the same rows the game screen holds.
 * The Copy button and the AI connector both come through here, so the text
 * cannot drift between them: the pot is the sum of buy-ins, players are the
 * results table, and a transfer is named by whoever the member is today.
 */
export function settledGameSummary({
  title,
  rows,
  transfers,
  names,
}: {
  title: string
  rows: { name: string; buyinCents: number; netCents: number }[]
  transfers: {
    fromMemberId: string
    toMemberId: string
    amountCents: number
    status: string
  }[]
  names: Map<string, string>
}): string {
  return gameSummary({
    title,
    potCents: rows.reduce((s, r) => s + r.buyinCents, 0),
    players: rows.map((r) => ({ name: r.name, netCents: r.netCents })),
    transfers: transfers.map((t) => ({
      fromName: names.get(t.fromMemberId) ?? 'Someone',
      toName: names.get(t.toMemberId) ?? 'someone',
      amountCents: t.amountCents,
      confirmed: t.status === 'confirmed',
    })),
  })
}
