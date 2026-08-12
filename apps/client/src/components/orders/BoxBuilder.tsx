import { useMemo, useState } from "react";
import type { BoxVariant, OrderMaterial } from "../../lib/orderCatalog";
import {
  getMaterialCost,
  getMaterialDisplayName,
  isArtificialFlowerMaterial,
  isBoxMaterial,
} from "../../lib/orderCatalog";

export type BoxFlowerLine = {
  tempId: string;
  materialId: number;
  name: string;
  color: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
};

export type BoxAdditionLine = {
  tempId: string;
  materialId: number;
  name: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
};

export type BoxExternalPurchaseLine = {
  tempId: string;
  name: string;
  description: string;
  quantity: number;
  unitCost: number;
  unitPrice: number;
  supplierName: string;
  notes: string;
  paymentMethod: "cash" | "bank";
};

export type BoxDraft = {
  tempId: string;
  title: string;

  boxVariantId: string | null;
  boxType: string;
  boxSize: string;
  boxPrice: number;
  contentValue: number;

  boxProductDetailId: number | null;
  boxProductName: string;
  boxUnitCost: number;

  requiredFlowersCount: number;
  requiredAccessoriesCount: number;
  requiredWrappingCount: number;
  requiredRibbonCount: number;
  requiredCardCount: number;

  flowers: BoxFlowerLine[];
  additions: BoxAdditionLine[];
  externalPurchases: BoxExternalPurchaseLine[];
  templateComponents: [];

  wrappingMaterialId: number | null;
  wrappingMaterialName: string;
  wrappingQuantity: number;
  wrappingUnitPrice: number;
  wrappingUnitCost: number;

  ribbonMaterialId: number | null;
  ribbonMaterialName: string;
  ribbonQuantity: number;
  ribbonUnitPrice: number;
  ribbonUnitCost: number;

  cardMaterialId: number | null;
  cardMaterialName: string;
  cardQuantity: number;
  cardUnitPrice: number;
  cardUnitCost: number;

  notes: string;
};

type Props = {
  box: BoxDraft;
  boxVariants: BoxVariant[];
  materials: OrderMaterial[];
  onChange: (box: BoxDraft) => void;
  onRemove: () => void;
};

const inputClass =
  "w-full rounded-xl border border-gray-200 bg-white p-3 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";

export function createEmptyBox(): BoxDraft {
  return {
    tempId: crypto.randomUUID(),
    title: "بوكس",
    boxVariantId: null,
    boxType: "",
    boxSize: "",
    boxPrice: 0,
    contentValue: 0,
    boxProductDetailId: null,
    boxProductName: "",
    boxUnitCost: 0,
    requiredFlowersCount: 0,
    requiredAccessoriesCount: 0,
    requiredWrappingCount: 0,
    requiredRibbonCount: 0,
    requiredCardCount: 0,
    flowers: [],
    additions: [],
    externalPurchases: [],
    templateComponents: [],
    wrappingMaterialId: null,
    wrappingMaterialName: "",
    wrappingQuantity: 0,
    wrappingUnitPrice: 0,
    wrappingUnitCost: 0,
    ribbonMaterialId: null,
    ribbonMaterialName: "",
    ribbonQuantity: 0,
    ribbonUnitPrice: 0,
    ribbonUnitCost: 0,
    cardMaterialId: null,
    cardMaterialName: "",
    cardQuantity: 0,
    cardUnitPrice: 0,
    cardUnitCost: 0,
    notes: "",
  };
}

export default function BoxBuilder({
  box,
  materials,
  onChange,
  onRemove,
}: Props) {
  const [boxSearch, setBoxSearch] = useState("");
  const [showStockAdditions, setShowStockAdditions] = useState(false);
  const [additionSearch, setAdditionSearch] = useState("");
  const [additionMaterialId, setAdditionMaterialId] = useState("");
  const [additionQuantity, setAdditionQuantity] = useState("1");

  const [externalName, setExternalName] = useState("");
  const [externalDescription, setExternalDescription] = useState("");
  const [externalQuantity, setExternalQuantity] = useState("1");
  const [externalCost, setExternalCost] = useState("");
  const [externalPrice, setExternalPrice] = useState("");
  const [externalSupplier, setExternalSupplier] = useState("");
  const [externalNotes, setExternalNotes] = useState("");
  const [externalPaymentMethod, setExternalPaymentMethod] =
    useState<"cash" | "bank">("cash");

  const boxMaterials = useMemo(() => {
    const q = boxSearch.trim().toLowerCase();
    return materials
      .filter(isBoxMaterial)
      .filter((material) => {
        if (!q) return true;
        return getMaterialDisplayName(material).toLowerCase().includes(q);
      })
      .sort((a, b) =>
        getMaterialDisplayName(a).localeCompare(getMaterialDisplayName(b), "ar")
      );
  }, [materials, boxSearch]);

  const additionMaterials = useMemo(() => {
    const q = additionSearch.trim().toLowerCase();

    return materials
      .filter((material) => !isBoxMaterial(material))
      .filter((material) => !isArtificialFlowerMaterial(material))
      .filter((material) => Number(material.stock || 0) > 0)
      .filter((material) => {
        if (!q) return true;
        return [
          material.productName,
          material.name,
          material.categoryName,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) =>
        getMaterialDisplayName(a).localeCompare(getMaterialDisplayName(b), "ar")
      );
  }, [materials, additionSearch]);

  const additionsTotal = box.additions.reduce(
    (sum, item) =>
      sum + Number(item.unitPrice || 0) * Number(item.quantity || 0),
    0
  );

  const externalTotal = box.externalPurchases.reduce(
    (sum, item) =>
      sum + Number(item.unitPrice || 0) * Number(item.quantity || 0),
    0
  );

  const totalPrice =
    Number(box.boxPrice || 0) + additionsTotal + externalTotal;

  function chooseBox(value: string) {
    const material = materials.find((item) => String(item.id) === value);

    if (!material) {
      onChange({
        ...box,
        boxProductDetailId: null,
        boxProductName: "",
        boxUnitCost: 0,
        boxType: "",
        boxSize: "",
      });
      return;
    }

    onChange({
      ...box,
      boxVariantId: null,
      boxProductDetailId: material.id,
      boxProductName: getMaterialDisplayName(material),
      boxUnitCost: getMaterialCost(material),
      boxType: material.productName || material.name,
      boxSize: material.color || material.name,
      title: getMaterialDisplayName(material),
      // سعر البيع هنا سعر المنتج النهائي: البوكس + الورد الصناعي + التغليف بالتقدير.
      boxPrice: Number(material.sellPrice || box.boxPrice || 0),
      contentValue: 0,
      flowers: [],
      requiredFlowersCount: 0,
      requiredAccessoriesCount: 0,
      requiredWrappingCount: 0,
      requiredRibbonCount: 0,
      requiredCardCount: 0,
    });
  }

  function addStockAddition() {
    const material = materials.find(
      (item) => String(item.id) === additionMaterialId
    );
    const quantity = Number(additionQuantity || 0);

    if (!material) return alert("اختار الإضافة من المخزون");
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return alert("اكتب كمية صحيحة");
    }

    const existing = box.additions.find(
      (item) => item.materialId === material.id
    );

    const nextQty = Number(existing?.quantity || 0) + quantity;
    if (nextQty > Number(material.stock || 0)) {
      return alert(
        `المتوفر من ${getMaterialDisplayName(material)} هو ${material.stock}`
      );
    }

    if (existing) {
      onChange({
        ...box,
        additions: box.additions.map((item) =>
          item.materialId === material.id
            ? { ...item, quantity: nextQty }
            : item
        ),
      });
    } else {
      onChange({
        ...box,
        additions: [
          ...box.additions,
          {
            tempId: crypto.randomUUID(),
            materialId: material.id,
            name: getMaterialDisplayName(material),
            quantity,
            unitPrice: Number(material.sellPrice || 0),
            unitCost: getMaterialCost(material),
          },
        ],
      });
    }

    setAdditionMaterialId("");
    setAdditionQuantity("1");
  }

  function addExternalPurchase() {
    const quantity = Number(externalQuantity || 0);
    const unitCost = Number(externalCost || 0);
    const unitPrice = Number(externalPrice || 0);

    if (!externalName.trim()) return alert("اكتب اسم المنتج الخارجي");
    if (!Number.isFinite(quantity) || quantity <= 0) return alert("اكتب الكمية");
    if (!Number.isFinite(unitCost) || unitCost < 0) return alert("تكلفة الشراء غير صحيحة");
    if (!Number.isFinite(unitPrice) || unitPrice < 0) return alert("سعر البيع غير صحيح");

    onChange({
      ...box,
      externalPurchases: [
        ...box.externalPurchases,
        {
          tempId: crypto.randomUUID(),
          name: externalName.trim(),
          description: externalDescription.trim(),
          quantity,
          unitCost,
          unitPrice,
          supplierName: externalSupplier.trim(),
          notes: externalNotes.trim(),
          paymentMethod: externalPaymentMethod,
        },
      ],
    });

    setExternalName("");
    setExternalDescription("");
    setExternalQuantity("1");
    setExternalCost("");
    setExternalPrice("");
    setExternalSupplier("");
    setExternalNotes("");
    setExternalPaymentMethod("cash");
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black">🎁 بوكس</h2>
          <p className="mt-1 text-gray-500">
            اختار البوكس من المخزون وحدد سعر البيع النهائي شامل الورد الصناعي والتغليف بالتقدير.
          </p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="rounded-xl bg-red-100 px-4 py-2 font-bold text-red-700"
        >
          حذف
        </button>
      </div>

      <section className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
        <h3 className="text-lg font-black text-emerald-900">
          1. اختار البوكس
        </h3>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <input
            value={boxSearch}
            onChange={(event) => setBoxSearch(event.target.value)}
            className={inputClass}
            placeholder="🔎 ابحث باسم البوكس..."
          />

          <select
            value={box.boxProductDetailId || ""}
            onChange={(event) => chooseBox(event.target.value)}
            className={inputClass}
          >
            <option value="">اختار البوكس من المخزون</option>
            {boxMaterials.map((material) => (
              <option key={material.id} value={material.id}>
                {getMaterialDisplayName(material)} — متوفر {material.stock}
              </option>
            ))}
          </select>
        </div>

        {box.boxProductDetailId && (
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <Info label="سعر شراء البوكس" value={`${box.boxUnitCost.toFixed(2)} د.ل`} />
            <Info
              label="المخزون"
              value={`${Number(
                materials.find((item) => item.id === box.boxProductDetailId)?.stock || 0
              )}`}
            />
            <label>
              <span className="mb-2 block font-black">
                سعر البيع النهائي للبوكس *
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={box.boxPrice || ""}
                onChange={(event) =>
                  onChange({
                    ...box,
                    boxPrice: Number(event.target.value || 0),
                  })
                }
                className={inputClass}
                placeholder="يشمل البوكس + الورد + التغليف"
              />
              <span className="mt-1 block text-xs text-gray-500">
                هذا السعر تقديري شامل الورد الصناعي والتغليف.
              </span>
            </label>
          </div>
        )}
      </section>

      <section className="rounded-2xl border p-5">
        <button
          type="button"
          onClick={() => setShowStockAdditions((value) => !value)}
          className="flex w-full items-center justify-between rounded-xl bg-gray-50 px-4 py-3 font-black"
        >
          <span>➕ إضافة منتج من المخزون</span>
          <span>{showStockAdditions ? "▲" : "🔎 بحث ▼"}</span>
        </button>

        {showStockAdditions && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_140px_auto]">
              <input
                value={additionSearch}
                onChange={(event) => setAdditionSearch(event.target.value)}
                className={inputClass}
                placeholder="ابحث عن الإضافة..."
              />
              <select
                value={additionMaterialId}
                onChange={(event) => setAdditionMaterialId(event.target.value)}
                className={inputClass}
              >
                <option value="">اختار من نتائج البحث</option>
                {additionMaterials.map((material) => (
                  <option key={material.id} value={material.id}>
                    {getMaterialDisplayName(material)} — {material.stock}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="1"
                value={additionQuantity}
                onChange={(event) => setAdditionQuantity(event.target.value)}
                className={inputClass}
                placeholder="الكمية"
              />
              <button
                type="button"
                onClick={addStockAddition}
                className="rounded-xl bg-gray-900 px-5 py-3 font-bold text-white"
              >
                إضافة
              </button>
            </div>

            {box.additions.map((item) => (
              <div
                key={item.tempId}
                className="flex items-center justify-between rounded-xl bg-gray-50 p-3"
              >
                <span>
                  {item.name} × {item.quantity} —{" "}
                  {(item.unitPrice * item.quantity).toFixed(2)} د.ل
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      ...box,
                      additions: box.additions.filter(
                        (line) => line.tempId !== item.tempId
                      ),
                    })
                  }
                  className="rounded-lg bg-red-100 px-3 py-1 text-red-700"
                >
                  حذف
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border p-5">
        <h3 className="text-lg font-black">شراء منتج خارجي لهذا الطلب</h3>
        <p className="mt-1 text-sm text-gray-500">
          لو اشتريت هدية أو منتج للطلب من خارج المخزون، سجل طريقة الدفع ليخصم من الرصيد الحالي.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input value={externalName} onChange={(e)=>setExternalName(e.target.value)} className={inputClass} placeholder="اسم المنتج"/>
          <input value={externalDescription} onChange={(e)=>setExternalDescription(e.target.value)} className={inputClass} placeholder="الوصف"/>
          <input type="number" min="1" value={externalQuantity} onChange={(e)=>setExternalQuantity(e.target.value)} className={inputClass} placeholder="الكمية"/>
          <input type="number" min="0" step="0.01" value={externalCost} onChange={(e)=>setExternalCost(e.target.value)} className={inputClass} placeholder="تكلفة الشراء"/>
          <input type="number" min="0" step="0.01" value={externalPrice} onChange={(e)=>setExternalPrice(e.target.value)} className={inputClass} placeholder="سعر البيع"/>
          <select
            value={externalPaymentMethod}
            onChange={(e)=>setExternalPaymentMethod(e.target.value as "cash"|"bank")}
            className={inputClass}
          >
            <option value="cash">تم الشراء — كاش</option>
            <option value="bank">تم الشراء — مصرف</option>
          </select>
          <input value={externalSupplier} onChange={(e)=>setExternalSupplier(e.target.value)} className={inputClass} placeholder="المورد/الجهة"/>
          <input value={externalNotes} onChange={(e)=>setExternalNotes(e.target.value)} className={inputClass} placeholder="ملاحظات"/>
        </div>

        <button
          type="button"
          onClick={addExternalPurchase}
          className="mt-4 rounded-xl bg-gray-900 px-6 py-3 font-bold text-white"
        >
          + إضافة المنتج الخارجي
        </button>

        <div className="mt-4 space-y-2">
          {box.externalPurchases.map((purchase) => (
            <div key={purchase.tempId} className="rounded-xl bg-gray-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-black">
                    {purchase.name} × {purchase.quantity}
                  </p>
                  <p className="mt-1 text-sm text-gray-500">
                    شراء {purchase.unitCost.toFixed(2)} — بيع {purchase.unitPrice.toFixed(2)} —
                    {purchase.paymentMethod === "bank" ? " مصرف" : " كاش"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      ...box,
                      externalPurchases: box.externalPurchases.filter(
                        (item) => item.tempId !== purchase.tempId
                      ),
                    })
                  }
                  className="rounded-lg bg-red-100 px-3 py-2 text-red-700"
                >
                  حذف
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <textarea
        value={box.notes}
        onChange={(event) => onChange({ ...box, notes: event.target.value })}
        className={inputClass}
        rows={3}
        placeholder="ملاحظات البوكس"
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Info label="تكلفة البوكس" value={`${box.boxUnitCost.toFixed(2)} د.ل`} />
        <Info label="سعر البوكس النهائي" value={`${Number(box.boxPrice || 0).toFixed(2)} د.ل`} />
        <Info label="إضافات أخرى" value={`${(additionsTotal + externalTotal).toFixed(2)} د.ل`} />
        <Info label="الإجمالي" value={`${totalPrice.toFixed(2)} د.ل`} strong />
      </div>
    </div>
  );
}

function Info({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className={`rounded-xl p-4 ${strong ? "bg-emerald-100" : "bg-gray-50"}`}>
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`mt-1 ${strong ? "text-xl font-black text-emerald-800" : "font-black"}`}>
        {value}
      </p>
    </div>
  );
}
