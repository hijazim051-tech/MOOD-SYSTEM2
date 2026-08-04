import { useState } from "react";
import type { ProductDetail } from "../../data/products";

type Props = {
  onClose: () => void;
  onSave: (detail: ProductDetail) => void;
};

export default function AddColorModal({ onClose, onSave }: Props) {
  const [name, setName] = useState("");
  const [buyPrice, setBuyPrice] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [stock, setStock] = useState("");
  const [alertLimit, setAlertLimit] = useState("");
  const [isImportant, setIsImportant] = useState(true);

  function save() {
    if (!name || !buyPrice || !sellPrice || !stock) {
      alert("عبّي اللون وسعر الشراء وسعر البيع والكمية");
      return;
    }

    onSave({
      id: Date.now(),
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
          <h2 className="text-2xl font-bold">إضافة لون / نوع</h2>
          <button onClick={onClose} className="text-2xl text-gray-500 hover:text-red-600">×</button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <input value={name} onChange={(e) => setName(e.target.value)} className="rounded-xl border p-3" placeholder="اللون / النوع" />
          <input value={buyPrice} onChange={(e) => setBuyPrice(e.target.value)} className="rounded-xl border p-3" placeholder="سعر الشراء" />
          <input value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} className="rounded-xl border p-3" placeholder="سعر البيع" />
          <input value={stock} onChange={(e) => setStock(e.target.value)} className="rounded-xl border p-3" placeholder="الكمية" />
          <input value={alertLimit} onChange={(e) => setAlertLimit(e.target.value)} className="rounded-xl border p-3" placeholder="حد التنبيه" />

          <label className="flex items-center gap-3 rounded-xl border p-3">
            <input
              type="checkbox"
              checked={isImportant}
              onChange={(e) => setIsImportant(e.target.checked)}
            />
            منتج مهم ويحتاج تنبيه
          </label>
        </div>

        <div className="mt-6 flex gap-3">
          <button onClick={save} className="rounded-xl bg-emerald-700 px-8 py-3 font-semibold text-white hover:bg-emerald-800">
            حفظ
          </button>
          <button onClick={onClose} className="rounded-xl bg-gray-100 px-8 py-3 font-semibold text-gray-700 hover:bg-gray-200">
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}