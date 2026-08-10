import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useBranch } from "../context/BranchContext";
import { getBranchStock } from "../lib/branchStock";

type Supplier = {
  id: string;
  name: string;
  phone: string;
  city: string;
  address: string;
  supplierType: string;
};

type ProductDetail = {
  id: number;
  name: string;
  stock: number;
  buyPrice: number;
  sellPrice: number;
  averageUnitCost: number;
};

type Product = {
  id: number;
  name: string;
  productType: string;
  details: ProductDetail[];
};

type Category = {
  id: string;
  name: string;
  products: Product[];
};

type UsagePriceTier = {
  id: string;
  usagePrice: number;
  purchaseMin: number;
  purchaseMax: number | null;
  stock: number;
  averageUnitCost: number;
  alertLimit: number;
  sortOrder: number;
};

type DraftItem = {
  localId: string;
  itemKind: "product_detail" | "usage_price_tier";
  productDetailId: number | null;
  usagePriceTierId: string | null;
  productName: string;
  detailName: string;
  quantity: number;
  unitPurchasePrice: number;
  unitSellPrice: number;
  notes: string;
};

type PurchaseInvoice = {
  id: string;
  supplierName: string;
  invoiceNo: string;
  invoiceDate: string;
  purchaseMode: string;
  itemsSubtotal: number;
  deliveryCost: number;
  otherCosts: number;
  grandTotal: number;
  paidAmount: number;
  remainingAmount: number;
  paymentMethod: string;
};

const inputClass =
  "w-full rounded-xl border border-gray-200 bg-white p-3 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";

export default function Purchases() {
  const { effectiveBranchId, selectedBranch } = useBranch();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [usagePriceTiers, setUsagePriceTiers] = useState<UsagePriceTier[]>([]);
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSupplierDialog, setShowSupplierDialog] = useState(false);

  const [supplierId, setSupplierId] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [purchaseMode, setPurchaseMode] =
    useState<"cash" | "credit" | "mixed">("cash");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [deliveryCost, setDeliveryCost] = useState("");
  const [otherCosts, setOtherCosts] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [invoiceNotes, setInvoiceNotes] = useState("");

  const [itemKind, setItemKind] =
    useState<"product_detail" | "usage_price_tier">("product_detail");
  const [categoryId, setCategoryId] = useState("");
  const [productId, setProductId] = useState("");
  const [productDetailId, setProductDetailId] = useState("");
  const [itemQuantity, setItemQuantity] = useState("");
  const [itemPurchasePrice, setItemPurchasePrice] = useState("");
  const [itemSellPrice, setItemSellPrice] = useState("");
  const [itemNotes, setItemNotes] = useState("");
  const [manualUsagePriceTierId, setManualUsagePriceTierId] = useState("");
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [editingTierId, setEditingTierId] = useState("");
  const [tierUsagePrice, setTierUsagePrice] = useState("");
  const [tierPurchaseMin, setTierPurchaseMin] = useState("");
  const [tierPurchaseMax, setTierPurchaseMax] = useState("");
  const [tierAlertLimit, setTierAlertLimit] = useState("5");
  const [savingTier, setSavingTier] = useState(false);

  useEffect(() => {
    void loadData();
  }, [effectiveBranchId]);

  const selectedSupplier = useMemo(
    () => suppliers.find((supplier) => supplier.id === supplierId),
    [suppliers, supplierId]
  );

  const filteredSuppliers = useMemo(() => {
    const search = supplierSearch.trim().toLowerCase();
    if (!search) return suppliers.slice(0, 8);

    return suppliers
      .filter(
        (supplier) =>
          supplier.name.toLowerCase().includes(search) ||
          supplier.phone.toLowerCase().includes(search)
      )
      .slice(0, 8);
  }, [suppliers, supplierSearch]);

  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === categoryId),
    [categories, categoryId]
  );

  const selectedProduct = useMemo(
    () =>
      selectedCategory?.products.find(
        (product) => String(product.id) === productId
      ),
    [selectedCategory, productId]
  );

  const selectedProductDetail = useMemo(
    () =>
      selectedProduct?.details.find(
        (detail) => String(detail.id) === productDetailId
      ),
    [selectedProduct, productDetailId]
  );

  useEffect(() => {
    if (!selectedProductDetail || itemKind !== "product_detail") {
      return;
    }

    setItemPurchasePrice(
      selectedProductDetail.buyPrice > 0
        ? String(selectedProductDetail.buyPrice)
        : ""
    );

    setItemSellPrice(
      selectedProductDetail.sellPrice > 0
        ? String(selectedProductDetail.sellPrice)
        : ""
    );
  }, [selectedProductDetail, itemKind]);

  

  const selectedUsagePriceTier = useMemo(
    () =>
      usagePriceTiers.find((tier) => tier.id === manualUsagePriceTierId) || null,
    [usagePriceTiers, manualUsagePriceTierId]
  );

  const itemsSubtotal = useMemo(
    () =>
      draftItems.reduce(
        (sum, item) => sum + item.quantity * item.unitPurchasePrice,
        0
      ),
    [draftItems]
  );

  const grandTotal = useMemo(
    () =>
      itemsSubtotal +
      Number(deliveryCost || 0) +
      Number(otherCosts || 0),
    [itemsSubtotal, deliveryCost, otherCosts]
  );

  const paid = Number(paidAmount || 0);
  const remaining = Math.max(grandTotal - paid, 0);

  useEffect(() => {
    if (purchaseMode === "cash") {
      setPaidAmount(grandTotal > 0 ? String(grandTotal) : "");
    }

    if (purchaseMode === "credit") {
      setPaidAmount("");
    }
  }, [purchaseMode, grandTotal]);

  async function loadData() {
    setLoading(true);

    try {
      const [
        suppliersResult,
        categoriesResult,
        tiersResult,
        invoicesResult,
        branchRows,
      ] = await Promise.all([
        supabase
          .from("suppliers")
          .select("id,name,phone,city,address,supplier_type,branch_id")
          .eq("is_active", true)
          .order("name"),

        supabase
          .from("categories")
          .select(`
            id,
            name,
            products (
              id,
              name,
              product_type,
              product_details (
                id,
                name,
                stock,
                buy_price,
                sell_price,
                average_unit_cost
              )
            )
          `)
          .order("id"),

        supabase
          .from("usage_price_tiers")
          .select(`
            id,
            usage_price,
            purchase_min,
            purchase_max,
            stock,
            average_unit_cost,
            alert_limit,
            sort_order,
            branch_id
          `)
          .eq("is_active", true)
          .order("sort_order"),

        supabase
          .from("purchase_invoices")
          .select(`
            id,
            supplier_name_snapshot,
            invoice_no,
            invoice_date,
            purchase_mode,
            items_subtotal,
            delivery_cost,
            other_costs,
            grand_total,
            paid_amount,
            remaining_amount,
            payment_method,
            branch_id
          `)
          .order("invoice_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(50),
        getBranchStock(effectiveBranchId),
      ]);

      if (suppliersResult.error) throw suppliersResult.error;
      if (categoriesResult.error) throw categoriesResult.error;
      if (tiersResult.error) throw tiersResult.error;
      if (invoicesResult.error) throw invoicesResult.error;

      const stockMap = new Map(branchRows.map((row) => [row.productDetailId, row]));
      const scopedSuppliers = effectiveBranchId ? (suppliersResult.data || []).filter((x:any)=>String(x.branch_id||"")===effectiveBranchId) : (suppliersResult.data || []);
      setSuppliers(
        scopedSuppliers.map((supplier: any) => ({
          id: String(supplier.id),
          name: String(supplier.name || ""),
          phone: String(supplier.phone || ""),
          city: String(supplier.city || ""),
          address: String(supplier.address || ""),
          supplierType: String(supplier.supplier_type || "عام"),
        }))
      );

      setCategories(
        (categoriesResult.data || []).map((category: any) => ({
          id: String(category.id),
          name: String(category.name || ""),
          products: (category.products || []).map((product: any) => ({
            id: Number(product.id),
            name: String(product.name || ""),
            productType: String(product.product_type || "normal"),
            details: (product.product_details || []).map((detail: any) => ({
              id: Number(detail.id),
              name: String(detail.name || ""),
              stock: Number(stockMap.get(Number(detail.id))?.stock || 0),
              buyPrice: Number(detail.buy_price || 0),
              sellPrice: Number(detail.sell_price || 0),
              averageUnitCost: Number(stockMap.get(Number(detail.id))?.averageUnitCost ?? detail.average_unit_cost ?? 0),
            })),
          })),
        }))
      );

      const scopedTiers = effectiveBranchId ? (tiersResult.data || []).filter((x:any)=>String(x.branch_id||"")===effectiveBranchId) : (tiersResult.data || []);
      setUsagePriceTiers(
        scopedTiers.map((tier: any) => ({
          id: String(tier.id),
          usagePrice: Number(tier.usage_price || 0),
          purchaseMin: Number(tier.purchase_min || 0),
          purchaseMax:
            tier.purchase_max === null
              ? null
              : Number(tier.purchase_max),
          stock: Number(tier.stock || 0),
          averageUnitCost: Number(tier.average_unit_cost || 0),
          alertLimit: Number(tier.alert_limit || 0),
          sortOrder: Number(tier.sort_order || 0),
        }))
      );

      const scopedInvoices = effectiveBranchId ? (invoicesResult.data || []).filter((x:any)=>String(x.branch_id||"")===effectiveBranchId) : (invoicesResult.data || []);
      setInvoices(
        scopedInvoices.map((invoice: any) => ({
          id: String(invoice.id),
          supplierName: String(invoice.supplier_name_snapshot || ""),
          invoiceNo: String(invoice.invoice_no || ""),
          invoiceDate: String(invoice.invoice_date || ""),
          purchaseMode: String(invoice.purchase_mode || "cash"),
          itemsSubtotal: Number(invoice.items_subtotal || 0),
          deliveryCost: Number(invoice.delivery_cost || 0),
          otherCosts: Number(invoice.other_costs || 0),
          grandTotal: Number(invoice.grand_total || 0),
          paidAmount: Number(invoice.paid_amount || 0),
          remainingAmount: Number(invoice.remaining_amount || 0),
          paymentMethod: String(invoice.payment_method || "cash"),
        }))
      );
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  function startEditTier(tier: UsagePriceTier) {
    setEditingTierId(tier.id);
    setTierUsagePrice(String(tier.usagePrice));
    setTierPurchaseMin(String(tier.purchaseMin));
    setTierPurchaseMax(tier.purchaseMax === null ? "" : String(tier.purchaseMax));
    setTierAlertLimit(String(tier.alertLimit || 0));
  }

  function resetTierForm() {
    setEditingTierId("");
    setTierUsagePrice("");
    setTierPurchaseMin("");
    setTierPurchaseMax("");
    setTierAlertLimit("5");
  }

  async function saveUsageTier() {
    if (!effectiveBranchId) return alert("اختر فرعًا محددًا أولًا");

    const usagePrice = Number(tierUsagePrice);
    const purchaseMin = Number(tierPurchaseMin);
    const purchaseMax = tierPurchaseMax.trim() === "" ? null : Number(tierPurchaseMax);
    const alertLimit = Number(tierAlertLimit || 0);

    if (!Number.isFinite(usagePrice) || usagePrice <= 0) return alert("اكتب سعر الفئة بشكل صحيح");
    if (!Number.isFinite(purchaseMin) || purchaseMin < 0) return alert("اكتب أقل سعر شراء بشكل صحيح");
    if (purchaseMax !== null && (!Number.isFinite(purchaseMax) || purchaseMax < purchaseMin)) {
      return alert("أعلى سعر شراء يجب أن يكون أكبر من أو يساوي أقل سعر شراء");
    }

    setSavingTier(true);
    try {
      if (editingTierId) {
        const { error } = await supabase.from("usage_price_tiers").update({
          usage_price: usagePrice,
          purchase_min: purchaseMin,
          purchase_max: purchaseMax,
          alert_limit: alertLimit,
        }).eq("id", editingTierId);
        if (error) throw error;
      } else {
        const nextSort = usagePriceTiers.reduce((m, x) => Math.max(m, x.sortOrder || 0), 0) + 1;
        const { error } = await supabase.from("usage_price_tiers").insert({
          usage_price: usagePrice,
          purchase_min: purchaseMin,
          purchase_max: purchaseMax,
          stock: 0,
          average_unit_cost: 0,
          alert_limit: alertLimit,
          is_active: true,
          sort_order: nextSort,
          branch_id: effectiveBranchId,
        });
        if (error) throw error;
      }
      resetTierForm();
      await loadData();
      alert("تم حفظ الفئة ✅");
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      setSavingTier(false);
    }
  }

 

  async function deleteUsageTier(tier: UsagePriceTier) {
    if (Number(tier.stock || 0) > 0) {
      alert(
        `لا يمكن حذف فئة ${tier.usagePrice} د.ل لأن مخزونها الحالي ${tier.stock}. صفّر المخزون أولًا أو استخدم إخفاء.`
      );
      return;
    }

    if (!window.confirm(`حذف فئة ${tier.usagePrice} د.ل نهائيًا؟`)) return;

    try {
      const { error } = await supabase
        .from("usage_price_tiers")
        .delete()
        .eq("id", tier.id);

      if (error) throw error;
      if (editingTierId === tier.id) resetTierForm();
      await loadData();
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    }
  }

  function addItem() {
    const quantity = Number(itemQuantity);
    const purchasePrice = Number(itemPurchasePrice);
    const sellPrice = Number(itemSellPrice || 0);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      alert("أدخل كمية صحيحة أكبر من صفر");
      return;
    }

    if (!Number.isFinite(purchasePrice) || purchasePrice <= 0) {
      alert("أدخل سعر شراء صحيح أكبر من صفر");
      return;
    }

    if (
      itemKind === "product_detail" &&
      (!Number.isFinite(sellPrice) || sellPrice <= 0)
    ) {
      alert("أدخل سعر بيع صحيح أكبر من صفر");
      return;
    }

    if (itemKind === "usage_price_tier") {
      if (!selectedUsagePriceTier) {
        alert("اختر فئة الورد الصناعي التي تريد إضافة المشتريات لها");
        return;
      }

      setDraftItems((current) => [
        ...current,
        {
          localId: crypto.randomUUID(),
          itemKind: "usage_price_tier",
          productDetailId: null,
          usagePriceTierId: selectedUsagePriceTier.id,
          productName: "ورد صناعي / إكسسوارات",
          detailName: `فئة ${selectedUsagePriceTier.usagePrice} د.ل`,
          quantity,
          unitPurchasePrice: purchasePrice,
          unitSellPrice: 0,
          notes: itemNotes.trim(),
        },
      ]);

      resetItemForm();
      return;
    }

    if (!selectedProduct || !selectedProductDetail) {
      alert("اختر المنتج والتفصيل");
      return;
    }

    setDraftItems((current) => [
      ...current,
      {
        localId: crypto.randomUUID(),
        itemKind: "product_detail",
        productDetailId: selectedProductDetail.id,
        usagePriceTierId: null,
        productName: selectedProduct.name,
        detailName: selectedProductDetail.name,
        quantity,
        unitPurchasePrice: purchasePrice,
        unitSellPrice: sellPrice,
        notes: itemNotes.trim(),
      },
    ]);

    resetItemForm();
  }

  async function saveInvoice() {
    if (!effectiveBranchId) return alert("اختر فرعًا محددًا قبل حفظ فاتورة الشراء");
    if (!selectedSupplier) {
      alert("اختر المورد");
      return;
    }

    if (draftItems.length === 0) {
      alert("أضف منتجًا واحدًا على الأقل للفاتورة");
      return;
    }

    if (paid < 0 || paid > grandTotal) {
      alert("قيمة المدفوع يجب أن تكون بين صفر وإجمالي الفاتورة");
      return;
    }

    setSaving(true);

    try {
      const payloadItems = draftItems.map((item) => ({
        itemKind: item.itemKind,
        productDetailId: item.productDetailId,
        usagePriceTierId: item.usagePriceTierId,
        productName: item.productName,
        detailName: item.detailName,
        quantity: item.quantity,
        unitPurchasePrice: item.unitPurchasePrice,
        unitSellPrice: item.unitSellPrice,
        notes: item.notes,
      }));

      const { error } = await supabase.rpc("save_purchase_invoice", {
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
        p_items: payloadItems,
        p_branch_id: effectiveBranchId,
      });

      if (error) throw error;

      for (const item of draftItems) {
        if (
          item.itemKind !== "product_detail" ||
          !item.productDetailId
        ) {
          continue;
        }

        const { error: priceUpdateError } = await supabase
          .from("product_details")
          .update({
            buy_price: Number(item.unitPurchasePrice || 0),
            sell_price: Number(item.unitSellPrice || 0),
            unit_sell_price: Number(item.unitSellPrice || 0),
          })
          .eq("id", item.productDetailId);

        if (priceUpdateError) throw priceUpdateError;
      }

      resetInvoice();
      await loadData();
      alert("تم حفظ فاتورة المشتريات وتحديث المخزون ومتوسط التكلفة ✅");
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  function resetItemForm() {
    setCategoryId("");
    setProductId("");
    setProductDetailId("");
    setItemQuantity("");
    setItemPurchasePrice("");
    setItemSellPrice("");
    setItemNotes("");
    setManualUsagePriceTierId("");
  }

  function resetInvoice() {
    setSupplierId("");
    setSupplierSearch("");
    setInvoiceNo("");
    setInvoiceDate(today());
    setPurchaseMode("cash");
    setPaymentMethod("cash");
    setDeliveryCost("");
    setOtherCosts("");
    setPaidAmount("");
    setInvoiceNotes("");
    setDraftItems([]);
    resetItemForm();
  }

  if (loading) {
    return (
      <div className="p-8 text-2xl font-bold text-gray-700">
        جاري تحميل المشتريات...
      </div>
    );
  }

  return (
    <div className="space-y-8 p-4 md:p-8" dir="rtl">
      <header>
        <h1 className="text-3xl font-bold md:text-4xl">المشتريات</h1><p className="mt-2 text-sm font-bold text-emerald-700">الفرع: {selectedBranch?.name||"كل الفروع"}</p>
        <p className="mt-2 text-gray-500">
          فاتورة متعددة المنتجات مع تحديث المخزون وديون الموردين
        </p>
      </header>

      <section className="rounded-2xl bg-white p-5 shadow md:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-bold">بيانات الفاتورة</h2>

          <button
            type="button"
            onClick={() => setShowSupplierDialog(true)}
            className="rounded-xl bg-gray-900 px-5 py-3 font-semibold text-white"
          >
            + إضافة مورد جديد
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="المورد">
            <div className="relative">
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
                className={inputClass}
                placeholder="اكتب أول حرف من اسم المورد"
              />

              {!selectedSupplier && supplierSearch && (
                <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border bg-white shadow-xl">
                  {filteredSuppliers.map((supplier) => (
                    <button
                      key={supplier.id}
                      type="button"
                      onClick={() => {
                        setSupplierId(supplier.id);
                        setSupplierSearch(supplier.name);
                      }}
                      className="block w-full border-b p-3 text-right hover:bg-emerald-50"
                    >
                      <span className="block font-semibold">
                        {supplier.name}
                      </span>
                      <span className="text-sm text-gray-500">
                        {supplier.phone || "بدون هاتف"}
                      </span>
                    </button>
                  ))}

                  {filteredSuppliers.length === 0 && (
                    <p className="p-4 text-center text-gray-500">
                      المورد غير موجود
                    </p>
                  )}
                </div>
              )}
            </div>
          </Field>

          <Field label="رقم فاتورة المورد">
            <input
              value={invoiceNo}
              onChange={(event) => setInvoiceNo(event.target.value)}
              className={inputClass}
              placeholder="اختياري"
            />
          </Field>

          <Field label="تاريخ الفاتورة">
            <input
              type="date"
              value={invoiceDate}
              onChange={(event) => setInvoiceDate(event.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="نوع الشراء">
            <select
              value={purchaseMode}
              onChange={(event) =>
                (() => {
                  const nextMode = event.target.value as "cash" | "credit" | "mixed";
                  setPurchaseMode(nextMode);
                  if (nextMode === "mixed" && !["cash", "bank_transfer"].includes(paymentMethod)) setPaymentMethod("cash");
                })()
              }
              className={inputClass}
            >
              <option value="cash">نقدي</option>
              <option value="credit">آجل</option>
              <option value="mixed">مدفوع جزئيًا</option>
            </select>
          </Field>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow md:p-6">
        <div className="mb-5">
          <h2 className="text-2xl font-bold">🌿 إدارة فئات الورد الصناعي / الإكسسوارات</h2>
          <p className="mt-2 text-sm text-gray-500">
            من هنا تضيف وتعدل الفئات وتشوف مخزون كل فئة في الفرع الحالي.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Field label="سعر الفئة / الاستخدام">
            <input type="number" min="0.01" step="0.01" value={tierUsagePrice}
              onChange={(e) => setTierUsagePrice(e.target.value)} className={inputClass} placeholder="مثلاً 5" />
          </Field>
          <Field label="أقل سعر شراء">
            <input type="number" min="0" step="0.01" value={tierPurchaseMin}
              onChange={(e) => setTierPurchaseMin(e.target.value)} className={inputClass} placeholder="مثلاً 0" />
          </Field>
          <Field label="أعلى سعر شراء">
            <input type="number" min="0" step="0.01" value={tierPurchaseMax}
              onChange={(e) => setTierPurchaseMax(e.target.value)} className={inputClass} placeholder="فارغ = بدون حد" />
          </Field>
          <Field label="تنبيه قرب النفاد">
            <input type="number" min="0" step="1" value={tierAlertLimit}
              onChange={(e) => setTierAlertLimit(e.target.value)} className={inputClass} />
          </Field>
          <div className="flex items-end gap-2">
            <button type="button" onClick={saveUsageTier} disabled={savingTier}
              className="w-full rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white disabled:opacity-50">
              {savingTier ? "جاري الحفظ..." : editingTierId ? "حفظ التعديل" : "+ إضافة فئة"}
            </button>
            {editingTierId && (
              <button type="button" onClick={resetTierForm}
                className="rounded-xl border px-4 py-3 font-semibold">إلغاء</button>
            )}
          </div>
        </div>

        <div className="mt-6 overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[900px]">
            <thead className="bg-emerald-50">
              <tr>
                <th className="p-3 text-right">الفئة</th>
                <th className="p-3 text-right">نطاق سعر الشراء</th>
                <th className="p-3 text-right">المخزون الحالي</th>
                <th className="p-3 text-right">متوسط التكلفة</th>
                <th className="p-3 text-right">قيمة المخزون</th>
                <th className="p-3 text-right">حد التنبيه</th>
                <th className="p-3 text-right">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {usagePriceTiers.map((tier) => (
                <tr key={tier.id} className="border-t">
                  <td className="p-3 font-bold text-emerald-800">{money(tier.usagePrice)}</td>
                  <td className="p-3">
                    {money(tier.purchaseMin)} — {tier.purchaseMax === null ? "بدون حد أعلى" : money(tier.purchaseMax)}
                  </td>
                  <td className="p-3">
                    <span className={`rounded-full px-3 py-1 font-bold ${
                      tier.stock <= tier.alertLimit ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
                    }`}>
                      {tier.stock} قطعة
                    </span>
                  </td>
                  <td className="p-3">{money(tier.averageUnitCost)}</td>
                  <td className="p-3 font-bold">{money(tier.stock * tier.averageUnitCost)}</td>
                  <td className="p-3">{tier.alertLimit}</td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      <button type="button" onClick={() => startEditTier(tier)}
                        className="rounded-lg bg-blue-100 px-3 py-2 font-semibold text-blue-700">تعديل</button>
                      <button type="button" onClick={() => deleteUsageTier(tier)}
                        className="rounded-lg bg-red-100 px-3 py-2 font-semibold text-red-700">حذف</button>
                    </div>
                  </td>
                </tr>
              ))}
              {usagePriceTiers.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center text-gray-500">لا توجد فئات مسجلة لهذا الفرع</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow md:p-6">
        <h2 className="mb-5 text-2xl font-bold">إضافة منتجات للفاتورة</h2>

        <div className="mb-5 flex flex-wrap gap-3">
          <ModeButton
            active={itemKind === "product_detail"}
            onClick={() => {
              setItemKind("product_detail");
              resetItemForm();
            }}
          >
            منتج عادي من المخزون
          </ModeButton>

          <ModeButton
            active={itemKind === "usage_price_tier"}
            onClick={() => {
              setItemKind("usage_price_tier");
              resetItemForm();
            }}
          >
            ورد صناعي / إكسسوارات
          </ModeButton>
        </div>

        {itemKind === "product_detail" ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="القسم">
              <select
                value={categoryId}
                onChange={(event) => {
                  setCategoryId(event.target.value);
                  setProductId("");
                  setProductDetailId("");
                  setItemPurchasePrice("");
                  setItemSellPrice("");
                }}
                className={inputClass}
              >
                <option value="">اختر القسم</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="المنتج">
              <select
                value={productId}
                onChange={(event) => {
                  setProductId(event.target.value);
                  setProductDetailId("");
                  setItemPurchasePrice("");
                  setItemSellPrice("");
                }}
                className={inputClass}
                disabled={!selectedCategory}
              >
                <option value="">اختر المنتج</option>
                {selectedCategory?.products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="الحجم / اللون / النوع">
              <select
                value={productDetailId}
                onChange={(event) =>
                  setProductDetailId(event.target.value)
                }
                className={inputClass}
                disabled={!selectedProduct}
              >
                <option value="">اختر التفصيل</option>
                {selectedProduct?.details.map((detail) => (
                  <option key={detail.id} value={detail.id}>
                    {detail.name} — المخزون {detail.stock}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        ) : (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <p className="font-semibold text-emerald-900">
              الفئات هنا هي فقط الفئات التي أنشأتها أنت. اختر الفئة يدويًا لكل مشتريات.
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              {usagePriceTiers.map((tier) => (
                <span
                  key={tier.id}
                  className="rounded-full bg-white px-4 py-2 text-sm font-semibold shadow-sm"
                >
                  فئة {tier.usagePrice} د.ل — مخزون {tier.stock}
                </span>
              ))}
            </div>
            <div className="mt-4 rounded-xl bg-white p-4">
              <p className="mb-2 font-bold text-emerald-900">
                اختر الفئة التي تريد زيادة مخزونها:
              </p>
              <select
                value={manualUsagePriceTierId}
                onChange={(event) =>
                  setManualUsagePriceTierId(event.target.value)
                }
                className={inputClass}
              >
                <option value="">اختر الفئة</option>
                {usagePriceTiers.map((tier) => (
                  <option key={tier.id} value={tier.id}>
                    فئة {tier.usagePrice} د.ل — المخزون الحالي {tier.stock}
                  </option>
                ))}
              </select>
              {selectedUsagePriceTier && (
                <p className="mt-3 font-black text-emerald-700">
                  سيتم إضافة الكمية إلى فئة {selectedUsagePriceTier.usagePrice} د.ل
                </p>
              )}
            </div>
          </div>
        )}

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="الكمية">
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={itemQuantity}
              onChange={(event) => setItemQuantity(event.target.value)}
              className={inputClass}
              placeholder="عدد القطع"
            />
          </Field>

          <Field label="سعر شراء الوحدة">
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={itemPurchasePrice}
              onChange={(event) =>
                setItemPurchasePrice(event.target.value)
              }
              className={inputClass}
              placeholder="سعر القطعة"
            />
          </Field>

          {itemKind === "product_detail" && (
            <Field label="سعر بيع الوحدة">
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={itemSellPrice}
                onChange={(event) =>
                  setItemSellPrice(event.target.value)
                }
                className={inputClass}
                placeholder="سعر البيع"
              />
            </Field>
          )}

          <Field label="ملاحظة للبند">
            <input
              value={itemNotes}
              onChange={(event) => setItemNotes(event.target.value)}
              className={inputClass}
              placeholder="اختياري"
            />
          </Field>
        </div>

        <button
          type="button"
          onClick={addItem}
          className="mt-5 rounded-xl bg-emerald-700 px-7 py-3 font-semibold text-white"
        >
          + إضافة للفاتورة
        </button>

        <div className="mt-6 overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[850px]">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-3 text-right">المنتج</th>
                <th className="p-3 text-right">التفصيل / الفئة</th>
                <th className="p-3 text-right">الكمية</th>
                <th className="p-3 text-right">سعر الشراء</th>
                <th className="p-3 text-right">سعر البيع</th>
                <th className="p-3 text-right">الإجمالي</th>
                <th className="p-3 text-right">حذف</th>
              </tr>
            </thead>

            <tbody>
              {draftItems.map((item) => (
                <tr key={item.localId} className="border-t">
                  <td className="p-3 font-semibold">{item.productName}</td>
                  <td className="p-3">{item.detailName}</td>
                  <td className="p-3">{item.quantity}</td>
                  <td className="p-3">
                    {money(item.unitPurchasePrice)}
                  </td>
                  <td className="p-3">
                    {item.itemKind === "product_detail"
                      ? money(item.unitSellPrice)
                      : "-"}
                  </td>
                  <td className="p-3 font-bold">
                    {money(item.quantity * item.unitPurchasePrice)}
                  </td>
                  <td className="p-3">
                    <button
                      type="button"
                      onClick={() =>
                        setDraftItems((current) =>
                          current.filter(
                            (row) => row.localId !== item.localId
                          )
                        )
                      }
                      className="rounded-lg bg-red-100 px-4 py-2 font-semibold text-red-700"
                    >
                      حذف
                    </button>
                  </td>
                </tr>
              ))}

              {draftItems.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="p-8 text-center text-gray-500"
                  >
                    لم تتم إضافة أي منتجات بعد
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow md:p-6">
        <h2 className="mb-5 text-2xl font-bold">المصاريف والسداد</h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="تكلفة التوصيل">
            <input
              type="number"
              min="0"
              step="0.01"
              value={deliveryCost}
              onChange={(event) => setDeliveryCost(event.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="مصاريف أخرى">
            <input
              type="number"
              min="0"
              step="0.01"
              value={otherCosts}
              onChange={(event) => setOtherCosts(event.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label={purchaseMode === "mixed" ? "طريقة دفع الجزء المدفوع" : "طريقة الدفع"}>
            <select
              value={paymentMethod}
              onChange={(event) => setPaymentMethod(event.target.value)}
              className={inputClass}
            >
              <option value="cash">كاش</option>
              <option value="bank_transfer">مصرف</option>
              {purchaseMode !== "mixed" && <option value="card">بطاقة</option>}
            </select>
          </Field>

          <Field label="المبلغ المدفوع">
            <input
              type="number"
              min="0"
              max={grandTotal}
              step="0.01"
              value={paidAmount}
              onChange={(event) => setPaidAmount(event.target.value)}
              className={inputClass}
              disabled={purchaseMode === "cash"}
            />
          </Field>
        </div>

        <textarea
          value={invoiceNotes}
          onChange={(event) => setInvoiceNotes(event.target.value)}
          rows={3}
          className={`${inputClass} mt-5`}
          placeholder="ملاحظات الفاتورة"
        />

        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
          <SummaryCard label="إجمالي المنتجات" value={itemsSubtotal} />
          <SummaryCard
            label="التوصيل"
            value={Number(deliveryCost || 0)}
          />
          <SummaryCard
            label="مصاريف أخرى"
            value={Number(otherCosts || 0)}
          />
          <SummaryCard label="الإجمالي النهائي" value={grandTotal} strong />
          <SummaryCard
            label="المتبقي للمورد"
            value={remaining}
            danger={remaining > 0}
          />
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={saveInvoice}
            disabled={saving}
            className="rounded-xl bg-emerald-700 px-8 py-3 font-bold text-white disabled:opacity-50"
          >
            {saving ? "جاري حفظ الفاتورة..." : "حفظ فاتورة المشتريات"}
          </button>

          <button
            type="button"
            onClick={resetInvoice}
            disabled={saving}
            className="rounded-xl border px-8 py-3 font-semibold disabled:opacity-50"
          >
            فاتورة جديدة
          </button>
        </div>
      </section>

      <section className="overflow-x-auto rounded-2xl bg-white p-5 shadow md:p-6">
        <h2 className="mb-5 text-2xl font-bold">آخر فواتير المشتريات</h2>

        <table className="w-full min-w-[1050px]">
          <thead className="bg-emerald-700 text-white">
            <tr>
              <th className="p-4 text-right">التاريخ</th>
              <th className="p-4 text-right">المورد</th>
              <th className="p-4 text-right">رقم الفاتورة</th>
              <th className="p-4 text-right">المنتجات</th>
              <th className="p-4 text-right">المصاريف</th>
              <th className="p-4 text-right">الإجمالي</th>
              <th className="p-4 text-right">المدفوع</th>
              <th className="p-4 text-right">المتبقي</th>
              <th className="p-4 text-right">الحالة</th>
            </tr>
          </thead>

          <tbody>
            {invoices.map((invoice) => (
              <tr key={invoice.id} className="border-b hover:bg-gray-50">
                <td className="p-4">{invoice.invoiceDate}</td>
                <td className="p-4 font-semibold">
                  {invoice.supplierName || "-"}
                </td>
                <td className="p-4">{invoice.invoiceNo || "-"}</td>
                <td className="p-4">{money(invoice.itemsSubtotal)}</td>
                <td className="p-4">
                  {money(invoice.deliveryCost + invoice.otherCosts)}
                </td>
                <td className="p-4 font-bold">
                  {money(invoice.grandTotal)}
                </td>
                <td className="p-4 text-green-700">
                  {money(invoice.paidAmount)}
                </td>
                <td className="p-4 font-semibold text-red-700">
                  {money(invoice.remainingAmount)}
                </td>
                <td className="p-4">
                  <StatusBadge
                    remaining={invoice.remainingAmount}
                    paid={invoice.paidAmount}
                  />
                </td>
              </tr>
            ))}

            {invoices.length === 0 && (
              <tr>
                <td colSpan={9} className="p-10 text-center text-gray-500">
                  لا توجد فواتير في النظام الجديد بعد
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {showSupplierDialog && (
        <NewSupplierDialog
          branchId={effectiveBranchId}
          onClose={() => setShowSupplierDialog(false)}
          onSaved={async (supplier) => {
            setShowSupplierDialog(false);
            await loadData();
            setSupplierId(supplier.id);
            setSupplierSearch(supplier.name);
          }}
        />
      )}
    </div>
  );
}

function NewSupplierDialog({
  branchId,
  onClose,
  onSaved,
}: {
  branchId: string | null;
  onClose: () => void;
  onSaved: (supplier: { id: string; name: string }) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [supplierType, setSupplierType] = useState("عام");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function saveSupplier() {
    if (!branchId) {
      alert("اختر فرعًا محددًا أولًا");
      return;
    }

    if (!name.trim()) {
      alert("اسم المورد مطلوب");
      return;
    }

    setSaving(true);

    try {
      const { data, error } = await supabase
        .from("suppliers")
        .insert({
          name: name.trim(),
          phone: phone.trim(),
          city: city.trim(),
          address: address.trim(),
          supplier_type: supplierType.trim() || "عام",
          notes: notes.trim(),
          branch_id: branchId,
          is_active: true,
        })
        .select("id,name")
        .single();

      if (error) throw error;
      onSaved({ id: String(data.id), name: String(data.name) });
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl"
        dir="rtl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">إضافة مورد جديد</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-gray-100 px-4 py-2"
          >
            ✕
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="اسم المورد">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="رقم الهاتف">
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="المدينة">
            <input
              value={city}
              onChange={(event) => setCity(event.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="نوع المورد">
            <input
              value={supplierType}
              onChange={(event) => setSupplierType(event.target.value)}
              className={inputClass}
              placeholder="ورد، بوكسات، تغليف..."
            />
          </Field>
        </div>

        <Field label="العنوان">
          <input
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            className={inputClass}
          />
        </Field>

        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          className={`${inputClass} mt-4`}
          rows={3}
          placeholder="ملاحظات"
        />

        <button
          type="button"
          onClick={saveSupplier}
          disabled={saving}
          className="mt-5 rounded-xl bg-emerald-700 px-8 py-3 font-bold text-white disabled:opacity-50"
        >
          {saving ? "جاري الحفظ..." : "حفظ المورد"}
        </button>
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

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-5 py-3 font-semibold ${
        active
          ? "bg-emerald-700 text-white"
          : "bg-gray-100 text-gray-700"
      }`}
    >
      {children}
    </button>
  );
}

function SummaryCard({
  label,
  value,
  strong = false,
  danger = false,
}: {
  label: string;
  value: number;
  strong?: boolean;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-4 ${
        danger
          ? "bg-red-50"
          : strong
            ? "bg-emerald-50"
            : "bg-gray-50"
      }`}
    >
      <p className="text-sm text-gray-500">{label}</p>
      <p
        className={`mt-2 text-xl font-bold ${
          danger
            ? "text-red-700"
            : strong
              ? "text-emerald-700"
              : "text-gray-900"
        }`}
      >
        {money(value)}
      </p>
    </div>
  );
}

function StatusBadge({
  remaining,
  paid,
}: {
  remaining: number;
  paid: number;
}) {
  if (remaining <= 0) {
    return (
      <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-700">
        مدفوعة
      </span>
    );
  }

  if (paid > 0) {
    return (
      <span className="rounded-full bg-orange-100 px-3 py-1 text-sm font-semibold text-orange-700">
        مدفوعة جزئيًا
      </span>
    );
  }

  return (
    <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-semibold text-red-700">
      آجلة
    </span>
  );
}

function money(value: number) {
  return `${Number(value || 0).toFixed(2)} د.ل`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error
  ) {
    return String((error as { message: unknown }).message);
  }

  return "حدث خطأ غير متوقع";
}