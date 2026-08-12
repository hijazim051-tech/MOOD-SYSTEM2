import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type SendBody = {
  to?: string;
  body?: string;
  documentUrl?: string;
  filename?: string;
  branchId?: string | null;
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function normalizePhone(value: string): string {
  let phone = String(value || "").replace(/\D/g, "");

  if (phone.startsWith("00218")) phone = phone.slice(2);
  if (phone.startsWith("0")) phone = `218${phone.slice(1)}`;
  if (!phone.startsWith("218") && phone.length === 9) {
    phone = `218${phone}`;
  }

  return phone;
}

function cleanBaseUrl(value: string): string {
  return String(value || "").trim().replace(/\/+$/, "");
}

async function readJsonOrText(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  try {
    const payload = (await req.json()) as SendBody;

    const to = normalizePhone(payload.to || "");
    const body = String(payload.body || "").trim();
    const documentUrl = String(payload.documentUrl || "").trim();
    const filename = String(payload.filename || "").trim() || "invoice.pdf";
    const branchId = String(payload.branchId || "").trim();

    if (!to) {
      return jsonResponse({ ok: false, error: "رقم الهاتف مطلوب" }, 400);
    }

    if (!body && !documentUrl) {
      return jsonResponse(
        { ok: false, error: "نص الرسالة أو رابط الملف مطلوب" },
        400,
      );
    }

    const evolutionApiUrl = cleanBaseUrl(
      Deno.env.get("EVOLUTION_API_URL") ||
        Deno.env.get("EVOLUTION_BASE_URL") ||
        "",
    );

    const fallbackApiKey = String(
      Deno.env.get("EVOLUTION_API_KEY") || "",
    ).trim();

    const fallbackInstanceName = String(
      Deno.env.get("EVOLUTION_INSTANCE_NAME") ||
        Deno.env.get("EVOLUTION_DEFAULT_INSTANCE") ||
        "mood",
    ).trim();

    if (!evolutionApiUrl) {
      return jsonResponse(
        {
          ok: false,
          error: "EVOLUTION_API_URL غير محفوظ في Supabase Secrets",
        },
        500,
      );
    }

    let apiKey = fallbackApiKey;
    let instanceName = fallbackInstanceName;
    let branchSettingsFound = false;

    /*
     * الحل الأساسي للمحلين:
     * كل فرع يأخذ whatsapp_instance و whatsapp_token الخاصين به.
     * لو لم توجد إعدادات للفرع نستعمل Secrets كخطة احتياطية فقط.
     */
    if (branchId) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
      const serviceRoleKey =
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

      if (supabaseUrl && serviceRoleKey) {
        const admin = createClient(supabaseUrl, serviceRoleKey, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        });

        const { data: branchSettings, error: branchError } = await admin
          .from("branch_settings")
          .select("branch_id,whatsapp_instance,whatsapp_token")
          .eq("branch_id", branchId)
          .maybeSingle();

        if (branchError) {
          console.error("Failed to read branch WhatsApp settings", {
            branchId,
            error: branchError.message,
          });
        } else if (branchSettings) {
          branchSettingsFound = true;
          const branchInstance = String(
            branchSettings.whatsapp_instance || "",
          ).trim();
          const branchToken = String(
            branchSettings.whatsapp_token || "",
          ).trim();

          if (branchInstance) instanceName = branchInstance;
          if (branchToken) apiKey = branchToken;
        }
      }
    }

    if (!apiKey) {
      return jsonResponse(
        {
          ok: false,
          error:
            branchId && branchSettingsFound
              ? "مفتاح Evolution API غير محفوظ لهذا الفرع ولا يوجد مفتاح احتياطي"
              : "EVOLUTION_API_KEY غير محفوظ في Supabase Secrets",
        },
        500,
      );
    }

    if (!instanceName) {
      return jsonResponse(
        {
          ok: false,
          error: "اسم جلسة Evolution غير محدد",
        },
        500,
      );
    }

    const isDocument = Boolean(documentUrl);

    const endpoint = isDocument
      ? `${evolutionApiUrl}/message/sendMedia/${encodeURIComponent(instanceName)}`
      : `${evolutionApiUrl}/message/sendText/${encodeURIComponent(instanceName)}`;

    const requestBody: Record<string, unknown> = isDocument
      ? {
          number: to,
          mediatype: "document",
          mimetype: "application/pdf",
          media: documentUrl,
          fileName: filename.toLowerCase().endsWith(".pdf")
            ? filename
            : `${filename}.pdf`,
          caption: body,
        }
      : {
          number: to,
          text: body,
          delay: 500,
          linkPreview: false,
        };

    console.log("Sending Evolution request", {
      branchId: branchId || null,
      instanceName,
      branchSettingsFound,
      to,
      type: isDocument ? "document" : "text",
      endpoint,
    });

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    const result = await readJsonOrText(response);

    if (!response.ok) {
      console.error("Evolution API rejected request", {
        status: response.status,
        branchId: branchId || null,
        instanceName,
        to,
        type: isDocument ? "document" : "text",
        result,
      });

      let friendlyError = "Evolution API request failed";
      if (response.status === 401 || response.status === 403) {
        friendlyError =
          "مفتاح Evolution API غير صحيح أو لا يملك صلاحية";
      } else if (response.status === 404) {
        friendlyError =
          "جلسة واتساب غير موجودة في Evolution أو اسم الـInstance غير صحيح";
      } else if (response.status === 409 || response.status === 503) {
        friendlyError =
          "جلسة واتساب غير متصلة حاليًا. أعد ربط الرقم في Evolution";
      }

      return jsonResponse(
        {
          ok: false,
          error: friendlyError,
          status: response.status,
          branchId: branchId || null,
          instanceName,
          details: result,
        },
        502,
      );
    }

    console.log("Evolution API accepted request", {
      status: response.status,
      branchId: branchId || null,
      instanceName,
      to,
      type: isDocument ? "document" : "text",
    });

    return jsonResponse({
      ok: true,
      provider: "evolution-api",
      branchId: branchId || null,
      instanceName,
      type: isDocument ? "document" : "text",
      result,
    });
  } catch (error) {
    console.error("send-ultramsg error", error);

    return jsonResponse(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unexpected error",
      },
      500,
    );
  }
});
