import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeNumber(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  // لا نرسل للمجموعات أو broadcast/status.
  if (raw.includes("@g.us") || raw.includes("@broadcast") || raw === "status@broadcast") {
    return "";
  }

  const base = raw.split("@")[0];
  return base.replace(/\D/g, "");
}

function extractArray(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.records)) return payload.records;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.chats)) return payload.chats;
  return [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const authHeader = req.headers.get("Authorization") || "";

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({ ok: false, error: "إعدادات Supabase غير مكتملة" }, 500);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return json({ ok: false, error: "غير مصرح" }, 401);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await req.json();
    const action = String(body?.action || "");
    const branchId = String(body?.branchId || "").trim();

    if (!branchId) {
      return json({ ok: false, error: "branchId مطلوب" }, 400);
    }

    const { data: profile } = await admin
      .from("user_profiles")
      .select("id,role,role_id")
      .eq("id", userData.user.id)
      .maybeSingle();

    let roleName = String(profile?.role || "").toLowerCase();

    if (!roleName && profile?.role_id) {
      const { data: roleRow } = await admin
        .from("roles")
        .select("name")
        .eq("id", profile.role_id)
        .maybeSingle();

      roleName = String(roleRow?.name || "").toLowerCase();
    }

    if (!["owner", "admin", "manager"].includes(roleName)) {
      return json({ ok: false, error: "ليس لديك صلاحية حملات واتساب" }, 403);
    }

    const evolutionBaseUrl = cleanBaseUrl(
      Deno.env.get("EVOLUTION_API_URL") || ""
    );

    const apiKey =
      String(Deno.env.get("EVOLUTION_API_KEY") || "").trim();

    const instanceName =
      String(Deno.env.get("EVOLUTION_INSTANCE_NAME") || "mood").trim();

    if (!evolutionBaseUrl || !apiKey || !instanceName) {
      return json({
        ok: false,
        error: "إعدادات Evolution API غير مكتملة",
      }, 500);
    }

    if (action === "list_chats") {
      const endpoint =
        `${evolutionBaseUrl}/chat/findChats/${encodeURIComponent(instanceName)}`;

      // إصدار Evolution عندك 2.3.x يدعم findChats. نطلب المحادثات ونطبّع
      // اختلاف شكل الرد بين الإصدارات.
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: apiKey,
        },
        body: JSON.stringify({}),
      });

      const rawText = await response.text();
      let payload: any = rawText;
      try {
        payload = JSON.parse(rawText);
      } catch {
        // keep raw
      }

      if (!response.ok) {
        return json({
          ok: false,
          error: "Evolution رفض طلب جلب المحادثات",
          status: response.status,
          details: payload,
        }, 502);
      }

      const rows = extractArray(payload);
      const unique = new Map<string, {
        id: string;
        number: string;
        name: string;
        lastMessageAt: string | null;
      }>();

      for (const row of rows) {
        const remoteJid =
          row?.remoteJid ||
          row?.id ||
          row?.jid ||
          row?.contact?.remoteJid ||
          row?.key?.remoteJid ||
          "";

        const number = normalizeNumber(remoteJid);
        if (!number) continue;

        const name = String(
          row?.pushName ||
          row?.name ||
          row?.contact?.pushName ||
          row?.contact?.name ||
          number
        ).trim();

        const lastMessageAt =
          row?.updatedAt ||
          row?.lastMessage?.messageTimestamp ||
          row?.lastMessage?.timestamp ||
          null;

        unique.set(number, {
          id: String(remoteJid || number),
          number,
          name: name || number,
          lastMessageAt: lastMessageAt ? String(lastMessageAt) : null,
        });
      }

      return json({
        ok: true,
        instanceName,
        count: unique.size,
        chats: Array.from(unique.values()),
      });
    }

    if (action === "send_batch") {
      const message = String(body?.message || "").trim();
      const recipients = Array.isArray(body?.recipients)
        ? body.recipients.map(normalizeNumber).filter(Boolean)
        : [];

      const delayMs = Math.max(
        4000,
        Math.min(15000, Number(body?.delayMs || 6000))
      );

      if (!message) return json({ ok: false, error: "نص الرسالة مطلوب" }, 400);
      if (recipients.length === 0) {
        return json({ ok: false, error: "لا يوجد مستلمون" }, 400);
      }
      if (recipients.length > 10) {
        return json({ ok: false, error: "الدفعة الواحدة حدها الأقصى 10 أرقام" }, 400);
      }

      const campaignId = crypto.randomUUID();

      await admin.from("whatsapp_campaigns").insert({
        id: campaignId,
        branch_id: branchId,
        created_by: userData.user.id,
        message_text: message,
        recipient_count: recipients.length,
        status: "sending",
      });

      const results: Array<{ number: string; ok: boolean; error?: string }> = [];
      let sent = 0;
      let failed = 0;

      for (let index = 0; index < recipients.length; index++) {
        const number = recipients[index];

        try {
          const endpoint =
            `${evolutionBaseUrl}/message/sendText/${encodeURIComponent(instanceName)}`;

          const response = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: apiKey,
            },
            body: JSON.stringify({
              number,
              text: message,
              delay: 500,
              linkPreview: false,
            }),
          });

          const responseText = await response.text();

          if (!response.ok) {
            failed++;
            results.push({
              number,
              ok: false,
              error: `HTTP ${response.status}`,
            });

            await admin.from("whatsapp_campaign_recipients").insert({
              campaign_id: campaignId,
              phone: number,
              status: "failed",
              error_message: responseText.slice(0, 1000),
            });
          } else {
            sent++;
            results.push({ number, ok: true });

            await admin.from("whatsapp_campaign_recipients").insert({
              campaign_id: campaignId,
              phone: number,
              status: "sent",
              sent_at: new Date().toISOString(),
            });
          }
        } catch (error) {
          failed++;
          const errorMessage =
            error instanceof Error ? error.message : "Unexpected error";

          results.push({ number, ok: false, error: errorMessage });

          await admin.from("whatsapp_campaign_recipients").insert({
            campaign_id: campaignId,
            phone: number,
            status: "failed",
            error_message: errorMessage,
          });
        }

        if (index < recipients.length - 1) {
          await sleep(delayMs);
        }
      }

      await admin
        .from("whatsapp_campaigns")
        .update({
          status: failed === 0 ? "completed" : "completed_with_errors",
          sent_count: sent,
          failed_count: failed,
          completed_at: new Date().toISOString(),
        })
        .eq("id", campaignId);

      return json({
        ok: true,
        campaignId,
        sent,
        failed,
        results,
      });
    }

    return json({ ok: false, error: "action غير معروف" }, 400);
  } catch (error) {
    return json({
      ok: false,
      error: error instanceof Error ? error.message : "Unexpected error",
    }, 500);
  }
});
