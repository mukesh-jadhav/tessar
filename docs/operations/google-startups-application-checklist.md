# Google for Startups Cloud Program — Application Checklist

**Why:** $2k–$200k in GCP credits + Vertex AI credits depending on tier.
For an MVP at TESSAR's scale, the **Start tier ($2k credits, 12 months)**
is realistic without external funding; the **Scale tier ($100k+)**
requires being VC-backed.

**Submit before:** Phase 2 starts. Approval can take 2–4 weeks.

**Program page:** <https://cloud.google.com/startup>

---

## §1 — Decide which tier to apply for

| Tier | Credits | Eligibility (typical) |
|---|---|---|
| **Start** | $2,000 (1 year) | Pre-seed / bootstrapped. No funding requirement. **Apply for this first.** |
| **Scale** | $100,000 (1 year) + Vertex AI bonus | Funded by an approved partner VC/accelerator. |

**Decision (2026-05-11):** Apply for **Start** tier. Self-funded /
bootstrapped at this stage. Re-apply for Scale when first institutional
funding lands (does not require waiting for Start credits to expire).

---

## §2 — Pre-application gather (30 min)

You'll need these answers in the form. Pre-fill them so the form takes
< 15 minutes.

- [ ] **Company name:** TESSAR _(or chosen legal name once incorporated)_
- [ ] **Incorporation status:**
      - [ ] Sole proprietor / not yet incorporated _(this is fine for Start)_
      - [ ] Private limited / LLC — share registration date and country
- [ ] **Founded date:** _YYYY-MM-DD_
- [ ] **Country of operation:** India _(matches `asia-south1` choice)_
- [ ] **Website:** `https://tessar.dev` _(even a holding page works; have
      something live)_
- [ ] **GCP billing account ID:** from
      [GCP bootstrap checklist](./gcp-bootstrap-checklist.md) §1
- [ ] **Project IDs:** `tessar-dev`, `tessar-staging`, `tessar-prod`
- [ ] **One-line pitch:** _"Researched system architectures on demand —
      describe a system in plain English, get a defensible design package
      in 12 minutes."_ _(160 chars max; tweak to fit form limit.)_
- [ ] **Two-paragraph description** (300–500 words):
      - Para 1: the problem ("founders and engineers spend days
        researching architectures and still ship something defensible
        only by accident").
      - Para 2: the solution + GCP usage ("multi-agent orchestration on
        Cloud Run, Vertex AI Gemini for the agents, Cloud SQL +
        pgvector for the curated KB, Memorystore for live progress
        events").
- [ ] **Funding raised:** $0 (or current amount).
- [ ] **Number of employees:** 1.
- [ ] **Use of GCP:** check Compute, AI/ML, Database, Networking.

---

## §3 — Application form

- [ ] Visit <https://cloud.google.com/startup/apply>.
- [ ] Sign in with the **same Google account** that owns the GCP billing
      account.
- [ ] Select **Start tier**.
- [ ] Fill the form using §2 answers.
- [ ] Submit. Save the confirmation email.

---

## §4 — Likely follow-ups from Google

Be ready for one of these emails within 1–3 weeks:

- [ ] **"Tell us more about your AI usage"** → reply with: 9-agent
      LangGraph orchestrator, Vertex AI Gemini 1.5-pro for
      synthesizer/architect/risk, Vertex AI Gemini 1.5-flash for
      research workers, Vertex AI `text-embedding-005` for KB retrieval,
      hard per-run token budget, prompt+retrieval caching in
      Memorystore.
- [ ] **"What's your projected GCP spend?"** → ~$200/mo at MVP launch
      (no traffic), scaling linearly with paid runs at ~$1.50–$3
      LLM cost per run.
- [ ] **"Are you part of an accelerator?"** → No; reapplying for Scale
      tier when funding lands.
- [ ] **"Confirm your billing account"** → reply with the
      `01XXXX-XXXXXX-XXXXXX` ID from the bootstrap checklist.

---

## §5 — On approval

- [ ] Credits land on the billing account automatically. Verify in
      `Billing → Credits` in the GCP console.
- [ ] Update [`MVP.md`](../../MVP.md) §9 to record the credit grant date
      and expiry.
- [ ] Set a calendar reminder for the credit expiry minus 60 days so
      you can reapply for the next tier or budget for cash spend.

---

## §6 — On rejection

Rejections at the Start tier are rare for genuine startups. If it
happens:

- [ ] Re-read the rejection email — usually it's a missing field or a
      website that returns 404. Fix and reapply after 30 days.
- [ ] Contact a Google Cloud sales rep directly via the regional contact
      form — sometimes a manual review unblocks it.
- [ ] As a fallback, apply for **Microsoft for Startups Founders Hub**
      ($150k Azure credits, similar program) — does NOT change our cloud
      decision (locked GCP per architecture rules), but covers our cloud
      bill via a credit-only path while we're pre-revenue. _(Treat as
      Plan B only; don't dual-deploy.)_

---

## §7 — Sign-off

- [ ] Application submitted. Date: _YYYY-MM-DD_. Confirmation email
      filed.
- [ ] Cleared to begin Phase 2 _(no need to wait for approval — Phase 2
      runs on free trial credit + own card while approval is in flight)_.
