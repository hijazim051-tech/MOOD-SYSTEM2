import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useBranch } from "../context/BranchContext";
import { getBranchStock } from "../lib/branchStock";

type InventoryItem = {
  id: number; categoryId: number; categoryName: string; productName: string; detailName: string;
  stock: number; alertLimit: number; averageUnitCost: number; inventoryValue: number; materialType: string;
};

type FilterKey = "all" | "natural" | "boxes" | "artificial" | "wrapping" | "additions" | "low" | "out";

export default function Inventory() {
  const { effectiveBranchId, selectedBranchId, branches } = useBranch();
  const [items,setItems]=useState<InventoryItem[]>([]),[loading,setLoading]=useState(true),[search,setSearch]=useState(""),[filter,setFilter]=useState<FilterKey>("all");

  useEffect(()=>{void loadInventory()},[effectiveBranchId,selectedBranchId]);

  async function loadInventory(){
    setLoading(true);
    try{
      const [{data:details,error:de},{data:products,error:pe},{data:categories,error:ce},stocks]=await Promise.all([
        supabase.from("product_details").select("id,product_id,name,color,buy_price,average_unit_cost,material_type").order("name"),
        supabase.from("products").select("id,category_id,name"),
        supabase.from("categories").select("id,name"),
        getBranchStock(effectiveBranchId),
      ]);
      if(de)throw de;if(pe)throw pe;if(ce)throw ce;
      const productMap=new Map((products||[]).map((x:any)=>[Number(x.id),x]));
      const categoryMap=new Map((categories||[]).map((x:any)=>[Number(x.id),String(x.name||"")]));
      const stockMap=new Map<number,{stock:number;alert:number;cost:number}>();
      for(const row of stocks){const current=stockMap.get(row.productDetailId)||{stock:0,alert:0,cost:0};current.stock+=row.stock;current.alert=Math.max(current.alert,row.alertLimit);current.cost=row.averageUnitCost||current.cost;stockMap.set(row.productDetailId,current)}
      setItems((details||[]).map((d:any)=>{const p:any=productMap.get(Number(d.product_id));const s=stockMap.get(Number(d.id))||{stock:0,alert:0,cost:Number(d.average_unit_cost||d.buy_price||0)};return{id:Number(d.id),categoryId:Number(p?.category_id||0),categoryName:categoryMap.get(Number(p?.category_id))||"",productName:String(p?.name||""),detailName:String(d.color||d.name||""),stock:s.stock,alertLimit:s.alert,averageUnitCost:s.cost,inventoryValue:s.stock*s.cost,materialType:String(d.material_type||"")}}));
    }catch(e){alert(e instanceof Error?e.message:"تعذر تحميل المخزون. شغّل ملف SQL الخاص بفصل الفروع أولًا.")}finally{setLoading(false)}
  }

  const filtered=useMemo(()=>items.filter(i=>{const text=`${i.categoryName} ${i.productName} ${i.detailName} ${i.materialType}`.toLowerCase();if(search.trim()&&!text.includes(search.trim().toLowerCase()))return false;if(filter==="low")return i.stock>0&&i.stock<=i.alertLimit;if(filter==="out")return i.stock<=0;if(filter==="natural")return i.categoryId===85;if(filter==="boxes")return i.categoryId===88;if(filter==="wrapping")return i.categoryId===87;if(filter==="artificial")return i.categoryId===86;if(filter==="additions")return /اكسسوار|إكسسوار|اضافة|إضافة|شريط|بطاقة|فازة|سلة/.test(text);return true}),[items,search,filter]);
  const stats=useMemo(()=>({units:items.reduce((s,x)=>s+x.stock,0),value:items.reduce((s,x)=>s+x.inventoryValue,0),low:items.filter(x=>x.stock>0&&x.stock<=x.alertLimit).length,out:items.filter(x=>x.stock<=0).length}),[items]);
  const scopeName=effectiveBranchId?branches.find(b=>b.id===effectiveBranchId)?.name||"الفرع":"كل الفروع (إجمالي)";

  if(loading)return <div className="p-8 text-2xl font-bold">جاري تحميل مخزون {scopeName}...</div>;
  return <div dir="rtl" className="space-y-6 p-4 md:p-8">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl font-black">المخزون — {scopeName}</h1><p className="text-gray-500">كل كمية معروضة تخص الفرع المختار فقط.</p></div><button onClick={()=>void loadInventory()} className="rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white">تحديث</button></header>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4"><Card t="إجمالي الوحدات" v={stats.units.toFixed(0)}/><Card t="قيمة المخزون" v={`${stats.value.toFixed(2)} د.ل`}/><Card t="مخزون منخفض" v={String(stats.low)}/><Card t="نافد" v={String(stats.out)}/></div>
    <section className="flex flex-wrap gap-2 rounded-2xl bg-white p-4 shadow"><input className="min-w-[240px] flex-1 rounded-xl border p-3" placeholder="بحث..." value={search} onChange={e=>setSearch(e.target.value)}/>{(["all","natural","boxes","artificial","wrapping","additions","low","out"] as FilterKey[]).map(k=><button key={k} onClick={()=>setFilter(k)} className={`rounded-xl px-3 py-2 font-bold ${filter===k?"bg-emerald-700 text-white":"bg-gray-100"}`}>{({all:"الكل",natural:"طبيعي",boxes:"بوكسات",artificial:"صناعي",wrapping:"تغليف",additions:"إضافات",low:"منخفض",out:"نافد"} as any)[k]}</button>)}</section>
    <section className="overflow-x-auto rounded-2xl bg-white shadow"><table className="w-full min-w-[800px] text-right"><thead><tr className="border-b bg-gray-50"><Th>الفئة</Th><Th>المنتج</Th><Th>التفصيل</Th><Th>الكمية</Th><Th>حد التنبيه</Th><Th>متوسط التكلفة</Th><Th>القيمة</Th></tr></thead><tbody>{filtered.map(x=><tr key={x.id} className="border-b"><Td>{x.categoryName}</Td><Td>{x.productName}</Td><Td>{x.detailName}</Td><Td><b className={x.stock<=0?"text-red-700":x.stock<=x.alertLimit?"text-orange-700":"text-emerald-700"}>{x.stock}</b></Td><Td>{x.alertLimit}</Td><Td>{x.averageUnitCost.toFixed(2)}</Td><Td>{x.inventoryValue.toFixed(2)} د.ل</Td></tr>)}</tbody></table></section>
  </div>;
}
function Card({t,v}:{t:string;v:string}){return <div className="rounded-2xl bg-white p-5 shadow"><p className="text-sm text-gray-500">{t}</p><p className="mt-2 text-2xl font-black">{v}</p></div>}
function Th({children}:{children:any}){return <th className="p-3">{children}</th>}function Td({children}:{children:any}){return <td className="p-3">{children}</td>}
