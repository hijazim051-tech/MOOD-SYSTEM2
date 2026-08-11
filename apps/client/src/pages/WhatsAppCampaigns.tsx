import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useBranch } from "../context/BranchContext";

type ChatRecipient = {
  id: string;
  number: string;
  name: string;
  lastMessageAt: string | null;
};

type CampaignResult = {
  number: string;
  ok: boolean;
  error?: string;
};

const BATCH_SIZE = 10;

export default function WhatsAppCampaigns() {
  const { effectiveBranchId } = useBranch();
  const [recipients, setRecipients] = useState<ChatRecipient[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingChats, setLoadingChats] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [delaySeconds, setDelaySeconds] = useState(6);
  const [confirmedConsent, setConfirmedConsent] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, sent: 0, failed: 0 });
  const [results, setResults] = useState<CampaignResult[]>([]);

  useEffect(() => {
    setRecipients([]);
    setSelected(new Set());
    setResults([]);
    setProgress({ done: 0, total: 0, sent: 0, failed: 0 });
  }, [effectiveBranchId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return recipients;
    return recipients.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.number.toLowerCase().includes(q)
    );
  }, [recipients, search]);

  async function loadChats() {
    if (!effectiveBranchId) {
      alert("اختر فرعًا محددًا أولًا");
      return;
    }

    setLoadingChats(true);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-campaign", {
        body: {
          action: "list_chats",
          branchId: effectiveBranchId,
        },
      });

      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "تعذر تحميل المحادثات");

      const chats = Array.isArray(data.chats) ? data.chats : [];
      setRecipients(chats);
      setSelected(new Set(chats.map((item: ChatRecipient) => item.number)));
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      setLoadingChats(false);
    }
  }

  function toggleRecipient(number: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(number)) next.delete(number);
      else next.add(number);
      return next;
    });
  }

  function selectFiltered() {
    setSelected((current) => {
      const next = new Set(current);
      filtered.forEach((item) => next.add(item.number));
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function sendCampaign() {
    if (!effectiveBranchId) return alert("اختر فرعًا محددًا");
    if (!message.trim()) return alert("اكتب نص العرض أولًا");
    if (selected.size === 0) return alert("اختر مستلمين");
    if (!confirmedConsent) {
      return alert("أكد أن المستلمين عملاء/محادثات مسموح لك بمراسلتهم قبل الإرسال");
    }

    const targetNumbers = Array.from(selected);
    const ok = confirm(
      `سيتم إرسال الرسالة إلى ${targetNumbers.length} محادثة على دفعات.\n` +
      `التأخير بين الرسائل: ${delaySeconds} ثوانٍ.\n\nهل تريد البدء؟`
    );
    if (!ok) return;

    setSending(true);
    setResults([]);
    setProgress({
      done: 0,
      total: targetNumbers.length,
      sent: 0,
      failed: 0,
    });

    let sent = 0;
    let failed = 0;
    const allResults: CampaignResult[] = [];

    try {
      for (let i = 0; i < targetNumbers.length; i += BATCH_SIZE) {
        const batch = targetNumbers.slice(i, i + BATCH_SIZE);

        const { data, error } = await supabase.functions.invoke("whatsapp-campaign", {
          body: {
            action: "send_batch",
            branchId: effectiveBranchId,
            message: message.trim(),
            recipients: batch,
            delayMs: Math.max(4000, Math.min(15000, delaySeconds * 1000)),
          },
        });

        if (error) throw error;
        if (!data?.ok) throw new Error(data?.error || "تعذر إرسال الدفعة");

        const batchResults: CampaignResult[] = Array.isArray(data.results)
          ? data.results
          : [];

        allResults.push(...batchResults);
        sent += batchResults.filter((item) => item.ok).length;
        failed += batchResults.filter((item) => !item.ok).length;

        setResults([...allResults]);
        setProgress({
          done: Math.min(i + batch.length, targetNumbers.length),
          total: targetNumbers.length,
          sent,
          failed,
        });
      }

      alert(`انتهت الحملة ✅\nتم: ${sent}\nفشل: ${failed}`);
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6 p-4 md:p-8" dir="rtl">
      <div>
        <h1 className="text-3xl font-black text-gray-900">📣 حملات واتساب</h1>
        <p className="mt-2 text-gray-500">
          جلب أصحاب المحادثات الموجودة في Evolution وإرسال العرض على دفعات.
        </p>
      </div>

      <section className="rounded-2xl bg-white p-5 shadow">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={loadChats}
            disabled={loadingChats || sending}
            className="rounded-xl bg-emerald-700 px-5 py-3 font-black text-white disabled:opacity-50"
          >
            {loadingChats ? "جاري تحميل المحادثات..." : "🔄 جلب أصحاب المحادثات"}
          </button>

          <div className="rounded-xl bg-gray-50 px-4 py-3 font-bold">
            المحادثات: {recipients.length}
          </div>
          <div className="rounded-xl bg-emerald-50 px-4 py-3 font-bold text-emerald-800">
            المحدد: {selected.size}
          </div>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow">
        <h2 className="text-xl font-black">1. نص العرض</h2>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={6}
          className="mt-4 w-full rounded-xl border border-gray-200 p-4 outline-none focus:border-emerald-500"
          placeholder="اكتب العرض هنا..."
        />

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-2 block font-bold">التأخير بين الرسائل</span>
            <select
              value={delaySeconds}
              onChange={(e) => setDelaySeconds(Number(e.target.value))}
              className="w-full rounded-xl border border-gray-200 p-3"
            >
              <option value={4}>4 ثوانٍ</option>
              <option value={6}>6 ثوانٍ — مقترح</option>
              <option value={8}>8 ثوانٍ</option>
              <option value={10}>10 ثوانٍ</option>
              <option value={15}>15 ثانية</option>
            </select>
          </label>

          <label className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <input
              type="checkbox"
              checked={confirmedConsent}
              onChange={(e) => setConfirmedConsent(e.target.checked)}
              className="h-5 w-5"
            />
            <span className="font-bold text-amber-900">
              أؤكد أن المستلمين عملاء/محادثات مسموح لي بمراسلتهم.
            </span>
          </label>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-black">2. المستلمون</h2>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={selectFiltered}
              className="rounded-xl bg-emerald-50 px-4 py-2 font-bold text-emerald-700"
            >
              تحديد الظاهر
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="rounded-xl bg-gray-100 px-4 py-2 font-bold"
            >
              إلغاء التحديد
            </button>
          </div>
        </div>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mt-4 w-full rounded-xl border border-gray-200 p-3"
          placeholder="بحث بالاسم أو الرقم..."
        />

        <div className="mt-4 max-h-[480px] overflow-auto rounded-xl border">
          {filtered.map((item) => (
            <label
              key={item.id || item.number}
              className="flex cursor-pointer items-center gap-3 border-b p-3 last:border-b-0 hover:bg-gray-50"
            >
              <input
                type="checkbox"
                checked={selected.has(item.number)}
                onChange={() => toggleRecipient(item.number)}
                className="h-5 w-5"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-black">{item.name || item.number}</p>
                <p className="text-sm text-gray-500" dir="ltr">{item.number}</p>
              </div>
            </label>
          ))}

          {!loadingChats && filtered.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              اضغط "جلب أصحاب المحادثات" أولًا.
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-black">3. الإرسال</h2>
            <p className="mt-1 text-sm text-gray-500">
              الإرسال يتم على دفعات صغيرة، والصفحة تعرض النجاح والفشل.
            </p>
          </div>

          <button
            type="button"
            onClick={sendCampaign}
            disabled={sending || selected.size === 0}
            className="rounded-xl bg-emerald-700 px-7 py-3 font-black text-white disabled:opacity-50"
          >
            {sending ? "جاري الإرسال..." : `🚀 إرسال إلى ${selected.size}`}
          </button>
        </div>

        {progress.total > 0 && (
          <div className="mt-5">
            <div className="mb-2 flex justify-between text-sm font-bold">
              <span>{progress.done} / {progress.total}</span>
              <span className="text-emerald-700">نجح {progress.sent}</span>
              <span className="text-red-700">فشل {progress.failed}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full bg-emerald-600 transition-all"
                style={{
                  width: `${Math.round((progress.done / progress.total) * 100)}%`,
                }}
              />
            </div>
          </div>
        )}

        {results.some((item) => !item.ok) && (
          <div className="mt-5 rounded-xl bg-red-50 p-4">
            <p className="font-black text-red-800">الأرقام التي فشل إرسالها:</p>
            <div className="mt-2 max-h-40 overflow-auto text-sm text-red-700">
              {results.filter((item) => !item.ok).map((item) => (
                <div key={item.number}>{item.number} — {item.error || "فشل"}</div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "حدث خطأ غير متوقع";
}
