import { useEffect, useMemo, useState } from "react";

const DRAFT_STORAGE_KEY = "mood-new-order-draft";
const DRAFTS_LIST_STORAGE_KEY = "mood-order-drafts-v2";

type StoredOrderDraft = {
  id: string;
  createdAt: string;
  updatedAt: string;
  customerName: string;
  entries: Array<{
    kind?: string;
    data?: {
      tempId?: string;
      title?: string;
      productName?: string;
    };
  }>;
  customer: {
    customerName?: string;
    customerPhone?: string;
    deliveryDate?: string;
    deliveryTime?: string;
  };
  payment: Record<string, unknown>;
  orderTiming: "today" | "future";
  currentStep: number;
};

type DraftsProps = {
  setPage: (page: string) => void;
};

export default function Drafts({ setPage }: DraftsProps) {
  const [drafts, setDrafts] = useState<StoredOrderDraft[]>([]);

  useEffect(() => {
    loadDrafts();
  }, []);

  function loadDrafts() {
    try {
      const raw = localStorage.getItem(DRAFTS_LIST_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      setDrafts(Array.isArray(parsed) ? parsed : []);
    } catch {
      setDrafts([]);
    }
  }

  const sortedDrafts = useMemo(
    () =>
      [...drafts].sort(
        (a, b) =>
          new Date(b.updatedAt || b.createdAt).getTime() -
          new Date(a.updatedAt || a.createdAt).getTime()
      ),
    [drafts]
  );

  function openDraft(draft: StoredOrderDraft) {
    localStorage.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify({
        entries: draft.entries,
        customer: draft.customer,
        payment: draft.payment,
        orderTiming: draft.orderTiming,
        currentStep: draft.currentStep || 1,
        draftId: draft.id,
        savedAt: draft.updatedAt || draft.createdAt,
      })
    );

    setPage("new-order");
  }

  function deleteDraft(id: string) {
    if (!confirm("هل تريد حذف هذه المسودة؟")) return;

    const next = drafts.filter((draft) => draft.id !== id);
    localStorage.setItem(DRAFTS_LIST_STORAGE_KEY, JSON.stringify(next));
    setDrafts(next);

    try {
      const activeRaw = localStorage.getItem(DRAFT_STORAGE_KEY);
      const active = activeRaw ? JSON.parse(activeRaw) : null;
      if (active?.draftId === id) {
        localStorage.removeItem(DRAFT_STORAGE_KEY);
      }
    } catch {
      // لا شيء
    }
  }

  function clearAll() {
    if (drafts.length === 0) return;
    if (!confirm("هل تريد حذف جميع المسودات؟")) return;

    localStorage.removeItem(DRAFTS_LIST_STORAGE_KEY);
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    setDrafts([]);
  }

  return (
    <div className="space-y-6 p-4 md:p-8" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black text-gray-900">📝 مسودات الطلبات</h1>
          <p className="mt-2 text-gray-500">
            الطلبات التي حفظتها قبل إكمالها. افتح أي مسودة وكمل من نفس المكان.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPage("new-order")}
            className="rounded-xl bg-emerald-700 px-5 py-3 font-black text-white"
          >
            + طلب جديد
          </button>

          <button
            type="button"
            onClick={clearAll}
            disabled={drafts.length === 0}
            className="rounded-xl bg-red-50 px-5 py-3 font-black text-red-700 disabled:opacity-40"
          >
            حذف الكل
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm font-bold text-blue-800">
        المسودات محفوظة على نفس الجهاز والمتصفح. حذف بيانات المتصفح يمسحها.
      </div>

      {sortedDrafts.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-gray-200 bg-white p-12 text-center">
          <div className="text-5xl">📝</div>
          <h2 className="mt-4 text-xl font-black text-gray-800">لا توجد مسودات</h2>
          <p className="mt-2 text-gray-500">اضغط حفظ كمسودة من صفحة طلب جديد.</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {sortedDrafts.map((draft) => (
            <article
              key={draft.id}
              className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-gray-400">العميل</p>
                  <h2 className="mt-1 text-xl font-black text-gray-900">
                    {draft.customerName || draft.customer?.customerName || "بدون اسم"}
                  </h2>
                  <p className="mt-1 text-sm text-gray-500" dir="ltr">
                    {draft.customer?.customerPhone || "بدون رقم"}
                  </p>
                </div>

                <span
                  className={`rounded-full px-3 py-1 text-xs font-black ${
                    draft.orderTiming === "future"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-emerald-100 text-emerald-800"
                  }`}
                >
                  {draft.orderTiming === "future" ? "📅 حجز مستقبلي" : "طلب عادي"}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-gray-50 p-3">
                  <p className="text-gray-400">العناصر</p>
                  <p className="mt-1 font-black">{draft.entries?.length || 0}</p>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <p className="text-gray-400">آخر حفظ</p>
                  <p className="mt-1 font-black">
                    {formatDateTime(draft.updatedAt || draft.createdAt)}
                  </p>
                </div>
              </div>

              {(draft.customer?.deliveryDate || draft.customer?.deliveryTime) && (
                <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-900">
                  موعد التنفيذ:{" "}
                  {[draft.customer.deliveryDate, draft.customer.deliveryTime]
                    .filter(Boolean)
                    .join(" — ")}
                </p>
              )}

              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  onClick={() => openDraft(draft)}
                  className="flex-1 rounded-xl bg-emerald-700 px-4 py-3 font-black text-white"
                >
                  فتح وإكمال المسودة
                </button>
                <button
                  type="button"
                  onClick={() => deleteDraft(draft.id)}
                  className="rounded-xl bg-red-50 px-4 py-3 font-black text-red-700"
                >
                  حذف
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function formatDateTime(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ar-LY", {
    dateStyle: "short",
    timeStyle: "short",
  });
}