import { useEffect, useMemo, useState } from "react";

import type {
  BouquetSize,
  OrderMaterial,
} from "../../lib/orderCatalog";

import {
  getMaterialCost,
  getMaterialDisplayName,
  isFlowerMaterial,
  isWrappingMaterial,
} from "../../lib/orderCatalog";

export type BouquetFlowerLine = {
  tempId: string;
  materialId: number;
  name: string;
  color: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
};

export type BouquetWrappingOptionLine = {
  tempId: string;
  materialId: number;
  name: string;
  stock: number;
  unitCost: number;
  unitPrice: number;
};

export type BouquetAdditionLine = {
  tempId: string;
  materialId: number;
  name: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
};

export type ExternalPurchaseLine = {
  tempId: string;
  name: string;
  quantity: number;
  unitCost: number;
  unitPrice: number;
  paymentMethod: "cash" | "bank";
};

export type BouquetDraft = {
  wrappingMode?: "" | "with" | "without";
  tempId: string;
  title: string;
  bouquetSizeId: string | null;
  bouquetSizeName: string;
  bouquetSizePrice: number;
  flowers: BouquetFlowerLine[];
  wrappingOptions: BouquetWrappingOptionLine[];
  externalPurchases: ExternalPurchaseLine[];
  notes: string;

  // حقول قديمة مؤقتة لضمان توافق الطلبات القديمة أثناء مرحلة التحديث.
  additions: BouquetAdditionLine[];
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
  baseMaterialId: number | null;
  baseMaterialName: string;
  baseQuantity: number;
  baseUnitPrice: number;
  baseUnitCost: number;
};

type Props = {
  bouquet: BouquetDraft;
  bouquetSizes: BouquetSize[];
  materials: OrderMaterial[];
  onChange: (bouquet: BouquetDraft) => void;
  onRemove: () => void;
};

export function createEmptyBouquet(): BouquetDraft {
  return {
    tempId: crypto.randomUUID(),
    title: "باقة ورد",
    bouquetSizeId: null,
    bouquetSizeName: "",
    bouquetSizePrice: 0,
    flowers: [],
    wrappingMode: "",
    wrappingOptions: [],
    externalPurchases: [],
    notes: "",

    additions: [],
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
    baseMaterialId: null,
    baseMaterialName: "",
    baseQuantity: 0,
    baseUnitPrice: 0,
    baseUnitCost: 0,
  };
}

export default function BouquetBuilder({
  bouquet,
  bouquetSizes,
  materials,
  onChange,
  onRemove,
}: Props) {
  const [flowerProductName, setFlowerProductName] = useState("");
  const [flowerMaterialId, setFlowerMaterialId] = useState("");
  const [flowerQuantity, setFlowerQuantity] = useState("");
  const [externalName, setExternalName] = useState("");
  const [externalQuantity, setExternalQuantity] = useState("");
  const [externalCost, setExternalCost] = useState("");
  const [externalPrice, setExternalPrice] = useState("");
  const [externalPaymentMethod, setExternalPaymentMethod] =
    useState<"cash" | "bank">("cash");

  const flowerMaterials = useMemo(
    () => materials.filter(isFlowerMaterial),
    [materials]
  );

  const flowerTypes = useMemo(
    () =>
      Array.from(
        new Set(
          flowerMaterials
            .map((material) => material.productName || material.name)
            .filter(Boolean)
        )
      ),
    [flowerMaterials]
  );

  const flowerColors = useMemo(
    () =>
      flowerMaterials.filter(
        (material) =>
          (material.productName || material.name) === flowerProductName
      ),
    [flowerMaterials, flowerProductName]
  );

  const wrappingMaterials = useMemo(
    () =>
      materials
        .filter(isWrappingMaterial)
        .filter((material) => Number(material.stock || 0) > 0)
        .sort((a, b) =>
          getMaterialDisplayName(a).localeCompare(
            getMaterialDisplayName(b),
            "ar"
          )
        ),
    [materials]
  );

  const totalFlowers = useMemo(
    () =>
      bouquet.flowers.reduce(
        (total, flower) => total + Number(flower.quantity || 0),
        0
      ),
    [bouquet.flowers]
  );

  const autoSize = useMemo(() => {
    if (totalFlowers <= 0) return null;

    return (
      bouquetSizes.find((size) => {
        const min = Number(size.minFlowers || 0);
        const max =
          size.maxFlowers === null
            ? null
            : Number(size.maxFlowers);

        if (totalFlowers < min) return false;
        if (max === null) return true;

        return totalFlowers <= max;
      }) || null
    );
  }, [bouquetSizes, totalFlowers]);

  useEffect(() => {
    if (!autoSize) {
      if (
        totalFlowers === 0 &&
        (
          bouquet.bouquetSizeId !== null ||
          bouquet.bouquetSizeName !== "" ||
          bouquet.bouquetSizePrice !== 0
        )
      ) {
        onChange({
          ...bouquet,
          bouquetSizeId: null,
          bouquetSizeName: "",
          bouquetSizePrice: 0,
          wrappingQuantity: 0,
          ribbonQuantity: 0,
          cardQuantity: 0,
          baseQuantity: 0,
        });
      }
      return;
    }

    if (
      bouquet.bouquetSizeId === autoSize.id &&
      bouquet.bouquetSizeName === autoSize.name &&
      Number(bouquet.bouquetSizePrice || 0) === Number(autoSize.price || 0) &&
      Number(bouquet.wrappingQuantity || 0) ===
        Number(autoSize.wrappingCount || 0)
    ) {
      return;
    }

    onChange({
      ...bouquet,
      bouquetSizeId: autoSize.id,
      bouquetSizeName: autoSize.name,
      bouquetSizePrice: Number(autoSize.price || 0),
      wrappingQuantity: Number(autoSize.wrappingCount || 0),

      // العناصر المحذوفة تبقى صفرًا.
      ribbonQuantity: 0,
      cardQuantity: 0,
      baseQuantity: 0,
    });
  }, [autoSize, totalFlowers, bouquet, onChange]);

  const totalPrice = useMemo(() => {
    const flowersTotal = bouquet.flowers.reduce(
      (total, line) =>
        total + Number(line.unitPrice || 0) * Number(line.quantity || 0),
      0
    );

    const externalTotal = bouquet.externalPurchases.reduce(
      (total, line) =>
        total + Number(line.unitPrice || 0) * Number(line.quantity || 0),
      0
    );

    return (
      Number(bouquet.bouquetSizePrice || 0) +
      flowersTotal +
      externalTotal
    );
  }, [bouquet]);

  function addFlower() {
    const material = flowerMaterials.find(
      (entry) => String(entry.id) === flowerMaterialId
    );
    const quantity = Number(flowerQuantity);

    if (!flowerProductName) return alert("اختار نوع الورد");
    if (!material) return alert("اختار لون الورد");
    if (!quantity || quantity <= 0) return alert("اكتب عدد الورد");

    const existing = bouquet.flowers.find(
      (line) => line.materialId === material.id
    );
    const currentQuantity = existing?.quantity || 0;

    if (currentQuantity + quantity > material.stock) {
      return alert(
        `المتوفر من ${getMaterialDisplayName(material)} هو ${material.stock} فقط`
      );
    }

    onChange({
      ...bouquet,
      flowers: existing
        ? bouquet.flowers.map((line) =>
            line.tempId === existing.tempId
              ? { ...line, quantity: line.quantity + quantity }
              : line
          )
        : [
            ...bouquet.flowers,
            {
              tempId: crypto.randomUUID(),
              materialId: material.id,
              name: material.productName || material.name,
              color: material.color || material.name,
              quantity,
              unitPrice: material.sellPrice,
              unitCost: getMaterialCost(material),
            },
          ],
    });

    setFlowerProductName("");
    setFlowerMaterialId("");
    setFlowerQuantity("");
  }

  function toggleWrappingOption(material: OrderMaterial) {
    const exists = bouquet.wrappingOptions.some(
      (option) => option.materialId === material.id
    );

    onChange({
      ...bouquet,
      wrappingOptions: exists
        ? bouquet.wrappingOptions.filter(
            (option) => option.materialId !== material.id
          )
        : [
            ...bouquet.wrappingOptions,
            {
              tempId: crypto.randomUUID(),
              materialId: material.id,
              name: getMaterialDisplayName(material),
              stock: Number(material.stock || 0),
              unitCost: getMaterialCost(material),
              unitPrice: Number(material.sellPrice || 0),
            },
          ],
    });
  }

  function addExternalPurchase() {
    const quantity = Number(externalQuantity);

    if (!externalName.trim()) return alert("اكتب اسم المحتوى الخارجي");
    if (!quantity || quantity <= 0) return alert("اكتب الكمية");

    onChange({
      ...bouquet,
      externalPurchases: [
        ...bouquet.externalPurchases,
        {
          tempId: crypto.randomUUID(),
          name: externalName.trim(),
          quantity,
          unitCost: Number(externalCost || 0),
          unitPrice: Number(externalPrice || 0),
          paymentMethod: externalPaymentMethod,
        },
      ],
    });

    setExternalName("");
    setExternalQuantity("");
    setExternalCost("");
    setExternalPrice("");
    setExternalPaymentMethod("cash");
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow" dir="rtl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">🌹 باقة ورد</h2>
          <p className="mt-1 text-gray-500">
            إجمالي عدد الورد: {totalFlowers}
          </p>
        </div>

        <button
          type="button"
          onClick={onRemove}
          className="rounded-xl bg-red-100 px-4 py-2 font-semibold text-red-700"
        >
          حذف الباقة
        </button>
      </div>

      <section className="mb-6 rounded-2xl border p-5">
        <h3 className="mb-4 text-xl font-bold">أنواع الورد</h3>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <select
            value={flowerProductName}
            onChange={(event) => {
              setFlowerProductName(event.target.value);
              setFlowerMaterialId("");
            }}
            className="rounded-xl border p-3"
          >
            <option value="">نوع الورد</option>
            {flowerTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>

          <select
            value={flowerMaterialId}
            onChange={(event) =>
              setFlowerMaterialId(event.target.value)
            }
            disabled={!flowerProductName}
            className="rounded-xl border p-3 disabled:bg-gray-100"
          >
            <option value="">اللون</option>
            {flowerColors.map((material) => (
              <option key={material.id} value={material.id}>
                {material.color || material.name}
              </option>
            ))}
          </select>

          <input
            type="number"
            min="1"
            value={flowerQuantity}
            onChange={(event) =>
              setFlowerQuantity(event.target.value)
            }
            className="rounded-xl border p-3"
            placeholder="العدد"
          />

          <button
            type="button"
            onClick={addFlower}
            className="rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white"
          >
            ➕ إضافة
          </button>
        </div>

        {bouquet.flowers.length > 0 && (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[650px]">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-3 text-right">النوع</th>
                  <th className="p-3 text-right">اللون</th>
                  <th className="p-3 text-right">العدد</th>
                  <th className="p-3 text-right">سعر الوحدة</th>
                  <th className="p-3 text-right">الإجمالي</th>
                  <th className="p-3 text-right">حذف</th>
                </tr>
              </thead>
              <tbody>
                {bouquet.flowers.map((flower) => (
                  <tr key={flower.tempId} className="border-b">
                    <td className="p-3 font-semibold">{flower.name}</td>
                    <td className="p-3">{flower.color || "-"}</td>
                    <td className="p-3">{flower.quantity}</td>
                    <td className="p-3">
                      {Number(flower.unitPrice || 0).toFixed(2)}
                    </td>
                    <td className="p-3 font-semibold">
                      {(
                        Number(flower.unitPrice || 0) *
                        Number(flower.quantity || 0)
                      ).toFixed(2)}
                    </td>
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() =>
                          onChange({
                            ...bouquet,
                            flowers: bouquet.flowers.filter(
                              (line) => line.tempId !== flower.tempId
                            ),
                          })
                        }
                        className="rounded-lg bg-red-100 px-3 py-2 text-red-700"
                      >
                        حذف
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mb-6 rounded-2xl border p-5">
        <h3 className="mb-4 text-xl font-bold">حجم الباقة</h3>

        {autoSize ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
            <p className="text-sm font-semibold text-emerald-700">
              تم تحديد الحجم تلقائيًا حسب عدد الورد
            </p>
            <p className="mt-2 text-3xl font-bold text-emerald-800">
              {autoSize.name}
            </p>
            <p className="mt-3">
              العدد: <strong>{totalFlowers}</strong> — سعر الحجم:{" "}
              <strong>{Number(autoSize.price || 0).toFixed(2)} د.ل</strong>
            </p>
            <p className="mt-2 text-sm text-gray-600">
              عدد أوراق الغلاف المقترح لهذا الحجم:{" "}
              <strong>{autoSize.wrappingCount}</strong>
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center text-amber-800">
            {totalFlowers === 0
              ? "أضف الورد أولًا ليتم تحديد حجم الباقة تلقائيًا."
              : "لا يوجد حجم مطابق لهذا العدد. راجع إعدادات أحجام الباقات."}
          </div>
        )}
      </section>

      <section className="mb-6 rounded-2xl border p-5">
        <div className="mb-5">
          <h3 className="text-xl font-bold">هل الباقة بغلاف؟ *</h3>
          <p className="mt-1 text-sm text-gray-500">هذا الاختيار إجباري قبل اختيار لون الغلاف.</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button type="button" onClick={() => onChange({ ...bouquet, wrappingMode: "with" })} className={`rounded-xl border-2 p-4 font-bold ${bouquet.wrappingMode === "with" ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-gray-200"}`}>بغلاف</button>
            <button type="button" onClick={() => onChange({ ...bouquet, wrappingMode: "without", wrappingOptions: [] })} className={`rounded-xl border-2 p-4 font-bold ${bouquet.wrappingMode === "without" ? "border-blue-600 bg-blue-50 text-blue-800" : "border-gray-200"}`}>بدون غلاف</button>
          </div>
        </div>

        {bouquet.wrappingMode === "with" && <>
        <div className="mb-4">
          <h3 className="text-xl font-bold">ألوان الغلاف</h3>
          <p className="mt-1 text-sm text-gray-500">
            اختار لونًا واحدًا أو أكثر فقط. موظف التغليف سيكتب عدد الأوراق
            المستخدمة فعليًا من كل لون.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {wrappingMaterials.map((material) => {
            const selected = bouquet.wrappingOptions.some(
              (option) => option.materialId === material.id
            );

            return (
              <button
                key={material.id}
                type="button"
                onClick={() => toggleWrappingOption(material)}
                className={`rounded-xl border-2 p-4 text-right transition ${
                  selected
                    ? "border-emerald-600 bg-emerald-50"
                    : "border-gray-200 bg-white"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-bold">
                    {material.color || getMaterialDisplayName(material)}
                  </span>
                  <span>{selected ? "✓" : ""}</span>
                </div>
                <p className="mt-2 text-sm text-gray-500">
                  المتوفر: {material.stock}
                </p>
              </button>
            );
          })}
        </div>

        {wrappingMaterials.length === 0 && (
          <div className="rounded-xl bg-gray-50 p-5 text-center text-gray-500">
            لا توجد ألوان غلاف متوفرة في المخزون.
          </div>
        )}

        {bouquet.wrappingOptions.length === 0 && (
          <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-700">اختر لون غلاف واحدًا على الأقل.</p>
        )}
        </>}
        {!bouquet.wrappingMode && <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">يجب اختيار «بغلاف» أو «بدون غلاف».</p>}
        {bouquet.wrappingMode === "without" && <p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-700">سيتم حفظ الباقة بدون غلاف.</p>}
      </section>

      <section className="mb-6 rounded-2xl border p-5">
        <h3 className="mb-4 text-xl font-bold">محتوى خارجي (اختياري)</h3>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <input
            value={externalName}
            onChange={(event) => setExternalName(event.target.value)}
            className="rounded-xl border p-3"
            placeholder="اسم المحتوى"
          />
          <input
            type="number"
            min="1"
            value={externalQuantity}
            onChange={(event) => setExternalQuantity(event.target.value)}
            className="rounded-xl border p-3"
            placeholder="الكمية"
          />
          <input
            type="number"
            min="0"
            step="0.01"
            value={externalCost}
            onChange={(event) => setExternalCost(event.target.value)}
            className="rounded-xl border p-3"
            placeholder="التكلفة"
          />
          <input
            type="number"
            min="0"
            step="0.01"
            value={externalPrice}
            onChange={(event) => setExternalPrice(event.target.value)}
            className="rounded-xl border p-3"
            placeholder="سعر البيع"
          />
          <select
            value={externalPaymentMethod}
            onChange={(event) =>
              setExternalPaymentMethod(event.target.value as "cash" | "bank")
            }
            className="rounded-xl border p-3"
          >
            <option value="cash">تم الشراء — كاش</option>
            <option value="bank">تم الشراء — مصرف</option>
          </select>
        </div>

        <button
          type="button"
          onClick={addExternalPurchase}
          className="mt-4 w-full rounded-xl bg-gray-800 py-3 font-bold text-white"
        >
          ➕ إضافة محتوى خارجي
        </button>

        <div className="mt-4 space-y-2">
          {bouquet.externalPurchases.map((item) => (
            <div
              key={item.tempId}
              className="flex items-center justify-between rounded-xl bg-gray-50 p-3"
            >
              <span>
                {item.name} × {item.quantity} —{" "}
                {(item.unitPrice * item.quantity).toFixed(2)} د.ل — {item.paymentMethod === "bank" ? "مصرف" : "كاش"}
              </span>
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...bouquet,
                    externalPurchases: bouquet.externalPurchases.filter(
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
      </section>

      <textarea
        value={bouquet.notes}
        onChange={(event) =>
          onChange({ ...bouquet, notes: event.target.value })
        }
        className="w-full rounded-xl border p-3"
        rows={3}
        placeholder="ملاحظات الباقة"
      />

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Summary label="إجمالي الورد" value={totalFlowers} />
        <Summary
          label="ألوان الغلاف"
          value={
            bouquet.wrappingOptions.length > 0
              ? bouquet.wrappingOptions.length
              : "بدون غلاف"
          }
        />
        <Summary
          label="سعر الباقة الحالي"
          value={`${totalPrice.toFixed(2)} د.ل`}
          highlighted
        />
      </div>
    </div>
  );
}

function Summary({
  label,
  value,
  highlighted = false,
}: {
  label: string;
  value: string | number;
  highlighted?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl p-5 text-center ${
        highlighted ? "bg-emerald-50" : "bg-gray-50"
      }`}
    >
      <p className="text-sm text-gray-500">{label}</p>
      <p
        className={`mt-2 text-2xl font-bold ${
          highlighted ? "text-emerald-700" : "text-gray-800"
        }`}
      >
        {value}
      </p>
    </div>
  );
}