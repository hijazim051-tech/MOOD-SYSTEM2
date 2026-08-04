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

  return applyTemplate(templates[type], {
    ...order,
    branchName:
      order.branchName ||
      settings.branchName,
  });
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
    throw error;
  }

  if (!data?.ok) {
    throw new Error(
      data?.error ||
        data?.details ||
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

  await refreshWhatsAppSettings(order.branchId);

  const message = buildWhatsAppMessage(order, type);

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

  const storagePath =
    `${safeOrderNumber}/${Date.now()}-${file.name}`;

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