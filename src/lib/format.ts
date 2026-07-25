/** Display formatting for ISO-local times and durations. */

export function formatTime(isoLocal: string): string {
  const hm = isoLocal.slice(11, 16);
  const [h, m] = hm.split(":").map(Number);
  if (Number.isNaN(h)) return hm;
  const period = h < 12 ? "AM" : "PM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}
