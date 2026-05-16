# Phase-1 User Feedback — Sessions Log

**Status:** _Capture template — fill in as you complete sessions._
**Goal:** ≥ 5 sessions before Phase-2 begins (gate per
[implementation-discipline.instructions.md](../../.github/instructions/implementation-discipline.instructions.md)).

**Target persona this round:** Engineering leads / staff engineers (per the
recruit-pool decision on 2026-05-11).

---

## Aggregate signals (update as you go)

| Signal                        | Count / value |
| ----------------------------- | ------------- |
| Sessions completed            | 1 / 5         |
| Said "yes I'd pay $10/run"    | —             |
| Said "yes if X"               | —             |
| Said "no"                     | —             |
| Top 3 most-valued features    | _to fill_     |
| Top 3 most-confusing surfaces | _to fill_     |
| Surfaces that need re-design  | _to fill_     |

### Decisions to confirm coming out of this round

- [ ] $10/run is the right price (or move to suggested anchor: \_\_\_\_)
- [ ] B2B-SaaS is the right MVP domain (vs marketplace / data / mobile)
- [ ] The 9-agent run flow is legible (or simplify to N agents shown)
- [ ] The /decide lens-tab UX is intuitive on first encounter
- [ ] The brief composer's 3-clarify limit feels right
- [ ] No new must-haves surfaced for the 14-feature MVP (or list:)
- [ ] No critical screen is missing from Phase-1 (or list:)

---

## Session 1 — Founder / architect (self)

- **Date:** 2026-05-19
- **Participant:** Founder, also an architect by background
- **Recruit channel:** N/A (internal dogfood on `dev.tessar.dev`)
- **Mode:** Live, post-signin run

### Brief

Walkthrough of the dev environment — sign-in via Google, run a brief
end-to-end, read the resulting decide package as if buying it.

### Quotes worth keeping

> "I still feel like the overall system is not giving me structured
> information to me in a way that would be useful. Even after reading
> the brief results, I'm still not sure how this system is going to
> look like or why this system is the best recommendation along with
> the motivation."

> "As an architect myself, I really did not find the information that
> useful to take my decisions on, the information wasn't laid out
> correctly, somewhere it feels insufficient."

> "If I were to land on this platform, it feels like I would not have
> paid money to get these kind of recommendations, it does not feel
> professional at all. There's no clear navigation, no profile,
> difficult to grasp the platform. Information is not laid properly."

### What confused them

- **No persistent app chrome on the run/package screens.** AppShell
  was wired on `/dashboard` and `/billing` but the `/decide/[id]`
  reader had its own bare header — no nav back to dashboard, no
  user/profile menu, no sign-out.
- **No "why this system" headline.** The Verdict tab asserted the
  stack but never mapped picks back to brief requirements. Reader
  had to mentally stitch requirements (top of page) to component
  rationales (inside System-Design tab).
- **Decisions felt flat.** A 15-entry list with no hierarchy —
  no sense of which decisions are foundational vs. which follow
  from them.
- **Hard to grasp the platform at first.** No profile menu, no
  obvious way to see the signed-in user, no breadcrumbs.

### What they wanted that wasn't there

- An **executive summary** at the very top: brief → picks → cost →
  top risk → build order, in one screen.
- An explicit **requirement → component map** so the reader can see
  exactly why each major pick fits.
- **Persistent navigation + user menu** on every authenticated screen.
- More **professional density** — better typography hierarchy, less
  feeling of being a slick demo and more of a real design document.

### Pricing reaction

- Did not get to the pay-question — said "I wouldn't pay for this in
  its current shape." Treating that as an actionable signal that the
  redesign below must land before re-asking the pricing question.

### Would they pay?

- [x] No, because the design package didn't read as professional or
      decision-supporting enough to be worth money.

### Action items for me

- [x] Wire `AppShell` (with nav + theme toggle + new user menu) into
      every authenticated screen, including `/decide/[id]`.
- [x] Build a `UserMenu` showing the signed-in email + Sign out, fed
      from `await auth()` at the server boundary.
- [x] Add an **Executive Summary** block at the top of the Verdict
      section synthesising brief, picks-with-rationale, cost tiers, top
      risk, and build sequence in one screen.
- [x] Add a **Requirements → Architecture** map (every brief
      requirement explicitly mapped to the component(s) that satisfy
      it, with the "fits because" narrative inline).
- [x] Group **Decisions** by tier (Foundational vs. Dependent) so
      hierarchy is visible without reading every card.
- [x] Tighten typography hierarchy and section spacing across
      DecideViewer.
- [ ] Re-test with the same flow after redesign ships; ask the
      pay-question again.

### Notes

This is being counted as Session 1 of the ≥5 needed for the Phase-1
DoD gate. The harshness of the feedback is the signal — Phase 1
exists to surface exactly this kind of structural complaint before
Phase 2 backend work makes restructuring expensive.

---

## Session 2

_(copy the template above)_

---

## Session 3

_(copy)_

---

## Session 4

_(copy)_

---

## Session 5

_(copy)_

---

## Synthesis (write after session 5)

### Summary

_2–3 sentences._

### Confirmed

-

### To change before Phase 2

-

### To park in [BACKLOG.md](../../BACKLOG.md)

-

### Pricing decision (locked here, not in chat)

- **Final price-per-run at launch:** $\_\_\_
- **Update path:** [`apps/web/lib/pricing.ts`](../../apps/web/lib/pricing.ts) → `PRICE_PER_RUN_USD`

### Sign-off

- [ ] Phase-1 user-feedback gate met. Cleared to begin Phase 2.
