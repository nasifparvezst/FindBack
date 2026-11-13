import type { Message, Notification } from "./types";

export const CHAT_PAGE_SIZE = 50;
export type MessageCursor = Pick<Message, "createdAt" | "id">;
export type MessagePage = { messages: Message[]; hasMore: boolean };
export type ChatStatus = "connecting" | "live" | "retrying";

// Preserve the server's microseconds and use the ID to break timestamp ties.
export function compareMessages(a: MessageCursor, b: MessageCursor): number {
  const timestamp = (value: string) => value.replace(/(?:Z|\+00:00)$/, "").padEnd(26, "0");
  return timestamp(a.createdAt).localeCompare(timestamp(b.createdAt)) || a.id.localeCompare(b.id);
}

export function mergeMessages(existing: Message[], incoming: Message[]): Message[] {
  return [...new Map([...existing, ...incoming].map((message) => [message.id, message])).values()].sort(compareMessages);
}

export function messagePage(messages: Message[], before?: MessageCursor, after?: MessageCursor): MessagePage {
  const sorted = messages.filter((message) => (!before || compareMessages(message, before) < 0) && (!after || compareMessages(message, after) > 0)).sort(compareMessages);
  return { messages: after ? sorted.slice(0, CHAT_PAGE_SIZE) : sorted.slice(-CHAT_PAGE_SIZE), hasMore: sorted.length > CHAT_PAGE_SIZE };
}

export function notificationSummary(notifications: Notification[], userId?: string) {
  const unreadClaims: Record<string, number> = {};
  let unreadNotifications = 0;
  for (const notice of notifications) {
    if (notice.userId !== userId || notice.read) continue;
    unreadNotifications++;
    if (notice.title === "New message" && notice.href.startsWith("/claims/")) {
      const id = notice.href.slice("/claims/".length);
      unreadClaims[id] = (unreadClaims[id] || 0) + 1;
    }
  }
  return { unreadNotifications, unreadClaims };
}

// One request in flight, with one trailing refresh for any events received during it.
export function createRefreshQueue(task: () => Promise<void>) {
  let pending: Promise<void> | null = null;
  let again = false;
  return () => {
    again = true;
    if (!pending) {
      pending = (async () => {
        do { again = false; await task(); } while (again);
      })().finally(() => { pending = null; });
    }
    return pending;
  };
}
