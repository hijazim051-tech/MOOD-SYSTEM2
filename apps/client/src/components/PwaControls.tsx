import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);

  const base64 = (value + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const raw = atob(base64);

  return Uint8Array.from(
    [...raw].map((character) => character.charCodeAt(0)),
  );
}

export default function PwaControls() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification === "undefined"
      ? "denied"
      : Notification.permission,
  );

  const [working, setWorking] = useState(false);
  const [testing, setTesting] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);

  useEffect(() => {
    function handleInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    }

    window.addEventListener(
      "beforeinstallprompt",
      handleInstallPrompt,
    );

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleInstallPrompt,
      );
    };
  }, []);

  useEffect(() => {
    void checkExistingSubscription();
  }, []);

  async function checkExistingSubscription() {
    if (
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription =
        await registration.pushManager.getSubscription();

      setIsSubscribed(Boolean(subscription));
    } catch (error) {
      console.error("Subscription check failed:", error);
    }
  }

  async function install() {
    if (!installPrompt) return;

    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  async function enable() {
    if (
      typeof Notification === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      alert("هذا الجهاز لا يدعم الإشعارات");
      return;
    }

    setWorking(true);

    try {
      const requestedPermission =
        await Notification.requestPermission();

      setPermission(requestedPermission);

      if (requestedPermission !== "granted") {
        throw new Error("لم يتم السماح بالإشعارات");
      }

      const vapidPublicKey = String(
        import.meta.env.VITE_VAPID_PUBLIC_KEY || "",
      )
        .replace(/["']/g, "")
        .replace(/\s+/g, "")
        .trim();

      if (!vapidPublicKey) {
        throw new Error(
          "مفتاح VAPID العام غير موجود في إعدادات Vercel",
        );
      }

      if (!/^[A-Za-z0-9_-]+$/.test(vapidPublicKey)) {
        throw new Error(
          "مفتاح VAPID العام مكتوب بطريقة غير صحيحة في Vercel",
        );
      }

      const registration = await navigator.serviceWorker.ready;

      let subscription =
        await registration.pushManager.getSubscription();

      /*
       * نلغي الاشتراك القديم قبل إنشاء اشتراك جديد.
       * هذا ضروري إذا تغيرت مفاتيح VAPID أو انحذف
       * السجل من جدول push_subscriptions.
       */
      if (subscription) {
        try {
          await subscription.unsubscribe();
        } catch (unsubscribeError) {
          console.warn(
            "Could not unsubscribe old push subscription:",
            unsubscribeError,
          );
        }
      }

      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey:
          urlBase64ToUint8Array(vapidPublicKey),
      });

      const subscriptionJson = subscription.toJSON();

      if (
        !subscriptionJson.endpoint ||
        !subscriptionJson.keys?.p256dh ||
        !subscriptionJson.keys?.auth
      ) {
        throw new Error("بيانات اشتراك الإشعارات غير مكتملة");
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) throw new Error("سجّل الدخول أولًا");

      const { error: saveError } = await supabase
        .from("push_subscriptions")
        .upsert(
          {
            user_id: user.id,
            endpoint: subscriptionJson.endpoint,
            p256dh: subscriptionJson.keys.p256dh,
            auth: subscriptionJson.keys.auth,
            user_agent: navigator.userAgent,
            is_active: true,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "endpoint",
          },
        );

      if (saveError) throw saveError;

      setIsSubscribed(true);

      alert("تم ربط هذا الجهاز بنظام الإشعارات بنجاح ✅");
    } catch (error) {
      console.error("Push notification error:", error);

      alert(
        error instanceof Error
          ? error.message
          : "تعذر تفعيل الإشعارات",
      );
    } finally {
      setWorking(false);
    }
  }

  async function sendTestPush() {
    setTesting(true);

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;
      if (!session) throw new Error("سجّل الدخول أولًا");

      const { data, error } = await supabase.functions.invoke(
        "send-push",
        {
          body: {
            title: "اختبار MOOD",
            message: "هذا إشعار تجريبي حقيقي",
            url: "/",
            tag: `mood-test-${Date.now()}`,
          },
        },
      );

      if (error) throw error;

      const errorDetails =
  Array.isArray(data?.errors) && data.errors.length > 0
    ? data.errors
        .map(
          (item: {
            status?: number;
            message?: string;
            body?: string;
          }) =>
            `الحالة: ${item.status ?? "غير معروفة"}\n` +
            `الرسالة: ${item.message ?? "بدون رسالة"}\n` +
            `التفاصيل: ${item.body ?? "لا توجد"}`,
        )
        .join("\n\n")
    : "لا توجد تفاصيل أخطاء";

alert(
  `تم تنفيذ الإرسال\n` +
    `الناجح: ${data?.sent ?? 0}\n` +
    `الفاشل: ${data?.failed ?? 0}\n\n` +
    errorDetails,
);
    } catch (error) {
      console.error("Test push error:", error);

      alert(
        error instanceof Error
          ? error.message
          : "فشل إرسال الإشعار التجريبي",
      );
    } finally {
      setTesting(false);
    }
  }

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      dir="rtl"
    >
      {installPrompt && (
        <button
          type="button"
          onClick={() => void install()}
          className="hidden rounded-lg bg-emerald-100 px-3 py-2 text-sm font-bold text-emerald-800 sm:inline-flex"
        >
          تثبيت التطبيق
        </button>
      )}

      <button
        type="button"
        disabled={working}
        onClick={() => void enable()}
        className="rounded-lg bg-amber-100 px-3 py-2 text-sm font-bold text-amber-800 disabled:opacity-50"
      >
        {working
          ? "جاري الربط..."
          : isSubscribed
            ? "إعادة ربط الإشعارات"
            : permission === "granted"
              ? "ربط هذا الجهاز بالإشعارات"
              : "تفعيل الإشعارات"}
      </button>

      {isSubscribed && (
        <button
          type="button"
          disabled={testing}
          onClick={() => void sendTestPush()}
          className="rounded-lg bg-blue-100 px-3 py-2 text-sm font-bold text-blue-800 disabled:opacity-50"
        >
          {testing
            ? "جاري الإرسال..."
            : "إرسال إشعار تجريبي"}
        </button>
      )}
    </div>
  );
}