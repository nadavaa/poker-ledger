// Data that is only for the view: pictures, and the few numbers a screen shows
// that the text result does not carry. It travels in the tool result's `_meta`,
// which the host hands to the page but does not show to the model, so the text
// every tool returns stays exactly as it was.
//
// Lists are parallel to the list in the text result, in the same order. The
// order comes from the same helpers on both sides (see map.ts), so a picture
// can never end up beside the wrong name.

import { avatarSrc } from '../../avatar'
import { money, type Money } from '../format'

export const UI_META_KEY = 'poker-ledger/ui'

export type UiMeta = {
  /** list_my_groups: one per group. */
  groups?: { avatar: string | null }[]
  /** list_group_members: one per member. */
  members?: { avatar: string | null; isMe: boolean }[]
  /** list_games: one per game. Finished games only carry players and pot. */
  games?: { players: number | null; pot: Money | null; myNet: Money | null }[]
  /** get_game: parallel to roster, waitlist and money.players. */
  roster?: { avatar: string | null }[]
  waitlist?: { avatar: string | null }[]
  players?: { avatar: string | null }[]
}

export const personAvatar = (url: string | null | undefined) => avatarSrc(url, 'avatars')
export const groupAvatar = (url: string | null | undefined) => avatarSrc(url, 'group-avatars')

type TotalsLite = { game_id: string; member_id: string; buyin_cents: number; net_cents: number }

/**
 * What a finished game's row in the list shows: how many played, the pot, and
 * (settled only, since an unfinished game has no meaningful net) my result.
 */
export function gameListFacts(args: {
  games: { id: string; status: string }[]
  totals: TotalsLite[]
  myMemberId: string | null
}): NonNullable<UiMeta['games']> {
  return args.games.map((g) => {
    if (g.status === 'scheduled' || g.status === 'active') {
      return { players: null, pot: null, myNet: null }
    }
    const rows = args.totals.filter((t) => t.game_id === g.id)
    const mine = rows.find((t) => t.member_id === args.myMemberId)
    return {
      players: rows.length,
      pot: money(rows.reduce((s, t) => s + t.buyin_cents, 0)),
      myNet: g.status === 'settled' && mine ? money(mine.net_cents) : null,
    }
  })
}
