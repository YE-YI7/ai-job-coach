# Writing detail and phone recovery documentation

Date: 2026-10-18. This is an ordinary extension of the incumbent Operate surface, not a new visual identity. Runtime commit `2a7ba73` was supplied in the implementation handoff, followed by a nonvisual login-method state fix inspected below; this is not a claim that the whole final source is pinned to that commit. No Git or browser operation was performed by this documentation pass.

## Documentation boundary

Only these files were changed by the documenter:

- `DESIGN.md`
- `.impeccable/design.json`
- `.impeccable/review/detail-recovery-20261018/documentation.md`

`PRODUCT.md`, the direction contract at `.impeccable/surfaces/resume-inline-review.md`, current component source and all seven existing local Chrome PNGs were read. The incumbent palette, type, layout, left rail, paper geometry, PDF renderer, uploaded originals and unrelated historical token drift were preserved. `field-focus` and older composer color tokens remain available to existing controls; they no longer prescribe a text-entry ring or underline. No runtime file, new shipping raster asset, browser state, deployment or Git state was changed here. This documentation-only pass did not run another UI detector or reopen the bounded visual review.

## Carbonized rules and source evidence

| Rule | Current source inspected |
| --- | --- |
| White writing surfaces use the shared `--field-rest-shadow` and `--field-active-shadow` offset soft shadows. Text entry has no new colored/gray ring, inner rectangle or underline. Existing keyboard indicators for buttons, links and checkboxes remain; invalid states retain error semantics. | `app/globals.css`; `app/Home.module.css`; `app/login/LoginClient.tsx`; `components/cockpit/AgentConversation.module.css` |
| Phone number and +86 are one composite surface. Its outer wrapper receives the active shadow once; the inner number input stays transparent and shadow-free. The verification code uses the same writing material. | `components/auth/PhoneAuthForm.module.css` |
| Number and verification steps have distinct real form keys. Step/success entry is 200ms with 4px travel; it is not fabricated progress. Reduced motion removes the added transition, entry and pressed displacement. | `components/auth/PhoneAuthForm.tsx`; `components/auth/PhoneAuthForm.module.css` |
| The in-paper editor retains its white resting material shadow. Text focus adds neither an outline nor a shadow, only a slight background cue. Entry is 180ms with 3px travel; touch text remains 16px and touch actions 44px. | `components/cockpit/ResumeInlineEditor.tsx` |
| The first-edit sentence is “点选正文，再点‘编辑’”. It is dismissible, uses the separate `yizhi:hint:inline-edit:v2` local marker, and is consumed by actual block editing or a suggestion decision. Storage failure does not block editing. This is not a tour. | `components/cockpit/ResumeInlineReview.tsx` |
| Decision-popup entry is 160ms. Adoption/keep-original feedback anchors to the dismissed popup, clamps to the viewport and updates one stable polite live region without key-remounting it. It clears after 2.8 seconds, scroll or resize. Reduced motion keeps the feedback text and removes entry travel. | `components/cockpit/ResumeInlineReview.tsx`; `components/cockpit/ResumeInlineReview.module.css` |
| The 180ms saved-receipt fade belongs only to the child span when the real derived document state is `saved`. The entire row does not animate. Local adoption feedback is not a cloud-save receipt. | `components/cockpit/CockpitApp.tsx`; `components/cockpit/CockpitApp.module.css` |
| Workspace recovery explicitly authenticates the original Watcha or email/invitation account, then requires SMS verification before associating the number. The UI states that résumés, answers and balances are not merged or moved. This is an implemented flow, not proof of successful live recovery. | `app/account/phone/page.tsx`; `components/auth/PhoneAuthForm.tsx` |
| The later nonvisual login-route fix keys `LoginContent` by the explicit email method and preserves `method=email` while clearing OAuth errors, so a same-route original-account link does not merely change the URL while retaining phone-method state. This adds no CSS or layout direction; no staged or live replay was performed by this documenter. | `app/login/LoginClient.tsx` |

The sidecar adds the exact shared shadow and local motion values and updates only the affected input, inline-editor and résumé-mentor examples. The Markdown replaces the superseded gray-bottom-line rules and documents the local exceptions. No new world, new color vocabulary or broader system cleanup was introduced.

## Existing screenshot packet

All files below are review evidence, not product raster assets. This documenter inspected the existing pixels; no fresh captures were made.

- `desktop.png`: résumé shell, accurate two-step first-edit hint and white mentor writing surface.
- `desktop-edit.png`: inline heading editor within the same paper, with no focus outline.
- `mobile.png`: narrow reading view and existing compact actions.
- `mobile-decision.png`: local decision popup in the scrolled narrow view.
- `mobile-feedback.png`: “已采纳 · 可以撤销” at the former popup location in the scrolled view.
- `login-email-desktop.png`: retained email/invitation login composition and white writing surface.
- `login-email-mobile.png`: the same retained login composition at mobile size.

These still images show the captured visual states only. They do not independently prove animation timing, keyboard behavior, screen-reader announcements, SMS delivery, account recovery, live-model execution or cloud persistence; timing and state rules above are source-inspected implementation facts.

## Bounded reviewer disposition

The implementation handoff supplied the following fresh reviewer result; no independent numeric score or separate reviewer report was supplied to this documenter:

1. Resolved: `mobile-feedback.png` shows “已采纳 · 可以撤销” at the previous popup location in a scrolled 390px viewport; source clamps it to the viewport and keeps a stable live region with no key-remount.
2. Resolved: `desktop.png` says “点选正文，再点‘编辑’”, matching the actual two-step interaction; dismissal remains available.

The supplied disposition was `ship` at these two listed-fix scopes only, with remaining items clear at that scope. This documentation pass does not expand that verdict into blanket product approval, user aesthetic approval, production promotion or live SMS/cloud acceptance. Existing broader acceptance contracts remain in force.
