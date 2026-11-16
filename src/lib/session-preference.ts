export const REMEMBER_COOKIE = "findback_remember";
export const REMEMBER_MAX_AGE = 60 * 60 * 24 * 400;

export function remembersSession(value?: string): boolean { return value !== "0"; }

/** Keep deletion cookies intact; unchecked Remember me produces browser-session cookies. */
export function sessionCookieOptions<T extends { maxAge?: number; expires?: Date }>(options: T, remember: boolean): T {
  if (remember || (options.maxAge !== undefined && options.maxAge <= 0)) return options;
  const session = { ...options };
  delete session.maxAge; delete session.expires;
  return session;
}
