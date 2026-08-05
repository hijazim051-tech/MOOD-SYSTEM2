import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useBranch } from "../context/BranchContext";

type Item = { id:string; name:string; detail:string; quantity:number; unit:number; subtotal:number; kind:string; notes:string };
type Row = { id:string; no:string; date:string; supplier:string; total:number; paid:number; remaining:number; status:string; purchaseMode:string; paymentMethod:string; delivery:number; other:number; subtotal:number; notes:string; createdAt:string; items:Item[] };

export default function PurchaseInvoices(){
  const {effectiveBranchId,selectedBranch}=useBranch();
  const [rows,setRows]=useState<Row[]>([]);
  const [q,setQ]=useState("");
  const [loading,setLoading]=useState(true);
  const [selected,setSelected]=useState<Row|null>(null);
  useEffect(()=>{void load()},[effectiveBranchId]);
  async function load(){
    setLoading(true);
    let query=supabase.from("purchase_invoices").select(`
      id,invoice_no,invoice_date,grand_total,paid_amount,remaining_amount,branch_id,
      supplier_name_snapshot,purchase_mode,payment_method,delivery_cost,other_costs,
      items_subtotal,notes,created_at,
      purchase_invoice_items(id,item_kind,item_name_snapshot,detail_name_snapshot,quantity,unit_purchase_price,line_subtotal,notes)
    `).order("invoice_date",{ascending:false}).order("created_at",{ascending:false});
    if(effectiveBranchId)query=query.eq("branch_id",effectiveBranchId);
    const {data,error}=await query;
    if(error)alert(`خطأ فواتير المشتريات: ${error.message}`);
    else setRows((data||[]).map((x:any)=>({
      id:String(x.id),no:String(x.invoice_no||x.id),date:String(x.invoice_date||""),supplier:String(x.supplier_name_snapshot||"بدون مورد"),
      total:Number(x.grand_total||0),paid:Number(x.paid_amount||0),remaining:Number(x.remaining_amount||0),status:Number(x.remaining_amount||0)>0?"غير مكتملة":"مدفوعة",
      purchaseMode:String(x.purchase_mode||"cash"),paymentMethod:String(x.payment_method||"cash"),delivery:Number(x.delivery_cost||0),other:Number(x.other_costs||0),subtotal:Number(x.items_subtotal||0),notes:String(x.notes||""),createdAt:String(x.created_at||""),
      items:(x.purchase_invoice_items||[]).map((i:any)=>({id:String(i.id),name:String(i.item_name_snapshot||""),detail:String(i.detail_name_snapshot||""),quantity:Number(i.quantity||0),unit:Number(i.unit_purchase_price||0),subtotal:Number(i.line_subtotal||0),kind:String(i.item_kind||""),notes:String(i.notes||"")}))
    })));
    setLoading(false);
  }
  const filtered=useMemo(()=>rows.filter(r=>`${r.no} ${r.supplier}`.toLowerCase().includes(q.toLowerCase())),[rows,q]);
  return <div dir="rtl" className="space-y-6 p-4 md:p-8">
    <header><h1 className="text-3xl font-black">فواتير المشتريات</h1><p className="mt-2 text-gray-500">فواتير {selectedBranch?.name||"كل الفروع"}</p></header>
    <input className="w-full rounded-xl border p-3" placeholder="بحث برقم الفاتورة أو المورد" value={q} onChange={e=>setQ(e.target.value)}/>
    {loading?<p>جاري التحميل...</p>:<div className="overflow-x-auto rounded-2xl bg-white shadow"><table className="w-full min-w-[900px] text-right"><thead><tr className="bg-gray-50"><th className="p-4">الفاتورة</th><th>التاريخ</th><th>المورد</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th><th>الحالة</th><th>التفاصيل</th></tr></thead><tbody>{filtered.map(r=><tr key={r.id} className="border-b"><td className="p-4 font-bold">#{r.no}</td><td>{r.date}</td><td>{r.supplier}</td><td>{r.total.toFixed(2)}</td><td>{r.paid.toFixed(2)}</td><td>{r.remaining.toFixed(2)}</td><td>{r.status}</td><td><button onClick={()=>setSelected(r)} className="rounded-lg bg-emerald-50 px-3 py-2 font-bold text-emerald-700">فتح التفاصيل</button></td></tr>)}</tbody></table></div>}
    {selected&&<div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"><div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-5"><div className="flex justify-between"><div><h2 className="text-2xl font-black">فاتورة #{selected.no}</h2><p className="text-gray-500">{selected.supplier} — {selected.date}</p></div><button onClick={()=>setSelected(null)}>✕</button></div>
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">{[["إجمالي المنتجات",selected.subtotal],["التوصيل",selected.delivery],["مصاريف أخرى",selected.other],["الإجمالي",selected.total],["المدفوع",selected.paid],["المتبقي",selected.remaining]].map(([l,v])=><div key={String(l)} className="rounded-xl bg-gray-50 p-3"><p className="text-xs text-gray-500">{l}</p><p className="font-black">{Number(v).toFixed(2)} د.ل</p></div>)}</div>
      <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[700px]"><thead className="bg-gray-100"><tr><th className="p-3 text-right">الصنف</th><th>التفصيل</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th><th>ملاحظات</th></tr></thead><tbody>{selected.items.map(i=><tr key={i.id} className="border-b"><td className="p-3 font-bold">{i.name}</td><td>{i.detail}</td><td>{i.quantity}</td><td>{i.unit.toFixed(2)}</td><td>{i.subtotal.toFixed(2)}</td><td>{i.notes||"-"}</td></tr>)}</tbody></table></div>
      <div className="mt-5 rounded-xl bg-gray-50 p-4"><p><b>نوع الشراء:</b> {selected.purchaseMode}</p><p><b>طريقة الدفع:</b> {selected.paymentMethod}</p><p><b>الملاحظات:</b> {selected.notes||"لا توجد"}</p></div>
    </div></div>}
  </div>
}
