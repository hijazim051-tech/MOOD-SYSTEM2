import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type ReturnLine = {
  key: string;
  sourceType: "product_detail" | "usage_tier" | "external";
  sourceId: number | string | null;
  name: string;
  soldQuantity: number;
  returnQuantity: number;
  condition: "good" | "damaged";
  selected: boolean;
};

type Props = {
  orderId: number;
  orderNumber: string;
  orderTotal: number;
  branchId: string | null;
  onClose: () => void;
  onCompleted: () => void | Promise<void>;
};

const inputClass =
  "w-full rounded-xl border border-gray-200 bg-white p-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";

function wholeNumber(value: number) {
  return Math.max(Math.round(Number(value || 0)), 0);
}

export default function OrderReturnDialog({
  orderId,
  orderNumber,
  orderTotal,
  branchId,
  onClose,
  onCompleted,
}: Props) {
  const [lines, setLines] = useState<ReturnLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [returnType, setReturnType] = useState<"full" | "partial">("full");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [returnValue, setReturnValue] = useState(String(wholeNumber(orderTotal)));
  const [refundAmount, setRefundAmount] = useState(String(wholeNumber(orderTotal)));
  const [refundMethod, setRefundMethod] = useState("cash");
  const [returnImage, setReturnImage] = useState<File | null>(null);
  const [returnImagePreview, setReturnImagePreview] = useState("");

  useEffect(() => {
    void loadLines();
  }, [orderId]);

  useEffect(() => {
    if (returnType === "full") {
      setReturnValue(String(wholeNumber(orderTotal)));
    }
  }, [returnType, orderTotal]);

  async function loadLines() {
    setLoading(true);
    try {
      const [componentsResult, itemsResult] = await Promise.all([
        supabase
          .from("order_custom_items")
          .select(
            `id,order_custom_item_components(id,product_detail_id,component_name,quantity,is_external)`
          )
          .eq("order_id", orderId),
        supabase
          .from("order_items")
          .select(
            `id,title,order_item_usage_tiers(usage_price,quantity),order_item_wrapping_options(product_detail_id,material_name,actual_quantity)`
          )
          .eq("order_id", orderId),
      ]);

      if (componentsResult.error) throw componentsResult.error;
      if (itemsResult.error) throw itemsResult.error;

      const result: ReturnLine[] = [];

      for (const item of componentsResult.data || []) {
        for (const component of (item as any).order_custom_item_components || []) {
          const qty = wholeNumber(component.quantity);
          if (qty <= 0) continue;
          const external = Boolean(component.is_external) || !component.product_detail_id;
          result.push({
            key: `component-${component.id}`,
            sourceType: external ? "external" : "product_detail",
            sourceId: external ? null : Number(component.product_detail_id),
            name: String(component.component_name || "مكوّن"),
            soldQuantity: qty,
            returnQuantity: qty,
            condition: "good",
            selected: true,
          });
        }
      }

      for (const item of itemsResult.data || []) {
        for (const usage of (item as any).order_item_usage_tiers || []) {
          const qty = wholeNumber(usage.quantity);
          if (qty <= 0) continue;
          result.push({
            key: `tier-${(item as any).id}-${usage.usage_price}`,
            sourceType: "usage_tier",
            sourceId: String(usage.usage_price),
            name: `فئة استخدام ${wholeNumber(usage.usage_price)} د.ل`,
            soldQuantity: qty,
            returnQuantity: qty,
            condition: "good",
            selected: true,
          });
        }

        for (const wrapping of (item as any).order_item_wrapping_options || []) {
          const qty = wholeNumber(wrapping.actual_quantity);
          if (qty <= 0 || !wrapping.product_detail_id) continue;
          result.push({
            key: `wrap-${(item as any).id}-${wrapping.product_detail_id}`,
            sourceType: "product_detail",
            sourceId: Number(wrapping.product_detail_id),
            name: String(wrapping.material_name || "ورق تغليف"),
            soldQuantity: qty,
            returnQuantity: qty,
            condition: "good",
            selected: true,
          });
        }
      }

      const merged = new Map<string, ReturnLine>();
      for (const line of result) {
        const mergeKey = `${line.sourceType}-${line.sourceId ?? line.name}`;
        const current = merged.get(mergeKey);
        if (current) {
          current.soldQuantity += line.soldQuantity;
          current.returnQuantity += line.returnQuantity;
        } else {
          merged.set(mergeKey, { ...line, key: mergeKey });
        }
      }

      setLines(Array.from(merged.values()));
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : "تعذر تحميل مكونات الطلب");
    } finally {
      setLoading(false);
    }
  }

  const selectedLines = useMemo(
    () => lines.filter((line) => line.selected && line.returnQuantity > 0),
    [lines]
  );

  function updateLine(key: string, updates: Partial<ReturnLine>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...updates } : line))
    );
  }

  function setAllCondition(condition: "good" | "damaged") {
    setLines((current) =>
      current.map((line) => (line.selected ? { ...line, condition } : line))
    );
  }

  async function submit() {
    if (!reason.trim()) return alert("اكتب سبب الإرجاع");

    // يسمح بالإرجاع المالي حتى لو لم توجد مكونات قابلة للتحميل.
    for (const line of selectedLines) {
      if (line.returnQuantity <= 0 || line.returnQuantity > line.soldQuantity) {
        return alert(`كمية الإرجاع غير صحيحة في: ${line.name}`);
      }
    }

    const numericReturnValue =
      returnType === "full" ? wholeNumber(orderTotal) : wholeNumber(Number(returnValue));
    const refund = wholeNumber(Number(refundAmount));

    if (numericReturnValue <= 0 || numericReturnValue > wholeNumber(orderTotal)) {
      return alert("قيمة الجزء المرتجع غير صحيحة");
    }

    if (refund < 0) return alert("قيمة المبلغ المسترجع غير صحيحة");
    if (refund > 0 && refundMethod === "none") {
      return alert("اختر طريقة رد المبلغ");
    }

    if (
      !window.confirm(
        "تأكيد تسجيل الإرجاع؟ السليم يرجع إلى مخزون نفس الفرع، والتالف يسجل في الهالك."
      )
    ) {
      return;
    }

    setSaving(true);
    try {
      const payload = selectedLines.map((line) => ({
        sourceType: line.sourceType,
        sourceId: line.sourceId,
        name: line.name,
        soldQuantity: wholeNumber(line.soldQuantity),
        returnQuantity: wholeNumber(line.returnQuantity),
        condition: line.condition,
      }));

      let photoUrl: string | null = null;
      if (returnImage) {
        const extension = returnImage.name.split(".").pop() || "jpg";
        const path = `${orderId}/${Date.now()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from("return-images")
          .upload(path, returnImage);
        if (uploadError) throw uploadError;
        photoUrl = supabase.storage.from("return-images").getPublicUrl(path).data.publicUrl;
      }

      const { data: returnId, error } = await supabase.rpc("process_order_return", {
        p_order_id: orderId,
        p_return_type: returnType,
        p_reason: reason.trim(),
        p_notes: notes.trim() || null,
        p_return_value: numericReturnValue,
        p_refund_amount: refund,
        p_refund_method: refundMethod,
        p_items: payload,
        p_branch_id: branchId,
      });

      if (error) throw error;

      if (returnId && photoUrl) {
        const { error: photoError } = await supabase
          .from("order_returns")
          .update({ photo_url: photoUrl })
          .eq("id", returnId);
        if (photoError) throw photoError;
      }

      try {
        await supabase.rpc("log_activity", {
          p_action: "order_return",
          p_entity_type: "orders",
          p_entity_id: String(orderId),
          p_entity_label: orderNumber,
          p_page_name: "orders",
          p_description: `تم تسجيل إرجاع للطلب. السبب: ${reason.trim()}`,
          p_old_data: null,
          p_new_data: {
            returnType,
            returnValue: numericReturnValue,
            refundAmount: refund,
            refundMethod,
            photoUrl,
          },
          p_metadata: { branch_id: branchId },
        });
      } catch {
        // لا نوقف الإرجاع إذا فشل سجل العمليات.
      }

      alert("تم تسجيل الإرجاع بنجاح ✅");
      await onCompleted();
      onClose();
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : "تعذر تسجيل الإرجاع");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-3"
      dir="rtl"
    >
      <div className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold">إرجاع الطلب #{orderNumber}</h2>
            <p className="mt-1 text-sm text-gray-500">
              السليم يرجع للمخزون، والتالف يسجل في الهالك بدون إضافته للمخزون.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-red-100 px-4 py-2 text-red-700"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="font-semibold">
            نوع الإرجاع
            <select
              className={`${inputClass} mt-2`}
              value={returnType}
              onChange={(event) => setReturnType(event.target.value as "full" | "partial")}
            >
              <option value="full">إرجاع كامل</option>
              <option value="partial">إرجاع جزئي</option>
            </select>
          </label>

          <label className="font-semibold">
            سبب الإرجاع *
            <input
              className={`${inputClass} mt-2`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="مثال: عيب / طلب غير مطابق / تغيير رأي العميل"
            />
          </label>

          <label className="font-semibold">
            قيمة الجزء المرتجع
            <input
              type="number"
              min="1"
              step="1"
              disabled={returnType === "full"}
              className={`${inputClass} mt-2 disabled:bg-gray-100`}
              value={returnType === "full" ? wholeNumber(orderTotal) : returnValue}
              onChange={(event) => setReturnValue(event.target.value)}
            />
          </label>

          <label className="font-semibold">
            المبلغ الذي سيرد للزبون
            <input
              type="number"
              min="0"
              step="1"
              className={`${inputClass} mt-2`}
              value={refundAmount}
              onChange={(event) => setRefundAmount(event.target.value)}
            />
          </label>

          <label className="font-semibold md:col-span-2">
            طريقة رد المبلغ
            <select
              className={`${inputClass} mt-2`}
              value={refundMethod}
              onChange={(event) => setRefundMethod(event.target.value)}
            >
              <option value="cash">كاش</option>
              <option value="bank">مصرف</option>
              <option value="transfer">تحويل</option>
              <option value="credit">رصيد للعميل</option>
              <option value="exchange">استبدال بمنتج آخر</option>
              <option value="none">بدون رد مبلغ</option>
            </select>
          </label>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setAllCondition("good")}
            className="rounded-xl bg-emerald-100 px-4 py-2 font-semibold text-emerald-800"
          >
            المحدد كله سليم
          </button>
          <button
            type="button"
            onClick={() => setAllCondition("damaged")}
            className="rounded-xl bg-red-100 px-4 py-2 font-semibold text-red-800"
          >
            المحدد كله تالف
          </button>
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border">
          {loading ? (
            <div className="p-8 text-center">جاري تحميل مكونات الطلب...</div>
          ) : (
            <table className="w-full min-w-[760px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-3 text-right">إرجاع</th>
                  <th className="p-3 text-right">العنصر</th>
                  <th className="p-3">المباع</th>
                  <th className="p-3">الكمية الراجعة</th>
                  <th className="p-3">الحالة</th>
                  <th className="p-3 text-right">النتيجة</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.key} className="border-t">
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={line.selected}
                        onChange={(event) =>
                          updateLine(line.key, { selected: event.target.checked })
                        }
                      />
                    </td>
                    <td className="p-3 font-semibold">
                      {line.name}
                      {line.sourceType === "external" && (
                        <span className="mr-2 text-xs text-gray-500">خارجي</span>
                      )}
                    </td>
                    <td className="p-3 text-center">{wholeNumber(line.soldQuantity)}</td>
                    <td className="p-3">
                      <input
                        type="number"
                        min="0"
                        max={line.soldQuantity}
                        step="1"
                        disabled={!line.selected}
                        className="w-24 rounded-lg border p-2"
                        value={line.returnQuantity}
                        onChange={(event) =>
                          updateLine(line.key, {
                            returnQuantity: wholeNumber(Number(event.target.value)),
                          })
                        }
                      />
                    </td>
                    <td className="p-3">
                      <select
                        disabled={!line.selected}
                        className="rounded-lg border p-2"
                        value={line.condition}
                        onChange={(event) =>
                          updateLine(line.key, {
                            condition: event.target.value as "good" | "damaged",
                          })
                        }
                      >
                        <option value="good">سليم</option>
                        <option value="damaged">تالف / غير قابل للبيع</option>
                      </select>
                    </td>
                    <td className="p-3 text-sm">
                      {!line.selected
                        ? "غير مُرجع"
                        : line.sourceType === "external"
                          ? "يسجل فقط"
                          : line.condition === "good"
                            ? "يرجع للمخزون"
                            : "يتسجل في الهالك"}
                    </td>
                  </tr>
                ))}
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-500">
                      لم نجد مكونات مخزنية. يمكنك تسجيل الإرجاع المالي والملاحظات فقط.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-5 rounded-xl border border-dashed p-4">
          <label className="block font-semibold">
            صورة المرتجع (اختيارية، ومهمة عند التلف)
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="mt-2 block w-full"
              onChange={(event) => {
                const file = event.target.files?.[0] || null;
                setReturnImage(file);
                setReturnImagePreview(file ? URL.createObjectURL(file) : "");
              }}
            />
          </label>
          {returnImagePreview && (
            <img
              src={returnImagePreview}
              alt="صورة المرتجع"
              className="mt-3 max-h-64 w-full rounded-xl object-contain"
            />
          )}
        </div>

        <label className="mt-5 block font-semibold">
          ملاحظات
          <textarea
            rows={3}
            className={`${inputClass} mt-2`}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-gray-100 px-6 py-3 font-semibold"
          >
            إلغاء
          </button>
          <button
            type="button"
            disabled={saving || loading}
            onClick={() => void submit()}
            className="rounded-xl bg-orange-700 px-6 py-3 font-semibold text-white disabled:opacity-50"
          >
            {saving ? "جاري الحفظ..." : "تأكيد الإرجاع"}
          </button>
        </div>
      </div>
    </div>
  );
}
