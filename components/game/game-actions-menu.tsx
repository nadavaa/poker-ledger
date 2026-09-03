'use client'

import { useRef, useState } from 'react'
import { ActionSheet, DotsButton } from '@/components/action-sheet'
import { PopoverMenu, PopoverMenuItem } from '@/components/popover-menu'
import { EditGameForm } from '@/components/game/edit-game-form'
import type { GameStatus } from '@/lib/game-edit'

export type EditableGame = {
  name: string | null
  location: string | null
  scheduledAt: string
  seatLimit: number
  buyinCents: number
  chipsPerDollar: number
}

/**
 * Everything you can do to the game itself, behind one set of dots beside its
 * name. The menu is anchored to those dots; the edit form is a bottom sheet,
 * because a form with six fields is not a menu.
 *
 * Sharing is for anyone in the group; editing is the admin's, and is absent
 * rather than greyed out for everyone else.
 */
export function GameActionsMenu({
  gameId,
  status,
  groupName,
  when,
  location,
  buyinLabel,
  timeZone,
  canShare,
  canEdit,
  game,
}: {
  gameId: string
  status: GameStatus
  groupName: string
  when: string
  location: string | null
  buyinLabel?: string | null
  timeZone: string
  /** Scheduled and active games only: there is nothing to invite anyone to. */
  canShare: boolean
  canEdit: boolean
  game: EditableGame
}) {
  const anchor = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [done, setDone] = useState<'shared' | 'text' | 'link' | null>(null)

  // Nothing to offer: no dots at all, rather than a menu with no items.
  if (!canShare && !canEdit) return null

  function flash(what: 'shared' | 'text' | 'link') {
    setDone(what)
    setTimeout(() => setDone(null), 2000)
  }

  function url() {
    return `${window.location.origin}/games/${gameId}/join`
  }

  function message() {
    return [
      `🃏 Poker — ${groupName}`,
      [when, location].filter(Boolean).join(' · '),
      buyinLabel,
      '',
      `Tap to join: ${url()}`,
    ]
      .filter((line) => line !== null && line !== undefined)
      .join('\n')
  }

  async function share() {
    const text = message()
    // The OS sheet is the shortest path to WhatsApp on a phone, which is the
    // only place this link is ever going.
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ text })
        setOpen(false)
        flash('shared')
        return
      } catch {
        // Cancelled, or refused outside a user gesture. Fall through to the
        // clipboard rather than doing nothing.
      }
    }
    await navigator.clipboard.writeText(text)
    flash('text')
  }

  async function copyLink() {
    await navigator.clipboard.writeText(url())
    flash('link')
  }

  return (
    <>
      {/* The span is the anchor: Button doesn't forward a ref, and wrapping is
          cheaper than threading one through it. */}
      <span ref={anchor} className="inline-flex">
        <DotsButton
          label="Game options"
          size="icon"
          onClick={() => setOpen((v) => !v)}
        />
      </span>

      <PopoverMenu
        open={open}
        anchorRef={anchor}
        onClose={() => setOpen(false)}
        label="Game options"
      >
        {canShare && (
          <>
            <PopoverMenuItem onClick={share}>
              {done === 'shared'
                ? 'Shared'
                : done === 'text'
                  ? 'Copied to clipboard'
                  : 'Share game'}
            </PopoverMenuItem>
            <PopoverMenuItem onClick={copyLink}>
              {done === 'link' ? 'Copied' : 'Copy link'}
            </PopoverMenuItem>
          </>
        )}
        {canEdit && (
          <PopoverMenuItem
            onClick={() => {
              setOpen(false)
              setEditing(true)
            }}
          >
            Edit game
          </PopoverMenuItem>
        )}
      </PopoverMenu>

      <ActionSheet
        open={editing}
        title="Edit game"
        onClose={() => setEditing(false)}
      >
        <EditGameForm
          gameId={gameId}
          status={status}
          timeZone={timeZone}
          initial={game}
        />
      </ActionSheet>
    </>
  )
}
