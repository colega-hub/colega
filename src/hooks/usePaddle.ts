"use client";

import { useEffect, useState } from "react";
import { initializePaddle, type Environments, type Paddle } from "@paddle/paddle-js";

const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
const environment = (process.env.NEXT_PUBLIC_PADDLE_ENV ?? "sandbox") as Environments;

// Paddle.js refuses a second initializePaddle() call, and several pricing cards mount at once —
// one shared promise for the whole page.
let paddlePromise: Promise<Paddle | undefined> | null = null;

export function usePaddle() {
  const [paddle, setPaddle] = useState<Paddle | null>(null);

  useEffect(() => {
    if (!token) return;
    paddlePromise ??= initializePaddle({ token, environment });
    let active = true;
    paddlePromise.then((instance) => {
      if (active && instance) setPaddle(instance);
    });
    return () => {
      active = false;
    };
  }, []);

  return paddle;
}
