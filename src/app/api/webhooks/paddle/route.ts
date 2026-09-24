import { getPaddle } from "@/lib/paddle/server";
import { processPaddleEvent } from "@/lib/paddle/sync";

/**
 * Paddle Billing webhook — the notification destination points at
 * https://colegapro.com/api/webhooks/paddle (src/proxy.ts's matcher already excludes /api, so
 * next-intl never locale-prefixes it).
 *
 * The raw body is verified against the Paddle-Signature header with PADDLE_WEBHOOK_SECRET before
 * anything is parsed. Any failure (bad signature, DB error) returns a non-2xx so Paddle retries —
 * only a 2xx marks an event delivered.
 */
export async function POST(request: Request) {
  const signature = request.headers.get("paddle-signature") ?? "";
  const rawBody = await request.text();
  const secret = process.env.PADDLE_WEBHOOK_SECRET ?? "";

  if (!signature || !rawBody) {
    return Response.json({ error: "Missing signature or body" }, { status: 400 });
  }

  try {
    const event = await getPaddle().webhooks.unmarshal(rawBody, secret, signature);
    await processPaddleEvent(event);
    return Response.json({ received: true });
  } catch (error) {
    console.error("[paddle] webhook failed", error instanceof Error ? error.message : error);
    return Response.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
