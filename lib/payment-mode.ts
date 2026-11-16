// How a game's settlement gets paid. Pure, so it can be tested with no I/O.
//
//   online  every transfer over Venmo or Zelle
//   cash    every transfer in cash at the table
//   hybrid  each player picks cash or app for the night
//
// The database stores the mode on groups (the default) and games (the
// snapshot), and the method on each settlement row.

export type PaymentMode = 'online' | 'cash' | 'hybrid'

export const PAYMENT_MODES: { value: PaymentMode; label: string; hint: string }[] = [
  { value: 'online', label: 'Online', hint: 'Everyone pays by Venmo or Zelle.' },
  { value: 'cash', label: 'Cash', hint: 'Everyone pays in cash at the table.' },
  {
    value: 'hybrid',
    label: 'Mix',
    hint: 'Each player picks cash or app. Cash players settle with each other first.',
  },
]

export function parsePaymentMode(v: unknown): PaymentMode | null {
  return v === 'online' || v === 'cash' || v === 'hybrid' ? v : null
}

export function paymentModeLabel(mode: PaymentMode): string {
  return PAYMENT_MODES.find((m) => m.value === mode)?.label ?? 'Online'
}

/**
 * Whether a transfer card should be drawn as cash. A cash game is cash all
 * the way down, food debts included; otherwise the row's own method decides.
 */
export function isCashTransfer(
  mode: PaymentMode,
  method: 'app' | 'cash' | null | undefined
): boolean {
  return mode === 'cash' || method === 'cash'
}
