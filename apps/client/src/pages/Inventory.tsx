import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useBranch } from "../context/BranchContext";
import { adjustBranchStock, getBranchStock } from "../lib/branchStock";

type InventoryItem = {
  id: number;
  productId: number;
  categoryId: number;
  categoryName: string;
  productName: string;
  detailName: string;
  stock: number;
  alertLimit: number;
  averageUnitCost: number;
  buyPrice: number;
  sellPrice: number;
  inventoryValue: number;
  materialType: string;
};

type EditForm = {
  productName: string;
  detailName: string;
  stock: string;
  alertLimit: string;
  averageUnitCost: string;
  buyPrice: string;
  sellPrice: string;
  materialType: string;
};

type FilterKey = "all" | "natural" | "boxes" | "artificial" | "wrapping" | "additions" | "low" | "out";

const emptyEditForm: EditForm = {
  productName: "",
  detailName: "",
  stock: "0",
  alertLimit: "0",
  averageUnitCost: "0",
  buyPrice: "0",
  sellPrice: "0",
  materialType: "",
};

export default function Inventory() {
  const { effectiveBranchId, selectedBranchId, branches } = useBranch();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [editForm, setEditForm] = useState<EditForm>(emptyEditForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadInventory();
  }, [effectiveBranchId, selectedBranchId]);

  async function loadInventory() {
    setLoading(true);
    try {
      const [{ data: details, error: de }, { data: products, error: pe }, { data: categories, error: ce }, stocks] = await Promise.all([
        supabase
          .from("product_details")
          .select("id,product_id,name,color,buy_price,sell_price,average_unit_cost,material_type")
          .order("name"),
        supabase.from("products").select("id,category_id,name"),
        supabase.from("categories").select("id,name"),
        getBranchStock(effectiveBranchId),
      ]);
      if (de) throw de;
      if (pe) throw pe;
      if (ce) throw ce;

      const productMap = new Map((products || []).map((x: any) => [Number(x.id), x]));
      const categoryMap = new Map((categories || []).map((x: any) => [Number(x.id), String(x.name || "")]));
      const stockMap = new Map<number, { stock: number; alert: number; cost: number }>();

      for (const row of stocks) {
        const current = stockMap.get(row.productDetailId) || { stock: 0, alert: 0, cost: 0 };
        current.stock += row.stock;
        current.alert = Math.max(current.alert, row.alertLimit);
        current.cost = row.averageUnitCost || current.cost;
        stockMap.set(row.productDetailId, current);
      }

      setItems(
        (details || []).map((d: any) => {
          const p: any = productMap.get(Number(d.product_id));
          const s = stockMap.get(Number(d.id)) || {
            stock: 0,
            alert: 0,
            cost: Number(d.average_unit_cost || d.buy_price || 0),
          };
          return {
            id: Number(d.id),
            productId: Number(d.product_id),
            categoryId: Number(p?.category_id || 0),
            categoryName: categoryMap.get(Number(p?.category_id)) || "",
            productName: String(p?.name || ""),
            detailName: String(d.color || d.name || ""),
            stock: s.stock,
            alertLimit: s.alert,
            averageUnitCost: s.cost,
            buyPrice: Number(d.buy_price || 0),
            sellPrice: Number(d.sell_price || 0),
            inventoryValue: s.stock * s.cost,
            materialType: String(d.material_type || ""),
          } satisfies InventoryItem;
        }),
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : "تعذر تحميل المخزون. شغّل ملف SQL الخاص بفصل الفروع أولًا.");
    } finally {
      setLoading(false);
    }
  }

  function openEdit(item: InventoryItem) {
    if (!effectiveBranchId) {
      alert("اختر فرعًا محددًا قبل تعديل المخزون");
      return;
    }
    setEditing(item);
    setEditForm({
      productName: item.productName,
      detailName: item.detailName,
      stock: String(item.stock),
      alertLimit: String(item.alertLimit),
      averageUnitCost: String(item.averageUnitCost),
      buyPrice: String(item.buyPrice),
      sellPrice: String(item.sellPrice),
      materialType: item.materialType,
    });
  }

  async function saveEdit() {
    if (!editing || !effectiveBranchId) return;

    const nextStock = Number(editForm.stock);
    const alertLimit = Number(editForm.alertLimit);
    const averageUnitCost = Number(editForm.averageUnitCost);
    const buyPrice = Number(editForm.buyPrice);
    const sellPrice = Number(editForm.sellPrice);

    if (![nextStock, alertLimit, averageUnitCost, buyPrice, sellPrice].every(Number.isFinite)) {
      alert("تأكد من الأرقام المدخلة");
      return;
    }
    if (alertLimit < 0 || averageUnitCost < 0 || buyPrice < 0 || sellPrice < 0) {
      alert("الأسعار وحد التنبيه لا يمكن أن تكون سالبة");
      return;
    }
    if (!editForm.productName.trim() || !editForm.detailName.trim()) {
      alert("اسم المنتج والتفصيل مطلوبان");
      return;
    }

    setSaving(true);
    try {
      const difference = nextStock - editing.stock;
      if (difference !== 0) {
        await adjustBranchStock({
          branchId: effectiveBranchId,
          productDetailId: editing.id,
          quantityChange: difference,
          movementType: "manual_adjustment",
          referenceType: "inventory",
          referenceId: editing.id,
          notes: "تعديل مباشر من صفحة المخزون",
        });
      }

      const { error: stockError } = await supabase
        .from("branch_product_stock")
        .upsert(
          {
            branch_id: effectiveBranchId,
            product_detail_id: editing.id,
            stock: nextStock,
            alert_limit: alertLimit,
            average_unit_cost: averageUnitCost,
          },
          { onConflict: "branch_id,product_detail_id" },
        );
      if (stockError) throw stockError;

      const { error: detailError } = await supabase
        .from("product_details")
        .update({
          name: editForm.detailName.trim(),
          color: editForm.detailName.trim(),
          buy_price: buyPrice,
          sell_price: sellPrice,
          average_unit_cost: averageUnitCost,
          material_type: editForm.materialType.trim() || null,
        })
        .eq("id", editing.id);
      if (detailError) throw detailError;

      if (editForm.productName.trim() !== editing.productName) {
        const { error: productError } = await supabase
          .from("products")
          .update({ name: editForm.productName.trim() })
          .eq("id", editing.productId);
        if (productError) throw productError;
      }

      setEditing(null);
      await loadInventory();
    } catch (error) {
      alert(error instanceof Error ? error.message : "تعذر حفظ تعديل المخزون");
    } finally {
      setSaving(false);
    }
  }

  const filtered = useMemo(
    () =>
      items.filter((i) => {
        const text = `${i.categoryName} ${i.productName} ${i.detailName} ${i.materialType}`.toLowerCase();
        if (search.trim() && !text.includes(search.trim().toLowerCase())) return false;
        if (filter === "low") return i.alertLimit > 0 && i.stock > 0 && i.stock <= i.alertLimit;
        if (filter === "out") return i.stock <= 0;
        if (filter === "natural") return i.categoryId === 85;
        if (filter === "boxes") return i.categoryId === 88;
        if (filter === "wrapping") return i.categoryId === 87;
        if (filter === "artificial") return i.categoryId === 86;
        if (filter === "additions") return /اكسسوار|إكسسوار|اضافة|إضافة|شريط|بطاقة|فازة|سلة/.test(text);
        return true;
      }),
    [items, search, filter],
  );

  const stats = useMemo(
    () => ({
      units: items.reduce((s, x) => s + x.stock, 0),
      value: items.reduce((s, x) => s + x.inventoryValue, 0),
      low: items.filter((x) => x.alertLimit > 0 && x.stock > 0 && x.stock <= x.alertLimit).length,
      out: items.filter((x) => x.stock <= 0).length,
    }),
    [items],
  );

  const scopeName = effectiveBranchId ? branches.find((b) => b.id === effectiveBranchId)?.name || "الفرع" : "كل الفروع (إجمالي)";

  if (loading) return <div className="p-8 text-2xl font-bold">جاري تحميل مخزون {scopeName}...</div>;

  return (
    <div dir="rtl" className="space-y-6 p-4 md:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black">المخزون — {scopeName}</h1>
          <p className="text-gray-500">تقدر تعدل الكمية، حد التنبيه، التكلفة، أسعار الشراء والبيع، والأسماء مباشرة.</p>
          {!effectiveBranchId && <p className="mt-1 text-sm font-bold text-amber-700">اختر فرعًا محددًا حتى يظهر زر التعديل.</p>}
        </div>
        <button onClick={() => void loadInventory()} className="rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white">تحديث</button>
      </header>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Card t="إجمالي الوحدات" v={stats.units.toFixed(0)} />
        <Card t="قيمة المخزون" v={`${stats.value.toFixed(2)} د.ل`} />
        <Card t="مخزون منخفض" v={String(stats.low)} />
        <Card t="نافد" v={String(stats.out)} />
      </div>

      <section className="flex flex-wrap gap-2 rounded-2xl bg-white p-4 shadow">
        <input className="min-w-[240px] flex-1 rounded-xl border p-3" placeholder="بحث..." value={search} onChange={(e) => setSearch(e.target.value)} />
        {(["all", "natural", "boxes", "artificial", "wrapping", "additions", "low", "out"] as FilterKey[]).map((k) => (
          <button key={k} onClick={() => setFilter(k)} className={`rounded-xl px-3 py-2 font-bold ${filter === k ? "bg-emerald-700 text-white" : "bg-gray-100"}`}>
            {({ all: "الكل", natural: "طبيعي", boxes: "بوكسات", artificial: "صناعي", wrapping: "تغليف", additions: "إضافات", low: "منخفض", out: "نافد" } as Record<FilterKey, string>)[k]}
          </button>
        ))}
      </section>

      <section className="overflow-x-auto rounded-2xl bg-white shadow">
        <table className="w-full min-w-[1050px] text-right">
          <thead>
            <tr className="border-b bg-gray-50">
              <Th>الفئة</Th><Th>المنتج</Th><Th>التفصيل</Th><Th>الكمية</Th><Th>حد التنبيه</Th><Th>متوسط التكلفة</Th><Th>سعر البيع</Th><Th>القيمة</Th><Th>الإجراء</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((x) => {
              const low = x.alertLimit > 0 && x.stock > 0 && x.stock <= x.alertLimit;
              return (
                <tr key={x.id} className="border-b">
                  <Td>{x.categoryName}</Td><Td>{x.productName}</Td><Td>{x.detailName}</Td>
                  <Td><b className={x.stock <= 0 ? "text-red-700" : low ? "text-orange-700" : "text-emerald-700"}>{x.stock}</b></Td>
                  <Td>{x.alertLimit > 0 ? x.alertLimit : "بدون تنبيه"}</Td>
                  <Td>{x.averageUnitCost.toFixed(2)}</Td><Td>{x.sellPrice.toFixed(2)}</Td><Td>{x.inventoryValue.toFixed(2)} د.ل</Td>
                  <Td><button type="button" disabled={!effectiveBranchId} onClick={() => openEdit(x)} className="rounded-lg bg-blue-100 px-4 py-2 font-bold text-blue-700 disabled:opacity-40">تعديل</button></Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div><h2 className="text-2xl font-black">تعديل المخزون</h2><p className="text-sm text-gray-500">{editing.categoryName}</p></div>
              <button type="button" disabled={saving} onClick={() => setEditing(null)} className="rounded-xl bg-gray-100 px-4 py-2 font-bold">✕</button>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <Field label="اسم المنتج" value={editForm.productName} onChange={(v) => setEditForm((f) => ({ ...f, productName: v }))} />
              <Field label="اسم التفصيل / اللون / الحجم" value={editForm.detailName} onChange={(v) => setEditForm((f) => ({ ...f, detailName: v }))} />
              <Field label="الكمية الحالية" type="number" value={editForm.stock} onChange={(v) => setEditForm((f) => ({ ...f, stock: v }))} />
              <Field label="حد تنبيه المخزون (0 = بدون تنبيه)" type="number" value={editForm.alertLimit} onChange={(v) => setEditForm((f) => ({ ...f, alertLimit: v }))} />
              <Field label="متوسط التكلفة" type="number" value={editForm.averageUnitCost} onChange={(v) => setEditForm((f) => ({ ...f, averageUnitCost: v }))} />
              <Field label="آخر سعر شراء" type="number" value={editForm.buyPrice} onChange={(v) => setEditForm((f) => ({ ...f, buyPrice: v }))} />
              <Field label="سعر البيع" type="number" value={editForm.sellPrice} onChange={(v) => setEditForm((f) => ({ ...f, sellPrice: v }))} />
              <Field label="نوع المادة" value={editForm.materialType} onChange={(v) => setEditForm((f) => ({ ...f, materialType: v }))} />
            </div>
            <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">لو خليت حد التنبيه 0، المنتج ما يطلعش في تنبيهات المخزون حتى لو الكمية وصلت للصفر.</p>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" disabled={saving} onClick={() => setEditing(null)} className="rounded-xl border px-5 py-3 font-bold">إلغاء</button>
              <button type="button" disabled={saving} onClick={() => void saveEdit()} className="rounded-xl bg-emerald-700 px-6 py-3 font-black text-white disabled:opacity-50">{saving ? "جاري الحفظ..." : "حفظ كل التعديلات"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: "text" | "number" }) {
  return <label className="space-y-1"><span className="text-sm font-bold text-gray-700">{label}</span><input type={type} step={type === "number" ? "0.01" : undefined} className="w-full rounded-xl border p-3" value={value} onChange={(e) => onChange(e.target.value)} /></label>;
}
function Card({ t, v }: { t: string; v: string }) { return <div className="rounded-2xl bg-white p-5 shadow"><p className="text-sm text-gray-500">{t}</p><p className="mt-2 text-2xl font-black">{v}</p></div>; }
function Th({ children }: { children: React.ReactNode }) { return <th className="p-3">{children}</th>; }
function Td({ children }: { children: React.ReactNode }) { return <td className="p-3">{children}</td>; }
