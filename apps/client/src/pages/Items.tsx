import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { moveToTrash } from "../lib/trash";
import { logActivity } from "../lib/activityLog";
import { useBranch } from "../context/BranchContext";
import { adjustBranchStock, getBranchStock } from "../lib/branchStock";
type SectionKey =
  | "natural"
  | "boxes"
  | "artificial"
  | "wrapping"
  | "additions";

type ArtificialKind = "flower" | "accessory";

type ProductDetail = {
  id: number;
  productId: number;
  name: string;
  color: string;
  stock: number;
  buyPrice: number;
  sellPrice: number;
  alertLimit: number;
  isImportant: boolean;
  materialType: string;
};

type Product = {
  id: number;
  categoryId: number;
  name: string;
  icon: string;
  productType: string;
  details: ProductDetail[];
};

type ProductForm = {
  id: number | null;
  name: string;
  icon: string;
};

type DetailForm = {
  id: number | null;
  name: string;
  stock: number;
  buyPrice: number;
  sellPrice: number;
  alertLimit: number;
  isImportant: boolean;
};

const sections: Array<{
  key: SectionKey;
  title: string;
  icon: string;
  description: string;
  categoryId: number;
}> = [
  {
    key: "natural",
    title: "ورد طبيعي",
    icon: "🌹",
    description: "أنواع الورد الطبيعي والألوان المتوفرة",
    categoryId: 85,
  },
  {
    key: "boxes",
    title: "بوكسات",
    icon: "📦",
    description: "أنواع البوكسات، وكل بوكس داخله أحجامه",
    categoryId: 88,
  },
  {
    key: "artificial",
    title: "ورد صناعي",
    icon: "🌸",
    description: "ورد صناعي وإكسسوارات ورد مثل الفروع والأوراق",
    categoryId: 86,
  },
  {
    key: "wrapping",
    title: "ورق تغليف",
    icon: "🎀",
    description: "ألوان ورق التغليف والكميات المتوفرة",
    categoryId: 87,
  },
  {
    key: "additions",
    title: "إضافات",
    icon: "✨",
    description: "قماش، شرائط، كروت، لؤلؤ وأي إضافة أخرى",
    categoryId: 89, 
  },
];

const emptyProductForm: ProductForm = {
  id: null,
  name: "",
  icon: "",
};

const emptyDetailForm: DetailForm = {
  id: null,
  name: "",
  stock: 0,
  buyPrice: 0,
  sellPrice: 0,
  alertLimit: 0,
  isImportant: false,
};

export default function Items() {
  const { effectiveBranchId, selectedBranch } = useBranch();
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedSection, setSelectedSection] =
    useState<SectionKey | null>(null);
  const [selectedProductId, setSelectedProductId] =
    useState<number | null>(null);

  const [productForm, setProductForm] =
    useState<ProductForm>({ ...emptyProductForm });
  const [detailForm, setDetailForm] =
    useState<DetailForm>({ ...emptyDetailForm });

  const [artificialKind, setArtificialKind] =
    useState<ArtificialKind>("flower");

  const [showProductForm, setShowProductForm] = useState(false);
  const [showDetailForm, setShowDetailForm] = useState(false);

  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadProducts();
  }, [effectiveBranchId]);

  async function loadProducts() {
    setLoading(true);

    try {
      const [{ data, error }, branchRows] = await Promise.all([
        supabase
          .from("products")
          .select(`
            id,
            category_id,
            name,
            icon,
            product_type,
            product_details (
              id,
              product_id,
              name,
              buy_price,
              sell_price,
              alert_limit,
              is_important
            )
          `)
          .order("name", { ascending: true }),
        getBranchStock(effectiveBranchId),
      ]);

      if (error) throw error;
      const branchStockMap = new Map(branchRows.map((row) => [row.productDetailId, row]));

      const formatted: Product[] = (data || []).map((product: any) => ({
        id: Number(product.id),
        categoryId: Number(product.category_id || 0),
        name: String(product.name || ""),
        icon: String(product.icon || ""),
        productType: String(product.product_type || "normal"),
        details: (product.product_details || []).map((detail: any) => ({
          id: Number(detail.id),
          productId: Number(detail.product_id || product.id),
          name: String(detail.name || ""),
          color: String(detail.name || ""),
          stock: Number(branchStockMap.get(Number(detail.id))?.stock || 0),
          buyPrice: Number(detail.buy_price || 0),
          sellPrice: Number(detail.sell_price || 0),
          alertLimit: Number(branchStockMap.get(Number(detail.id))?.alertLimit ?? detail.alert_limit ?? 0),
          isImportant: Boolean(detail.is_important),
          materialType: "",
        })),
      }));

      setProducts(formatted);
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  const currentSection = useMemo(
    () => sections.find((section) => section.key === selectedSection) || null,
    [selectedSection]
  );

  const sectionProducts = useMemo(() => {
    if (!selectedSection || !currentSection) return [];

    return products
      .filter((product) => belongsToSection(product, selectedSection))
      .filter((product) =>
        product.name.toLowerCase().includes(search.trim().toLowerCase())
      );
  }, [products, selectedSection, currentSection, search]);

  const selectedProduct = useMemo(
    () =>
      products.find((product) => product.id === selectedProductId) || null,
    [products, selectedProductId]
  );

  const stats = useMemo(() => {
    const allDetails = products.flatMap((product) => product.details);

    return {
      products: products.length,
      details: allDetails.length,
      lowStock: allDetails.filter(
        (detail) => detail.alertLimit > 0 && detail.stock <= detail.alertLimit
      ).length,
      outOfStock: allDetails.filter((detail) => detail.stock <= 0).length,
    };
  }, [products]);

  function openSection(section: SectionKey) {
    setSelectedSection(section);
    setSelectedProductId(null);
    setSearch("");
  }

  function goBack() {
    if (selectedProductId !== null) {
      setSelectedProductId(null);
      return;
    }

    setSelectedSection(null);
    setSearch("");
  }

  function openAddProduct() {
    setProductForm({ ...emptyProductForm });
    setArtificialKind("flower");
    setShowProductForm(true);
  }

  function openEditProduct(product: Product) {
    setProductForm({
      id: product.id,
      name: product.name,
      icon: product.icon,
    });

    if (product.productType === "artificial_accessory") {
      setArtificialKind("accessory");
    } else {
      setArtificialKind("flower");
    }

    setShowProductForm(true);
  }

  async function saveProduct() {
    if (!currentSection) return;

    if (!productForm.name.trim()) {
      alert("اكتب اسم المنتج");
      return;
    }

    setSaving(true);

    try {
      const productType =
        currentSection.key === "artificial"
          ? artificialKind === "flower"
            ? "artificial_flower"
            : "artificial_accessory"
          : getProductType(currentSection.key);

      const payload = {
        category_id: currentSection.categoryId,
        name: productForm.name.trim(),
        icon: productForm.icon.trim() || currentSection.icon,
        product_type: productType,
        has_recipe: false,
      };

      if (productForm.id) {
        const oldProduct = products.find(
          (product) => product.id === productForm.id
        );

        const { error } = await supabase
          .from("products")
          .update(payload)
          .eq("id", productForm.id);

        if (error) throw error;

        await logActivity({
          action: "update",
          entityType: "product",
          entityId: productForm.id,
          entityLabel: payload.name,
          pageName: "إدارة المنتجات",
          description: `تم تعديل المنتج ${payload.name}`,
          oldData: oldProduct ?? null,
          newData: {
            id: productForm.id,
            ...payload,
          },
          notifyOwner: true,
        });
      } else {
        const { data: insertedProduct, error } = await supabase
          .from("products")
          .insert(payload)
          .select("id")
          .single();

        if (error) throw error;

        // للورد الصناعي وإكسسواراته ننشئ تفصيلًا داخليًا مخفيًا تلقائيًا.
        // الموظف لن يختاره في المشتريات، لكنه ضروري لحفظ المخزون والأسعار.
        if (currentSection.key === "artificial") {
          const { error: detailError } = await supabase
            .from("product_details")
            .insert({
              product_id: insertedProduct.id,
              name: productForm.name.trim(),
              stock: 0,
              alert_limit: 0,
              is_important: false,
              average_unit_cost: 0,
            });

          if (detailError) throw detailError;
        }

        await logActivity({
          action: "create",
          entityType: "product",
          entityId: insertedProduct.id,
          entityLabel: payload.name,
          pageName: "إدارة المنتجات",
          description: `تم إنشاء المنتج ${payload.name}`,
          newData: {
            id: insertedProduct.id,
            ...payload,
          },
          notifyOwner: true,
        });
      }

      setShowProductForm(false);
      setProductForm({ ...emptyProductForm });
      await loadProducts();
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function deleteProduct(product: Product) {
    if (!confirm(`هل تريد حذف ${product.name} وكل تفاصيله؟`)) return;

    try {
      await moveToTrash({
        table: "products",
        id: product.id,
        label: product.name,
        related: [
          { table: "product_details", column: "product_id", value: product.id },
        ],
      });

      await supabase
        .from("product_details")
        .delete()
        .eq("product_id", product.id);

      const { error } = await supabase
        .from("products")
        .delete()
        .eq("id", product.id);

      if (error) throw error;

      await logActivity({
        action: "delete",
        entityType: "product",
        entityId: product.id,
        entityLabel: product.name,
        pageName: "إدارة المنتجات",
        description: `تم نقل المنتج ${product.name} إلى سلة المحذوفات`,
        oldData: product,
        notifyOwner: true,
      });

      setSelectedProductId(null);
      await loadProducts();
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    }
  }

  function openAddDetail() {
    setDetailForm({ ...emptyDetailForm });
    setShowDetailForm(true);
  }

  function openEditDetail(detail: ProductDetail) {
    setDetailForm({
      id: detail.id,
      name: detail.color || detail.name,
      stock: detail.stock,
      buyPrice: detail.buyPrice,
      sellPrice: detail.sellPrice,
      alertLimit: detail.alertLimit,
      isImportant: detail.isImportant,
    });
    setShowDetailForm(true);
  }

  async function saveDetail() {
    if (!selectedProduct || !selectedSection) return;

    if (!detailForm.name.trim()) {
      alert(`اكتب ${getDetailLabel(selectedSection)}`);
      return;
    }

    setSaving(true);

    try {
      const payload = {
        product_id: selectedProduct.id,
        name: detailForm.name.trim(),
        buy_price: Number(detailForm.buyPrice || 0),
        sell_price: Number(detailForm.sellPrice || 0),
        unit_sell_price: Number(detailForm.sellPrice || 0),
        alert_limit: Number(detailForm.alertLimit || 0),
        is_important: detailForm.isImportant,

        ...(detailForm.id
          ? {}
          : {
              buy_price: 0,
              sell_price: 0,
              unit_sell_price: 0,
              average_unit_cost: 0,
            }),
      };

      if (detailForm.id) {
        const oldDetail = selectedProduct.details.find(
          (detail) => detail.id === detailForm.id
        );

        const { error } = await supabase
          .from("product_details")
          .update(payload)
          .eq("id", detailForm.id);

        if (error) throw error;

        if (!effectiveBranchId) throw new Error("اختر فرعًا محددًا قبل تعديل المخزون");
        const oldStock = Number(oldDetail?.stock || 0);
        const newStock = Number(detailForm.stock || 0);
        const difference = newStock - oldStock;
        if (difference !== 0) {
          await adjustBranchStock({
            branchId: effectiveBranchId,
            productDetailId: detailForm.id,
            quantityChange: difference,
            movementType: "manual_adjustment",
            referenceType: "product_detail",
            referenceId: detailForm.id,
            notes: `تعديل مخزون من إدارة المنتجات (${selectedBranch?.name || "الفرع"})`,
          });
        }

        await logActivity({
          action: "update",
          entityType: "product_detail",
          entityId: detailForm.id,
          entityLabel: `${selectedProduct.name} - ${payload.name}`,
          pageName: "إدارة المنتجات",
          description: `تم تعديل تفاصيل ومخزون ${selectedProduct.name}`,
          oldData: oldDetail ?? null,
          newData: {
            id: detailForm.id,
            ...payload,
          },
          notifyOwner: true,
        });
      } else {
        const { data: insertedDetail, error } = await supabase
          .from("product_details")
          .insert(payload)
          .select("id")
          .single();

        if (error) throw error;

        if (!effectiveBranchId) throw new Error("اختر فرعًا محددًا قبل إضافة مخزون");
        const initialStock = Number(detailForm.stock || 0);
        if (initialStock !== 0) {
          await adjustBranchStock({
            branchId: effectiveBranchId,
            productDetailId: Number(insertedDetail.id),
            quantityChange: initialStock,
            movementType: "opening_balance",
            referenceType: "product_detail",
            referenceId: insertedDetail.id,
            notes: `رصيد افتتاحي من إدارة المنتجات (${selectedBranch?.name || "الفرع"})`,
          });
        }

        await logActivity({
          action: "create",
          entityType: "product_detail",
          entityId: insertedDetail.id,
          entityLabel: `${selectedProduct.name} - ${payload.name}`,
          pageName: "إدارة المنتجات",
          description: `تمت إضافة ${getDetailLabel(selectedSection)} جديد للمنتج ${selectedProduct.name}`,
          newData: {
            id: insertedDetail.id,
            ...payload,
          },
          notifyOwner: true,
        });
      }

      setShowDetailForm(false);
      setDetailForm({ ...emptyDetailForm });
      await loadProducts();
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }


  if (loading) {
    return (
      <div className="p-8 text-2xl font-bold text-gray-700">
        جاري تحميل المنتجات...
      </div>
    );
  }

  return (
    <div className="space-y-7 p-8" dir="rtl">
      <div>
        <h1 className="text-4xl font-bold">إدارة المنتجات</h1>
        <p className="mt-1 text-gray-500">
          تعريف الأصناف وتنظيم المخزون وأسعار الشراء والبيع
        </p>
        <p className="mt-2 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-700">
          المخزون المعروض: {selectedBranch?.name || "كل الفروع — اختر فرعًا للتعديل"}
        </p>
      </div>

      {!selectedSection && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="المنتجات" value={stats.products} />
            <StatCard label="الألوان والأحجام" value={stats.details} />
            <StatCard label="مخزون منخفض" value={stats.lowStock} />
            <StatCard label="نافد من المخزون" value={stats.outOfStock} />
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-5">
            {sections.map((section) => {
              const count = products.filter((product) =>
                belongsToSection(product, section.key)
              ).length;

              return (
                <button
                  key={section.key}
                  type="button"
                  onClick={() => openSection(section.key)}
                  className="rounded-3xl border-2 border-transparent bg-white p-7 text-right shadow transition hover:-translate-y-1 hover:border-emerald-600"
                >
                  <div className="text-5xl">{section.icon}</div>
                  <h2 className="mt-4 text-2xl font-bold">{section.title}</h2>
                  <p className="mt-2 min-h-12 text-sm text-gray-500">
                    {section.description}
                  </p>
                  <p className="mt-4 font-semibold text-emerald-700">
                    {count} منتج
                  </p>
                </button>
              );
            })}
          </div>
        </>
      )}

      {selectedSection && !selectedProduct && currentSection && (
        <>
          <button
            type="button"
            onClick={goBack}
            className="rounded-xl bg-gray-100 px-5 py-3 font-semibold"
          >
            رجوع لإدارة المنتجات
          </button>

          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <div className="text-5xl">{currentSection.icon}</div>
              <h2 className="mt-3 text-3xl font-bold">{currentSection.title}</h2>
              <p className="mt-1 text-gray-500">{currentSection.description}</p>
            </div>

            <button
              type="button"
              onClick={openAddProduct}
              className="rounded-xl bg-emerald-700 px-6 py-3 font-bold text-white"
            >
              ➕ إضافة منتج
            </button>
          </div>

          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full rounded-xl border bg-white p-3 shadow"
            placeholder="بحث داخل القسم..."
          />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sectionProducts.map((product) => {
              const totalStock = product.details.reduce(
                (total, detail) => total + detail.stock,
                0
              );

              const lowCount = product.details.filter(
                (detail) => detail.alertLimit > 0 && detail.stock <= detail.alertLimit
              ).length;

              return (
                <div
                  key={product.id}
                  className="rounded-2xl bg-white p-5 shadow"
                >
                  <button
                    type="button"
                    onClick={() => setSelectedProductId(product.id)}
                    className="w-full text-right"
                  >
                    <div className="text-4xl">
                      {product.icon || currentSection.icon}
                    </div>
                    <h3 className="mt-3 text-xl font-bold">{product.name}</h3>

                    {selectedSection === "artificial" && (
                      <p className="mt-2 text-sm text-gray-500">
                        {product.productType === "artificial_accessory"
                          ? "إكسسوار ورد / فروع"
                          : "ورد صناعي"}
                      </p>
                    )}

                    <p className="mt-2 text-emerald-700">
                      المخزون: {totalStock}
                    </p>

                    {lowCount > 0 && (
                      <p className="mt-2 font-semibold text-red-600">
                        {lowCount} تنبيه مخزون
                      </p>
                    )}
                  </button>

                  <div className="mt-5 flex gap-2">
                    <button
                      type="button"
                      onClick={() => openEditProduct(product)}
                      className="flex-1 rounded-lg bg-blue-100 px-3 py-2 text-blue-700"
                    >
                      تعديل
                    </button>

                    <button
                      type="button"
                      onClick={() => deleteProduct(product)}
                      className="flex-1 rounded-lg bg-red-100 px-3 py-2 text-red-700"
                    >
                      حذف
                    </button>
                  </div>
                </div>
              );
            })}

            {sectionProducts.length === 0 && (
              <div className="rounded-2xl bg-white p-10 text-center text-gray-500 shadow md:col-span-2 xl:col-span-3">
                لا توجد منتجات في هذا القسم.
              </div>
            )}
          </div>
        </>
      )}

      {selectedProduct && selectedSection && (
        <>
          <button
            type="button"
            onClick={goBack}
            className="rounded-xl bg-gray-100 px-5 py-3 font-semibold"
          >
            رجوع إلى {currentSection?.title}
          </button>

          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <div className="text-5xl">
                {selectedProduct.icon || currentSection?.icon}
              </div>
              <h2 className="mt-3 text-3xl font-bold">
                {selectedProduct.name}
              </h2>
              <p className="mt-1 text-gray-500">
                {selectedSection === "artificial"
                  ? "المخزون الحالي لهذا الصنف"
                  : selectedSection === "boxes"
                  ? "الأحجام الموجودة داخل هذا البوكس"
                  : `${getDetailPlural(selectedSection)} والمخزون الحالي`}
              </p>
            </div>

            {selectedSection !== "artificial" && (
              <button
                type="button"
                onClick={openAddDetail}
                className="rounded-xl bg-emerald-700 px-6 py-3 font-bold text-white"
              >
                ➕ إضافة {getDetailLabel(selectedSection)}
              </button>
            )}
          </div>

          <div className="overflow-x-auto rounded-2xl bg-white p-5 shadow">
            <table className="w-full min-w-[700px]">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-3 text-right">
                    {selectedSection === "artificial"
                      ? "الصنف"
                      : getDetailLabel(selectedSection)}
                  </th>
                  <th className="p-3 text-right">المخزون</th>
                  <th className="p-3 text-right">آخر سعر شراء</th>
                  <th className="p-3 text-right">سعر البيع</th>
                  <th className="p-3 text-right">حد التنبيه</th>
                  <th className="p-3 text-right">الحالة</th>
                  <th className="p-3 text-right">الإجراء</th>
                </tr>
              </thead>

              <tbody>
                {selectedProduct.details.map((detail) => {
                  const low = detail.stock <= detail.alertLimit;

                  return (
                    <tr key={detail.id} className="border-b">
                      <td className="p-3 font-semibold">
                        {detail.isImportant ? "⭐ " : ""}
                        {selectedSection === "artificial"
                          ? selectedProduct.name
                          : detail.color || detail.name}
                      </td>

                      <td className="p-3">{detail.stock}</td>
                      <td className="p-3">
                        {detail.buyPrice.toFixed(2)} د.ل
                      </td>
                      <td className="p-3 font-semibold text-emerald-700">
                        {detail.sellPrice.toFixed(2)} د.ل
                      </td>
                      <td className="p-3">{detail.alertLimit}</td>

                      <td className="p-3">
                        <span
                          className={`rounded-full px-3 py-1 text-sm font-semibold ${
                            detail.stock <= 0
                              ? "bg-red-100 text-red-700"
                              : low
                              ? "bg-orange-100 text-orange-700"
                              : "bg-green-100 text-green-700"
                          }`}
                        >
                          {detail.stock <= 0
                            ? "نافد"
                            : low
                            ? "منخفض"
                            : "متوفر"}
                        </span>
                      </td>

                      <td className="p-3">
                        <button
                          type="button"
                          onClick={() => openEditDetail(detail)}
                          className="rounded-lg bg-blue-100 px-3 py-2 text-blue-700"
                        >
                          تعديل
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {selectedProduct.details.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="p-10 text-center text-gray-500"
                    >
                      لا يوجد سجل مخزون لهذا المنتج.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showProductForm && currentSection && (
        <Modal
          title={productForm.id ? "تعديل المنتج" : "إضافة منتج"}
          onClose={() => setShowProductForm(false)}
        >
          <Field label="اسم المنتج">
            <input
              value={productForm.name}
              onChange={(event) =>
                setProductForm((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              className="w-full rounded-xl border p-3"
              placeholder={
                selectedSection === "boxes"
                  ? "مثال: بوكس أكريلك دائري"
                  : selectedSection === "artificial"
                  ? "مثال: ورد صناعي أو فرع أخضر"
                  : "اسم المنتج"
              }
            />
          </Field>

          {selectedSection === "artificial" && (
            <Field label="نوع المنتج">
              <select
                value={artificialKind}
                onChange={(event) =>
                  setArtificialKind(event.target.value as ArtificialKind)
                }
                className="w-full rounded-xl border p-3"
              >
                <option value="flower">ورد صناعي</option>
                <option value="accessory">إكسسوار ورد / فروع</option>
              </select>
            </Field>
          )}

          <Field label="الأيقونة">
            <input
              value={productForm.icon}
              onChange={(event) =>
                setProductForm((current) => ({
                  ...current,
                  icon: event.target.value,
                }))
              }
              className="w-full rounded-xl border p-3"
              placeholder={currentSection.icon}
            />
          </Field>

          <button
            type="button"
            onClick={saveProduct}
            disabled={saving}
            className="w-full rounded-xl bg-emerald-700 p-3 font-bold text-white disabled:opacity-50"
          >
            {saving ? "جاري الحفظ..." : "حفظ"}
          </button>
        </Modal>
      )}

      {showDetailForm && selectedSection && (
        <Modal
          title={
            selectedSection === "artificial"
              ? "تعديل المخزون"
              : detailForm.id
              ? `تعديل ${getDetailLabel(selectedSection)}`
              : `إضافة ${getDetailLabel(selectedSection)}`
          }
          onClose={() => setShowDetailForm(false)}
        >
          {selectedSection !== "artificial" && (
            <Field label={getDetailLabel(selectedSection)}>
              <input
                value={detailForm.name}
                onChange={(event) =>
                  setDetailForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                className="w-full rounded-xl border p-3"
                placeholder={getDetailPlaceholder(selectedSection)}
              />
            </Field>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="المخزون الحالي">
              <input
                type="number"
                min="0"
                value={detailForm.stock}
                onChange={(event) =>
                  setDetailForm((current) => ({
                    ...current,
                    stock: Number(event.target.value || 0),
                    name:
                      selectedSection === "artificial" && selectedProduct
                        ? selectedProduct.name
                        : current.name,
                  }))
                }
                className="w-full rounded-xl border p-3"
              />
            </Field>

            <Field label="حد التنبيه">
              <input
                type="number"
                min="0"
                value={detailForm.alertLimit}
                onChange={(event) =>
                  setDetailForm((current) => ({
                    ...current,
                    alertLimit: Number(event.target.value || 0),
                  }))
                }
                className="w-full rounded-xl border p-3"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="آخر سعر شراء">
              <input
                type="number"
                min="0"
                step="0.01"
                value={detailForm.buyPrice}
                onChange={(event) =>
                  setDetailForm((current) => ({
                    ...current,
                    buyPrice: Number(event.target.value || 0),
                  }))
                }
                className="w-full rounded-xl border p-3"
              />
            </Field>

            <Field label="سعر البيع">
              <input
                type="number"
                min="0"
                step="0.01"
                value={detailForm.sellPrice}
                onChange={(event) =>
                  setDetailForm((current) => ({
                    ...current,
                    sellPrice: Number(event.target.value || 0),
                  }))
                }
                className="w-full rounded-xl border p-3"
              />
            </Field>
          </div>

          <label className="flex items-center gap-3 rounded-xl border p-3">
            <input
              type="checkbox"
              checked={detailForm.isImportant}
              onChange={(event) =>
                setDetailForm((current) => ({
                  ...current,
                  isImportant: event.target.checked,
                }))
              }
            />
            صنف مهم
          </label>

          <button
            type="button"
            onClick={saveDetail}
            disabled={saving}
            className="w-full rounded-xl bg-emerald-700 p-3 font-bold text-white disabled:opacity-50"
          >
            {saving ? "جاري الحفظ..." : "حفظ"}
          </button>
        </Modal>
      )}
    </div>
  );
}

function belongsToSection(product: Product, section: SectionKey) {
  const productType = String(product.productType || "")
    .trim()
    .toLowerCase();

  if (section === "natural") {
    return productType === "natural_flower" || product.categoryId === 85;
  }

  if (section === "boxes") {
    return productType === "box" || product.categoryId === 88;
  }

  if (section === "wrapping") {
    return productType === "wrapping" || product.categoryId === 87;
  }

  if (section === "artificial") {
    return (
      productType === "artificial_flower" ||
      productType === "artificial_accessory"
    );
  }

  if (section === "additions") {
    return productType === "addition";
  }

  return false;
}

function getProductType(section: SectionKey) {
  const values: Record<SectionKey, string> = {
    natural: "natural_flower",
    boxes: "box",
    artificial: "artificial_flower",
    wrapping: "wrapping",
    additions: "addition",
  };

  return values[section];
}

function getDetailLabel(section: SectionKey) {
  const values: Record<SectionKey, string> = {
    natural: "لون",
    boxes: "حجم",
    artificial: "صنف",
    wrapping: "لون",
    additions: "نوع / تفصيل",
  };

  return values[section];
}

function getDetailPlural(section: SectionKey) {
  const values: Record<SectionKey, string> = {
    natural: "ألوان",
    boxes: "أحجام",
    artificial: "أصناف",
    wrapping: "ألوان",
    additions: "تفاصيل",
  };

  return values[section];
}

function getDetailPlaceholder(section: SectionKey) {
  const values: Record<SectionKey, string> = {
    natural: "مثال: أحمر",
    boxes: "مثال: وسط",
    artificial: "اسم الصنف",
    wrapping: "مثال: أسود",
    additions: "مثال: قماش وردي",
  };

  return values[section];
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow">
      <p className="text-gray-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-emerald-700">
        {value}
      </p>
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        className="w-full max-w-2xl space-y-5 rounded-2xl bg-white p-6 shadow-2xl"
        dir="rtl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">{title}</h2>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-red-100 px-4 py-2 text-red-700"
          >
            ✕
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 block font-semibold">{label}</label>
      {children}
    </div>
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error
  ) {
    return String((error as { message: unknown }).message);
  }

  return "حدث خطأ غير متوقع";
}