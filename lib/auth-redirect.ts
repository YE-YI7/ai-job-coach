export function normalizeRedirectPath(path: string | null): string | null {
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.startsWith("/login") || path.includes('\\') || Array.from(path).some(char=>char.charCodeAt(0)<32)) {
    return null;
  }

  return path;
}

/** All identities enter the current workspace, never the retired welcome tour. */
export function postLoginTarget(path: string | null = null): string {
  const safe = normalizeRedirectPath(path);
  if (!safe) return "/cockpit";
  if (/^\/onboarding(?:[/?#]|$)/.test(safe)) {
    const nested = normalizeRedirectPath(new URL(safe, "https://yizhi.invalid").searchParams.get("redirect"));
    return nested && !/^\/onboarding(?:[/?#]|$)/.test(nested) ? nested : "/cockpit";
  }
  return safe;
}

export function readCookieValue(cookieHeader: string, name: string): string | null {
  for (const segment of cookieHeader.split(";")) {
    const separator = segment.indexOf("=");
    if (separator < 0 || segment.slice(0, separator).trim() !== name) continue;

    const rawValue = segment.slice(separator + 1).trim();
    try {
      return decodeURIComponent(rawValue);
    } catch {
      return null;
    }
  }

  return null;
}
