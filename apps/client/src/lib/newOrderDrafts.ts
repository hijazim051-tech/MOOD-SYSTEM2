import type { BouquetDraft } from "../components/orders/BouquetBuilder";
import type { BoxDraft } from "../components/orders/BoxBuilder";
import type { BuilderComponent, BuilderItem } from "./orderBuilder";

export type SingleProductDraft = {
  tempId: string;
  productDetailId: number | null;
  productName: string;
  quantity: number;
  unitCost: number;
  unitPrice: number;
  stock: number;
  notes: string;
};

export type NewOrderEntry =
  | { kind: "bouquet"; data: BouquetDraft }
  | { kind: "box"; data: BoxDraft }
  | { kind: "single"; data: SingleProductDraft };

type ExternalPurchaseDraft = {
  tempId: string;
  name: string;
  description?: string;
  quantity: number;
  unitCost: number;
  unitPrice: number;
  supplierName?: string;
  notes?: string;
  paymentMethod?: "cash" | "bank";
};

export type ExtendedBuilderItem = BuilderItem & {
  contentValue?: number;
  packagingStatus?: "pending" | "in_progress" | "completed";
  wrappingOptions?: Array<{
    tempId: string;
    productDetailId: number;
    materialName: string;
  }>;
  externalContents?: Array<{
    tempId: string;
    itemName: string;
    description: string;
    quantity: number;
    unitCost: number;
    unitSellPrice: number;
    supplierName: string;
    notes: string;
    paymentMethod: "cash" | "bank";
  }>;
};

export function createEmptySingleProduct(): SingleProductDraft {
  return {
    tempId: crypto.randomUUID(),
    productDetailId: null,
    productName: "",
    quantity: 1,
    unitCost: 0,
    unitPrice: 0,
    stock: 0,
    notes: "",
  };
}

export function calculateBouquetPrice(bouquet: BouquetDraft) {
  const flowersTotal = bouquet.flowers.reduce(
    (total, flower) =>
      total +
      Number(flower.unitPrice || 0) *
        Number(flower.quantity || 0),
    0
  );

  const externalTotal = bouquet.externalPurchases.reduce(
    (total, purchase) =>
      total +
      Number(purchase.unitPrice || 0) *
        Number(purchase.quantity || 0),
    0
  );

  // الغلاف لا يُحسب ككمية هنا، لأن موظف التغليف يسجل الكمية الفعلية لاحقًا.
  return (
    Number(bouquet.bouquetSizePrice || 0) +
    flowersTotal +
    externalTotal
  );
}

export function calculateBoxPrice(box: BoxDraft) {
  const boxWithNewFields = box as BoxDraft & {
    externalPurchases?: ExternalPurchaseDraft[];
  };

  const manualAdditionsTotal = box.additions.reduce(
    (total, addition) =>
      total +
      Number(addition.unitPrice || 0) *
        Number(addition.quantity || 0),
    0
  );

  const externalTotal = (boxWithNewFields.externalPurchases || []).reduce(
    (total, purchase) =>
      total +
      Number(purchase.unitPrice || 0) *
        Number(purchase.quantity || 0),
    0
  );

  return (
    Number(box.boxPrice || 0) +
    manualAdditionsTotal +
    externalTotal
  );
}

export function calculateSingleProductPrice(
  product: SingleProductDraft
) {
  return (
    Number(product.unitPrice || 0) *
    Number(product.quantity || 0)
  );
}

export function calculateEntriesTotal(entries: NewOrderEntry[]) {
  return entries.reduce((total, entry) => {
    if (entry.kind === "bouquet") {
      return total + calculateBouquetPrice(entry.data);
    }

    if (entry.kind === "box") {
      return total + calculateBoxPrice(entry.data);
    }

    return total + calculateSingleProductPrice(entry.data);
  }, 0);
}

export function getBouquetFlowerTotal(bouquet: BouquetDraft) {
  return bouquet.flowers.reduce(
    (total, flower) => total + Number(flower.quantity || 0),
    0
  );
}

export function getBoxFlowerTotal(_box: BoxDraft) {
  return 0;
}

export function convertEntriesToBuilderItems(
  entries: NewOrderEntry[]
): ExtendedBuilderItem[] {
  return entries.map((entry) => {
    if (entry.kind === "bouquet") {
      return convertBouquetToBuilderItem(entry.data);
    }

    if (entry.kind === "box") {
      return convertBoxToBuilderItem(entry.data);
    }

    return convertSingleProductToBuilderItem(entry.data);
  });
}

function convertBouquetToBuilderItem(
  bouquet: BouquetDraft
): ExtendedBuilderItem {
  const components: BuilderComponent[] = [];

  for (const flower of bouquet.flowers) {
    components.push({
      tempId: flower.tempId,
      productDetailId: flower.materialId,
      componentName: flower.color
        ? `${flower.name} - ${flower.color}`
        : flower.name,
      section: "flowers",
      quantity: flower.quantity,
      unitCost: flower.unitCost,
      unitPrice: flower.unitPrice,
      isExternal: false,
    });
  }

  const wrappingOptions = bouquet.wrappingOptions.map((option) => ({
    tempId: option.tempId,
    productDetailId: option.materialId,
    materialName: option.name,
  }));

  const externalContents = bouquet.externalPurchases.map((purchase) => ({
    tempId: purchase.tempId,
    itemName: purchase.name,
    description: "",
    quantity: Number(purchase.quantity || 0),
    unitCost: Number(purchase.unitCost || 0),
    unitSellPrice: Number(purchase.unitPrice || 0),
    supplierName: "",
    notes: "",
    paymentMethod: purchase.paymentMethod || "cash",
  }));

  return {
    tempId: bouquet.tempId,
    itemType: "bouquet",
    title: bouquet.bouquetSizeName
      ? `باقة ورد - ${bouquet.bouquetSizeName}`
      : bouquet.title,
    templateId: null,
    sellPrice: calculateBouquetPrice(bouquet),
    notes: bouquet.notes,
    components,
    contentValue: 0,
    packagingStatus: "pending",
    wrappingOptions,
    externalContents,
  };
}

function convertBoxToBuilderItem(
  box: BoxDraft
): ExtendedBuilderItem {
  const components: BuilderComponent[] = [];

  const boxWithNewFields = box as BoxDraft & {
    contentValue?: number;
    externalPurchases?: ExternalPurchaseDraft[];
  };

  if (box.boxProductDetailId) {
    components.push({
      tempId: crypto.randomUUID(),
      productDetailId: box.boxProductDetailId,
      componentName:
        box.boxProductName ||
        `بوكس ${box.boxType} - ${box.boxSize}`,
      section: "base",
      quantity: 1,
      unitCost: box.boxUnitCost,
      unitPrice: 0,
      isExternal: false,
    });
  }

  for (const addition of box.additions) {
    components.push({
      tempId: addition.tempId,
      productDetailId: addition.materialId,
      componentName: addition.name,
      section: "additions",
      quantity: addition.quantity,
      unitCost: addition.unitCost,
      unitPrice: addition.unitPrice,
      isExternal: false,
    });
  }

  const externalContents = (
    boxWithNewFields.externalPurchases || []
  ).map((purchase) => ({
    tempId: purchase.tempId,
    itemName: purchase.name,
    description: purchase.description || "",
    quantity: Number(purchase.quantity || 0),
    unitCost: Number(purchase.unitCost || 0),
    unitSellPrice: Number(purchase.unitPrice || 0),
    supplierName: purchase.supplierName || "",
    notes: purchase.notes || "",
    paymentMethod: purchase.paymentMethod || "cash",
  }));

  return {
    tempId: box.tempId,
    itemType: "box",
    title: box.title || `بوكس ${box.boxType} - ${box.boxSize}`,
    templateId: box.boxVariantId,
    sellPrice: calculateBoxPrice(box),
    notes: box.notes,
    components,
    contentValue: Number(boxWithNewFields.contentValue || 0),
    packagingStatus: "pending",
    externalContents,
  };
}

function convertSingleProductToBuilderItem(
  product: SingleProductDraft
): ExtendedBuilderItem {
  const components: BuilderComponent[] = [];

  if (product.productDetailId) {
    components.push({
      tempId: crypto.randomUUID(),
      productDetailId: product.productDetailId,
      componentName: product.productName || "منتج فردي",
      section: "additions",
      quantity: Number(product.quantity || 0),
      unitCost: Number(product.unitCost || 0),
      unitPrice: Number(product.unitPrice || 0),
      isExternal: false,
    });
  }

  return {
    tempId: product.tempId,
    itemType: "custom",
    title: product.productName || "منتج فردي",
    templateId: null,
    sellPrice: calculateSingleProductPrice(product),
    notes: product.notes,
    components,
    contentValue: 0,
    packagingStatus: "pending",
    externalContents: [],
  };
}