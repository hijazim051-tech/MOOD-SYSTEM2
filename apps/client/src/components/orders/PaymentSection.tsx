import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useBranch } from "../../context/BranchContext";
export type PaymentData = {
  paymentMethod: "cash" | "bank" | "transfer" | "deposit" | "mixed";

  cashAmount: number;
  bankAmount: number;
  transferAmount: number;
  depositAmount: number;
  depositMethod?: "cash" | "bank" | "transfer" | "none";

  deliveryFee: number;

  /*
   * تُضبط تلقائيًا عند اختيار:
   * "المحل يدفع للكابتن كاش".
   */
  deliveryPaidCash: boolean;

  deliveryPaymentMethod:
    | "none"
    | "cash"
    | "bank"
    | "customer_paid";

  deliveryDriverName: string;
  deliveryAddress: string;

  /*
   * حقول قديمة نحتفظ بها مؤقتًا حتى لا تتكسر الملفات الأخرى.
   * لا تظهر داخل هذه الواجهة.
   */
  deliveryStatus: "pending" | "assigned" | "delivered";
  deliveryCompanyName: string;

  /*
   * يبقى الخصم في بيانات الطلب والحسابات،
   * لكنه لا يظهر داخل قسم التوصيل.
   */
  discount: number;
};

type Props = {
  value: PaymentData;
  onChange: (value: PaymentData) => void;
  mode?: "all" | "payment" | "delivery";
};

export default function PaymentSection({ value, onChange, mode = "all" }: Props) {
  const { effectiveBranchId } = useBranch();
  const [driverNames, setDriverNames] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function loadDrivers() {
      let query = supabase.from("delivery_drivers").select("name").eq("is_active", true).order("name");
      if (effectiveBranchId) query = query.eq("branch_id", effectiveBranchId);
      const { data } = await query;
      if (!cancelled) setDriverNames((data || []).map((row: any) => String(row.name || "")).filter(Boolean));
    }
    void loadDrivers();
    return () => { cancelled = true; };
  }, [effectiveBranchId]);
  function update<K extends keyof PaymentData>(
    field: K,
    fieldValue: PaymentData[K]
  ) {
    onChange({
      ...value,
      [field]: fieldValue,
    });
  }

  const totalPaid =
    Number(value.cashAmount || 0) +
    Number(value.bankAmount || 0) +
    Number(value.transferAmount || 0) +
    Number(value.depositAmount || 0);

  const hasDelivery =
    value.deliveryPaymentMethod !== "none" ||
    Number(value.deliveryFee || 0) > 0 ||
    Boolean(value.deliveryDriverName.trim()) ||
    Boolean(value.deliveryAddress.trim());

  function changePaymentMethod(
    method: PaymentData["paymentMethod"]
  ) {
    if (method === "cash") {
      onChange({
        ...value,
        paymentMethod: method,
        bankAmount: 0,
        transferAmount: 0,
        depositAmount: 0,
      });
      return;
    }

    if (method === "bank") {
      onChange({
        ...value,
        paymentMethod: method,
        cashAmount: 0,
        transferAmount: 0,
        depositAmount: 0,
      });
      return;
    }

    if (method === "transfer") {
      onChange({
        ...value,
        paymentMethod: method,
        cashAmount: 0,
        bankAmount: 0,
        depositAmount: 0,
      });
      return;
    }

    if (method === "deposit") {
      onChange({
        ...value,
        paymentMethod: method,
        cashAmount: 0,
        bankAmount: 0,
        transferAmount: 0,
        depositMethod: value.depositMethod === "none" ? "cash" : value.depositMethod,
      });
      return;
    }

    update("paymentMethod", method);
  }

  function changeDeliveryMethod(
    method: PaymentData["deliveryPaymentMethod"]
  ) {
    if (method === "none") {
      onChange({
        ...value,
        deliveryPaymentMethod: "none",
        deliveryPaidCash: false,
        deliveryFee: 0,
        deliveryDriverName: "",
        deliveryAddress: "",
        deliveryStatus: "pending",
        deliveryCompanyName: "",
      });
      return;
    }

    onChange({
      ...value,
      deliveryPaymentMethod: method,
      deliveryPaidCash: method === "cash",
      deliveryStatus: "pending",
      deliveryCompanyName: "",
    });
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow" dir="rtl">
      <h2 className="mb-5 text-2xl font-bold">الدفع والتوصيل</h2>

      <div className="space-y-6">
        {(mode === "all" || mode === "payment") && (
          <>
        <section>
          <label className="mb-2 block font-semibold">
            طريقة دفع الطلب
          </label>

          <select
            value={value.paymentMethod}
            onChange={(event) =>
              changePaymentMethod(
                event.target.value as PaymentData["paymentMethod"]
              )
            }
            className="w-full rounded-xl border p-3"
          >
            <option value="cash">كاش</option>
            <option value="bank">خدمات مصرفية</option>
            <option value="transfer">تحويل</option>
            <option value="deposit">عربون</option>
            <option value="mixed">دفع مختلط</option>
          </select>
        </section>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {(value.paymentMethod === "cash" ||
            value.paymentMethod === "mixed") && (
            <input
              type="number"
              min="0"
              step="0.01"
              value={value.cashAmount || ""}
              onChange={(event) =>
                update(
                  "cashAmount",
                  Number(event.target.value || 0)
                )
              }
              className="rounded-xl border p-3"
              placeholder="المبلغ كاش"
            />
          )}

          {(value.paymentMethod === "bank" ||
            value.paymentMethod === "mixed") && (
            <input
              type="number"
              min="0"
              step="0.01"
              value={value.bankAmount || ""}
              onChange={(event) =>
                update(
                  "bankAmount",
                  Number(event.target.value || 0)
                )
              }
              className="rounded-xl border p-3"
              placeholder="الخدمات المصرفية"
            />
          )}

          {(value.paymentMethod === "transfer" ||
            value.paymentMethod === "mixed") && (
            <input
              type="number"
              min="0"
              step="0.01"
              value={value.transferAmount || ""}
              onChange={(event) =>
                update(
                  "transferAmount",
                  Number(event.target.value || 0)
                )
              }
              className="rounded-xl border p-3"
              placeholder="التحويل"
            />
          )}

          {(value.paymentMethod === "deposit" ||
            value.paymentMethod === "mixed") && (
            <div className="grid grid-cols-1 gap-3 rounded-xl border bg-amber-50 p-3 md:col-span-2 md:grid-cols-2">
              <input
                type="number"
                min="0"
                step="0.01"
                value={value.depositAmount || ""}
                onChange={(event) =>
                  update(
                    "depositAmount",
                    Number(event.target.value || 0)
                  )
                }
                className="rounded-xl border bg-white p-3"
                placeholder="قيمة العربون"
              />
              <select
                value={value.depositMethod || "cash"}
                onChange={(event) =>
                  update(
                    "depositMethod",
                    event.target.value as PaymentData["depositMethod"]
                  )
                }
                className="rounded-xl border bg-white p-3"
              >
                <option value="cash">العربون كاش</option>
                <option value="bank">العربون خدمات مصرفية</option>
                <option value="transfer">العربون تحويل</option>
              </select>
              <p className="text-sm text-amber-800 md:col-span-2">
                اختر كيف استلم المحل الدفعة المقدمة حتى تظهر صحيحة في الحسابات والتقارير.
              </p>
            </div>
          )}
        </section>

        <div className="rounded-xl bg-emerald-50 p-4">
          <p className="text-gray-500">إجمالي المدفوع</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">
            {totalPaid.toFixed(2)} د.ل
          </p>
          <p className="mt-2 text-sm text-emerald-800">
            يمكن حفظ دفعة جزئية، ويُسجل الباقي تلقائيًا كمتبقي على الطلب.
          </p>
        </div>

          </>
        )}

        {(mode === "all" || mode === "delivery") && (
          <>
            {mode === "all" && <hr />}
        <section>
          <div className="mb-4">
            <h3 className="text-xl font-bold">التوصيل</h3>
            <p className="mt-1 text-sm text-gray-500">
              أدخل بيانات التوصيل فقط إذا كان الطلب يحتاج توصيلًا.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <input
              type="number"
              min="0"
              step="0.01"
              value={value.deliveryFee || ""}
              onChange={(event) =>
                update(
                  "deliveryFee",
                  Number(event.target.value || 0)
                )
              }
              className="rounded-xl border p-3"
              placeholder="قيمة التوصيل"
            />

            <select
              value={value.deliveryPaymentMethod}
              onChange={(event) =>
                changeDeliveryMethod(
                  event.target
                    .value as PaymentData["deliveryPaymentMethod"]
                )
              }
              className="rounded-xl border p-3"
            >
              <option value="none">بدون توصيل</option>

              <option value="cash">
                المحل يدفع للكابتن كاش
              </option>

              <option value="bank">
                الزبون دفع التوصيل للمحل
              </option>

              <option value="customer_paid">
                الزبون يدفع للكابتن مباشرة
              </option>
            </select>

            <div className="relative">
            <input
              list="mood-delivery-drivers"
              value={value.deliveryDriverName}
              onChange={(event) =>
                update(
                  "deliveryDriverName",
                  event.target.value
                )
              }
              disabled={value.deliveryPaymentMethod === "none"}
              className="rounded-xl border p-3 disabled:bg-gray-100"
              placeholder="اكتب أول حروف اسم الكابتن"
            />
            <datalist id="mood-delivery-drivers">
              {driverNames.map((name) => <option key={name} value={name} />)}
            </datalist>
            </div>

            <input
              value={value.deliveryAddress}
              onChange={(event) =>
                update("deliveryAddress", event.target.value)
              }
              disabled={value.deliveryPaymentMethod === "none"}
              className="rounded-xl border p-3 disabled:bg-gray-100"
              placeholder="مكان التوصيل"
            />
          </div>

          {value.deliveryPaymentMethod === "cash" && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
              <p className="font-bold">
                قيمة التوصيل ستُسجل كمصروف كاش على المحل
              </p>
              <p className="mt-1 text-sm">
                حتى لو دفع الزبون قيمة الطلب والتوصيل بالخدمات
                المصرفية، سيُخصم مبلغ التوصيل محاسبيًا من كاش
                المحل لأنه سيُدفع للكابتن نقدًا.
              </p>
            </div>
          )}

          {value.deliveryPaymentMethod === "customer_paid" && (
            <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-700">
              الزبون سيدفع قيمة التوصيل للكابتن مباشرة، لذلك لا
              تُسجل قيمة التوصيل كمصروف على المحل.
            </div>
          )}

          {!hasDelivery && (
            <p className="mt-4 rounded-xl bg-gray-50 p-3 text-sm text-gray-500">
              الطلب مضبوط حاليًا بدون توصيل.
            </p>
          )}
        </section>
          </>
        )}
      </div>
    </div>
  );
}