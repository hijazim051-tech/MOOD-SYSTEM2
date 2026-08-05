import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useBranch } from "../context/BranchContext";
import { getUsers } from "../lib/users";

type Employee = { id:string; name:string; role:string; phone:string; active:boolean; withdrawals:number; absences:number };

export default function Employees() {
  const { effectiveBranchId } = useBranch();
  const [rows,setRows] = useState<Employee[]>([]);
  const [loading,setLoading] = useState(true);
  const [search,setSearch] = useState("");
  const [errorText,setErrorText] = useState("");

  useEffect(()=>{ void load(); },[effectiveBranchId]);

  async function load(){
    setLoading(true); setErrorText("");
    try {
      const allUsers = await getUsers();
      const users = allUsers.filter((u)=> !effectiveBranchId || String(u.branch_id || "") === effectiveBranchId);
      const ids = users.map((u)=>String(u.id));
      const [wResult,aResult] = await Promise.all([
        ids.length ? supabase.from("employee_withdrawals").select("user_id,amount,status").in("user_id",ids) : Promise.resolve({data:[],error:null}),
        ids.length ? supabase.from("employee_absences").select("user_id,status").in("user_id",ids) : Promise.resolve({data:[],error:null}),
      ]);
      const wm=new Map<string,number>(), am=new Map<string,number>();
      (wResult.data||[]).filter((x:any)=>!x.status || x.status==="approved").forEach((x:any)=>wm.set(String(x.user_id),(wm.get(String(x.user_id))||0)+Number(x.amount||0)));
      (aResult.data||[]).filter((x:any)=>x.status==="absent").forEach((x:any)=>am.set(String(x.user_id),(am.get(String(x.user_id))||0)+1));
      setRows(users.map((u)=>({
        id:String(u.id), name:String(u.full_name||u.username||u.email||"موظف"), role:String(u.roles?.name||"employee"),
        phone:"", active:Boolean(u.is_active), withdrawals:wm.get(String(u.id))||0, absences:am.get(String(u.id))||0,
      })));
      if (wResult.error) console.warn(wResult.error.message);
      if (aResult.error) console.warn(aResult.error.message);
    } catch(error) {
      setErrorText(error instanceof Error ? error.message : "تعذر تحميل الموظفين");
    } finally { setLoading(false); }
  }

  const filtered=useMemo(()=>rows.filter(x=>`${x.name} ${x.role} ${x.phone}`.toLowerCase().includes(search.toLowerCase())),[rows,search]);
  const total=rows.reduce((sum,x)=>sum+x.withdrawals,0);
  return <div dir="rtl" className="space-y-5 p-3 sm:p-6 lg:p-8">
    <header><h1 className="text-2xl font-black sm:text-3xl">الموظفون</h1><p className="mt-1 text-sm text-gray-500">كل المستخدمين المسجلين في الفرع يظهرون هنا تلقائيًا.</p></header>
    {errorText && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700"><b>تعذر تحميل الموظفين:</b> {errorText}<button onClick={()=>void load()} className="mr-3 rounded-lg bg-red-700 px-3 py-1 text-white">إعادة المحاولة</button></div>}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Card title="الموظفون" value={rows.length}/><Card title="النشطون" value={rows.filter(x=>x.active).length}/><Card title="الغياب المسجل" value={rows.reduce((s,x)=>s+x.absences,0)}/><Card title="إجمالي المسحوبات" value={`${total.toFixed(2)} د.ل`}/></div>
    <section className="rounded-2xl bg-white p-4 shadow-sm"><input className="w-full rounded-xl border p-3" placeholder="بحث بالاسم أو الوظيفة" value={search} onChange={e=>setSearch(e.target.value)}/></section>
    {loading?<div className="p-8 text-center">جاري التحميل...</div>:<section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{filtered.map(x=><article key={x.id} className="rounded-2xl bg-white p-4 shadow-sm"><div className="flex items-start justify-between"><div><h3 className="text-lg font-black">{x.name}</h3><p className="text-sm text-gray-500">{x.role}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${x.active?"bg-green-100 text-green-700":"bg-red-100 text-red-700"}`}>{x.active?"نشط":"موقوف"}</span></div><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl bg-red-50 p-3"><p className="text-xs text-gray-500">الغياب</p><strong className="text-red-700">{x.absences} يوم</strong></div><div className="rounded-xl bg-amber-50 p-3"><p className="text-xs text-gray-500">المسحوبات</p><strong className="text-amber-700">{x.withdrawals.toFixed(2)} د.ل</strong></div></div></article>)}</section>}
  </div>;
}
function Card({title,value}:{title:string;value:string|number}){return <div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs text-gray-500 sm:text-sm">{title}</p><p className="mt-2 text-xl font-black text-emerald-700 sm:text-2xl">{value}</p></div>}
