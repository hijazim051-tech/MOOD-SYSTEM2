import { useEffect, useState } from "react";
import type { UserProfile } from "../../lib/users";
import { getBranches } from "../../lib/users";
import {
  NOTIFICATION_EVENTS,
  getUserNotificationPreferences,
  saveUserNotificationPreferences,
  type UserNotificationPreference,
} from "../../lib/notificationPreferences";

type Props = { open: boolean; user: UserProfile | null; onClose: () => void };

type Branch = { id: string; name: string };

export default function UserNotificationsDialog({ open, user, onClose }: Props) {
  const [rows, setRows] = useState<UserNotificationPreference[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    void load();
  }, [open, user?.id]);

  async function load() {
    if (!user) return;
    setLoading(true);
    try {
      const [saved, branchData] = await Promise.all([
        getUserNotificationPreferences(user.id),
        getBranches(),
      ]);
      setBranches(branchData);
      const map = new Map(saved.map((x) => [x.event_key, x]));
      setRows(
        NOTIFICATION_EVENTS.map(([event_key]) =>
          map.get(event_key) || {
            event_key,
            enabled: true,
            in_app: true,
            push_enabled: true,
            branch_id: user.branch_id || null,
          }
        )
      );
    } catch (error) {
      alert(error instanceof Error ? error.message : "تعذر تحميل الإشعارات");
    } finally {
      setLoading(false);
    }
  }

  function update(key: string, patch: Partial<UserNotificationPreference>) {
    setRows((current) => current.map((r) => (r.event_key === key ? { ...r, ...patch } : r)));
  }

  async function save() {
    if (!user) return;
    setSaving(true);
    try {
      await saveUserNotificationPreferences(user.id, rows);
      alert("تم حفظ إشعارات المستخدم ✅");
      onClose();
    } catch (error) {
      alert(error instanceof Error ? error.message : "تعذر الحفظ");
    } finally {
      setSaving(false);
    }
  }

  if (!open || !user) return null;
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4" dir="rtl">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <div><h2 className="text-2xl font-black">إشعارات {user.full_name || user.username}</h2><p className="text-sm text-gray-500">تحكم مستقل لكل مستخدم ونوع إشعار وفرع.</p></div>
          <button onClick={onClose} className="rounded-lg bg-red-100 px-4 py-2 text-red-700">✕</button>
        </div>
        {loading ? <div className="p-10 text-center">جاري التحميل...</div> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-right"><thead><tr className="bg-emerald-800 text-white"><th className="p-3">الإشعار</th><th className="p-3">تشغيل</th><th className="p-3">داخل المنظومة</th><th className="p-3">Push</th><th className="p-3">الفرع</th></tr></thead><tbody>
            {rows.map((row) => { const label=NOTIFICATION_EVENTS.find(([k])=>k===row.event_key)?.[1] || row.event_key; return <tr key={row.event_key} className="border-b"><td className="p-3 font-bold">{label}</td><td className="p-3"><input type="checkbox" checked={row.enabled} onChange={e=>update(row.event_key,{enabled:e.target.checked})}/></td><td className="p-3"><input type="checkbox" checked={row.in_app} disabled={!row.enabled} onChange={e=>update(row.event_key,{in_app:e.target.checked})}/></td><td className="p-3"><input type="checkbox" checked={row.push_enabled} disabled={!row.enabled} onChange={e=>update(row.event_key,{push_enabled:e.target.checked})}/></td><td className="p-3"><select className="rounded-lg border p-2" value={row.branch_id || ""} onChange={e=>update(row.event_key,{branch_id:e.target.value||null})}><option value="">كل الفروع</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></td></tr> })}
          </tbody></table></div>
        )}
        <div className="mt-5 flex justify-end gap-3"><button onClick={onClose} className="rounded-xl bg-gray-100 px-5 py-3">إلغاء</button><button onClick={()=>void save()} disabled={saving||loading} className="rounded-xl bg-emerald-700 px-6 py-3 font-bold text-white disabled:opacity-50">{saving?"جاري الحفظ...":"حفظ الإعدادات"}</button></div>
      </div>
    </div>
  );
}
