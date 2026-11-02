# 001 — Give the shared Button a real press and drop transition-all

- **Status**: DONE (2026-11-01, verified in Chrome 156)
- **Commit**: 5ca7f74 (worktree has uncommitted landing edits; unrelated to this file)
- **Severity**: HIGH
- **Category**: Easing & duration / Performance
- **Estimated scope**: 1 file, 1 line

## Problem

`components/ui/button.tsx:7` (inside the base class string of `buttonVariants`) contains two issues:

```
... text-sm font-medium whitespace-nowrap transition-all outline-none select-none ... active:not-aria-[haspopup]:translate-y-px ...
```

1. `transition-all` animates every property that changes (computed: `transition-property: all; 0.15s`, confirmed in Chrome). It is imprecise and can animate layout properties by accident.
2. The press is a 1px nudge (`translate-y-px`). That is barely visible, so the button does not feel like it hears the user.

This file is shared with the whole app, not only the landing page.

## Target

- Replace `transition-all` with `transition-[transform,background-color,border-color,color,box-shadow,opacity]` plus `duration-150 ease-out`.
- Replace `active:not-aria-[haspopup]:translate-y-px` with `active:not-aria-[haspopup]:scale-[0.97]`.
- Keep `origin-center` (default). Press must apply on pointer-down, which `:active` does.

## Repo conventions to follow

- Tailwind v4 utilities inside the cva base string, as already written. No new CSS file.
- Reduced motion is already handled globally (`app/globals.css:213`, durations forced to 0.01ms), so no extra work.

## Steps

1. In `components/ui/button.tsx` line 7, replace `transition-all` with `transition-[transform,background-color,border-color,color,box-shadow,opacity] duration-150 ease-out`.
2. In the same string, replace `active:not-aria-[haspopup]:translate-y-px` with `active:not-aria-[haspopup]:scale-[0.97]`.
3. Search for places that override the old press: `grep -rn "translate-y-px" components app`. If any button-like component copies the old class, leave it and list it in your report.

## Boundaries

- Do NOT edit other variants, sizes or colors.
- Do NOT add dependencies.
- If line 7 no longer matches, STOP and report.

## Verification

- **Mechanical**: `npx tsc --noEmit` passes; `npm test` passes.
- **Feel check**: open /, press and hold "Get started" and "Sign in": the button visibly shrinks slightly the instant the pointer goes down and eases back on release. Check one app screen with a button (e.g. a game page) so shared use is not broken, including icon-only buttons and any that open menus (they should not scale; `aria-haspopup` is excluded).
  - Devtools Animations at 10%: only transform and colors animate, nothing else.
  - Reduced motion on: no visible scale animation.
- **Done when**: computed `transition-property` on the CTA is no longer `all`, and `:active` shows `scale(0.97)`.
