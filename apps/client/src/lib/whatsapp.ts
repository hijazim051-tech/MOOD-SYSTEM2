import type { PrintableOrder } from "../components/printing/types";
import { supabase } from "./supabase";
import { createInvoicePdfFile } from "./invoicePdf";
import {
  loadWhatsAppSettings,
  refreshWhatsAppSettings,
  type WhatsAppTemplateKey,
} from "./whatsappSettings";

export type WhatsAppTemplateData = {
  id?: string | number | null;
  branchId?: string | null;
  orderNumber: string | number;
  customerName?: string;
  customerPhone?: string;
  total?: number;
  paidAmount?: number;
  remainingAmount?: number;
  delegateName?: string;
  deliveryDriverName?: string;
  branchName?: string;
};

export type WhatsAppInvoiceOrder = PrintableOrder & {
  branchId?: string | null;
  delegateName?: string;
};

export type WhatsAppMessageType =
  | "invoice"
  | "ready"
  | "customer_collected"
  | "driver_handover";

const fallbackTemplates: Record<WhatsAppMessageType, string> = {
  invoice:
    "مرحبًا {customer_name}، هذه فاتورة الطلب رقم #{order_number} من {branch_name}.",
  ready:
    "مرحبًا {customer_name}، طلبك رقم #{order_number} أصبح جاهزًا للاستلام من {branch_name}.",
  customer_collected:
    "شكرًا لك {customer_name}. تم تسجيل استلام الطلب رقم #{order_number} من {branch_name}.",
  driver_handover:
    "مرحبًا {customer_name}، خرج طلبك رقم #{order_number} للتوصيل مع المندوب {delegate_name} من {branch_name}.",
};

export function normalizeLibyanPhone(value: string) {
  let phone = String(value || "").replace(/\D/g, "");

  if (phone.startsWith("00218")) {
    phone = phone.slice(2);
  }

  if (phone.startsWith("0")) {
    phone = `218${phone.slice(1)}`;
  }

  if (!phone.startsWith("218") && phone.length === 9) {
    phone = `218${phone}`;
  }

  return phone;
}

function money(value?: number) {
  return Number(value || 0).toFixed(2);
}

function cleanTemplate(value: unknown) {
  return String(value ?? "").trim();
}

function formatUnknownError(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value);
  } catch {
    return "تعذر إرسال رسالة واتساب";
  }
}

function applyTemplate(
  template: string,
  order: WhatsAppTemplateData
) {
  const values: Record<string, string> = {
    customer_name: order.customerName || "عميلنا",
    name: order.customerName || "عميلنا",
    order_number: String(order.orderNumber),
    order: String(order.orderNumber),
    total: money(order.total),
    paid: money(order.paidAmount),
    remaining: money(order.remainingAmount),
    delegate_name:
      order.delegateName ||
      order.deliveryDriverName ||
      "المندوب",
    branch_name: order.branchName || "المحل",
  };

  return template.replace(
    /\{([a-z_]+)\}/gi,
    (_, key: string) => values[key] ?? `{${key}}`
  );
}

export function buildWhatsAppMessage(
  order: WhatsAppTemplateData,
  type: WhatsAppMessageType
) {
  const settings = loadWhatsAppSettings(order.branchId);

  const templates: Record<WhatsAppTemplateKey, string> = {
    invoice: settings.invoiceMessage,
    ready: settings.readyMessage,
    customer_collected: settings.customerCollectedMessage,
    driver_handover: settings.driverHandoverMessage,
  };

  /*
   * الفاتورة كانت تُرسل حتى لو كان القالب فارغًا لأن معها ملف PDF.
   * أما رسائل "جاهز" و"المندوب" فهي نصية فقط، والقالب الفارغ
   * يجعل Edge Function ترفض الطلب. لذلك نستعمل قالبًا افتراضيًا آمنًا.
   */
  const selectedTemplate =
    cleanTemplate(templates[type]) ||
    fallbackTemplates[type];

  return applyTemplate(selectedTemplate, {
    ...order,
    branchName:
      order.branchName ||
      settings.branchName ||
      "المحل",
  }).trim();
}

async function logWhatsApp(
  order: WhatsAppTemplateData,
  type: WhatsAppMessageType,
  message: string,
  phone: string,
  status: "sent" | "failed" | "opened"
) {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    await supabase
      .from("whatsapp_message_logs")
      .insert({
        order_id: order.id ? Number(order.id) : null,
        customer_phone: phone,
        message_type: type,
        message_text: message,
        sent_by: user?.id || null,
        branch_id: order.branchId || null,
        status,
      });
  } catch (error) {
    console.warn("تعذر تسجيل رسالة واتساب:", error);
  }
}

async function invokeWhatsAppFunction(payload: {
  to: string;
  body?: string;
  documentUrl?: string;
  filename?: string;
  branchId?: string | null;
}) {
  const { data, error } = await supabase.functions.invoke(
    "send-ultramsg",
    {
      body: {
        to: payload.to,
        body: payload.body || "",
        documentUrl: payload.documentUrl || "",
        filename: payload.filename || "",
        branchId: payload.branchId || null,
      },
    }
  );

  if (error) {
    throw new Error(error.message || "تعذر الاتصال بدالة واتساب");
  }

  if (!data?.ok) {
    throw new Error(
      data?.error ||
        formatUnknownError(data?.details) ||
        "تعذر إرسال رسالة واتساب"
    );
  }

  return data;
}

export async function sendAutomaticWhatsApp(
  order: WhatsAppTemplateData,
  type: WhatsAppMessageType
) {
  const phone = normalizeLibyanPhone(
    order.customerPhone || ""
  );

  if (!phone) {
    throw new Error("رقم الزبون غير موجود");
  }

  if (!order.branchId) {
    console.warn(
      "رسالة واتساب بدون branchId، سيتم استعمال Instance الاحتياطية",
      {
        orderId: order.id || null,
        orderNumber: order.orderNumber,
        type,
      }
    );
  }

  await refreshWhatsAppSettings(order.branchId);

  const message = buildWhatsAppMessage(order, type);

  if (!message) {
    throw new Error(`قالب رسالة ${type} فارغ`);
  }

  try {
    const data = await invokeWhatsAppFunction({
      to: phone,
      body: message,
      branchId: order.branchId || null,
    });

    await logWhatsApp(
      order,
      type,
      message,
      phone,
      "sent"
    );

    return data;
  } catch (error) {
    await logWhatsApp(
      order,
      type,
      message,
      phone,
      "failed"
    );

    throw error;
  }
}

export async function sendCustomAutomaticWhatsApp(
  phoneValue: string,
  message: string,
  branchId?: string | null,
  order?: WhatsAppTemplateData,
  logType: WhatsAppMessageType = "driver_handover"
) {
  const phone = normalizeLibyanPhone(phoneValue);

  if (!phone) {
    throw new Error("رقم الهاتف غير موجود");
  }

  const cleanMessage = String(message || "").trim();

  if (!cleanMessage) {
    throw new Error("نص رسالة واتساب فارغ");
  }

  await refreshWhatsAppSettings(branchId);

  try {
    const data = await invokeWhatsAppFunction({
      to: phone,
      body: cleanMessage,
      branchId: branchId || null,
    });

    if (order) {
      await logWhatsApp(
        {
          ...order,
          branchId: branchId || order.branchId || null,
        },
        logType,
        cleanMessage,
        phone,
        "sent"
      );
    }

    return data;
  } catch (error) {
    if (order) {
      await logWhatsApp(
        {
          ...order,
          branchId: branchId || order.branchId || null,
        },
        logType,
        cleanMessage,
        phone,
        "failed"
      );
    }

    throw error;
  }
}

export function openOrderWhatsApp(
  order: WhatsAppTemplateData,
  type: WhatsAppMessageType
) {
  const phone = normalizeLibyanPhone(
    order.customerPhone || ""
  );

  if (!phone) {
    throw new Error("رقم الزبون غير موجود");
  }

  const message = buildWhatsAppMessage(order, type);

  if (!message) {
    throw new Error(`قالب رسالة ${type} فارغ`);
  }

  void logWhatsApp(
    order,
    type,
    message,
    phone,
    "opened"
  );

  window.open(
    `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
    "_blank",
    "noopener,noreferrer"
  );
}

export async function shareInvoicePdfToWhatsApp(
  order: WhatsAppInvoiceOrder
) {
  const phone = normalizeLibyanPhone(
    order.customerPhone || ""
  );

  if (!phone) {
    throw new Error("رقم الزبون غير موجود");
  }

  await refreshWhatsAppSettings(order.branchId);

  const message = buildWhatsAppMessage(
    order,
    "invoice"
  );

  const file = await createInvoicePdfFile(order);

  const safeOrderNumber = String(
    order.orderNumber
  ).replace(/[^a-zA-Z0-9_-]/g, "-");

  const safeBranchId = String(
    order.branchId || "default"
  ).replace(/[^a-zA-Z0-9_-]/g, "-");

  const storagePath =
    `${safeBranchId}/${safeOrderNumber}/${Date.now()}-${file.name}`;

  const { error: uploadError } =
    await supabase.storage
      .from("invoices")
      .upload(storagePath, file, {
        contentType: "application/pdf",
        cacheControl: "3600",
        upsert: false,
      });

  if (uploadError) {
    await logWhatsApp(
      order,
      "invoice",
      message,
      phone,
      "failed"
    );

    throw new Error(
      `تعذر رفع ملف الفاتورة: ${uploadError.message}`
    );
  }

  const { data: publicUrlData } =
    supabase.storage
      .from("invoices")
      .getPublicUrl(storagePath);

  const documentUrl =
    publicUrlData.publicUrl;

  if (!documentUrl) {
    await logWhatsApp(
      order,
      "invoice",
      message,
      phone,
      "failed"
    );

    throw new Error(
      "تعذر إنشاء رابط عام للفاتورة"
    );
  }

  try {
    const data = await invokeWhatsAppFunction({
      to: phone,
      body: message,
      documentUrl,
      filename: file.name,
      branchId: order.branchId || null,
    });

    await logWhatsApp(
      order,
      "invoice",
      message,
      phone,
      "sent"
    );

    return data;
  } catch (error) {
    await logWhatsApp(
      order,
      "invoice",
      message,
      phone,
      "failed"
    );

    throw error;
  }
}

export const openInvoiceWhatsApp =
  shareInvoicePdfToWhatsApp;