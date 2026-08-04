import { supabase } from "./supabase";

export async function getCurrentUserRole() {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    console.error("خطأ في جلب المستخدم:", authError.message);
    return null;
  }

  if (!user) return null;

  const { data, error } = await supabase
    .from("user_profiles")
    .select("role,is_active,branch_id,access_all_branches")
    .eq("id", user.id)
    .single();

  if (error) {
    console.error("خطأ في جلب بيانات المستخدم:", error.message);
    return null;
  }

  return {
    role: String(data.role || "employee").trim().toLowerCase(),
    is_active: Boolean(data.is_active),
    branch_id: data.branch_id ? String(data.branch_id) : null,
    access_all_branches: Boolean(data.access_all_branches),
  };
}

export function isOwner(role: string) {
  return role?.trim().toLowerCase() === "owner";
}

export function isManager(role: string) {
  return role?.trim().toLowerCase() === "manager";
}

export function isEmployee(role: string) {
  return role?.trim().toLowerCase() === "employee";
}

export function isAccountant(role: string) {
  return role?.trim().toLowerCase() === "accountant";
}