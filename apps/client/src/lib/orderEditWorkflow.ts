import { supabase } from "./supabase";

export async function reopenOrder(orderId: number, reason: string) {
  const cleanReason = reason.trim();

  if (!cleanReason) {
    throw new Error("سبب إعادة فتح الطلب مطلوب");
  }

  const { error } = await supabase.rpc("reopen_locked_order", {
    p_order_id: orderId,
    p_reason: cleanReason,
  });

  if (error) throw error;
}

export async function resetOrderPackagingForEdit(orderId: number) {
  const { error } = await supabase.rpc(
    "reset_order_packaging_for_edit",
    { p_order_id: orderId }
  );

  if (error) throw error;
}

export async function lockDeliveredOrder(orderId: number) {
  const { error } = await supabase.rpc("lock_delivered_order", {
    p_order_id: orderId,
  });

  if (error) throw error;
}
