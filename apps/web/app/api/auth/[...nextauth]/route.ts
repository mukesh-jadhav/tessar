import { handlers } from "@/auth";

// Auth.js v5 mounts both GET and POST through its single handler.
export const { GET, POST } = handlers;

// Auth.js needs a stable Node runtime — Prisma + Nodemailer don't run on Edge.
export const runtime = "nodejs";
