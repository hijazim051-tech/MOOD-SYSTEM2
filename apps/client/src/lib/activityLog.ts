import { supabase } from "./supabase";

export type ActivityAction =
  | "create"
  | "update"
  | "delete"
  | "login"
  | "logout"
  | "print"
  | "export"
  | "status_change"
  | "payment"
  | "stock_change"
  | string;

type LogActivityInput = {
  action: ActivityAction;
  entityType: string;
  entityId?: string | number | null;
  entityLabel?: string;
  pageName?: string;
  description?: string;
  oldData?: unknown;
  newData?: unknown;
  metadata?: Record<string, unknown>;
  notifyOwner?: boolean;
};

export async function logActivity(input: LogActivityInput) {
  let resolvedMetadata: Record<string, unknown> = { ...(input.metadata || {}) };

  try {
    if (!resolvedMetadata.branch_id && !resolvedMetadata.branchId) {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;
      if (userId) {
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("branch_id")
          .eq("id", userId)
          .maybeSingle();
        if (profile?.branch_id) resolvedMetadata.branch_id = String(profile.branch_id);
      }
    }
  } catch (error) {
    console.warn("تعذر تحديد فرع سجل العملية:", error);
  }

  const basePayload = {
    p_action: input.action,
    p_entity_type: input.entityType,
    p_entity_id:
      input.entityId === null || input.entityId === undefined
        ? ""
        : String(input.entityId),
    p_entity_label: input.entityLabel || "",
    p_page_name: input.pageName || "",
    p_description: input.description || "",
    p_old_data: input.oldData ?? null,
    p_new_data: input.newData ?? null,
    p_metadata: resolvedMetadata,
  };

  const notifyOwner = input.notifyOwner ?? true;

  // النسخ الجديدة من دالة log_activity تقبل p_notify_owner.
  // لو قاعدة البيانات ما زالت على النسخة القديمة، نعيد المحاولة بالتوقيع القديم
  // ثم ننشئ تنبيه المالك مباشرة حتى لا يتوقف حفظ العملية.
  const { error } = await supabase.rpc("log_activity", {
    ...basePayload,
    p_notify_owner: notifyOwner,
  });

  if (!error) return;

  const { error: legacyError } = await supabase.rpc(
    "log_activity",
    basePayload
  );

  if (legacyError) {
    console.error("Activity log error:", legacyError.message);
    return;
  }

  if (!notifyOwner) return;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error: notificationError } = await supabase
    .from("owner_notifications")
    .insert({
      notification_type: String(input.action || "info"),
      title: input.entityLabel
        ? `${input.entityLabel} — حركة جديدة`
        : "حركة جديدة في المنظومة",
      message:
        input.description ||
        `تم تنفيذ عملية ${input.action} في ${input.pageName || input.entityType}`,
      entity_table: input.entityType || null,
      entity_id:
        input.entityId === null || input.entityId === undefined
          ? null
          : String(input.entityId),
      created_by: user?.id || null,
    });

  if (notificationError) {
    console.error("Owner notification error:", notificationError.message);
  }
}
