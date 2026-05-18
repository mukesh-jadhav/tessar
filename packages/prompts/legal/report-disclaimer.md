# Report disclaimers — embed verbatim in every export

This file is the canonical legal disclaimer that **must appear in every
generated package** (PDF cover page footer + Markdown front matter +
Markdown final section). It is mirrored in
`apps/web/lib/legal.ts → DISCLAIMER_REPORT_PARAGRAPHS` so the in-app
viewer and the rendered artifact stay in sync.

If you change this text, also update `apps/web/lib/legal.ts` and rerun
the eval harness — graders include a check for disclaimer presence.

See product-goals.instructions.md → "Trust requirements":
_"Disclaimer + scope statement on every export."_

---

## Short notice (PDF cover, every page footer, Markdown front matter)

> **AI-generated suggestions.** This package was produced by an automated
> multi-agent system. It is a researched starting point, not a final
> architecture or professional engineering advice. Validate every
> recommendation against your own constraints before production use.

## Long notice (final section of every PDF + every Markdown export)

### Disclaimer

This package was produced by an automated multi-agent system using large
language models and a curated knowledge base. It is intended as a
researched starting point for human architects, not as a final or
production-ready design.

Recommendations may be incomplete, out of date, or incorrect for your
specific constraints. Cost figures are list prices at the time of
generation and exclude support contracts, sustained-use discounts, taxes,
egress overages, and any rates your organisation has negotiated. Latency,
scale, and reliability estimates are modelled — not measured against your
workload.

Cited sources reflect the snapshot used at generation time; vendor
pricing, service limits, regional availability, and compliance posture
can change without notice. Verify every component, contract, and quota
directly with the vendor before committing.

Nothing in this package constitutes legal, financial, security,
regulatory, or professional engineering advice. Decisions about
production systems must be made by qualified personnel who can evaluate
the trade-offs against your specific business, security, compliance, and
operational context. TESSAR disclaims liability for outcomes arising from
use of this output to the maximum extent permitted by law.

By generating this package you accepted the TESSAR Terms of Service
(https://tessar.dev/terms) and Privacy Policy
(https://tessar.dev/privacy).
