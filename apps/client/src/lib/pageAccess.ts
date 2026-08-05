import { supabase } from "./supabase";

export async function getCurrentUserPageAccess(role: string) {
  const normalized = String(role || "employee").toLowerCase();
  if (["owner", "admin"].includes(normalized)) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Set<string>();

  const [{ data: permissions }, { data: profile }] = await Promise.all([
    supabase.from("app_permissions").select("id,code").like("code", "page.%"),
    supabase.from("user_profiles").select("role_id").eq("id", user.id).maybeSingle(),
  ]);
  const rows = permissions || [];
  const ids = rows.map((x: any) => String(x.id));
  const [{ data: roleRows }, { data: overrides }] = await Promise.all([
    profile?.role_id
      ? supabase.from("role_permissions").select("permission_id").eq("role_id", profile.role_id).in("permission_id", ids)
      : Promise.resolve({ data: [] as any[] }),
    supabase.from("user_permission_overrides").select("permission_id,allowed").eq("user_id", user.id).in("permission_id", ids),
  ]);
  const allowed = new Set<string>((roleRows || []).map((x: any) => String(x.permission_id)));
  (overrides || []).forEach((x: any) => x.allowed ? allowed.add(String(x.permission_id)) : allowed.delete(String(x.permission_id)));
  return new Set(rows.filter((x: any) => allowed.has(String(x.id))).map((x: any) => String(x.code).replace(/^page\./, "")));
}
