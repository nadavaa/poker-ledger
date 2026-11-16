import { PAYMENT_MODES, type PaymentMode } from '@/lib/payment-mode'

/**
 * Online / Cash / Mix as three radio cards. Plain form inputs, so it works
 * inside server-action forms (uncontrolled, defaultValue) and client forms
 * (controlled, value + onChange) alike.
 */
export function PaymentModeField({
  defaultValue,
  value,
  onChange,
  name = 'payment_mode',
  disabled = false,
  hint,
}: {
  defaultValue?: PaymentMode
  value?: PaymentMode
  onChange?: (mode: PaymentMode) => void
  name?: string
  disabled?: boolean
  hint?: string
}) {
  const controlled = value !== undefined && onChange !== undefined
  return (
    <fieldset className="flex flex-col gap-1.5" disabled={disabled}>
      <legend className="mb-1.5 text-sm font-medium">Payments</legend>
      <div className="grid grid-cols-3 gap-2">
        {PAYMENT_MODES.map((m) => (
          <label
            key={m.value}
            className="flex cursor-pointer items-center justify-center rounded-lg border border-border px-2 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:checked]:font-medium has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
          >
            <input
              type="radio"
              name={name}
              value={m.value}
              {...(controlled
                ? {
                    checked: m.value === value,
                    onChange: () => onChange(m.value),
                  }
                : { defaultChecked: m.value === defaultValue })}
              className="sr-only"
            />
            {m.label}
          </label>
        ))}
      </div>
      <ul className="text-xs text-muted-foreground">
        {PAYMENT_MODES.map((m) => (
          <li key={m.value}>
            <span className="font-medium">{m.label}:</span> {m.hint}
          </li>
        ))}
      </ul>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </fieldset>
  )
}
