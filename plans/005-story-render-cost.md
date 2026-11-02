# 005 — Cut the story's re-render cost on scroll (measure first)

- **Status**: DONE (2026-11-01, verified in Chrome 156)
- **Commit**: 5ca7f74
- **Severity**: MEDIUM (unconfirmed)
- **Category**: Performance
- **Estimated scope**: 1 file

## Problem

`components/landing/phone-story.tsx:100-120`: scroll progress is React state (`setP`), so `Pinned` re-renders, including all four `<Scene>` trees, up to once per frame while the user scrolls the 6.5-screen-tall pinned section. Nothing has been profiled yet, so the actual cost is unknown.

## Target

Only do this if the baseline shows a problem. Baseline: Chrome Devtools Performance panel, 4x CPU throttling, scroll through the story; if scripting per frame is under about 4ms and no frames drop, mark this plan WONTFIX and stop.

If it is a problem: render only scenes that are visible.

```tsx
{scenes.map((s, i) => {
  const o = sceneOpacity(i, p)
  if (o <= 0.001) return null
  return (/* existing layer div and <Scene i={i} t={localT(i, p)} /> */)
})}
```

Same guard for the caption map, using `captionOpacity` if plan 004 is done, otherwise `sceneOpacity`.

## Repo conventions to follow

- Keep the `requestAnimationFrame` batching and the 0.0015 change threshold already in `update`.

## Steps

1. Record the baseline trace and write the numbers into your report.
2. Apply the guard above in both maps.
3. Re-record the same trace and compare.

## Boundaries

- Do NOT rewrite to a new animation library.
- Hidden scenes must still be in the DOM for crawlers via the static fallback (`StaticStory`); do not change that component.
- If the numbers do not improve, revert and report.

## Verification

- **Mechanical**: `npx tsc --noEmit`; `npm test`.
- **Feel check**: scroll through the story fast and slow: scenes still crossfade, no flash of empty phone mid-scene, the progress rail still fills.
- **Done when**: the before and after traces are in the report and scripting time per frame is lower, or the plan is marked WONTFIX with the baseline.
