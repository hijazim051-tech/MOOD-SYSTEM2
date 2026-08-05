import { useEffect, useMemo, useState } from "react";
import BouquetBuilder, { createEmptyBouquet } from "../components/orders/BouquetBuilder";
import BoxBuilder, { createEmptyBox } from "../components/orders/BoxBuilder";
import {
  calculateEntriesTotal,
  convertEntriesToBuilderItems,
  createEmptySingleProduct,
  type NewOrderEntry,
} from "../lib/newOrderDrafts";
import {
  getBouquetSizes,
  getBoxVariants,
  getOrderMaterials,
  type BouquetSize,
  type BoxVariant,
  type OrderMaterial,
} from "../lib/orderCatalog";
import { supabase } from "../lib/supabase";
import { useBranch } from "../context/BranchContext";

const today = () => new Date().toISOString().slice(0, 10);

type OfferRow = {
  id: number;
  title: string;
  offerType: string;
  offerPrice: number;
  startsAt: string;
  endsAt: string | null;
  isActive: boolean;
  components: unknown[];
};

export default function Offers() {
  const { effectiveBranchId } = useBranch();
  const [materials, setMaterials] = useState<OrderMaterial[]>([]);
  const [bouquetSizes, setBouquetSizes] = useState<BouquetSize[]>([]);
  const [boxVariants, setBoxVariants] = useState<BoxVariant[]>([]);
  const [entry, setEntry] = useState<NewOrderEntry>({ kind: "bouquet", data: createEmptyBouquet() });
  const [title, setTitle] = useState("");
  const [offerPrice, setOfferPrice] = useState("");
  const [startsAt, setStartsAt] = useState(today());
  const [endsAt, setEndsAt] = useState("");
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { void load(); }, [effectiveBranchId]);

  async function load() {
    const [loadedMaterials, loadedSizes, loadedBoxes, offerResult] = await Promise.all([
      getOrderMaterials(effectiveBranchId),
      getBouquetSizes(),
      getBoxVariants(),
      supabase.from("offers").select("id,title,offer_type,offer_price,starts_at,ends_at,is_active,components,branch_id").order("created_at", { ascending: false }),
    ]);
    setMaterials(loadedMaterials);
    setBouquetSizes(loadedSizes);
    setBoxVariants(loadedBoxes);
    if (offerResult.error) return alert(offerResult.error.message);
    const rows = effectiveBranchId
      ? (offerResult.data || []).filter((row: any) => String(row.branch_id || "") === effectiveBranchId)
      : (offerResult.data || []);
    setOffers(rows.map((row: any) => ({
      id: Number(row.id), title: String(row.title || "عرض"), offerType: String(row.offer_type || "product"),
      offerPrice: Number(row.offer_price || 0), startsAt: String(row.starts_at || "").slice(0, 10),
      endsAt: row.ends_at ? String(row.ends_at).slice(0, 10) : null, isActive: Boolean(row.is_active),
      components: Array.isArray(row.components) ? row.components : [],
    })));
  }

  function chooseType(kind: NewOrderEntry["kind"]) {
    if (kind === "bouquet") setEntry({ kind, data: createEmptyBouquet() });
    else if (kind === "box") setEntry({ kind, data: createEmptyBox() });
    else setEntry({ kind, data: createEmptySingleProduct() });
  }

  const calculatedPrice = useMemo(() => calculateEntriesTotal([entry]), [entry]);

  async function saveOffer() {
    if (!effectiveBranchId) return alert("اختر فرعًا محددًا");
    if (!title.trim()) return alert("اكتب اسم العرض");
    const price = Number(offerPrice || calculatedPrice);
    if (!(price > 0)) return alert("سعر العرض غير صحيح");
    const [item] = convertEntriesToBuilderItems([entry]);
    if (!item || item.components.length === 0) return alert("أكمل مكونات العرض أولًا");
    setBusy(true);
    const { error } = await supabase.from("offers").insert({
      branch_id: effectiveBranchId,
      title: title.trim(),
      offer_type: entry.kind === "single" ? "product" : entry.kind,
      product_detail_id: entry.kind === "single" ? entry.data.productDetailId : null,
      original_price: calculatedPrice,
      offer_price: price,
      starts_at: startsAt,
      ends_at: endsAt || null,
      is_active: true,
      components: [{ ...item, source: "order-builder-v2" }],
    });
    setBusy(false);
    if (error) return alert(error.message);
    setTitle(""); setOfferPrice(""); chooseType("bouquet"); await load();
    alert("تم حفظ العرض بنفس تفاصيل الطلب ✅");
  }

  async function toggle(row: OfferRow) {
    const { error } = await supabase.from("offers").update({ is_active: !row.isActive }).eq("id", row.id);
    if (error) return alert(error.message);
    await load();
  }

  return <div dir="rtl" className="space-y-5 p-3 sm:p-6 lg:p-8">
    <header><h1 className="text-2xl font-black sm:text-3xl">العروض</h1><p className="mt-1 text-sm text-gray-500">ابنِ العرض بنفس مكونات طلب جديد: باقة أو بوكس أو منتج من المخزون.</p></header>
    <section className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
      <div className="grid grid-cols-3 gap-2">
        {([["bouquet","🌹 باقة"],["box","🎁 بوكس"],["single","🛍️ منتج"]] as const).map(([kind,label]) =>
          <button key={kind} type="button" onClick={() => chooseType(kind)} className={`rounded-xl p-3 font-black ${entry.kind===kind?"bg-emerald-700 text-white":"bg-gray-100 text-gray-700"}`}>{label}</button>)}
      </div>
      <div className="mt-5 rounded-2xl border bg-gray-50 p-3 sm:p-5">
        {entry.kind === "bouquet" ? <BouquetBuilder bouquet={entry.data} bouquetSizes={bouquetSizes} materials={materials} onChange={(data)=>setEntry({kind:"bouquet",data})} onRemove={()=>chooseType("bouquet")} />
        : entry.kind === "box" ? <BoxBuilder box={entry.data} boxVariants={boxVariants} materials={materials} onChange={(data)=>setEntry({kind:"box",data})} onRemove={()=>chooseType("box")} />
        : <SingleOfferProduct product={entry.data} materials={materials} onChange={(data)=>setEntry({kind:"single",data})} />}
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <input className="rounded-xl border p-3" placeholder="اسم العرض" value={title} onChange={e=>setTitle(e.target.value)} />
        <input type="number" className="rounded-xl border p-3" placeholder={`سعر العرض (الحالي ${calculatedPrice.toFixed(2)})`} value={offerPrice} onChange={e=>setOfferPrice(e.target.value)} />
        <input type="date" className="rounded-xl border p-3" value={startsAt} onChange={e=>setStartsAt(e.target.value)} />
        <input type="date" className="rounded-xl border p-3" value={endsAt} onChange={e=>setEndsAt(e.target.value)} />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-emerald-50 p-4">
        <div><p className="text-sm text-gray-500">السعر المحسوب من المكونات</p><p className="text-2xl font-black text-emerald-700">{calculatedPrice.toFixed(2)} د.ل</p></div>
        <button disabled={busy} onClick={()=>void saveOffer()} className="rounded-xl bg-emerald-700 px-7 py-3 font-black text-white disabled:opacity-50">{busy?"جاري الحفظ...":"حفظ العرض"}</button>
      </div>
    </section>
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{offers.map(row=><article key={row.id} className="rounded-2xl bg-white p-4 shadow-sm"><div className="flex justify-between gap-3"><div><h3 className="font-black">{row.title}</h3><p className="text-sm text-gray-500">{row.offerType === "bouquet" ? "باقة" : row.offerType === "box" ? "بوكس" : "منتج"} — محفوظ بتفاصيل المكونات</p></div><strong className="text-emerald-700">{row.offerPrice.toFixed(2)} د.ل</strong></div><button onClick={()=>void toggle(row)} className={`mt-3 rounded-lg px-3 py-2 text-sm font-bold ${row.isActive?"bg-red-50 text-red-700":"bg-green-50 text-green-700"}`}>{row.isActive?"إيقاف العرض":"تفعيل العرض"}</button></article>)}</section>
  </div>;
}

function SingleOfferProduct({ product, materials, onChange }: { product: any; materials: OrderMaterial[]; onChange: (value:any)=>void }) {
  return <div className="grid gap-3 md:grid-cols-2">
    <select className="rounded-xl border p-3 md:col-span-2" value={product.productDetailId || ""} onChange={e=>{const m=materials.find(x=>x.id===Number(e.target.value)); if(!m)return; onChange({...product,productDetailId:m.id,productName:m.name,unitCost:m.buyPrice,unitPrice:m.sellPrice,stock:m.stock})}}><option value="">اختر المنتج من المخزون</option>{materials.map(m=><option key={m.id} value={m.id}>{m.productName} — {m.color || m.name} — مخزون {m.stock} — {m.sellPrice} د.ل</option>)}</select>
    <input type="number" min="1" className="rounded-xl border p-3" value={product.quantity} onChange={e=>onChange({...product,quantity:Number(e.target.value||1)})} placeholder="الكمية" />
    <input type="number" min="0" className="rounded-xl border p-3" value={product.unitPrice} onChange={e=>onChange({...product,unitPrice:Number(e.target.value||0)})} placeholder="سعر الوحدة" />
  </div>;
}
