import { supabase } from "./supabase";
import {
  calculateItemCost,
  calculateOrderTotals,
  type BuilderItem,
  type CustomerInfoInput,
  type PaymentInput,
} from "./orderBuilder";
import { sendSystemPush } from "./pushNotifications";

type ExtendedBuilderItem = BuilderItem & {
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
    paymentMethod?: "cash" | "bank";
  }>;
};

export async function saveBuiltOrder(input: {
  customer: CustomerInfoInput;
  payment: PaymentInput;
  items: ExtendedBuilderItem[];
  branchId?: string | null;
  deferInventory?: boolean;
}) {
  const { customer, payment, items, branchId, deferInventory = false } = input;

  const todayKey = new Date().toISOString().slice(0, 10);
  const deliveryDate = String(customer.deliveryDate || "");
  const isFutureOrder = Boolean(deferInventory);

  if (isFutureOrder) {
    if (!deliveryDate) {
      throw new Error("حدد تاريخ تنفيذ الطلب المستقبلي");
    }

    if (deliveryDate <= todayKey) {
      throw new Error("تاريخ الحجز المستقبلي يجب أن يكون بعد تاريخ اليوم");
    }
  }

  const requiredByMaterial = new Map<
    number,
    { name: string; quantity: number }
  >();

  for (const item of items) {
    const wrappingOptionIds = new Set<number>();

    for (const option of item.wrappingOptions || []) {
      const productDetailId = Number(option.productDetailId || 0);

      if (productDetailId <= 0) {
        throw new Error(
          `يوجد لون غلاف غير صحيح داخل العنصر: ${item.title}`
        );
      }

      if (wrappingOptionIds.has(productDetailId)) {
        throw new Error(
          `لون الغلاف مكرر داخل العنصر: ${item.title}`
        );
      }

      wrappingOptionIds.add(productDetailId);
    }

    for (const component of item.components) {
      if (component.isExternal || !component.productDetailId) continue;

      const current = requiredByMaterial.get(component.productDetailId);

      if (current) {
        current.quantity += Number(component.quantity || 0);
      } else {
        requiredByMaterial.set(component.productDetailId, {
          name: component.componentName,
          quantity: Number(component.quantity || 0),
        });
      }
    }
  }

  /*
   * التحقق من مخزون الفرع قبل حفظ الطلب.
   */
  if (!branchId) {
    throw new Error("لا يمكن حفظ الطلب بدون تحديد الفرع");
  }

  if (!isFutureOrder) {
  for (const [productDetailId, required] of requiredByMaterial) {
    const { data, error } = await supabase
      .from("branch_product_stock")
      .select("stock")
      .eq("branch_id", branchId)
      .eq("product_detail_id", productDetailId)
      .maybeSingle();

    if (error) throw error;

    const available = Number(data?.stock || 0);

    if (available < required.quantity) {
      throw new Error(
        `مخزون الفرع غير كافٍ للمادة: ${required.name}\n` +
          `المطلوب: ${required.quantity}\n` +
          `المتوفر في الفرع: ${available}`
      );
    }
  }

  }

  const totals = calculateOrderTotals(items);

  const externalCostTotal = items.reduce(
    (sum, item) =>
      sum +
      (item.externalContents || []).reduce(
        (inner, external) =>
          inner +
          Number(external.unitCost || 0) *
            Number(external.quantity || 0),
        0
      ),
    0
  );

  const totalPaid =
    Number(payment.cashAmount || 0) +
    Number(payment.bankAmount || 0) +
    Number(payment.transferAmount || 0) +
    Number(payment.balanceAmount || 0) +
    Number(payment.depositAmount || 0);

  const orderTotal =
    Number(totals.productsTotal || 0) +
    Number(payment.deliveryFee || 0) -
    Number(payment.discount || 0);

  const remainingAmount = orderTotal - totalPaid;

  const deliveryCashExpense =
    payment.deliveryPaidCash &&
    payment.deliveryPaymentMethod !== "customer_paid"
      ? Number(payment.deliveryFee || 0)
      : 0;

  /*
   * الباقات دائمًا تمر على واجهة موظف التغليف حتى يكتب
   * عدد أوراق الغلاف الفعلي، حتى لو كانت الباقة بدون غلاف.
   * البوكس يمر عليها إذا كانت له قيمة محتوى.
   */
  const hasPackagingItems = items.some(
    (item) =>
      item.itemType === "bouquet" ||
false
  );

  const { data: orderData, error: orderError } = await supabase
    .from("orders")
    .insert({
      order_number: `ORD-${Date.now()}`,
      customer_name: customer.customerName,
      customer_phone: customer.customerPhone,
      recipient_phone: customer.recipientPhone || null,
      occasion: customer.occasion || null,
      delivery_date: customer.deliveryDate || null,
      delivery_time: customer.deliveryTime || null,
      delivery_address: payment.deliveryAddress || customer.address || null,
      products_total: totals.productsTotal,
      cost_total:
        Number(totals.costTotal || 0) + externalCostTotal,
      profit:
        Number(totals.productsTotal || 0) -
        Number(totals.costTotal || 0) -
        externalCostTotal,
      delivery_fee: payment.deliveryFee,
      discount: payment.discount,
      paid_amount: totalPaid,
      remaining_amount: remainingAmount,
      payment_method: payment.paymentMethod,
      cash_amount: payment.cashAmount,
      bank_amount: payment.bankAmount,
      transfer_amount: payment.transferAmount,
      balance_amount: payment.balanceAmount,
      deposit_method: payment.depositMethod,
      deposit_amount: payment.depositAmount,
      delivery_paid_cash: payment.deliveryPaidCash,
      delivery_payment_method: payment.deliveryPaymentMethod,
      delivery_status: payment.deliveryStatus,
      delivery_driver_name: payment.deliveryDriverName || null,
      delivery_company_name: payment.deliveryCompanyName || null,
      shop_income: totals.productsTotal,
      delivery_cash_expense: deliveryCashExpense,
      total: orderTotal,
      notes: customer.notes || null,
      status: isFutureOrder
        ? "reserved"
        : hasPackagingItems
          ? "packaging"
          : "ready",
      inventory_allocated: !isFutureOrder,
      inventory_allocated_at: isFutureOrder ? null : new Date().toISOString(),
      branch_id: branchId || null,
    })
    .select()
    .single();

  if (orderError) throw orderError;

  for (const item of items) {
    const itemExternalCost = (
      item.externalContents || []
    ).reduce(
      (sum, external) =>
        sum +
        Number(external.unitCost || 0) *
          Number(external.quantity || 0),
      0
    );

    const itemCost =
      calculateItemCost(item) + itemExternalCost;

    const itemProfit =
      Number(item.sellPrice || 0) - itemCost;

    const needsPackaging =
      item.itemType === "bouquet" ||
false;

    /*
     * السجل الحديث المستخدم في واجهة موظف التغليف.
     */
    const { data: orderItemData, error: orderItemError } =
      await supabase
        .from("order_items")
        .insert({
          order_id: orderData.id,
          branch_id: branchId,
          item_name: item.title,
          item_type: item.itemType,
          size: "",
          quantity: 1,
          unit_price: item.sellPrice,
          total_price: item.sellPrice,
          template_id: item.templateId,
          title: item.title,
          sell_price: item.sellPrice,
          cost_price: itemCost,
          profit: itemProfit,
          notes: item.notes || null,
          content_value: Number(item.contentValue || 0),
          packaging_status: needsPackaging
            ? "pending"
            : "completed",
        })
        .select("id")
        .single();

    if (orderItemError) throw orderItemError;

    if (!orderItemData?.id) {
      throw new Error(
        `تعذر حفظ بند الطلب: ${item.title}`
      );
    }

    /*
     * حفظ ألوان غلاف الباقة المختارة فقط.
     * لا نخصم المخزون ولا نحفظ كمية في هذه المرحلة.
     */
    for (const option of item.wrappingOptions || []) {
      const { error: wrappingOptionError } = await supabase
        .from("order_item_wrapping_options")
        .insert({
          order_item_id: orderItemData.id,
          product_detail_id: Number(option.productDetailId),
          material_name: option.materialName || "غلاف",
          actual_quantity: null,
          confirmed_at: null,
          confirmed_by: null,
        });

      if (wrappingOptionError) {
        throw wrappingOptionError;
      }
    }

    /*
     * السجل القديم المستخدم حاليًا في صفحة الطلبات والطباعة.
     */
    const { data: customItemData, error: customItemError } =
      await supabase
        .from("order_custom_items")
        .insert({
          order_id: orderData.id,
          item_type: item.itemType,
          template_id: item.templateId,
          title: item.title,
          sell_price: item.sellPrice,
          cost_price: itemCost,
          profit: itemProfit,
          notes: item.notes || null,
        })
        .select()
        .single();

    if (customItemError) throw customItemError;

    if (!customItemData?.id) {
      throw new Error(
        `تعذر حفظ تفاصيل بند الطلب: ${item.title}`
      );
    }

    /*
     * حفظ مكونات العنصر المرتبطة بالمخزون.
     * الغلاف المختار للباقة ليس Component، لذلك لن يُخصم هنا.
     */
    for (const component of item.components) {
      const totalCost =
        Number(component.unitCost || 0) *
        Number(component.quantity || 0);

      const totalPrice =
        Number(component.unitPrice || 0) *
        Number(component.quantity || 0);

      const { error: componentError } = await supabase
        .from("order_custom_item_components")
        .insert({
          custom_item_id: customItemData.id,
          product_detail_id: component.productDetailId,
          component_name: component.componentName,
          section: component.section,
          quantity: component.quantity,
          unit_cost: component.unitCost,
          unit_price: component.unitPrice,
          total_cost: totalCost,
          total_price: totalPrice,
          is_external: false,
        });

      if (componentError) throw componentError;
    }

    /*
     * حفظ المحتوى الخارجي.
     */
    for (const external of item.externalContents || []) {
      const { error: externalError } = await supabase
        .from("order_item_external_contents")
        .insert({
          order_item_id: orderItemData.id,
          item_name: external.itemName,
          description: external.description || "",
          quantity: external.quantity,
          unit_cost: external.unitCost,
          unit_sell_price: external.unitSellPrice,
          supplier_name: external.supplierName || "",
          notes: external.notes || "",
          payment_method: external.paymentMethod || "cash",
        });

      if (externalError) throw externalError;

      /*
       * حفظ المحتوى الخارجي أيضًا في الجداول القديمة للطباعة.
       */
      const { error: legacyExternalError } = await supabase
        .from("order_custom_item_components")
        .insert({
          custom_item_id: customItemData.id,
          product_detail_id: null,
          component_name: external.itemName,
          section: "external",
          quantity: external.quantity,
          unit_cost: external.unitCost,
          unit_price: external.unitSellPrice,
          total_cost:
            Number(external.unitCost || 0) *
            Number(external.quantity || 0),
          total_price:
            Number(external.unitSellPrice || 0) *
            Number(external.quantity || 0),
          is_external: true,
        });

      if (legacyExternalError) {
        throw legacyExternalError;
      }
    }
  }

  /*
   * خصم المكونات المباشرة من المخزون بعد اكتمال الحفظ.
   * ألوان غلاف الباقة لا توجد في requiredByMaterial.
   */
  if (!isFutureOrder) {
  for (const [productDetailId, required] of requiredByMaterial) {
    const { error: stockError } = await supabase.rpc("adjust_branch_stock", {
      p_branch_id: branchId,
      p_product_detail_id: productDetailId,
      p_quantity_change: -Number(required.quantity || 0),
      p_movement_type: "order_sale",
      p_reference_type: "order",
      p_reference_id: String(orderData.id),
      p_notes: `خصم مكونات الطلب ${orderData.order_number || orderData.id}`,
    });

    if (stockError) throw stockError;
  }

  }

  void sendSystemPush({
    title: "طلب جديد",
    message: `تم إنشاء الطلب #${orderData.order_number || orderData.id} للعميل ${customer.customerName}`,
    url: "/",
    tag: `new-order-${orderData.id}`,
  });

  return orderData;
}