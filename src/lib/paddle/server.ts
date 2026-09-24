import "server-only";

import { Environment, LogLevel, Paddle } from "@paddle/paddle-node-sdk";

// SERVER-ONLY Paddle API client. PADDLE_API_KEY and PADDLE_WEBHOOK_SECRET are private env vars
// (never NEXT_PUBLIC_*) — .env.local locally, private Netlify env vars in production.
const apiKey = process.env.PADDLE_API_KEY;

export const paddleEnvironment: Environment =
  process.env.NEXT_PUBLIC_PADDLE_ENV === "production" ? Environment.production : Environment.sandbox;

export const isPaddleConfigured = Boolean(apiKey);

let instance: Paddle | null = null;

export function getPaddle(): Paddle {
  if (!apiKey) throw new Error("PADDLE_API_KEY is not configured.");
  instance ??= new Paddle(apiKey, { environment: paddleEnvironment, logLevel: LogLevel.error });
  return instance;
}
