import { supabase } from "./supabase";

export type UserPermissions = {
  can_view_dashboard: boolean;
  can_view_orders: boolean;
  can_create_orders: boolean;
  can_edit_orders: boolean;
  can_delete_orders: boolean;
  can_view_products: boolean;
  can_manage_products: boolean;
  can_view_purchases: boolean;
  can_manage_purchases: boolean;
  can_view_customers: boolean;
  can_manage_customers: boolean;
  can_view_employees: boolean;
  can_manage_employees: boolean;
  can_view_reports: boolean;
  can_view_profit: boolean;
  can_manage_settings: boolean;
};

export async function getCurrentUserPermissions() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from("permissions")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (error) {
    console.error(error.message);
    return null;
  }

  return data as UserPermissions;
}

export function hasPermission(
  permissions: UserPermissions | null,
  key: keyof UserPermissions
) {
  if (!permissions) return false;
  return permissions[key] === true;
}