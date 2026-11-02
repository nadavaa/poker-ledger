# 002 — Animate the FAQ answers opening and closing

- **Status**: DONE (2026-11-01, verified in Chrome 156)
- **Commit**: 5ca7f74
- **Severity**: MEDIUM
- **Category**: Missed purpose (jarring state change) / Easing
- **Estimated scope**: 2 files, about 15 lines

## Problem

`components/landing/landing-page.tsx:167-176` uses native `<details>`. The answer paragraph appears at full height instantly (measured: 92px tall, opacity 1, 60ms after click). Only the "+" rotates, with the default `ease` curve:

```tsx
<span aria-hidden className="text-2xl font-light text-muted-foreground transition-transform duration-200 group-open:rotate-45">+</span>
```

## Target

- Answer height animates 0 to auto over 200ms using `cubic-bezier(0.23, 1, 0.32, 1)` (strong ease-out), via the modern `::details-content` pseudo-element. Browsers without support just keep the instant open (progressive enhancement; do not add JS).
- "+" rotation uses the same curve and 200ms.

```css
/* append to components/landing/landing.css */
.lp {
  interpolate-size: allow-keywords;
}
.lp details::details-content {
  block-size: 0;
  overflow: clip;
  opacity: 0;
  transition:
    block-size 200ms cubic-bezier(0.23, 1, 0.32, 1),
    opacity 200ms cubic-bezier(0.23, 1, 0.32, 1),
    content-visibility 200ms allow-discrete;
}
.lp details[open]::details-content {
  block-size: auto;
  opacity: 1;
}
```

## Repo conventions to follow

- Landing-only styles live in `components/landing/landing.css`, scoped under `.lp`.
- Reduced motion: the global rule at `app/globals.css:213` already forces transition durations to 0.01ms.

## Steps

1. Append the CSS above to `components/landing/landing.css`.
2. In `landing-page.tsx:172`, change `transition-transform duration-200` to `transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]`.

## Boundaries

- Do NOT replace `<details>` with a JS accordion; keep native semantics.
- Do NOT touch the FAQ copy or JSON-LD.
- If the markup has changed, STOP and report.

## Verification

- **Mechanical**: `npx tsc --noEmit` passes.
- **Feel check**: in Chrome, click a question: the answer eases open (no pop), click again: it eases closed. Spam-click: it reverses from where it is, with no restart. Devtools Animations at 10%: height and opacity move together. In Safari, if `::details-content` is unsupported, the answer still opens instantly and nothing breaks. Reduced motion on: instant.
- **Done when**: 60ms after a click, the answer height is between 0 and its final height.
