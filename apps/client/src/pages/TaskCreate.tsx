import { useEffect, useState } from "react";
import { useBranch } from "../context/BranchContext";
import { supabase } from "../lib/supabase";

type User = { id: string; name: string };
type Priority = "normal" | "important" | "urgent";

const inputClass =
  "w-full rounded-xl border border-gray-200 bg-white p-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";

export default function TaskCreate() {
  const { effectiveBranchId } = useBranch();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const [dueAt, setDueAt] = useState("");

  useEffect(() => {
    void loadUsers();
  }, [effectiveBranchId]);

  async function loadUsers() {
    setLoading(true);
    let query = supabase
      .from("user_profiles")
      .select("id,full_name,branch_id")
      .eq("is_active", true)
      .order("full_name");

    if (effectiveBranchId) query = query.eq("branch_id", effectiveBranchId);

    const { data, error } = await query;
    if (error) alert(error.message);
    else {
      setUsers(
        (data || []).map((row: any) => ({
          id: String(row.id),
          name: String(row.full_name || "مستخدم"),
        }))
      );
    }
    setLoading(false);
  }

  async function addTask() {
    if (!effectiveBranchId) return alert("اختار فرعًا محددًا أولًا");
    if (!title.trim()) return alert("اكتب عنوان المهمة");

    setSaving(true);
    const selectedUser = users.find((user) => user.id === assignedTo);
    const {
      data: { user: me },
    } = await supabase.auth.getUser();

    const { error } = await supabase.from("tasks").insert({
      title: title.trim(),
      description: description.trim(),
      assigned_to: assignedTo || null,
      assigned_to_name: selectedUser?.name || "كل الموظفين",
      priority,
      due_at: dueAt || null,
      created_by: me?.id || null,
      branch_id: effectiveBranchId,
      status: "new",
    });

    setSaving(false);
    if (error) return alert(error.message);

    setTitle("");
    setDescription("");
    setAssignedTo("");
    setPriority("normal");
    setDueAt("");
    alert("تمت إضافة المهمة ✅");
  }

  return (
    <div dir="rtl" className="space-y-6 p-4 md:p-8">
      <header>
        <h1 className="text-3xl font-black">إضافة مهمة</h1>
        <p className="mt-2 text-gray-500">أنشئ مهمة عامة أو خصصها لموظف واحد فقط.</p>
      </header>

      <section className="rounded-2xl bg-white p-5 shadow md:p-7">
        {loading ? (
          <p>جاري تحميل الموظفين...</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <input
              className={inputClass}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="عنوان المهمة"
            />
            <select
              className={inputClass}
              value={assignedTo}
              onChange={(event) => setAssignedTo(event.target.value)}
            >
              <option value="">كل موظفي الفرع</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
            <textarea
              className={`${inputClass} md:col-span-2`}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="وصف المهمة"
              rows={4}
            />
            <select
              className={inputClass}
              value={priority}
              onChange={(event) => setPriority(event.target.value as Priority)}
            >
              <option value="normal">عادية</option>
              <option value="important">مهمة</option>
              <option value="urgent">عاجلة</option>
            </select>
            <input
              type="datetime-local"
              className={inputClass}
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
            />
          </div>
        )}

        <button
          disabled={saving || loading}
          onClick={() => void addTask()}
          className="mt-5 rounded-xl bg-emerald-700 px-7 py-3 font-bold text-white disabled:opacity-50"
        >
          {saving ? "جاري الحفظ..." : "إضافة المهمة"}
        </button>
      </section>
    </div>
  );
}
