/**
 * Vitest setup. Seeds env vars Stripe + Auth modules read at import time.
 */
process.env.STRIPE_SECRET_KEY ??= "sk_test_dummy_for_vitest";
process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_dummy_for_vitest";
process.env.AUTH_URL ??= "http://localhost:3000";
process.env.AUTH_SECRET ??= "test-secret-test-secret-test-secret";
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
