import { supabase } from "./supabase";

export type BouquetSizeSetting = {
  id: string;
  name: string;
  price: number;
  wrappingCount: number;
  ribbonCount: number;
  cardCount: number;
  baseCount: number;
  minFlowers: number;
  maxFlowers: number | null;
  isActive: boolean;
};

export type BoxVariantSetting = {
  id: string;
  productDetailId: number | null;
  boxType: string;
  size: string;
  price: number;
  flowersCount: number;
  accessoriesCount: number;
  wrappingCount: number;
  ribbonCount: number;
  cardCount: number;
  isActive: boolean;
};

export type SaveBouquetSizeInput = Omit<BouquetSizeSetting, "id"> & {
  id?: string;
};

export type SaveBoxVariantInput = Omit<BoxVariantSetting, "id"> & {
  id?: string;
};

export async function loadBouquetSizeSettings(): Promise<
  BouquetSizeSetting[]
> {
  const { data, error } = await supabase
    .from("bouquet_sizes")
    .select(`
      id,
      name,
      price,
      wrapping_count,
      ribbon_count,
      card_count,
      base_count,
      min_flowers,
      max_flowers,
      is_active
    `)
    .order("min_flowers", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data || []).map((row: any) => ({
    id: String(row.id),
    name: String(row.name || ""),
    price: Number(row.price || 0),
    wrappingCount: Number(row.wrapping_count || 0),
    ribbonCount: Number(row.ribbon_count || 0),
    cardCount: Number(row.card_count || 0),
    baseCount: Number(row.base_count || 0),
    minFlowers: Number(row.min_flowers || 0),
    maxFlowers:
      row.max_flowers === null ||
      row.max_flowers === undefined
        ? null
        : Number(row.max_flowers),
    isActive: Boolean(row.is_active),
  }));
}

export async function saveBouquetSizeSetting(
  input: SaveBouquetSizeInput
) {
  const minFlowers = Math.max(0, Number(input.minFlowers || 0));
  const maxFlowers =
    input.maxFlowers === null ||
    input.maxFlowers === undefined ||
    Number(input.maxFlowers) === 0
      ? null
      : Math.max(0, Number(input.maxFlowers));

  const payload = {
    name: input.name.trim(),
    price: Number(input.price || 0),
    wrapping_count: Number(input.wrappingCount || 0),
    ribbon_count: Number(input.ribbonCount || 0),
    card_count: Number(input.cardCount || 0),
    base_count: Number(input.baseCount || 0),
    min_flowers: minFlowers,
    max_flowers: maxFlowers,
    is_active: Boolean(input.isActive),
  };

  if (!payload.name) {
    throw new Error("اكتب اسم حجم الباقة");
  }

  if (payload.min_flowers <= 0) {
    throw new Error("أقل عدد ورد يجب أن يكون 1 أو أكثر");
  }

  if (
    payload.max_flowers !== null &&
    payload.max_flowers < payload.min_flowers
  ) {
    throw new Error(
      "أعلى عدد ورد يجب أن يكون أكبر من أو يساوي أقل عدد ورد"
    );
  }

  if (input.id) {
    const { error } = await supabase
      .from("bouquet_sizes")
      .update(payload)
      .eq("id", input.id);

    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from("bouquet_sizes")
    .insert(payload);

  if (error) throw error;
}

export async function deleteBouquetSizeSetting(id: string) {
  const { error } = await supabase
    .from("bouquet_sizes")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

export async function loadBoxVariantSettings(): Promise<
  BoxVariantSetting[]
> {
  const { data, error } = await supabase
    .from("box_variants")
    .select(`
      id,
      product_detail_id,
      box_type,
      size,
      price,
      flowers_count,
      accessories_count,
      wrapping_count,
      ribbon_count,
      card_count,
      is_active
    `)
    .order("box_type", { ascending: true })
    .order("size", { ascending: true });

  if (error) throw error;

  return (data || []).map((row: any) => ({
    id: String(row.id),
    productDetailId:
      row.product_detail_id === null ||
      row.product_detail_id === undefined
        ? null
        : Number(row.product_detail_id),
    boxType: String(row.box_type || ""),
    size: String(row.size || ""),
    price: Number(row.price || 0),
    flowersCount: Number(row.flowers_count || 0),
    accessoriesCount: Number(row.accessories_count || 0),
    wrappingCount: Number(row.wrapping_count || 0),
    ribbonCount: Number(row.ribbon_count || 0),
    cardCount: Number(row.card_count || 0),
    isActive: Boolean(row.is_active),
  }));
}

export async function saveBoxVariantSetting(
  input: SaveBoxVariantInput
) {
  const payload = {
    product_detail_id: input.productDetailId,
    box_type: input.boxType.trim(),
    size: input.size.trim(),
    price: Number(input.price || 0),
    flowers_count: Number(input.flowersCount || 0),
    accessories_count: Number(input.accessoriesCount || 0),
    wrapping_count: Number(input.wrappingCount || 0),
    ribbon_count: Number(input.ribbonCount || 0),
    card_count: Number(input.cardCount || 0),
    is_active: Boolean(input.isActive),
  };

  if (!payload.box_type) {
    throw new Error("اكتب نوع البوكس");
  }

  if (!payload.size) {
    throw new Error("اكتب حجم البوكس");
  }

  if (input.id) {
    const { error } = await supabase
      .from("box_variants")
      .update(payload)
      .eq("id", input.id);

    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from("box_variants")
    .insert(payload);

  if (error) throw error;
}

export async function deleteBoxVariantSetting(id: string) {
  const { error } = await supabase
    .from("box_variants")
    .delete()
    .eq("id", id);

  if (error) throw error;
}
