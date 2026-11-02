# 004 — Stop story captions stacking during scene changes

- **Status**: DONE (2026-11-01, verified in Chrome 156)
- **Commit**: 5ca7f74
- **Severity**: MEDIUM
- **Category**: Cohesion / Physicality (crossfade)
- **Estimated scope**: 1 file, about 15 lines

## Problem

`components/landing/phone-story.tsx:12-16, 31-37`:

```ts
const BOUNDS = [0, 0.2, 0.44, 0.8, 1]
const FADE = 0.012
function sceneOpacity(i: number, p: number) {
  const inn = i === 0 ? 1 : ramp(p, BOUNDS[i] - FADE, BOUNDS[i] + FADE)
  const out = i === SCENE_COUNT - 1 ? 1 : 1 - ramp(p, BOUNDS[i + 1] - FADE, BOUNDS[i + 1] + FADE)
  return Math.min(inn, out)
}
```

The outgoing and incoming scenes use the same window, so around each boundary both are at about 0.5 opacity. Captions (`.lp-cap`, all stacked in one grid cell) then overlap and are unreadable. Measured on a 390px phone by sweeping scroll in 40px steps: 6 of 160 steps had two captions above 0.15 opacity (for example `0.35, 0.65, 0, 0`). The phone screens also double up.

## Target

Captions fade sequentially: the outgoing caption is fully gone before the incoming one starts. Phone screens may keep the existing crossfade.

```ts
// new, next to sceneOpacity
function captionOpacity(i: number, p: number) {
  const inn = i === 0 ? 1 : ramp(p, BOUNDS[i], BOUNDS[i] + FADE)
  const out =
    i === SCENE_COUNT - 1
      ? 1
      : 1 - ramp(p, BOUNDS[i + 1] - FADE, BOUNDS[i + 1])
  return Math.min(inn, out)
}
```

Outgoing runs from `B - F` to `B`; incoming runs from `B` to `B + F`. They never overlap.

## Repo conventions to follow

- `ramp(t, a, b)` from `phone-screens.tsx:28` is the only easing helper; keep using it.
- Reduced motion already uses the static layout, so no extra handling.

## Steps

1. Add `captionOpacity` below `sceneOpacity` in `phone-story.tsx`.
2. In the caption map (`const o = sceneOpacity(i, p)`, inside `.lp-cap`), use `captionOpacity(i, p)` instead. Phone screens use the same function (a crossfade showed doubled text, found by eye).

## Boundaries

- Do NOT change `BOUNDS`, `SPAN_VH`, or scene content.
- Do NOT add blur or new libraries.
- If the code differs from the excerpt, STOP and report.

## Verification

- **Mechanical**: `npx tsc --noEmit`; `npm test`.
- **Feel check**: at 390px and 1280px, scroll slowly through all three scene changes. At no scroll position do two captions show at once; a brief near-empty moment at each boundary is expected and fine. Reduced motion on: static layout still shows all four.
- **Done when**: a scroll sweep finds 0 steps with two caption opacities above 0.05.
