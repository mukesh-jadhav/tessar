/**
 * Auth.js v5 — full server-runtime config.
 *
 * Extends `auth.config.ts` (edge-safe slice used by middleware) with:
 *   - Prisma adapter — persists Users/Accounts/VerificationTokens.
 *   - Google OAuth — for users who already have a Google identity.
 *   - Nodemailer (SMTP) magic-link — works against Mailpit locally
 *     (`SMTP_*` envs from docker-compose) and Resend's SMTP gateway in
 *     cloud (`smtp.resend.com:465`, user `resend`, pass = AUTH_RESEND_KEY).
 *
 * Session strategy is JWT (declared in auth.config.ts). The adapter is
 * still used for the magic-link verification token table and for OAuth
 * account linking — only the session itself lives in the cookie.
 *
 * Re-exports `handlers` (mounted at /api/auth/[...nextauth]), `auth`
 * (server-side session reader), and `signIn`/`signOut` server actions.
 */
import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Nodemailer from "next-auth/providers/nodemailer";

import { authConfig } from "./auth.config";
import { prisma } from "./lib/db";
import { recordConsent } from "./lib/legal-consent";

const smtpHost = process.env.SMTP_HOST ?? "localhost";
const smtpPort = Number(process.env.SMTP_PORT ?? 1025);
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASSWORD;
const smtpFrom = process.env.AUTH_EMAIL_FROM ?? "TESSAR <no-reply@tessar.dev>";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID ?? "",
      clientSecret: process.env.AUTH_GOOGLE_SECRET ?? "",
      // Force account selection so users on shared machines can switch.
      authorization: { params: { prompt: "select_account" } },
      // Link Google to an existing User row that was first created via
      // magic-link (or vice-versa) when the email matches. Safe because
      // Google verifies the email and Nodemailer's magic-link flow only
      // completes after the user clicks a link sent to that same inbox —
      // i.e. both providers prove ownership of the address. Without this,
      // the second provider returns `OAuthAccountNotLinked` and the user
      // is bounced back to /signin.
      allowDangerousEmailAccountLinking: true,
    }),
    Nodemailer({
      from: smtpFrom,
      // Mailpit (local) needs no auth; Resend SMTP needs `resend` + key.
      server: {
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        ...(smtpUser && smtpPass ? { auth: { user: smtpUser, pass: smtpPass } } : {}),
      },
    }),
  ],
  events: {
    /**
     * Capture the click-wrap acceptance from /signin as a durable record
     * the moment the adapter inserts the user row. The /signin page shows
     * the "By signing in you agree to..." line above the auth controls,
     * so completing the flow IS the acceptance. We don't have request
     * headers here (events run server-side after adapter callbacks), so
     * IP/UA are stored as NULL — the existence of the row + the version
     * string is what the audit relies on. See ADR-0011.
     */
    async createUser({ user }): Promise<void> {
      if (!user.id) return;
      try {
        await recordConsent({ userId: user.id, context: "signup" });
      } catch (err) {
        // Never let consent logging block sign-up. The re-consent banner
        // will catch up the user on next page load if this fails.
        console.error("[auth.events.createUser] recordConsent failed", {
          userId: user.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  },
});
