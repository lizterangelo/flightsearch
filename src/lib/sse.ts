import type { StreamEvent } from "./types";

// TextEncoder is stateless — share one across all events/streams.
const encoder = new TextEncoder();

/** Server side: encode one event for a text/event-stream response. */
export function encodeEvent(event: StreamEvent): Uint8Array {
  return encoder.encode(
    `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
  );
}

/**
 * Client side: consume a fetch Response body as a stream of SSEEvents.
 * Minimal SSE parsing — we only emit `event:`/`data:` pairs ourselves.
 */
export async function* parseSSEStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<StreamEvent> {
  // TS lib typing quirk: TextDecoderStream's writable side is BufferSource,
  // which doesn't structurally match ReadableStream<Uint8Array>.
  const reader = body
    .pipeThrough(
      new TextDecoderStream() as unknown as ReadableWritablePair<
        string,
        Uint8Array
      >,
    )
    .getReader();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += value;
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const chunk = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const dataLine = chunk
          .split("\n")
          .find((line) => line.startsWith("data: "));
        if (!dataLine) continue;
        try {
          yield JSON.parse(dataLine.slice(6)) as StreamEvent;
        } catch {
          // Malformed frame — skip rather than kill the stream.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
