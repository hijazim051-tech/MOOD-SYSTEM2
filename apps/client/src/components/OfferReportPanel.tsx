import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type OfferRow = { id: number; original_price: number; offer_price: number; starts_at: string; ends_at: string | null; is_active: boolean };
type ReturnRow = { id: number; refund_amount: number; created_at: string };

export default function OfferReportPanel() {
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [returns, setReturns] = useState<ReturnRow[]>([]);

  useEffect(() => {
    void Promise.all([
      supabase.from("offers").select("id,original_price,offer_price,starts_at,ends_at,is_active"),
      supabase.from("order_returns").select("id,refund_amount,created_at"),
    ]).then(([offersResult, returnsResult]) => {
      if (!offersResult.error) setOffers((offersResult.data || []) as OfferRow[]);
      if (!returnsResult.error) setReturns((returnsResult.data || []) as ReturnRow[]);
    });
  }, []);

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const active = offers.filter((o) => o.is_active && o.starts_at <= today && (!o.ends_at || o.ends_at >= today));
    const projectedDiscount = active.reduce((sum, o) => sum + Math.max(0, Number(o.original_price) - Number(o.offer_price)), 0);
    const refunds = returns.reduce((sum, r) => sum + Number(r.refund_amount || 0), 0);
    return { active: active.length, total: offers.length, projectedDiscount, returns: returns.length, refunds };
  }, [offers, returns]);

  return (
    <section className="rounded-2xl bg-white p-6 shadow" dir="rtl">
      <h2 className="mb-4 text-xl font-bold">ملخص العروض والمرتجعات</h2>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
        <Card label="العروض الفعالة" value={stats.active} />
        <Card label="إجمالي العروض" value={stats.total} />
        <Card label="قيمة الخصم للوحدة" value={`${stats.projectedDiscount.toFixed(2)} د.ل`} />
        <Card label="عدد المرتجعات" value={stats.returns} />
        <Card label="إجمالي المبالغ المسترجعة" value={`${stats.refunds.toFixed(2)} د.ل`} />
      </div>
      <p className="mt-4 text-xs text-gray-500">المبالغ المسترجعة ظاهرة مستقلّة حتى تقدر تقارنها بصافي الربح في التقرير.</p>
    </section>
  );
}

function Card({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-xl border bg-gray-50 p-4"><div className="text-sm text-gray-500">{label}</div><div className="mt-2 text-xl font-bold">{value}</div></div>;
}
