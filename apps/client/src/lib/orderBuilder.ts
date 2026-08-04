import { supabase } from "./supabase";

export type ItemType = "bouquet" | "box" | "gift_wrap" | "custom";

export type ComponentSection =
  | "flowers"
  | "wrapping"
  | "accessories"
  | "base"
  | "additions"
  | "external"
  | "template";

export type ProductDetailMaterial = {
  id: number;
  name: string;
  buy_price: number;
  sell_price: number;
  stock: number;
  inventory_method: string | null;
  average_unit_cost: number | null;
  material_type: string | null;
};

export type OrderItemTemplate = {
  id: string;
  name: string;
  item_type: ItemType;
  size: string | null;
  sell_price: number;
  default_flowers_count: number;
  default_accessories_count: number;
  default_wrapping_count: number;
  default_ribbons_count: number;
  default_cards_count: number;
  default_base_count: number;
  default_external_count: number;
  notes: string | null;
  is_active: boolean;
};

export type BuilderComponent = {
  tempId: string;
  productDetailId: number | null;
  componentName: string;
  section: ComponentSection;
  quantity: number;
  unitCost: number;
  unitPrice: number;
  isExternal: boolean;
};

export type BuilderItem = {
  tempId: string;
  itemType: ItemType;
  title: string;
  templateId: string | null;
  sellPrice: number;
  notes: string;
  components: BuilderComponent[];
};

export type CustomerInfoInput = {
  customerName: string;
  customerPhone: string;
  recipientPhone: string;
  occasion: string;
  deliveryDate: string;
  deliveryTime: string;
  address: string;
  notes: string;
};

export type PaymentInput = {
  paymentMethod: "cash" | "bank" | "transfer" | "deposit" | "mixed";

  cashAmount: number;
  bankAmount: number;
  transferAmount: number;
  depositAmount: number;

  deliveryFee: number;
  deliveryPaidCash: boolean;
  deliveryPaymentMethod: "none" | "cash" | "bank" | "customer_paid";
  deliveryStatus: "pending" | "assigned" | "delivered";
  deliveryDriverName: string;
  deliveryCompanyName: string;

balanceAmount?: number;
deliveryAddress?: string;
depositMethod?: "cash" | "bank" | "transfer" | "none";

discount: number;
};

export type BuilderValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

export async function getMaterials() {
  const { data, error } = await supabase
    .from("product_details")
    .select(
      "id, name, buy_price, sell_price, stock, inventory_method, average_unit_cost, material_type"
    )
    .order("name", { ascending: true });

  if (error) throw error;

  return (data || []).map((item) => ({
    ...item,
    buy_price: Number(item.buy_price || 0),
    sell_price: Number(item.sell_price || 0),
    stock: Number(item.stock || 0),
    average_unit_cost: Number(item.average_unit_cost || 0),
  })) as ProductDetailMaterial[];
}

export async function getOrderItemTemplates() {
  const { data, error } = await supabase
    .from("order_item_templates")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data || []).map((template) => ({
    ...template,
    sell_price: Number(template.sell_price || 0),
    default_flowers_count: Number(template.default_flowers_count || 0),
    default_accessories_count: Number(
      template.default_accessories_count || 0
    ),
    default_wrapping_count: Number(template.default_wrapping_count || 0),
    default_ribbons_count: Number(template.default_ribbons_count || 0),
    default_cards_count: Number(template.default_cards_count || 0),
    default_base_count: Number(template.default_base_count || 0),
    default_external_count: Number(template.default_external_count || 0),
  })) as OrderItemTemplate[];
}

export function getComponentCost(material: ProductDetailMaterial) {
  if (material.inventory_method === "average") {
    return Number(material.average_unit_cost || material.buy_price || 0);
  }

  return Number(material.buy_price || 0);
}

export function calculateItemCost(item: BuilderItem) {
  return item.components.reduce((sum, component) => {
    return (
      sum +
      Number(component.unitCost || 0) * Number(component.quantity || 0)
    );
  }, 0);
}

export function calculateOrderTotals(items: BuilderItem[]) {
  const productsTotal = items.reduce(
    (sum, item) => sum + Number(item.sellPrice || 0),
    0
  );

  const costTotal = items.reduce(
    (sum, item) => sum + calculateItemCost(item),
    0
  );

  return {
    productsTotal,
    costTotal,
    profitTotal: productsTotal - costTotal,
  };
}

export function createEmptyBuilderItem(): BuilderItem {
  return {
    tempId: crypto.randomUUID(),
    itemType: "bouquet",
    title: "",
    templateId: null,
    sellPrice: 0,
    notes: "",
    components: [],
  };
}

function getSectionQuantity(
  item: BuilderItem,
  section: ComponentSection
) {
  return item.components
    .filter((component) => component.section === section)
    .reduce(
      (sum, component) => sum + Number(component.quantity || 0),
      0
    );
}

function validateTemplateSection(input: {
  itemName: string;
  sectionName: string;
  required: number;
  actual: number;
  errors: string[];
  warnings: string[];
}) {
  const {
    itemName,
    sectionName,
    required,
    actual,
    errors,
    warnings,
  } = input;

  if (required <= 0) return;

  if (actual < required) {
    errors.push(
      `${itemName}: ناقص ${required - actual} من ${sectionName}`
    );
  }

  if (actual > required) {
    warnings.push(
      `${itemName}: يوجد زيادة ${actual - required} في ${sectionName}`
    );
  }
}

export function validateBuilderItems(input: {
  items: BuilderItem[];
  templates: OrderItemTemplate[];
  materials: ProductDetailMaterial[];
}): BuilderValidationResult {
  const { items, templates, materials } = input;

  const errors: string[] = [];
  const warnings: string[] = [];

  if (items.length === 0) {
    errors.push("لازم تضيف عنصر طلب واحد على الأقل");
  }

  for (const [index, item] of items.entries()) {
    const itemName = item.title.trim() || `العنصر رقم ${index + 1}`;

    if (!item.title.trim()) {
      errors.push(`${itemName}: اكتب وصف العنصر`);
    }

    if (Number(item.sellPrice || 0) <= 0) {
      errors.push(`${itemName}: اكتب سعر البيع`);
    }

    if (item.components.length === 0) {
      errors.push(`${itemName}: أضف مكونًا واحدًا على الأقل`);
    }

    for (const component of item.components) {
      if (Number(component.quantity || 0) <= 0) {
        errors.push(
          `${itemName}: كمية ${component.componentName} غير صحيحة`
        );
      }

      if (!component.isExternal && component.productDetailId) {
        const material = materials.find(
          (entry) => entry.id === component.productDetailId
        );

        if (!material) {
          errors.push(
            `${itemName}: المادة ${component.componentName} غير موجودة في المخزون`
          );
          continue;
        }

        if (Number(component.quantity) > Number(material.stock)) {
          errors.push(
            `${itemName}: مخزون ${material.name} غير كافٍ. المتوفر ${material.stock} والمطلوب ${component.quantity}`
          );
        }
      }
    }

    if (!item.templateId) continue;

    const template = templates.find(
      (entry) => entry.id === item.templateId
    );

    if (!template) {
      errors.push(`${itemName}: القالب المختار غير موجود أو معطل`);
      continue;
    }

    validateTemplateSection({
      itemName,
      sectionName: "الورد",
      required: template.default_flowers_count,
      actual: getSectionQuantity(item, "flowers"),
      errors,
      warnings,
    });

    validateTemplateSection({
      itemName,
      sectionName: "التغليف",
      required: template.default_wrapping_count,
      actual: getSectionQuantity(item, "wrapping"),
      errors,
      warnings,
    });

    validateTemplateSection({
      itemName,
      sectionName: "القاعدة أو الفازة أو البوكس",
      required: template.default_base_count,
      actual: getSectionQuantity(item, "base"),
      errors,
      warnings,
    });

    validateTemplateSection({
      itemName,
      sectionName: "الإكسسوارات",
      required:
        template.default_accessories_count +
        template.default_ribbons_count +
        template.default_cards_count,
      actual: getSectionQuantity(item, "accessories"),
      errors,
      warnings,
    });

    validateTemplateSection({
      itemName,
      sectionName: "المحتوى الخارجي",
      required: template.default_external_count,
      actual: getSectionQuantity(item, "external"),
      errors,
      warnings,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}