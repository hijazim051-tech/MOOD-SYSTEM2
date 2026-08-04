import { supabase } from "./supabase";

export type ReadyProductStatus =
  | "ready"
  | "reserved"
  | "sold"
  | "cancelled";

export type ReadyProductType = "bouquet" | "box";

export type ReadyProduct = {
  id: string;
  readyNumber: string;
  name: string;
  productType: ReadyProductType;
  sellPrice: number;
  status: ReadyProductStatus;
  imageUrl: string;
  notes: string;
  createdAt: string;
  soldAt: string | null;
  cancelledAt: string | null;
};

export type ReadySaleInput = {
  readyProductId: string;
  customerName?: string;
  customerPhone?: string;
  paymentMethod: string;
  cashAmount?: number;
  bankAmount?: number;
  transferAmount?: number;
  depositAmount?: number;
  discount?: number;
};

export async function loadReadyProducts(): Promise<ReadyProduct[]> {
  const { data, error } = await supabase
    .from("ready_products")
    .select(`
      id,
      ready_number,
      name,
      product_type,
      sell_price,
      status,
      image_url,
      notes,
      created_at,
      sold_at,
      cancelled_at
    `)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data || []).map((row: any) => ({
    id: String(row.id),
    readyNumber: String(row.ready_number || ""),
    name: String(row.name || ""),
    productType: String(row.product_type || "bouquet") as ReadyProductType,
    sellPrice: Number(row.sell_price || 0),
    status: String(row.status || "ready") as ReadyProductStatus,
    imageUrl: String(row.image_url || ""),
    notes: String(row.notes || ""),
    createdAt: String(row.created_at || ""),
    soldAt: row.sold_at ? String(row.sold_at) : null,
    cancelledAt: row.cancelled_at ? String(row.cancelled_at) : null,
  }));
}

export async function reserveReadyProduct(
  readyProductId: string,
  notes = ""
) {
  const { error } = await supabase.rpc("reserve_ready_product", {
    p_ready_product_id: readyProductId,
    p_notes: notes || null,
  });

  if (error) throw error;
}

export async function unreserveReadyProduct(
  readyProductId: string,
  notes = ""
) {
  const { error } = await supabase.rpc("unreserve_ready_product", {
    p_ready_product_id: readyProductId,
    p_notes: notes || null,
  });

  if (error) throw error;
}

export async function cancelReadyProduct(
  readyProductId: string,
  notes = ""
) {
  const { error } = await supabase.rpc("cancel_ready_product", {
    p_ready_product_id: readyProductId,
    p_notes: notes || null,
  });

  if (error) throw error;
}

export async function sellReadyProduct(input: ReadySaleInput) {
  const { data: ready, error: readyError } = await supabase
    .from("ready_products")
    .select("id,ready_number,name,product_type,sell_price,cost_price,status")
    .eq("id", input.readyProductId)
    .single();

  if (readyError) throw readyError;

  if (!ready) {
    throw new Error("الجاهز غير موجود");
  }

  if (!["ready", "reserved"].includes(String(ready.status))) {
    throw new Error("لا يمكن بيع هذا الجاهز في حالته الحالية");
  }

  const sellPrice = Number(ready.sell_price || 0);
  const costPrice = Number(ready.cost_price || 0);
  const discount = Math.max(0, Number(input.discount || 0));
  const total = Math.max(0, sellPrice - discount);

  const cashAmount = Number(input.cashAmount || 0);
  const bankAmount = Number(input.bankAmount || 0);
  const transferAmount = Number(input.transferAmount || 0);
  const depositAmount = Number(input.depositAmount || 0);
  const paidAmount =
    cashAmount + bankAmount + transferAmount + depositAmount;

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      order_number: `ORD-${Date.now()}`,
      customer_name: input.customerName?.trim() || "عميل نقدي",
      customer_phone: input.customerPhone?.trim() || "",
      products_total: sellPrice,
      cost_total: costPrice,
      profit: sellPrice - costPrice - discount,
      delivery_fee: 0,
      discount,
      paid_amount: paidAmount,
      remaining_amount: total - paidAmount,
      payment_method: input.paymentMethod || "cash",
      cash_amount: cashAmount,
      bank_amount: bankAmount,
      transfer_amount: transferAmount,
      deposit_amount: depositAmount,
      delivery_paid_cash: false,
      delivery_payment_method: "none",
      delivery_status: "none",
      shop_income: total,
      delivery_cash_expense: 0,
      total,
      status: "delivered",
      notes: `بيع جاهز ${ready.ready_number} - ${ready.name}`,
    })
    .select("id,order_number")
    .single();

  if (orderError) throw orderError;

  const { data: orderItem, error: itemError } = await supabase
    .from("order_items")
    .insert({
      order_id: order.id,
      item_name: ready.name,
      item_type: ready.product_type,
      size: "",
      quantity: 1,
      unit_price: sellPrice,
      total_price: sellPrice,
      template_id: null,
      title: ready.name,
      sell_price: sellPrice,
      cost_price: costPrice,
      profit: sellPrice - costPrice - discount,
      notes: `تم البيع من صفحة الجاهزات`,
      content_value: 0,
      packaging_status: "completed",
      packaging_completed_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (itemError) throw itemError;

  const { error: updateError } = await supabase
    .from("ready_products")
    .update({
      status: "sold",
      sold_at: new Date().toISOString(),
      sold_order_id: order.id,
    })
    .eq("id", ready.id);

  if (updateError) throw updateError;

  const { error: historyError } = await supabase
    .from("ready_product_status_history")
    .insert({
      ready_product_id: ready.id,
      old_status: ready.status,
      new_status: "sold",
      notes: `تم البيع عبر الطلب ${order.order_number}`,
    });

  if (historyError) throw historyError;

  return {
    orderId: Number(order.id),
    orderNumber: String(order.order_number || ""),
    orderItemId: Number(orderItem.id),
  };
}