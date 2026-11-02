# 003 — Make the site header translucent

- **Status**: DONE (2026-11-01, verified in Chrome 156)
- **Commit**: 5ca7f74
- **Severity**: MEDIUM
- **Category**: Cohesion (materials and depth)
- **Estimated scope**: 2 files, about 15 lines

## Problem

`components/landing/site-chrome.tsx:9`:

```tsx
<header className="sticky top-0 z-30 border-b bg-background">
```

Measured in Chrome: solid background, `backdrop-filter: none`. Content scrolls under a hard opaque bar.

## Target

A translucent layer with blur, with a solid fallback for users who prefer reduced transparency:

```css
/* append to components/landing/landing.css */
.lp-header {
  background: color-mix(in oklab, var(--background) 88%, transparent);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  backdrop-filter: blur(20px) saturate(180%);
}
@media (prefers-reduced-transparency: reduce) {
  .lp-header {
    background: var(--background);
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }
}
```

## Repo conventions to follow

- Landing styles in `components/landing/landing.css`. The app already has a `.material` class with a reduced-transparency fallback at `app/globals.css:223`; match its behavior but keep this class separate so the app is untouched.

## Steps

1. Append the CSS above to `landing.css`.
2. In `site-chrome.tsx:9` replace `bg-background` with `lp-header` (keep `sticky top-0 z-30 border-b`).

## Boundaries

- Do NOT change the header layout, links or theme toggle.
- Blur stays at 20px or less.
- If the header markup differs, STOP and report.

## Verification

- **Mechanical**: `npx tsc --noEmit` passes.
- **Feel check**: scroll the home page in light and dark themes; text under the header is blurred and the nav stays readable. On the dark story section the header must not look washed out. Check at phone width. Reduced transparency on: header is solid.
- **Done when**: computed `backdrop-filter` on the header is not `none`.
