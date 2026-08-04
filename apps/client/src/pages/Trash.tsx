import { useEffect, useMemo, useState } from "react";
import { useBranch } from "../context/BranchContext";
import {
  loadTrashRecords,
  permanentlyDeleteTrashRecord,
  restoreTrashRecord,
  type TrashRecord,
} from "../lib/trash";
import { supabase } from "../lib/supabase";

const tableLabels: Record<string, string> = {
  orders: "الطلبات",
  products: "المنتجات",
  product_details: "تفاصيل المنتجات",
  expenses: "المصروفات",
  purchases: "المشتريات",
  suppliers: "الموردون",
  supplier_payments: "دفعات الموردين",
  order_item_templates: "قوالب الإنتاج",
  production_recipe_items: "مكونات الوصفات",
  bouquet_sizes: "مقاسات الباقات",
  box_variants: "مقاسات البوكسات",
};

type BranchOption = { id: string; name: string };

export default function Trash() {
  const { effectiveBranchId, canViewAllBranches } = useBranch();
  const [items, setItems] = useState<TrashRecord[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [search, setSearch] = useState("");
  const [tableFilter, setTableFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState(effectiveBranchId || "all");

  useEffect(() => {
    setBranchFilter(effectiveBranchId || "all");
  }, [effectiveBranchId]);

  useEffect(() => {
    void Promise.all([load(), loadBranches()]);
  }, []);

  async function loadBranches() {
    const { data, error } = await supabase
      .from("branches")
      .select("id,name")
      .eq("is_active", true)
      .order("name");

    if (!error) setBranches((data || []) as BranchOption[]);
  }

  async function load() {
    setLoading(true);
    try {
      setItems(await loadTrashRecords());
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : "تعذر تحميل سلة المحذوفات");
    } finally {
      setLoading(false);
    }
  }

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();

    return items.filter((item) => {
      if (item.restoredAt) return false;

      const matchesSearch =
        !q ||
        item.entityLabel.toLowerCase().includes(q) ||
        item.sourceTable.toLowerCase().includes(q) ||
        item.deletedByName.toLowerCase().includes(q) ||
        item.deletedByEmail.toLowerCase().includes(q);

      const matchesTable =
        tableFilter === "all" || item.sourceTable === tableFilter;

      const selectedBranch = canViewAllBranches
        ? branchFilter
        : effectiveBranchId || "all";

      const matchesBranch =
        selectedBranch === "all" ||
        item.branchId === selectedBranch ||
        item.branchId === null;

      return matchesSearch && matchesTable && matchesBranch;
    });
  }, [items, search, tableFilter, branchFilter, canViewAllBranches, effectiveBranchId]);

  const availableTables = useMemo(
    () => Array.from(new Set(items.map((item) => item.sourceTable))).sort(),
    [items]
  );

  async function restore(item: TrashRecord) {
    if (!confirm(`استرجاع «${item.entityLabel}»؟`)) return;
    setBusyId(item.id);
    try {
      await restoreTrashRecord(item);
      await load();
      alert("تم استرجاع العنصر بنجاح");
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : "تعذر استرجاع العنصر");
    } finally {
      setBusyId("");
    }
  }

  async function removeForever(item: TrashRecord) {
    if (!confirm(`حذف «${item.entityLabel}» نهائيًا؟ لا يمكن التراجع.`)) return;
    setBusyId(item.id);
    try {
      await permanentlyDeleteTrashRecord(item);
      await load();
      alert("تم الحذف النهائي");
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : "تعذر الحذف النهائي");
    } finally {
      setBusyId("");
    }
  }

  if (loading) {
    return <div className="p-8 text-2xl font-bold">جاري تحميل سلة المحذوفات...</div>;
  }

  return (
    <div className="space-y-6 p-4 md:p-8" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold md:text-4xl">سلة المحذوفات</h1>
          <p className="mt-2 text-gray-500">
            استرجاع العناصر المحذوفة أو حذفها نهائيًا. الصفحة متاحة للمالك والمدير فقط.
          </p>
        </div>
        <button onClick={() => void load()} className="rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white">
          تحديث
        </button>
      </header>

      <section className="grid gap-3 rounded-2xl bg-white p-5 shadow md:grid-cols-3">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="ابحث باسم العنصر أو الموظف"
          className="rounded-xl border border-gray-200 p-3 outline-none focus:border-emerald-600"
        />

        <select
          value={tableFilter}
          onChange={(event) => setTableFilter(event.target.value)}
          className="rounded-xl border border-gray-200 p-3"
        >
          <option value="all">كل الأقسام</option>
          {availableTables.map((table) => (
            <option key={table} value={table}>
              {tableLabels[table] || table}
            </option>
          ))}
        </select>

        {canViewAllBranches ? (
          <select
            value={branchFilter}
            onChange={(event) => setBranchFilter(event.target.value)}
            className="rounded-xl border border-gray-200 p-3"
          >
            <option value="all">كل الفروع</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>{branch.name}</option>
            ))}
          </select>
        ) : (
          <div className="rounded-xl bg-gray-50 p-3 text-sm font-bold text-gray-600">
            عرض محذوفات الفرع الحالي فقط
          </div>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-white p-5 shadow">
          <div className="text-sm text-gray-500">العناصر الظاهرة</div>
          <div className="mt-2 text-3xl font-black text-emerald-700">{visibleItems.length}</div>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow">
          <div className="text-sm text-gray-500">إجمالي المحذوفات</div>
          <div className="mt-2 text-3xl font-black">{items.filter((item) => !item.restoredAt).length}</div>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow">
          <div className="text-sm text-gray-500">الأقسام المتأثرة</div>
          <div className="mt-2 text-3xl font-black">{availableTables.length}</div>
        </div>
      </section>

      <section className="overflow-x-auto rounded-2xl bg-white p-4 shadow">
        <table className="w-full min-w-[950px]">
          <thead className="bg-emerald-800 text-white">
            <tr>
              <th className="p-4 text-right">العنصر</th>
              <th className="p-4 text-right">القسم</th>
              <th className="p-4 text-right">الفرع</th>
              <th className="p-4 text-right">حذفه</th>
              <th className="p-4 text-right">التاريخ</th>
              <th className="p-4 text-right">الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((item) => {
              const branchName = branches.find((branch) => branch.id === item.branchId)?.name;
              return (
                <tr key={item.id} className="border-b hover:bg-gray-50">
                  <td className="p-4 font-bold">{item.entityLabel || item.sourceId}</td>
                  <td className="p-4">{tableLabels[item.sourceTable] || item.sourceTable}</td>
                  <td className="p-4">{branchName || (item.branchId ? "فرع غير معروف" : "قديم/غير محدد")}</td>
                  <td className="p-4">
                    <div>{item.deletedByName || "غير محدد"}</div>
                    <div className="text-xs text-gray-500">{item.deletedByEmail}</div>
                  </td>
                  <td className="p-4">{new Date(item.deletedAt).toLocaleString("ar-LY")}</td>
                  <td className="p-4">
                    <div className="flex gap-2">
                      <button
                        disabled={busyId === item.id}
                        onClick={() => void restore(item)}
                        className="rounded-lg bg-emerald-700 px-4 py-2 font-bold text-white disabled:opacity-50"
                      >
                        استرجاع
                      </button>
                      <button
                        disabled={busyId === item.id}
                        onClick={() => void removeForever(item)}
                        className="rounded-lg bg-red-700 px-4 py-2 font-bold text-white disabled:opacity-50"
                      >
                        حذف نهائي
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {visibleItems.length === 0 && (
              <tr><td colSpan={6} className="p-10 text-center text-gray-500">سلة المحذوفات فارغة</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
