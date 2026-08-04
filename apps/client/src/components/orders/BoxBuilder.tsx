import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { BoxVariant, OrderMaterial } from "../../lib/orderCatalog";
import {
  getMaterialCost,
  getMaterialDisplayName,
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

type BoxTemplate = {
  id: string;
  name: string;
  size: string;
  sellPrice: number;
  contentValue: number;
  productDetailId: number | null;
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
  const [templates, setTemplates] = useState<BoxTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);

  const [additionMaterialId, setAdditionMaterialId] = useState("");
  const [additionQuantity, setAdditionQuantity] = useState("");

  const [externalName, setExternalName] = useState("");
  const [externalDescription, setExternalDescription] = useState("");
  const [externalQuantity, setExternalQuantity] = useState("1");
  const [externalCost, setExternalCost] = useState("");
  const [externalPrice, setExternalPrice] = useState("");
  const [externalSupplier, setExternalSupplier] = useState("");
  const [externalNotes, setExternalNotes] = useState("");

  useEffect(() => {
    void loadTemplates();
  }, []);

  async function loadTemplates() {
    setLoadingTemplates(true);

    try {
      const { data, error } = await supabase
        .from("order_item_templates")
        .select(`
          id,
          name,
          size,
          sell_price,
          content_value,
          box_detail_id,
          product_detail_id
        `)
        .eq("item_type", "box")
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setTemplates(
        (data || []).map((row: any) => ({
          id: String(row.id),
          name: String(row.name || "بوكس"),
          size: String(row.size || ""),
          sellPrice: Number(row.sell_price || 0),
          contentValue: Number(row.content_value || 0),
          productDetailId:
            row.box_detail_id == null
              ? row.product_detail_id == null
                ? null
                : Number(row.product_detail_id)
              : Number(row.box_detail_id),
        }))
      );
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      setLoadingTemplates(false);
    }
  }

  const additionMaterials = useMemo(
    () =>
      materials.filter((material) => {
        if (material.id === box.boxProductDetailId) return false;
        if (Number(material.stock || 0) <= 0) return false;

        const text = [
          material.materialType,
          material.categoryName,
          material.productName,
          material.name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return !(
          text.includes("artificial_flower") ||
          text.includes("artificial_accessory") ||
          text.includes("ورد صناعي") ||
          text.includes("اكسسوار صناعي")
        );
      }),
    [materials, box.boxProductDetailId]
  );

  const additionsTotal = useMemo(
    () =>
      box.additions.reduce(
        (total, item) =>
          total +
          Number(item.unitPrice || 0) * Number(item.quantity || 0),
        0
      ),
    [box.additions]
  );

  const externalTotal = useMemo(
    () =>
      box.externalPurchases.reduce(
        (total, item) =>
          total +
          Number(item.unitPrice || 0) * Number(item.quantity || 0),
        0
      ),
    [box.externalPurchases]
  );

  const totalPrice =
    Number(box.boxPrice || 0) + additionsTotal + externalTotal;

  function selectTemplate(templateId: string) {
    const template = templates.find((entry) => entry.id === templateId);

    if (!template) {
      onChange({
        ...createEmptyBox(),
        tempId: box.tempId,
        notes: box.notes,
      });
      return;
    }

    const boxMaterial = materials.find(
      (material) => material.id === template.productDetailId
    );

    if (boxMaterial && Number(boxMaterial.stock || 0) < 1) {
      alert(`البوكس غير متوفر: ${getMaterialDisplayName(boxMaterial)}`);
      return;
    }

    onChange({
      ...box,
      boxVariantId: template.id,
      title: template.name,
      boxType: template.name,
      boxSize: template.size,
      boxPrice: template.sellPrice,
      contentValue: template.contentValue,
      boxProductDetailId: template.productDetailId,
      boxProductName: boxMaterial
        ? getMaterialDisplayName(boxMaterial)
        : template.name,
      boxUnitCost: boxMaterial ? getMaterialCost(boxMaterial) : 0,
      flowers: [],
      templateComponents: [],
      requiredFlowersCount: 0,
      requiredAccessoriesCount: 0,
      requiredWrappingCount: 0,
      requiredRibbonCount: 0,
      requiredCardCount: 0,
    });
  }

  function addAddition() {
    const material = additionMaterials.find(
      (item) => String(item.id) === additionMaterialId
    );
    const quantity = Number(additionQuantity);

    if (!material) {
      alert("اختار الإضافة");
      return;
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      alert("اكتب كمية صحيحة");
      return;
    }

    const existing = box.additions.find(
      (item) => item.materialId === material.id
    );
    const currentQuantity = existing?.quantity || 0;

    if (currentQuantity + quantity > Number(material.stock || 0)) {
      alert(`المتوفر من ${getMaterialDisplayName(material)} هو ${material.stock}`);
      return;
    }

    if (existing) {
      onChange({
        ...box,
        additions: box.additions.map((item) =>
          item.tempId === existing.tempId
            ? { ...item, quantity: item.quantity + quantity }
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
    setAdditionQuantity("");
  }

  function addExternalPurchase() {
    const quantity = Number(externalQuantity);
    const unitCost = Number(externalCost);
    const unitPrice = Number(externalPrice);

    if (!externalName.trim()) {
      alert("اكتب اسم المحتوى الخارجي");
      return;
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      alert("اكتب كمية صحيحة");
      return;
    }

    if (!Number.isFinite(unitCost) || unitCost < 0) {
      alert("تكلفة الشراء غير صحيحة");
      return;
    }

    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      alert("سعر البيع غير صحيح");
      return;
    }

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
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">📦 بوكس</h2>
          <p className="mt-1 text-gray-500">
            اختار القالب فقط، وموظف التغليف يحدد فئات المحتوى لاحقًا.
          </p>
        </div>

        <button
          type="button"
          onClick={onRemove}
          className="rounded-xl bg-red-100 px-4 py-2 font-semibold text-red-700"
        >
          حذف البوكس
        </button>
      </div>

      <section className="rounded-2xl border p-5">
        <h3 className="mb-4 text-xl font-bold">قالب البوكس</h3>

        <select
          value={box.boxVariantId || ""}
          onChange={(event) => selectTemplate(event.target.value)}
          className={inputClass}
          disabled={loadingTemplates}
        >
          <option value="">
            {loadingTemplates ? "جاري تحميل القوالب..." : "اختار قالب البوكس"}
          </option>

          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
              {template.size ? ` — ${template.size}` : ""}
              {" — محتوى "}
              {template.contentValue.toFixed(2)}
              {" — بيع "}
              {template.sellPrice.toFixed(2)} د.ل
            </option>
          ))}
        </select>

        {box.boxVariantId && (
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
            <Summary label="القالب" value={box.title} />
            <Summary
              label="قيمة المحتوى"
              value={`${Number(box.contentValue || 0).toFixed(2)} د.ل`}
            />
            <Summary
              label="سعر بيع القالب"
              value={`${Number(box.boxPrice || 0).toFixed(2)} د.ل`}
              highlighted
            />
          </div>
        )}
      </section>

      <section className="rounded-2xl border p-5">
        <h3 className="mb-2 text-xl font-bold">
          إضافات ثابتة من مخزون المحل
        </h3>
        <p className="mb-4 text-sm text-gray-500">
          مثل قاعدة أو حامل أو كرت. لا تضف الورد الصناعي أو الإكسسوارات هنا.
        </p>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <select
            value={additionMaterialId}
            onChange={(event) => setAdditionMaterialId(event.target.value)}
            className={`${inputClass} md:col-span-2`}
          >
            <option value="">اختار إضافة</option>
            {additionMaterials.map((material) => (
              <option key={material.id} value={material.id}>
                {getMaterialDisplayName(material)} — المتوفر {material.stock}
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
        </div>

        <button
          type="button"
          onClick={addAddition}
          className="mt-4 rounded-xl bg-purple-700 px-6 py-3 font-bold text-white"
        >
          + إضافة من المخزون
        </button>

        <div className="mt-4 space-y-2">
          {box.additions.map((addition) => (
            <div
              key={addition.tempId}
              className="flex items-center justify-between rounded-xl bg-purple-50 p-3"
            >
              <span>
                {addition.name} × {addition.quantity}
              </span>
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...box,
                    additions: box.additions.filter(
                      (item) => item.tempId !== addition.tempId
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

      <section className="rounded-2xl border p-5">
        <h3 className="mb-2 text-xl font-bold">محتوى خارجي</h3>
        <p className="mb-4 text-sm text-gray-500">
          عنصر يُشترى خصيصًا للعميل ولا يُخصم من مخزون المحل.
        </p>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <input
            value={externalName}
            onChange={(event) => setExternalName(event.target.value)}
            className={inputClass}
            placeholder="اسم العنصر"
          />

          <input
            value={externalDescription}
            onChange={(event) => setExternalDescription(event.target.value)}
            className={inputClass}
            placeholder="الوصف"
          />

          <input
            type="number"
            min="1"
            value={externalQuantity}
            onChange={(event) => setExternalQuantity(event.target.value)}
            className={inputClass}
            placeholder="الكمية"
          />

          <input
            type="number"
            min="0"
            step="0.01"
            value={externalCost}
            onChange={(event) => setExternalCost(event.target.value)}
            className={inputClass}
            placeholder="تكلفة الشراء"
          />

          <input
            type="number"
            min="0"
            step="0.01"
            value={externalPrice}
            onChange={(event) => setExternalPrice(event.target.value)}
            className={inputClass}
            placeholder="سعر البيع"
          />

          <input
            value={externalSupplier}
            onChange={(event) => setExternalSupplier(event.target.value)}
            className={inputClass}
            placeholder="المورد أو الجهة"
          />

          <input
            value={externalNotes}
            onChange={(event) => setExternalNotes(event.target.value)}
            className={`${inputClass} xl:col-span-2`}
            placeholder="ملاحظات"
          />
        </div>

        <button
          type="button"
          onClick={addExternalPurchase}
          className="mt-4 rounded-xl bg-gray-900 px-6 py-3 font-bold text-white"
        >
          + إضافة محتوى خارجي
        </button>

        <div className="mt-4 space-y-3">
          {box.externalPurchases.map((purchase) => (
            <div
              key={purchase.tempId}
              className="rounded-xl bg-gray-100 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-bold">
                    {purchase.name} × {purchase.quantity}
                  </p>
                  {purchase.description && (
                    <p className="mt-1 text-sm text-gray-500">
                      {purchase.description}
                    </p>
                  )}
                  <p className="mt-2 text-sm">
                    شراء: {purchase.unitCost.toFixed(2)} — بيع:{" "}
                    {purchase.unitPrice.toFixed(2)} د.ل
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Summary
          label="قيمة المحتوى"
          value={`${Number(box.contentValue || 0).toFixed(2)} د.ل`}
        />
        <Summary
          label="إضافات المخزون"
          value={`${additionsTotal.toFixed(2)} د.ل`}
        />
        <Summary
          label="المحتوى الخارجي"
          value={`${externalTotal.toFixed(2)} د.ل`}
        />
        <Summary
          label="الإجمالي"
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
        className={`mt-2 text-xl font-bold ${
          highlighted ? "text-emerald-700" : ""
        }`}
      >
        {value}
      </p>
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