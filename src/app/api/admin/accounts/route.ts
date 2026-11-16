import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { accountId, adminDraft, AdminAccountError, adminRpc, boundedJson, provisionAdmin, requireActiveAdmin, requireSameOrigin } from "@/lib/admin-accounts";
import { preventSessionCaching } from "@/lib/http-security";

export const dynamic = "force-dynamic";
function json(value: unknown, status = 200) {
  const headers = new Headers(); preventSessionCaching(headers);
  return Response.json(value, { status, headers });
}
async function run(request: Request, operation: "list" | "create" | "remove") {
  try {
    if (operation !== "list") requireSameOrigin(request, process.env.APP_ORIGIN);
    const client = await createSupabaseServerClient();
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) throw new AdminAccountError(401, "Sign in as an Admin to continue.");
    await requireActiveAdmin(client);
    if (operation === "list") return json(await adminRpc(client, "list_managed_admins"));
    const body = await boundedJson(request);
    if (operation === "remove") {
      const id = accountId(body && typeof body === "object" ? (body as Record<string, unknown>).id : null);
      await adminRpc(client, "remove_admin_account", { p_user_id: id });
      return json({ removed: id });
    }
    const draft = adminDraft(body);
    const service = createSupabaseAdminClient(); // Fail before reserving a slot if the server key is missing.
    const result = await provisionAdmin(client, service, draft, async (id, input) => {
      const { data, error } = await service.auth.admin.createUser({ id, email: input.email, password: input.password,
        email_confirm: true, user_metadata: { full_name: input.name }, app_metadata: { findback_admin_provision: true } });
      return { id: data.user?.id, error: Boolean(error), code: error?.code, status: error?.status };
    });
    return json(result, 201);
  } catch (error) {
    return error instanceof AdminAccountError ? json({ error: error.message }, error.status) : json({ error: "Admin account management is temporarily unavailable. Refresh the Admin list before retrying." }, 503);
  }
}
export async function GET(request: Request) { return run(request, "list"); }
export async function POST(request: Request) { return run(request, "create"); }
export async function DELETE(request: Request) { return run(request, "remove"); }
