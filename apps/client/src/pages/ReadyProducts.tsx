import { useEffect, useMemo, useState } from "react";

import {
  cancelReadyProduct,
  loadReadyProducts,
  reserveReadyProduct,
  sellReadyProduct,
  unreserveReadyProduct,
  type ReadyProduct,
  type ReadyProductStatus,
  type ReadyProductType,
} from "../lib/readyProducts";

type TypeFilter = "all" | ReadyProductType;
type StatusFilter = "all" | ReadyProductStatus;

type SaleForm = {
  customerName: string;
  customerPhone: string;
  paymentMethod: string;
  cashAmount: number;
  bankAmount: number;
  transferAmount: number;
  depositAmount: number;
  discount: number;
};

const emptySaleForm: SaleForm = {
  customerName: "",
  customerPhone: "",
  paymentMethod: "cash",
  cashAmount: 0,
  bankAmount: 0,
  transferAmount: 0,
  depositAmount: 0,
  discount: 0,
};

export default function ReadyProducts() {
  const [items, setItems] = useState<ReadyProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ready");
  const [saleItem, setSaleItem] = useState<ReadyProduct | null>(null);
  const [saleForm, setSaleForm] = useState<SaleForm>({ ...emptySaleForm });
  const [selling, setSelling] = useState(false);

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    setLoading(true);

    try {
      setItems(await loadReadyProducts());
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  const filteredItems = useMemo(() => {
    const value = search.trim().toLowerCase();

    return items.filter((item) => {
      if (typeFilter !== "all" && item.productType !== typeFilter) {
        return false;
      }

      if (statusFilter !== "all" && item.status !== statusFilter) {
        return false;
      }

      if (!value) return true;

      return (
        item.name.toLowerCase().includes(value) ||
        item.readyNumber.toLowerCase().includes(value) ||
        item.notes.toLowerCase().includes(value)
      );
    });
  }, [items, search, typeFilter, statusFilter]);

  const stats = useMemo(
    () => ({
      ready: items.filter((item) => item.status === "ready").length,
      reserved: items.filter((item) => item.status === "reserved").length,
      sold: items.filter((item) => item.status === "sold").length,
      cancelled: items.filter((item) => item.status === "cancelled").length,
    }),
    [items]
  );

  async function handleReserve(item: ReadyProduct) {
    setWorkingId(item.id);

    try {
      await reserveReadyProduct(item.id);
      await loadData();
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      setWorkingId(null);
    }
  }

  async function handleUnreserve(item: ReadyProduct) {
    setWorkingId(item.id);

    try {
      await unreserveReadyProduct(item.id);
      await loadData();
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      setWorkingId(null);
    }
  }

  async function handleCancel(item: ReadyProduct) {
    const confirmed = window.confirm(
      `سيتم إلغاء "${item.name}" وإرجاع جميع مكوناته إلى المخزون. هل تريد المتابعة؟`
    );

    if (!confirmed) return;

    setWorkingId(item.id);

    try {
      await cancelReadyProduct(item.id, "إلغاء من صفحة الجاهزات");
      await loadData();
      alert("تم إلغاء الجاهز وإرجاع مكوناته للمخزون ✅");
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      setWorkingId(null);
    }
  }

  function openSale(item: ReadyProduct) {
    setSaleItem(item);
    setSaleForm({
      ...emptySaleForm,
      cashAmount: item.sellPrice,
    });
  }

  async function confirmSale() {
    if (!saleItem) return;

    const paid =
      Number(saleForm.cashAmount || 0) +
      Number(saleForm.bankAmount || 0) +
      Number(saleForm.transferAmount || 0) +
      Number(saleForm.depositAmount || 0);

    const finalTotal = Math.max(
      0,
      saleItem.sellPrice - Number(saleForm.discount || 0)
    );

    if (paid > finalTotal) {
      const confirmed = window.confirm(
        "إجمالي المدفوع أكبر من السعر النهائي. هل تريد المتابعة؟"
      );

      if (!confirmed) return;
    }

    setSelling(true);

    try {
      const result = await sellReadyProduct({
        readyProductId: saleItem.id,
        ...saleForm,
      });

      setSaleItem(null);
      setSaleForm({ ...emptySaleForm });
      await loadData();

      alert(
        `تم بيع الجاهز بدون خصم المخزون مرة ثانية ✅\nرقم الطلب: ${result.orderNumber}`
      );
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      setSelling(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-2xl font-bold">
        جاري تحميل الجاهزات...
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-8" dir="rtl">
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <h1 className="text-4xl font-bold">الباقات والبوكسات الجاهزة</h1>
          <p className="mt-2 text-gray-500">
            البحث والحجز والبيع والإلغاء مع إدارة المخزون تلقائيًا
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadData()}
          className="rounded-xl border bg-white px-5 py-3 font-bold shadow-sm"
        >
          ↻ تحديث
        </button>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="جاهز"
          value={stats.ready}
          active={statusFilter === "ready"}
          onClick={() => setStatusFilter("ready")}
          className="bg-emerald-50 text-emerald-700"
        />
        <StatCard
          label="محجوز"
          value={stats.reserved}
          active={statusFilter === "reserved"}
          onClick={() => setStatusFilter("reserved")}
          className="bg-amber-50 text-amber-700"
        />
        <StatCard
          label="تم البيع"
          value={stats.sold}
          active={statusFilter === "sold"}
          onClick={() => setStatusFilter("sold")}
          className="bg-blue-50 text-blue-700"
        />
        <StatCard
          label="ملغي"
          value={stats.cancelled}
          active={statusFilter === "cancelled"}
          onClick={() => setStatusFilter("cancelled")}
          className="bg-red-50 text-red-700"
        />
      </section>

      <section className="grid grid-cols-1 gap-4 rounded-2xl bg-white p-5 shadow md:grid-cols-3">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="rounded-xl border p-3 outline-none focus:border-emerald-600"
          placeholder="بحث باسم الجاهز أو رقمه"
        />

        <select
          value={typeFilter}
          onChange={(event) =>
            setTypeFilter(event.target.value as TypeFilter)
          }
          className="rounded-xl border p-3"
        >
          <option value="all">كل الأنواع</option>
          <option value="bouquet">الباقات</option>
          <option value="box">البوكسات</option>
        </select>

        <select
          value={statusFilter}
          onChange={(event) =>
            setStatusFilter(event.target.value as StatusFilter)
          }
          className="rounded-xl border p-3"
        >
          <option value="all">كل الحالات</option>
          <option value="ready">جاهز</option>
          <option value="reserved">محجوز</option>
          <option value="sold">تم البيع</option>
          <option value="cancelled">ملغي</option>
        </select>
      </section>

      {filteredItems.length > 0 ? (
        <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredItems.map((item) => {
            const busy = workingId === item.id;
            const status = getStatusInfo(item.status);

            return (
              <article
                key={item.id}
                className="overflow-hidden rounded-2xl bg-white shadow"
              >
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="h-56 w-full object-cover"
                  />
                ) : (
                  <div className="flex h-44 items-center justify-center bg-gray-100 text-6xl">
                    {item.productType === "bouquet" ? "🌹" : "🎁"}
                  </div>
                )}

                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm text-gray-500">
                        {item.readyNumber}
                      </p>
                      <h2 className="mt-1 text-2xl font-bold">
                        {item.name}
                      </h2>
                    </div>

                    <span
                      className={`rounded-full px-3 py-1 text-sm font-bold ${status.className}`}
                    >
                      {status.label}
                    </span>
                  </div>

                  <div className="mt-4 flex items-center justify-between">
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-semibold">
                      {item.productType === "bouquet" ? "باقة" : "بوكس"}
                    </span>

                    <p className="text-2xl font-bold text-emerald-700">
                      {item.sellPrice.toFixed(2)} د.ل
                    </p>
                  </div>

                  <p className="mt-4 text-sm text-gray-500">
                    تاريخ الإنتاج:{" "}
                    {formatDate(item.createdAt)}
                  </p>

                  {item.notes && (
                    <p className="mt-3 rounded-xl bg-gray-50 p-3 text-sm">
                      {item.notes}
                    </p>
                  )}

                  <div className="mt-5 grid grid-cols-2 gap-2">
                    {item.status === "ready" && (
                      <>
                        <button
                          type="button"
                          onClick={() => openSale(item)}
                          disabled={busy}
                          className="rounded-xl bg-emerald-700 px-4 py-3 font-bold text-white disabled:opacity-50"
                        >
                          تم البيع
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleReserve(item)}
                          disabled={busy}
                          className="rounded-xl bg-amber-100 px-4 py-3 font-bold text-amber-700 disabled:opacity-50"
                        >
                          حجز
                        </button>
                      </>
                    )}

                    {item.status === "reserved" && (
                      <>
                        <button
                          type="button"
                          onClick={() => openSale(item)}
                          disabled={busy}
                          className="rounded-xl bg-emerald-700 px-4 py-3 font-bold text-white disabled:opacity-50"
                        >
                          تم البيع
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleUnreserve(item)}
                          disabled={busy}
                          className="rounded-xl bg-blue-100 px-4 py-3 font-bold text-blue-700 disabled:opacity-50"
                        >
                          إلغاء الحجز
                        </button>
                      </>
                    )}

                    {(item.status === "ready" ||
                      item.status === "reserved") && (
                      <button
                        type="button"
                        onClick={() => void handleCancel(item)}
                        disabled={busy}
                        className="col-span-2 rounded-xl bg-red-100 px-4 py-3 font-bold text-red-700 disabled:opacity-50"
                      >
                        إلغاء وإرجاع المخزون
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      ) : (
        <div className="rounded-2xl bg-white p-12 text-center text-gray-500 shadow">
          لا توجد جاهزات مطابقة للبحث أو الفلتر.
        </div>
      )}

      {saleItem && (
        <SaleDialog
          item={saleItem}
          form={saleForm}
          saving={selling}
          onChange={setSaleForm}
          onClose={() => setSaleItem(null)}
          onConfirm={() => void confirmSale()}
        />
      )}
    </div>
  );
}

function SaleDialog({
  item,
  form,
  saving,
  onChange,
  onClose,
  onConfirm,
}: {
  item: ReadyProduct;
  form: SaleForm;
  saving: boolean;
  onChange: (form: SaleForm) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const paid =
    Number(form.cashAmount || 0) +
    Number(form.bankAmount || 0) +
    Number(form.transferAmount || 0) +
    Number(form.depositAmount || 0);

  const total = Math.max(
    0,
    item.sellPrice - Number(form.discount || 0)
  );

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4">
      <div
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-7 shadow-2xl"
        dir="rtl"
      >
        <h2 className="text-2xl font-bold">تأكيد بيع الجاهز</h2>
        <p className="mt-2 text-gray-500">
          {item.name} — {item.readyNumber}
        </p>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input
            label="اسم العميل (اختياري)"
            value={form.customerName}
            onChange={(value) =>
              onChange({ ...form, customerName: value })
            }
          />

          <Input
            label="رقم الهاتف (اختياري)"
            value={form.customerPhone}
            onChange={(value) =>
              onChange({ ...form, customerPhone: value })
            }
          />

          <div>
            <label className="mb-2 block font-semibold">
              طريقة الدفع
            </label>
            <select
              value={form.paymentMethod}
              onChange={(event) =>
                onChange({
                  ...form,
                  paymentMethod: event.target.value,
                })
              }
              className="w-full rounded-xl border p-3"
            >
              <option value="cash">نقدي</option>
              <option value="bank">بطاقة مصرفية</option>
              <option value="transfer">تحويل مصرفي</option>
              <option value="mixed">مختلط</option>
            </select>
          </div>

          <NumberInput
            label="الخصم"
            value={form.discount}
            onChange={(value) =>
              onChange({ ...form, discount: value })
            }
          />

          <NumberInput
            label="نقدي"
            value={form.cashAmount}
            onChange={(value) =>
              onChange({ ...form, cashAmount: value })
            }
          />

          <NumberInput
            label="بطاقة"
            value={form.bankAmount}
            onChange={(value) =>
              onChange({ ...form, bankAmount: value })
            }
          />

          <NumberInput
            label="تحويل"
            value={form.transferAmount}
            onChange={(value) =>
              onChange({ ...form, transferAmount: value })
            }
          />

          <NumberInput
            label="عربون / دفعة أخرى"
            value={form.depositAmount}
            onChange={(value) =>
              onChange({ ...form, depositAmount: value })
            }
          />
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
          <Summary label="السعر" value={item.sellPrice} />
          <Summary label="بعد الخصم" value={total} />
          <Summary label="المدفوع" value={paid} />
        </div>

        <p className="mt-4 rounded-xl bg-blue-50 p-4 text-sm text-blue-700">
          لن يتم خصم المخزون مرة ثانية؛ المكونات خُصمت وقت إنتاج الجاهز.
        </p>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-xl border px-5 py-3 font-bold disabled:opacity-50"
          >
            رجوع
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={saving}
            className="flex-1 rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white disabled:opacity-50"
          >
            {saving ? "جاري البيع..." : "تأكيد البيع"}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  active,
  onClick,
  className,
}: {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
  className: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border p-4 text-right shadow-sm ${className} ${
        active ? "ring-2 ring-gray-400" : ""
      }`}
    >
      <p className="text-sm font-semibold">{label}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
    </button>
  );
}

function Input({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block font-semibold">{label}</label>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border p-3"
      />
    </div>
  );
}

function NumberInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <label className="mb-2 block font-semibold">{label}</label>
      <input
        type="number"
        min="0"
        step="0.01"
        value={value}
        onChange={(event) =>
          onChange(Number(event.target.value || 0))
        }
        className="w-full rounded-xl border p-3"
      />
    </div>
  );
}

function Summary({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl bg-gray-50 p-4 text-center">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-bold">
        {value.toFixed(2)} د.ل
      </p>
    </div>
  );
}

function getStatusInfo(status: ReadyProductStatus) {
  if (status === "ready") {
    return {
      label: "جاهز",
      className: "bg-emerald-100 text-emerald-700",
    };
  }

  if (status === "reserved") {
    return {
      label: "محجوز",
      className: "bg-amber-100 text-amber-700",
    };
  }

  if (status === "sold") {
    return {
      label: "تم البيع",
      className: "bg-blue-100 text-blue-700",
    };
  }

  return {
    label: "ملغي",
    className: "bg-red-100 text-red-700",
  };
}

function formatDate(value: string) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("ar-LY");
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