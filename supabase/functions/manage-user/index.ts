import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Payload = {
  action: "create" | "update" | "password";
  userId?: string;
  fullName?: string;
  username?: string;
  password?: string;
  roleId?: string;
  branchId?: string;
  isActive?: boolean;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: callerData, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !callerData.user) throw new Error("غير مصرح");

    const { data: callerProfile, error: profileError } = await admin
      .from("user_profiles")
      .select("role,is_owner,role_id,roles:role_id(name)")
      .eq("id", callerData.user.id)
      .single();
    if (profileError) throw profileError;

    const roleRelation: any = Array.isArray((callerProfile as any).roles)
      ? (callerProfile as any).roles[0]
      : (callerProfile as any).roles;
    const callerRole = String(roleRelation?.name || (callerProfile as any).role || "").toLowerCase();
    if (!(callerProfile as any).is_owner && !["owner", "admin"].includes(callerRole)) {
      throw new Error("هذه العملية للمالك أو المدير العام فقط");
    }

    const body = (await req.json()) as Payload;
    const username = String(body.username || "").trim().toLowerCase();
    const loginEmail = username ? `${username}@mood.local` : "";

    if (body.action === "create") {
      if (!body.fullName?.trim() || !username || !body.password || !body.roleId || !body.branchId) {
        throw new Error("بيانات المستخدم ناقصة");
      }
      if (body.password.length < 6) throw new Error("كلمة المرور لازم تكون 6 أحرف أو أكثر");

      const { data: roleRow, error: roleError } = await admin.from("roles").select("name").eq("id", body.roleId).single();
      if (roleError) throw roleError;

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: loginEmail,
        password: body.password,
        email_confirm: true,
        user_metadata: { username, full_name: body.fullName.trim() },
      });
      if (createError || !created.user) throw createError || new Error("تعذر إنشاء الحساب");

      const { error: insertError } = await admin.from("user_profiles").upsert({
        id: created.user.id,
        full_name: body.fullName.trim(),
        username,
        email: loginEmail,
        role: String(roleRow.name || "employee").toLowerCase(),
        role_id: body.roleId,
        branch_id: body.branchId,
        is_active: body.isActive !== false,
        is_owner: String(roleRow.name || "").toLowerCase() === "owner",
      });
      if (insertError) {
        await admin.auth.admin.deleteUser(created.user.id);
        throw insertError;
      }
      return json({ success: true, userId: created.user.id });
    }

    if (!body.userId) throw new Error("معرف المستخدم مطلوب");

    if (body.action === "password") {
      if (!body.password || body.password.length < 6) throw new Error("كلمة المرور لازم تكون 6 أحرف أو أكثر");
      const { error } = await admin.auth.admin.updateUserById(body.userId, { password: body.password });
      if (error) throw error;
      return json({ success: true });
    }

    if (body.action === "update") {
      if (!body.fullName?.trim() || !username || !body.roleId || !body.branchId) throw new Error("بيانات المستخدم ناقصة");
      const { data: roleRow, error: roleError } = await admin.from("roles").select("name").eq("id", body.roleId).single();
      if (roleError) throw roleError;

      const { error: authUpdateError } = await admin.auth.admin.updateUserById(body.userId, {
        email: loginEmail,
        email_confirm: true,
        user_metadata: { username, full_name: body.fullName.trim() },
      });
      if (authUpdateError) throw authUpdateError;

      const { error: updateError } = await admin.from("user_profiles").update({
        full_name: body.fullName.trim(),
        username,
        email: loginEmail,
        role: String(roleRow.name || "employee").toLowerCase(),
        role_id: body.roleId,
        branch_id: body.branchId,
        is_active: body.isActive !== false,
      }).eq("id", body.userId);
      if (updateError) throw updateError;
      return json({ success: true });
    }

    throw new Error("عملية غير معروفة");
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : "حدث خطأ" }, 400);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}
