import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // Cloud Run deploys use the standalone output for slim images.
  // Locally on Windows this needs developer-mode (symlink permission), so opt
  // in via env: `NEXT_OUTPUT=standalone next build`. CI sets this.
  ...(process.env.NEXT_OUTPUT === "standalone" ? { output: "standalone" as const } : {}),
  typedRoutes: true,
  // @google-cloud/pubsub (and its @grpc/grpc-js dep) loads .proto files from
  // disk at runtime and uses dynamic requires that Turbopack/webpack cannot
  // bundle correctly. Keep them as real Node modules on the server.
  // @google-cloud/storage joins the list because it shares the same gax/grpc
  // plumbing for resumable uploads + signed-URL helpers.
  serverExternalPackages: [
    "@google-cloud/pubsub",
    "@google-cloud/storage",
    "@grpc/grpc-js",
    "google-gax",
  ],
};

// Phase 4.2: wrap with Sentry's plugin only when SENTRY_DSN is set.
// The plugin injects source-map upload + tunneling. Without DSN, return
// the plain config so local dev / CI without Sentry creds stay green.
//
// Next 15 supports an async default export for next.config.ts.
export default async function nextConfig(): Promise<NextConfig> {
  if (!process.env.SENTRY_DSN?.trim()) {
    return config;
  }
  const { withSentryConfig } = await import("@sentry/nextjs");
  return withSentryConfig(config, {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    silent: !process.env.CI,
    // Disables the "ad-blocker bypass" tunnel route — we don't need it
    // for an admin-only dev deploy and it adds an authenticated path.
    tunnelRoute: undefined,
    disableLogger: true,
    // Source-map upload requires SENTRY_AUTH_TOKEN; skip it when missing
    // so PR builds without the token still succeed. Browser source maps
    // are off by default in Next — server source maps still ship to
    // Sentry when the auth token is set.
    sourcemaps: {
      disable: !process.env.SENTRY_AUTH_TOKEN,
    },
  });
}
