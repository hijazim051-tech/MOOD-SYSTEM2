import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useBranch } from "../context/BranchContext";
import { getBranchStock } from "../lib/branchStock";

type Supplier = { id: string; name: string; phone: string };
type ProductDetail = {
  id: number;
  name: string;
  stock: number;
  buyPrice: number;
  sellPrice: number;
};
type Product = {
  id: number;
  name: string;
  categoryId: string;
  categoryName: string;
  details: ProductDetail[];
};
type Category = { id: string; name: string };
type DraftItem = {
  localId: string;
  productDetailId: number;
  productName: string;
  detailName: string;
  quantity: number;
  unitPurchasePrice: number;
  unitSellPrice: number;
  notes: string;
};
type Invoice = {
  id: string;
  supplierName: string;
  invoiceNo: string;
  invoiceDate: string;
  purchaseMode: string;
  grandTotal: number;
  paidAmount: number;
  remainingAmount: number;
  paymentMethod: string;
  deliveryCost: number;
  otherCosts: number;
  notes: string;
};
type EntryRow = { quantity: string; buy: string; sell: string };

const input =
  "w-full rounded-xl border border-gray-200 bg-white p-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";

export default function Purchases() {
  const { effectiveBranchId, selectedBranch } = useBranch();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  const [supplierId, setSupplierId] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(today());

  const [purchaseMode, setPurchaseMode] =
    useState<"cash" | "credit" | "mixed">("cash");
  const [paymentMethod, setPaymentMethod] =
    useState<"cash" | "bank_transfer">("cash");
  const [paidAmount, setPaidAmount] = useState("");

  const [deliveryCost, setDeliveryCost] = useState("");
  const [otherCosts, setOtherCosts] = useState("");
  const [invoiceNotes, setInvoiceNotes] = useState("");

  const [items, setItems] = useState<DraftItem[]>([]);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);

  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [entryRows, setEntryRows] = useState<Record<number, EntryRow>>({});
  const [quickSearch, setQuickSearch] = useState("");

  const [showNewProduct, setShowNewProduct] = useState(false);
  const [newCategoryId, setNewCategoryId] = useState("");
  const [newProductName, setNewProductName] = useState("");
  const [newDetailName, setNewDetailName] = useState("");
  const [newBuy, setNewBuy] = useState("");
  const [newSell, setNewSell] = useState("");

  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [newSupplierPhone, setNewSupplierPhone] = useState("");

  useEffect(() => {
    void load();
  }, [effectiveBranchId]);

  const selectedSupplier = useMemo(
    () => suppliers.find((x) => x.id === supplierId),
    [suppliers, supplierId],
  );

  const supplierResults = useMemo(() => {
    const q = supplierSearch.trim().toLowerCase();
    return suppliers
      .filter(
        (x) =>
          !q ||
          x.name.toLowerCase().includes(q) ||
          x.phone.includes(q),
      )
      .slice(0, 8);
  }, [suppliers, supplierSearch]);

  const visibleCategories = useMemo(
    () =>
      categories.filter((category) => {
        if (Number(category.id) === 86) return false;
        const name = category.name.trim().toLowerCase();
        return !name.includes("ورد صناعي") && !name.includes("صناعي");
      }),
    [categories],
  );

  const categoryProducts = useMemo(
    () =>
      products.filter(
        (product) => product.categoryId === selectedCategoryId,
      ),
    [products, selectedCategoryId],
  );

  const selectedProduct = useMemo(
    () =>
      products.find((product) => product.id === selectedProductId) ||
      null,
    [products, selectedProductId],
  );

  const quickResults = useMemo(() => {
    const q = quickSearch.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter((product) =>
        `${product.categoryName} ${product.name} ${product.details
          .map((detail) => detail.name)
          .join(" ")}`
          .toLowerCase()
          .includes(q),
      )
      .slice(0, 20);
  }, [products, quickSearch]);

  const flatDetails = useMemo(
    () =>
      products.flatMap((product) =>
        product.details.map((detail) => ({
          ...detail,
          productId: product.id,
          productName: product.name,
          categoryName: product.categoryName,
        })),
      ),
    [products],
  );

  const subtotal = useMemo(
    () =>
      items.reduce(
        (sum, item) =>
          sum + item.quantity * item.unitPurchasePrice,
        0,
      ),
    [items],
  );

  const total =
    subtotal +
    Number(deliveryCost || 0) +
    Number(otherCosts || 0);

  const paid =
    purchaseMode === "credit"
      ? 0
      : purchaseMode === "cash"
        ? total
        : Number(paidAmount || 0);

  const remaining = Math.max(total - paid, 0);

  useEffect(() => {
    if (purchaseMode === "cash") {
      setPaidAmount(String(total || ""));
    } else if (purchaseMode === "credit") {
      setPaidAmount("");
    }
  }, [purchaseMode, total]);

  async function load() {
    setLoading(true);
    try {
      const [supplierResult, categoryResult, productResult, invoiceResult, stock] =
        await Promise.all([
          supabase
            .from("suppliers")
            .select("id,name,phone,branch_id")
            .eq("is_active", true)
            .order("name"),
          supabase
            .from("categories")
            .select("id,name")
            .order("id"),
          supabase
            .from("products")
            .select(
              "id,name,category_id,product_details(id,name,buy_price,sell_price,unit_sell_price)",
            )
            .order("name"),
          supabase
            .from("purchase_invoices")
            .select(
              "id,supplier_name_snapshot,invoice_no,invoice_date,purchase_mode,grand_total,paid_amount,remaining_amount,payment_method,delivery_cost,other_costs,notes,branch_id",
            )
            .order("invoice_date", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(60),
          getBranchStock(effectiveBranchId),
        ]);

      if (supplierResult.error) throw supplierResult.error;
      if (categoryResult.error) throw categoryResult.error;
      if (productResult.error) throw productResult.error;
      if (invoiceResult.error) throw invoiceResult.error;

      const stockMap = new Map(
        stock.map((row) => [row.productDetailId, row.stock]),
      );

      setSuppliers(
        (supplierResult.data || [])
          .filter(
            (row: any) =>
              !effectiveBranchId ||
              String(row.branch_id || "") === effectiveBranchId,
          )
          .map((row: any) => ({
            id: String(row.id),
            name: String(row.name || ""),
            phone: String(row.phone || ""),
          })),
      );

      const categoryRows = (categoryResult.data || []).map(
        (row: any) => ({
          id: String(row.id),
          name: String(row.name || ""),
        }),
      );
      setCategories(categoryRows);

      const categoryMap = new Map(
        categoryRows.map((row) => [row.id, row.name]),
      );

      setProducts(
        (productResult.data || [])
          .filter((row: any) => Number(row.category_id) !== 86)
          .map((row: any) => ({
            id: Number(row.id),
            name: String(row.name || ""),
            categoryId: String(row.category_id || ""),
            categoryName:
              categoryMap.get(String(row.category_id || "")) || "",
            details: (row.product_details || []).map((detail: any) => ({
              id: Number(detail.id),
              name: String(detail.name || ""),
              stock: Number(
                stockMap.get(Number(detail.id)) || 0,
              ),
              buyPrice: Number(detail.buy_price || 0),
              sellPrice: Number(
                detail.unit_sell_price || detail.sell_price || 0,
              ),
            })),
          })),
      );

      setInvoices(
        (invoiceResult.data || [])
          .filter(
            (row: any) =>
              !effectiveBranchId ||
              String(row.branch_id || "") === effectiveBranchId,
          )
          .map((row: any) => ({
            id: String(row.id),
            supplierName: String(
              row.supplier_name_snapshot || "",
            ),
            invoiceNo: String(row.invoice_no || ""),
            invoiceDate: String(row.invoice_date || ""),
            purchaseMode: String(row.purchase_mode || "cash"),
            grandTotal: Number(row.grand_total || 0),
            paidAmount: Number(row.paid_amount || 0),
            remainingAmount: Number(row.remaining_amount || 0),
            paymentMethod: String(row.payment_method || "cash"),
            deliveryCost: Number(row.delivery_cost || 0),
            otherCosts: Number(row.other_costs || 0),
            notes: String(row.notes || ""),
          })),
      );
    } catch (error) {
      alert(msg(error));
    } finally {
      setLoading(false);
    }
  }

  function openCategory(categoryId: string) {
    setSelectedCategoryId(categoryId);
    setSelectedProductId(null);
    setEntryRows({});
    setQuickSearch("");
  }

  function openProduct(product: Product) {
    setSelectedProductId(product.id);
    const next: Record<number, EntryRow> = {};
    for (const detail of product.details) {
      next[detail.id] = {
        quantity: "",
        buy: detail.buyPrice ? String(detail.buyPrice) : "",
        sell: detail.sellPrice ? String(detail.sellPrice) : "",
      };
    }
    setEntryRows(next);
  }

  function updateEntry(
    detailId: number,
    field: keyof EntryRow,
    value: string,
  ) {
    setEntryRows((current) => ({
      ...current,
      [detailId]: {
        quantity: current[detailId]?.quantity || "",
        buy: current[detailId]?.buy || "",
        sell: current[detailId]?.sell || "",
        [field]: value,
      },
    }));
  }

  function addSelectedProductToInvoice() {
    if (!selectedProduct) return;

    const additions: DraftItem[] = [];

    for (const detail of selectedProduct.details) {
      const row = entryRows[detail.id];
      const quantity = Number(row?.quantity || 0);
      if (quantity <= 0) continue;

      const buy = Number(row?.buy || 0);
      const sell = Number(row?.sell || 0);

      if (buy <= 0) {
        alert(`اكتب سعر شراء ${selectedProduct.name} — ${detail.name}`);
        return;
      }
      if (sell <= 0) {
        alert(`اكتب سعر بيع ${selectedProduct.name} — ${detail.name}`);
        return;
      }

      additions.push({
        localId: crypto.randomUUID(),
        productDetailId: detail.id,
        productName: selectedProduct.name,
        detailName: detail.name,
        quantity,
        unitPurchasePrice: buy,
        unitSellPrice: sell,
        notes: "",
      });
    }

    if (additions.length === 0) {
      alert("اكتب كمية في لون/نوع واحد على الأقل");
      return;
    }

    setItems((current) => [...current, ...additions]);
    setEntryRows((current) => {
      const next = { ...current };
      for (const detail of selectedProduct.details) {
        if (next[detail.id]) {
          next[detail.id] = {
            ...next[detail.id],
            quantity: "",
          };
        }
      }
      return next;
    });
  }

  async function createProduct() {
    if (!effectiveBranchId) return alert("اختر فرع");
    if (
      !newCategoryId ||
      !newProductName.trim() ||
      !newDetailName.trim()
    ) {
      return alert("القسم واسم المنتج والتفصيل مطلوبين");
    }

    try {
      const { data: product, error: productError } =
        await supabase
          .from("products")
          .insert({
            category_id: Number(newCategoryId),
            name: newProductName.trim(),
            icon: "📦",
            product_type: "normal",
            has_recipe: false,
          })
          .select("id")
          .single();

      if (productError) throw productError;

      const { data: detail, error: detailError } =
        await supabase
          .from("product_details")
          .insert({
            product_id: product.id,
            name: newDetailName.trim(),
            buy_price: Number(newBuy || 0),
            sell_price: Number(newSell || 0),
            unit_sell_price: Number(newSell || 0),
            average_unit_cost: 0,
            alert_limit: 0,
            is_important: false,
          })
          .select("id")
          .single();

      if (detailError) throw detailError;

      const { error: stockError } = await supabase
        .from("branch_product_stock")
        .upsert(
          {
            branch_id: effectiveBranchId,
            product_detail_id: detail.id,
            stock: 0,
            average_unit_cost: 0,
            alert_limit: 0,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "branch_id,product_detail_id" },
        );

      if (stockError) throw stockError;

      const newProductId = Number(product.id);

      setShowNewProduct(false);
      setNewProductName("");
      setNewDetailName("");
      setNewBuy("");
      setNewSell("");

      await load();

      setSelectedCategoryId(newCategoryId);
      setSelectedProductId(newProductId);

      alert("تم إنشاء المنتج ✅");
    } catch (error) {
      alert(msg(error));
    }
  }

  async function createSupplier() {
    if (!effectiveBranchId) return alert("اختر فرع");
    if (!newSupplierName.trim()) return alert("اسم المورد مطلوب");

    try {
      const { data, error } = await supabase
        .from("suppliers")
        .insert({
          name: newSupplierName.trim(),
          phone: newSupplierPhone.trim(),
          supplier_type: "عام",
          is_active: true,
          branch_id: effectiveBranchId,
        })
        .select("id,name,phone")
        .single();

      if (error) throw error;

      setShowNewSupplier(false);
      setNewSupplierName("");
      setNewSupplierPhone("");
      await load();
      setSupplierId(String(data.id));
      setSupplierSearch(String(data.name));
    } catch (error) {
      alert(msg(error));
    }
  }

  async function save() {
    if (!effectiveBranchId) return alert("اختر فرع محدد");
    if (!selectedSupplier) return alert("اختر المورد");
    if (items.length === 0)
      return alert("أضف منتج واحد على الأقل");
    if (paid < 0 || paid > total)
      return alert("قيمة المدفوع غير صحيحة");

    setSaving(true);

    try {
      const payload = items.map((item) => ({
        itemKind: "product_detail",
        productDetailId: item.productDetailId,
        usagePriceTierId: null,
        productName: item.productName,
        detailName: item.detailName,
        quantity: item.quantity,
        unitPurchasePrice: item.unitPurchasePrice,
        unitSellPrice: item.unitSellPrice,
        notes: item.notes,
      }));

      const functionName = editingInvoiceId
        ? "update_purchase_invoice"
        : "save_purchase_invoice";

      const args: any = {
        p_branch_id: effectiveBranchId,
        p_supplier_id: selectedSupplier.id,
        p_supplier_name: selectedSupplier.name,
        p_invoice_no: invoiceNo.trim(),
        p_invoice_date: invoiceDate,
        p_purchase_mode: purchaseMode,
        p_delivery_cost: Number(deliveryCost || 0),
        p_other_costs: Number(otherCosts || 0),
        p_paid_amount: paid,
        p_payment_method: paymentMethod,
        p_notes: invoiceNotes.trim(),
        p_items: payload,
      };

      if (editingInvoiceId) args.p_invoice_id = editingInvoiceId;

      const { error } = await supabase.rpc(functionName, args);
      if (error) throw error;

      for (const item of items) {
        const { error: updateError } = await supabase
          .from("product_details")
          .update({
            buy_price: item.unitPurchasePrice,
            sell_price: item.unitSellPrice,
            unit_sell_price: item.unitSellPrice,
          })
          .eq("id", item.productDetailId);

        if (updateError) throw updateError;
      }

      const wasEditing = Boolean(editingInvoiceId);
      reset();
      await load();
      alert(
        wasEditing
          ? "تم تعديل الفاتورة والمخزون ✅"
          : "تم حفظ الفاتورة والمخزون ✅",
      );
    } catch (error) {
      alert(msg(error));
    } finally {
      setSaving(false);
    }
  }

  async function editInvoice(invoice: Invoice) {
    try {
      const { data, error } = await supabase
        .from("purchase_invoice_items")
        .select(
          "product_detail_id,item_name_snapshot,detail_name_snapshot,quantity,unit_purchase_price,notes",
        )
        .eq("purchase_invoice_id", invoice.id);

      if (error) throw error;

      setEditingInvoiceId(invoice.id);

      const supplier = suppliers.find(
        (item) => item.name === invoice.supplierName,
      );
      setSupplierId(supplier?.id || "");
      setSupplierSearch(invoice.supplierName);
      setInvoiceNo(invoice.invoiceNo);
      setInvoiceDate(invoice.invoiceDate);
      setPurchaseMode(
        invoice.purchaseMode === "credit" ||
          invoice.purchaseMode === "mixed"
          ? invoice.purchaseMode
          : "cash",
      );
      setPaymentMethod(
        invoice.paymentMethod.includes("bank")
          ? "bank_transfer"
          : "cash",
      );
      setPaidAmount(String(invoice.paidAmount));
      setDeliveryCost(String(invoice.deliveryCost || ""));
      setOtherCosts(String(invoice.otherCosts || ""));
      setInvoiceNotes(invoice.notes || "");

      setItems(
        (data || [])
          .filter((row: any) => row.product_detail_id)
          .map((row: any) => ({
            localId: crypto.randomUUID(),
            productDetailId: Number(row.product_detail_id),
            productName: String(row.item_name_snapshot || ""),
            detailName: String(row.detail_name_snapshot || ""),
            quantity: Number(row.quantity || 0),
            unitPurchasePrice: Number(
              row.unit_purchase_price || 0,
            ),
            unitSellPrice: Number(
              flatDetails.find(
                (detail) =>
                  detail.id === Number(row.product_detail_id),
              )?.sellPrice || 0,
            ),
            notes: String(row.notes || ""),
          })),
      );

      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      alert(msg(error));
    }
  }

  function reset() {
    setEditingInvoiceId(null);
    setSupplierId("");
    setSupplierSearch("");
    setInvoiceNo("");
    setInvoiceDate(today());
    setPurchaseMode("cash");
    setPaymentMethod("cash");
    setPaidAmount("");
    setDeliveryCost("");
    setOtherCosts("");
    setInvoiceNotes("");
    setItems([]);
    setSelectedCategoryId("");
    setSelectedProductId(null);
    setEntryRows({});
    setQuickSearch("");
  }

  if (loading) {
    return (
      <div className="p-8 text-xl font-black">
        جاري تحميل المشتريات...
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-6 p-4 md:p-8">
      <header>
        <h1 className="text-3xl font-black">💰 المشتريات</h1>
        <p className="mt-2 font-bold text-emerald-700">
          الفرع: {selectedBranch?.name || "كل الفروع"}
        </p>
        <p className="mt-1 text-gray-500">
          اختار القسم → المنتج → اكتب كميات الألوان/الأنواع مرة واحدة.
        </p>
      </header>

      {editingInvoiceId && (
        <div className="rounded-xl bg-amber-100 p-4 font-black text-amber-900">
          ✏️ أنت تعدل فاتورة موجودة. عند الحفظ سيُعاد حساب
          المخزون والرصيد.
        </div>
      )}

      <div className="rounded-xl bg-blue-50 p-4 text-sm font-bold text-blue-900">
        الورد الصناعي والتغليف المستهلك للبوكسات يُسجل كمصروف
        تشغيلي، وليس مخزونًا تفصيليًا. البوكس نفسه يبقى في المخزون
        بسعر شراء وسعر بيع نهائي شامل الورد والتغليف بالتقدير.
      </div>

      <section className="rounded-2xl bg-white p-5 shadow">
        <div className="mb-4 flex flex-wrap justify-between gap-2">
          <h2 className="text-xl font-black">
            1. الفاتورة والمورد
          </h2>
          <button
            type="button"
            onClick={() => setShowNewSupplier(true)}
            className="rounded-xl bg-gray-900 px-4 py-2 font-bold text-white"
          >
            + مورد سريع
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="relative">
            <label className="mb-2 block font-bold">المورد</label>
            <input
              value={
                selectedSupplier
                  ? selectedSupplier.name
                  : supplierSearch
              }
              onChange={(event) => {
                setSupplierId("");
                setSupplierSearch(event.target.value);
              }}
              className={input}
              placeholder="ابحث عن المورد"
            />

            {!selectedSupplier && supplierSearch && (
              <div className="absolute z-30 mt-1 max-h-52 w-full overflow-auto rounded-xl border bg-white shadow">
                {supplierResults.map((supplier) => (
                  <button
                    type="button"
                    key={supplier.id}
                    onClick={() => {
                      setSupplierId(supplier.id);
                      setSupplierSearch(supplier.name);
                    }}
                    className="block w-full border-b p-3 text-right hover:bg-emerald-50"
                  >
                    {supplier.name}{" "}
                    <span className="text-xs text-gray-400">
                      {supplier.phone}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <Field label="رقم الفاتورة">
            <input
              className={input}
              value={invoiceNo}
              onChange={(event) =>
                setInvoiceNo(event.target.value)
              }
            />
          </Field>

          <Field label="التاريخ">
            <input
              type="date"
              className={input}
              value={invoiceDate}
              onChange={(event) =>
                setInvoiceDate(event.target.value)
              }
            />
          </Field>

          <Field label="نوع السداد">
            <select
              className={input}
              value={purchaseMode}
              onChange={(event) =>
                setPurchaseMode(event.target.value as typeof purchaseMode)
              }
            >
              <option value="cash">مدفوع كامل</option>
              <option value="mixed">مدفوع جزئي</option>
              <option value="credit">آجل</option>
            </select>
          </Field>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black">
              2. شنو جبت في الفاتورة؟
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              ادخل قسم واحد، سجل الجديد، وبعدها انتقل للقسم الثاني.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setNewCategoryId(selectedCategoryId);
              setShowNewProduct(true);
            }}
            className="rounded-xl bg-emerald-700 px-4 py-2 font-black text-white"
          >
            + منتج جديد غير موجود
          </button>
        </div>

        <div className="mb-5">
          <label className="mb-2 block font-bold">
            🔎 بحث سريع لو تعرف اسم المنتج
          </label>
          <input
            className={input}
            value={quickSearch}
            onChange={(event) =>
              setQuickSearch(event.target.value)
            }
            placeholder="مثال: جوري، ليليوم، بوكس قلب..."
          />
          {quickSearch.trim() && (
            <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {quickResults.map((product) => (
                <button
                  type="button"
                  key={product.id}
                  onClick={() => {
                    setSelectedCategoryId(product.categoryId);
                    openProduct(product);
                  }}
                  className="rounded-xl border p-3 text-right hover:border-emerald-500 hover:bg-emerald-50"
                >
                  <p className="font-black">{product.name}</p>
                  <p className="text-sm text-gray-500">
                    {product.categoryName}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        <p className="mb-3 font-black">اختار القسم:</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleCategories.map((category) => (
            <button
              type="button"
              key={category.id}
              onClick={() => openCategory(category.id)}
              className={`rounded-2xl border-2 p-5 text-right transition ${
                selectedCategoryId === category.id
                  ? "border-emerald-600 bg-emerald-50 text-emerald-900"
                  : "border-gray-100 bg-gray-50 hover:border-emerald-300"
              }`}
            >
              <p className="text-lg font-black">
                {category.name}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {
                  products.filter(
                    (product) =>
                      product.categoryId === category.id,
                  ).length
                }{" "}
                منتج
              </p>
            </button>
          ))}
        </div>

        {selectedCategoryId && !selectedProduct && (
          <div className="mt-6">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-black">
                اختار النوع:
              </h3>
              <button
                type="button"
                onClick={() => setSelectedCategoryId("")}
                className="text-sm font-bold text-gray-500"
              >
                رجوع للأقسام
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {categoryProducts.map((product) => (
                <button
                  type="button"
                  key={product.id}
                  onClick={() => openProduct(product)}
                  className="rounded-2xl border p-4 text-right hover:border-emerald-500 hover:bg-emerald-50"
                >
                  <p className="font-black">{product.name}</p>
                  <p className="mt-2 text-sm text-gray-500">
                    {product.details.length} لون/نوع
                  </p>
                </button>
              ))}

              {categoryProducts.length === 0 && (
                <div className="rounded-xl bg-gray-50 p-5 text-gray-500">
                  ما فيش منتجات في القسم. استعمل زر + منتج جديد.
                </div>
              )}
            </div>
          </div>
        )}

        {selectedProduct && (
          <div className="mt-6 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-emerald-700">
                  {selectedProduct.categoryName}
                </p>
                <h3 className="text-2xl font-black">
                  {selectedProduct.name}
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  اكتب فقط الكمية اللي جبتها قدام كل لون/نوع.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSelectedProductId(null);
                  setEntryRows({});
                }}
                className="rounded-xl border bg-white px-4 py-2 font-bold"
              >
                ← اختار نوع آخر
              </button>
            </div>

            <div className="overflow-x-auto rounded-xl border bg-white">
              <table className="w-full min-w-[760px]">
                <thead className="bg-gray-50">
                  <tr>
                    <Th>اللون / النوع</Th>
                    <Th>المخزون الحالي</Th>
                    <Th>كم جبت؟</Th>
                    <Th>سعر الشراء</Th>
                    <Th>سعر البيع</Th>
                  </tr>
                </thead>
                <tbody>
                  {selectedProduct.details.map((detail) => {
                    const row = entryRows[detail.id] || {
                      quantity: "",
                      buy: "",
                      sell: "",
                    };

                    return (
                      <tr key={detail.id} className="border-t">
                        <Td>
                          <span className="font-black">
                            {detail.name}
                          </span>
                        </Td>
                        <Td>{detail.stock}</Td>
                        <Td>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            className={`${input} min-w-[110px]`}
                            value={row.quantity}
                            onChange={(event) =>
                              updateEntry(
                                detail.id,
                                "quantity",
                                event.target.value,
                              )
                            }
                            placeholder="0"
                          />
                        </Td>
                        <Td>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className={`${input} min-w-[130px]`}
                            value={row.buy}
                            onChange={(event) =>
                              updateEntry(
                                detail.id,
                                "buy",
                                event.target.value,
                              )
                            }
                          />
                        </Td>
                        <Td>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className={`${input} min-w-[130px]`}
                            value={row.sell}
                            onChange={(event) =>
                              updateEntry(
                                detail.id,
                                "sell",
                                event.target.value,
                              )
                            }
                          />
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <button
              type="button"
              onClick={addSelectedProductToInvoice}
              className="mt-4 rounded-xl bg-emerald-700 px-6 py-3 font-black text-white"
            >
              ✓ تم — إضافة الكميات للفاتورة
            </button>
          </div>
        )}

        <div className="mt-6 overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[760px]">
            <thead className="bg-gray-900 text-white">
              <tr>
                <Th>المنتج</Th>
                <Th>الكمية</Th>
                <Th>شراء</Th>
                <Th>بيع</Th>
                <Th>الإجمالي</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.localId} className="border-t">
                  <Td>
                    {item.productName} — {item.detailName}
                  </Td>
                  <Td>{item.quantity}</Td>
                  <Td>{money(item.unitPurchasePrice)}</Td>
                  <Td>{money(item.unitSellPrice)}</Td>
                  <Td>
                    {money(
                      item.quantity * item.unitPurchasePrice,
                    )}
                  </Td>
                  <Td>
                    <button
                      type="button"
                      onClick={() =>
                        setItems((current) =>
                          current.filter(
                            (row) =>
                              row.localId !== item.localId,
                          ),
                        )
                      }
                      className="font-bold text-red-600"
                    >
                      حذف
                    </button>
                  </Td>
                </tr>
              ))}

              {items.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="p-8 text-center text-gray-400"
                  >
                    اختار قسم وابدأ إدخال المشتريات.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow">
        <h2 className="mb-4 text-xl font-black">
          3. السداد والمصاريف
        </h2>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="توصيل المشتريات">
            <input
              type="number"
              className={input}
              value={deliveryCost}
              onChange={(event) =>
                setDeliveryCost(event.target.value)
              }
            />
          </Field>

          <Field label="مصاريف أخرى">
            <input
              type="number"
              className={input}
              value={otherCosts}
              onChange={(event) =>
                setOtherCosts(event.target.value)
              }
            />
          </Field>

          <Field
            label={
              purchaseMode === "mixed"
                ? "طريقة دفع الجزء المدفوع"
                : "طريقة الدفع"
            }
          >
            <select
              className={input}
              value={paymentMethod}
              onChange={(event) =>
                setPaymentMethod(
                  event.target.value as typeof paymentMethod,
                )
              }
              disabled={purchaseMode === "credit"}
            >
              <option value="cash">كاش</option>
              <option value="bank_transfer">مصرف</option>
            </select>
          </Field>

          <Field label="المدفوع">
            <input
              type="number"
              className={input}
              value={
                purchaseMode === "cash"
                  ? String(total || "")
                  : paidAmount
              }
              onChange={(event) =>
                setPaidAmount(event.target.value)
              }
              disabled={purchaseMode !== "mixed"}
            />
          </Field>
        </div>

        <textarea
          className={`${input} mt-4`}
          rows={2}
          value={invoiceNotes}
          onChange={(event) =>
            setInvoiceNotes(event.target.value)
          }
          placeholder="ملاحظات الفاتورة"
        />

        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          <Card label="المنتجات" value={subtotal} />
          <Card label="الإجمالي" value={total} />
          <Card label="المدفوع" value={paid} />
          <Card
            label="المتبقي"
            value={remaining}
            danger={remaining > 0}
          />
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="rounded-xl bg-emerald-700 px-7 py-3 font-black text-white disabled:opacity-50"
          >
            {saving
              ? "جاري الحفظ..."
              : editingInvoiceId
                ? "حفظ تعديل الفاتورة"
                : "حفظ فاتورة المشتريات"}
          </button>
          <button
            type="button"
            onClick={reset}
            className="rounded-xl border px-6 py-3 font-bold"
          >
            فاتورة جديدة
          </button>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow">
        <h2 className="mb-4 text-xl font-black">
          آخر الفواتير
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px]">
            <thead className="bg-emerald-700 text-white">
              <tr>
                <Th>التاريخ</Th>
                <Th>المورد</Th>
                <Th>الفاتورة</Th>
                <Th>الإجمالي</Th>
                <Th>المدفوع</Th>
                <Th>المتبقي</Th>
                <Th>الدفع</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id} className="border-b">
                  <Td>{invoice.invoiceDate}</Td>
                  <Td>{invoice.supplierName}</Td>
                  <Td>{invoice.invoiceNo || "—"}</Td>
                  <Td>{money(invoice.grandTotal)}</Td>
                  <Td>{money(invoice.paidAmount)}</Td>
                  <Td>{money(invoice.remainingAmount)}</Td>
                  <Td>
                    {invoice.paymentMethod.includes("bank")
                      ? "مصرف"
                      : "كاش"}
                  </Td>
                  <Td>
                    <button
                      type="button"
                      onClick={() => void editInvoice(invoice)}
                      className="rounded-lg bg-blue-100 px-3 py-2 font-bold text-blue-700"
                    >
                      تعديل
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {showNewProduct && (
        <Modal
          title="إضافة منتج جديد من داخل المشتريات"
          close={() => setShowNewProduct(false)}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <select
              className={input}
              value={newCategoryId}
              onChange={(event) =>
                setNewCategoryId(event.target.value)
              }
            >
              <option value="">اختار القسم</option>
              {visibleCategories.map((category) => (
                <option
                  key={category.id}
                  value={category.id}
                >
                  {category.name}
                </option>
              ))}
            </select>

            <input
              className={input}
              value={newProductName}
              onChange={(event) =>
                setNewProductName(event.target.value)
              }
              placeholder="اسم المنتج — مثال: جوري / بوكس قلب"
            />

            <input
              className={input}
              value={newDetailName}
              onChange={(event) =>
                setNewDetailName(event.target.value)
              }
              placeholder="اللون / الحجم / النوع"
            />

            <input
              type="number"
              className={input}
              value={newBuy}
              onChange={(event) =>
                setNewBuy(event.target.value)
              }
              placeholder="سعر الشراء"
            />

            <input
              type="number"
              className={input}
              value={newSell}
              onChange={(event) =>
                setNewSell(event.target.value)
              }
              placeholder="سعر البيع"
            />
          </div>

          <button
            type="button"
            onClick={() => void createProduct()}
            className="mt-4 rounded-xl bg-emerald-700 px-6 py-3 font-black text-white"
          >
            إنشاء المنتج
          </button>
        </Modal>
      )}

      {showNewSupplier && (
        <Modal
          title="إضافة مورد سريع"
          close={() => setShowNewSupplier(false)}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <input
              className={input}
              value={newSupplierName}
              onChange={(event) =>
                setNewSupplierName(event.target.value)
              }
              placeholder="اسم المورد"
            />
            <input
              className={input}
              value={newSupplierPhone}
              onChange={(event) =>
                setNewSupplierPhone(event.target.value)
              }
              placeholder="الهاتف"
            />
          </div>

          <button
            type="button"
            onClick={() => void createSupplier()}
            className="mt-4 rounded-xl bg-gray-900 px-6 py-3 font-black text-white"
          >
            حفظ المورد
          </button>
        </Modal>
      )}
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
    <label>
      <span className="mb-2 block font-bold">{label}</span>
      {children}
    </label>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return <th className="p-3 text-right">{children}</th>;
}

function Td({ children }: { children?: React.ReactNode }) {
  return <td className="p-3">{children}</td>;
}

function Card({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-4 ${
        danger ? "bg-red-50 text-red-700" : "bg-gray-50"
      }`}
    >
      <p className="text-sm">{label}</p>
      <p className="mt-1 text-xl font-black">
        {money(value)}
      </p>
    </div>
  );
}

function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/45 p-4"
      dir="rtl"
    >
      <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex justify-between">
          <h2 className="text-2xl font-black">{title}</h2>
          <button
            type="button"
            onClick={close}
            className="text-2xl"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function money(value: number) {
  return `${Number(value || 0).toFixed(2)} د.ل`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function msg(error: unknown) {
  return error instanceof Error
    ? error.message
    : typeof error === "object" &&
        error &&
        "message" in error
      ? String((error as { message: unknown }).message)
      : "حدث خطأ غير متوقع";
}
