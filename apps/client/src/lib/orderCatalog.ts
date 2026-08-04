import { supabase } from "./supabase";

export type BouquetSize = {
  id: string;
  name: string;
  price: number;
  wrappingCount: number;
  ribbonCount: number;
  cardCount: number;
  baseCount: number;
  minFlowers: number;
  maxFlowers: number | null;
};

export type BoxVariant = {
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
};

export type OrderMaterial = {
  id: number;
  productId: number;
  categoryId: number | null;

  name: string;
  color: string;

  stock: number;
  buyPrice: number;
  sellPrice: number;
  averageUnitCost: number;

  inventoryMethod: string;
  materialType: string;

  productName: string;
  categoryName: string;
};

type ProductRow = {
  id: number;
  category_id: number | null;
  name: string | null;
};

type CategoryRow = {
  id: number;
  name: string | null;
};

export async function getBouquetSizes(): Promise<BouquetSize[]> {
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
      max_flowers
    `)
    .eq("is_active", true)
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
  }));
}

export async function getBoxVariants(): Promise<BoxVariant[]> {
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
      card_count
    `)
    .eq("is_active", true)
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
  }));
}

export async function getOrderMaterials(branchId?: string | null): Promise<OrderMaterial[]> {
  const [
    { data: detailsData, error: detailsError },
    { data: productsData, error: productsError },
    { data: categoriesData, error: categoriesError },
    { data: offersData, error: offersError },
    { data: branchStockData, error: branchStockError },
  ] = await Promise.all([
    supabase
      .from("product_details")
      .select("*")
      .order("name", { ascending: true }),

    supabase
      .from("products")
      .select("id, category_id, name"),

    supabase
      .from("categories")
      .select("id, name"),

    supabase
      .from("offers")
      .select("product_detail_id,offer_price,starts_at,ends_at,is_active")
      .eq("is_active", true),

    branchId
      ? supabase
          .from("branch_product_stock")
          .select("product_detail_id,stock,average_unit_cost")
          .eq("branch_id", branchId)
      : supabase
          .from("branch_product_stock")
          .select("product_detail_id,stock,average_unit_cost"),
  ]);

  if (detailsError) throw detailsError;
  if (productsError) throw productsError;
  if (categoriesError) throw categoriesError;
  if (offersError) console.warn("تعذر تحميل العروض:", offersError);
  if (branchStockError) throw new Error("شغّل ملف SQL الخاص بفصل مخزون الفروع أولًا: " + branchStockError.message);

  const branchStockMap = new Map<number, { stock: number; averageUnitCost: number }>();
  for (const row of branchStockData || []) {
    const id = Number((row as any).product_detail_id);
    const current = branchStockMap.get(id) || { stock: 0, averageUnitCost: 0 };
    current.stock += Number((row as any).stock || 0);
    current.averageUnitCost = Number((row as any).average_unit_cost || current.averageUnitCost || 0);
    branchStockMap.set(id, current);
  }

  const products = (productsData || []) as ProductRow[];
  const categories = (categoriesData || []) as CategoryRow[];
  const today = new Date().toISOString().slice(0, 10);
  const activeOfferByDetail = new Map<number, number>();
  for (const offer of offersData || []) {
    const starts = String((offer as any).starts_at || "").slice(0, 10);
    const ends = (offer as any).ends_at ? String((offer as any).ends_at).slice(0, 10) : null;
    if (starts <= today && (!ends || ends >= today)) {
      activeOfferByDetail.set(Number((offer as any).product_detail_id), Number((offer as any).offer_price || 0));
    }
  }

  return (detailsData || []).map((detail: any) => {
    const branchStock = branchStockMap.get(Number(detail.id));
    const product = products.find(
      (entry) => Number(entry.id) === Number(detail.product_id)
    );

    const category = categories.find(
      (entry) =>
        Number(entry.id) === Number(product?.category_id)
    );

    return {
      id: Number(detail.id),
      productId: Number(detail.product_id || 0),
      categoryId:
        product?.category_id === null ||
        product?.category_id === undefined
          ? null
          : Number(product.category_id),

      name: String(detail.name || ""),
      color: String(detail.color || detail.name || ""),

      stock: Number(branchStock?.stock || 0),
      buyPrice: Number(detail.buy_price || 0),

      sellPrice: Number(
        activeOfferByDetail.get(Number(detail.id)) ||
          detail.unit_sell_price ||
          detail.sell_price ||
          0
      ),

      averageUnitCost: Number(
        branchStock?.averageUnitCost || detail.average_unit_cost || 0
      ),

      inventoryMethod: String(
        detail.inventory_method || "normal"
      ),

      materialType: String(
        detail.material_type || "normal"
      ),

      productName: String(product?.name || ""),
      categoryName: String(category?.name || ""),
    };
  });
}

export function getMaterialCost(material: OrderMaterial) {
  if (material.inventoryMethod === "average") {
    return Number(
      material.averageUnitCost ||
        material.buyPrice ||
        0
    );
  }

  return Number(material.buyPrice || 0);
}

export function getMaterialDisplayName(
  material: OrderMaterial
) {
  const parts = [
    material.productName,
    material.color || material.name,
  ].filter(Boolean);

  return Array.from(new Set(parts)).join(" - ");
}

export function isFlowerMaterial(
  material: OrderMaterial
) {
  return material.categoryId === 85;
}

export function isArtificialFlowerMaterial(
  material: OrderMaterial
) {
  return material.categoryId === 86;
}

export function isWrappingMaterial(
  material: OrderMaterial
) {
  return material.categoryId === 87;
}

export function isBoxMaterial(
  material: OrderMaterial
) {
  return material.categoryId === 88;
}

export function isAdditionMaterial(
  material: OrderMaterial
) {
  // كل عناصر فئة الورد الصناعي والإكسسوارات تظهر ضمن إضافات المخزون،
  // سواء كان العنصر وردًا صناعيًا أو إكسسوارًا.
  return material.categoryId === 86;
}