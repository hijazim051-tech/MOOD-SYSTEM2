import { useState } from "react";
import type { Product } from "../../data/products";

type Props = {
  onClose: () => void;
  onSave: (product: Product) => void;
};

export default function AddProductModal({ onClose, onSave }: Props) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("🌹");

  function save() {
    if (!name) return alert("اكتب اسم المنتج");

    onSave({
      id: Date.now(),
      name,
      icon,
      details: [],
    });

    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" dir="rtl">
      <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-2xl font-bold">إضافة منتج جديد</h2>
          <button onClick={onClose} className="text-2xl text-gray-500 hover:text-red-600">×</button>
        </div>

        <div className="space-y-4">
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl border p-3" placeholder="اسم المنتج" />
          <input value={icon} onChange={(e) => setIcon(e.target.value)} className="w-full rounded-xl border p-3" placeholder="الأيقونة مثال: 🌹" />
        </div>

        <div className="mt-6 flex gap-3">
          <button onClick={save} className="rounded-xl bg-emerald-700 px-8 py-3 font-semibold text-white">حفظ</button>
          <button onClick={onClose} className="rounded-xl bg-gray-100 px-8 py-3 font-semibold text-gray-700">إلغاء</button>
        </div>
      </div>
    </div>
  );
}