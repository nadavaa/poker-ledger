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
