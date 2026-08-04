import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type OwnerNotification = {
  id: number | string;
  notification_type: string | null;
  title: string | null;
  message: string | null;
  entity_table: string | null;
  entity_id: string | null;
  is_read: boolean | null;
  created_at: string | null;
  created_by: string | null;
};

type NotificationFilter = "all" | "unread" | "read";

const notificationTypeLabels: Record<string, string> = {
  packaging_over_budget: "تجاوز ميزانية التغليف",
  create: "إضافة جديدة",
  update: "تعديل",
  delete: "حذف",
  restore: "استرجاع",
  return: "مرتجع",
  stock_low: "نقص مخزون",
  status_change: "تغيير حالة",
  order_ready: "طلب جاهز",
  user_change: "تعديل مستخدم",
};

export default function OwnerNotifications() {
  const [notifications, setNotifications] = useState<OwnerNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | number | null>(null);
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    void loadNotifications();

    const channel = supabase
      .channel("owner-notifications-live")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "owner_notifications",
        },
        () => {
          void loadNotifications(false);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.is_read).length,
    [notifications],
  );

  const filteredNotifications = useMemo(() => {
    const query = search.trim().toLowerCase();

    return notifications.filter((notification) => {
      if (filter === "unread" && notification.is_read) return false;
      if (filter === "read" && !notification.is_read) return false;

      if (!query) return true;

      return [
        notification.title,
        notification.message,
        notification.notification_type,
        notification.entity_table,
        notification.entity_id,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [notifications, filter, search]);

  async function loadNotifications(showLoading = true) {
    if (showLoading) setLoading(true);

    try {
      const { data, error } = await supabase
        .from("owner_notifications")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      setNotifications((data || []) as OwnerNotification[]);
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  async function markAsRead(notification: OwnerNotification) {
    if (notification.is_read) return;

    setWorkingId(notification.id);

    try {
      const { error } = await supabase
        .from("owner_notifications")
        .update({ is_read: true })
        .eq("id", notification.id);

      if (error) throw error;

      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id ? { ...item, is_read: true } : item,
        ),
      );
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      setWorkingId(null);
    }
  }

  async function markAllAsRead() {
    if (unreadCount === 0) return;

    const confirmed = window.confirm(
      `هل تريد تعليم كل التنبيهات غير المقروءة وعددها ${unreadCount} كمقروءة؟`,
    );

    if (!confirmed) return;

    setWorkingId("all");

    try {
      const { error } = await supabase
        .from("owner_notifications")
        .update({ is_read: true })
        .eq("is_read", false);

      if (error) throw error;

      setNotifications((current) =>
        current.map((item) => ({ ...item, is_read: true })),
      );
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      setWorkingId(null);
    }
  }

  async function deleteNotification(notification: OwnerNotification) {
    const confirmed = window.confirm(
      `هل تريد حذف التنبيه "${notification.title || "بدون عنوان"}"؟`,
    );

    if (!confirmed) return;

    setWorkingId(notification.id);

    try {
      const { error } = await supabase
        .from("owner_notifications")
        .delete()
        .eq("id", notification.id);

      if (error) throw error;

      setNotifications((current) =>
        current.filter((item) => item.id !== notification.id),
      );
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      setWorkingId(null);
    }
  }

  async function deleteReadNotifications() {
    const readCount = notifications.filter((item) => item.is_read).length;

    if (readCount === 0) {
      alert("لا توجد تنبيهات مقروءة للحذف");
      return;
    }

    const confirmed = window.confirm(
      `هل تريد حذف كل التنبيهات المقروءة وعددها ${readCount}؟`,
    );

    if (!confirmed) return;

    setWorkingId("delete-read");

    try {
      const { error } = await supabase
        .from("owner_notifications")
        .delete()
        .eq("is_read", true);

      if (error) throw error;

      setNotifications((current) => current.filter((item) => !item.is_read));
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      setWorkingId(null);
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-2xl font-bold" dir="rtl">
        جاري تحميل تنبيهات المالك...
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-8" dir="rtl">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold md:text-4xl">تنبيهات المالك</h1>
          <p className="mt-2 text-gray-500">
            تابع التعديلات والتجاوزات والأحداث المهمة داخل المنظومة.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadNotifications()}
            className="rounded-xl border bg-white px-4 py-3 font-bold hover:bg-gray-50"
          >
            تحديث
          </button>

          <button
            type="button"
            onClick={() => void markAllAsRead()}
            disabled={unreadCount === 0 || workingId === "all"}
            className="rounded-xl bg-emerald-700 px-4 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {workingId === "all" ? "جاري الحفظ..." : "تعليم الكل كمقروء"}
          </button>

          <button
            type="button"
            onClick={() => void deleteReadNotifications()}
            disabled={workingId === "delete-read"}
            className="rounded-xl bg-red-600 px-4 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {workingId === "delete-read"
              ? "جاري الحذف..."
              : "حذف التنبيهات المقروءة"}
          </button>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard
          label="كل التنبيهات"
          value={notifications.length}
          active={filter === "all"}
          onClick={() => setFilter("all")}
          className="bg-slate-50 text-slate-700"
        />
        <StatCard
          label="غير المقروءة"
          value={unreadCount}
          active={filter === "unread"}
          onClick={() => setFilter("unread")}
          className="bg-red-50 text-red-700"
        />
        <StatCard
          label="المقروءة"
          value={notifications.length - unreadCount}
          active={filter === "read"}
          onClick={() => setFilter("read")}
          className="bg-emerald-50 text-emerald-700"
        />
      </section>

      <section className="rounded-2xl bg-white p-5 shadow">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="بحث في عنوان التنبيه أو الرسالة أو رقم الطلب"
          className="w-full rounded-xl border border-gray-200 bg-white p-3 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
        />
      </section>

      <section className="space-y-3">
        {filteredNotifications.map((notification) => {
          const isWorking = workingId === notification.id;
          const style = getNotificationStyle(notification.notification_type);

          return (
            <article
              key={notification.id}
              className={`rounded-2xl border p-5 shadow-sm transition ${
                notification.is_read
                  ? "border-gray-200 bg-white"
                  : "border-amber-200 bg-amber-50"
              }`}
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 gap-4">
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-xl ${style.iconClass}`}
                  >
                    {style.icon}
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-bold">
                        {notification.title || "تنبيه"}
                      </h2>

                      {!notification.is_read && (
                        <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">
                          جديد
                        </span>
                      )}

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${style.badgeClass}`}
                      >
                        {getNotificationTypeLabel(
                          notification.notification_type,
                        )}
                      </span>
                    </div>

                    {notification.message && (
                      <p className="mt-2 leading-7 text-gray-700">
                        {notification.message}
                      </p>
                    )}

                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-500">
                      <span>{formatDateTime(notification.created_at)}</span>

                      {notification.entity_table && (
                        <span>
                          المصدر: {getEntityLabel(notification.entity_table)}
                        </span>
                      )}

                      {notification.entity_id && (
                        <span>الرقم: {notification.entity_id}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  {!notification.is_read && (
                    <button
                      type="button"
                      onClick={() => void markAsRead(notification)}
                      disabled={isWorking}
                      className="rounded-xl bg-emerald-700 px-4 py-2 font-bold text-white disabled:opacity-40"
                    >
                      {isWorking ? "جاري..." : "تمت القراءة"}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => void deleteNotification(notification)}
                    disabled={isWorking}
                    className="rounded-xl border border-red-200 bg-white px-4 py-2 font-bold text-red-700 hover:bg-red-50 disabled:opacity-40"
                  >
                    حذف
                  </button>
                </div>
              </div>
            </article>
          );
        })}

        {filteredNotifications.length === 0 && (
          <div className="rounded-2xl bg-white p-12 text-center shadow">
            <p className="text-xl font-bold text-gray-700">
              لا توجد تنبيهات مطابقة
            </p>
            <p className="mt-2 text-gray-500">
              ستظهر هنا التنبيهات الجديدة فور تسجيلها في المنظومة.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  active,
  onClick,
  className,
}: {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
  className: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border p-4 text-right shadow-sm transition ${className} ${
        active ? "ring-2 ring-gray-400" : "hover:-translate-y-0.5"
      }`}
    >
      <p className="text-sm font-semibold">{label}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
    </button>
  );
}

function getNotificationTypeLabel(type: string | null) {
  const value = String(type || "").trim().toLowerCase();

  return notificationTypeLabels[value] || type || "تنبيه عام";
}

function getNotificationStyle(type: string | null) {
  const value = String(type || "").trim().toLowerCase();

  if (value.includes("delete")) {
    return {
      icon: "🗑️",
      iconClass: "bg-red-100",
      badgeClass: "bg-red-100 text-red-700",
    };
  }

  if (value.includes("budget") || value.includes("stock")) {
    return {
      icon: "⚠️",
      iconClass: "bg-amber-100",
      badgeClass: "bg-amber-100 text-amber-700",
    };
  }

  if (value.includes("ready") || value.includes("create")) {
    return {
      icon: "✅",
      iconClass: "bg-emerald-100",
      badgeClass: "bg-emerald-100 text-emerald-700",
    };
  }

  if (value.includes("return") || value.includes("restore")) {
    return {
      icon: "↩️",
      iconClass: "bg-purple-100",
      badgeClass: "bg-purple-100 text-purple-700",
    };
  }

  if (value.includes("update") || value.includes("status")) {
    return {
      icon: "✏️",
      iconClass: "bg-blue-100",
      badgeClass: "bg-blue-100 text-blue-700",
    };
  }

  return {
    icon: "🔔",
    iconClass: "bg-gray-100",
    badgeClass: "bg-gray-100 text-gray-700",
  };
}

function getEntityLabel(table: string) {
  const labels: Record<string, string> = {
    orders: "الطلبات",
    order_items: "بنود الطلب",
    products: "المنتجات",
    product_details: "تفاصيل المنتجات",
    users: "المستخدمون",
    user_profiles: "المستخدمون",
    expenses: "المصروفات",
    purchases: "المشتريات",
  };

  return labels[table] || table;
}

function formatDateTime(value: string | null) {
  if (!value) return "بدون تاريخ";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("ar-LY", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;

  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }

  return "حدث خطأ غير متوقع";
}