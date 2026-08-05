import { supabase } from "./supabase";

export type WhatsAppTemplateKey =
  | "invoice"
  | "ready"
  | "customer_collected"
  | "driver_handover";

export type WhatsAppSettings = {
  askAfterSave: boolean;
  includeTotals: boolean;
  sendReadyMessage: boolean;
  sendCustomerCollectedMessage: boolean;
  sendDriverHandoverMessage: boolean;
  invoiceMessage: string;
  readyMessage: string;
  customerCollectedMessage: string;
  driverHandoverMessage: string;
  instanceId: string;
  token: string;
  branchName: string;
};

const STORAGE_PREFIX = "mood_whatsapp_settings";
const GLOBAL_CACHE_KEY = "__global__";

export const DEFAULT_WHATSAPP_SETTINGS: WhatsAppSettings = {
  askAfterSave: true,
  includeTotals: true,
  sendReadyMessage: true,
  sendCustomerCollectedMessage: true,
  sendDriverHandoverMessage: true,
  invoiceMessage:
    "مرحبًا {customer_name} 🌸\nتم إنشاء طلبكم رقم #{order_number} بنجاح.\nشكرًا لاختياركم {branch_name}.",
  readyMessage:
    "مرحبًا {customer_name} 🌸\nتم تجهيز طلبكم رقم #{order_number} وأصبح جاهزًا.\nشكرًا لاختياركم {branch_name}.",
  customerCollectedMessage:
    "شكرًا لثقتكم بمتجر {branch_name} يا {customer_name} 🌷\nتم تسليم طلبكم رقم #{order_number} بنجاح.\nنتمنى أن ينال إعجابكم.",
  driverHandoverMessage:
    "مرحبًا {customer_name} 🚚\nتم تسليم طلبكم رقم #{order_number} إلى المندوب {delegate_name}.\nسيتم التواصل معكم عند الوصول.\nشكرًا لاختياركم {branch_name}.",
  instanceId: "",
  token: "",
  branchName: "المحل",
};

const cache = new Map<string, WhatsAppSettings>();

function key(branchId?: string | null) {
  return branchId || GLOBAL_CACHE_KEY;
}

function storageKey(branchId?: string | null) {
  return `${STORAGE_PREFIX}:${key(branchId)}`;
}

function normalizeSettings(
  value?: Partial<WhatsAppSettings> | null
): WhatsAppSettings {
  return {
    ...DEFAULT_WHATSAPP_SETTINGS,
    ...(value || {}),
  };
}

function readLocal(branchId?: string | null): WhatsAppSettings {
  try {
    const direct = JSON.parse(
      localStorage.getItem(storageKey(branchId)) || "null"
    );

    if (direct) {
      return normalizeSettings(direct);
    }

    const legacy = JSON.parse(
      localStorage.getItem("mood_whatsapp_settings") || "null"
    );

    if (legacy) {
      return normalizeSettings(legacy);
    }
  } catch {
    // تجاهل البيانات المحلية غير الصالحة
  }

  return {
    ...DEFAULT_WHATSAPP_SETTINGS,
  };
}

function saveLocal(
  branchId: string | null | undefined,
  settings: WhatsAppSettings
) {
  localStorage.setItem(
    storageKey(branchId),
    JSON.stringify(settings)
  );
}

export function loadWhatsAppSettings(
  branchId?: string | null
): WhatsAppSettings {
  const cacheKey = key(branchId);

  if (!cache.has(cacheKey)) {
    cache.set(cacheKey, readLocal(branchId));
  }

  return cache.get(cacheKey)!;
}

export async function refreshWhatsAppSettings(
  branchId?: string | null
): Promise<WhatsAppSettings> {
  if (!branchId) {
    return loadWhatsAppSettings(null);
  }

  try {
    const { data, error } = await supabase
      .from("branch_settings")
      .select(
        "whatsapp_instance, whatsapp_token, whatsapp_settings, whatsapp_ready_message, whatsapp_driver_message, whatsapp_delivered_message, branches:branch_id(name)"
      )
      .eq("branch_id", branchId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    const rawRemote =
      (data?.whatsapp_settings || {}) as Record<string, unknown>;

    // ندعم أسماء المفاتيح القديمة والجديدة، بالإضافة إلى أعمدة القوالب المباشرة.
    const remote: Partial<WhatsAppSettings> = {
      ...(rawRemote as Partial<WhatsAppSettings>),
      askAfterSave: Boolean(rawRemote.askAfterSave ?? rawRemote.ask_after_save ?? true),
      includeTotals: Boolean(rawRemote.includeTotals ?? rawRemote.include_totals ?? true),
      sendReadyMessage: Boolean(rawRemote.sendReadyMessage ?? rawRemote.send_ready_message ?? true),
      sendCustomerCollectedMessage: Boolean(rawRemote.sendCustomerCollectedMessage ?? rawRemote.send_customer_collected_message ?? true),
      sendDriverHandoverMessage: Boolean(rawRemote.sendDriverHandoverMessage ?? rawRemote.send_driver_handover_message ?? true),
      readyMessage: String(data?.whatsapp_ready_message || rawRemote.readyMessage || rawRemote.ready_message || DEFAULT_WHATSAPP_SETTINGS.readyMessage),
      driverHandoverMessage: String(data?.whatsapp_driver_message || rawRemote.driverHandoverMessage || rawRemote.driver_handover_message || DEFAULT_WHATSAPP_SETTINGS.driverHandoverMessage),
      customerCollectedMessage: String(data?.whatsapp_delivered_message || rawRemote.customerCollectedMessage || rawRemote.customer_collected_message || DEFAULT_WHATSAPP_SETTINGS.customerCollectedMessage),
      invoiceMessage: String(rawRemote.invoiceMessage || rawRemote.invoice_message || DEFAULT_WHATSAPP_SETTINGS.invoiceMessage),
    };

    const branches = (
      data as {
        branches?:
          | { name?: string | null }
          | Array<{ name?: string | null }>
          | null;
      }
    )?.branches;

    const remoteBranchName = Array.isArray(branches)
      ? branches[0]?.name
      : branches?.name;

    const settings = normalizeSettings({
      ...remote,
      instanceId: String(
        data?.whatsapp_instance ||
          remote.instanceId ||
          ""
      ),
      token: String(
        data?.whatsapp_token ||
          remote.token ||
          ""
      ),
      branchName: String(
        remoteBranchName ||
          remote.branchName ||
          "المحل"
      ),
    });

    cache.set(key(branchId), settings);
    saveLocal(branchId, settings);

    return settings;
  } catch (error) {
    console.warn(
      "تعذر تحميل إعدادات واتساب الخاصة بالفرع، تم استخدام النسخة المحلية:",
      error
    );

    return loadWhatsAppSettings(branchId);
  }
}

export async function saveWhatsAppSettings(
  branchId: string,
  settings: WhatsAppSettings
): Promise<void> {
  if (!branchId) {
    throw new Error(
      "اختر فرعًا محددًا لحفظ إعدادات واتساب"
    );
  }

  const normalized = normalizeSettings(settings);

  const {
    instanceId,
    token,
    ...publicSettings
  } = normalized;

  const { error } = await supabase
    .from("branch_settings")
    .upsert(
      {
        branch_id: branchId,
        whatsapp_instance: instanceId.trim(),
        whatsapp_token: token.trim(),
        whatsapp_settings: publicSettings,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "branch_id",
      }
    );

  if (error) {
    throw error;
  }

  cache.set(key(branchId), normalized);
  saveLocal(branchId, normalized);
}