'use client'

import { useState } from 'react'
import { ActionSheet, DotsButton } from '@/components/action-sheet'
import { Button } from '@/components/ui/button'
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
 * name. Sharing is for anyone in the group; editing is the admin's, and is
 * absent rather than greyed out for everyone else — a disabled control on
 * someone else's game is just noise.
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
  /** The group's zone: what the admin types is what the group sees. */
  timeZone: string
  /** Scheduled and active games only: there is nothing to invite anyone to. */
  canShare: boolean
  canEdit: boolean
  game: EditableGame
}) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'menu' | 'edit'>('menu')
  const [done, setDone] = useState<'shared' | 'text' | 'link' | null>(null)

  // Nothing to offer: no dots at all, rather than an empty sheet.
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

  function close() {
    setOpen(false)
    setView('menu')
  }

  return (
    <>
      <DotsButton
        label="Game options"
        size="icon"
        onClick={() => {
          setView('menu')
          setOpen(true)
        }}
      />

      <ActionSheet
        open={open}
        title={view === 'edit' ? 'Edit game' : (game.name ?? when)}
        description={view === 'edit' ? undefined : `${groupName} · ${when}`}
        onClose={close}
      >
        {view === 'edit' ? (
          <EditGameForm
            gameId={gameId}
            status={status}
            timeZone={timeZone}
            initial={game}
          />
        ) : (
          <>
            {canShare && (
              <>
                <Button
                  variant="outline"
                  className="h-11 justify-start rounded-xl"
                  onClick={share}
                >
                  {done === 'shared'
                    ? 'Shared'
                    : done === 'text'
                      ? 'Copied — paste it in the chat'
                      : 'Share game'}
                </Button>
                <Button
                  variant="outline"
                  className="h-11 justify-start rounded-xl"
                  onClick={copyLink}
                >
                  {done === 'link' ? 'Copied' : 'Copy link'}
                </Button>
              </>
            )}
            {canEdit && (
              <Button
                variant="outline"
                className="h-11 justify-start rounded-xl"
                onClick={() => setView('edit')}
              >
                Edit game
              </Button>
            )}
          </>
        )}
      </ActionSheet>
    </>
  )
}
