import { useEffect, useMemo, useState } from "react";
import { useBranch } from "../context/BranchContext";
import { supabase } from "../lib/supabase";
import { getCurrentUserRole } from "../lib/auth";

type TaskStatus = "new" | "in_progress" | "completed" | "cancelled";
type Task = {
  id: string;
  title: string;
  description: string;
  assignedTo: string;
  assignedToName: string;
  priority: "normal" | "important" | "urgent";
  status: TaskStatus;
  dueAt: string;
  completedAt: string;
  createdAt: string;
};

export default function Tasks() {
  const { effectiveBranchId } = useBranch();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"active" | "completed">("active");
  const [currentUserId, setCurrentUserId] = useState("");
  const [canSeeAllTasks, setCanSeeAllTasks] = useState(false);

  useEffect(() => {
    void loadIdentity();
  }, []);

  useEffect(() => {
    if (!currentUserId) return;
    void loadTasks();

    const channel = supabase
      .channel(`mood-tasks-${effectiveBranchId || "all"}-${currentUserId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks" },
        () => void loadTasks()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, effectiveBranchId, canSeeAllTasks]);

  async function loadIdentity() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    setCurrentUserId(user.id);
    const profile = await getCurrentUserRole();
    const role = String(profile?.role || "employee").toLowerCase();
    setCanSeeAllTasks(["owner", "admin", "manager"].includes(role));
  }

  async function loadTasks() {
    setLoading(true);

    let query = supabase
      .from("tasks")
      .select("*")
      .order("created_at", { ascending: false });

    if (effectiveBranchId) query = query.eq("branch_id", effectiveBranchId);

    const { data, error } = await query;

    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }

    const rows = (data || []).filter((row: any) => {
      if (canSeeAllTasks) return true;
      const assignedTo = String(row.assigned_to || "");
      return !assignedTo || assignedTo === currentUserId;
    });

    setTasks(
      rows.map((row: any) => ({
        id: String(row.id),
        title: String(row.title || ""),
        description: String(row.description || ""),
        assignedTo: String(row.assigned_to || ""),
        assignedToName: String(row.assigned_to_name || ""),
        priority: row.priority || "normal",
        status: row.status || "new",
        dueAt: String(row.due_at || ""),
        completedAt: String(row.completed_at || ""),
        createdAt: String(row.created_at || ""),
      }))
    );
    setLoading(false);
  }

  async function completeTask(taskId: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("tasks")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        completed_by: user?.id || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId);

    if (error) alert(error.message);
    else {
      setTab("completed");
      await loadTasks();
    }
  }

  async function cancelTask(taskId: string) {
    if (!confirm("هل تريد إلغاء المهمة؟")) return;
    const { error } = await supabase
      .from("tasks")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", taskId);
    if (error) alert(error.message);
    else await loadTasks();
  }

  const shown = useMemo(
    () =>
      tasks.filter((task) =>
        tab === "completed"
          ? task.status === "completed"
          : task.status !== "completed" && task.status !== "cancelled"
      ),
    [tasks, tab]
  );

  if (loading) {
    return <div className="p-8 text-xl font-bold">جاري تحميل المهام...</div>;
  }

  return (
    <div dir="rtl" className="space-y-6 p-4 md:p-8">
      <header>
        <h1 className="text-3xl font-black">المهام</h1>
        <p className="mt-2 text-gray-500">المهام الخاصة بك والمهام العامة للفرع.</p>
      </header>

      <div className="flex gap-2">
        <button
          onClick={() => setTab("active")}
          className={`rounded-xl px-5 py-3 font-bold ${
            tab === "active" ? "bg-emerald-700 text-white" : "bg-white"
          }`}
        >
          المطلوبة ({tasks.filter((t) => t.status !== "completed" && t.status !== "cancelled").length})
        </button>
        <button
          onClick={() => setTab("completed")}
          className={`rounded-xl px-5 py-3 font-bold ${
            tab === "completed" ? "bg-emerald-700 text-white" : "bg-white"
          }`}
        >
          المنجزة ({tasks.filter((t) => t.status === "completed").length})
        </button>
      </div>

      <section className="grid gap-4 xl:grid-cols-2">
        {shown.map((task) => (
          <article key={task.id} className="rounded-2xl bg-white p-5 shadow">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${
                      task.priority === "urgent"
                        ? "bg-red-100 text-red-700"
                        : task.priority === "important"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-gray-100"
                    }`}
                  >
                    {task.priority === "urgent"
                      ? "عاجلة"
                      : task.priority === "important"
                        ? "مهمة"
                        : "عادية"}
                  </span>
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                    {task.assignedToName || "كل الموظفين"}
                  </span>
                </div>
                <h3 className="mt-3 text-xl font-black">{task.title}</h3>
                {task.description && <p className="mt-2 text-gray-600">{task.description}</p>}
                <p className="mt-3 text-sm text-gray-500">
                  {task.dueAt
                    ? `موعدها: ${new Date(task.dueAt).toLocaleString("ar-LY")}`
                    : "بدون موعد محدد"}
                </p>
              </div>
              {task.status === "completed" && <span className="text-3xl">✅</span>}
            </div>

            {task.status !== "completed" && (
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => void completeTask(task.id)}
                  className="rounded-lg bg-emerald-100 px-4 py-2 font-bold text-emerald-700"
                >
                  تم التنفيذ
                </button>
                {canSeeAllTasks && (
                  <button
                    onClick={() => void cancelTask(task.id)}
                    className="rounded-lg bg-red-50 px-4 py-2 font-bold text-red-600"
                  >
                    إلغاء
                  </button>
                )}
              </div>
            )}
          </article>
        ))}

        {shown.length === 0 && (
          <div className="col-span-full rounded-2xl bg-white p-10 text-center text-gray-500">
            لا توجد مهام في هذا القسم.
          </div>
        )}
      </section>
    </div>
  );
}
