/**
 * Edge middleware — Auth.js v5 session gate.
 *
 * Imports only `auth.config.ts` (no Prisma, no Nodemailer) so it stays
 * within the Edge runtime budget. The `authorized` callback in that file
 * decides per-request whether to let traffic through or redirect to
 * `/signin`.
 */
import NextAuth from "next-auth";

import { authConfig } from "./auth.config";

export const { auth: middleware } = NextAuth(authConfig);

// Run on every path EXCEPT static assets, the Auth.js endpoints (which
// must be reachable when unauthenticated), and Next's internals.
export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)",
  ],
};

export default middleware;
