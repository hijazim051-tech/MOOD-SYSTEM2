import { useEffect, useMemo, useState } from "react";
import {
  addRecipeItem,
  createRecipe,
  deleteRecipeItem,
  getProductDetailsOptions,
  getRecipeItems,
  getRecipes,
  type ProductDetailOption,
  type Recipe,
  type RecipeItem,
} from "../../lib/recipes";

type Props = {
  product: any;
  onClose: () => void;
};

export default function RecipeBuilderModal({ product, onClose }: Props) {
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [items, setItems] = useState<RecipeItem[]>([]);
  const [materials, setMaterials] = useState<ProductDetailOption[]>([]);
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);

    try {
      const [recipes, materialsData] = await Promise.all([
        getRecipes(),
        getProductDetailsOptions(),
      ]);

      let currentRecipe = recipes.find((r) => r.name === product.name) || null;

      if (!currentRecipe) {
        await createRecipe({
          name: product.name,
          type: product.productType || "custom",
          sellPrice: product.details?.[0]?.sellPrice || 0,
        });

        const freshRecipes = await getRecipes();
        currentRecipe = freshRecipes.find((r) => r.name === product.name) || null;
      }

      setRecipe(currentRecipe);
      setMaterials(materialsData);

      if (currentRecipe) {
        const recipeItems = await getRecipeItems(currentRecipe.id);
        setItems(recipeItems);
      }
    } catch (error: any) {
      alert(error.message);
    }

    setLoading(false);
  }

  async function handleAddItem() {
    if (!recipe || !selectedMaterialId || !quantity) {
      alert("اختر المادة واكتب الكمية");
      return;
    }

    try {
      await addRecipeItem({
        recipeId: recipe.id,
        productDetailId: Number(selectedMaterialId),
        quantity: Number(quantity),
      });

      setSelectedMaterialId("");
      setQuantity("");
      await loadData();
    } catch (error: any) {
      alert(error.message);
    }
  }

  async function handleDeleteItem(itemId: string) {
    if (!confirm("هل تريد حذف هذا المكون؟")) return;

    try {
      await deleteRecipeItem(itemId);
      await loadData();
    } catch (error: any) {
      alert(error.message);
    }
  }

  const totalCost = useMemo(() => {
    return items.reduce((sum, item) => {
      const buyPrice = Number(item.product_details?.buy_price || 0);
      return sum + buyPrice * Number(item.quantity || 0);
    }, 0);
  }, [items]);

  const sellPrice = Number(recipe?.sell_price || 0);
  const profit = sellPrice - totalCost;

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="rounded-2xl bg-white p-8 text-xl font-bold">
          جاري تحميل الوصفة...
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-5xl rounded-2xl bg-white p-6 shadow-2xl" dir="rtl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">🧩 إدارة وصفة المنتج</h2>
            <p className="mt-1 text-gray-500">المنتج: {product.name}</p>
          </div>

          <button onClick={onClose} className="rounded-lg bg-red-100 px-3 py-2 text-red-700">
            ✕
          </button>
        </div>

        <div className="mb-6 rounded-2xl border p-4">
          <h3 className="mb-4 text-xl font-bold">إضافة مكون</h3>

          <div className="grid grid-cols-3 gap-4">
            <select
              value={selectedMaterialId}
              onChange={(e) => setSelectedMaterialId(e.target.value)}
              className="rounded-xl border p-3"
            >
              <option value="">اختر المادة</option>
              {materials.map((material) => (
                <option key={material.id} value={material.id}>
                  {material.name} - مخزون {material.stock}
                </option>
              ))}
            </select>

            <input
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              type="number"
              className="rounded-xl border p-3"
              placeholder="الكمية"
            />

            <button
              onClick={handleAddItem}
              className="rounded-xl bg-emerald-700 px-5 py-3 font-semibold text-white"
            >
              إضافة
            </button>
          </div>
        </div>

        <div className="mb-6 rounded-2xl border p-4">
          <h3 className="mb-4 text-xl font-bold">مكونات الوصفة</h3>

          <table className="w-full">
            <thead className="bg-emerald-700 text-white">
              <tr>
                <th className="p-3 text-right">المادة</th>
                <th className="p-3 text-right">الكمية</th>
                <th className="p-3 text-right">تكلفة الوحدة</th>
                <th className="p-3 text-right">الإجمالي</th>
                <th className="p-3 text-right">حذف</th>
              </tr>
            </thead>

            <tbody>
              {items.map((item) => {
                const buyPrice = Number(item.product_details?.buy_price || 0);
                const itemTotal = buyPrice * Number(item.quantity || 0);

                return (
                  <tr key={item.id} className="border-b">
                    <td className="p-3">{item.product_details?.name || "-"}</td>
                    <td className="p-3">{item.quantity}</td>
                    <td className="p-3">{buyPrice} د.ل</td>
                    <td className="p-3 font-semibold">{itemTotal} د.ل</td>
                    <td className="p-3">
                      <button
                        onClick={() => handleDeleteItem(item.id)}
                        className="rounded-lg bg-red-100 px-3 py-1 text-red-700"
                      >
                        حذف
                      </button>
                    </td>
                  </tr>
                );
              })}

              {items.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-gray-500">
                    لا توجد مكونات بعد
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-2xl bg-gray-100 p-5">
            <p className="text-gray-500">تكلفة الوصفة</p>
            <p className="mt-2 text-2xl font-bold">{totalCost.toFixed(2)} د.ل</p>
          </div>

          <div className="rounded-2xl bg-emerald-50 p-5">
            <p className="text-gray-500">سعر البيع</p>
            <p className="mt-2 text-2xl font-bold text-emerald-700">
              {sellPrice.toFixed(2)} د.ل
            </p>
          </div>

          <div className="rounded-2xl bg-purple-50 p-5">
            <p className="text-gray-500">الربح المتوقع</p>
            <p className="mt-2 text-2xl font-bold text-purple-700">
              {profit.toFixed(2)} د.ل
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}