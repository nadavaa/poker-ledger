/**
 * The share icon: a rounded paper plane with its fold coming in from the
 * left side. Drawn on lucide's 24px grid with the same 2px round stroke, so
 * it sits beside the lucide icons without looking borrowed.
 */
export function SendIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M3.62 7.7C2 6.11 2.99 3.72 5.27 3.72H18.66C20.61 3.72 21.59 6.03 20.45 7.91L14.27 18.22C12.78 20.69 10.29 21.07 9.73 18.9L7.88 12.03Z" />
      <path d="M7.88 12.03 14.95 7.84" />
    </svg>
  )
}
