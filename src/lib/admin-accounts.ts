// Shared validation and provisioning workflow. No browser-accessible secret values.
export const ADMIN_LIMIT = 5;
export type AdminDraft = { name: string; email: string; password: string };
export type ManagedAdmin = { id: string; name: string; email: string; createdAt: string; suspended: boolean };
export type AdminList = { limit: number; admins: ManagedAdmin[] };
export type RpcClient = { rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }> };
export class AdminAccountError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function accountId(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new AdminAccountError(400, "Invalid account ID.");
  return value;
}
export function adminEmail(value: unknown): string {
  if (typeof value !== "string" || value.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) throw new AdminAccountError(400, "Enter a valid email address.");
  return value.trim().toLowerCase();
}
export function adminDraft(value: unknown): AdminDraft {
  if (!value || typeof value !== "object") throw new AdminAccountError(400, "Invalid account details.");
  const input = value as Record<string, unknown>;
  const email = adminEmail(input.email);
  if (typeof input.name !== "string" || input.name.trim().length < 2 || input.name.trim().length > 100) throw new AdminAccountError(400, "Name must be 2 to 100 characters.");
  if (typeof input.password !== "string" || input.password.length < 12 || input.password.length > 128) throw new AdminAccountError(400, "Admin passwords must be 12 to 128 characters.");
  return { name: input.name.trim(), email, password: input.password };
}
export function requireSameOrigin(request: Request, configuredOrigin?: string) {
  const expected = new URL(configuredOrigin || request.url).origin;
  if (request.headers.get("Origin") !== expected) throw new AdminAccountError(403, "This request must come from the FindBack website.");
}
export async function boundedJson(request: Request): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("Content-Type") || "")) throw new AdminAccountError(415, "Send account details as JSON.");
  if (Number(request.headers.get("Content-Length")) > 4096) throw new AdminAccountError(413, "Account details are too large.");
  const reader = request.body?.getReader();
  if (!reader) throw new AdminAccountError(400, "Account details are required.");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 4096) { await reader.cancel(); throw new AdminAccountError(413, "Account details are too large."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new AdminAccountError(400, "Invalid account details."); }
}
function rpcFailure(error: { code?: string; message?: string }): never {
  const message = error.message || "";
  if (error.code === "PGRST202" || error.code === "42883") throw new AdminAccountError(503, "Admin account management needs its database migration.");
  if (/At most five/.test(message)) throw new AdminAccountError(409, "All five Admin slots are occupied or being created. Remove an Admin or try again shortly.");
  if (/already has an account|duplicate key/.test(message) || error.code === "23505") throw new AdminAccountError(409, "This email already has an account or an Admin request in progress. Use a new email.");
  if (/last Admin|at least one active Admin/.test(message)) throw new AdminAccountError(409, "Keep at least one active Admin. This Admin cannot be removed yet.");
  if (/Admin not found/.test(message)) throw new AdminAccountError(404, "This account is no longer an Admin.");
  if (/Admin required|permission denied/.test(message)) throw new AdminAccountError(403, "Active Admin access is required.");
  throw new AdminAccountError(503, "Admin account management is temporarily unavailable. Refresh the Admin list before trying again.");
}
export async function adminRpc(client: RpcClient, name: string, args?: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await client.rpc(name, args);
  if (error) rpcFailure(error);
  return data;
}
export async function requireActiveAdmin(client: RpcClient) {
  // Neither user-editable metadata nor an ID supplied by the browser grants a role.
  if (await adminRpc(client, "is_admin") !== true || await adminRpc(client, "is_active_member") !== true) throw new AdminAccountError(403, "Active Admin access is required.");
}
export async function provisionAdmin(client: RpcClient, service: RpcClient, draft: AdminDraft, createUser: (id: string, draft: AdminDraft) => Promise<{ id?: string; error: boolean }>) {
  const reservation = await adminRpc(client, "reserve_admin_account", { p_email: draft.email }) as { user_id?: unknown } | null;
  const id = accountId(reservation?.user_id);
  try {
    const result = await createUser(id, draft);
    if (result.error || result.id !== id) throw new AdminAccountError(503, "Account creation could not be confirmed. Check the Admin list before retrying; an existing account will never have its password replaced here.");
    if (await adminRpc(service, "admin_account_provisioned", { p_user_id: id }) !== true) throw new AdminAccountError(409, "The account was created but its Admin access has changed. Refresh the Admin list.");
    return { id };
  } finally {
    // The Auth trigger atomically transfers a live reservation to a role. On failure,
    // release only this actor's reservation; never delete or reset an existing account.
    try { await client.rpc("cancel_admin_reservation", { p_user_id: id }); } catch { /* Expires automatically if the network is unavailable. */ }
  }
}
export function adminSecret(env: Record<string, string | undefined>): string {
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (/^sb_secret_[A-Za-z0-9_-]+$/.test(key)) return key;
  try {
    const payload = JSON.parse(atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (key.split(".").length === 3 && payload.role === "service_role") return key;
  } catch { /* Public, malformed and missing keys are rejected below. */ }
  throw new AdminAccountError(503, "Admin creation requires the server-only Supabase secret key. Configure it in the server environment.");
}
