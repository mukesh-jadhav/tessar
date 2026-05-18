import type { Metadata } from "next";
import Link from "next/link";

import { AppShell } from "@/components/shell/app-shell";
import { LegalDocument } from "@/components/legal/legal-document";
import {
  LEGAL_COMPANY_NAME,
  LEGAL_CONTACT_EMAIL,
  LEGAL_LAST_UPDATED,
  TERMS_SECTIONS,
} from "@/lib/legal";

export const metadata: Metadata = {
  title: `Terms of Service — ${LEGAL_COMPANY_NAME}`,
  description:
    "The terms under which you may use TESSAR. Pay-per-run billing, AI-output disclaimers, acceptable use, limitation of liability.",
};

export default function TermsPage(): React.ReactElement {
  return (
    <AppShell pageLabel="terms of service">
      <LegalDocument
        eyebrow="Legal"
        title="Terms of Service"
        lastUpdated={LEGAL_LAST_UPDATED}
        intro={[
          `These terms govern your use of ${LEGAL_COMPANY_NAME}. By creating an account or starting a run you agree to them. If you don't agree, don't use the service.`,
          "Plain-language summary: TESSAR produces AI-generated research and design suggestions. They're a starting point, not a final architecture, and not professional advice. You pay per run. You verify before you build. Our liability is capped at what you paid for the run.",
        ]}
        sections={TERMS_SECTIONS}
        footer={
          <p>
            Questions?{" "}
            <a
              href={`mailto:${LEGAL_CONTACT_EMAIL}`}
              className="text-primary font-medium hover:underline"
            >
              {LEGAL_CONTACT_EMAIL}
            </a>
            . See also our{" "}
            <Link href="/privacy" className="text-primary font-medium hover:underline">
              Privacy Policy
            </Link>
            .
          </p>
        }
      />
    </AppShell>
  );
}
