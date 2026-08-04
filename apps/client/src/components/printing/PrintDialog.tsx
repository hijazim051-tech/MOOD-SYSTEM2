import { useEffect, useState } from "react";
import { loadSettings, type Settings } from "../../lib/settings";
import {
  buildBothDocumentsHtml,
  buildCustomerInvoiceHtml,
  buildProductionSheetHtml,
  openPrintDocument,
} from "./printHelpers";
import type { PrintableOrder, PrintMode } from "./types";

export default function PrintDialog({
  order,
  onClose,
}: {
  order: PrintableOrder;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<PrintMode>("customer");
  const [copies, setCopies] = useState(1);
  const [preview, setPreview] = useState(true);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    loadPrintSettings();
  }, []);

  async function loadPrintSettings() {
    try {
      const data = await loadSettings();
      setSettings(data);
      setCopies(Math.max(1, Number(data.print_copies || 1)));
      setPreview(data.show_print_preview ?? true);
    } catch (error: unknown) {
      alert(getErrorMessage(error));
      onClose();
    } finally {
      setLoading(false);
    }
  }

  function handlePrint() {
    if (!settings) return;

    setPrinting(true);

    try {
      const safeCopies = Math.max(1, Number(copies || 1));
      let html = "";

      if (mode === "customer") {
        html = buildCustomerInvoiceHtml(order, settings, safeCopies);
      } else if (mode === "production") {
        html = buildProductionSheetHtml(order, settings, safeCopies);
      } else {
        html = buildBothDocumentsHtml(order, settings, safeCopies);
      }

      openPrintDocument(
        html,
        `طباعة الطلب ${order.orderNumber}`,
        preview
      );

      if (!preview) {
        onClose();
      }
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      setPrinting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div
        className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl"
        dir="rtl"
      >
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">خيارات الطباعة</h2>
            <p className="mt-1 text-gray-500">
              الطلب #{order.orderNumber}
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

        {loading ? (
          <div className="rounded-xl bg-gray-50 p-8 text-center font-semibold">
            جاري تحميل إعدادات الطباعة...
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <h3 className="mb-3 font-bold">اختر المطلوب</h3>

              <div className="grid grid-cols-1 gap-3">
                <PrintOption
                  active={mode === "customer"}
                  title="فاتورة العميل"
                  description="الأسعار، الإجمالي، المدفوع والمتبقي."
                  onClick={() => setMode("customer")}
                />

                <PrintOption
                  active={mode === "production"}
                  title="ورقة الإنتاج"
                  description="المكونات والتغليف والملاحظات بدون أسعار."
                  onClick={() => setMode("production")}
                />

                <PrintOption
                  active={mode === "both"}
                  title="طباعة الاثنين معًا"
                  description="فاتورة العميل ثم ورقة الإنتاج في ورقتين منفصلتين."
                  onClick={() => setMode("both")}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label>
                <span className="mb-2 block font-semibold">عدد النسخ</span>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={copies}
                  onChange={(event) =>
                    setCopies(
                      Math.max(1, Number(event.target.value || 1))
                    )
                  }
                  className="w-full rounded-xl border p-3"
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between rounded-xl border p-4">
                <span className="font-semibold">
                  فتح المعاينة قبل الطباعة
                </span>

                <input
                  type="checkbox"
                  checked={preview}
                  onChange={(event) => setPreview(event.target.checked)}
                  className="h-5 w-5"
                />
              </label>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              كل ورقة تُطبع بمقاس A6 مستقل. خيار “الاثنين معًا” لا يحتاج قلب الورقة.
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border px-6 py-3"
              >
                إلغاء
              </button>

              <button
                type="button"
                onClick={handlePrint}
                disabled={printing || !settings}
                className="rounded-xl bg-emerald-700 px-7 py-3 font-bold text-white disabled:opacity-50"
              >
                {printing ? "جاري التجهيز..." : "فتح الطباعة"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PrintOption({
  active,
  title,
  description,
  onClick,
}: {
  active: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-4 text-right transition ${
        active
          ? "border-emerald-700 bg-emerald-50 ring-1 ring-emerald-700"
          : "hover:bg-gray-50"
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`h-5 w-5 rounded-full border ${
            active
              ? "border-emerald-700 bg-emerald-700 shadow-[inset_0_0_0_4px_white]"
              : "border-gray-400"
          }`}
        />

        <div>
          <p className="font-bold">{title}</p>
          <p className="mt-1 text-sm text-gray-500">{description}</p>
        </div>
      </div>
    </button>
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "حدث خطأ غير متوقع";
}