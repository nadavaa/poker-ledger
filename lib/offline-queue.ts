// A write queue for buy-ins tapped while the network is down.
//
// Scope is deliberately narrow: buy-ins only. They are append-only and
// idempotent-ish — a duplicate shows in the feed with its timestamp and can
// be voided, which is exactly the failure the spec already expects (edge case
// 11). Cashouts and settlements are not queued, because replaying those
// blind could overwrite a number somebody corrected in the meantime.

export type QueuedBuyin = {
  /** Local id, so the same tap is never queued twice. */
  localId: string
  gameId: string
  memberId: string
  amountCents: number
  chips: number
  note: string | null
  queuedAt: string
}

const KEY = 'buyin-queue-v1'

function read(): QueuedBuyin[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as QueuedBuyin[]) : []
  } catch {
    return []
  }
}

function write(items: QueuedBuyin[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items))
  } catch {
    // Storage full or blocked. Nothing useful to do: the caller already
    // showed the write as failed.
  }
}

export function queuedFor(gameId: string): QueuedBuyin[] {
  return read().filter((q) => q.gameId === gameId)
}

export function enqueue(item: Omit<QueuedBuyin, 'localId' | 'queuedAt'>) {
  const entry: QueuedBuyin = {
    ...item,
    localId:
      globalThis.crypto?.randomUUID?.() ??
      `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    queuedAt: new Date().toISOString(),
  }
  write([...read(), entry])
  return entry
}

export function dequeue(localId: string) {
  write(read().filter((q) => q.localId !== localId))
}

/**
 * Replays queued buy-ins oldest first, stopping at the first failure so the
 * order they were tapped in is preserved. Returns how many landed.
 */
export async function flushQueue(
  gameId: string,
  send: (item: QueuedBuyin) => Promise<{ error: unknown }>
): Promise<number> {
  let sent = 0
  for (const item of queuedFor(gameId).sort((a, b) =>
    a.queuedAt.localeCompare(b.queuedAt)
  )) {
    const { error } = await send(item)
    if (error) break
    dequeue(item.localId)
    sent += 1
  }
  return sent
}
