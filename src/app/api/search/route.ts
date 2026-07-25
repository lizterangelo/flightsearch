import type { NextRequest } from "next/server";
import { runSearch } from "@/lib/orchestrator";
import { encodeEvent } from "@/lib/sse";
import { parseSearchParams } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/search?origin=JFK&destination=MIA&departDate=...&...
 * Streams SSE events: providers → results/provider_done per source →
 * baseline → done.
 */
export async function GET(req: NextRequest): Promise<Response> {
  let params;
  try {
    params = parseSearchParams(req.nextUrl.searchParams);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Invalid search" },
      { status: 400 },
    );
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit = (event: Parameters<typeof encodeEvent>[0]) => {
        if (closed) return;
        try {
          controller.enqueue(encodeEvent(event));
        } catch {
          closed = true;
        }
      };

      try {
        await runSearch(params, emit, req.signal);
      } catch (err) {
        // The orchestrator shouldn't throw, but the stream must still close.
        console.error("[search] orchestrator crashed:", err);
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          // Already closed (client disconnect).
        }
      }
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
