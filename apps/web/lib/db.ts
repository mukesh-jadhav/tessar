import { PrismaClient } from "@prisma/client";

// Single Prisma client per process. Next.js dev mode hot-reloads modules,
// so we cache on globalThis to avoid exhausting Postgres connections.
declare global {
  // eslint-disable-next-line no-var
  var __tessarPrisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.__tessarPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "production" ? ["error", "warn"] : ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__tessarPrisma = prisma;
}
