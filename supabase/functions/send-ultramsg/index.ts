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

function cleanBaseUrl(value: string): string {
  return String(value || "")
    .trim()
    .replace(/\/+$/, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      {
        ok: false,
        error: "Method not allowed",
      },
      405
    );
  }

  try {
    const payload = (await req.json()) as SendBody;

    const to = normalizePhone(payload.to || "");
    const body = String(payload.body || "").trim();
    const documentUrl = String(
      payload.documentUrl || ""
    ).trim();

    const filename =
      String(payload.filename || "").trim() ||
      "invoice.pdf";

    const branchId = String(
      payload.branchId || ""
    ).trim();

    if (!to) {
      return jsonResponse(
        {
          ok: false,
          error: "رقم الهاتف مطلوب",
        },
        400
      );
    }

    if (!body && !documentUrl) {
      return jsonResponse(
        {
          ok: false,
          error: "نص الرسالة أو رابط الملف مطلوب",
        },
        400
      );
    }

    const evolutionApiUrl = cleanBaseUrl(
      Deno.env.get("EVOLUTION_API_URL") || ""
    );

    const apiKey = String(
      Deno.env.get("EVOLUTION_API_KEY") || ""
    ).trim();

    /*
     * نستعمل دائمًا Instance المحفوظ في Secrets.
     * لا نقرأ whatsapp_instance أو whatsapp_token من جدول الفروع.
     */
    const instanceName = String(
      Deno.env.get("EVOLUTION_INSTANCE_NAME") ||
        "mood"
    ).trim();

    if (!evolutionApiUrl) {
      return jsonResponse(
        {
          ok: false,
          error:
            "EVOLUTION_API_URL غير محفوظ في Supabase Secrets",
        },
        500
      );
    }

    if (!apiKey) {
      return jsonResponse(
        {
          ok: false,
          error:
            "EVOLUTION_API_KEY غير محفوظ في Supabase Secrets",
        },
        500
      );
    }

    if (!instanceName) {
      return jsonResponse(
        {
          ok: false,
          error:
            "EVOLUTION_INSTANCE_NAME غير محفوظ في Supabase Secrets",
        },
        500
      );
    }

    const isDocument = Boolean(documentUrl);

    let endpoint: string;
    let requestBody: Record<string, unknown>;

    if (isDocument) {
      endpoint =
        `${evolutionApiUrl}/message/sendMedia/` +
        encodeURIComponent(instanceName);

      const safeFilename = filename
        .toLowerCase()
        .endsWith(".pdf")
        ? filename
        : `${filename}.pdf`;

      requestBody = {
        number: to,
        mediatype: "document",
        mimetype: "application/pdf",
        media: documentUrl,
        fileName: safeFilename,
        caption: body,
      };
    } else {
      endpoint =
        `${evolutionApiUrl}/message/sendText/` +
        encodeURIComponent(instanceName);

      requestBody = {
        number: to,
        text: body,
      };
    }

    console.log("Sending Evolution request", {
      branchId: branchId || null,
      instanceName,
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

    const responseText = await response.text();

    let result: unknown = responseText;

    try {
      result = JSON.parse(responseText);
    } catch {
      // نترك الرد كنص إذا لم يكن JSON.
    }

    if (!response.ok) {
      console.error(
        "Evolution API rejected request",
        {
          status: response.status,
          branchId: branchId || null,
          instanceName,
          to,
          type: isDocument
            ? "document"
            : "text",
          result,
        }
      );

      return jsonResponse(
        {
          ok: false,
          error:
            "Evolution API request failed",
          status: response.status,
          details: result,
        },
        502
      );
    }

    console.log(
      "Evolution API accepted request",
      {
        status: response.status,
        branchId: branchId || null,
        instanceName,
        to,
        type: isDocument
          ? "document"
          : "text",
      }
    );

    return jsonResponse({
      ok: true,
      provider: "evolution-api",
      branchId: branchId || null,
      instanceName,
      type: isDocument
        ? "document"
        : "text",
      result,
    });
  } catch (error) {
    console.error(
      "send-evolution error",
      error
    );

    return jsonResponse(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unexpected error",
      },
      500
    );
  }
});