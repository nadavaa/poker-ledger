# Animation plans

Landing page motion audit, 2026-11-01. Written at commit 5ca7f74.

| # | Title | Severity | Status |
| --- | --- | --- | --- |
| 001 | Button press feedback, drop transition-all | HIGH | DONE |
| 004 | Story captions stacking during scene changes | MEDIUM | DONE |
| 002 | Animate FAQ answers | MEDIUM | DONE |
| 003 | Translucent header | MEDIUM | DONE |
| 005 | Story render cost (measure first) | MEDIUM | DONE (4x throttle: task 14.75ms to about 4.8ms per scroll step) |

## Order

001, 004, 002, 003, 005. All are independent except 005, which should come after 004 (it reuses `captionOpacity`). 001 touches the shared Button, so check an app screen as well as the landing page.

## Not planned

Entrance stagger trim (LOW) and replacing the hero chips with a real app screenshot (design work, not motion).
