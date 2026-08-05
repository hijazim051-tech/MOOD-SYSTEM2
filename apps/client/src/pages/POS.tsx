import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useBranch } from "../context/BranchContext";

type POSProps = { setPage: (page: string) => void };
export default function POS({ setPage }: POSProps) {
  const { effectiveBranchId } = useBranch();
  const [stats,setStats]=useState({today:0,packaging:0,ready:0,delivery:0,sales:0});
  useEffect(()=>{void load()},[effectiveBranchId]);
  async function load(){const start=new Date();start.setHours(0,0,0,0);let q=supabase.from("orders").select("id,status,total,created_at,branch_id").gte("created_at",start.toISOString());const {data}=await q;const rows=effectiveBranchId?(data||[]).filter((r:any)=>String(r.branch_id||"")===effectiveBranchId):(data||[]);setStats({today:rows.length,packaging:rows.filter((r:any)=>r.status==="packaging").length,ready:rows.filter((r:any)=>r.status==="ready").length,delivery:rows.filter((r:any)=>r.status==="out_for_delivery").length,sales:rows.reduce((s:number,r:any)=>s+Number(r.total||0),0)})}
  return <div className="space-y-5 p-3 sm:p-6 lg:p-8" dir="rtl">
    <header className="rounded-3xl bg-gradient-to-l from-emerald-800 to-teal-600 p-5 text-white"><h1 className="text-2xl font-black sm:text-3xl">واجهة الموظف</h1><p className="mt-1 text-emerald-50">شاشة بسيطة للطلبات اليومية والعمليات الأساسية.</p><button onClick={()=>setPage("new-order")} className="mt-5 w-full rounded-2xl bg-white px-6 py-4 text-xl font-black text-emerald-800 shadow sm:w-auto">➕ طلب جديد</button></header>
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">{[["طلبات اليوم",stats.today,"orders"],["قيد التغليف",stats.packaging,"packaging"],["جاهز",stats.ready,"orders"],["خرج للتوصيل",stats.delivery,"orders"],["مبيعات اليوم",`${stats.sales.toFixed(2)} د.ل`,"orders"]].map(([label,value,page])=><button key={String(label)} onClick={()=>setPage(String(page))} className="rounded-2xl bg-white p-4 text-right shadow-sm"><p className="text-sm font-bold text-gray-500">{label}</p><p className="mt-2 text-2xl font-black text-emerald-700">{value}</p></button>)}</section>
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Quick label="البحث عن طلب" icon="🔎" onClick={()=>setPage("orders")}/><Quick label="الحضور والانصراف" icon="📍" onClick={()=>setPage("attendance")}/><Quick label="طلبات جاهزة" icon="✅" onClick={()=>setPage("orders")}/><Quick label="استلام مندوب" icon="🚚" onClick={()=>setPage("orders")}/></section>
  </div>
}
function Quick({label,icon,onClick}:{label:string;icon:string;onClick:()=>void}){return <button onClick={onClick} className="flex min-h-24 items-center gap-4 rounded-2xl bg-white p-5 text-right shadow-sm transition active:scale-[.98]"><span className="text-3xl">{icon}</span><span className="font-black text-gray-800">{label}</span></button>}
