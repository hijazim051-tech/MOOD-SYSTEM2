import { supabase } from "./supabase";
import { calculateItemCost } from "./orderBuilder";
import type { ExtendedBuilderItem } from "./newOrderDrafts";

export async function saveReadyProduct(input: {
  name: string;
  imageUrl?: string;
  notes?: string;
  item: ExtendedBuilderItem;
}) {
  const { item } = input;

  if (!input.name.trim()) {
    throw new Error("اكتب اسم الجاهز");
  }

  if (!["bouquet", "box"].includes(item.itemType)) {
    throw new Error("يمكن حفظ باقة أو بوكس فقط كجاهز");
  }

  if (Number(item.sellPrice || 0) <= 0) {
    throw new Error("سعر البيع غير صحيح");
  }

  const requiredMap = new Map<
    number,
    { name: string; quantity: number }
  >();

  for (const component of item.components) {
    if (component.isExternal || !component.productDetailId) continue;

    const id = Number(component.productDetailId);
    const quantity = Number(component.quantity || 0);

    if (quantity <= 0) continue;

    const current = requiredMap.get(id);

    if (current) {
      current.quantity += quantity;
    } else {
      requiredMap.set(id, {
        name: component.componentName,
        quantity,
      });
    }
  }

  for (const [productDetailId, required] of requiredMap) {
    const { data, error } = await supabase
      .from("product_details")
      .select("stock")
      .eq("id", productDetailId)
      .single();

    if (error) throw error;

    const available = Number(data?.stock || 0);

    if (available < required.quantity) {
      throw new Error(
        `المخزون غير كافٍ للمادة: ${required.name}\n` +
          `المطلوب: ${required.quantity}\n` +
          `المتوفر: ${available}`
      );
    }
  }

  const externalCost = (item.externalContents || []).reduce(
    (sum, external) =>
      sum +
      Number(external.unitCost || 0) *
        Number(external.quantity || 0),
    0
  );

  const costPrice = calculateItemCost(item) + externalCost;

  const readyNumber = `RDY-${Date.now()}`;

  const { data: ready, error: readyError } = await supabase
    .from("ready_products")
    .insert({
      ready_number: readyNumber,
      name: input.name.trim(),
      product_type: item.itemType,
      sell_price: Number(item.sellPrice || 0),
      cost_price: costPrice,
      status: "ready",
      image_url: input.imageUrl?.trim() || null,
      notes: input.notes?.trim() || item.notes || null,
    })
    .select("id,ready_number,name")
    .single();

  if (readyError) throw readyError;

  try {
    for (const component of item.components) {
      const quantity = Number(component.quantity || 0);

      if (quantity <= 0) continue;

      const { error } = await supabase
        .from("ready_product_components")
        .insert({
          ready_product_id: ready.id,
          product_detail_id:
            component.productDetailId || null,
          component_name: component.componentName,
          section: component.section,
          quantity,
          unit_cost: Number(component.unitCost || 0),
          unit_price: Number(component.unitPrice || 0),
          is_external: Boolean(component.isExternal),
        });

      if (error) throw error;
    }

    for (const external of item.externalContents || []) {
      const { error } = await supabase
        .from("ready_product_external_contents")
        .insert({
          ready_product_id: ready.id,
          item_name: external.itemName,
          description: external.description || null,
          quantity: Number(external.quantity || 0),
          unit_cost: Number(external.unitCost || 0),
          unit_sell_price: Number(external.unitSellPrice || 0),
          supplier_name: external.supplierName || null,
          notes: external.notes || null,
        });

      if (error) throw error;
    }

    for (const [productDetailId, required] of requiredMap) {
      const { data, error: readError } = await supabase
        .from("product_details")
        .select("stock")
        .eq("id", productDetailId)
        .single();

      if (readError) throw readError;

      const newStock =
        Number(data?.stock || 0) - required.quantity;

      if (newStock < 0) {
        throw new Error(
          `المخزون تغير وأصبح غير كافٍ للمادة: ${required.name}`
        );
      }

      const { error: updateError } = await supabase
        .from("product_details")
        .update({ stock: newStock })
        .eq("id", productDetailId);

      if (updateError) throw updateError;
    }

    const { error: historyError } = await supabase
      .from("ready_product_status_history")
      .insert({
        ready_product_id: ready.id,
        old_status: null,
        new_status: "ready",
        notes: "تم إنتاج الجاهز من صفحة طلب جديد",
      });

    if (historyError) throw historyError;

    return ready;
  } catch (error) {
    await supabase
      .from("ready_products")
      .delete()
      .eq("id", ready.id);

    throw error;
  }
}