import { supabase } from "./supabase";

export type UserProfile = {
  id: string;
  full_name: string | null;
  username: string | null;
  email: string | null;
  is_owner: boolean;
  is_active: boolean;
  role_id?: string | null;
  branch_id?: string | null;
  roles: { name: string } | null;
  branches: { name: string } | null;
};

export type Role = {
  id: string;
  name: string;
};

export type Branch = {
  id: string;
  name: string;
};

export type AppPermission = {
  id: string;
  code: string;
  name: string;
  group_name: string;
};

export type UpdateUserInput = {
  id: string;
  fullName: string;
  username: string;
  email: string;
  roleId: string;
  branchId: string;
  isActive: boolean;
};

export type UserPermissionOverride = {
  permission_id: string;
  allowed: boolean;
};

export type SaveUserPermissionOverrideInput = {
  permissionId: string;
  allowed: boolean;
};

export async function getUsers() {
  const { data, error } = await supabase
    .from("user_profiles")
    .select(`
      id,
      full_name,
      username,
      email,
      is_owner,
      is_active,
      role_id,
      branch_id,
      roles:role_id (
        name
      ),
      branches:branch_id (
        name
      )
    `)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data || []).map((user: any) => ({
    ...user,
    roles: Array.isArray(user.roles) ? user.roles[0] ?? null : user.roles,
    branches: Array.isArray(user.branches)
      ? user.branches[0] ?? null
      : user.branches,
  })) as UserProfile[];
}

export async function getRoles() {
  const { data, error } = await supabase
    .from("roles")
    .select("id, name")
    .order("name", { ascending: true });

  if (error) throw error;

  return (data || []) as Role[];
}

export async function getBranches() {
  const { data, error } = await supabase
    .from("branches")
    .select("id, name")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) throw error;

  return (data || []) as Branch[];
}

export async function getAppPermissions() {
  const { data, error } = await supabase
    .from("app_permissions")
    .select("id, code, name, group_name")
    .order("group_name", { ascending: true });

  if (error) throw error;

  return (data || []) as AppPermission[];
}

export async function getRolePermissionIds(roleId: string) {
  const { data, error } = await supabase
    .from("role_permissions")
    .select("permission_id")
    .eq("role_id", roleId);

  if (error) throw error;

  return (data || []).map((item) => item.permission_id as string);
}

export async function saveRolePermissions(
  roleId: string,
  permissionIds: string[]
) {
  const { error: deleteError } = await supabase
    .from("role_permissions")
    .delete()
    .eq("role_id", roleId);

  if (deleteError) throw deleteError;

  if (permissionIds.length === 0) return;

  const rows = permissionIds.map((permissionId) => ({
    role_id: roleId,
    permission_id: permissionId,
  }));

  const { error: insertError } = await supabase
    .from("role_permissions")
    .insert(rows);

  if (insertError) throw insertError;
}

export async function updateUserProfile(input: UpdateUserInput) {
  const { error } = await supabase
    .from("user_profiles")
    .update({
      full_name: input.fullName,
      username: input.username,
      email: input.email,
      role_id: input.roleId,
      branch_id: input.branchId,
      is_active: input.isActive,
    })
    .eq("id", input.id);

  if (error) throw error;
}

export async function toggleUserStatus(user: UserProfile) {
  if (user.is_owner) {
    throw new Error("لا يمكن تعطيل حساب المالك");
  }

  const { error } = await supabase
    .from("user_profiles")
    .update({ is_active: !user.is_active })
    .eq("id", user.id);

  if (error) throw error;
}

export async function getUserPermissionOverrides(userId: string) {
  const { data, error } = await supabase
    .from("user_permission_overrides")
    .select("permission_id, allowed")
    .eq("user_id", userId);

  if (error) throw error;

  return (data || []) as UserPermissionOverride[];
}

export async function saveUserPermissionOverrides(
  userId: string,
  overrides: SaveUserPermissionOverrideInput[]
) {
  const { error: deleteError } = await supabase
    .from("user_permission_overrides")
    .delete()
    .eq("user_id", userId);

  if (deleteError) throw deleteError;

  if (overrides.length === 0) return;

  const rows = overrides.map((override) => ({
    user_id: userId,
    permission_id: override.permissionId,
    allowed: override.allowed,
  }));

  const { error: insertError } = await supabase
    .from("user_permission_overrides")
    .insert(rows);

  if (insertError) throw insertError;
}
