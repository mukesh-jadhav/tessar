-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "run_status" AS ENUM ('pending', 'running', 'awaiting_clarification', 'succeeded', 'failed', 'refunded');

-- CreateEnum
CREATE TYPE "artifact_kind" AS ENUM ('package_json', 'package_md', 'package_pdf', 'diagram_svg', 'diagram_png', 'prompt_log', 'source_snapshot');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "runs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "run_status" NOT NULL DEFAULT 'pending',
    "brief_json" JSONB NOT NULL,
    "constraints_json" JSONB,
    "price_cents" INTEGER NOT NULL,
    "stripe_payment_intent" TEXT,
    "kb_snapshot_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "run_events" (
    "id" BIGSERIAL NOT NULL,
    "run_id" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "payload_json" JSONB NOT NULL,

    CONSTRAINT "run_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "run_artifacts" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "kind" "artifact_kind" NOT NULL,
    "gcs_uri" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "bytes" INTEGER,
    "sha256" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "run_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kb_components" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "cloud" TEXT NOT NULL,
    "pricing_model" TEXT,
    "regions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "compliance" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "limits_json" JSONB,
    "sources" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "last_verified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "embedding" vector(1536),

    CONSTRAINT "kb_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kb_patterns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "when_to_use" TEXT NOT NULL,
    "when_not_to_use" TEXT NOT NULL,
    "examples" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "last_verified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "embedding" vector(1536),

    CONSTRAINT "kb_patterns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kb_reference_archs" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "components_json" JSONB NOT NULL,
    "last_verified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "embedding" vector(1536),

    CONSTRAINT "kb_reference_archs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eval_briefs" (
    "id" TEXT NOT NULL,
    "brief" TEXT NOT NULL,
    "gold_package_json" JSONB NOT NULL,
    "last_score" DOUBLE PRECISION,
    "last_run_at" TIMESTAMP(3),

    CONSTRAINT "eval_briefs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_providerAccountId_key" ON "accounts"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_sessionToken_key" ON "sessions"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "verification_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_identifier_token_key" ON "verification_tokens"("identifier", "token");

-- CreateIndex
CREATE INDEX "runs_userId_created_at_idx" ON "runs"("userId", "created_at" DESC);

-- CreateIndex
CREATE INDEX "runs_status_idx" ON "runs"("status");

-- CreateIndex
CREATE INDEX "run_events_run_id_ts_idx" ON "run_events"("run_id", "ts");

-- CreateIndex
CREATE INDEX "run_artifacts_run_id_idx" ON "run_artifacts"("run_id");

-- CreateIndex
CREATE INDEX "kb_components_category_idx" ON "kb_components"("category");

-- CreateIndex
CREATE INDEX "kb_components_cloud_idx" ON "kb_components"("cloud");

-- CreateIndex
CREATE INDEX "kb_components_last_verified_at_idx" ON "kb_components"("last_verified_at");

-- CreateIndex
CREATE UNIQUE INDEX "kb_components_cloud_vendor_name_key" ON "kb_components"("cloud", "vendor", "name");

-- CreateIndex
CREATE UNIQUE INDEX "kb_patterns_name_key" ON "kb_patterns"("name");

-- CreateIndex
CREATE INDEX "kb_reference_archs_domain_idx" ON "kb_reference_archs"("domain");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runs" ADD CONSTRAINT "runs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_events" ADD CONSTRAINT "run_events_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_artifacts" ADD CONSTRAINT "run_artifacts_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
