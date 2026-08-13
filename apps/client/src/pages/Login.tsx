import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type LoginProps = { onLogin: () => void };
const USERNAME_KEY = "mood.rememberedUsername";

export default function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberUsername, setRememberUsername] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(USERNAME_KEY);
    if (saved) setUsername(saved);
  }, []);

  async function login() {
    const cleanUsername = username.trim();
    if (!cleanUsername || !password) {
      alert("اكتب اسم المستخدم وكلمة المرور");
      return;
    }
    setLoading(true);
    const email = cleanUsername.includes("@") ? cleanUsername.toLowerCase() : `${cleanUsername.toLowerCase()}@mood.local`;
    try {
      // نغلق أي جلسة محلية قديمة أولًا حتى لا يظل التطبيق على حساب سابق.
      await supabase.auth.signOut({ scope: "local" });
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data.user) {
        alert("اسم المستخدم أو كلمة المرور غير صحيحة");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("user_profiles")
        .select("id,is_active")
        .eq("id", data.user.id)
        .maybeSingle();

      if (profileError || !profile) {
        await supabase.auth.signOut({ scope: "local" });
        alert("الحساب غير مربوط بملف مستخدم داخل المنظومة");
        return;
      }
      if (profile.is_active === false) {
        await supabase.auth.signOut({ scope: "local" });
        alert("هذا الحساب معطل");
        return;
      }

      if (rememberUsername) localStorage.setItem(USERNAME_KEY, cleanUsername);
      else localStorage.removeItem(USERNAME_KEY);
      await onLogin();
    } finally {
      setLoading(false);
    }
  }

  return <div className="flex min-h-screen items-center justify-center bg-emerald-950 p-6" dir="rtl">
    <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl">
      <h1 className="mb-2 text-center text-5xl font-bold text-emerald-800">MOOD</h1>
      <p className="mb-8 text-center text-gray-500">تسجيل الدخول إلى المنظومة</p>
      <form className="space-y-4" onSubmit={(e)=>{e.preventDefault(); void login();}}>
        <input value={username} autoComplete="username" onChange={(e)=>setUsername(e.target.value)} className="w-full rounded-xl border p-3" placeholder="اسم المستخدم" />
        <div className="relative">
          <input type={showPassword ? "text" : "password"} value={password} autoComplete="current-password" onChange={(e)=>setPassword(e.target.value)} className="w-full rounded-xl border p-3 pl-20" placeholder="كلمة المرور" />
          <button type="button" onClick={()=>setShowPassword(v=>!v)} className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-emerald-700">{showPassword?"إخفاء":"إظهار"}</button>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <input type="checkbox" checked={rememberUsername} onChange={e=>setRememberUsername(e.target.checked)} />
          تذكّر اسم المستخدم والدخول السريع
        </label>
        <p className="text-xs text-gray-500">كلمة المرور لا تُحفظ داخل المنظومة؛ جلسة Supabase الآمنة تبقى فعّالة حتى تسجيل الخروج.</p>
        <button type="submit" disabled={loading} className="w-full rounded-xl bg-emerald-700 p-3 font-bold text-white hover:bg-emerald-800 disabled:opacity-60">{loading?"جاري الدخول...":"دخول"}</button>
      </form>
    </div>
  </div>;
}
