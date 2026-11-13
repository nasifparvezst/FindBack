import type { UserProfile } from "./types";

export const DEMO_GUEST = "__findback_guest__";
export function restoreDemoUser(saved: string | null, defaultId: string, users: Pick<UserProfile, "id" | "suspended">[]): string | null {
  if (saved === DEMO_GUEST) return null;
  const selected = saved === null ? defaultId : saved;
  return users.some((user) => user.id === selected && !user.suspended) ? selected : null;
}
