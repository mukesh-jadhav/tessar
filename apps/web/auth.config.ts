/**
 * Edge-safe slice of the Auth.js v5 config.
 *
 * Imported by `middleware.ts` (which runs in the Edge runtime and cannot
 * load the Prisma adapter, Nodemailer, or any Node-only provider). The full
 * config in `auth.ts` extends this with the adapter and providers.
 *
 * `authorized` runs on every matched request — it returns `true` to allow,
 * `false` to redirect to `pages.signIn`, or a `Response`/`NextResponse` to
 * take full control. JWT strategy means the middleware can read the session
 * payload directly from the cookie, no DB roundtrip.
 */
import type { NextAuthConfig } from "next-auth";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/brief",
  "/decide",
  "/checkout",
  "/run",
  "/billing",
] as const;

/**
 * Pre-launch sign-in allowlist.
 *
 * Until we open beta we only let invited operators in. Reads
 * ``AUTH_ALLOWED_EMAILS`` (comma-separated, case-insensitive) and
 * always includes the bootstrap admin so a misconfigured env can't
 * lock the team out of dev.
 *
 * Returning ``false`` from the ``signIn`` callback aborts the OAuth
 * exchange / magic-link verification cleanly — the user is bounced to
 * ``pages.error`` (= ``/unauthorized``) without a session ever being
 * issued.
 */
const BOOTSTRAP_ADMIN_EMAIL = "[email protected]";

function loadAllowlist(): ReadonlySet<string> {
  const raw = process.env.AUTH_ALLOWED_EMAILS ?? "";
  const set = new Set<string>([BOOTSTRAP_ADMIN_EMAIL.toLowerCase()]);
  for (const entry of raw.split(",")) {
    const trimmed = entry.trim().toLowerCase();
    if (trimmed) set.add(trimmed);
  }
  return set;
}

export const authConfig = {
  pages: {
    signIn: "/signin",
    error: "/unauthorized",
    verifyRequest: "/signin?check=email",
  },
  session: { strategy: "jwt" },
  callbacks: {
    /**
     * Pre-launch allowlist gate. Runs before a session is issued for
     * BOTH OAuth providers and magic-link verification. Returning
     * ``false`` redirects to ``/unauthorized``.
     */
    signIn({ user, profile }) {
      const email = (
        user?.email ??
        (typeof profile?.email === "string" ? profile.email : null) ??
        ""
      )
        .trim()
        .toLowerCase();
      if (!email) return false;
      return loadAllowlist().has(email);
    },
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const needsAuth = PROTECTED_PREFIXES.some(
        (p) => pathname === p || pathname.startsWith(`${p}/`),
      );
      if (!needsAuth) return true;
      return Boolean(auth?.user);
    },
    session({ session, token }) {
      if (token.sub && session.user) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
  // Providers added in auth.ts (they require Node APIs and the adapter).
  providers: [],
} satisfies NextAuthConfig;
