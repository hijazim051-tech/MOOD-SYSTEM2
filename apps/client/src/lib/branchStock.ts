import { supabase } from "./supabase";

export type BranchStockRow = {
  branchId: string;
  productDetailId: number;
  stock: number;
  alertLimit: number;
  averageUnitCost: number;
};

export async function getBranchStock(branchId: string | null) {
  let query = supabase
    .from("branch_product_stock")
    .select("branch_id,product_detail_id,stock,alert_limit,average_unit_cost");

  if (branchId) query = query.eq("branch_id", branchId);

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map((row: any): BranchStockRow => ({
    branchId: String(row.branch_id),
    productDetailId: Number(row.product_detail_id),
    stock: Number(row.stock || 0),
    alertLimit: Number(row.alert_limit || 0),
    averageUnitCost: Number(row.average_unit_cost || 0),
  }));
}

export async function adjustBranchStock(input: {
  branchId: string;
  productDetailId: number;
  quantityChange: number;
  movementType: string;
  referenceType?: string;
  referenceId?: string | number;
  notes?: string;
}) {
  const { data, error } = await supabase.rpc("adjust_branch_stock", {
    p_branch_id: input.branchId,
    p_product_detail_id: input.productDetailId,
    p_quantity_change: input.quantityChange,
    p_movement_type: input.movementType,
    p_reference_type: input.referenceType || null,
    p_reference_id: input.referenceId == null ? null : String(input.referenceId),
    p_notes: input.notes || null,
  });
  if (error) throw error;
  return Number(data || 0);
}

export async function transferBranchStock(input: {
  fromBranchId: string;
  toBranchId: string;
  productDetailId: number;
  quantity: number;
  notes?: string;
}) {
  const { data, error } = await supabase.rpc("transfer_stock_between_branches", {
    p_from_branch_id: input.fromBranchId,
    p_to_branch_id: input.toBranchId,
    p_product_detail_id: input.productDetailId,
    p_quantity: input.quantity,
    p_notes: input.notes || null,
  });
  if (error) throw error;
  return String(data || "");
}

export async function transferOrderToBranch(input: {
  orderId: number;
  toBranchId: string;
  reason?: string;
}) {
  const { error } = await supabase.rpc("transfer_order_to_branch", {
    p_order_id: input.orderId,
    p_to_branch_id: input.toBranchId,
    p_reason: input.reason || null,
  });
  if (error) throw error;
}
