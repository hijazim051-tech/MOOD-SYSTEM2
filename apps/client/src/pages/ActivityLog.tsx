import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useBranch } from "../context/BranchContext";
import { downloadExcelHtml, printHtmlReport } from "../lib/reportExport";

type ActivityLog = {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  action: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
  pageName: string;
  description: string;
  oldData: unknown;
  newData: unknown;
  metadata: Record<string, unknown>;
  createdAt: string;
  branchId: string;
};

const inputClass =
  "w-full rounded-xl border border-gray-200 bg-white p-3 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";

export default function ActivityLogPage() {
  const { branches, effectiveBranchId, canViewAllBranches } = useBranch();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);

  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [branchFilter, setBranchFilter] = useState(effectiveBranchId || "all");

  useEffect(() => {
    setBranchFilter(effectiveBranchId || "all");
  }, [effectiveBranchId]);

  useEffect(() => {
    void loadLogs();
  }, []);

  async function loadLogs() {
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("activity_logs")
        .select(`
          id,
          user_id,
          user_email,
          user_name,
          action,
          entity_type,
          entity_id,
          entity_label,
          page_name,
          description,
          old_data,
          new_data,
          metadata,
          created_at
        `)
        .order("created_at", { ascending: false })
        .limit(1000);

      if (error) throw error;

      setLogs(
        (data || []).map((log: any) => ({
          id: String(log.id),
          userId: String(log.user_id || ""),
          userEmail: String(log.user_email || ""),
          userName: String(log.user_name || ""),
          action: String(log.action || ""),
          entityType: String(log.entity_type || ""),
          entityId: String(log.entity_id || ""),
          entityLabel: String(log.entity_label || ""),
          pageName: String(log.page_name || ""),
          description: String(log.description || ""),
          oldData: log.old_data ?? null,
          newData: log.new_data ?? null,
          metadata: (log.metadata || {}) as Record<string, unknown>,
          createdAt: String(log.created_at || ""),
          branchId: String((log.metadata || {}).branch_id || (log.metadata || {}).branchId || ""),
        }))
      );
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  const availableActions = useMemo(
    () => Array.from(new Set(logs.map((log) => log.action))).filter(Boolean),
    [logs]
  );

  const availableEntities = useMemo(
    () =>
      Array.from(new Set(logs.map((log) => log.entityType))).filter(Boolean),
    [logs]
  );

  const filteredLogs = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return logs.filter((log) => {
      const matchesSearch =
        !normalizedSearch ||
        log.userName.toLowerCase().includes(normalizedSearch) ||
        log.userEmail.toLowerCase().includes(normalizedSearch) ||
        log.entityLabel.toLowerCase().includes(normalizedSearch) ||
        log.entityId.toLowerCase().includes(normalizedSearch) ||
        log.description.toLowerCase().includes(normalizedSearch) ||
        log.entityType.toLowerCase().includes(normalizedSearch);

      const matchesAction =
        actionFilter === "all" || log.action === actionFilter;

      const matchesEntity =
        entityFilter === "all" || log.entityType === entityFilter;

      const matchesBranch =
        branchFilter === "all" || log.branchId === branchFilter;

      const dateKey = log.createdAt.slice(0, 10);
      const matchesFrom = !dateFrom || dateKey >= dateFrom;
      const matchesTo = !dateTo || dateKey <= dateTo;

      return (
        matchesSearch &&
        matchesAction &&
        matchesEntity &&
        matchesBranch &&
        matchesFrom &&
        matchesTo
      );
    });
  }, [logs, search, actionFilter, entityFilter, branchFilter, dateFrom, dateTo]);

  const todayKey = new Date().toISOString().slice(0, 10);

  const summary = useMemo(() => {
    const todayLogs = logs.filter(
      (log) => log.createdAt.slice(0, 10) === todayKey
    );

    return {
      total: logs.length,
      today: todayLogs.length,
      creates: todayLogs.filter((log) => log.action === "create").length,
      updates: todayLogs.filter((log) => log.action === "update").length,
      deletes: todayLogs.filter((log) => log.action === "delete").length,
    };
  }, [logs, todayKey]);


  function exportExcel() {
    downloadExcelHtml({
      filename: `activity-log-${new Date().toISOString().slice(0, 10)}.xls`,
      title: "سجل التعديلات",
      headers: ["التاريخ", "المستخدم", "الفرع", "العملية", "القسم", "العنصر", "الوصف"],
      rows: filteredLogs.map((log) => [
        formatDateTime(log.createdAt),
        log.userName || log.userEmail || "-",
        branches.find((branch) => branch.id === log.branchId)?.name || "غير محدد",
        actionLabel(log.action),
        entityLabel(log.entityType),
        log.entityLabel || log.entityId || "-",
        log.description || defaultDescription(log),
      ]),
      summaryRows: [
        ["إجمالي السجلات", filteredLogs.length],
        ["الإضافات", filteredLogs.filter((log) => ["create", "insert"].includes(log.action.toLowerCase())).length],
        ["التعديلات", filteredLogs.filter((log) => ["update", "status_change", "stock_change"].includes(log.action.toLowerCase())).length],
        ["الحذف", filteredLogs.filter((log) => log.action.toLowerCase() === "delete").length],
      ],
    });
  }

  function printReport() {
    const rows = filteredLogs.slice(0, 500).map((log) => `
      <tr>
        <td>${formatDateTime(log.createdAt)}</td>
        <td>${escapeHtml(log.userName || log.userEmail || "-")}</td>
        <td>${escapeHtml(branches.find((branch) => branch.id === log.branchId)?.name || "غير محدد")}</td>
        <td>${escapeHtml(actionLabel(log.action))}</td>
        <td>${escapeHtml(entityLabel(log.entityType))}</td>
        <td>${escapeHtml(log.description || defaultDescription(log))}</td>
      </tr>`).join("");

    printHtmlReport({
      title: "سجل التعديلات",
      subtitle: `عدد السجلات: ${filteredLogs.length} — ${new Date().toLocaleString("ar-LY")}`,
      bodyHtml: `<table><thead><tr><th>التاريخ</th><th>المستخدم</th><th>الفرع</th><th>العملية</th><th>القسم</th><th>الوصف</th></tr></thead><tbody>${rows}</tbody></table>`,
    });
  }

  if (loading) {
    return (
      <div className="p-8 text-2xl font-bold text-gray-700">
        جاري تحميل سجل العمليات...
      </div>
    );
  }

  return (
    <div className="space-y-7 p-4 md:p-8" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold md:text-4xl">سجل العمليات</h1>
          <p className="mt-2 text-gray-500">
            متابعة كل الإضافات والتعديلات والحذف داخل المنظومة
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={exportExcel} className="rounded-xl bg-blue-700 px-5 py-3 font-bold text-white">تصدير Excel</button>
          <button type="button" onClick={printReport} className="rounded-xl bg-gray-800 px-5 py-3 font-bold text-white">طباعة / PDF</button>
          <button
            type="button"
            onClick={() => void loadLogs()}
            className="rounded-xl bg-emerald-700 px-6 py-3 font-bold text-white"
          >
            تحديث السجل
          </button>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-5">
        <SummaryCard label="إجمالي السجلات" value={summary.total} />
        <SummaryCard label="عمليات اليوم" value={summary.today} />
        <SummaryCard label="إضافات اليوم" value={summary.creates} />
        <SummaryCard label="تعديلات اليوم" value={summary.updates} />
        <SummaryCard label="حذف اليوم" value={summary.deletes} danger />
      </section>

      <section className="rounded-2xl bg-white p-5 shadow">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className={inputClass}
            placeholder="بحث بالمستخدم أو العنصر أو الوصف"
          />

          <select
            value={actionFilter}
            onChange={(event) => setActionFilter(event.target.value)}
            className={inputClass}
          >
            <option value="all">كل العمليات</option>
            {availableActions.map((action) => (
              <option key={action} value={action}>
                {actionLabel(action)}
              </option>
            ))}
          </select>

          <select
            value={entityFilter}
            onChange={(event) => setEntityFilter(event.target.value)}
            className={inputClass}
          >
            <option value="all">كل الأقسام</option>
            {availableEntities.map((entity) => (
              <option key={entity} value={entity}>
                {entityLabel(entity)}
              </option>
            ))}
          </select>

          <select
            value={branchFilter}
            onChange={(event) => setBranchFilter(event.target.value)}
            className={inputClass}
            disabled={!canViewAllBranches}
          >
            <option value="all">كل الفروع</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>{branch.name}</option>
            ))}
          </select>

          <input
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
            className={inputClass}
          />

          <input
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
            className={inputClass}
          />
        </div>
      </section>

      <section className="overflow-x-auto rounded-2xl bg-white p-5 shadow">
        <table className="w-full min-w-[1200px]">
          <thead className="bg-emerald-700 text-white">
            <tr>
              <th className="p-4 text-right">التاريخ والوقت</th>
              <th className="p-4 text-right">المستخدم</th>
              <th className="p-4 text-right">الفرع</th>
              <th className="p-4 text-right">العملية</th>
              <th className="p-4 text-right">القسم</th>
              <th className="p-4 text-right">العنصر</th>
              <th className="p-4 text-right">الوصف</th>
              <th className="p-4 text-right">التفاصيل</th>
            </tr>
          </thead>

          <tbody>
            {filteredLogs.map((log) => (
              <tr key={log.id} className="border-b hover:bg-gray-50">
                <td className="p-4 whitespace-nowrap">
                  {formatDateTime(log.createdAt)}
                </td>
                <td className="p-4">
                  <p className="font-semibold">
                    {log.userName || "مستخدم غير محدد"}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {log.userEmail || "-"}
                  </p>
                </td>
                <td className="p-4 font-semibold">
                  {branches.find((branch) => branch.id === log.branchId)?.name || "غير محدد"}
                </td>
                <td className="p-4">
                  <ActionBadge action={log.action} />
                </td>
                <td className="p-4 font-semibold">
                  {entityLabel(log.entityType)}
                </td>
                <td className="p-4">
                  <p>{log.entityLabel || "-"}</p>
                  {log.entityId && (
                    <p className="mt-1 text-xs text-gray-500">
                      #{log.entityId}
                    </p>
                  )}
                </td>
                <td className="p-4">
                  {log.description || defaultDescription(log)}
                </td>
                <td className="p-4">
                  <button
                    type="button"
                    onClick={() => setSelectedLog(log)}
                    className="rounded-lg bg-gray-100 px-4 py-2 font-semibold hover:bg-gray-200"
                  >
                    عرض
                  </button>
                </td>
              </tr>
            ))}

            {filteredLogs.length === 0 && (
              <tr>
                <td colSpan={8} className="p-10 text-center text-gray-500">
                  لا توجد سجلات مطابقة
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {selectedLog && (
        <LogDetailsModal
          log={selectedLog}
          onClose={() => setSelectedLog(null)}
        />
      )}
    </div>
  );
}

function LogDetailsModal({
  log,
  onClose,
}: {
  log: ActivityLog;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
        dir="rtl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">تفاصيل العملية</h2>
            <p className="mt-2 text-gray-500">
              {formatDateTime(log.createdAt)}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-gray-100 px-4 py-2"
          >
            ✕
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <Info label="المستخدم" value={log.userName || log.userEmail || "-"} />
          <Info label="العملية" value={actionLabel(log.action)} />
          <Info label="القسم" value={entityLabel(log.entityType)} />
          <Info
            label="العنصر"
            value={log.entityLabel || log.entityId || "-"}
          />
        </div>

        <div className="mt-5 rounded-xl bg-gray-50 p-4">
          <p className="font-semibold">الوصف</p>
          <p className="mt-2 text-gray-700">
            {log.description || defaultDescription(log)}
          </p>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-2">
          <JsonBox title="القيمة القديمة" value={log.oldData} />
          <JsonBox title="القيمة الجديدة" value={log.newData} />
        </div>

        {Object.keys(log.metadata || {}).length > 0 && (
          <div className="mt-5">
            <JsonBox title="بيانات إضافية" value={log.metadata} />
          </div>
        )}
      </div>
    </div>
  );
}

function JsonBox({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="rounded-xl border bg-gray-50 p-4">
      <h3 className="mb-3 font-bold">{title}</h3>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs leading-6">
        {value === null || value === undefined
          ? "لا توجد بيانات"
          : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-50 p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 font-bold">{value}</p>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <div className={`rounded-2xl p-5 shadow ${danger ? "bg-red-50" : "bg-white"}`}>
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${danger ? "text-red-700" : ""}`}>
        {value}
      </p>
    </div>
  );
}

function ActionBadge({ action }: { action: string }) {
  const normalized = action.toLowerCase();

  const classes =
    normalized === "create" || normalized === "insert"
      ? "bg-green-100 text-green-700"
      : normalized === "update" || normalized === "status_change"
        ? "bg-blue-100 text-blue-700"
        : normalized === "delete"
          ? "bg-red-100 text-red-700"
          : normalized === "login"
            ? "bg-purple-100 text-purple-700"
            : "bg-gray-100 text-gray-700";

  return (
    <span className={`rounded-full px-3 py-1 text-sm font-semibold ${classes}`}>
      {actionLabel(action)}
    </span>
  );
}

function actionLabel(action: string) {
  const labels: Record<string, string> = {
    create: "إضافة",
    insert: "إضافة",
    update: "تعديل",
    delete: "حذف",
    login: "تسجيل دخول",
    logout: "تسجيل خروج",
    print: "طباعة",
    export: "تصدير",
    status_change: "تغيير حالة",
    payment: "تسجيل دفعة",
    stock_change: "تغيير مخزون",
  };

  return labels[action.toLowerCase()] || action;
}

function entityLabel(entity: string) {
  const labels: Record<string, string> = {
    orders: "الطلبات",
    order_items: "بنود الطلب",
    products: "المنتجات",
    product_details: "تفاصيل المخزون",
    suppliers: "الموردون",
    supplier_payments: "دفعات الموردين",
    purchase_invoices: "فواتير المشتريات",
    purchase_invoice_items: "بنود المشتريات",
    expenses: "المصروفات",
    expense_categories: "فئات المصروفات",
    stock_waste: "التوالف والهالك",
    usage_price_tiers: "فئات سعر الاستخدام",
    production_templates: "قوالب الإنتاج",
    user_profiles: "المستخدمون",
  };

  return labels[entity] || entity || "غير محدد";
}

function defaultDescription(log: ActivityLog) {
  return `${actionLabel(log.action)} في ${entityLabel(log.entityType)}`;
}

function formatDateTime(value: string) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("ar-LY", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error
  ) {
    return String((error as { message: unknown }).message);
  }

  return "حدث خطأ أثناء تحميل سجل العمليات";
}
function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char] || char));
}
