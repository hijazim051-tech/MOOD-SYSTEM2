import { supabase } from "./supabase";

export const NOTIFICATION_EVENTS = [
  ["order.new", "طلب جديد"],
  ["order.packaging", "طلب بانتظار التغليف"],
  ["order.ready", "الطلب أصبح جاهزًا"],
  ["order.delivery", "خروج الطلب للتوصيل"],
  ["order.delivered", "تسليم الطلب"],
  ["order.edited", "تعديل أو حذف طلب"],
  ["driver.money", "مبالغ مع المندوبين"],
  ["stock.low", "انخفاض المخزون"],
  ["product.stagnant", "منتج راكد"],
  ["profit.lost", "أرباح مفقودة"],
  ["attendance.late", "تأخر موظف"],
  ["attendance.outside", "حضور خارج نطاق الفرع"],
  ["supplier.price_change", "تغير سعر مورد"],
  ["system.anomaly", "تنبيه غير طبيعي"],
] as const;

export type NotificationEventKey = (typeof NOTIFICATION_EVENTS)[number][0];
export type UserNotificationPreference = {
  event_key: string;
  enabled: boolean;
  in_app: boolean;
  push_enabled: boolean;
  branch_id: string | null;
};

export async function getUserNotificationPreferences(userId: string) {
  const { data, error } = await supabase
    .from("user_notification_preferences")
    .select("event_key,enabled,in_app,push_enabled,branch_id")
    .eq("user_id", userId);
  if (error) throw error;
  return (data || []) as UserNotificationPreference[];
}

export async function saveUserNotificationPreferences(
  userId: string,
  preferences: UserNotificationPreference[]
) {
  const rows = preferences.map((item) => ({
    user_id: userId,
    event_key: item.event_key,
    enabled: item.enabled,
    in_app: item.in_app,
    push_enabled: item.push_enabled,
    branch_id: item.branch_id || null,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase
    .from("user_notification_preferences")
    .upsert(rows, { onConflict: "user_id,event_key" });
  if (error) throw error;
}

export function preferenceMap(items: UserNotificationPreference[]) {
  return new Map(items.map((item) => [item.event_key, item]));
}
