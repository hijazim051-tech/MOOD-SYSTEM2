import { supabase } from "./supabase";

export type Recipe = {
  id: string;
  name: string;
  type: string;
  sell_price: number;
  is_active: boolean;
};

export type RecipeItem = {
  id: string;
  recipe_id: string;
  product_detail_id: number;
  quantity: number;
  product_details?: {
    name: string;
    buy_price: number;
    sell_price: number;
    stock: number;
  } | null;
};

export type ProductDetailOption = {
  id: number;
  name: string;
  buy_price: number;
  sell_price: number;
  stock: number;
};

export async function getRecipes() {
  const { data, error } = await supabase
    .from("production_recipes")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []) as Recipe[];
}

export async function getProductDetailsOptions() {
  const { data, error } = await supabase
    .from("product_details")
    .select("id, name, buy_price, sell_price, stock")
    .order("name", { ascending: true });

  if (error) throw error;
  return (data || []) as ProductDetailOption[];
}

export async function getRecipeItems(recipeId: string) {
  const { data, error } = await supabase
    .from("production_recipe_items")
    .select(`
      id,
      recipe_id,
      product_detail_id,
      quantity,
      product_details (
        name,
        buy_price,
        sell_price,
        stock
      )
    `)
    .eq("recipe_id", recipeId);

  if (error) throw error;

  return (data || []).map((item: any) => ({
    ...item,
    product_details: Array.isArray(item.product_details)
      ? item.product_details[0] ?? null
      : item.product_details,
  })) as RecipeItem[];
}

export async function createRecipe(input: {
  name: string;
  type: string;
  sellPrice: number;
}) {
  const { error } = await supabase.from("production_recipes").insert({
    name: input.name,
    type: input.type,
    sell_price: input.sellPrice,
    is_active: true,
  });

  if (error) throw error;
}

export async function addRecipeItem(input: {
  recipeId: string;
  productDetailId: number;
  quantity: number;
}) {
  const { error } = await supabase.from("production_recipe_items").insert({
    recipe_id: input.recipeId,
    product_detail_id: input.productDetailId,
    quantity: input.quantity,
  });

  if (error) throw error;
}

export async function deleteRecipeItem(itemId: string) {
  const { error } = await supabase
    .from("production_recipe_items")
    .delete()
    .eq("id", itemId);

  if (error) throw error;
}