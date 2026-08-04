import { useMemo, useState } from "react";

import type {
  BuilderComponent,
  BuilderItem,
  ComponentSection,
  ItemType,
  OrderItemTemplate,
  ProductDetailMaterial,
} from "../../lib/orderBuilder";

import {
  getComponentCost,
} from "../../lib/orderBuilder";

type Props = {
  item: BuilderItem;
  materials: ProductDetailMaterial[];
  templates: OrderItemTemplate[];
  onChange: (item: BuilderItem) => void;
  onRemove: () => void;
};

type SectionOption = {
  value: ComponentSection;
  label: string;
};

const itemTypes: { value: ItemType; label: string }[] = [
  { value: "bouquet", label: "🌹 باقة ورد" },
  { value: "box", label: "📦 بوكس" },
  { value: "gift_wrap", label: "🎁 تغليف هدية" },
  { value: "custom", label: "✨ تصميم مخصص" },
];

const sections: SectionOption[] = [
  { value: "flowers", label: "🌹 الورد" },
  { value: "wrapping", label: "📄 ورق التغليف" },
  { value: "base", label: "🧺 البوكس / الفازة / القاعدة" },
  { value: "accessories", label: "🎀 الإكسسوارات" },
  { value: "additions", label: "✨ الإضافات" },
  { value: "external", label: "📦 محتوى خارجي" },
];



function getTemplateTarget(
  template: OrderItemTemplate | undefined,
  section: ComponentSection
) {
  if (!template) return 0;

  if (section === "flowers") {
    return Number(template.default_flowers_count || 0);
  }

  if (section === "wrapping") {
    return Number(template.default_wrapping_count || 0);
  }

  if (section === "base") {
    return Number(template.default_base_count || 0);
  }

  if (section === "accessories") {
    return (
      Number(template.default_accessories_count || 0) +
      Number(template.default_ribbons_count || 0) +
      Number(template.default_cards_count || 0)
    );
  }

  if (section === "external") {
    return Number(template.default_external_count || 0);
  }

  return 0;
}

export default function OrderItemBuilder({
  item,
  materials,
  templates,
  onChange,
  onRemove,
}: Props) {
  const [section, setSection] =
    useState<ComponentSection>("flowers");

  const [materialId, setMaterialId] = useState("");
  const [quantity, setQuantity] = useState("");

  const [externalName, setExternalName] = useState("");
  const [externalCost, setExternalCost] = useState("");

  const selectedTemplate = useMemo(() => {
    return templates.find((template) => template.id === item.templateId);
  }, [templates, item.templateId]);

  const availableTemplates = useMemo(() => {
    return templates.filter(
      (template) => template.item_type === item.itemType
    );
  }, [templates, item.itemType]);

  const filteredMaterials = useMemo(() => {
    const expectedType: Record<ComponentSection, string[]> = {
      flowers: [
        "flower",
        "flowers",
        "natural_flower",
        "artificial_flower",
        "ورد",
      ],
      wrapping: [
        "wrapping",
        "paper",
        "ورق",
        "تغليف",
      ],
      base: [
        "base",
        "box",
        "vase",
        "basket",
        "قاعدة",
        "بوكس",
        "فازة",
        "سلة",
      ],
      accessories: [
        "accessory",
        "accessories",
        "ribbon",
        "card",
        "اكسسوار",
        "شريط",
        "كرت",
      ],
      additions: [
        "addition",
        "additions",
        "fabric",
        "pearls",
        "إضافة",
        "قماش",
        "لؤلؤ",
      ],
      external: [],
      template: [],
    };

    const allowedTypes = expectedType[section];

    if (section === "external" || allowedTypes.length === 0) {
      return materials;
    }

    const matched = materials.filter((material) => {
      const type = String(material.material_type || "")
        .trim()
        .toLowerCase();

      return allowedTypes.includes(type);
    });

    return matched.length > 0 ? matched : materials;
  }, [materials, section]);

  function changeItemType(value: ItemType) {
    onChange({
      ...item,
      itemType: value,
      title: "",
      templateId: null,
      sellPrice: 0,
      components: [],
    });

    setSection(value === "gift_wrap" ? "wrapping" : "flowers");
    clearComponentForm();
  }

  function applyTemplate(templateId: string) {
    const template = templates.find(
      (entry) => entry.id === templateId
    );

    onChange({
      ...item,
      templateId: templateId || null,
      title: template?.name || item.title,
      sellPrice:
        Number(template?.sell_price || 0) > 0
          ? Number(template?.sell_price || 0)
          : item.sellPrice,
    });
  }

  function clearComponentForm() {
    setMaterialId("");
    setQuantity("");
    setExternalName("");
    setExternalCost("");
  }

  function addComponent() {
    const amount = Number(quantity);

    if (!Number.isFinite(amount) || amount <= 0) {
      alert("اكتب كمية صحيحة");
      return;
    }

    if (section === "external") {
      if (!externalName.trim()) {
        alert("اكتب اسم المحتوى الخارجي");
        return;
      }

      const externalComponent: BuilderComponent = {
        tempId: crypto.randomUUID(),
        productDetailId: null,
        componentName: externalName.trim(),
        section: "external",
        quantity: amount,
        unitCost: Number(externalCost || 0),
        unitPrice: 0,
        isExternal: true,
      };

      onChange({
        ...item,
        components: [...item.components, externalComponent],
      });

      clearComponentForm();
      return;
    }

    const material = materials.find(
      (entry) => String(entry.id) === materialId
    );

    if (!material) {
      alert("اختار المادة من المخزون");
      return;
    }

    if (amount > Number(material.stock || 0)) {
      alert(
        `المخزون غير كافي. المتوفر من ${material.name}: ${material.stock}`
      );
      return;
    }

    const existingComponent = item.components.find(
      (component) =>
        component.productDetailId === material.id &&
        component.section === section &&
        !component.isExternal
    );

    if (existingComponent) {
      const newQuantity =
        Number(existingComponent.quantity || 0) + amount;

      if (newQuantity > Number(material.stock || 0)) {
        alert(
          `إجمالي الكمية أكبر من المخزون. المتوفر من ${material.name}: ${material.stock}`
        );
        return;
      }

      onChange({
        ...item,
        components: item.components.map((component) =>
          component.tempId === existingComponent.tempId
            ? {
                ...component,
                quantity: newQuantity,
              }
            : component
        ),
      });

      clearComponentForm();
      return;
    }

    const component: BuilderComponent = {
      tempId: crypto.randomUUID(),
      productDetailId: material.id,
      componentName: material.name,
      section,
      quantity: amount,
      unitCost: getComponentCost(material),
      unitPrice: Number(material.sell_price || 0),
      isExternal: false,
    };

    onChange({
      ...item,
      components: [...item.components, component],
    });

    clearComponentForm();
  }

  function updateComponentQuantity(
    component: BuilderComponent,
    newValue: string
  ) {
    const newQuantity = Number(newValue);

    if (!Number.isFinite(newQuantity) || newQuantity <= 0) {
      return;
    }

    if (!component.isExternal && component.productDetailId) {
      const material = materials.find(
        (entry) => entry.id === component.productDetailId
      );

      if (
        material &&
        newQuantity > Number(material.stock || 0)
      ) {
        alert(
          `المخزون غير كافي. المتوفر من ${material.name}: ${material.stock}`
        );
        return;
      }
    }

    onChange({
      ...item,
      components: item.components.map((entry) =>
        entry.tempId === component.tempId
          ? { ...entry, quantity: newQuantity }
          : entry
      ),
    });
  }

  function removeComponent(tempId: string) {
    onChange({
      ...item,
      components: item.components.filter(
        (component) => component.tempId !== tempId
      ),
    });
  }

  function getSectionUsed(sectionValue: ComponentSection) {
    return item.components
      .filter(
        (component) => component.section === sectionValue
      )
      .reduce(
        (total, component) =>
          total + Number(component.quantity || 0),
        0
      );
  }

  function getSectionState(sectionValue: ComponentSection) {
    const required = getTemplateTarget(
      selectedTemplate,
      sectionValue
    );

    const used = getSectionUsed(sectionValue);
    const difference = used - required;

    if (required === 0) {
      return {
        required,
        used,
        difference,
        status: "optional" as const,
      };
    }

    if (used < required) {
      return {
        required,
        used,
        difference,
        status: "missing" as const,
      };
    }

    if (used > required) {
      return {
        required,
        used,
        difference,
        status: "extra" as const,
      };
    }

    return {
      required,
      used,
      difference,
      status: "complete" as const,
    };
  }

  function statusClasses(status: string) {
    if (status === "complete") {
      return "border-green-300 bg-green-50 text-green-800";
    }

    if (status === "missing") {
      return "border-red-300 bg-red-50 text-red-800";
    }

    if (status === "extra") {
      return "border-orange-300 bg-orange-50 text-orange-800";
    }

    return "border-gray-200 bg-gray-50 text-gray-700";
  }

  function statusText(
    sectionValue: ComponentSection
  ) {
    const state = getSectionState(sectionValue);

    if (state.status === "complete") {
      return "مكتمل ✅";
    }

    if (state.status === "missing") {
      return `باقي ${Math.abs(state.difference)}`;
    }

    if (state.status === "extra") {
      return `زيادة ${state.difference}`;
    }

    return "اختياري";
  }

  return (
    <div
      className="rounded-2xl bg-white p-6 shadow"
      dir="rtl"
    >
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h3 className="text-2xl font-bold">
            {item.title || "عنصر طلب جديد"}
          </h3>

          <p className="mt-1 text-gray-500">
            اختر القالب ثم أضف المواد الفعلية المستخدمة
          </p>
        </div>

        <button
          type="button"
          onClick={onRemove}
          className="rounded-xl bg-red-100 px-4 py-2 font-semibold text-red-700 hover:bg-red-200"
        >
          حذف العنصر
        </button>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div>
          <label className="mb-2 block font-semibold">
            نوع العنصر
          </label>

          <select
            value={item.itemType}
            onChange={(event) =>
              changeItemType(
                event.target.value as ItemType
              )
            }
            className="w-full rounded-xl border p-3"
          >
            {itemTypes.map((type) => (
              <option
                key={type.value}
                value={type.value}
              >
                {type.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block font-semibold">
            القالب أو الحجم
          </label>

          <select
            value={item.templateId || ""}
            onChange={(event) =>
              applyTemplate(event.target.value)
            }
            className="w-full rounded-xl border p-3"
          >
            <option value="">
              بدون قالب — بناء يدوي
            </option>

            {availableTemplates.map((template) => (
              <option
                key={template.id}
                value={template.id}
              >
                {template.name}
                {template.size
                  ? ` — ${template.size}`
                  : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block font-semibold">
            وصف العنصر
          </label>

          <input
            value={item.title}
            onChange={(event) =>
              onChange({
                ...item,
                title: event.target.value,
              })
            }
            className="w-full rounded-xl border p-3"
            placeholder="مثال: باقة تخرج كبيرة"
          />
        </div>

        <div>
          <label className="mb-2 block font-semibold">
            سعر البيع
          </label>

          <input
            type="number"
            min="0"
            value={item.sellPrice || ""}
            onChange={(event) =>
              onChange({
                ...item,
                sellPrice: Number(
                  event.target.value || 0
                ),
              })
            }
            className="w-full rounded-xl border p-3"
            placeholder="السعر الذي حدده الموظف"
          />
        </div>
      </div>

      {selectedTemplate && (
        <div className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-xl font-bold">
              متابعة متطلبات القالب
            </h4>

            <span className="rounded-full bg-purple-100 px-3 py-1 text-sm text-purple-700">
              {selectedTemplate.name}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {sections
              .filter(
                (entry) =>
                  entry.value !== "additions" &&
                  entry.value !== "external"
              )
              .map((entry) => {
                const state = getSectionState(
                  entry.value
                );

                return (
                  <div
                    key={entry.value}
                    className={`rounded-xl border p-4 ${statusClasses(
                      state.status
                    )}`}
                  >
                    <p className="font-bold">
                      {entry.label}
                    </p>

                    <p className="mt-2 text-lg">
                      {state.used} / {state.required}
                    </p>

                    <p className="mt-1 text-sm font-semibold">
                      {statusText(entry.value)}
                    </p>
                  </div>
                );
              })}
          </div>

          {selectedTemplate.notes && (
            <div className="mt-3 rounded-xl bg-purple-50 p-3 text-purple-800">
              {selectedTemplate.notes}
            </div>
          )}
        </div>
      )}

      <div className="mb-6 rounded-2xl border p-5">
        <h4 className="mb-4 text-xl font-bold">
          ➕ إضافة مكون
        </h4>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <select
            value={section}
            onChange={(event) => {
              setSection(
                event.target.value as ComponentSection
              );

              clearComponentForm();
            }}
            className="rounded-xl border p-3"
          >
            {sections.map((entry) => (
              <option
                key={entry.value}
                value={entry.value}
              >
                {entry.label}
              </option>
            ))}
          </select>

          {section === "external" ? (
            <>
              <input
                value={externalName}
                onChange={(event) =>
                  setExternalName(
                    event.target.value
                  )
                }
                className="rounded-xl border p-3"
                placeholder="اسم المحتوى الخارجي"
              />

              <input
                type="number"
                min="0"
                value={externalCost}
                onChange={(event) =>
                  setExternalCost(
                    event.target.value
                  )
                }
                className="rounded-xl border p-3"
                placeholder="تكلفته"
              />
            </>
          ) : (
            <select
              value={materialId}
              onChange={(event) =>
                setMaterialId(
                  event.target.value
                )
              }
              className="rounded-xl border p-3 md:col-span-1 xl:col-span-2"
            >
              <option value="">
                اختر من المخزون
              </option>

              {filteredMaterials.map(
                (material) => (
                  <option
                    key={material.id}
                    value={material.id}
                  >
                    {material.name} — المتوفر{" "}
                    {material.stock}
                  </option>
                )
              )}
            </select>
          )}

          <input
            type="number"
            min="0.01"
            step="0.01"
            value={quantity}
            onChange={(event) =>
              setQuantity(event.target.value)
            }
            className="rounded-xl border p-3"
            placeholder="الكمية"
          />
        </div>

        <button
          type="button"
          onClick={addComponent}
          className="mt-4 w-full rounded-xl bg-emerald-700 px-6 py-3 font-bold text-white hover:bg-emerald-800"
        >
          إضافة المكون
        </button>
      </div>

      <div className="space-y-5">
        {sections.map((entry) => {
          const sectionComponents =
            item.components.filter(
              (component) =>
                component.section === entry.value
            );

          if (sectionComponents.length === 0) {
            return null;
          }

          const state = getSectionState(
            entry.value
          );

          return (
            <div
              key={entry.value}
              className="rounded-2xl border p-5"
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <h4 className="text-xl font-bold">
                  {entry.label}
                </h4>

                <span
                  className={`rounded-full border px-3 py-1 text-sm font-semibold ${statusClasses(
                    state.status
                  )}`}
                >
                  الإجمالي: {state.used}
                  {state.required > 0
                    ? ` / ${state.required}`
                    : ""}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px]">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="p-3 text-right">
                        المكون
                      </th>

                      <th className="p-3 text-right">
                        الكمية
                      </th>

                      <th className="p-3 text-right">
                        المصدر
                      </th>

                      <th className="p-3 text-right">
                        العملية
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {sectionComponents.map(
                      (component) => (
                        <tr
                          key={component.tempId}
                          className="border-b"
                        >
                          <td className="p-3 font-semibold">
                            {component.componentName}
                          </td>

                          <td className="p-3">
                            <input
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={
                                component.quantity
                              }
                              onChange={(event) =>
                                updateComponentQuantity(
                                  component,
                                  event.target.value
                                )
                              }
                              className="w-28 rounded-lg border p-2"
                            />
                          </td>

                          <td className="p-3">
                            {component.isExternal
                              ? "خارجي"
                              : "المخزون"}
                          </td>

                          <td className="p-3">
                            <button
                              type="button"
                              onClick={() =>
                                removeComponent(
                                  component.tempId
                                )
                              }
                              className="rounded-lg bg-red-100 px-3 py-2 text-red-700 hover:bg-red-200"
                            >
                              حذف
                            </button>
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

        {item.components.length === 0 && (
          <div className="rounded-xl bg-gray-50 p-8 text-center text-gray-500">
            لم تتم إضافة أي مكونات لهذا العنصر بعد.
          </div>
        )}
      </div>

      <div className="mt-6">
        <label className="mb-2 block font-semibold">
          ملاحظات العنصر
        </label>

        <textarea
          value={item.notes}
          onChange={(event) =>
            onChange({
              ...item,
              notes: event.target.value,
            })
          }
          rows={3}
          className="w-full rounded-xl border p-3"
          placeholder="لون الورد، شكل التغليف، تعليمات خاصة..."
        />
      </div>

      <div className="mt-6 rounded-xl bg-emerald-50 p-5">
        <p className="text-gray-500">
          سعر بيع العنصر
        </p>

        <p className="mt-1 text-3xl font-bold text-emerald-700">
          {Number(item.sellPrice || 0).toFixed(2)} د.ل
        </p>

        <p className="mt-2 text-sm text-gray-500">
          التكلفة والربح يتم حسابهما وحفظهما في الخلفية ولا يظهران للموظف.
        </p>
      </div>
    </div>
  );
}