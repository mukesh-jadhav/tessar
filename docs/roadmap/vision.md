# TESSAR — Vision

> Where TESSAR goes after MVP. Not a roadmap commitment, but the destination we're walking toward. Use this to make MVP design choices that don't paint us into a corner.
>
> Source for active scope: [MVP.md](../../MVP.md) and [PLAN.md](../../PLAN.md). This file is **forward-looking only**.

---

## 1. The long arc

TESSAR's wedge today: **defensible, researched architecture as a paid artifact** — not a chat transcript, not a configurator, not a reference-design library.

Each step on the arc deepens the same value proposition rather than pivoting away from it:

```
v1.0  Decide  ─── decision-grade architecture package (PDF + MD)
v1.1  Reason  ─── richer system-design narrative (already pulled into MVP, see ADR-0006)
v1.2  Diff    ─── re-run with edits, show what changed
v1.3  Swap    ─── scoped "what if?" re-runs from /decide/[id]
v1.4  Audit   ─── compliance-ready export (every prompt/source/decision)
v2.0  Ship    ─── production-bundle tier: IaC, runbooks, observability, threat model
v2.1  Team    ─── workspaces, shared run history, per-seat billing
v3.0  Studio  ─── live interactive recompute (separate SKU)
```

None of these belong in MVP. All belong in this document so we don't forget where we're going.

---

## 2. v2.0 — Production Bundle (the upsell tier)

The single most-asked post-MVP feature. Sold as a tier _on top of_ a decided run. Justifies a 5–10× price step over the base tier because it's the work a senior engineer would otherwise spend a week producing.

| Deliverable                    | Shape                                                                                           | Eval surface                                                    |
| ------------------------------ | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **IaC scaffold**               | Terraform modules for the chosen cloud, ready to `terraform plan`                               | Sandbox project; `plan` runs in CI per eval case                |
| **CI/CD pipeline**             | GitHub Actions YAML for build/test/deploy of the recommended architecture                       | `act`-based dry-run validation                                  |
| **Runbooks**                   | One per critical component: incident response, scaling, backup/restore                          | Human grading against a rubric (auto-grading prose is unsolved) |
| **Observability blueprint**    | Grafana dashboards (JSON), SLO definitions, alert rules, log-search recipes                     | Validated against a real metrics pipeline                       |
| **Threat model**               | STRIDE per component + mitigations mapped to the brief's compliance regime                      | Security-review eval rubric                                     |
| **Data model**                 | ERD + initial migration files for the chosen DB                                                 | Schema validation + migration linting                           |
| **Cost-optimisation playbook** | Reserved/committed-use plan, autoscaling targets, idle-resource alerts, projected annual saving | Cost-projection eval against the BOM                            |

**Effort estimate (single builder):** 6 months minimum, with new evaluation infrastructure for each item. Do not start until v1.0 has shipped _and_ Phase 5 beta data shows real willingness-to-pay.

**Pricing intuition (post-MVP):** if v1.0 lands at ₹1500–₹2500 per run, v2.0 lands at ₹10000–₹25000 per run. Anchored to "what does it cost to hire a senior engineer for a week" (~₹50k–150k in India, $5–25k globally), not to "5× the v1.0 price."

---

## 3. Tiering principle (when we eventually tier)

**Two tiers, never three.** _Decide_ (v1.0) and _Ship_ (v2.0). The middle tier is always a trap — fuzzy delta, hostile UX (e.g. PDF-gating), customer-support overhead disproportionate to revenue.

**Never gate the artifact** behind a paywall above the run price. The PDF _is_ the run. Stripping the deliverable to upsell it breaks the "pay-per-outcome" promise.

**Tier introduction is data-driven.** Phase 5 closed beta exists to learn willingness-to-pay. We do not set tier prices by guessing.

---

## 4. Audience question (must be answered before Phase 6)

Pricing currency and target buyer have to be locked before public launch:

| If audience =                     | Pricing band feels right                                      |
| --------------------------------- | ------------------------------------------------------------- |
| Indian SMBs / indie devs          | ₹1500–₹2500 per run (v1.0); ₹10–25k per bundle (v2.0)         |
| Global startups / staff engineers | $50–250 per run (v1.0); $500–2500 per bundle (v2.0)           |
| Enterprise architecture review    | $2500–10000 per run (multi-seat workspaces, SOC2 export, SSO) |

These three audiences want materially different products. Picking one before launch determines:

- LLM cost ceiling per run (and therefore the eval bar's strictness)
- Stripe entity (India vs global)
- Sales motion (self-serve vs sales-led)
- KB depth focus (Indian cloud regions + INR pricing vs US/EU + USD)

Captured as an open decision in [docs/operations/phase2-prereqs.md](../operations/phase2-prereqs.md).

---

## 5. Things we deliberately won't build

Listed so we can refuse them with confidence when asked:

- **Chat-based architecture refinement.** Once a package is generated, edits are paid scoped re-runs (v1.3), not a free conversation. A "decided" answer means decided.
- **A configurator UI** ("pick your DB, pick your queue, pick your edge"). That's the opposite of our wedge — a configurator pretends users know the answer; we sell _deciding_ it for them.
- **Live monitoring / alerting of the deployed system.** Out of scope forever. We're a design-time tool, not an SRE platform.
- **A KB admin UI for end users.** KB is curated, PR-reviewed, and our moat. Users contribute _into_ the KB (post-MVP, v1.4) but don't edit live records.
- **A mobile app.** Architecture decisions don't happen on phones. A mobile-readable PDF is enough.

---

## 6. How this document is used

- When someone proposes a feature: check if it's already on the arc. If yes, point to its version. If no, push back or capture in [BACKLOG.md](../../BACKLOG.md).
- When making MVP design decisions: keep the v2.0 production bundle in mind so the agent graph and `RunPackage` schema can grow into it without a rewrite.
- When prioritising v1.x post-launch: order by data, not by what's listed first here.

This file is updated when the destination changes, not when the path changes.
