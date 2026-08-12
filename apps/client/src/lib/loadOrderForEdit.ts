import { supabase } from "./supabase";
import { createEmptyBouquet } from "../components/orders/BouquetBuilder";
import { createEmptyBox } from "../components/orders/BoxBuilder";
import type { CustomerInfoData } from "../components/orders/CustomerInfo";
import type { PaymentData } from "../components/orders/PaymentSection";
import type { NewOrderEntry } from "./newOrderDrafts";

export type LoadedOrderForEdit = {
  orderId: number;
  orderNumber: string;
  customer: CustomerInfoData;
  payment: PaymentData;
  entries: NewOrderEntry[];
};

export async function loadOrderForEdit(
  orderId: number
): Promise<LoadedOrderForEdit> {
  const { data, error } = await supabase
    .from("orders")
    .select(`
      id,
      order_number,
      customer_name,
      customer_phone,
      recipient_phone,
      occasion,
      delivery_date,
      delivery_time,
      delivery_address,
      notes,
      payment_method,
      cash_amount,
      bank_amount,
      transfer_amount,
      deposit_amount,
      deposit_method,
      delivery_fee,
      delivery_paid_cash,
      delivery_payment_method,
      delivery_status,
      delivery_driver_name,
      delivery_company_name,
      discount,
      is_locked,
      order_custom_items (
        id,
        item_type,
        template_id,
        title,
        sell_price,
        notes,
        order_custom_item_components (
          id,
          product_detail_id,
          component_name,
          section,
          quantity,
          unit_cost,
          unit_price,
          is_external
        )
      ),
      order_items (
        id,
        item_type,
        template_id,
        title,
        sell_price,
        notes,
        content_value,
        packaging_status,
        order_item_wrapping_options (
          id,
          product_detail_id,
          material_name,
          actual_quantity,
          confirmed_at
        ),
        order_item_external_contents (
          id,
          item_name,
          description,
          quantity,
          unit_cost,
          unit_sell_price,
          supplier_name,
          notes,
          payment_method
        )
      )
    `)
    .eq("id", orderId)
    .single();

  if (error) throw error;
  if (data.is_locked) {
    throw new Error("الطلب مقفل. أعد فتحه أولًا من صفحة الطلبات.");
  }

  const customer: CustomerInfoData = {
    customerName: String(data.customer_name || ""),
    customerPhone: String(data.customer_phone || ""),
    recipientPhone: String(data.recipient_phone || ""),
    occasion: String(data.occasion || ""),
    deliveryDate: String(data.delivery_date || ""),
    deliveryTime: String(data.delivery_time || ""),
    address: String(data.delivery_address || ""),
    notes: String(data.notes || ""),
  };

  const payment: PaymentData = {
    paymentMethod: String(data.payment_method || "cash"),
    cashAmount: Number(data.cash_amount || 0),
    bankAmount: Number(data.bank_amount || 0),
    transferAmount: Number(data.transfer_amount || 0),
    depositAmount: Number(data.deposit_amount || 0),
    depositMethod: String(data.deposit_method || "cash"),
    deliveryFee: Number(data.delivery_fee || 0),
    deliveryPaidCash: Boolean(data.delivery_paid_cash),
    deliveryPaymentMethod: String(
      data.delivery_payment_method || "none"
    ),
    deliveryStatus: String(data.delivery_status || "pending"),
    deliveryDriverName: String(data.delivery_driver_name || ""),
    deliveryAddress: String(data.delivery_address || ""),
    deliveryCompanyName: String(data.delivery_company_name || ""),
    discount: Number(data.discount || 0),
  } as PaymentData;

  const modernItems = Array.isArray(data.order_items)
    ? data.order_items
    : [];
  const legacyItems = Array.isArray(data.order_custom_items)
    ? data.order_custom_items
    : [];

  const entries: NewOrderEntry[] = legacyItems.map((legacy: any) => {
    const modern =
      modernItems.find(
        (item: any) =>
          String(item.template_id || "") ===
            String(legacy.template_id || "") &&
          String(item.item_type || "") ===
            String(legacy.item_type || "") &&
          String(item.title || "") === String(legacy.title || "")
      ) ||
      modernItems.find(
        (item: any) =>
          String(item.item_type || "") === String(legacy.item_type || "")
      );

    const components = legacy.order_custom_item_components || [];

    if (legacy.item_type === "box") {
      const draft = createEmptyBox();
      const baseComponent = components.find(
        (component: any) =>
          !component.is_external &&
          component.section === "base" &&
          component.product_detail_id
      );

      const externalRows =
        modern?.order_item_external_contents || [];

      const box = {
        ...draft,
        tempId: crypto.randomUUID(),
        title: String(legacy.title || "بوكس"),
        boxVariantId: legacy.template_id
          ? String(legacy.template_id)
          : null,
        boxType: String(legacy.title || "بوكس"),
        boxSize: "",
        boxPrice: Number(legacy.sell_price || 0),
        contentValue: Number(modern?.content_value || 0),
        boxProductDetailId: baseComponent
          ? Number(baseComponent.product_detail_id)
          : null,
        boxProductName: String(
          baseComponent?.component_name || legacy.title || "بوكس"
        ),
        boxUnitCost: Number(baseComponent?.unit_cost || 0),
        additions: components
          .filter(
            (component: any) =>
              !component.is_external &&
              component.section !== "base" &&
              component.product_detail_id
          )
          .map((component: any) => ({
            tempId: crypto.randomUUID(),
            materialId: Number(component.product_detail_id),
            name: String(component.component_name || "إضافة"),
            quantity: Number(component.quantity || 0),
            unitCost: Number(component.unit_cost || 0),
            unitPrice: Number(component.unit_price || 0),
          })),
        externalPurchases: externalRows.map((external: any) => ({
          tempId: crypto.randomUUID(),
          name: String(external.item_name || ""),
          description: String(external.description || ""),
          quantity: Number(external.quantity || 0),
          unitCost: Number(external.unit_cost || 0),
          unitPrice: Number(external.unit_sell_price || 0),
          supplierName: String(external.supplier_name || ""),
          notes: String(external.notes || ""),
          paymentMethod: (String(external.payment_method || "cash") === "bank" ? "bank" : "cash") as "bank" | "cash",
        })),
        notes: String(legacy.notes || ""),
      };

      return { kind: "box", data: box };
    }

    const draft = createEmptyBouquet();

    const flowerComponents = components.filter(
      (component: any) =>
        !component.is_external &&
        component.section === "flowers"
    );

    const legacyWrappingComponents = components.filter(
      (component: any) =>
        !component.is_external &&
        component.section === "wrapping" &&
        component.product_detail_id
    );

    const externalRows =
      modern?.order_item_external_contents || [];

    const wrappingRows =
      modern?.order_item_wrapping_options || [];

    const flowersPrice = flowerComponents.reduce(
      (sum: number, component: any) =>
        sum +
        Number(component.unit_price || 0) *
          Number(component.quantity || 0),
      0
    );

    const externalPrice = externalRows.reduce(
      (sum: number, external: any) =>
        sum +
        Number(external.unit_sell_price || 0) *
          Number(external.quantity || 0),
      0
    );

    const wrappingOptions =
      wrappingRows.length > 0
        ? wrappingRows.map((option: any) => ({
            tempId: crypto.randomUUID(),
            materialId: Number(option.product_detail_id),
            name: String(option.material_name || "غلاف"),
            stock: 0,
            unitCost: 0,
            unitPrice: 0,
          }))
        : legacyWrappingComponents.map((component: any) => ({
            tempId: crypto.randomUUID(),
            materialId: Number(component.product_detail_id),
            name: String(component.component_name || "غلاف"),
            stock: 0,
            unitCost: Number(component.unit_cost || 0),
            unitPrice: Number(component.unit_price || 0),
          }));

    const bouquet = {
      ...draft,
      tempId: crypto.randomUUID(),
      title: String(legacy.title || "باقة ورد"),

      /*
       * حجم الباقة سيُعاد تحديده تلقائيًا داخل BouquetBuilder
       * حسب عدد الورد. نحفظ السعر المتبقي مؤقتًا حتى يتم تطبيق الحجم.
       */
      bouquetSizePrice: Math.max(
        0,
        Number(legacy.sell_price || 0) -
          flowersPrice -
          externalPrice
      ),

      flowers: flowerComponents.map((component: any) => {
        const componentName = String(
          component.component_name || "ورد"
        );

        const [namePart, ...colorParts] =
          componentName.split(" - ");

        return {
          tempId: crypto.randomUUID(),
          materialId: Number(component.product_detail_id),
          name: namePart || componentName,
          color: colorParts.join(" - "),
          quantity: Number(component.quantity || 0),
          unitCost: Number(component.unit_cost || 0),
          unitPrice: Number(component.unit_price || 0),
        };
      }),

      wrappingOptions,

      /*
       * العناصر التالية حُذفت من الباقات الجديدة.
       * تبقى فارغة حتى لو كان الطلب القديم يحتوي عليها.
       */
      additions: [],
      wrappingMaterialId: null,
      wrappingMaterialName: "",
      wrappingUnitCost: 0,
      wrappingUnitPrice: 0,
      ribbonMaterialId: null,
      ribbonMaterialName: "",
      ribbonQuantity: 0,
      ribbonUnitCost: 0,
      ribbonUnitPrice: 0,
      cardMaterialId: null,
      cardMaterialName: "",
      cardQuantity: 0,
      cardUnitCost: 0,
      cardUnitPrice: 0,
      baseMaterialId: null,
      baseMaterialName: "",
      baseQuantity: 0,
      baseUnitCost: 0,
      baseUnitPrice: 0,

      externalPurchases: externalRows.map((external: any) => ({
        tempId: crypto.randomUUID(),
        name: String(external.item_name || ""),
        quantity: Number(external.quantity || 0),
        unitCost: Number(external.unit_cost || 0),
        unitPrice: Number(external.unit_sell_price || 0),
        paymentMethod: (String(external.payment_method || "cash") === "bank" ? "bank" : "cash") as "bank" | "cash",
      })),

      notes: String(legacy.notes || ""),
    };

    return { kind: "bouquet", data: bouquet };
  });

  return {
    orderId: Number(data.id),
    orderNumber: String(data.order_number || data.id),
    customer,
    payment,
    entries,
  };
}