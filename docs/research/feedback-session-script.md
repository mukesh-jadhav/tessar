# Feedback Session Script — Phase-1 Prototype

**Audience this round:** Engineering leads / staff engineers (recruit pool
locked 2026-05-11). They are the people most likely to dismiss a
"AI-generated architecture" tool reflexively, which is exactly the signal
we need before paid checkout flips on.

**Length:** 30 minutes. 5 talking, 20 doing, 5 reacting.

**Goal:** Find out (a) whether the *trust* story lands, (b) whether they
would actually pay $10/run, and (c) what surface is missing or confusing.

---

## Recruiting outreach template

Copy/edit per channel. Keep it under 6 lines. Don't pitch the product —
pitch the 30 minutes.

```
Subject: 30-min UX feedback on a tool for staff engineers — $___ Amazon GC

Hi {{first_name}},

I'm building TESSAR — a researched-architecture tool for systems you're
about to build but haven't pulled the trigger on. It's at the prototype
stage and I want feedback from staff engineers who'd be the harshest
audience.

30 minutes on Zoom. You'll click through the prototype and tell me where
it's wrong. I'll send a $___ Amazon GC after.

Would any of next week work? Pick a slot: {{cal_link}}

— {{your_name}}
```

**Channels in priority order** (per recruit-pool decision):
1. Direct DMs to staff engineers in your existing network (5–10 messages
   should yield 2–3 sessions).
2. Targeted LinkedIn outreach using the same script (Sales Nav search:
   "Staff Engineer" / "Principal Engineer" at series A–C SaaS).
3. Indie Hackers / Twitter/X post if pipeline is dry after #1 + #2.

**Aim:** 8 sent → 5 booked → 5 conducted. Over-recruit by 60% to cover
no-shows.

---

## Pre-session prep checklist

- [ ] Local dev server running (`pnpm --filter @tessar/web dev`).
- [ ] All Phase-1 screens reachable: `/`, `/decide`, `/brief`,
      `/checkout`, `/run/[id]`, `/dashboard`, `/billing`, `/signin`,
      `/not-found`, `/unauthorized`.
- [ ] Speed-toggle on `/run/[id]` set to 5× (so the demo finishes inside
      the session).
- [ ] Zoom set to record (with their consent).
- [ ] Notes doc open in second screen — copy from
      [phase1-feedback.md](./phase1-feedback.md) Session N template.
- [ ] $10 / 12-min stat sheet visible to you only (don't volunteer until
      asked).
- [ ] Tab open: their LinkedIn / company page.

---

## The script (30 min)

### 0:00 — Welcome (2 min)

> "Thanks for joining. I'll share my screen and ask you to drive in a
> bit. There are no wrong answers — if anything is confusing, that's a
> bug in *my* design, not in your understanding. Cool if I record?"

Confirm consent. Start recording.

### 0:02 — One-minute context (1 min)

> "I'm building a tool that takes a brief in plain words and gives you
> back a researched architecture. I'd rather show it than describe it —
> can I share my screen and have you tell me what you see?"

**Do not** show the brand, the price, or the "9 agents". Just open `/`.

### 0:03 — First-impression on landing (3 min)

Share `/`. Stay silent for 30 seconds. Let them read.

> 1. "In one sentence, what do you think this does?"
> 2. "Who do you think it's for?"
> 3. "What would make you click 'Start a brief' vs 'See a sample'?"

**Watch for:** confusion about who the target is, mistrust ("another AI
thing"), or excitement (rare but tells you *which* sentence on the page
landed).

### 0:06 — Sample exploration (6 min)

> "Click 'See a sample package'. Take 2 minutes and explore freely. Narrate
> what you're doing and thinking."

Stay quiet. Note:
- What lens did they click first? (Architecture is default — do they
  switch to Decisions, Cost, Risk?)
- Did they notice the sample switcher (top-left chip group)?
- Did they understand the diagram zones (client / edge / app / data)?
- Did they hover/click a node? Did the popover content help?

After 2 min:
> 1. "Which part of this would you actually use?"
> 2. "What's missing that would make this a deliverable?"
> 3. "If a junior engineer on your team produced this, what's the first
>    pushback you'd give?"

### 0:12 — Brief composer (5 min)

> "Click 'Start a brief'. Write a brief for a system you've actually been
> meaning to architect. Real one, not a demo one."

Watch them type. Note:
- Where do they hesitate?
- Do they use the wizard chips on the right or just the textarea?
- How long is their brief?

When they hit submit:
> "Don't worry, no card needed yet."

### 0:17 — Checkout reaction (2 min)

They land on `/checkout`. **This is the moment**.

> 1. "What's your gut reaction to the price?"

**Stay silent.** Let them sit with it. Their first number is the data.

> 2. "What would you need to see to actually click 'Continue to payment'?"

### 0:19 — Run-progress (5 min)

> "Click Continue. The run is mocked but plays at 2× speed."

Stay silent. They watch the agents tick through. Note:
- Did they read the timeline rail or just the hero?
- Did the clarifying-question card register? (It pauses for ~6 seconds.)
- When the "Open the package" button activates, do they click immediately
  or first scan the decisions/sources panels?

After they click and land back on `/decide`:
> 1. "Was that 12 minutes worth $10 to you?"
> 2. "What would push it to $___?" (Use *their* anchor.)
> 3. "What would you tell a peer about this in one sentence?"

### 0:24 — Failure mode + missing surfaces (3 min)

> 1. "Where did you almost give up?"
> 2. "What screen do you wish existed that doesn't?"
> 3. "If I gave you this for free for a month, what would you actually
>    use it for first?"

### 0:27 — Pricing follow-up (2 min)

If they said yes to $10 easily → push: "What about $20?"
If they hesitated at $10 → ask: "What about $5? Free with credits?"
If they said no → ask: "What price would make you a yes?"

### 0:29 — Wrap (1 min)

> "Anything I didn't ask that I should have?"
> "Can I follow up in a few weeks if I have a more polished version?"

Send GC within 24 hours. Add to a "feedback alumni" list — they're your
first 10 paying users if you treat them well.

---

## What to write up immediately after

Open [phase1-feedback.md](./phase1-feedback.md). Fill the Session N
template **before** the next call. Do not rely on memory; the second call
will overwrite the first.

Look for:
- **Quotes** that recur across 3+ sessions → these go in the landing page.
- **Confusions** that recur across 3+ sessions → these are bugs.
- **Asks** that recur across 3+ sessions → these go in BACKLOG.md, not
  Phase 2.

---

## Anti-patterns (don't do these)

- ❌ Demoing the product yourself. They drive.
- ❌ Defending a confused reaction. Write it down and move on.
- ❌ Asking "would you pay?" before they've used it. Show first, ask later.
- ❌ Volunteering the price. Let them react to it on the checkout page.
- ❌ Recruiting only your friends. They will lie to be nice.
- ❌ Skipping the write-up to "do them all in a batch". You will forget.
