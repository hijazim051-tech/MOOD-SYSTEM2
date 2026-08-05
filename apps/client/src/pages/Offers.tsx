import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useBranch } from "../context/BranchContext";
import { saveBuiltOrder } from "../lib/saveBuiltOrder";
import type { CustomerInfoData } from "../components/orders/CustomerInfo";
import type { PaymentData } from "../components/orders/PaymentSection";
import type { ExtendedBuilderItem } from "../lib/newOrderDrafts";

type OfferRow = {
  id: number;
  title: string;
  offerType: string;
  originalPrice: number;
  offerPrice: number;
  startsAt: string;
  endsAt: string | null;
  isActive: boolean;
  reservationStatus: string;
  reservedCustomerName: string;
  reservedCustomerPhone: string;
  reservedOrderId: number | null;
  components: ExtendedBuilderItem[];
};

const emptyCustomer: CustomerInfoData = {
  customerName: "",
  customerPhone: "",
  recipientPhone: "",
  occasion: "",
  deliveryDate: "",
  deliveryTime: "",
  address: "",
  notes: "",
};

const emptyPayment: PaymentData = {
  paymentMethod: "cash",
  cashAmount: 0,
  bankAmount: 0,
  transferAmount: 0,
  depositAmount: 0,
  depositMethod: "cash",
  deliveryFee: 0,
  deliveryPaidCash: false,
  deliveryPaymentMethod: "none",
  deliveryStatus: "pending",
  deliveryDriverName: "",
  deliveryAddress: "",
  deliveryCompanyName: "",
  discount: 0,
};

export default function Offers() {
  const { effectiveBranchId, selectedBranch } = useBranch();
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<OfferRow | null>(null);
  const [customer, setCustomer] = useState<CustomerInfoData>({ ...emptyCustomer });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => { void load(); }, [effectiveBranchId]);

  async function load() {
    setLoading(true);
    let query = supabase
      .from("offers")
      .select("id,title,offer_type,original_price,offer_price,starts_at,ends_at,is_active,components,branch_id,reservation_status,reserved_customer_name,reserved_customer_phone,reserved_order_id")
      .order("created_at", { ascending: false });
    if (effectiveBranchId) query = query.eq("branch_id", effectiveBranchId);
    const { data, error } = await query;
    if (error) alert(error.message);
    else setOffers((data || []).map((row: any) => ({
      id: Number(row.id),
      title: String(row.title || "عرض"),
      offerType: String(row.offer_type || "product"),
      originalPrice: Number(row.original_price || 0),
      offerPrice: Number(row.offer_price || 0),
      startsAt: String(row.starts_at || "").slice(0, 10),
      endsAt: row.ends_at ? String(row.ends_at).slice(0, 10) : null,
      isActive: Boolean(row.is_active),
      reservationStatus: String(row.reservation_status || "available"),
      reservedCustomerName: String(row.reserved_customer_name || ""),
      reservedCustomerPhone: String(row.reserved_customer_phone || ""),
      reservedOrderId: row.reserved_order_id ? Number(row.reserved_order_id) : null,
      components: Array.isArray(row.components)
        ? row.components.map((x: any) => x?.source ? Object.fromEntries(Object.entries(x).filter(([key]) => key !== "source")) : x)
        : [],
    })));
    setLoading(false);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return offers;
    return offers.filter((row) => `${row.title} ${row.reservedCustomerName} ${row.reservedCustomerPhone}`.toLowerCase().includes(q));
  }, [offers, search]);

  function openReserve(row: OfferRow) {
    if (!row.isActive) return alert("العرض موقوف");
    if (row.reservationStatus === "reserved") return alert("العرض محجوز بالفعل");
    setSelected(row);
    setCustomer({ ...emptyCustomer });
  }

  async function reserveOffer() {
    if (!selected || !effectiveBranchId) return;
    if (!customer.customerName.trim() || !customer.customerPhone.trim()) {
      alert("اسم العميل ورقم الهاتف مطلوبان");
      return;
    }
    if (!selected.components.length) return alert("مكونات العرض غير موجودة");
    setSaving(true);
    try {
      const payment: PaymentData = {
        ...emptyPayment,
        cashAmount: 0,
        discount: Math.max(selected.originalPrice - selected.offerPrice, 0),
      };
      const result = await saveBuiltOrder({
        customer,
        payment,
        items: selected.components,
        branchId: effectiveBranchId,
      }) as { id?: number | string; orderNumber?: string } | undefined;
      const orderId = result?.id ? Number(result.id) : null;
      const { error } = await supabase.from("offers").update({
        reservation_status: "reserved",
        reserved_customer_name: customer.customerName.trim(),
        reserved_customer_phone: customer.customerPhone.trim(),
        reserved_at: new Date().toISOString(),
        reserved_order_id: orderId,
      }).eq("id", selected.id).eq("branch_id", effectiveBranchId);
      if (error) throw error;
      setSelected(null);
      await load();
      alert(`تم حجز العرض وإنشاء الطلب بنجاح ✅${result?.orderNumber ? `\nرقم الطلب: ${result.orderNumber}` : ""}`);
      window.dispatchEvent(new CustomEvent("mood:navigate", { detail: { page: "orders" } }));
    } catch (error) {
      alert(error instanceof Error ? error.message : "تعذر حجز العرض");
    } finally { setSaving(false); }
  }

  async function cancelReservation(row: OfferRow) {
    if (!confirm("هل تريد إلغاء الحجز بالكامل؟ الطلب الناتج لن يُحذف تلقائيًا حفاظًا على سجل العمليات.")) return;
    const { error } = await supabase.from("offers").update({
      reservation_status: "available",
      reserved_customer_name: null,
      reserved_customer_phone: null,
      reserved_at: null,
      reserved_order_id: null,
    }).eq("id", row.id);
    if (error) return alert(error.message);
    await load();
  }

  async function deleteOffer(row: OfferRow) {
    if (!confirm("حذف العرض نهائيًا؟")) return;
    const { error } = await supabase.from("offers").delete().eq("id", row.id);
    if (error) return alert(error.message);
    await load();
  }

  function editOffer(row: OfferRow) {
    localStorage.setItem("mood-edit-offer", JSON.stringify(row));
    window.dispatchEvent(new CustomEvent("mood:navigate", { detail: { page: "offer-create" } }));
  }

  return <div dir="rtl" className="space-y-5 p-3 sm:p-6 lg:p-8">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-black sm:text-3xl">قائمة العروض</h1><p className="mt-1 text-sm text-gray-500">عروض فرع {selectedBranch?.name || "كل الفروع"}</p></div>
      <button onClick={() => window.dispatchEvent(new CustomEvent("mood:navigate", { detail: { page: "offer-create" } }))} className="rounded-xl bg-emerald-700 px-5 py-3 font-black text-white">+ إضافة عرض</button>
    </header>
    <input className="w-full rounded-xl border p-3" value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث باسم العرض أو العميل" />
    {loading ? <p>جاري التحميل...</p> : <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {filtered.map(row => <article key={row.id} className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex justify-between gap-3"><div><h3 className="text-lg font-black">{row.title}</h3><p className="text-sm text-gray-500">{row.offerType === "bouquet" ? "باقة" : row.offerType === "box" ? "بوكس" : "منتج"}</p></div><strong className="text-xl text-emerald-700">{row.offerPrice.toFixed(2)} د.ل</strong></div>
        <div className={`mt-3 rounded-xl p-3 text-sm font-bold ${row.reservationStatus === "reserved" ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}>
          {row.reservationStatus === "reserved" ? `محجوز: ${row.reservedCustomerName} — ${row.reservedCustomerPhone}` : "متاح للحجز"}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {row.reservationStatus === "reserved" ? <button onClick={() => void cancelReservation(row)} className="rounded-lg bg-red-50 px-3 py-2 font-bold text-red-700">إلغاء الحجز</button> : <button onClick={() => openReserve(row)} className="rounded-lg bg-emerald-700 px-3 py-2 font-bold text-white">حجز</button>}
          <button onClick={() => editOffer(row)} className="rounded-lg bg-blue-50 px-3 py-2 font-bold text-blue-700">تعديل</button>
          <button onClick={() => void deleteOffer(row)} className="col-span-2 rounded-lg bg-gray-100 px-3 py-2 font-bold text-gray-700">حذف العرض</button>
        </div>
      </article>)}
      {!filtered.length && <p className="text-gray-500">لا توجد عروض في هذا الفرع.</p>}
    </section>}

    {selected && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-xl rounded-2xl bg-white p-5">
        <div className="flex justify-between"><h2 className="text-xl font-black">حجز: {selected.title}</h2><button onClick={() => setSelected(null)}>✕</button></div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input className="rounded-xl border p-3" placeholder="اسم العميل" value={customer.customerName} onChange={e => setCustomer({...customer, customerName:e.target.value})}/>
          <input className="rounded-xl border p-3" placeholder="رقم الهاتف" value={customer.customerPhone} onChange={e => setCustomer({...customer, customerPhone:e.target.value})}/>
          <input className="rounded-xl border p-3" placeholder="رقم المستلم" value={customer.recipientPhone} onChange={e => setCustomer({...customer, recipientPhone:e.target.value})}/>
          <input className="rounded-xl border p-3" placeholder="المناسبة" value={customer.occasion} onChange={e => setCustomer({...customer, occasion:e.target.value})}/>
          <input type="date" className="rounded-xl border p-3" value={customer.deliveryDate} onChange={e => setCustomer({...customer, deliveryDate:e.target.value})}/>
          <input type="time" className="rounded-xl border p-3" value={customer.deliveryTime} onChange={e => setCustomer({...customer, deliveryTime:e.target.value})}/>
          <input className="rounded-xl border p-3 md:col-span-2" placeholder="العنوان" value={customer.address} onChange={e => setCustomer({...customer, address:e.target.value})}/>
        </div>
        <button disabled={saving} onClick={() => void reserveOffer()} className="mt-4 w-full rounded-xl bg-emerald-700 p-3 font-black text-white disabled:opacity-50">{saving ? "جاري الحجز..." : "تأكيد الحجز وإنشاء الطلب"}</button>
      </div>
    </div>}
  </div>;
}
