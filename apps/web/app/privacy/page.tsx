import type { Metadata } from "next";
import Link from "next/link";

import { AppShell } from "@/components/shell/app-shell";
import { LegalDocument } from "@/components/legal/legal-document";
import {
  LEGAL_COMPANY_NAME,
  LEGAL_CONTACT_EMAIL,
  LEGAL_LAST_UPDATED,
  PRIVACY_SECTIONS,
} from "@/lib/legal";

export const metadata: Metadata = {
  title: `Privacy Policy — ${LEGAL_COMPANY_NAME}`,
  description:
    "What TESSAR collects, how we use it, who processes it on our behalf, how long we keep it, and how to exercise your rights.",
};

export default function PrivacyPage(): React.ReactElement {
  return (
    <AppShell pageLabel="privacy policy">
      <LegalDocument
        eyebrow="Legal"
        title="Privacy Policy"
        lastUpdated={LEGAL_LAST_UPDATED}
        intro={[
          `${LEGAL_COMPANY_NAME} processes only the data needed to run the service and bill you. We don't sell your data. We don't use your brief content to train foundation models.`,
          "This policy explains what we collect, why, who we share it with, and how to exercise your rights.",
        ]}
        sections={PRIVACY_SECTIONS}
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
            <Link href="/terms" className="text-primary font-medium hover:underline">
              Terms of Service
            </Link>
            .
          </p>
        }
      />
    </AppShell>
  );
}
