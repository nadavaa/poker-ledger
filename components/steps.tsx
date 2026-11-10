/**
 * Numbered steps in the landing's "How it works" style (big brand-coloured
 * number, bold title, one muted line), in the app's own tokens so it works
 * without the landing stylesheet.
 */
export function Steps({
  steps,
}: {
  steps: { title: string; body?: string; extra?: React.ReactNode }[]
}) {
  return (
    <ol className="flex flex-col gap-5">
      {steps.map((step, i) => (
        <li key={step.title} className="grid grid-cols-[2rem_1fr] gap-x-3">
          <span
            aria-hidden
            className="money-display pt-0.5 text-2xl font-semibold text-brand"
          >
            {i + 1}
          </span>
          <div className="flex flex-col gap-1">
            <p className="text-base font-semibold tracking-tight">{step.title}</p>
            {step.body && (
              <p className="text-sm text-muted-foreground">{step.body}</p>
            )}
            {step.extra}
          </div>
        </li>
      ))}
    </ol>
  )
}
