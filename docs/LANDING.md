# Public landing page: brief

Partly interviewed (four answers from the owner, 2026-10-31), the rest authored.
No generated imagery yet: it needs `KIE_AI_API_KEY`, which is not set. Built from
the GEO recommendations in `../kevespoker.com GEO/03-recommendations.md`.

## Owner answers
- **Look:** premium minimal.
- **Structure:** distinct scenes, not one continuous world.
- **Assets:** stills allowed, small spend (not yet generated; no key).
- **Demo:** a scroll-driven phone story. Not live, no tapping.

## Authored decisions
- **Vibe:** quiet, precise, a good card room at 1am. References: a printed
  scorecard, a bank statement that is pleasant to read, a casino chip's edge.
- **Grammar:** *stage and narrator* (new). A phone is pinned as the stage while
  narrator captions change beside it. Nav is a thin fixed bar. The hero is type
  plus a layered chip scene. The close inverts to the dark ground and is quiet.
  Bans: full-bleed video, kinetic headlines, spotlight, magnetic CTA, tilt cards.
  The other seven grammars lost because this page has one argument that needs a
  product surface in motion (live surface forbids the marketing copy GEO needs;
  filmic and continuous world need footage that does not exist).
- **Signature move: the settle gate.** Scrolling through the story, the chip
  count is $3 short, the Settle button is locked, one player owns the difference,
  the count balances and the lock opens. Numbers come from `lib/settle.ts` and
  `lib/money.ts`, not from a drawing.

## Feeling curve
| Section | Feeling | Cause |
|---|---|---|
| Hero | Calm curiosity | Large quiet type, chips drifting at three depths |
| Story, live game | Recognition | The pot ticking up, a buy-in struck through |
| Story, count | Tension | "Short by 300 chips", Settle locked |
| Story, gate (peak) | Relief | The count balances and the button unlocks |
| Story, settle | Resolution | Five payments for six players, one confirmed |
| Trust, money, connector | Confidence | Plain rules, no hedging |
| FAQ | Ease | Answers open one at a time |
| Close | Quiet resolve | Dark ground, one button |

**Peak:** the gate scene (the story's third chapter), which holds the most scroll.
**Tell-someone sentence:** "It's the site where you scroll through a poker night
and watch the count refuse to settle until the chips add up."

## What is public
`/`, `/ai-connector`, `/guides`, `/guides/*`, `/robots.txt`, `/sitemap.xml`,
`/llms.txt`, `/og`. Everything else stays behind sign-in
(`lib/supabase/public-paths.ts`, tested).

## Rules
- Story data is invented (`lib/landing-demo.ts`). Never real names, groups,
  amounts or handles. The page makes no requests for it.
- Copy lives in `lib/landing-copy.ts` and `lib/guides.ts`. No claim the app does
  not back up (see the header of `landing-copy.ts`).
- All copy stays in the HTML, including every story caption, FAQ answer and the
  static fallback of the story, so crawlers and no-JS readers get it all.
- Not built: contact form, privacy, terms (R5), analytics (R13).
