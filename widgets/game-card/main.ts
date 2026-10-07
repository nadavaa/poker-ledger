// The game card. It shows what get_game returned, and for a scheduled game it
// can join or withdraw the signed-in user. It does so only by calling the same
// tools an agent would, through the host, in the same two steps: a call with no
// token returns a preview and changes nothing; the user's click on Confirm is
// the yes that sends the token back.

import '../shared/base.css'
import './styles.css'
import {
  contextLine,
  gameCardView,
  parseResult,
  standingWords,
  stepOf,
  type GameCardView,
  type Person,
} from '@/lib/mcp/ui/shape'
import { h, mount } from '../shared/dom'
import { startApp } from '../shared/host'

type Card = Extract<GameCardView, { kind: 'card' }>

type Phase =
  | { kind: 'idle' }
  | { kind: 'working'; label: string }
  | { kind: 'confirm'; action: 'join' | 'withdraw'; text: string; token: string }

const root = document.getElementById('root')!
let view: GameCardView | null = null
let problem: string | null = null
let phase: Phase = { kind: 'idle' }
/** What the last action said, kept until the next one. */
let note: { text: string; detail?: string | null } | null = null

const app = startApp('Poker Ledger game', (result) => {
  const parsed = parseResult(result)
  if (!parsed.ok) {
    problem = parsed.message
  } else {
    view = gameCardView(parsed.data)
    problem = view ? null : 'That did not look like a game.'
  }
  phase = { kind: 'idle' }
  render()
})

const toolFor = (action: 'join' | 'withdraw') =>
  action === 'join' ? 'join_game' : 'withdraw_from_game'

async function call(name: string, args: Record<string, string>) {
  try {
    return await app.callServerTool({ name, arguments: args })
  } catch {
    return {
      isError: true,
      content: [{ type: 'text' as const, text: 'Could not reach Poker Ledger. Check your connection and try again.' }],
    }
  }
}

/** First call, no token: the server says what would happen and changes nothing. */
async function start(card: Card) {
  note = null
  phase = { kind: 'working', label: card.action === 'join' ? 'Checking your spot…' : 'Checking…' }
  render()
  const step = stepOf(await call(toolFor(card.action), { game_id: card.gameId }))
  if (step.kind === 'preview') {
    phase = { kind: 'confirm', action: card.action, text: step.text, token: step.token }
  } else {
    phase = { kind: 'idle' }
    note = { text: step.message }
    // "Already signed up" means the card was out of date; show the truth.
    if (step.kind === 'unchanged') await refresh()
  }
  render()
}

/** Second call, with the token the user just approved. */
async function confirm(card: Card, p: Extract<Phase, { kind: 'confirm' }>) {
  phase = { kind: 'working', label: 'Confirming…' }
  render()
  const step = stepOf(
    await call(toolFor(p.action), { game_id: card.gameId, confirmation_token: p.token })
  )
  phase = { kind: 'idle' }
  if (step.kind === 'done' || step.kind === 'unchanged') {
    note = { text: step.message, detail: step.kind === 'done' ? step.detail : null }
    await refresh()
    if (step.kind === 'done' && view?.kind === 'card') {
      // Keep the conversation in step with what the click did. No reply is
      // triggered; the model sees this on the user's next message.
      app
        .updateModelContext({
          content: [
            {
              type: 'text',
              text: contextLine({
                action: p.action,
                title: view.title,
                group: view.group,
                message: step.message,
                seats: view.seats,
              }),
            },
          ],
        })
        .catch(() => {})
    }
  } else {
    // A refusal, in the server's words. The card underneath may be stale too.
    note = { text: step.kind === 'refused' ? step.message : 'Something unexpected happened. Try again.' }
    await refresh()
  }
  render()
}

async function refresh() {
  if (!view) return
  const parsed = parseResult(await call('get_game', { game_id: view.gameId }))
  if (parsed.ok) {
    const next = gameCardView(parsed.data)
    if (next) view = next
  }
}

function people(list: Person[], numbered: boolean) {
  return h('ul', { class: 'people' },
    ...list.map((p) =>
      h('li', { class: p.isMe ? 'me' : '' },
        numbered && p.position ? h('span', { class: 'pos muted', text: `${p.position}.` }) : null,
        h('span', { text: p.name }),
        p.isMe ? h('span', { class: 'you', text: 'you' }) : null
      )
    )
  )
}

function actions(card: Card) {
  if (phase.kind === 'working') {
    return h('div', { class: 'row' }, h('button', { class: 'btn', text: phase.label, attrs: { disabled: '' } }))
  }
  if (phase.kind === 'confirm') {
    const p = phase
    return h('div', { class: 'confirm' },
      h('p', { class: 'preview', text: p.text }),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', text: 'Confirm', on: { click: () => void confirm(card, p) } }),
        h('button', { class: 'btn', text: 'Cancel', on: { click: () => { phase = { kind: 'idle' }; note = null; render() } } })
      ),
      h('p', { class: 'muted small', text: 'Nothing has changed yet.' })
    )
  }
  const join = card.action === 'join'
  return h('div', { class: 'row' },
    h('button', {
      class: join ? 'btn primary' : 'btn',
      text: join ? (card.seats.includes('over') || card.seats.includes('full') ? 'Join the waitlist' : 'Join game') : 'Withdraw',
      on: { click: () => void start(card) },
    })
  )
}

function render() {
  if (problem) {
    mount(root, h('p', { text: problem }))
    return
  }
  if (!view) return

  if (view.kind === 'summary') {
    mount(root,
      h('div', { class: 'card' },
        h('h2', { text: view.title }),
        h('div', { class: 'muted', text: view.group }),
        h('div', { class: 'meta' },
          h('span', { class: 'chip', text: view.status }),
          h('span', { text: view.when }),
          view.seats ? h('span', { text: view.seats }) : null
        ),
        h('p', { class: 'muted small', text: 'Ask for this game by name in the chat for more detail.' })
      )
    )
    return
  }

  const card = view
  mount(root,
    h('div', { class: 'card' },
      h('h2', { text: card.title }),
      card.group && card.group !== card.title ? h('div', { class: 'muted', text: card.group }) : null,
      h('div', { class: 'meta' },
        h('span', { text: card.when }),
        card.timezone ? h('span', { class: 'muted small', text: card.timezone.replace('_', ' ') }) : null
      ),
      card.location ? h('div', { text: card.location }) : null,
      h('div', { class: 'seats', text: card.seats }),
      h('div', { class: `status ${card.standing.kind}`, text: `${card.standing.kind === 'seated' ? '✓ ' : card.standing.kind === 'waitlisted' ? '… ' : '○ '}${standingWords(card.standing)}` }),
      // The action comes before the lists: on a phone the lists are long, and
      // the preview and Confirm must never be below the fold.
      actions(card),
      note
        ? h('div', { class: 'note', attrs: { role: 'status' } },
            h('div', { text: note.text }),
            note.detail ? h('div', { class: 'muted small', text: note.detail }) : null)
        : null,
      h('h3', { text: `Players (${card.roster.length})` }),
      card.roster.length ? people(card.roster, false) : h('p', { class: 'muted', text: 'Nobody yet.' }),
      card.waitlist.length ? h('h3', { text: `Waitlist (${card.waitlist.length})` }) : null,
      card.waitlist.length ? people(card.waitlist, true) : null
    )
  )
}
