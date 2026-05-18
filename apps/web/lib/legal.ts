/* ---------------------------------------------------------------------------
 * lib/legal.ts — single source of truth for legal copy.
 *
 * All disclaimers, terms, and privacy strings live here so the UI, the
 * report templates, and the API responses stay in sync. If you change a
 * sentence here, run search across the repo to confirm nothing else
 * hard-codes the same text.
 *
 * IMPORTANT: This is reasonable boilerplate, not legal advice. Before
 * public launch (Phase 6) get this reviewed by counsel and replace as
 * needed. See product-goals.instructions.md → "Trust requirements".
 * ------------------------------------------------------------------------- */

export const LEGAL_COMPANY_NAME = "TESSAR";
export const LEGAL_CONTACT_EMAIL = "legal@tessar.dev";
export const LEGAL_LAST_UPDATED = "May 18, 2026";

/** One-line notice for compact surfaces (sticky bars, footers, tooltips). */
export const DISCLAIMER_SHORT =
  "AI-generated architecture suggestions. Review with a qualified engineer before use.";

/** Sentence-form notice for the brief page and run footer. */
export const DISCLAIMER_BRIEF =
  "Outputs are AI-generated research suggestions, not professional engineering advice. " +
  "Validate every recommendation against your own constraints before production use.";

/** Multi-paragraph notice rendered inside the package (decide page + export). */
export const DISCLAIMER_REPORT_PARAGRAPHS: string[] = [
  "This package was produced by an automated multi-agent system using large language " +
    "models and a curated knowledge base. It is intended as a researched starting point " +
    "for human architects, not as a final or production-ready design.",
  "Recommendations may be incomplete, out of date, or incorrect for your specific " +
    "constraints. Cost figures are list prices at the time of generation and exclude " +
    "support contracts, sustained-use discounts, taxes, egress overages, and any rates " +
    "your organisation has negotiated. Latency, scale, and reliability estimates are " +
    "modelled — not measured against your workload.",
  "Cited sources reflect the snapshot used at generation time; vendor pricing, service " +
    "limits, regional availability, and compliance posture can change without notice. " +
    "Verify every component, contract, and quota directly with the vendor before " +
    "committing.",
  "Nothing in this package constitutes legal, financial, security, regulatory, or " +
    "professional engineering advice. Decisions about production systems must be made " +
    "by qualified personnel who can evaluate the trade-offs against your specific " +
    "business, security, compliance, and operational context. " +
    `${LEGAL_COMPANY_NAME} disclaims liability for outcomes arising from use of this ` +
    "output to the maximum extent permitted by law.",
];

/** Inline notice for the run-watch screen while agents are working. */
export const DISCLAIMER_RUN_WATCH =
  "Live progress shown for transparency. Final package is a researched suggestion — " +
  "not a substitute for engineering review.";

/* ────────────────────────────────────────────────────────────────────── *
 * Terms of Service — plain-language summary + structured sections.
 * Each section is { heading, body[] } so the /terms page can render
 * them with a consistent layout and screen-readers get real headings.
 * ────────────────────────────────────────────────────────────────────── */

export interface LegalSection {
  heading: string;
  body: string[];
}

export const TERMS_SECTIONS: LegalSection[] = [
  {
    heading: "1. What TESSAR is",
    body: [
      `${LEGAL_COMPANY_NAME} is a research and design-assist tool. You describe a system in plain language and we run a multi-agent pipeline that produces a written architecture package (PDF + Markdown) with citations, cost estimates, and trade-off notes.`,
      "The output is informational. It is not professional engineering, legal, financial, security, or regulatory advice. You remain responsible for every decision you make about your systems.",
    ],
  },
  {
    heading: "2. Eligibility & account",
    body: [
      "You must be at least 18 and legally able to enter a contract in your jurisdiction. You are responsible for the security of your sign-in method (magic link or Google OAuth) and for all activity under your account.",
      "We may suspend or terminate accounts that are used to abuse the service, attempt to extract prompts or models, attack our infrastructure, or violate these terms.",
    ],
  },
  {
    heading: "3. Pay-per-run billing",
    body: [
      "The service is billed per run via Stripe Checkout. Each run is a single chargeable unit; you pay before the run starts. Prices are shown at the point of purchase and may change without notice for future runs.",
      "If a run fails for reasons attributable to us (orchestrator error, model outage, exceeded internal budget) and we cannot deliver a package, we will refund the charge for that run. Refunds for runs that completed successfully are at our discretion and generally not provided.",
      "Stripe handles all payment data. We do not store full card numbers.",
    ],
  },
  {
    heading: "4. Acceptable use",
    body: [
      "You will not: submit briefs that contain unlawful content; attempt to extract or reverse-engineer our prompts, models, or knowledge base; use the service to design systems intended for illegal activity; impersonate others; scrape outputs in bulk to train competing models; or attempt to bypass rate limits, billing, or security controls.",
      "We treat scraped web content fetched during research as untrusted. Workers are instructed to ignore any instructions embedded in fetched content. If you embed prompt-injection payloads in your brief intending to manipulate the system, your account may be suspended.",
    ],
  },
  {
    heading: "5. AI-generated content & no warranty",
    body: [
      "Outputs are generated by large language models, may contain mistakes, may cite sources inaccurately, and may not reflect the current state of any third-party product or service. We do not warrant that outputs are correct, complete, current, fit for any particular purpose, non-infringing, or suitable for production use.",
      "You must independently verify every recommendation, citation, cost estimate, and architectural choice before relying on it. Engage qualified engineers, legal counsel, security reviewers, and compliance specialists as appropriate to your context.",
    ],
  },
  {
    heading: "6. Intellectual property",
    body: [
      `You retain ownership of your brief and any confidential information you submit. ${LEGAL_COMPANY_NAME} retains ownership of the platform, the agent graph, prompts, knowledge base, and all software.`,
      "Subject to these terms, we grant you a perpetual, non-exclusive licence to use the package output for your own internal business purposes, including sharing it within your organisation and with contractors working on your behalf. You may not resell the package as a stand-alone product.",
      "Cited third-party content (vendor docs, articles, etc.) remains the property of its respective owners and is used under fair-use / informational citation.",
    ],
  },
  {
    heading: "7. Confidentiality",
    body: [
      "Briefs are processed to produce the package and are stored encrypted at rest. Brief content is not used to train third-party foundation models. Aggregated, de-identified telemetry (latency, token counts, error rates) may be used to improve the service.",
      "Do not submit secrets (API keys, passwords, personal data of others, regulated health or financial records) in your brief. We will treat any such data as if it should not have been submitted and may redact or purge it.",
    ],
  },
  {
    heading: "8. Third-party services",
    body: [
      "TESSAR uses third parties including (without limitation) Google Cloud, Stripe, Resend, model providers, and web-search APIs. Their terms and privacy practices apply to data they process on our behalf. Outages or behaviour changes in third-party services may affect availability, latency, and output quality.",
    ],
  },
  {
    heading: "9. Limitation of liability",
    body: [
      `To the maximum extent permitted by law, ${LEGAL_COMPANY_NAME} and its affiliates, officers, employees, and suppliers are not liable for any indirect, incidental, special, consequential, exemplary, or punitive damages, or for any loss of profits, revenue, data, goodwill, or business opportunity, arising out of or related to your use of the service or the output.`,
      `Our total aggregate liability for any claim arising from the service is limited to the greater of (a) the amount you paid ${LEGAL_COMPANY_NAME} for the specific run that gave rise to the claim, or (b) USD 50.`,
      "Some jurisdictions do not allow exclusion of certain warranties or limitation of certain damages; in those jurisdictions, our liability is limited to the smallest amount permitted by law.",
    ],
  },
  {
    heading: "10. Indemnity",
    body: [
      `You agree to defend and indemnify ${LEGAL_COMPANY_NAME} against claims, damages, and costs (including reasonable legal fees) arising from your brief content, your use of the package output, your violation of these terms, or your violation of any law or third-party right.`,
    ],
  },
  {
    heading: "11. Changes to the service or terms",
    body: [
      "We may change the service, pricing, or these terms at any time. Material changes will be announced in-product or by email. Continued use after the effective date of a change constitutes acceptance.",
    ],
  },
  {
    heading: "12. Governing law & contact",
    body: [
      "These terms are governed by the laws of the jurisdiction in which TESSAR is incorporated, without regard to conflict-of-law principles. Disputes will be resolved in the competent courts of that jurisdiction.",
      `Questions: ${LEGAL_CONTACT_EMAIL}.`,
    ],
  },
];

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    heading: "1. What we collect",
    body: [
      "Account data: your email address, sign-in provider, and authentication tokens (managed by Auth.js).",
      "Brief data: the text and structured guidance you submit when starting a run.",
      "Run data: the generated package, agent telemetry (tokens used, models used, sources cited, timings), and run status.",
      "Payment data: Stripe customer ID, charge IDs, and last-4 / brand of your card. Stripe stores full card details; we do not.",
      "Operational telemetry: aggregated request logs, performance metrics, and error reports (Sentry). Sensitive payloads and brief content are excluded from these logs per our logging policy.",
    ],
  },
  {
    heading: "2. How we use it",
    body: [
      "To run the agent pipeline and deliver your package.",
      "To bill you and prevent fraud.",
      "To improve reliability, performance, and quality (aggregated telemetry only — brief content is not used to train third-party foundation models).",
      "To respond to support requests and enforce these terms.",
    ],
  },
  {
    heading: "3. Subprocessors",
    body: [
      "We share the minimum data required with: Google Cloud (hosting, storage, model inference via Vertex AI), Stripe (payments), Resend (transactional email), Sentry (error reporting), PostHog (product analytics with PII redaction). Each operates under its own terms and privacy policy.",
    ],
  },
  {
    heading: "4. Retention",
    body: [
      "Account data: kept while your account is active and for a reasonable period after.",
      "Briefs and packages: retained for as long as you may want to download them, typically 12 months. You may request deletion at any time.",
      "Rendered PDF/Markdown artifacts: stored in encrypted object storage and automatically transitioned to Nearline cold storage after 30 days.",
      "Payment records: kept as required by tax and accounting law.",
    ],
  },
  {
    heading: "5. Security",
    body: [
      "Encryption in transit (TLS) and at rest. Private networking for the database and cache. Least-privilege service accounts. Secrets in Google Secret Manager. Stripe webhook signatures verified. Pub/Sub push verified via OIDC. We follow OWASP Top 10 guidance for application code.",
    ],
  },
  {
    heading: "6. Your rights",
    body: [
      "Depending on your jurisdiction (UK / EU / California / India etc.) you may have the right to access, correct, delete, port, or restrict processing of your personal data, and to object to certain uses. Email " +
        LEGAL_CONTACT_EMAIL +
        " to exercise these rights.",
      "We do not sell your personal data. We do not use your brief content to train foundation models.",
    ],
  },
  {
    heading: "7. Children",
    body: [
      "The service is not intended for anyone under 18. We do not knowingly collect data from children.",
    ],
  },
  {
    heading: "8. International transfers",
    body: [
      "Data may be processed in regions other than your own (primarily where our Google Cloud region and our subprocessors operate). Where required by law we rely on Standard Contractual Clauses or equivalent safeguards.",
    ],
  },
  {
    heading: "9. Contact",
    body: [`Privacy questions: ${LEGAL_CONTACT_EMAIL}. We aim to respond within 30 days.`],
  },
];
