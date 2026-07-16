import { bootstrapApp } from "@/lib/bootstrap";
import {
  getWatcherSnapshot,
  subscribePreorders,
} from "@/lib/watcher/preorderWatcher";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  await bootstrapApp();

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const snapshot = await getWatcherSnapshot();
      send({ type: "snapshot", ...snapshot });

      unsubscribe = subscribePreorders((payload) => send(payload));

      heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`: ping\n\n`));
      }, 15000);
    },
    cancel() {
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
