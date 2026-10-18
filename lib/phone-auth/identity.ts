export type PhonePurpose = "login" | "bind";

/** Only mainland mobile numbers; never guess a country from an arbitrary prefix. */
export function normalizeMainlandPhone(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 32) return null;
  const compact = value.trim().replace(/[\s()-]/g, "");
  const local = compact.startsWith("+86") ? compact.slice(3) : compact;
  return /^1[3-9]\d{9}$/.test(local) ? `+86${local}` : null;
}

export function maskPhone(phone: string): string {
  return `+86 ${phone.slice(3, 6)}****${phone.slice(-4)}`;
}

export function isPhonePurpose(value: unknown): value is PhonePurpose {
  return value === "login" || value === "bind";
}
