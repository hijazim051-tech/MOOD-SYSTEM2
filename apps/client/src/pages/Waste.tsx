import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useBranch } from "../context/BranchContext";
import { getBranchStock } from "../lib/branchStock";

type Detail = { id: number; name: string; stock: number; averageUnitCost: number };
type Product = { id: number; name: string; details: Detail[] };
type Category = { id: string; name: string; products: Product[] };
type Tier = { id: string; usagePrice: number; stock: number; averageUnitCost: number };
type WasteRecord = {
  id: string; wasteDate: string; itemName: string; detailName: string; quantity: number;
  unitCost: number; totalCost: number; reason: string; employeeName: string; notes: string;
};

const inputClass = "w-full rounded-xl border border-gray-200 bg-white p-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";
const reasons = ["تلف أثناء العمل","كسر","عيب تصنيع","تلف أثناء النقل","فقدان","انتهاء صلاحية","استخدام داخلي","أخرى"];

export default function Waste() {
  const { effectiveBranchId, selectedBranch } = useBranch();
  const [categories, setCategories] = useState<Category[]>([]);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [records, setRecords] = useState<WasteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [kind, setKind] = useState<"product_detail"|"usage_price_tier">("product_detail");
  const [categoryId, setCategoryId] = useState("");
  const [productId, setProductId] = useState("");
  const [detailId, setDetailId] = useState("");
  const [tierId, setTierId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [wasteDate, setWasteDate] = useState(today());
  const [reason, setReason] = useState(reasons[0]);
  const [employeeName, setEmployeeName] = useState("");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => { void loadData(); }, [effectiveBranchId]);

  const selectedCategory = useMemo(() => categories.find(x => x.id === categoryId), [categories, categoryId]);
  const selectedProduct = useMemo(() => selectedCategory?.products.find(x => String(x.id) === productId), [selectedCategory, productId]);
  const selectedDetail = useMemo(() => selectedProduct?.details.find(x => String(x.id) === detailId), [selectedProduct, detailId]);
  const selectedTier = useMemo(() => tiers.find(x => x.id === tierId), [tiers, tierId]);
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return records.filter(r => !s || `${r.itemName} ${r.detailName} ${r.reason} ${r.employeeName}`.toLowerCase().includes(s));
  }, [records, search]);
  const totalCost = filtered.reduce((sum, r) => sum + r.totalCost, 0);

  async function loadData() {
    setLoading(true);
    try {
      const [c, t, w, branchRows] = await Promise.all([
        supabase.from("categories").select(`id,name,products(id,name,product_details(id,name,stock,average_unit_cost,buy_price))`).order("id"),
        supabase.from("usage_price_tiers").select("id,usage_price,stock,average_unit_cost").eq("is_active", true).order("sort_order"),
        supabase.from("stock_waste").select("id,waste_date,item_name_snapshot,detail_name_snapshot,quantity,unit_cost,total_cost,reason,employee_name,notes,branch_id").order("waste_date", { ascending: false }).order("created_at", { ascending: false }),
        getBranchStock(effectiveBranchId)
      ]);
      if (c.error) throw c.error; if (t.error) throw t.error; if (w.error) throw w.error;
      const stockMap = new Map(branchRows.map(row => [row.productDetailId, row]));
      setCategories((c.data || []).map((x:any) => ({ id:String(x.id), name:String(x.name||""), products:(x.products||[]).map((p:any)=>({ id:Number(p.id), name:String(p.name||""), details:(p.product_details||[]).map((d:any)=>({ id:Number(d.id), name:String(d.name||""), stock:Number(stockMap.get(Number(d.id))?.stock||0), averageUnitCost:Number(stockMap.get(Number(d.id))?.averageUnitCost ?? d.average_unit_cost ?? d.buy_price ?? 0) })) })) })));
      setTiers((t.data || []).map((x:any)=>({ id:String(x.id), usagePrice:Number(x.usage_price||0), stock:Number(x.stock||0), averageUnitCost:Number(x.average_unit_cost||0) })));
      const scopedWaste = effectiveBranchId ? (w.data || []).filter((x:any)=>String(x.branch_id||"")===effectiveBranchId) : (w.data || []);
      setRecords(scopedWaste.map((x:any)=>({ id:String(x.id), wasteDate:String(x.waste_date||""), itemName:String(x.item_name_snapshot||""), detailName:String(x.detail_name_snapshot||""), quantity:Number(x.quantity||0), unitCost:Number(x.unit_cost||0), totalCost:Number(x.total_cost||0), reason:String(x.reason||""), employeeName:String(x.employee_name||""), notes:String(x.notes||"") })));
    } catch (e:unknown) { alert(errorMessage(e)); } finally { setLoading(false); }
  }

  async function saveWaste() {
    if (!effectiveBranchId) return alert("اختر فرعًا محددًا قبل تسجيل التالف");
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) return alert("أدخل كمية صحيحة أكبر من صفر");
    let itemName = "", detailName = "", stock = 0, productDetailId:number|null = null, usageTierId:string|null = null;
    if (kind === "product_detail") {
      if (!selectedProduct || !selectedDetail) return alert("اختر المنتج والتفصيل");
      itemName = selectedProduct.name; detailName = selectedDetail.name; stock = selectedDetail.stock; productDetailId = selectedDetail.id;
    } else {
      if (!selectedTier) return alert("اختر فئة الاستخدام");
      itemName = "ورد صناعي / إكسسوارات"; detailName = `فئة ${selectedTier.usagePrice} د.ل`; stock = selectedTier.stock; usageTierId = selectedTier.id;
    }
    if (qty > stock) return alert(`الكمية أكبر من المخزون المتاح (${stock})`);
    setSaving(true);
    try {
      const { error } = await supabase.rpc("save_stock_waste", {
        p_waste_date:wasteDate, p_item_kind:kind, p_product_detail_id:productDetailId,
        p_usage_price_tier_id:usageTierId, p_item_name:itemName, p_detail_name:detailName,
        p_quantity:qty, p_reason:reason, p_employee_name:employeeName.trim(), p_notes:notes.trim(), p_branch_id:effectiveBranchId
      });
      if (error) throw error;
      setCategoryId(""); setProductId(""); setDetailId(""); setTierId(""); setQuantity(""); setReason(reasons[0]); setEmployeeName(""); setNotes("");
      await loadData(); alert("تم تسجيل التالف وخصمه من المخزون ✅");
    } catch (e:unknown) { alert(errorMessage(e)); } finally { setSaving(false); }
  }

  if (loading) return <div className="p-8 text-2xl font-bold">جاري تحميل التوالف والهالك...</div>;

  return <div className="space-y-7 p-4 md:p-8" dir="rtl">
    <header><h1 className="text-3xl font-bold md:text-4xl">التوالف والهالك</h1><p className="mt-2 text-gray-500">تسجيل التالف وخصمه من مخزون {selectedBranch?.name||"الفرع"}</p></header>

    <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <Card label="عدد عمليات التلف" value={String(filtered.length)} />
      <Card label="إجمالي الكمية التالفة" value={String(filtered.reduce((s,r)=>s+r.quantity,0))} />
      <Card label="إجمالي تكلفة الهالك" value={money(totalCost)} danger />
    </section>

    <section className="rounded-2xl bg-white p-5 shadow md:p-6">
      <h2 className="mb-5 text-2xl font-bold">تسجيل تالف جديد</h2>
      <div className="mb-5 flex gap-3">
        <button onClick={()=>setKind("product_detail")} className={`rounded-xl px-5 py-3 font-semibold ${kind==="product_detail"?"bg-emerald-700 text-white":"bg-gray-100"}`}>منتج عادي</button>
        <button onClick={()=>setKind("usage_price_tier")} className={`rounded-xl px-5 py-3 font-semibold ${kind==="usage_price_tier"?"bg-emerald-700 text-white":"bg-gray-100"}`}>ورد صناعي / إكسسوارات</button>
      </div>

      {kind === "product_detail" ? <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Field label="القسم"><select value={categoryId} onChange={e=>{setCategoryId(e.target.value);setProductId("");setDetailId("")}} className={inputClass}><option value="">اختر القسم</option>{categories.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
        <Field label="المنتج"><select value={productId} onChange={e=>{setProductId(e.target.value);setDetailId("")}} className={inputClass}><option value="">اختر المنتج</option>{selectedCategory?.products.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
        <Field label="التفصيل"><select value={detailId} onChange={e=>setDetailId(e.target.value)} className={inputClass}><option value="">اختر التفصيل</option>{selectedProduct?.details.map(x=><option key={x.id} value={x.id}>{x.name} — المخزون {x.stock}</option>)}</select></Field>
      </div> : <Field label="فئة سعر الاستخدام"><select value={tierId} onChange={e=>setTierId(e.target.value)} className={inputClass}><option value="">اختر الفئة</option>{tiers.map(x=><option key={x.id} value={x.id}>فئة {x.usagePrice} د.ل — المخزون {x.stock}</option>)}</select></Field>}

      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Field label="الكمية التالفة"><input type="number" min="0.01" step="0.01" value={quantity} onChange={e=>setQuantity(e.target.value)} className={inputClass}/></Field>
        <Field label="التاريخ"><input type="date" value={wasteDate} onChange={e=>setWasteDate(e.target.value)} className={inputClass}/></Field>
        <Field label="سبب التلف"><select value={reason} onChange={e=>setReason(e.target.value)} className={inputClass}>{reasons.map(x=><option key={x}>{x}</option>)}</select></Field>
        <Field label="الموظف المسؤول"><input value={employeeName} onChange={e=>setEmployeeName(e.target.value)} className={inputClass} placeholder="اختياري"/></Field>
      </div>
      <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3} className={`${inputClass} mt-5`} placeholder="ملاحظات إضافية"/>
      <button onClick={()=>void saveWaste()} disabled={saving} className="mt-5 rounded-xl bg-red-700 px-8 py-3 font-bold text-white disabled:opacity-50">{saving?"جاري التسجيل...":"تسجيل التالف وخصمه من المخزون"}</button>
    </section>

    <section className="rounded-2xl bg-white p-5 shadow"><input value={search} onChange={e=>setSearch(e.target.value)} className={inputClass} placeholder="بحث في المنتج أو السبب أو الموظف"/></section>

    <section className="overflow-x-auto rounded-2xl bg-white p-5 shadow">
      <table className="w-full min-w-[950px]"><thead className="bg-red-700 text-white"><tr><th className="p-4 text-right">التاريخ</th><th className="p-4 text-right">العنصر</th><th className="p-4 text-right">التفصيل</th><th className="p-4 text-right">الكمية</th><th className="p-4 text-right">تكلفة الوحدة</th><th className="p-4 text-right">إجمالي التكلفة</th><th className="p-4 text-right">السبب</th><th className="p-4 text-right">الموظف</th><th className="p-4 text-right">ملاحظات</th></tr></thead>
      <tbody>{filtered.map(r=><tr key={r.id} className="border-b"><td className="p-4">{r.wasteDate}</td><td className="p-4 font-semibold">{r.itemName}</td><td className="p-4">{r.detailName||"-"}</td><td className="p-4">{r.quantity}</td><td className="p-4">{money(r.unitCost)}</td><td className="p-4 font-bold text-red-700">{money(r.totalCost)}</td><td className="p-4">{r.reason}</td><td className="p-4">{r.employeeName||"-"}</td><td className="p-4">{r.notes||"-"}</td></tr>)}{filtered.length===0&&<tr><td colSpan={9} className="p-10 text-center text-gray-500">لا توجد سجلات</td></tr>}</tbody></table>
    </section>
  </div>;
}

function Field({label,children}:{label:string;children:React.ReactNode}) { return <div><label className="mb-2 block font-semibold">{label}</label>{children}</div>; }
function Card({label,value,danger=false}:{label:string;value:string;danger?:boolean}) { return <div className={`rounded-2xl p-5 shadow ${danger?"bg-red-50":"bg-white"}`}><p className="text-sm text-gray-500">{label}</p><p className={`mt-2 text-2xl font-bold ${danger?"text-red-700":""}`}>{value}</p></div>; }
function money(v:number){ return `${Number(v||0).toFixed(2)} د.ل`; }
function today(){ return new Date().toISOString().slice(0,10); }
function errorMessage(e:unknown){ if(e instanceof Error)return e.message; if(typeof e==="object"&&e!==null&&"message" in e)return String((e as {message:unknown}).message); return "حدث خطأ غير متوقع"; }