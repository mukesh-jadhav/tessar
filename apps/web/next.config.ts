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

export default config;
