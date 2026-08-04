import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function cleanSecret(value: string | undefined) {
  return String(value || "")
    .replace(/["']/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: cors,
    });
  }

  try {
    const url = cleanSecret(
      Deno.env.get("SUPABASE_URL"),
    );

    const serviceRoleKey = cleanSecret(
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    );

    const publicKey = cleanSecret(
      Deno.env.get("VAPID_PUBLIC_KEY"),
    );

    const privateKey = cleanSecret(
      Deno.env.get("VAPID_PRIVATE_KEY"),
    );

    const subject = String(
      Deno.env.get("VAPID_SUBJECT") ||
        "mailto:hijazim051@gmail.com",
    ).trim();

    if (!url) {
      throw new Error("SUPABASE_URL غير موجود");
    }

    if (!serviceRoleKey) {
      throw new Error(
        "SUPABASE_SERVICE_ROLE_KEY غير موجود",
      );
    }

    if (!publicKey) {
      throw new Error(
        "VAPID_PUBLIC_KEY غير موجود",
      );
    }

    if (!privateKey) {
      throw new Error(
        "VAPID_PRIVATE_KEY غير موجود",
      );
    }

    if (
      !subject.startsWith("mailto:") &&
      !subject.startsWith("https://")
    ) {
      throw new Error(
        "VAPID_SUBJECT لازم يبدأ بـ mailto: أو https://",
      );
    }

    webpush.setVapidDetails(
      subject,
      publicKey,
      privateKey,
    );

    const admin = createClient(
      url,
      serviceRoleKey,
    );

    const authHeader =
      req.headers.get("Authorization") || "";

    const token = authHeader.replace(
      /^Bearer\s+/i,
      "",
    );

    if (!token) {
      return jsonResponse(
        {
          error: "Unauthorized",
          details: "Missing access token",
        },
        401,
      );
    }

    const {
      data: { user },
      error: userError,
    } = await admin.auth.getUser(token);

    if (userError || !user) {
      return jsonResponse(
        {
          error: "Unauthorized",
          details:
            userError?.message ||
            "Invalid access token",
        },
        401,
      );
    }

    let body: {
      userId?: string;
      title?: string;
      message?: string;
      body?: string;
      url?: string;
      tag?: string;
    } = {};

    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const {
      data: profile,
      error: profileError,
    } = await admin
      .from("user_profiles")
      .select("role,roles(name)")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error(
        "PROFILE ERROR:",
        profileError,
      );

      throw profileError;
    }

    const role = String(
      (profile as any)?.roles?.name ||
        (profile as any)?.role ||
        "",
    ).toLowerCase();

    if (
      !["owner", "admin", "manager"].includes(
        role,
      )
    ) {
      return jsonResponse(
        {
          error: "Forbidden",
          details:
            `User role is ${role || "unknown"}`,
        },
        403,
      );
    }

    let query = admin
      .from("push_subscriptions")
      .select(
        "id,endpoint,p256dh,auth,user_id",
      )
      .eq("is_active", true);

    if (body.userId) {
      query = query.eq(
        "user_id",
        body.userId,
      );
    }

    const {
      data: subscriptions,
      error: subscriptionsError,
    } = await query;

    if (subscriptionsError) {
      console.error(
        "SUBSCRIPTIONS ERROR:",
        subscriptionsError,
      );

      throw subscriptionsError;
    }

    console.log(
      "ACTIVE SUBSCRIPTIONS:",
      subscriptions?.length || 0,
    );

    let sent = 0;
    let failed = 0;

    const errors: Array<{
      id: string;
      endpointHost: string;
      status?: number;
      message?: string;
      body?: string;
    }> = [];

    await Promise.all(
      (subscriptions || []).map(
        async (subscription: any) => {
          try {
            await webpush.sendNotification(
              {
                endpoint:
                  subscription.endpoint,
                keys: {
                  p256dh:
                    subscription.p256dh,
                  auth: subscription.auth,
                },
              },
              JSON.stringify({
                title:
                  body.title || "MOOD",
                body:
                  body.message ||
                  body.body ||
                  "لديك تنبيه جديد",
                data: {
                  url: body.url || "/",
                },
                tag:
                  body.tag ||
                  `mood-${Date.now()}`,
              }),
              {
                TTL: 60,
                urgency: "high",
              },
            );

            sent++;

            console.log("PUSH SENT:", {
              id: subscription.id,
              endpoint:
                subscription.endpoint,
            });
          } catch (error: any) {
            failed++;

            let endpointHost = "";

            try {
              endpointHost = new URL(
                subscription.endpoint,
              ).hostname;
            } catch {
              endpointHost = "unknown";
            }

            const pushError = {
              id: subscription.id,
              endpointHost,
              status:
                error?.statusCode ||
                error?.status,
              message:
                error?.message ||
                String(error),
              body:
                typeof error?.body ===
                "string"
                  ? error.body
                  : JSON.stringify(
                      error?.body || null,
                    ),
            };

            errors.push(pushError);

            console.error(
              "PUSH ERROR:",
              pushError,
            );

            if (
              error?.statusCode === 404 ||
              error?.statusCode === 410
            ) {
              const {
                error: deactivateError,
              } = await admin
                .from("push_subscriptions")
                .update({
                  is_active: false,
                  updated_at:
                    new Date().toISOString(),
                })
                .eq(
                  "id",
                  subscription.id,
                );

              if (deactivateError) {
                console.error(
                  "DEACTIVATE SUBSCRIPTION ERROR:",
                  deactivateError,
                );
              }
            }
          }
        },
      ),
    );

    return jsonResponse({
      sent,
      failed,
      total:
        subscriptions?.length || 0,
      errors,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    console.error(
      "SEND PUSH FUNCTION ERROR:",
      message,
    );

    return jsonResponse(
      {
        error: message,
      },
      500,
    );
  }
});