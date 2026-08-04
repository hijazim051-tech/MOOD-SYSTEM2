import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { moveToTrash } from "../lib/trash";
import { useBranch } from "../context/BranchContext";
import { getBranchStock } from "../lib/branchStock";

type BoxDetail = {
  id: number;
  name: string;
  stock: number;
};

type BoxProduct = {
  id: number;
  name: string;
  details: BoxDetail[];
};

type BoxTemplate = {
  id: string;
  name: string;
  customName: string;
  size: string;
  sellPrice: number;
  contentValue: number;
  productDetailId: number | null;
  boxProductId: number | null;
  boxDetailId: number | null;
  notes: string;
  isActive: boolean;
  createdAt: string;
};

const inputClass =
  "w-full rounded-xl border border-gray-200 bg-white p-3 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";

export default function ProductionCenter() {
  const { effectiveBranchId, selectedBranch } = useBranch();
  const [boxProducts, setBoxProducts] = useState<BoxProduct[]>([]);
  const [templates, setTemplates] = useState<BoxTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(
    null
  );

  const [customName, setCustomName] = useState("");
  const [selectedBoxProductId, setSelectedBoxProductId] = useState("");
  const [selectedBoxDetailId, setSelectedBoxDetailId] = useState("");
  const [contentValue, setContentValue] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    void loadData();
  }, [effectiveBranchId]);

  const selectedBoxProduct = useMemo(
    () =>
      boxProducts.find(
        (product) => String(product.id) === selectedBoxProductId
      ) || null,
    [boxProducts, selectedBoxProductId]
  );

  const selectedBoxDetail = useMemo(
    () =>
      selectedBoxProduct?.details.find(
        (detail) => String(detail.id) === selectedBoxDetailId
      ) || null,
    [selectedBoxProduct, selectedBoxDetailId]
  );

  const previewName = useMemo(() => {
    if (customName.trim()) return customName.trim();

    return [selectedBoxProduct?.name, selectedBoxDetail?.name]
      .filter(Boolean)
      .join(" - ");
  }, [customName, selectedBoxProduct, selectedBoxDetail]);

  async function loadData() {
    setLoading(true);

    try {
      const [productsResult, templatesResult, branchRows] = await Promise.all([
        supabase
          .from("products")
          .select(`
            id,
            name,
            category_id,
            product_type,
            product_details (
              id,
              name,
              stock
            )
          `)
          .or("category_id.eq.88,product_type.eq.box")
          .order("name"),

        supabase
          .from("order_item_templates")
          .select(`
            id,
            name,
            custom_name,
            size,
            sell_price,
            content_value,
            product_detail_id,
            box_product_id,
            box_detail_id,
            notes,
            is_active,
            created_at
          `)
          .eq("item_type", "box")
          .order("created_at", { ascending: false }),
        getBranchStock(effectiveBranchId),
      ]);

      if (productsResult.error) throw productsResult.error;
      if (templatesResult.error) throw templatesResult.error;

      const branchStockMap = new Map(branchRows.map((row) => [row.productDetailId, row.stock]));
      setBoxProducts(
        (productsResult.data || []).map((product: any) => ({
          id: Number(product.id),
          name: String(product.name || ""),
          details: (product.product_details || []).map((detail: any) => ({
            id: Number(detail.id),
            name: String(detail.name || ""),
            stock: Number(branchStockMap.get(Number(detail.id)) || 0),
          })),
        }))
      );

      setTemplates(
        (templatesResult.data || []).map((template: any) => ({
          id: String(template.id),
          name: String(template.name || ""),
          customName: String(template.custom_name || ""),
          size: String(template.size || ""),
          sellPrice: Number(template.sell_price || 0),
          contentValue: Number(template.content_value || 0),
          productDetailId:
            template.product_detail_id === null
              ? null
              : Number(template.product_detail_id),
          boxProductId:
            template.box_product_id === null
              ? null
              : Number(template.box_product_id),
          boxDetailId:
            template.box_detail_id === null
              ? template.product_detail_id === null
                ? null
                : Number(template.product_detail_id)
              : Number(template.box_detail_id),
          notes: String(template.notes || ""),
          isActive: Boolean(template.is_active ?? true),
          createdAt: String(template.created_at || ""),
        }))
      );
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function saveTemplate() {
    if (!selectedBoxProduct || !selectedBoxDetail) {
      alert("اختار نوع البوكس والحجم");
      return;
    }

    const numericContentValue = Number(contentValue);
    const numericSellPrice = Number(sellPrice);

    if (!Number.isFinite(numericContentValue) || numericContentValue <= 0) {
      alert("اكتب قيمة محتوى صحيحة أكبر من صفر");
      return;
    }

    if (!Number.isFinite(numericSellPrice) || numericSellPrice <= 0) {
      alert("اكتب سعر بيع صحيح أكبر من صفر");
      return;
    }

    if (selectedBoxDetail.stock <= 0) {
      const continueWithoutStock = window.confirm(
        "مخزون هذا الحجم صفر حاليًا. هل تريد حفظ القالب رغم ذلك؟"
      );

      if (!continueWithoutStock) return;
    }

    setSaving(true);

    try {
      const payload = {
        name:
          customName.trim() ||
          `${selectedBoxProduct.name} - ${selectedBoxDetail.name}`,
        custom_name: customName.trim(),
        item_type: "box",
        size: selectedBoxDetail.name,
        sell_price: numericSellPrice,
        content_value: numericContentValue,
        product_detail_id: selectedBoxDetail.id,
        box_product_id: selectedBoxProduct.id,
        box_detail_id: selectedBoxDetail.id,
        notes: notes.trim() || null,
        is_active: true,
        template_version: 2,
        default_flowers_count: 0,
        default_accessories_count: 0,
        default_wrapping_count: 0,
        default_ribbons_count: 0,
        default_cards_count: 0,
        default_base_count: 1,
        default_external_count: 0,
        updated_at: new Date().toISOString(),
      };

      if (editingTemplateId) {
        const { error } = await supabase
          .from("order_item_templates")
          .update(payload)
          .eq("id", editingTemplateId);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("order_item_templates")
          .insert(payload);

        if (error) throw error;
      }

      resetForm();
      await loadData();

      alert(
        editingTemplateId
          ? "تم تعديل قالب البوكس ✅"
          : "تم حفظ قالب البوكس الجديد ✅"
      );
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  function editTemplate(template: BoxTemplate) {
    setEditingTemplateId(template.id);
    setCustomName(template.customName);

    const matchingProduct =
      boxProducts.find((product) =>
        product.details.some(
          (detail) =>
            detail.id ===
            (template.boxDetailId || template.productDetailId)
        )
      ) || null;

    setSelectedBoxProductId(
      matchingProduct ? String(matchingProduct.id) : ""
    );

    setSelectedBoxDetailId(
      template.boxDetailId || template.productDetailId
        ? String(template.boxDetailId || template.productDetailId)
        : ""
    );

    setContentValue(String(template.contentValue || ""));
    setSellPrice(String(template.sellPrice || ""));
    setNotes(template.notes);

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function toggleTemplate(template: BoxTemplate) {
    const { error } = await supabase
      .from("order_item_templates")
      .update({
        is_active: !template.isActive,
        updated_at: new Date().toISOString(),
      })
      .eq("id", template.id);

    if (error) {
      alert(error.message);
      return;
    }

    await loadData();
  }

  async function deleteTemplate(template: BoxTemplate) {
    const confirmed = window.confirm(
      `هل تريد حذف القالب "${template.name}" نهائيًا؟`
    );

    if (!confirmed) return;

    try {
      await moveToTrash({
        table: "order_item_templates",
        id: template.id,
        label: template.name,
        related: [
          {
            table: "order_item_template_components",
            column: "template_id",
            value: template.id,
          },
        ],
      });

      const { error: componentsError } = await supabase
        .from("order_item_template_components")
        .delete()
        .eq("template_id", template.id);

      if (componentsError) throw componentsError;

      const { error: templateError } = await supabase
        .from("order_item_templates")
        .delete()
        .eq("id", template.id);

      if (templateError) throw templateError;

      if (editingTemplateId === template.id) resetForm();

      await loadData();
      alert("تم حذف القالب");
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    }
  }

  function resetForm() {
    setEditingTemplateId(null);
    setCustomName("");
    setSelectedBoxProductId("");
    setSelectedBoxDetailId("");
    setContentValue("");
    setSellPrice("");
    setNotes("");
  }

  if (loading) {
    return (
      <div className="p-8 text-2xl font-bold text-gray-700">
        جاري تحميل مركز الإنتاج...
      </div>
    );
  }

  return (
    <div className="space-y-8 p-4 md:p-8" dir="rtl">
      <header>
        <h1 className="text-3xl font-bold md:text-4xl">مركز الإنتاج</h1>
        <p className="mt-2 text-gray-500">
          إنشاء قوالب البوكسات حسب نوع البوكس والحجم وقيمة المحتوى
        </p>
        <p className="mt-2 text-sm font-bold text-emerald-700">المخزون المعروض: {selectedBranch?.name || "كل الفروع"}</p>
      </header>

      <section className="rounded-2xl bg-white p-5 shadow md:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold">
              {editingTemplateId ? "تعديل قالب بوكس" : "قالب بوكس جديد"}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              الورد الصناعي والإكسسوارات لا تُحدد هنا، بل وقت التغليف حسب
              فئات سعر الاستخدام.
            </p>
          </div>

          {editingTemplateId && (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-xl border px-5 py-3 font-semibold"
            >
              إلغاء التعديل
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="اسم البوكس (اختياري)">
            <input
              value={customName}
              onChange={(event) => setCustomName(event.target.value)}
              className={inputClass}
              placeholder="مثلاً: بوكس VIP"
            />
          </Field>

          <Field label="نوع البوكس">
            <select
              value={selectedBoxProductId}
              onChange={(event) => {
                setSelectedBoxProductId(event.target.value);
                setSelectedBoxDetailId("");
              }}
              className={inputClass}
            >
              <option value="">اختار نوع البوكس</option>
              {boxProducts.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="حجم البوكس">
            <select
              value={selectedBoxDetailId}
              onChange={(event) =>
                setSelectedBoxDetailId(event.target.value)
              }
              className={inputClass}
              disabled={!selectedBoxProduct}
            >
              <option value="">اختار الحجم</option>
              {selectedBoxProduct?.details.map((detail) => (
                <option key={detail.id} value={detail.id}>
                  {detail.name} — المخزون {detail.stock}
                </option>
              ))}
            </select>
          </Field>

          <Field label="قيمة المحتوى">
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={contentValue}
              onChange={(event) => setContentValue(event.target.value)}
              className={inputClass}
              placeholder="مثلاً 50"
            />
          </Field>

          <Field label="سعر البيع النهائي">
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={sellPrice}
              onChange={(event) => setSellPrice(event.target.value)}
              className={inputClass}
              placeholder="مثلاً 120"
            />
          </Field>

          <Field label="ملاحظات">
            <input
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className={inputClass}
              placeholder="اختياري"
            />
          </Field>
        </div>

        {(selectedBoxProduct || customName || contentValue || sellPrice) && (
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <PreviewCard label="اسم القالب" value={previewName || "-"} />
            <PreviewCard
              label="قيمة المحتوى"
              value={
                Number(contentValue || 0) > 0
                  ? `${Number(contentValue).toFixed(2)} د.ل`
                  : "-"
              }
            />
            <PreviewCard
              label="سعر البيع"
              value={
                Number(sellPrice || 0) > 0
                  ? `${Number(sellPrice).toFixed(2)} د.ل`
                  : "-"
              }
            />
          </div>
        )}

        <button
          type="button"
          onClick={() => void saveTemplate()}
          disabled={saving}
          className="mt-6 rounded-xl bg-emerald-700 px-8 py-3 font-bold text-white disabled:opacity-50"
        >
          {saving
            ? "جاري الحفظ..."
            : editingTemplateId
              ? "حفظ التعديلات"
              : "حفظ القالب"}
        </button>
      </section>

      <section className="overflow-x-auto rounded-2xl bg-white p-5 shadow md:p-6">
        <div className="mb-5">
          <h2 className="text-2xl font-bold">قوالب البوكسات</h2>
          <p className="mt-1 text-sm text-gray-500">
            المحتوى الفعلي يحدده موظف التغليف وقت تنفيذ الطلب.
          </p>
        </div>

        <table className="w-full min-w-[1050px]">
          <thead className="bg-emerald-700 text-white">
            <tr>
              <th className="p-4 text-right">القالب</th>
              <th className="p-4 text-right">الحجم</th>
              <th className="p-4 text-right">قيمة المحتوى</th>
              <th className="p-4 text-right">سعر البيع</th>
              <th className="p-4 text-right">ملاحظات</th>
              <th className="p-4 text-right">الحالة</th>
              <th className="p-4 text-right">الإجراءات</th>
            </tr>
          </thead>

          <tbody>
            {templates.map((template) => (
              <tr key={template.id} className="border-b hover:bg-gray-50">
                <td className="p-4 font-semibold">{template.name}</td>
                <td className="p-4">{template.size || "-"}</td>
                <td className="p-4 font-bold text-purple-700">
                  {template.contentValue.toFixed(2)} د.ل
                </td>
                <td className="p-4 font-bold text-emerald-700">
                  {template.sellPrice.toFixed(2)} د.ل
                </td>
                <td className="p-4">{template.notes || "-"}</td>
                <td className="p-4">
                  <span
                    className={`rounded-full px-3 py-1 text-sm font-semibold ${
                      template.isActive
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-200 text-gray-600"
                    }`}
                  >
                    {template.isActive ? "نشط" : "معطل"}
                  </span>
                </td>
                <td className="p-4">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => editTemplate(template)}
                      className="rounded-lg bg-blue-100 px-4 py-2 font-semibold text-blue-700"
                    >
                      تعديل
                    </button>

                    <button
                      type="button"
                      onClick={() => void toggleTemplate(template)}
                      className="rounded-lg bg-orange-100 px-4 py-2 font-semibold text-orange-700"
                    >
                      {template.isActive ? "تعطيل" : "تفعيل"}
                    </button>

                    <button
                      type="button"
                      onClick={() => void deleteTemplate(template)}
                      className="rounded-lg bg-red-100 px-4 py-2 font-semibold text-red-700"
                    >
                      حذف
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {templates.length === 0 && (
              <tr>
                <td colSpan={7} className="p-10 text-center text-gray-500">
                  لا توجد قوالب بوكسات بعد
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 block font-semibold">{label}</label>
      {children}
    </div>
  );
}

function PreviewCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-emerald-50 p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-emerald-800">{value}</p>
    </div>
  );
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

  return "حدث خطأ غير متوقع";
}
