import { useState } from "react";
import type { ProductDetail } from "../../data/products";

type Props = {
  detail: ProductDetail;
  onClose: () => void;
  onSave: (detail: ProductDetail) => void;
};

export default function EditColorModal({ detail, onClose, onSave }: Props) {
  const [name, setName] = useState(detail.name);
  const [buyPrice, setBuyPrice] = useState(String(detail.buyPrice));
  const [sellPrice, setSellPrice] = useState(String(detail.sellPrice));
  const [stock, setStock] = useState(String(detail.stock));
  const [alertLimit, setAlertLimit] = useState(String(detail.alertLimit));
  const [isImportant, setIsImportant] = useState(detail.isImportant);

  function save() {
    if (!name || !buyPrice || !sellPrice || !stock) {
      alert("عبّي البيانات المطلوبة");
      return;
    }

    onSave({
      ...detail,
      name,
      buyPrice: Number(buyPrice),
      sellPrice: Number(sellPrice),
      stock: Number(stock),
      alertLimit: Number(alertLimit || 0),
      isImportant,
    });

    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" dir="rtl">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-2xl font-bold">تعديل اللون / النوع</h2>
          <button onClick={onClose} className="text-2xl text-gray-500 hover:text-red-600">×</button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <input value={name} onChange={(e) => setName(e.target.value)} className="rounded-xl border p-3" placeholder="اللون / النوع" />
          <input value={buyPrice} onChange={(e) => setBuyPrice(e.target.value)} className="rounded-xl border p-3" placeholder="سعر الشراء" />
          <input value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} className="rounded-xl border p-3" placeholder="سعر البيع" />
          <input value={stock} onChange={(e) => setStock(e.target.value)} className="rounded-xl border p-3" placeholder="الكمية" />
          <input value={alertLimit} onChange={(e) => setAlertLimit(e.target.value)} className="rounded-xl border p-3" placeholder="حد التنبيه" />

          <label className="flex items-center gap-3 rounded-xl border p-3">
            <input type="checkbox" checked={isImportant} onChange={(e) => setIsImportant(e.target.checked)} />
            منتج مهم ويحتاج تنبيه
          </label>
        </div>

        <div className="mt-6 flex gap-3">
          <button onClick={save} className="rounded-xl bg-emerald-700 px-8 py-3 font-semibold text-white">حفظ</button>
          <button onClick={onClose} className="rounded-xl bg-gray-100 px-8 py-3 font-semibold text-gray-700">إلغاء</button>
        </div>
      </div>
    </div>
  );
}