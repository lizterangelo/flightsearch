import { mkdirSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { Stagehand } from "@browserbasehq/stagehand";
import type { Page } from "@browserbasehq/stagehand";

/**
 * Lazy singleton pool of at most 2 local-Chrome Stagehand instances shared by
 * all agent targets. Instances launch on first checkout, callers queue when
 * both are busy, and 5 idle minutes with zero checkouts closes everything.
 */

const MAX_INSTANCES = 2;
const IDLE_SHUTDOWN_MS = 5 * 60 * 1000;

interface Slot {
  init: Promise<Stagehand> | null;
  busy: boolean;
}

const slots: Slot[] = Array.from({ length: MAX_INSTANCES }, () => ({
  init: null,
  busy: false,
}));
const waiters: Array<(slot: Slot) => void> = [];
let idleTimer: ReturnType<typeof setTimeout> | null = null;

function buildStagehand(slotIndex: number): Stagehand {
  // Each pool slot needs its OWN profile dir: Chromium's ProcessSingleton lock
  // forbids two concurrent browsers on one userDataDir, so a shared dir would
  // make the second slot's launch fail whenever both run at once. Stagehand
  // also opens log files inside the dir without creating it first.
  const userDataDir = path.join(
    process.cwd(),
    ".cache",
    `agent-profile-${slotIndex}`,
  );
  mkdirSync(userDataDir, { recursive: true });
  return new Stagehand({
    env: "LOCAL",
    // Gemini via GOOGLE_GENERATIVE_AI_API_KEY, read from env by Stagehand's
    // bundled Vercel AI SDK provider.
    model: process.env.AGENT_MODEL || "google/gemini-2.5-flash",
    localBrowserLaunchOptions: {
      executablePath:
        process.env.CHROME_PATH ||
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      headless: process.env.AGENT_HEADLESS === "true",
      userDataDir,
    },
    disablePino: true,
    verbose: 0,
  });
}

function ensureLaunched(slot: Slot): Promise<Stagehand> {
  if (!slot.init) {
    const slotIndex = slots.indexOf(slot);
    slot.init = (async () => {
      const sh = buildStagehand(slotIndex);
      await sh.init();
      return sh;
    })().catch((err) => {
      slot.init = null; // failed launch must not poison the slot
      throw err;
    });
  }
  return slot.init;
}

function acquire(): Promise<Slot> {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  const free = slots.find((s) => !s.busy);
  if (free) {
    free.busy = true;
    return Promise.resolve(free);
  }
  return new Promise((resolve) => waiters.push(resolve));
}

function release(slot: Slot): void {
  const next = waiters.shift();
  if (next) {
    next(slot); // hand off still-busy
    return;
  }
  slot.busy = false;
  if (slots.every((s) => !s.busy)) scheduleIdleShutdown();
}

function scheduleIdleShutdown(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    idleTimer = null;
    const closing = slots
      .filter((s) => !s.busy && s.init)
      .map((s) => {
        const init = s.init!;
        s.init = null;
        return init.then((sh) => sh.close()).catch(() => undefined);
      });
    void Promise.all(closing);
  }, IDLE_SHUTDOWN_MS);
  idleTimer.unref?.();
}

export async function withStagehandPage<T>(
  fn: (sh: Stagehand) => Promise<T>,
): Promise<T> {
  const slot = await acquire();
  try {
    const sh = await ensureLaunched(slot);
    return await fn(sh);
  } finally {
    release(slot);
  }
}

/** The pool instance's current tab (opening one if the browser has none). */
export async function agentPage(sh: Stagehand): Promise<Page> {
  return sh.context.activePage() ?? sh.context.pages()[0] ?? (await sh.context.newPage());
}

/** Best-effort debug screenshot for a failed target run; never throws. */
export async function captureFailureScreenshot(
  sh: Stagehand,
  targetName: string,
): Promise<void> {
  try {
    const page = sh.context.activePage() ?? sh.context.pages()[0];
    if (!page) return;
    const dir = path.join(process.cwd(), ".cache", "agent-debug");
    await mkdir(dir, { recursive: true });
    await page.screenshot({
      path: path.join(dir, `${targetName}-${Date.now()}.png`),
    });
  } catch {
    // debug-only; swallow
  }
}

export function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
}

/** Abort-aware wait between agent steps. */
export async function agentSleep(ms: number, signal: AbortSignal): Promise<void> {
  assertNotAborted(signal);
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
