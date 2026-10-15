import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useBranch } from "../context/BranchContext";

type ReturnRecord = {
  id: number;
  order_id: number;
  created_at: string;
  return_type: string;
  reason: string;
  notes: string | null;
  return_value: number;
  refund_amount: number;
  refund_method: string;
  approval_status?: string | null;
};

export function OrderReturns() {
  const { effectiveBranchId } = useBranch();
  const [records, setRecords] = useState<ReturnRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        // An unselected branch must never expose returns from other branches.
        if (!effectiveBranchId) {
          if (!cancelled) setRecords([]);
          return;
        }
        const result = await supabase
          .from("order_returns")
          .select("id,order_id,created_at,return_type,reason,notes,return_value,refund_amount,refund_method,approval_status")
          .eq("branch_id", effectiveBranchId)
          .order("created_at", { ascending: false })
          .limit(300);
        if (result.error) throw result.error;
        if (!cancelled) setRecords((result.data || []) as ReturnRecord[]);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "تعذر تحميل المرتجعات");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [effectiveBranchId]);

  const filtered = useMemo(() => records.filter((r) =>
    `${r.id} ${r.order_id} ${r.reason} ${r.notes || ""}`.toLowerCase().includes(search.trim().toLowerCase())
  ), [records, search]);
  const money = (value: number) => `${Number(value || 0).toFixed(2)} د.ل`;
  return (
    <main dir="rtl" className="space-y-5 p-3 sm:p-6 lg:p-8">
      <header>
        <h1 className="text-2xl font-black">مرتجعات الطلبات</h1>
        <p className="mt-2 text-sm text-gray-500">سجل المرتجعات للفرع المحدد. لتسجيل مرتجع جديد افتح الطلب من صفحة الطلبات واختر إجراء المرتجع.</p>
      </header>
      {!effectiveBranchId && <p className="rounded-xl bg-amber-50 p-4 text-amber-800">اختر فرعًا لعرض مرتجعاته.</p>}
      {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <input aria-label="البحث في المرتجعات" className="min-w-0 flex-1 rounded-xl border p-3" placeholder="بحث برقم الطلب أو السبب" value={search} onChange={(e) => setSearch(e.target.value)} />
          <span className="text-sm text-gray-500">{filtered.length} مرتجع</span>
        </div>
        {loading ? <p>جاري التحميل...</p> : filtered.length === 0 ? <p className="py-8 text-center text-gray-500">لا توجد مرتجعات للعرض.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-right text-sm">
              <thead><tr className="border-b bg-gray-50"><th className="p-3">رقم المرتجع</th><th className="p-3">الطلب</th><th className="p-3">التاريخ</th><th className="p-3">النوع</th><th className="p-3">السبب</th><th className="p-3">قيمة المرتجع</th><th className="p-3">المبلغ المسترد</th><th className="p-3">طريقة الرد</th><th className="p-3">الحالة</th></tr></thead>
              <tbody>{filtered.map((r) => <tr key={r.id} className="border-b"><td className="p-3">#{r.id}</td><td className="p-3">#{r.order_id}</td><td className="p-3">{new Date(r.created_at).toLocaleDateString("ar-LY")}</td><td className="p-3">{r.return_type === "full" ? "كامل" : "جزئي"}</td><td className="p-3">{r.reason}</td><td className="p-3">{money(r.return_value)}</td><td className="p-3">{money(r.refund_amount)}</td><td className="p-3">{r.refund_method === "cash" ? "نقدي" : r.refund_method === "bank" ? "مصرف" : r.refund_method}</td><td className="p-3">{r.approval_status === "pending" ? "بانتظار الموافقة" : r.approval_status === "rejected" ? "مرفوض" : "معتمد"}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

export default OrderReturns;
