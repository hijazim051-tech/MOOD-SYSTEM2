import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type OrderRow = {
  id: number;
  customer_name: string | null;
  customer_phone: string | null;
  total: number | null;
  profit: number | null;
  status: string | null;
  created_at: string;
  branch_id?: string | null;
};

type CustomerRow = {
  id: number;
  name: string;
  phone: string;
  loyalty_points: number;
  rating: number;
  marketing_opt_in: boolean;
  birthday: string | null;
  anniversary: string | null;
  last_contact_at: string | null;
};

type BranchRow = { id: string; name: string };
type UserRow = { id: string; full_name: string | null; branch_id: string | null };
type AttendanceRow = { user_id: string; attendance_date: string; check_in_at: string | null; check_out_at: string | null; status: string | null };

type TabKey = "overview" | "crm" | "loyalty" | "branches" | "payroll" | "automation";

const money = new Intl.NumberFormat("ar-LY", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function dateKey(value: string | Date) {
  const d = value instanceof Date ? value : new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function GrowthCenter() {
  const [tab, setTab] = useState<TabKey>("overview");
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(null);
  const [points, setPoints] = useState(0);
  const [pointsReason, setPointsReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { void loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [o, c, b, u, a] = await Promise.all([
        supabase.from("orders").select("id,customer_name,customer_phone,total,profit,status,created_at,branch_id").order("created_at", { ascending: false }),
        supabase.from("customers").select("id,name,phone,loyalty_points,rating,marketing_opt_in,birthday,anniversary,last_contact_at").order("updated_at", { ascending: false }),
        supabase.from("branches").select("id,name").eq("is_active", true).order("name"),
        supabase.from("user_profiles").select("id,full_name,branch_id").eq("is_active", true).order("full_name"),
        supabase.from("attendance_records").select("user_id,attendance_date,check_in_at,check_out_at,status").order("attendance_date", { ascending: false }).limit(2000),
      ]);
      if (o.error) throw o.error;
      if (c.error) throw c.error;
      if (b.error) throw b.error;
      if (u.error) throw u.error;
      if (a.error) throw a.error;
      setOrders((o.data || []) as OrderRow[]);
      setCustomers((c.data || []) as CustomerRow[]);
      setBranches((b.data || []) as BranchRow[]);
      setUsers((u.data || []) as UserRow[]);
      setAttendance((a.data || []) as AttendanceRow[]);
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "تعذر تحميل مركز النمو");
    } finally { setLoading(false); }
  }

  const activeOrders = useMemo(() => orders.filter(o => !["cancelled", "returned"].includes(String(o.status || "").toLowerCase())), [orders]);
  const today = dateKey(new Date());
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
  const thisMonth = useMemo(() => activeOrders.filter(o => new Date(o.created_at) >= monthStart), [activeOrders]);
  const salesMonth = thisMonth.reduce((s,o) => s + Number(o.total || 0), 0);
  const profitMonth = thisMonth.reduce((s,o) => s + Number(o.profit || 0), 0);
  const todaySales = activeOrders.filter(o => dateKey(o.created_at) === today).reduce((s,o) => s + Number(o.total || 0), 0);

  const customerStats = useMemo(() => {
    const map = new Map<string, { count:number; spent:number; last:string; name:string }>();
    for (const o of activeOrders) {
      const phone = String(o.customer_phone || "").trim();
      if (!phone) continue;
      const old = map.get(phone) || { count:0, spent:0, last:o.created_at, name:String(o.customer_name || "عميل") };
      old.count += 1; old.spent += Number(o.total || 0);
      if (new Date(o.created_at) > new Date(old.last)) old.last = o.created_at;
      map.set(phone, old);
    }
    return map;
  }, [activeOrders]);

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter(c => !q || `${c.name} ${c.phone}`.toLowerCase().includes(q));
  }, [customers, search]);

  const branchStats = useMemo(() => branches.map(branch => {
    const branchOrders = activeOrders.filter(o => o.branch_id === branch.id);
    return {
      ...branch,
      orders: branchOrders.length,
      sales: branchOrders.reduce((s,o) => s + Number(o.total || 0), 0),
      profit: branchOrders.reduce((s,o) => s + Number(o.profit || 0), 0),
    };
  }).sort((a,b) => b.sales - a.sales), [branches, activeOrders]);

  const payroll = useMemo(() => users.map(user => {
    const rows = attendance.filter(a => a.user_id === user.id);
    let minutes = 0;
    for (const r of rows) {
      if (!r.check_in_at || !r.check_out_at) continue;
      const diff = (new Date(r.check_out_at).getTime() - new Date(r.check_in_at).getTime()) / 60000;
      if (diff > 0 && diff < 1440) minutes += diff;
    }
    return { ...user, days: new Set(rows.map(r => r.attendance_date)).size, hours: minutes / 60 };
  }).sort((a,b) => b.hours - a.hours), [users, attendance]);

  async function applyPoints() {
    if (!selectedCustomer || !points || !pointsReason.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc("adjust_customer_loyalty_points", {
        p_customer_id: selectedCustomer.id,
        p_points: points,
        p_reason: pointsReason.trim(),
      });
      if (error) throw error;
      setPoints(0); setPointsReason(""); setSelectedCustomer(null);
      await loadAll();
    } catch (error) { alert(error instanceof Error ? error.message : "تعذر تعديل النقاط"); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="p-8 text-xl font-bold">جاري تحميل مركز النمو...</div>;

  const tabs: Array<[TabKey,string]> = [
    ["overview","نظرة شاملة"],["crm","CRM العملاء"],["loyalty","الولاء والكوبونات"],["branches","مقارنة الفروع"],["payroll","الحضور والرواتب"],["automation","الأتمتة"],
  ];

  return <div className="p-4 md:p-8 space-y-6" dir="rtl">
    <div>
      <h1 className="text-3xl font-black">🚀 مركز النمو والتحليلات</h1>
      <p className="text-gray-500 mt-1">العملاء، الولاء، الفروع، الحضور، والتنبيهات الذكية في مكان واحد.</p>
    </div>

    <div className="flex flex-wrap gap-2">
      {tabs.map(([key,label]) => <button key={key} onClick={() => setTab(key)} className={`px-4 py-2 rounded-xl font-bold ${tab===key ? "bg-black text-white" : "bg-white border"}`}>{label}</button>)}
    </div>

    {tab === "overview" && <>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card title="مبيعات اليوم" value={`${money.format(todaySales)} د.ل`} />
        <Card title="مبيعات الشهر" value={`${money.format(salesMonth)} د.ل`} />
        <Card title="ربح الشهر" value={`${money.format(profitMonth)} د.ل`} />
        <Card title="العملاء" value={String(customers.length)} />
        <Card title="مشتركو التسويق" value={String(customers.filter(c=>c.marketing_opt_in).length)} />
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <Section title="أفضل العملاء">
          {[...customers].sort((a,b)=>(customerStats.get(b.phone)?.spent||0)-(customerStats.get(a.phone)?.spent||0)).slice(0,8).map(c => {
            const s = customerStats.get(c.phone);
            return <Row key={c.id} left={`${c.name} — ${s?.count || 0} طلب`} right={`${money.format(s?.spent || 0)} د.ل`} />;
          })}
        </Section>
        <Section title="تنبيهات ذكية">
          <Insight text={`${customers.filter(c=>!c.last_contact_at || (Date.now()-new Date(c.last_contact_at).getTime())>90*86400000).length} عميل لم يتم التواصل معه منذ أكثر من 90 يومًا.`} />
          <Insight text={`${customers.filter(c=>c.loyalty_points>=100).length} عميل وصل إلى 100 نقطة أو أكثر ويمكن منحه مكافأة.`} />
          <Insight text={`${branchStats.filter(b=>b.orders===0).length} فرع بدون طلبات مسجلة في البيانات الحالية.`} />
          <Insight text={`${activeOrders.filter(o=>Number(o.profit||0)<0).length} طلب بربح سالب يحتاج مراجعة.`} />
        </Section>
      </div>
    </>}

    {tab === "crm" && <Section title="ملفات العملاء">
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ابحث بالاسم أو الهاتف" className="w-full border rounded-xl p-3 mb-4" />
      <div className="overflow-auto"><table className="w-full text-sm"><thead><tr className="border-b text-right"><th className="p-2">العميل</th><th>الطلبات</th><th>إجمالي الشراء</th><th>النقاط</th><th>التقييم</th><th>تسويق</th></tr></thead><tbody>
        {filteredCustomers.map(c => { const s=customerStats.get(c.phone); return <tr key={c.id} className="border-b"><td className="p-2 font-bold">{c.name}<div className="text-xs text-gray-500">{c.phone}</div></td><td>{s?.count||0}</td><td>{money.format(s?.spent||0)} د.ل</td><td>{c.loyalty_points}</td><td>{c.rating}/5</td><td>{c.marketing_opt_in?"نعم":"لا"}</td></tr>})}
      </tbody></table></div>
    </Section>}

    {tab === "loyalty" && <div className="grid lg:grid-cols-2 gap-4">
      <Section title="تعديل نقاط عميل">
        <select className="w-full border rounded-xl p-3 mb-3" value={selectedCustomer?.id || ""} onChange={e=>setSelectedCustomer(customers.find(c=>c.id===Number(e.target.value))||null)}><option value="">اختر العميل</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name} — {c.phone} — {c.loyalty_points} نقطة</option>)}</select>
        <input type="number" value={points} onChange={e=>setPoints(Number(e.target.value))} placeholder="النقاط: موجب للإضافة وسالب للخصم" className="w-full border rounded-xl p-3 mb-3" />
        <input value={pointsReason} onChange={e=>setPointsReason(e.target.value)} placeholder="السبب" className="w-full border rounded-xl p-3 mb-3" />
        <button disabled={saving||!selectedCustomer||!points||!pointsReason.trim()} onClick={applyPoints} className="w-full bg-black text-white rounded-xl p-3 font-bold disabled:opacity-40">حفظ الحركة</button>
      </Section>
      <Section title="قواعد مقترحة">
        <Insight text="نقطة واحدة لكل 10 د.ل مبيعات، مع إمكانية التعديل اليدوي من هذه الصفحة." />
        <Insight text="يمكن إنشاء كوبونات بتاريخ انتهاء وحد استخدام من جدول coupons في قاعدة البيانات." />
        <Insight text="العملاء الموافقون على التسويق فقط هم المؤهلون لحملات واتساب الجماعية." />
      </Section>
    </div>}

    {tab === "branches" && <Section title="أداء الفروع">
      {branchStats.map((b,i)=><div key={b.id} className="grid grid-cols-4 gap-2 border-b py-3"><div className="font-bold">#{i+1} {b.name}</div><div>{b.orders} طلب</div><div>{money.format(b.sales)} د.ل مبيعات</div><div>{money.format(b.profit)} د.ل ربح</div></div>)}
      {!branchStats.length && <p className="text-gray-500">أضف الفروع واربط الطلبات بها لتظهر المقارنة.</p>}
    </Section>}

    {tab === "payroll" && <Section title="ملخص ساعات الحضور">
      <p className="text-sm text-gray-500 mb-4">هذه الصفحة تعرض الساعات الفعلية. قيمة الراتب والساعة تحفظ في إعدادات الموظف/جدول payroll_settings.</p>
      {payroll.map(p=><Row key={p.id} left={`${p.full_name||"موظف"} — ${p.days} يوم حضور`} right={`${p.hours.toFixed(1)} ساعة`} />)}
    </Section>}

    {tab === "automation" && <div className="grid lg:grid-cols-2 gap-4">
      <Section title="واتساب">
        <Insight text="القوالب وسجل الإرسال جاهزان. الإرسال التلقائي دون فتح واتساب يحتاج حساب WhatsApp Business API ومفتاح وصول رسمي." />
        <Insight text="يمكن استخدام قوالب: تأكيد الطلب، جاهز للاستلام، خرج للتوصيل، شكر بعد التسليم، وتذكير بالمناسبة." />
      </Section>
      <Section title="الإشعارات والملخصات">
        <Insight text="تفضيلات كل مستخدم، الملخص اليومي/الأسبوعي، وقت عدم الإزعاج، ومنع التكرار مدعومة في قاعدة البيانات." />
        <Insight text="تشغيل الإرسال المجدول فعليًا يحتاج Cron/Edge Function في Supabase بعد اختيار أوقات الإرسال النهائية." />
      </Section>
    </div>}
  </div>;
}

function Card({title,value}:{title:string;value:string}) { return <div className="bg-white border rounded-2xl p-4 shadow-sm"><div className="text-xs text-gray-500">{title}</div><div className="text-xl font-black mt-2">{value}</div></div>; }
function Section({title,children}:{title:string;children:React.ReactNode}) { return <section className="bg-white border rounded-2xl p-5 shadow-sm"><h2 className="text-xl font-black mb-4">{title}</h2>{children}</section>; }
function Row({left,right}:{left:string;right:string}) { return <div className="flex items-center justify-between gap-3 border-b py-3 last:border-0"><span>{left}</span><strong>{right}</strong></div>; }
function Insight({text}:{text:string}) { return <div className="rounded-xl bg-gray-50 border p-3 mb-2">💡 {text}</div>; }
