import { useEffect, useState } from "react";

import {
  createRecipe,
  getRecipes,
  type Recipe,
} from "../lib/recipes";

export default function Recipes() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [type, setType] = useState("bouquet");
  const [sellPrice, setSellPrice] = useState("");

  useEffect(() => {
    loadRecipes();
  }, []);

  async function loadRecipes() {
    setLoading(true);

    try {
      const data = await getRecipes();
      setRecipes(data);
    } catch (error: any) {
      alert(error.message);
    }

    setLoading(false);
  }

  async function handleCreateRecipe() {
    if (!name || !type || !sellPrice) {
      alert("عبّي اسم الوصفة والنوع وسعر البيع");
      return;
    }

    try {
      await createRecipe({
        name,
        type,
        sellPrice: Number(sellPrice),
      });

      setName("");
      setType("bouquet");
      setSellPrice("");

      await loadRecipes();

      alert("تم إنشاء الوصفة");
    } catch (error: any) {
      alert(error.message);
    }
  }

  return (
    <div className="p-8" dir="rtl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold">إدارة الوصفات</h1>
        <p className="mt-1 text-gray-500">
          إنشاء وصفات الباقات والبوكسات والسلال والتغليف
        </p>
      </div>

      <div className="mb-8 rounded-2xl bg-white p-6 shadow">
        <h2 className="mb-5 text-2xl font-bold">إضافة وصفة جديدة</h2>

        <div className="grid grid-cols-4 gap-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-xl border p-3"
            placeholder="اسم الوصفة"
          />

          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded-xl border p-3"
          >
            <option value="bouquet">باقة</option>
            <option value="box">بوكس</option>
            <option value="basket">سلة</option>
            <option value="vase">فازة</option>
            <option value="wrapping">تغليف</option>
            <option value="custom">تصميم خاص</option>
          </select>

          <input
            value={sellPrice}
            onChange={(e) => setSellPrice(e.target.value)}
            type="number"
            className="rounded-xl border p-3"
            placeholder="سعر البيع"
          />

          <button
            onClick={handleCreateRecipe}
            className="rounded-xl bg-emerald-700 px-5 py-3 font-semibold text-white"
          >
            إضافة وصفة
          </button>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow">
        <h2 className="mb-5 text-2xl font-bold">قائمة الوصفات</h2>

        {loading ? (
          <div className="p-8 text-center text-gray-500">
            جاري تحميل الوصفات...
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-emerald-700 text-white">
              <tr>
                <th className="p-4 text-right">الاسم</th>
                <th className="p-4 text-right">النوع</th>
                <th className="p-4 text-right">سعر البيع</th>
                <th className="p-4 text-right">الحالة</th>
                <th className="p-4 text-right">العمليات</th>
              </tr>
            </thead>

            <tbody>
              {recipes.map((recipe) => (
                <tr key={recipe.id} className="border-b">
                  <td className="p-4 font-semibold">{recipe.name}</td>
                  <td className="p-4">{recipe.type}</td>
                  <td className="p-4">{recipe.sell_price} د.ل</td>
                  <td className="p-4">
                    {recipe.is_active ? (
                      <span className="rounded-full bg-green-100 px-3 py-1 text-green-700">
                        نشطة
                      </span>
                    ) : (
                      <span className="rounded-full bg-red-100 px-3 py-1 text-red-700">
                        معطلة
                      </span>
                    )}
                  </td>
                  <td className="p-4">
                    <button className="rounded-lg bg-purple-100 px-3 py-1 text-purple-700">
                      إدارة المكونات
                    </button>
                  </td>
                </tr>
              ))}

              {recipes.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-500">
                    لا توجد وصفات بعد
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}