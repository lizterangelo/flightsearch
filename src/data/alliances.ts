/** Airline alliance membership for the Airlines filter's ALLIANCE section. */

export type Alliance = "Star Alliance" | "SkyTeam" | "oneworld";

export const ALLIANCES: Record<Alliance, string[]> = {
  "Star Alliance": [
    "AC", "AI", "NH", "OZ", "OS", "AV", "SN", "CM", "OU", "MS", "ET", "BR",
    "LO", "LH", "SK", "ZH", "SQ", "SA", "LX", "TP", "TG", "TK", "UA",
  ],
  SkyTeam: [
    "AR", "AM", "UX", "AF", "CI", "MU", "DL", "GA", "KQ", "KL", "KE", "ME",
    "SV", "SK2", "RO", "VN", "VS", "MF",
  ],
  oneworld: [
    "AS", "AA", "BA", "CX", "FJ", "AY", "IB", "JL", "MH", "QF", "QR", "AT",
    "RJ", "UL", "WY",
  ],
};

const byCarrier = new Map<string, Alliance>();
for (const [alliance, carriers] of Object.entries(ALLIANCES)) {
  for (const code of carriers) byCarrier.set(code, alliance as Alliance);
}

export function allianceOf(carrierCode: string): Alliance | null {
  return byCarrier.get(carrierCode.toUpperCase()) ?? null;
}
