import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useBranch } from "../context/BranchContext";

type DeliveryOrder = {
  id: number;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  address: string;
  driverName: string;
  driverPhone: string;
  handedAt: string;
  deliveredAt: string;
  amount: number;
  moneyStatus: string;
  notes: string;
};

type DriverAccount = {
  key: string;
  name: string;
  phone: string;
  orders: DeliveryOrder[];
  amountDue: number;
  deliveredCount: number;
};

export default function DriverCollections() {
  const { effectiveBranchId } = useBranch();
  const [rows, setRows] = useState<DeliveryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<DriverAccount | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => { void load(); }, [effectiveBranchId]);

  async function load() {
    setLoading(true);
    let query = supabase
      .from("orders")
      .select("id,order_number,customer_name,customer_phone,delivery_address,delivery_driver_name,delivery_driver_phone,handed_to_driver_at,delivered_at,driver_collection_amount,driver_money_status,driver_money_notes,status,branch_id")
      .not("delivery_driver_name", "is", null)
      .order("handed_to_driver_at", { ascending: false });
    if (effectiveBranchId) query = query.eq("branch_id", effectiveBranchId);
    const { data, error } = await query;
    setLoading(false);
    if (error) return alert(error.message);
    setRows((data || []).map((x: any) => ({
      id: Number(x.id),
      orderNumber: String(x.order_number || x.id),
      customerName: String(x.customer_name || ""),
      customerPhone: String(x.customer_phone || ""),
      address: String(x.delivery_address || ""),
      driverName: String(x.delivery_driver_name || "بدون اسم"),
      driverPhone: String(x.delivery_driver_phone || ""),
      handedAt: String(x.handed_to_driver_at || ""),
      deliveredAt: String(x.delivered_at || ""),
      amount: Number(x.driver_collection_amount || 0),
      moneyStatus: String(x.driver_money_status || "not_applicable"),
      notes: String(x.driver_money_notes || ""),
    })));
  }

  const accounts = useMemo(() => {
    const map = new Map<string, DriverAccount>();
    for (const order of rows) {
      const key = `${order.driverName.trim().toLowerCase()}__${order.driverPhone.trim()}`;
      const current = map.get(key) || { key, name: order.driverName, phone: order.driverPhone, orders: [], amountDue: 0, deliveredCount: 0 };
      current.orders.push(order);
      if (order.moneyStatus === "with_driver") current.amountDue += order.amount;
      if (order.deliveredAt) current.deliveredCount += 1;
      map.set(key, current);
    }
    return [...map.values()].sort((a, b) => b.amountDue - a.amountDue);
  }, [rows]);

  async function settle(order: DeliveryOrder) {
    if (!confirm(`تأكيد استلام ${order.amount.toFixed(2)} د.ل من المندوب عن الطلب #${order.orderNumber}؟`)) return;
    setBusyId(order.id);
    const { error } = await supabase.rpc("settle_driver_money", { p_order_id: order.id, p_notes: "تسوية من صفحة تحصيل المندوبين" });
    setBusyId(null);
    if (error) return alert(error.message);
    await load();
    setSelected(null);
  }

  if (loading) return <div className="p-8 text-2xl font-bold">جاري تحميل حسابات المندوبين...</div>;

  return <div dir="rtl" className="space-y-6 p-4 md:p-8">
    <header><h1 className="text-3xl font-black">تحصيل المندوبين</h1><p className="mt-1 text-gray-500">هذه الصفحة للحسابات والتوصيلات فقط؛ جميع الطلبات تبقى في صفحة الطلبات.</p></header>
    <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <Card label="عدد المندوبين" value={accounts.length} />
      <Card label="إجمالي التوصيلات" value={rows.length} />
      <Card label="إجمالي المطلوب منهم" value={`${accounts.reduce((s,x)=>s+x.amountDue,0).toFixed(2)} د.ل`} />
    </section>
    <section className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {accounts.map(driver => <button key={driver.key} onClick={()=>setSelected(driver)} className="rounded-2xl bg-white p-5 text-right shadow-sm hover:shadow-md">
        <div className="flex justify-between gap-3"><div><h2 className="text-xl font-black">{driver.name}</h2><p className="text-sm text-gray-500">{driver.phone || "بدون رقم"}</p></div><span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-bold text-blue-700">{driver.orders.length} توصيل</span></div>
        <div className="mt-4 grid grid-cols-2 gap-3"><Card label="المطلوب" value={`${driver.amountDue.toFixed(2)} د.ل`} compact /><Card label="تم تسليمها" value={driver.deliveredCount} compact /></div>
      </button>)}
      {!accounts.length && <div className="rounded-2xl bg-white p-10 text-center text-gray-500">لا توجد توصيلات مسجلة.</div>}
    </section>
    {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-2xl bg-white p-6">
      <div className="mb-5 flex justify-between"><div><h2 className="text-2xl font-black">{selected.name}</h2><p className="text-gray-500">{selected.phone || "بدون رقم"} — المطلوب: {selected.amountDue.toFixed(2)} د.ل</p></div><button onClick={()=>setSelected(null)} className="rounded-lg bg-red-100 px-4 py-2 text-red-700">✕</button></div>
      <div className="space-y-3">{selected.orders.map(order => <article key={order.id} className="rounded-xl border p-4">
        <div className="grid gap-3 md:grid-cols-4"><Info label="الطلب" value={`#${order.orderNumber}`} /><Info label="العميل" value={`${order.customerName} — ${order.customerPhone}`} /><Info label="العنوان" value={order.address || "-"} /><Info label="المطلوب من الطلب" value={`${order.amount.toFixed(2)} د.ل`} /></div>
        <div className="mt-3 grid gap-3 md:grid-cols-3"><Info label="وقت الاستلام" value={fmt(order.handedAt)} /><Info label="وقت التسليم" value={fmt(order.deliveredAt)} /><Info label="حالة المال" value={moneyLabel(order.moneyStatus)} /></div>
        {order.notes && <p className="mt-3 rounded-lg bg-gray-50 p-3 text-sm">{order.notes}</p>}
        {order.moneyStatus === "with_driver" && <button disabled={busyId===order.id} onClick={()=>void settle(order)} className="mt-3 rounded-xl bg-emerald-700 px-4 py-2 font-bold text-white disabled:opacity-50">تسوية هذه الطلبية</button>}
      </article>)}</div>
    </div></div>}
  </div>;
}

function Card({label,value,compact=false}:{label:string;value:string|number;compact?:boolean}){return <div className={`rounded-2xl bg-white ${compact?"p-3":"p-5"} shadow-sm`}><p className="text-sm text-gray-500">{label}</p><p className={`${compact?"text-xl":"text-3xl"} mt-1 font-black`}>{value}</p></div>}
function Info({label,value}:{label:string;value:string}){return <div className="rounded-lg bg-gray-50 p-3"><p className="text-xs text-gray-500">{label}</p><p className="mt-1 font-bold">{value}</p></div>}
function fmt(v:string){return v?new Date(v).toLocaleString("ar-LY"):"-"}
function moneyLabel(v:string){return v==="with_driver"?"مع المندوب":v==="settled"?"تمت التسوية":v==="received_now"?"مستلم فورًا":"لا ينطبق"}
