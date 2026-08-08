import { supabase } from "./supabase";
import {
  calculateItemCost,
  calculateOrderTotals,
  type CustomerInfoInput,
  type PaymentInput,
} from "./orderBuilder";
import type { ExtendedBuilderItem } from "./newOrderDrafts";

type ExistingComponent = {
  product_detail_id: number | null;
  component_name: string | null;
  quantity: number | null;
  is_external: boolean | null;
};

type OldWrappingOption = {
  id: string;
  product_detail_id: number | null;
  material_name: string | null;
  actual_quantity: number | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
};

type OldExternalContent = {
  item_name: string | null;
  description: string | null;
  quantity: number | null;
  notes: string | null;
};

type OldPackagingComponent = {
  product_detail_id: number | null;
  component_name: string | null;
  section: string | null;
  quantity: number | null;
  is_external: boolean | null;
};

type OldItemSnapshot = {
  id: number;
  itemType: string;
  templateId: string | null;
  title: string;
  notes: string;
  contentValue: number;
  packagingStatus: string;
  packagingCompletedAt: string | null;
  packagingCompletedBy: string | null;
  components: OldPackagingComponent[];
  wrappingOptions: OldWrappingOption[];
  externalContents: OldExternalContent[];
};

type ItemComparison = {
  oldItem: OldItemSnapshot | null;
  packagingChanged: boolean;
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeNumber(value: unknown) {
  return Number(value || 0);
}

function stableJson(value: unknown) {
  return JSON.stringify(value);
}

function createOldPackagingSignature(item: OldItemSnapshot) {
  const components = item.components
    .filter((component) => !component.is_external)
    .map((component) => ({
      productDetailId: Number(component.product_detail_id || 0),
      name: normalizeText(component.component_name),
      section: normalizeText(component.section),
      quantity: normalizeNumber(component.quantity),
    }))
    .sort((a, b) =>
      stableJson(a).localeCompare(stableJson(b))
    );

  const wrappingOptions = item.wrappingOptions
    .map((option) => ({
      productDetailId: Number(option.product_detail_id || 0),
      materialName: normalizeText(option.material_name),
    }))
    .sort((a, b) =>
      stableJson(a).localeCompare(stableJson(b))
    );

  const externalContents = item.externalContents
    .map((external) => ({
      itemName: normalizeText(external.item_name),
      description: normalizeText(external.description),
      quantity: normalizeNumber(external.quantity),
      notes: normalizeText(external.notes),
    }))
    .sort((a, b) =>
      stableJson(a).localeCompare(stableJson(b))
    );

  return stableJson({
    itemType: normalizeText(item.itemType),
    templateId: item.templateId || null,
    contentValue: normalizeNumber(item.contentValue),
    notes: normalizeText(item.notes),
    components,
    wrappingOptions,
    externalContents,
  });
}

function createNewPackagingSignature(item: ExtendedBuilderItem) {
  const components = (item.components || [])
    .filter((component) => !component.isExternal)
    .map((component) => ({
      productDetailId: Number(component.productDetailId || 0),
      name: normalizeText(component.componentName),
      section: normalizeText(component.section),
      quantity: normalizeNumber(component.quantity),
    }))
    .sort((a, b) =>
      stableJson(a).localeCompare(stableJson(b))
    );

  const wrappingOptions = (item.wrappingOptions || [])
    .map((option) => ({
      productDetailId: Number(option.productDetailId || 0),
      materialName: normalizeText(option.materialName),
    }))
    .sort((a, b) =>
      stableJson(a).localeCompare(stableJson(b))
    );

  const externalContents = (item.externalContents || [])
    .map((external) => ({
      itemName: normalizeText(external.itemName),
      description: normalizeText(external.description),
      quantity: normalizeNumber(external.quantity),
      notes: normalizeText(external.notes),
    }))
    .sort((a, b) =>
      stableJson(a).localeCompare(stableJson(b))
    );

  return stableJson({
    itemType: normalizeText(item.itemType),
    templateId: item.templateId || null,
    contentValue: normalizeNumber(item.contentValue),
    notes: normalizeText(item.notes),
    components,
    wrappingOptions,
    externalContents,
  });
}

function findMatchingOldItem(
  item: ExtendedBuilderItem,
  oldItems: OldItemSnapshot[],
  usedOldIds: Set<number>
) {
  const available = oldItems.filter(
    (oldItem) => !usedOldIds.has(oldItem.id)
  );

  const exact = available.find(
    (oldItem) =>
      normalizeText(oldItem.itemType) ===
        normalizeText(item.itemType) &&
      String(oldItem.templateId || "") ===
        String(item.templateId || "") &&
      normalizeText(oldItem.title) === normalizeText(item.title)
  );

  if (exact) return exact;

  const sameTemplate = available.find(
    (oldItem) =>
      normalizeText(oldItem.itemType) ===
        normalizeText(item.itemType) &&
      String(oldItem.templateId || "") ===
        String(item.templateId || "")
  );

  if (sameTemplate) return sameTemplate;

  return (
    available.find(
      (oldItem) =>
        normalizeText(oldItem.itemType) ===
        normalizeText(item.itemType)
    ) || null
  );
}

function normalizeOrderStatus(status: string | null | undefined) {
  const currentStatus = String(status || "").trim();

  const legacyStatusMap: Record<string, string> = {
    new: "packaging",
    working: "packaging",
    pending: "packaging",
    done: "delivered",
    completed: "delivered",
    delivery: "out_for_delivery",
  };

  return legacyStatusMap[currentStatus] || currentStatus || "packaging";
}

export async function updateBuiltOrder(input: {
  orderId: number;
  customer: CustomerInfoInput;
  payment: PaymentInput;
  items: ExtendedBuilderItem[];
}) {
  const { orderId, customer, payment, items } = input;

  if (!Number.isFinite(orderId) || orderId <= 0) {
    throw new Error("رقم الطلب غير صحيح.");
  }

  if (!customer.customerName?.trim()) {
    throw new Error("اسم العميل مطلوب.");
  }

  if (!customer.customerPhone?.trim()) {
    throw new Error("رقم هاتف العميل مطلوب.");
  }

  if (!items.length) {
    throw new Error("يجب أن يحتوي الطلب على عنصر واحد على الأقل.");
  }

  const { data: existingOrder, error: orderReadError } = await supabase
    .from("orders")
    .select(`
      id,
      order_number,
      branch_id,
      is_locked,
      status,
      delivery_driver_name,
      delivery_driver_phone,
      handed_to_driver_at,
      delivered_at,
      driver_collection_amount,
      driver_money_status,
      driver_money_received_at,
      driver_money_notes
    `)
    .eq("id", orderId)
    .single();

  if (orderReadError) {
    throw orderReadError;
  }

  if (!existingOrder) {
    throw new Error("الطلب غير موجود.");
  }

  if (existingOrder.is_locked) {
    throw new Error("الطلب مقفل. أعد فتحه أولًا من صفحة الطلبات.");
  }

  if (existingOrder.status === "cancelled") {
    throw new Error("لا يمكن تعديل طلب ملغي.");
  }

  /*
   * لا نسمح لتعديل الطلب أن يعيده إلى الحالات القديمة.
   * كما لا نلمس بيانات المندوب أو تسويته.
   */
  const preservedStatus = normalizeOrderStatus(existingOrder.status);

  /*
   * نقرأ حالة التغليف القديمة ومكوناتها قبل الحذف.
   * الهدف هو معرفة هل التعديل مسّ التجهيز فعلًا أم كان إداريًا فقط.
   */
  const { data: oldOrderItemsRaw, error: oldOrderItemsError } =
    await supabase
      .from("order_items")
      .select(`
        id,
        item_type,
        template_id,
        title,
        notes,
        content_value,
        packaging_status,
        packaging_completed_at,
        packaging_completed_by,
        order_item_wrapping_options (
          id,
          product_detail_id,
          material_name,
          actual_quantity,
          confirmed_at,
          confirmed_by
        ),
        order_item_external_contents (
          item_name,
          description,
          quantity,
          notes
        )
      `)
      .eq("order_id", orderId)
      .order("id", { ascending: true });

  if (oldOrderItemsError) {
    throw oldOrderItemsError;
  }

  const { data: oldCustomItemsRaw, error: oldCustomItemsError } =
    await supabase
      .from("order_custom_items")
      .select(`
        id,
        item_type,
        template_id,
        title,
        order_custom_item_components (
          product_detail_id,
          component_name,
          section,
          quantity,
          is_external
        )
      `)
      .eq("order_id", orderId)
      .order("id", { ascending: true });

  if (oldCustomItemsError) {
    throw oldCustomItemsError;
  }

  const usedCustomIds = new Set<number>();

  const oldSnapshots: OldItemSnapshot[] = (
    oldOrderItemsRaw || []
  ).map((row: any) => {
    const availableCustomItems = (oldCustomItemsRaw || []).filter(
      (custom: any) => !usedCustomIds.has(Number(custom.id))
    );

    const matchingCustom =
      availableCustomItems.find(
        (custom: any) =>
          normalizeText(custom.item_type) ===
            normalizeText(row.item_type) &&
          String(custom.template_id || "") ===
            String(row.template_id || "") &&
          normalizeText(custom.title) === normalizeText(row.title)
      ) ||
      availableCustomItems.find(
        (custom: any) =>
          normalizeText(custom.item_type) ===
            normalizeText(row.item_type) &&
          String(custom.template_id || "") ===
            String(row.template_id || "")
      ) ||
      availableCustomItems.find(
        (custom: any) =>
          normalizeText(custom.item_type) ===
          normalizeText(row.item_type)
      );

    if (matchingCustom?.id) {
      usedCustomIds.add(Number(matchingCustom.id));
    }

    return {
      id: Number(row.id),
      itemType: normalizeText(row.item_type),
      templateId:
        row.template_id === null ||
        row.template_id === undefined
          ? null
          : String(row.template_id),
      title: normalizeText(row.title),
      notes: normalizeText(row.notes),
      contentValue: normalizeNumber(row.content_value),
      packagingStatus: normalizeText(
        row.packaging_status || "pending"
      ),
      packagingCompletedAt: row.packaging_completed_at
        ? String(row.packaging_completed_at)
        : null,
      packagingCompletedBy: row.packaging_completed_by
        ? String(row.packaging_completed_by)
        : null,
      components:
        matchingCustom?.order_custom_item_components || [],
      wrappingOptions:
        row.order_item_wrapping_options || [],
      externalContents:
        row.order_item_external_contents || [],
    };
  });

  const usedOldItemIds = new Set<number>();

  const itemComparisons: ItemComparison[] = items.map((item) => {
    const oldItem = findMatchingOldItem(
      item,
      oldSnapshots,
      usedOldItemIds
    );

    if (!oldItem) {
      return {
        oldItem: null,
        packagingChanged: true,
      };
    }

    usedOldItemIds.add(oldItem.id);

    return {
      oldItem,
      packagingChanged:
        createOldPackagingSignature(oldItem) !==
        createNewPackagingSignature(item),
    };
  });

  const removedOldItems = oldSnapshots.filter(
    (oldItem) => !usedOldItemIds.has(oldItem.id)
  );

  const hasPackagingChanges =
    itemComparisons.some(
      (comparison) => comparison.packagingChanged
    ) || removedOldItems.length > 0;

  const nextOrderStatus = hasPackagingChanges
    ? "packaging"
    : preservedStatus;

  const { data: oldComponents, error: oldComponentsError } =
    await supabase
      .from("order_custom_item_components")
      .select(`
        product_detail_id,
        component_name,
        quantity,
        is_external,
        order_custom_items!inner(order_id)
      `)
      .eq("order_custom_items.order_id", orderId);

  if (oldComponentsError) {
    throw oldComponentsError;
  }

  /*
   * الكميات القديمة التي يجب إرجاعها إلى المخزون
   * قبل خصم مكونات النسخة الجديدة من الطلب.
   */
  const restoreMap = new Map<number, number>();

  for (const row of (oldComponents ||
    []) as unknown as ExistingComponent[]) {
    if (row.is_external || !row.product_detail_id) {
      continue;
    }

    const productDetailId = Number(row.product_detail_id);
    const quantity = Number(row.quantity || 0);

    restoreMap.set(
      productDetailId,
      Number(restoreMap.get(productDetailId) || 0) + quantity
    );
  }

  /*
   * إذا كان بند قد تم تغليفه ثم تغيرت بيانات تجهيزه،
   * نرجع ورق الغلاف المستخدم سابقًا إلى المخزون.
   * أما التعديل الإداري فقط فلا يلمس مخزون الغلاف.
   */
  const wrappingRestoreMap = new Map<number, number>();

  const oldItemsNeedingWrappingRestore = [
    ...itemComparisons
      .filter(
        (comparison) =>
          comparison.packagingChanged && comparison.oldItem
      )
      .map((comparison) => comparison.oldItem as OldItemSnapshot),
    ...removedOldItems,
  ];

  for (const oldItem of oldItemsNeedingWrappingRestore) {
    for (const option of oldItem.wrappingOptions) {
      const productDetailId = Number(
        option.product_detail_id || 0
      );
      const actualQuantity = Number(
        option.actual_quantity || 0
      );

      if (productDetailId <= 0 || actualQuantity <= 0) {
        continue;
      }

      wrappingRestoreMap.set(
        productDetailId,
        Number(
          wrappingRestoreMap.get(productDetailId) || 0
        ) + actualQuantity
      );
    }
  }

  for (const [productDetailId, quantity] of wrappingRestoreMap) {
    const { data, error } = await supabase
      .from("product_details")
      .select("stock")
      .eq("id", productDetailId)
      .single();

    if (error) {
      throw error;
    }

    const { error: updateError } = await supabase
      .from("product_details")
      .update({
        stock: Number(data?.stock || 0) + quantity,
      })
      .eq("id", productDetailId);

    if (updateError) {
      throw updateError;
    }
  }

  /*
   * تجميع الكميات الجديدة المطلوبة من المخزون.
   */
  const requiredMap = new Map<
    number,
    {
      name: string;
      quantity: number;
    }
  >();

  for (const item of items) {
    if (!item.title?.trim()) {
      throw new Error("يوجد عنصر داخل الطلب بدون اسم.");
    }

    if (Number(item.sellPrice || 0) <= 0) {
      throw new Error(
        `يجب إدخال سعر بيع صحيح للعنصر: ${item.title || "عنصر الطلب"}`
      );
    }

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
      if (component.isExternal || !component.productDetailId) {
        continue;
      }

      const productDetailId = Number(component.productDetailId);
      const quantity = Number(component.quantity || 0);

      if (quantity <= 0) {
        continue;
      }

      const current = requiredMap.get(productDetailId);

      if (current) {
        current.quantity += quantity;
      } else {
        requiredMap.set(productDetailId, {
          name: component.componentName,
          quantity,
        });
      }
    }
  }

  /*
   * نتحقق من توفر المخزون بعد احتساب رجوع مكونات الطلب القديمة.
   */
  const materialIds = Array.from(
    new Set([...restoreMap.keys(), ...requiredMap.keys()])
  );

  for (const productDetailId of materialIds) {
    const { data, error } = await supabase
      .from("product_details")
      .select("stock")
      .eq("id", productDetailId)
      .single();

    if (error) {
      throw error;
    }

    const currentStock = Number(data?.stock || 0);
    const oldQuantity = Number(
      restoreMap.get(productDetailId) || 0
    );
    const requiredQuantity = Number(
      requiredMap.get(productDetailId)?.quantity || 0
    );

    const availableAfterRestore =
      currentStock + oldQuantity;

    if (availableAfterRestore < requiredQuantity) {
      const materialName =
        requiredMap.get(productDetailId)?.name ||
        "عنصر من المخزون";

      throw new Error(
        `المخزون غير كافٍ للمادة: ${materialName}\n` +
          `المطلوب: ${requiredQuantity}\n` +
          `المتوفر بعد إرجاع مكونات الطلب القديمة: ${availableAfterRestore}`
      );
    }
  }

  /*
   * إعادة مكونات الطلب القديمة إلى المخزون.
   */
  for (const [productDetailId, quantity] of restoreMap) {
    const { data, error } = await supabase
      .from("product_details")
      .select("stock")
      .eq("id", productDetailId)
      .single();

    if (error) {
      throw error;
    }

    const currentStock = Number(data?.stock || 0);

    const { error: updateError } = await supabase
      .from("product_details")
      .update({
        stock: currentStock + quantity,
      })
      .eq("id", productDetailId);

    if (updateError) {
      throw updateError;
    }
  }

  const totals = calculateOrderTotals(items);

  const externalCostTotal = items.reduce((orderSum, item) => {
    const itemExternalCost = (
      item.externalContents || []
    ).reduce(
      (itemSum, external) =>
        itemSum +
        Number(external.unitCost || 0) *
          Number(external.quantity || 0),
      0
    );

    return orderSum + itemExternalCost;
  }, 0);

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
   * حذف بنود الطلب القديمة بعد إعادة مخزونها.
   * العلاقات التابعة يفترض أن تُحذف تلقائيًا بواسطة ON DELETE CASCADE.
   */
  const { error: deleteCustomItemsError } = await supabase
    .from("order_custom_items")
    .delete()
    .eq("order_id", orderId);

  if (deleteCustomItemsError) {
    throw deleteCustomItemsError;
  }

  const { error: deleteOrderItemsError } = await supabase
    .from("order_items")
    .delete()
    .eq("order_id", orderId);

  if (deleteOrderItemsError) {
    throw deleteOrderItemsError;
  }

  /*
   * تحديث بيانات الطلب الرئيسية.
   *
   * ملاحظة مهمة:
   * لا نرسل حقول المندوب أو التسوية هنا، لكي تبقى كما هي.
   */
  const { error: orderUpdateError } = await supabase
    .from("orders")
    .update({
      customer_name: customer.customerName.trim(),
      customer_phone: customer.customerPhone.trim(),
      recipient_phone: customer.recipientPhone?.trim() || null,
      occasion: customer.occasion || null,
      delivery_date: customer.deliveryDate || null,
      delivery_time: customer.deliveryTime || null,
      delivery_address: payment.deliveryAddress || customer.address || null,

      products_total: Number(totals.productsTotal || 0),
      cost_total:
        Number(totals.costTotal || 0) + externalCostTotal,
      profit:
        Number(totals.productsTotal || 0) -
        Number(totals.costTotal || 0) -
        externalCostTotal,

      delivery_fee: Number(payment.deliveryFee || 0),
      discount: Number(payment.discount || 0),
      paid_amount: totalPaid,
      remaining_amount: remainingAmount,

      payment_method: payment.paymentMethod,
      cash_amount: Number(payment.cashAmount || 0),
      bank_amount: Number(payment.bankAmount || 0),
      transfer_amount: Number(
        payment.transferAmount || 0
      ),
      balance_amount: Number(payment.balanceAmount || 0),
      deposit_method: payment.depositMethod || "cash",
      deposit_amount: Number(payment.depositAmount || 0),

      delivery_paid_cash: Boolean(
        payment.deliveryPaidCash
      ),
      delivery_payment_method:
        payment.deliveryPaymentMethod,
      delivery_status: payment.deliveryStatus,
      delivery_company_name:
        payment.deliveryCompanyName || null,

      shop_income: Number(totals.productsTotal || 0),
      delivery_cash_expense: deliveryCashExpense,
      total: orderTotal,
      notes: customer.notes || null,

      /*
       * نعيد الطلب إلى قيد التغليف فقط إذا تغيرت بيانات التجهيز.
       * تعديلات العميل والدفع والتوصيل فقط تحافظ على الحالة الحالية.
       */
      status: nextOrderStatus,
    })
    .eq("id", orderId);

  if (orderUpdateError) {
    throw orderUpdateError;
  }

  /*
   * إعادة إنشاء بنود الطلب بعد التعديل.
   */
  for (const [itemIndex, item] of items.entries()) {
    const comparison = itemComparisons[itemIndex];
    const oldItem = comparison?.oldItem || null;
    const packagingChanged =
      comparison?.packagingChanged ?? true;

    const preservedPackagingStatus =
      !packagingChanged && oldItem
        ? oldItem.packagingStatus || "pending"
        : "pending";

    const preservedCompletedAt =
      !packagingChanged &&
      oldItem?.packagingCompletedAt
        ? oldItem.packagingCompletedAt
        : null;

    const preservedCompletedBy =
      !packagingChanged &&
      oldItem?.packagingCompletedBy
        ? oldItem.packagingCompletedBy
        : null;

    const externalItemCost = (
      item.externalContents || []
    ).reduce(
      (sum, external) =>
        sum +
        Number(external.unitCost || 0) *
          Number(external.quantity || 0),
      0
    );

    const itemCost =
      calculateItemCost(item) + externalItemCost;

    const itemSellPrice = Number(item.sellPrice || 0);
    const itemProfit = itemSellPrice - itemCost;

    const { data: orderItemData, error: orderItemError } =
      await supabase
        .from("order_items")
        .insert({
          order_id: orderId,
          branch_id: existingOrder.branch_id,
          item_name: item.title,
          item_type: item.itemType,
          size: "",
          quantity: 1,
          unit_price: itemSellPrice,
          total_price: itemSellPrice,
          template_id: item.templateId || null,
          title: item.title,
          sell_price: itemSellPrice,
          cost_price: itemCost,
          profit: itemProfit,
          notes: item.notes || null,
          content_value: Number(item.contentValue || 0),

          /*
           * إذا لم تتغير مكونات التجهيز نحافظ على حالة التغليف.
           * إذا تغيرت نعيد هذا البند فقط إلى pending.
           */
          packaging_status: preservedPackagingStatus,
          packaging_completed_at: preservedCompletedAt,
          packaging_completed_by: preservedCompletedBy,
        })
        .select("id")
        .single();

    if (orderItemError) {
      throw orderItemError;
    }

    if (!orderItemData?.id) {
      throw new Error(
        `تعذر حفظ بند الطلب: ${item.title}`
      );
    }

    const {
      data: customItemData,
      error: customItemError,
    } = await supabase
      .from("order_custom_items")
      .insert({
        order_id: orderId,
        item_type: item.itemType,
        template_id: item.templateId || null,
        title: item.title,
        sell_price: itemSellPrice,
        cost_price: itemCost,
        profit: itemProfit,
        notes: item.notes || null,
      })
      .select("id")
      .single();

    if (customItemError) {
      throw customItemError;
    }

    if (!customItemData?.id) {
      throw new Error(
        `تعذر حفظ تفاصيل بند الطلب: ${item.title}`
      );
    }

    /*
     * حفظ مكونات العنصر المرتبطة بالمخزون.
     */
    for (const component of item.components) {
      const quantity = Number(
        component.quantity || 0
      );
      const unitCost = Number(
        component.unitCost || 0
      );
      const unitPrice = Number(
        component.unitPrice || 0
      );

      const totalCost = unitCost * quantity;
      const totalPrice = unitPrice * quantity;

      const { error: componentError } = await supabase
        .from("order_custom_item_components")
        .insert({
          custom_item_id: customItemData.id,
          product_detail_id:
            component.productDetailId || null,
          component_name: component.componentName,
          section: component.section,
          quantity,
          unit_cost: unitCost,
          unit_price: unitPrice,
          total_cost: totalCost,
          total_price: totalPrice,
          is_external: Boolean(component.isExternal),
        });

      if (componentError) {
        throw componentError;
      }
    }

    /*
     * حفظ ألوان غلاف الباقة المختارة فقط.
     * لا يتم خصم أي كمية هنا؛ موظف التغليف يسجل الكمية الفعلية لاحقًا.
     */
    for (const option of item.wrappingOptions || []) {
      const oldWrappingOption =
        !packagingChanged && oldItem
          ? oldItem.wrappingOptions.find(
              (oldOption) =>
                Number(oldOption.product_detail_id || 0) ===
                Number(option.productDetailId || 0)
            )
          : null;

      const { error: wrappingOptionError } = await supabase
        .from("order_item_wrapping_options")
        .insert({
          order_item_id: orderItemData.id,
          product_detail_id: Number(option.productDetailId),
          material_name: option.materialName || "غلاف",
          actual_quantity:
            oldWrappingOption?.actual_quantity ?? null,
          confirmed_at:
            oldWrappingOption?.confirmed_at ?? null,
          confirmed_by:
            oldWrappingOption?.confirmed_by ?? null,
        });

      if (wrappingOptionError) {
        throw wrappingOptionError;
      }
    }

    /*
     * حفظ المحتويات الخارجية.
     */
    for (const external of item.externalContents || []) {
      const quantity = Number(external.quantity || 0);
      const unitCost = Number(external.unitCost || 0);
      const unitSellPrice = Number(
        external.unitSellPrice || 0
      );

      const { error: externalError } = await supabase
        .from("order_item_external_contents")
        .insert({
          order_item_id: orderItemData.id,
          item_name: external.itemName,
          description: external.description || "",
          quantity,
          unit_cost: unitCost,
          unit_sell_price: unitSellPrice,
          supplier_name: external.supplierName || "",
          notes: external.notes || "",
        });

      if (externalError) {
        throw externalError;
      }

      /*
       * نسخة إضافية لنظام عرض وطباعة الطلبات الحالي.
       */
      const { error: legacyExternalError } =
        await supabase
          .from("order_custom_item_components")
          .insert({
            custom_item_id: customItemData.id,
            product_detail_id: null,
            component_name: external.itemName,
            section: "external",
            quantity,
            unit_cost: unitCost,
            unit_price: unitSellPrice,
            total_cost: unitCost * quantity,
            total_price: unitSellPrice * quantity,
            is_external: true,
          });

      if (legacyExternalError) {
        throw legacyExternalError;
      }
    }
  }

  /*
   * خصم مكونات النسخة الجديدة من الطلب.
   */
  for (const [productDetailId, required] of requiredMap) {
    const { data, error } = await supabase
      .from("product_details")
      .select("stock")
      .eq("id", productDetailId)
      .single();

    if (error) {
      throw error;
    }

    const currentStock = Number(data?.stock || 0);
    const newStock =
      currentStock - Number(required.quantity || 0);

    if (newStock < 0) {
      throw new Error(
        `المخزون تغير وأصبح غير كافٍ للمادة: ${required.name}`
      );
    }

    const { error: updateError } = await supabase
      .from("product_details")
      .update({
        stock: newStock,
      })
      .eq("id", productDetailId);

    if (updateError) {
      throw updateError;
    }
  }

  /*
   * تسجيل العملية في سجل النشاط.
   * عدم نجاح السجل لا يمنع نجاح تعديل الطلب.
   */
  const { error: activityError } = await supabase.rpc(
    "log_activity",
    {
      p_action: "update",
      p_entity_type: "orders",
      p_entity_id: String(orderId),
      p_entity_label: String(
        existingOrder.order_number || orderId
      ),
      p_page_name: "new-order",
      p_description: hasPackagingChanges
        ? "تعديل بيانات التجهيز وإعادة الطلب أو البنود المتغيرة إلى واجهة التغليف"
        : "تعديل بيانات إدارية للطلب مع الحفاظ على حالة التغليف",
      p_old_data: null,
      p_new_data: {
        customer,
        payment,
        itemsCount: items.length,
        total: orderTotal,
        status: nextOrderStatus,
        packagingChanged: hasPackagingChanges,
      },
      p_metadata: {},
    }
  );

  if (activityError) {
    console.warn(
      "تعذر تسجيل تعديل الطلب في سجل النشاط:",
      activityError
    );
  }

  return {
    id: orderId,
    orderNumber: String(
      existingOrder.order_number || orderId
    ),
  };
}