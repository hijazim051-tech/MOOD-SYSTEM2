import { supabase } from "./supabase";

export async function sendSystemPush(input: {
  title: string;
  message: string;
  url?: string;
  tag?: string;
  userId?: string;
}) {
  try {
    const { data, error } = await supabase.functions.invoke("send-push", {
      body: {
        title: input.title,
        message: input.message,
        url: input.url || "/",
        tag: input.tag || `mood-${Date.now()}`,
        userId: input.userId,
      },
    });
    if (error) throw error;
    return data;
  } catch (error) {
    console.warn("تعذر إرسال Push بالخلفية:", error);
    return null;
  }
}
