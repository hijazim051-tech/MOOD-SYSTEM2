import { useEffect, useMemo, useState } from "react";

import CustomerInfo, {
  type CustomerInfoData,
} from "../components/orders/CustomerInfo";

import PaymentSection, {
  type PaymentData,
} from "../components/orders/PaymentSection";

import BouquetBuilder, {
  createEmptyBouquet,
} from "../components/orders/BouquetBuilder";

import BoxBuilder, {
  createEmptyBox,
} from "../components/orders/BoxBuilder";

import {
  getBouquetSizes,
  getBoxVariants,
  getOrderMaterials,
  getMaterialCost,
  getMaterialDisplayName,
  type BouquetSize,
  type BoxVariant,
  type OrderMaterial,
} from "../lib/orderCatalog";

import {
  calculateEntriesTotal,
  convertEntriesToBuilderItems,
  getBouquetFlowerTotal,
  createEmptySingleProduct,
  type ExtendedBuilderItem,
  type NewOrderEntry,
  type SingleProductDraft,
} from "../lib/newOrderDrafts";

import { saveBuiltOrder } from "../lib/saveBuiltOrder";
import { useBranch } from "../context/BranchContext";
import { openInvoiceWhatsApp, shareInvoicePdfToWhatsApp } from "../lib/whatsapp";
import { updateBuiltOrder } from "../lib/updateBuiltOrder";
import { loadOrderForEdit } from "../lib/loadOrderForEdit";
import { saveReadyProduct } from "../lib/saveReadyProduct";

const DRAFT_STORAGE_KEY = "mood-new-order-draft";

const emptyCustomer: CustomerInfoData = {
  customerName: "",
  customerPhone: "",
  recipientPhone: "",
  occasion: "",
  deliveryDate: "",
  deliveryTime: "",
  address: "",
  notes: "",
};

const emptyPayment: PaymentData = {
  paymentMethod: "cash",
  cashAmount: 0,
  bankAmount: 0,
  transferAmount: 0,
  depositAmount: 0,
  depositMethod: "cash",

  deliveryFee: 0,
  deliveryPaidCash: false,
  deliveryPaymentMethod: "none",

  deliveryStatus: "pending",
  deliveryDriverName: "",
  deliveryAddress: "",
  deliveryCompanyName: "",

  discount: 0,
};

type FlowerSummaryLine = {
  key: string;
  name: string;
  color: string;
  quantity: number;
};

type SavedOrderResult = {
  orderNumber?: string;
  order_number?: string;
  id?: string | number;
};

type SuccessData = {
  orderNumber: string;
  customer: CustomerInfoData;
  payment: PaymentData;
  items: ExtendedBuilderItem[];
  productsTotal: number;
  finalTotal: number;
  totalPaid: number;
};

export default function NewOrder() {
  const { effectiveBranchId } = useBranch();
  const [bouquetSizes, setBouquetSizes] = useState<BouquetSize[]>([]);
  const [boxVariants, setBoxVariants] = useState<BoxVariant[]>([]);
  const [materials, setMaterials] = useState<OrderMaterial[]>([]);
  const [entries, setEntries] = useState<NewOrderEntry[]>([]);
  const [openEntryId, setOpenEntryId] = useState<string | null>(null);
  const [customer, setCustomer] =
    useState<CustomerInfoData>({ ...emptyCustomer });
  const [payment, setPayment] =
    useState<PaymentData>({ ...emptyPayment });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [successData, setSuccessData] =
    useState<SuccessData | null>(null);
  const [editingOrderId, setEditingOrderId] =
    useState<number | null>(null);
  const [editingOrderNumber, setEditingOrderNumber] =
    useState("");
  const [showReadyDialog, setShowReadyDialog] = useState(false);
  const [readyName, setReadyName] = useState("");
  const [readyImageUrl, setReadyImageUrl] = useState("");
  const [readyNotes, setReadyNotes] = useState("");
  const [savingReady, setSavingReady] = useState(false);
  const [showMobileSummary, setShowMobileSummary] = useState(false);
  const [customerExpanded, setCustomerExpanded] = useState(true);
  const [itemsExpanded, setItemsExpanded] = useState(true);
  const [currentStep, setCurrentStep] = useState(1);
  const [lastAutoSavedAt, setLastAutoSavedAt] = useState<string | null>(null);

  useEffect(() => {
    void loadPageData();
  }, []);

  const hasUnsavedChanges =
    entries.length > 0 ||
    Boolean(customer.customerName.trim()) ||
    Boolean(customer.customerPhone.trim()) ||
    Number(payment.deliveryFee || 0) > 0 ||
    Number(payment.discount || 0) > 0 ||
    Number(payment.cashAmount || 0) > 0 ||
    Number(payment.bankAmount || 0) > 0 ||
    Number(payment.transferAmount || 0) > 0 ||
    Number(payment.depositAmount || 0) > 0;

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges || saving || successData) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges, saving, successData]);

  useEffect(() => {
    if (!hasUnsavedChanges || saving || successData || loading) return;

    const timeoutId = window.setTimeout(() => {
      const savedAt = new Date().toISOString();

      localStorage.setItem(
        DRAFT_STORAGE_KEY,
        JSON.stringify({
          entries,
          customer,
          payment,
          currentStep,
          savedAt,
        })
      );

      setDraftSaved(true);
      setLastAutoSavedAt(savedAt);
    }, 700);

    return () => window.clearTimeout(timeoutId);
  }, [
    entries,
    customer,
    payment,
    currentStep,
    hasUnsavedChanges,
    saving,
    successData,
    loading,
  ]);

  useEffect(() => {
    const handleKeyboardSave = (event: KeyboardEvent) => {
      const isSaveShortcut =
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "s";

      if (!isSaveShortcut) return;
      event.preventDefault();

      if (!saving) void saveOrder();
    };

    window.addEventListener("keydown", handleKeyboardSave);
    return () => window.removeEventListener("keydown", handleKeyboardSave);
  });

  async function loadPageData() {
    setLoading(true);

    try {
      setMaterials(await getOrderMaterials(effectiveBranchId));

      try {
        setBouquetSizes(await getBouquetSizes());
      } catch (error) {
        console.error("خطأ تحميل أحجام الباقات:", error);
        setBouquetSizes([]);
      }

      try {
        setBoxVariants(await getBoxVariants());
      } catch (error) {
        console.error("خطأ تحميل أنواع البوكسات:", error);
        setBoxVariants([]);
      }

      const storedEditOrderId = Number(
        localStorage.getItem("mood-edit-order-id") || 0
      );

      if (storedEditOrderId > 0) {
        const loaded = await loadOrderForEdit(storedEditOrderId);

        setEditingOrderId(loaded.orderId);
        setEditingOrderNumber(loaded.orderNumber);
        setCustomer(loaded.customer);
        setPayment(loaded.payment);
        setEntries(loaded.entries);
        setOpenEntryId(loaded.entries[0]?.data.tempId || null);

        localStorage.removeItem("mood-edit-order-id");
      } else {
        restoreDraftIfAvailable();
      }
    } catch (error: unknown) {
      alert(`خطأ تحميل المخزون: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }

  function restoreDraftIfAvailable() {
    try {
      const rawDraft = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!rawDraft) return;

      const draft = JSON.parse(rawDraft) as {
        entries?: NewOrderEntry[];
        customer?: CustomerInfoData;
        payment?: PaymentData;
        currentStep?: number;
      };

      const hasDraftContent =
        Boolean(draft.entries?.length) ||
        Boolean(draft.customer?.customerName) ||
        Boolean(draft.customer?.customerPhone);

      if (!hasDraftContent) return;

      if (!confirm("يوجد طلب محفوظ كمسودة. هل تريد استرجاعه؟")) return;

      const restoredEntries = (draft.entries || []).map((entry) => {
        if (entry.kind !== "bouquet") return entry;

        return {
          ...entry,
          data: {
            ...entry.data,
            wrappingOptions: Array.isArray(entry.data.wrappingOptions)
              ? entry.data.wrappingOptions
              : [],
            additions: [],
            ribbonQuantity: 0,
            cardQuantity: 0,
            baseQuantity: 0,
          },
        };
      }) as NewOrderEntry[];

      setEntries(restoredEntries);
      setCustomer(draft.customer || { ...emptyCustomer });
      setPayment(draft.payment || { ...emptyPayment });
      setCurrentStep(Number(draft.currentStep || 1));
      setOpenEntryId(restoredEntries[0]?.data.tempId || null);
      setDraftSaved(true);
    } catch (error) {
      console.error("تعذر استرجاع المسودة:", error);
    }
  }

  function saveDraft() {
    localStorage.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify({
        entries,
        customer,
        payment,
        currentStep,
        savedAt: new Date().toISOString(),
      })
    );
    setDraftSaved(true);
    setLastAutoSavedAt(new Date().toISOString());
    alert("تم حفظ الطلب كمسودة ✅");
  }

  function clearSavedDraft() {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    setDraftSaved(false);
  }

  function addBouquet() {
    const bouquet = createEmptyBouquet();
    setEntries((current) => [...current, { kind: "bouquet", data: bouquet }]);
    setOpenEntryId(bouquet.tempId);
    setDraftSaved(false);
  }

  function addBox() {
    const box = createEmptyBox();
    setEntries((current) => [...current, { kind: "box", data: box }]);
    setOpenEntryId(box.tempId);
    setDraftSaved(false);
  }

  function addSingleProduct() {
    const product = createEmptySingleProduct();
    setEntries((current) => [
      ...current,
      { kind: "single", data: product },
    ]);
    setOpenEntryId(product.tempId);
    setDraftSaved(false);
  }

  function updateEntry(updatedEntry: NewOrderEntry) {
    setEntries((current) =>
      current.map((entry) =>
        entry.data.tempId === updatedEntry.data.tempId
          ? updatedEntry
          : entry
      )
    );
    setDraftSaved(false);
  }

  function removeEntry(tempId: string) {
    if (!confirm("هل تريد حذف هذا العنصر من الطلب؟")) return;

    setEntries((current) =>
      current.filter((entry) => entry.data.tempId !== tempId)
    );

    if (openEntryId === tempId) setOpenEntryId(null);
    setDraftSaved(false);
  }

  function resetOrder() {
    setEntries([]);
    setOpenEntryId(null);
    setCustomer({ ...emptyCustomer });
    setPayment({ ...emptyPayment });
    clearSavedDraft();
  }

  const productsTotal = useMemo(
    () => calculateEntriesTotal(entries),
    [entries]
  );

  const totalPaid = useMemo(
    () =>
      Number(payment.cashAmount || 0) +
      Number(payment.bankAmount || 0) +
      Number(payment.transferAmount || 0) +
      Number(payment.depositAmount || 0),
    [payment]
  );

  const finalTotal = useMemo(
    () =>
      productsTotal +
      Number(payment.deliveryFee || 0) -
      Number(payment.discount || 0),
    [productsTotal, payment.deliveryFee, payment.discount]
  );

  const flowerSummary = useMemo<FlowerSummaryLine[]>(() => {
    const map = new Map<string, FlowerSummaryLine>();

    for (const entry of entries) {
      if (entry.kind !== "bouquet") continue;

      for (const flower of entry.data.flowers) {
        const name = flower.name || "ورد";
        const color = flower.color || "";
        const key = `${name}__${color}`;
        const current = map.get(key);

        if (current) {
          current.quantity += Number(flower.quantity || 0);
        } else {
          map.set(key, {
            key,
            name,
            color,
            quantity: Number(flower.quantity || 0),
          });
        }
      }
    }

    return Array.from(map.values()).sort(
      (a, b) => b.quantity - a.quantity
    );
  }, [entries]);

  const totals = useMemo(() => {
    let bouquets = 0;
    let boxes = 0;
    let singles = 0;
    let bouquetFlowers = 0;
    let additions = 0;
    let externalContents = 0;

    for (const entry of entries) {
      if (entry.kind === "bouquet") {
        bouquets += 1;
        bouquetFlowers += getBouquetFlowerTotal(entry.data);
        externalContents += entry.data.externalPurchases.length;
      } else if (entry.kind === "box") {
        boxes += 1;
        externalContents += entry.data.externalPurchases.length;
        additions += entry.data.additions.reduce(
          (total, line) => total + Number(line.quantity || 0),
          0
        );
      } else {
        singles += 1;
      }
    }

    return {
      bouquets,
      boxes,
      singles,
      bouquetFlowers,
      additions,
      externalContents,
    };
  }, [entries]);

  const customerComplete =
    Boolean(customer.customerName.trim()) &&
    Boolean(customer.customerPhone.trim());
  const itemsComplete = entries.length > 0;
  function validateOrder() {
    const errors: string[] = [];

    if (!customer.customerName.trim()) errors.push("اكتب اسم العميل");
    if (!customer.customerPhone.trim()) errors.push("اكتب رقم هاتف العميل");
    if (entries.length === 0) {
      errors.push("أضف باقة أو بوكس أو منتجًا فرديًا واحدًا على الأقل");
    }

    entries.forEach((entry, index) => {
      const number = index + 1;

      if (entry.kind === "bouquet") {
        const bouquet = entry.data;

        if (bouquet.flowers.length === 0) {
          errors.push(`الباقة رقم ${number}: أضف الورد`);
        }

        if (!bouquet.bouquetSizeId) {
          errors.push(`الباقة رقم ${number}: لم يتم تحديد حجم الباقة تلقائيًا`);
        }

        for (const external of bouquet.externalPurchases) {
          if (!external.name.trim()) {
            errors.push(`الباقة رقم ${number}: اسم المحتوى الخارجي مطلوب`);
          }

          if (Number(external.quantity || 0) <= 0) {
            errors.push(`الباقة رقم ${number}: كمية المحتوى الخارجي غير صحيحة`);
          }
        }

      } else if (entry.kind === "box") {
        const box = entry.data;

        if (!box.boxVariantId) {
          errors.push(`البوكس رقم ${number}: اختار قالب البوكس`);
        }

        if (!box.boxProductDetailId) {
          errors.push(`البوكس رقم ${number}: قالب البوكس غير مربوط بالمخزون`);
        }

        if (Number(box.contentValue || 0) <= 0) {
          errors.push(`البوكس رقم ${number}: قيمة المحتوى غير محددة في القالب`);
        }

        if (Number(box.boxPrice || 0) <= 0) {
          errors.push(`البوكس رقم ${number}: سعر البيع غير محدد`);
        }

        for (const external of box.externalPurchases) {
          if (!external.name.trim()) {
            errors.push(`البوكس رقم ${number}: اسم المحتوى الخارجي مطلوب`);
          }
          if (Number(external.quantity || 0) <= 0) {
            errors.push(`البوكس رقم ${number}: كمية المحتوى الخارجي غير صحيحة`);
          }
        }
      } else {
        const product = entry.data;

        if (!product.productDetailId) {
          errors.push(`المنتج الفردي رقم ${number}: اختار المنتج`);
        }

        if (Number(product.quantity || 0) <= 0) {
          errors.push(`المنتج الفردي رقم ${number}: الكمية غير صحيحة`);
        }

        if (Number(product.quantity || 0) > Number(product.stock || 0)) {
          errors.push(
            `المنتج الفردي رقم ${number}: الكمية أكبر من المخزون المتوفر`
          );
        }

        if (Number(product.unitPrice || 0) <= 0) {
          errors.push(`المنتج الفردي رقم ${number}: سعر البيع غير صحيح`);
        }
      }
    });

    if (Number(payment.discount || 0) < 0) {
      errors.push("قيمة الخصم غير صحيحة");
    }

    if (Number(payment.deliveryFee || 0) < 0) {
      errors.push("قيمة التوصيل غير صحيحة");
    }

    if (Number(payment.discount || 0) > productsTotal) {
      errors.push("الخصم أكبر من إجمالي المنتجات");
    }

    return errors;
  }

  async function saveOrder() {
    const errors = validateOrder();

    if (errors.length > 0) {
      const proceed = confirm(
        `تنبيهات قبل الحفظ (لا تمنع الحفظ):\n\n${errors
          .map((error, index) => `${index + 1}. ${error}`)
          .join("\n")}\n\nهل تريد الحفظ رغم هذه التنبيهات؟`
      );
      if (!proceed) return;
    }

    if (
      totalPaid > finalTotal &&
      !confirm("إجمالي المدفوع أكبر من قيمة الطلب. هل تريد المتابعة؟")
    ) {
      return;
    }

    // الدفع الجزئي مسموح: يُحفظ الفرق تلقائيًا كمبلغ متبقٍ على الطلب.

    if (
      !confirm(
        "هل تريد حفظ الطلب؟ سيُخصم الورد والمنتج الفردي والبوكس ومكوناته الثابتة من المخزون. ألوان غلاف الباقة تُحفظ فقط، وموظف التغليف يكتب الكمية الفعلية لاحقًا ليتم خصمها."
      )
    ) {
      return;
    }

    setSaving(true);

    try {
      const items = convertEntriesToBuilderItems(entries);

      const result = (editingOrderId
        ? await updateBuiltOrder({
            orderId: editingOrderId,
            customer,
            payment,
            items,
          })
        : await saveBuiltOrder({
            customer,
            payment,
            items,
            branchId: effectiveBranchId,
          })) as SavedOrderResult | undefined;

      const orderNumber =
        result?.orderNumber ||
        result?.order_number ||
        (result?.id ? String(result.id) : "تم الحفظ");

      const wasEditing = Boolean(editingOrderId);

      const successSnapshot: SuccessData = {
        orderNumber: wasEditing
          ? `${orderNumber} — تم التعديل`
          : orderNumber,
        customer: { ...customer },
        payment: { ...payment },
        items,
        productsTotal,
        finalTotal,
        totalPaid,
      };

      clearSavedDraft();
      setEditingOrderId(null);
      setEditingOrderNumber("");
      resetOrder();

      setSuccessData(successSnapshot);

      if (!wasEditing) {
        const printableOrder = {
          ...successSnapshot, id: Number(result?.id ?? 0), orderNumber, branchId: effectiveBranchId,
        } as unknown as Parameters<typeof shareInvoicePdfToWhatsApp>[0];
        let pdfError: unknown = null;
        for (let attempt = 1; attempt <= 2; attempt += 1) {
          try {
            if (attempt > 1) await new Promise((resolve) => window.setTimeout(resolve, 1200));
            await shareInvoicePdfToWhatsApp(printableOrder);
            pdfError = null;
            break;
          } catch (error) { pdfError = error; }
        }
        if (pdfError) {
          console.error("تعذر إرسال فاتورة PDF تلقائيًا بعد محاولتين:", pdfError);
          alert(pdfError instanceof Error
            ? `تم حفظ الطلب، لكن تعذر إرسال فاتورة PDF تلقائيًا: ${pdfError.message}\nيمكنك إعادة الإرسال من زر واتساب.`
            : "تم حفظ الطلب، لكن تعذر إرسال فاتورة PDF تلقائيًا. يمكنك إعادة الإرسال من زر واتساب.");
        }
      }

      await loadPageData();
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  function openReadyDialog() {
    if (editingOrderId) {
      alert("لا يمكن حفظ طلب قيد التعديل كجاهز جديد");
      return;
    }

    if (entries.length !== 1) {
      alert("لحفظ جاهز، خلي الطلب يحتوي على باقة واحدة أو بوكس واحد فقط");
      return;
    }

    const entry = entries[0];

    if (entry.kind !== "bouquet" && entry.kind !== "box") {
      alert("يمكن حفظ باقة أو بوكس فقط كجاهز");
      return;
    }

    if (entry.kind === "bouquet") {
      if (entry.data.flowers.length === 0) {
        alert("أضف الورد للباقة أولًا");
        return;
      }

      if (!entry.data.bouquetSizeId) {
        alert("لم يتم تحديد حجم الباقة تلقائيًا");
        return;
      }
    }

    if (entry.kind === "box" && !entry.data.boxVariantId) {
      alert("اختار قالب البوكس أولًا");
      return;
    }

    setReadyName(
      entry.kind === "bouquet"
        ? entry.data.bouquetSizeName
          ? `باقة ${entry.data.bouquetSizeName}`
          : "باقة جاهزة"
        : entry.data.title || "بوكس جاهز"
    );
    setReadyImageUrl("");
    setReadyNotes(entry.data.notes || "");
    setShowReadyDialog(true);
  }

  async function saveAsReady() {
    if (!readyName.trim()) {
      alert("اكتب اسم الجاهز");
      return;
    }

    if (entries.length !== 1) return;

    setSavingReady(true);

    try {
      const [item] = convertEntriesToBuilderItems(entries);

      const result = await saveReadyProduct({
        name: readyName,
        imageUrl: readyImageUrl,
        notes: readyNotes,
        item,
      });

      setShowReadyDialog(false);
      resetOrder();
      await loadPageData();

      alert(
        `تم حفظ الجاهز بنجاح ✅\nرقم الجاهز: ${result.ready_number}`
      );
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      setSavingReady(false);
    }
  }

  function startNewOrder() {
    setSuccessData(null);
    resetOrder();
  }

  if (loading) {
    return (
      <div className="p-8 text-2xl font-bold">
        جاري تحميل طلب جديد...
      </div>
    );
  }

  return (
    <div className="space-y-4 bg-gray-50 p-3 pb-32 sm:space-y-6 sm:p-4 md:p-8 xl:pl-[370px]" dir="rtl">
      <div className="overflow-hidden rounded-2xl bg-gradient-to-l from-emerald-800 via-emerald-700 to-teal-600 p-4 text-white shadow-lg sm:rounded-3xl sm:p-6 sm:shadow-xl">
        <div className="mb-3 flex flex-wrap items-center gap-2 sm:mb-4">
          <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-black backdrop-blur">واجهة الهاتف الجديدة</span>
          <span className="rounded-full bg-amber-300 px-3 py-1 text-xs font-black text-amber-950">Mobile 04</span>
        </div>
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="text-2xl font-black text-white sm:text-3xl md:text-4xl">
              {editingOrderId
                ? `تعديل الطلب #${editingOrderNumber}`
                : "طلب جديد"}
            </h1>
            <p className="mt-2 max-w-2xl text-sm font-medium text-emerald-50 md:text-base">
              أضف بيانات العميل، اختار المنتج، راجع السعر المباشر ثم احفظ الطلب من نفس الشاشة.
            </p>
          </div>
          <div className="w-full rounded-2xl border border-white/20 bg-white/15 px-4 py-3 text-center backdrop-blur sm:min-w-[190px] md:w-auto md:px-5 md:py-4">
            <p className="text-xs font-bold text-emerald-50">الإجمالي الحالي المباشر</p>
            <p className="mt-1 text-3xl font-black text-white">{finalTotal.toFixed(2)} د.ل</p>
            <p className="mt-1 text-[11px] text-emerald-100">يتغير فور تعديل أي عنصر</p>
          </div>
        </div>
      </div>

      <nav className="sticky top-2 z-20 flex gap-2 overflow-x-auto rounded-2xl border border-gray-100 bg-white/95 p-2 shadow-lg backdrop-blur">
        {[
          [1, "العميل"], [2, "الطلب"], [3, "التوصيل"], [4, "الدفع"], [5, "المراجعة"],
        ].map(([step, label]) => (
          <button key={step} type="button" onClick={() => setCurrentStep(Number(step))}
            className={`min-w-[108px] flex-1 rounded-xl px-3 py-3 text-center text-sm font-black ${currentStep === step ? "bg-emerald-700 text-white" : Number(step) < currentStep ? "bg-emerald-50 text-emerald-700" : "bg-gray-50 text-gray-600"}`}>
            {Number(step) < currentStep ? "✓ " : ""}{step}. {label}
          </button>
        ))}
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <span>{draftSaved ? "المسودة محفوظة تلقائيًا" : "سيتم الحفظ تلقائيًا أثناء الكتابة"}</span>
        {lastAutoSavedAt && <span>آخر حفظ: {new Date(lastAutoSavedAt).toLocaleTimeString("ar-LY", { hour: "2-digit", minute: "2-digit" })}</span>}
      </div>

      {draftSaved && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-700">
          توجد نسخة مسودة محفوظة على هذا الجهاز.
        </div>
      )}

      {currentStep === 1 && (
      <section id="customer-section" className="scroll-mt-28 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setCustomerExpanded((current) => !current)}
          className="flex w-full items-center justify-between gap-3 p-4 text-right sm:p-5"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xl">👤</span>
              <h2 className="text-lg font-black text-gray-900 sm:text-xl">بيانات العميل</h2>
              {customerComplete && (
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-black text-emerald-700">مكتملة ✓</span>
              )}
            </div>
            {!customerExpanded && (
              <div className="mt-2 space-y-1 text-sm text-gray-600">
                <p className="truncate font-bold text-gray-900">{customer.customerName || "لم يكتب اسم العميل"}</p>
                <p dir="ltr" className="text-right">{customer.customerPhone || "لا يوجد رقم هاتف"}</p>
                {(customer.deliveryDate || customer.deliveryTime) && (
                  <p>{[customer.deliveryDate, customer.deliveryTime].filter(Boolean).join(" · ")}</p>
                )}
              </div>
            )}
          </div>
          <span className="shrink-0 rounded-xl bg-gray-100 px-3 py-2 text-sm font-black text-gray-700">
            {customerExpanded ? "طي القسم ▲" : "تعديل ▼"}
          </span>
        </button>

        {customerExpanded && (
          <div className="border-t border-gray-100 p-3 sm:p-5">
            <CustomerInfo
              value={customer}
              onChange={(value) => {
                setCustomer(value);
                setDraftSaved(false);
              }}
            />
            <button
              type="button"
              disabled={!customerComplete}
              onClick={() => { setCustomerExpanded(false); setCurrentStep(2); }}
              className="mt-4 w-full rounded-xl bg-emerald-700 px-5 py-3.5 font-black text-white disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500"
            >
              حفظ بيانات العميل والمتابعة للمنتجات
            </button>
          </div>
        )}
      </section>

      )}

      {currentStep === 2 && (
      <>
      <section id="items-section" className="scroll-mt-28 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setItemsExpanded((current) => !current)}
          className="flex w-full items-center justify-between gap-3 p-4 text-right sm:p-5"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xl">🛍️</span>
              <h2 className="text-lg font-black text-gray-900 sm:text-xl">منتجات الطلب</h2>
              {itemsComplete && (
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-black text-emerald-700">{entries.length} عنصر ✓</span>
              )}
            </div>
            {!itemsExpanded && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-600">
                <span>{entries.length ? `${entries.length} عنصر` : "لم تتم إضافة منتجات"}</span>
                <span className="text-gray-300">•</span>
                <span className="font-black text-emerald-700">{productsTotal.toFixed(2)} د.ل</span>
              </div>
            )}
          </div>
          <span className="shrink-0 rounded-xl bg-gray-100 px-3 py-2 text-sm font-black text-gray-700">
            {itemsExpanded ? "طي القسم ▲" : "فتح وتعديل ▼"}
          </span>
        </button>

        {itemsExpanded && (
          <div className="space-y-5 border-t border-gray-100 p-3 sm:p-5">
            <div>
              <h3 className="text-base font-black text-gray-900 sm:text-lg">إضافة منتج</h3>
              <p className="mt-1 text-xs text-gray-500 sm:text-sm">اختار النوع، وتفتح تفاصيله في شاشة مناسبة للهاتف.</p>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <button type="button" onClick={addBouquet} className="rounded-2xl border-2 border-emerald-100 bg-emerald-50 p-3 text-center transition active:scale-[0.98] sm:p-5 sm:hover:border-emerald-500 sm:hover:shadow-md">
                <span className="text-2xl sm:text-3xl">🌹</span>
                <span className="mt-2 block text-sm font-black text-emerald-800 sm:text-lg">باقة</span>
              </button>
              <button type="button" onClick={addBox} className="rounded-2xl border-2 border-purple-100 bg-purple-50 p-3 text-center transition active:scale-[0.98] sm:p-5 sm:hover:border-purple-500 sm:hover:shadow-md">
                <span className="text-2xl sm:text-3xl">🎁</span>
                <span className="mt-2 block text-sm font-black text-purple-800 sm:text-lg">بوكس</span>
              </button>
              <button type="button" onClick={addSingleProduct} className="rounded-2xl border-2 border-blue-100 bg-blue-50 p-3 text-center transition active:scale-[0.98] sm:p-5 sm:hover:border-blue-500 sm:hover:shadow-md">
                <span className="text-2xl sm:text-3xl">🛍️</span>
                <span className="mt-2 block text-sm font-black text-blue-800 sm:text-lg">منتج</span>
              </button>
            </div>

            <div className="space-y-3">
              {entries.map((entry, index) => {
                const entryPrice = calculateEntriesTotal([entry]);
                return (
                  <div key={entry.data.tempId} className="rounded-2xl border border-gray-100 bg-gray-50 p-3 transition hover:border-emerald-200 sm:p-4">
                    <div className="flex items-start justify-between gap-3">
                      <button type="button" onClick={() => setOpenEntryId(entry.data.tempId)} className="min-w-0 flex-1 text-right">
                        <h3 className="truncate text-base font-black text-gray-900 sm:text-lg">
                          {entry.kind === "bouquet" ? `🌹 باقة رقم ${index + 1}` : entry.kind === "box" ? `🎁 بوكس رقم ${index + 1}` : `🛍️ ${entry.data.productName || `منتج رقم ${index + 1}`}`}
                        </h3>
                        <p className="mt-1 truncate text-xs text-gray-500 sm:text-sm">
                          {entry.kind === "bouquet" ? `${getBouquetFlowerTotal(entry.data)} وردة` : entry.kind === "box" ? entry.data.title || "لم يتم اختيار قالب البوكس" : entry.data.productName || "لم يتم اختيار المنتج"}
                        </p>
                      </button>
                      <p className="shrink-0 text-base font-black text-emerald-700 sm:text-xl">{entryPrice.toFixed(2)} د.ل</p>
                    </div>
                    <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                      <button type="button" onClick={() => setOpenEntryId(entry.data.tempId)} className="rounded-xl bg-gray-900 px-3 py-2.5 text-sm font-black text-white active:scale-[0.98]">تعديل التفاصيل</button>
                      <button type="button" onClick={() => removeEntry(entry.data.tempId)} className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-black text-red-700 active:scale-[0.98]">حذف</button>
                    </div>
                  </div>
                );
              })}

              {entries.length === 0 && (
                <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 p-7 text-center text-gray-500">
                  <div className="text-3xl">＋</div>
                  <p className="mt-2 text-sm font-bold">اضغط على باقة أو بوكس أو منتج للبدء.</p>
                </div>
              )}
            </div>

            {entries.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setItemsExpanded(false);
                  window.setTimeout(() => document.getElementById("payment-section")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
                }}
                className="w-full rounded-xl bg-emerald-700 px-5 py-3.5 font-black text-white"
              >
                تم إضافة المنتجات والمتابعة للدفع
              </button>
            )}
          </div>
        )}
      </section>

      {totals.bouquetFlowers > 0 && (
        <section className="rounded-2xl bg-white p-6 shadow">
          <h2 className="mb-5 text-2xl font-bold">
            ملخص ورد الباقات الطبيعية
          </h2>

          <div className="mb-5 rounded-2xl bg-emerald-50 p-5 text-center">
            <p className="text-gray-500">إجمالي الورد الطبيعي</p>
            <p className="mt-2 text-4xl font-bold text-emerald-700">
              {totals.bouquetFlowers}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px]">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-3 text-right">نوع الورد</th>
                  <th className="p-3 text-right">اللون</th>
                  <th className="p-3 text-right">العدد</th>
                </tr>
              </thead>
              <tbody>
                {flowerSummary.map((flower) => (
                  <tr key={flower.key} className="border-b">
                    <td className="p-3 font-semibold">{flower.name}</td>
                    <td className="p-3">{flower.color || "-"}</td>
                    <td className="p-3 font-bold">{flower.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
      </section>
      )}

      <div className="flex justify-between gap-3">
        <button type="button" onClick={() => setCurrentStep(1)} className="rounded-xl bg-gray-100 px-6 py-3 font-black">السابق</button>
        <button type="button" onClick={() => setCurrentStep(3)} className="rounded-xl bg-emerald-700 px-6 py-3 font-black text-white">التالي: التوصيل</button>
      </div>
      </>
      )}

      {currentStep === 3 && (
        <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
          <PaymentSection value={payment} mode="delivery" onChange={(value) => { setPayment(value); setDraftSaved(false); }} />
          <div className="mt-5 flex justify-between gap-3"><button type="button" onClick={() => setCurrentStep(2)} className="rounded-xl bg-gray-100 px-6 py-3 font-black">السابق</button><button type="button" onClick={() => setCurrentStep(4)} className="rounded-xl bg-emerald-700 px-6 py-3 font-black text-white">التالي: الدفع</button></div>
        </section>
      )}

      {currentStep === 4 && (
        <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
          <PaymentSection value={payment} mode="payment" onChange={(value) => { setPayment(value); setDraftSaved(false); }} />
          <div className="mt-5 flex justify-between gap-3"><button type="button" onClick={() => setCurrentStep(3)} className="rounded-xl bg-gray-100 px-6 py-3 font-black">السابق</button><button type="button" onClick={() => setCurrentStep(5)} className="rounded-xl bg-emerald-700 px-6 py-3 font-black text-white">التالي: المراجعة</button></div>
        </section>
      )}

      {currentStep === 5 && (
        <div>
      <div className="mb-4 flex items-center justify-between gap-3"><button type="button" onClick={() => setCurrentStep(4)} className="rounded-xl bg-gray-100 px-5 py-3 font-black">السابق</button><span className="text-sm font-bold text-gray-500">راجع الطلب ثم احفظه</span></div>
      <div id="save-section" className="scroll-mt-28 rounded-3xl border-2 border-emerald-100 bg-white p-6 shadow-lg">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div>
            <p className="text-gray-500">الإجمالي النهائي</p>
            <p className="mt-1 text-4xl font-bold text-emerald-700">
              {finalTotal.toFixed(2)} د.ل
            </p>
            <p className="mt-2 text-sm text-gray-500">
              المدفوع: {totalPaid.toFixed(2)} د.ل
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={saving || !hasUnsavedChanges}
              onClick={saveDraft}
              className="rounded-xl bg-blue-100 px-7 py-4 font-bold text-blue-700 disabled:opacity-50"
            >
              حفظ كمسودة
            </button>

            <button
              type="button"
              disabled={saving}
              onClick={() => {
                if (
                  entries.length === 0 ||
                  confirm("هل تريد مسح الطلب بالكامل؟")
                ) {
                  resetOrder();
                }
              }}
              className="rounded-xl border px-7 py-4 font-bold disabled:opacity-50"
            >
              مسح الطلب
            </button>

            {!editingOrderId && (
              <button
                type="button"
                disabled={saving || savingReady || entries.length === 0}
                onClick={openReadyDialog}
                className="rounded-xl bg-purple-700 px-8 py-4 text-lg font-bold text-white disabled:opacity-50"
              >
                📦 حفظ كجاهز
              </button>
            )}

            <button
              type="button"
              disabled={saving}
              onClick={() => void saveOrder()}
              className="rounded-xl bg-emerald-700 px-10 py-4 text-lg font-bold text-white disabled:opacity-50"
            >
              {saving
                ? "جاري الحفظ..."
                : editingOrderId
                  ? "حفظ تعديلات الطلب"
                  : "حفظ الطلب"}
            </button>
          </div>
        </div>
      </div>

        </div>
      )}

      {openEntryId && (() => {
        const selectedEntry = entries.find((entry) => entry.data.tempId === openEntryId);
        if (!selectedEntry) return null;

        return (
          <div className="fixed inset-0 z-[65] flex items-end justify-center bg-black/50 sm:items-center sm:p-6">
            <div className="h-[100dvh] w-full overflow-y-auto bg-gray-50 shadow-2xl sm:h-auto sm:max-h-[94vh] sm:max-w-5xl sm:rounded-3xl" dir="rtl">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white/95 p-4 backdrop-blur sm:p-5">
                <div>
                  <h2 className="text-xl font-black text-gray-900 sm:text-2xl">
                    {selectedEntry.kind === "bouquet"
                      ? "تعديل الباقة"
                      : selectedEntry.kind === "box"
                        ? "تعديل البوكس"
                        : "تعديل المنتج"}
                  </h2>
                  <p className="mt-1 text-sm text-gray-500">السعر يتحدث مباشرة في ملخص الطلب.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpenEntryId(null)}
                  className="rounded-xl bg-gray-100 px-4 py-2 text-lg font-black text-gray-700 hover:bg-gray-200"
                >
                  ✕
                </button>
              </div>

              <div className="p-4 sm:p-6">
                {selectedEntry.kind === "bouquet" ? (
                  <BouquetBuilder
                    bouquet={selectedEntry.data}
                    bouquetSizes={bouquetSizes}
                    materials={materials}
                    onChange={(updatedBouquet) =>
                      updateEntry({ kind: "bouquet", data: updatedBouquet })
                    }
                    onRemove={() => removeEntry(selectedEntry.data.tempId)}
                  />
                ) : selectedEntry.kind === "box" ? (
                  <BoxBuilder
                    box={selectedEntry.data}
                    boxVariants={boxVariants}
                    materials={materials}
                    onChange={(updatedBox) =>
                      updateEntry({ kind: "box", data: updatedBox })
                    }
                    onRemove={() => removeEntry(selectedEntry.data.tempId)}
                  />
                ) : (
                  <SingleProductEditor
                    product={selectedEntry.data}
                    materials={materials}
                    onChange={(updatedProduct) =>
                      updateEntry({ kind: "single", data: updatedProduct })
                    }
                    onRemove={() => removeEntry(selectedEntry.data.tempId)}
                  />
                )}
              </div>

              <div className="sticky bottom-0 border-t bg-white/95 p-4 backdrop-blur">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-gray-500">سعر العنصر</p>
                    <p className="text-xl font-black text-emerald-700">
                      {calculateEntriesTotal([selectedEntry]).toFixed(2)} د.ل
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpenEntryId(null)}
                    className="rounded-xl bg-emerald-700 px-8 py-3 font-black text-white hover:bg-emerald-800"
                  >
                    تم
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      <aside className="fixed left-6 top-24 z-30 hidden w-[330px] xl:block">
        <LiveOrderSummary
          entries={entries}
          customerName={customer.customerName}
          deliveryFee={Number(payment.deliveryFee || 0)}
          discount={Number(payment.discount || 0)}
          paidAmount={totalPaid}
          finalTotal={finalTotal}
          validationErrors={validateOrder()}
        />
      </aside>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] backdrop-blur xl:hidden">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3" dir="rtl">
          <button
            type="button"
            onClick={() => setShowMobileSummary(true)}
            className="min-w-0 text-right"
          >
            <p className="text-xs text-gray-500">إجمالي الطلب · عرض التفاصيل</p>
            <p className="text-xl font-black text-emerald-700">{finalTotal.toFixed(2)} د.ل</p>
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void saveOrder()}
            className="min-h-12 rounded-xl bg-emerald-700 px-5 py-3 font-black text-white disabled:opacity-50"
          >
            {saving ? "جاري الحفظ..." : editingOrderId ? "حفظ التعديلات" : "حفظ الطلب"}
          </button>
        </div>
      </div>

      {showMobileSummary && (
        <div className="fixed inset-0 z-[75] bg-black/50 xl:hidden" onClick={() => setShowMobileSummary(false)}>
          <div
            className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-3xl bg-white p-4"
            dir="rtl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-black">تفاصيل السعر</h2>
              <button
                type="button"
                onClick={() => setShowMobileSummary(false)}
                className="rounded-xl bg-gray-100 px-4 py-2 font-black"
              >
                ✕
              </button>
            </div>
            <LiveOrderSummary
              entries={entries}
              customerName={customer.customerName}
              deliveryFee={Number(payment.deliveryFee || 0)}
              discount={Number(payment.discount || 0)}
              paidAmount={totalPaid}
              finalTotal={finalTotal}
              validationErrors={validateOrder()}
            />
          </div>
        </div>
      )}

      {showReadyDialog && (
        <ReadyProductDialog
          name={readyName}
          imageUrl={readyImageUrl}
          notes={readyNotes}
          sellPrice={entries.length === 1
            ? calculateEntriesTotal(entries)
            : 0}
          saving={savingReady}
          onNameChange={setReadyName}
          onImageUrlChange={setReadyImageUrl}
          onNotesChange={setReadyNotes}
          onClose={() => setShowReadyDialog(false)}
          onSave={() => void saveAsReady()}
        />
      )}

      {successData && (
        <SuccessDialog
          orderNumber={successData.orderNumber}
          onPrint={() => printOrderInvoices(successData)}
          onWhatsApp={() =>
            openInvoiceWhatsApp({
              id: 0,
              branchId: effectiveBranchId,
              orderNumber: successData.orderNumber,
              customerName: successData.customer.customerName,
              customerPhone: successData.customer.customerPhone,
              occasion: successData.customer.occasion || "",
              deliveryDate: successData.customer.deliveryDate || "",
              deliveryTime: successData.customer.deliveryTime || "",
              deliveryAddress: successData.payment.deliveryAddress || successData.customer.address || "",
              notes: successData.customer.notes || "",
              productsTotal: successData.productsTotal,
              deliveryFee: Number(successData.payment.deliveryFee || 0),
              discount: Number(successData.payment.discount || 0),
              total: successData.finalTotal,
              paidAmount: successData.totalPaid,
              remainingAmount: Math.max(
                0,
                successData.finalTotal - successData.totalPaid
              ),
              cashAmount: Number(successData.payment.cashAmount || 0),
              bankAmount: Number(successData.payment.bankAmount || 0),
              transferAmount: Number(successData.payment.transferAmount || 0),
              depositAmount: Number(successData.payment.depositAmount || 0),
              paymentMethod: successData.payment.paymentMethod || "",
              deliveryPaymentMethod:
                successData.payment.deliveryPaymentMethod || "",
              deliveryStatus: successData.payment.deliveryStatus || "pending",
              deliveryDriverName:
                successData.payment.deliveryDriverName || "",
              deliveryCompanyName:
                successData.payment.deliveryCompanyName || "",
              status: "saved",
              createdAt: new Date().toISOString(),
              items: successData.items.map((item, index) => ({
                id: String(index + 1),
                itemType: item.itemType,
                title: item.title || "عنصر طلب",
                sellPrice: Number(item.sellPrice || 0),
                notes: item.notes || "",
                components: (item.components || []).map(
                  (component, componentIndex) => ({
                    id: String(componentIndex + 1),
                    name: component.componentName || "مكوّن",
                    section: component.section || "",
                    quantity: Number(component.quantity || 0),
                    isExternal: Boolean(component.isExternal),
                  })
                ),
              })),
            })
          }
          onNewOrder={startNewOrder}
        />
      )}
    </div>
  );
}


function LiveOrderSummary({
  entries,
  customerName,
  deliveryFee,
  discount,
  paidAmount,
  finalTotal,
  validationErrors,
}: {
  entries: NewOrderEntry[];
  customerName: string;
  deliveryFee: number;
  discount: number;
  paidAmount: number;
  finalTotal: number;
  validationErrors: string[];
}) {
  const remaining = Math.max(0, finalTotal - paidAmount);

  return (
    <div className="max-h-[calc(100vh-7rem)] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-5 shadow-xl" dir="rtl">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-black">ملخص الطلب المباشر</h2>
          <p className="mt-1 text-xs text-gray-500">يتحدث تلقائيًا مع كل إضافة أو تعديل</p>
        </div>
        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">مباشر</span>
      </div>

      {customerName.trim() && (
        <div className="mb-4 rounded-xl bg-gray-50 p-3">
          <p className="text-xs text-gray-500">العميل</p>
          <p className="font-bold">{customerName}</p>
        </div>
      )}

      <div className="space-y-3">
        {entries.map((entry, index) => {
          const entryTotal = calculateEntriesTotal([entry]);
          return (
            <div key={entry.data.tempId} className="rounded-xl border border-gray-100 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="font-black">
                  {entry.kind === "bouquet"
                    ? `🌹 باقة ${index + 1}`
                    : entry.kind === "box"
                      ? `🎁 بوكس ${index + 1}`
                      : `🛍️ ${entry.data.productName || `منتج ${index + 1}`}`}
                </p>
                <p className="font-black text-emerald-700">{entryTotal.toFixed(2)} د.ل</p>
              </div>

              <div className="mt-2 space-y-1 text-xs text-gray-600">
                {entry.kind === "bouquet" && (
                  <>
                    {Number(entry.data.bouquetSizePrice || 0) > 0 && (
                      <SummaryPriceLine label={entry.data.bouquetSizeName || "حجم الباقة"} quantity={1} unitPrice={Number(entry.data.bouquetSizePrice || 0)} />
                    )}
                    {entry.data.flowers.map((flower) => (
                      <SummaryPriceLine key={flower.tempId} label={`${flower.name}${flower.color ? ` - ${flower.color}` : ""}`} quantity={Number(flower.quantity || 0)} unitPrice={Number(flower.unitPrice || 0)} />
                    ))}
                    {entry.data.externalPurchases.map((item) => (
                      <SummaryPriceLine key={item.tempId} label={item.name || "محتوى خارجي"} quantity={Number(item.quantity || 0)} unitPrice={Number(item.unitPrice || 0)} />
                    ))}
                    {entry.data.wrappingOptions.length > 0 && (
                      <p className="pt-1 text-gray-500">الغلاف: {entry.data.wrappingOptions.map((item) => item.name).join("، ")}</p>
                    )}
                  </>
                )}

                {entry.kind === "box" && (
                  <>
                    {Number(entry.data.boxPrice || 0) > 0 && (
                      <SummaryPriceLine label={entry.data.title || "سعر البوكس"} quantity={1} unitPrice={Number(entry.data.boxPrice || 0)} />
                    )}
                    {entry.data.additions.map((item) => (
                      <SummaryPriceLine key={item.tempId} label={item.name} quantity={Number(item.quantity || 0)} unitPrice={Number(item.unitPrice || 0)} />
                    ))}
                    {entry.data.externalPurchases.map((item) => (
                      <SummaryPriceLine key={item.tempId} label={item.name || "محتوى خارجي"} quantity={Number(item.quantity || 0)} unitPrice={Number(item.unitPrice || 0)} />
                    ))}
                  </>
                )}

                {entry.kind === "single" && entry.data.productDetailId && (
                  <SummaryPriceLine label={entry.data.productName || "منتج"} quantity={Number(entry.data.quantity || 0)} unitPrice={Number(entry.data.unitPrice || 0)} />
                )}
              </div>
            </div>
          );
        })}

        {entries.length === 0 && (
          <div className="rounded-xl border border-dashed p-5 text-center text-sm text-gray-400">
            أضف منتجًا ليظهر تفصيل السعر هنا.
          </div>
        )}
      </div>

      <div className="mt-4 space-y-2 border-t pt-4 text-sm">
        <div className="flex justify-between"><span>التوصيل</span><b>{deliveryFee.toFixed(2)} د.ل</b></div>
        <div className="flex justify-between"><span>الخصم</span><b className="text-red-600">- {discount.toFixed(2)} د.ل</b></div>
        <div className="flex justify-between text-lg"><span className="font-black">الإجمالي</span><b className="text-emerald-700">{finalTotal.toFixed(2)} د.ل</b></div>
        <div className="flex justify-between"><span>المدفوع</span><b>{paidAmount.toFixed(2)} د.ل</b></div>
        <div className="flex justify-between"><span>المتبقي</span><b className={remaining > 0 ? "text-red-600" : "text-emerald-700"}>{remaining.toFixed(2)} د.ل</b></div>
      </div>

      <div className="mt-4 rounded-xl bg-gray-50 p-3">
        <p className="mb-2 text-sm font-black">حالة اكتمال الطلب</p>
        {validationErrors.length === 0 ? (
          <p className="text-sm font-bold text-emerald-700">✓ الطلب جاهز للحفظ</p>
        ) : (
          <div className="space-y-1">
            {validationErrors.slice(0, 4).map((error) => (
              <p key={error} className="text-xs text-amber-700">⚠ {error}</p>
            ))}
            {validationErrors.length > 4 && <p className="text-xs text-gray-500">و{validationErrors.length - 4} ملاحظات أخرى</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryPriceLine({ label, quantity, unitPrice }: { label: string; quantity: number; unitPrice: number }) {
  const total = quantity * unitPrice;
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="min-w-0 flex-1 truncate">{label} {quantity !== 1 ? `× ${quantity}` : ""}</span>
      <span className="shrink-0 font-bold">{total.toFixed(2)} د.ل</span>
    </div>
  );
}


const singleInputClass =
  "w-full rounded-xl border border-gray-200 bg-white p-3 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100";

function SingleProductEditor({
  product,
  materials,
  onChange,
  onRemove,
}: {
  product: SingleProductDraft;
  materials: OrderMaterial[];
  onChange: (product: SingleProductDraft) => void;
  onRemove: () => void;
}) {
  const [searchText, setSearchText] = useState("");

  const availableMaterials = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    return materials
      .filter((material) => Number(material.stock || 0) > 0)
      .filter((material) => {
        if (!keyword) return true;

        return [
          material.productName,
          material.name,
          material.categoryName,
          material.materialType,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(keyword);
      })
      .sort((a, b) =>
        getMaterialDisplayName(a).localeCompare(
          getMaterialDisplayName(b),
          "ar"
        )
      );
  }, [materials, searchText]);

  function selectMaterial(value: string) {
    const material = materials.find(
      (entry) => String(entry.id) === value
    );

    if (!material) {
      onChange({
        ...product,
        productDetailId: null,
        productName: "",
        stock: 0,
        unitCost: 0,
        unitPrice: 0,
      });
      return;
    }

    onChange({
      ...product,
      productDetailId: material.id,
      productName: getMaterialDisplayName(material),
      stock: Number(material.stock || 0),
      unitCost: Number(getMaterialCost(material) || 0),
      unitPrice: Number(material.sellPrice || 0),
      quantity: Math.min(
        Math.max(Number(product.quantity || 1), 1),
        Number(material.stock || 0)
      ),
    });
  }

  const lineTotal =
    Number(product.quantity || 0) *
    Number(product.unitPrice || 0);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
        <h4 className="text-lg font-bold text-blue-800">
          منتج فردي من المخزون
        </h4>
        <p className="mt-1 text-sm text-blue-700">
          مناسب لبيع بوكس فارغ أو كرت أو قاعدة أو أي قطعة بدون قالب.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="mb-2 block font-semibold">
            بحث عن المنتج
          </label>
          <input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            className={singleInputClass}
            placeholder="اكتب اسم المنتج أو القسم"
          />
        </div>

        <div>
          <label className="mb-2 block font-semibold">
            اختار المنتج
          </label>
          <select
            value={product.productDetailId || ""}
            onChange={(event) => selectMaterial(event.target.value)}
            className={singleInputClass}
          >
            <option value="">اختار من المخزون</option>
            {availableMaterials.map((material) => (
              <option key={material.id} value={material.id}>
                {getMaterialDisplayName(material)} — متوفر{" "}
                {Number(material.stock || 0)} — سعر{" "}
                {Number(material.sellPrice || 0).toFixed(2)} د.ل
              </option>
            ))}
          </select>
        </div>
      </div>

      {product.productDetailId && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-2 block font-semibold">الكمية</label>
            <input
              type="number"
              min="1"
              max={Math.max(Number(product.stock || 0), 1)}
              value={product.quantity}
              onChange={(event) =>
                onChange({
                  ...product,
                  quantity: Number(event.target.value || 0),
                })
              }
              className={singleInputClass}
            />
            <p className="mt-1 text-sm text-gray-500">
              المتوفر: {product.stock}
            </p>
          </div>

          <div>
            <label className="mb-2 block font-semibold">
              سعر بيع الوحدة
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={product.unitPrice}
              onChange={(event) =>
                onChange({
                  ...product,
                  unitPrice: Number(event.target.value || 0),
                })
              }
              className={singleInputClass}
            />
          </div>

          <div>
            <label className="mb-2 block font-semibold">
              الإجمالي
            </label>
            <div className="rounded-xl bg-emerald-50 p-3 text-xl font-bold text-emerald-700">
              {lineTotal.toFixed(2)} د.ل
            </div>
          </div>
        </div>
      )}

      <div>
        <label className="mb-2 block font-semibold">ملاحظات</label>
        <textarea
          value={product.notes}
          onChange={(event) =>
            onChange({
              ...product,
              notes: event.target.value,
            })
          }
          className={singleInputClass}
          rows={3}
          placeholder="أي ملاحظة تخص المنتج"
        />
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onRemove}
          className="rounded-xl bg-red-100 px-5 py-3 font-bold text-red-700"
        >
          حذف المنتج من الطلب
        </button>
      </div>
    </div>
  );
}

function ReadyProductDialog({
  name,
  imageUrl,
  notes,
  sellPrice,
  saving,
  onNameChange,
  onImageUrlChange,
  onNotesChange,
  onClose,
  onSave,
}: {
  name: string;
  imageUrl: string;
  notes: string;
  sellPrice: number;
  saving: boolean;
  onNameChange: (value: string) => void;
  onImageUrlChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
      <div
        className="w-full max-w-xl rounded-3xl bg-white p-7 shadow-2xl"
        dir="rtl"
      >
        <h2 className="text-2xl font-bold">حفظ كجاهز</h2>
        <p className="mt-2 text-gray-500">
          سيتم خصم مكونات الباقة أو البوكس من المخزون، ولن يتم إنشاء طلب عميل.
        </p>

        <div className="mt-6 space-y-4">
          <div>
            <label className="mb-2 block font-semibold">
              اسم الجاهز
            </label>
            <input
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              className="w-full rounded-xl border p-3"
              placeholder="مثال: باقة جوري حمراء"
            />
          </div>

          <div>
            <label className="mb-2 block font-semibold">
              سعر البيع
            </label>
            <div className="rounded-xl bg-emerald-50 p-4 text-2xl font-bold text-emerald-700">
              {sellPrice.toFixed(2)} د.ل
            </div>
          </div>

          <div>
            <label className="mb-2 block font-semibold">
              رابط الصورة (اختياري)
            </label>
            <input
              value={imageUrl}
              onChange={(event) =>
                onImageUrlChange(event.target.value)
              }
              className="w-full rounded-xl border p-3"
              placeholder="رابط صورة الجاهز"
            />
          </div>

          <div>
            <label className="mb-2 block font-semibold">
              ملاحظات
            </label>
            <textarea
              value={notes}
              onChange={(event) =>
                onNotesChange(event.target.value)
              }
              className="w-full rounded-xl border p-3"
              rows={3}
            />
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-xl border px-5 py-3 font-bold disabled:opacity-50"
          >
            إلغاء
          </button>

          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="flex-1 rounded-xl bg-purple-700 px-5 py-3 font-bold text-white disabled:opacity-50"
          >
            {saving ? "جاري الحفظ..." : "حفظ كجاهز"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SuccessDialog({
  orderNumber,
  onPrint,
  onWhatsApp,
  onNewOrder,
}: {
  orderNumber: string;
  onPrint: () => void;
  onWhatsApp: () => void;
  onNewOrder: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
      <div
        className="w-full max-w-lg rounded-3xl bg-white p-7 text-center shadow-2xl"
        dir="rtl"
      >
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-4xl text-emerald-700">
          ✓
        </div>

        <h2 className="mt-5 text-2xl font-bold">
          تم إنشاء الطلب بنجاح
        </h2>

        <p className="mt-2 text-gray-500">
          تم حفظ الطلب، ويمكنك الآن طباعة الفاتورتين أو إرسال ملخص الفاتورة للزبون عبر واتساب.
        </p>

        <div className="mt-5 rounded-2xl bg-gray-50 p-5">
          <p className="text-sm text-gray-500">رقم الطلب</p>
          <p className="mt-2 text-2xl font-bold text-emerald-700">
            {orderNumber}
          </p>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={onPrint}
            className="rounded-xl bg-blue-700 px-6 py-4 font-bold text-white"
          >
            🖨️ طباعة الفاتورتين
          </button>

          <button
            type="button"
            onClick={() => {
              try { onWhatsApp(); }
              catch (error) { alert(error instanceof Error ? error.message : "تعذر فتح واتساب"); }
            }}
            className="rounded-xl bg-green-600 px-6 py-4 font-bold text-white"
          >
            📱 إرسال واتساب
          </button>

          <button
            type="button"
            onClick={onNewOrder}
            className="rounded-xl bg-emerald-700 px-6 py-4 font-bold text-white"
          >
            ➕ إنشاء طلب جديد
          </button>
        </div>
      </div>
    </div>
  );
}

function printOrderInvoices(data: SuccessData) {
  const printWindow = window.open(
    "",
    "_blank",
    "width=900,height=900"
  );

  if (!printWindow) {
    alert(
      "تعذر فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة لهذا الموقع ثم جرّب مرة أخرى."
    );
    return;
  }

  const customerRows = data.items
    .map(
      (item, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(item.title || "عنصر طلب")}</td>
          <td>1</td>
          <td>${Number(item.sellPrice || 0).toFixed(2)}</td>
          <td>${Number(item.sellPrice || 0).toFixed(2)}</td>
        </tr>
      `
    )
    .join("");

  const productionItems = data.items
    .map((item, index) => {
      const componentRows = (item.components || [])
        .map(
          (component) => `
            <li>
              ${escapeHtml(component.componentName || "مكوّن")}
              — الكمية: ${Number(component.quantity || 0)}
            </li>
          `
        )
        .join("");

      const externalRows = (item.externalContents || [])
        .map(
          (external) => `
            <li>
              محتوى خارجي: ${escapeHtml(external.itemName || "")}
              — الكمية: ${Number(external.quantity || 0)}
              ${
                external.description
                  ? `— ${escapeHtml(external.description)}`
                  : ""
              }
            </li>
          `
        )
        .join("");

      const wrappingRows = (item.wrappingOptions || [])
        .map(
          (option) => `
            <li>
              لون غلاف مختار: ${escapeHtml(
                option.materialName || "غلاف"
              )}
              — يحدد موظف التغليف الكمية الفعلية
            </li>
          `
        )
        .join("");

      const details =
        componentRows || externalRows || wrappingRows
          ? `<ul>${componentRows}${wrappingRows}${externalRows}</ul>`
          : `<p class="muted">لا توجد مكونات مسجلة.</p>`;

      return `
        <section class="production-item">
          <h3>${index + 1}. ${escapeHtml(item.title || "عنصر طلب")}</h3>
          ${details}
          ${
            item.notes
              ? `<p><strong>ملاحظات:</strong> ${escapeHtml(
                  item.notes
                )}</p>`
              : ""
          }
        </section>
      `;
    })
    .join("");

  const deliveryMethod =
    data.payment.deliveryPaymentMethod === "cash"
      ? "المحل يدفع للكابتن كاش"
      : data.payment.deliveryPaymentMethod === "bank"
        ? "التوصيل مدفوع للمحل"
        : data.payment.deliveryPaymentMethod === "customer_paid"
          ? "الزبون يدفع للكابتن مباشرة"
          : "بدون توصيل";

  const remaining = data.finalTotal - data.totalPaid;

  const html = `
    <!doctype html>
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <title>فواتير الطلب ${escapeHtml(data.orderNumber)}</title>
        <style>
          @page {
            size: A6 portrait;
            margin: 6mm;
          }

          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            background: #fff;
            color: #111;
            font-family: Arial, Tahoma, sans-serif;
            font-size: 10px;
          }

          .invoice-page {
            width: 100%;
            min-height: 136mm;
            padding: 1mm;
            page-break-after: always;
          }

          .invoice-page:last-child {
            page-break-after: auto;
          }

          .header {
            text-align: center;
            border-bottom: 2px solid #111;
            padding-bottom: 5px;
            margin-bottom: 7px;
          }

          .brand {
            font-size: 20px;
            font-weight: 800;
            letter-spacing: 1px;
          }

          .invoice-title {
            margin-top: 3px;
            font-size: 13px;
            font-weight: 700;
          }

          .meta {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 4px 8px;
            margin-bottom: 7px;
          }

          .meta div {
            border-bottom: 1px dashed #aaa;
            padding-bottom: 2px;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 5px;
          }

          th,
          td {
            border: 1px solid #333;
            padding: 4px 3px;
            text-align: right;
            vertical-align: top;
          }

          th {
            background: #f1f1f1;
          }

          .totals {
            margin-top: 7px;
            border: 1px solid #333;
          }

          .totals-row {
            display: flex;
            justify-content: space-between;
            padding: 4px 6px;
            border-bottom: 1px solid #ddd;
          }

          .totals-row:last-child {
            border-bottom: 0;
            font-size: 13px;
            font-weight: 800;
          }

          .notes {
            margin-top: 7px;
            border: 1px solid #777;
            padding: 5px;
          }

          .footer {
            margin-top: 8px;
            text-align: center;
            font-size: 9px;
          }

          .production-item {
            border: 1px solid #333;
            padding: 5px;
            margin-bottom: 6px;
            page-break-inside: avoid;
          }

          .production-item h3 {
            margin: 0 0 4px;
            font-size: 12px;
          }

          ul {
            margin: 3px 0;
            padding-right: 17px;
          }

          li {
            margin-bottom: 3px;
          }

          .muted {
            color: #666;
          }

          .important {
            font-size: 12px;
            font-weight: 800;
          }

          @media screen {
            body {
              background: #ddd;
              padding: 15px;
            }

            .invoice-page {
              max-width: 105mm;
              margin: 0 auto 15px;
              background: white;
              box-shadow: 0 0 8px rgba(0, 0, 0, .15);
            }
          }
        </style>
      </head>

      <body>
        <section class="invoice-page">
          <header class="header">
            <div class="brand">MOOD | مود</div>
            <div class="invoice-title">فاتورة العميل</div>
          </header>

          <div class="meta">
            <div><strong>رقم الطلب:</strong> ${escapeHtml(
              data.orderNumber
            )}</div>
            <div><strong>التاريخ:</strong> ${escapeHtml(
              new Date().toLocaleString("ar-LY")
            )}</div>
            <div><strong>العميل:</strong> ${escapeHtml(
              data.customer.customerName || "-"
            )}</div>
            <div><strong>الهاتف:</strong> ${escapeHtml(
              data.customer.customerPhone || "-"
            )}</div>
            <div><strong>المناسبة:</strong> ${escapeHtml(
              data.customer.occasion || "-"
            )}</div>
            <div><strong>موعد التسليم:</strong> ${escapeHtml(
              [data.customer.deliveryDate, data.customer.deliveryTime]
                .filter(Boolean)
                .join(" — ") || "-"
            )}</div>
          </div>

          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>البيان</th>
                <th>الكمية</th>
                <th>السعر</th>
                <th>الإجمالي</th>
              </tr>
            </thead>
            <tbody>${customerRows}</tbody>
          </table>

          <div class="totals">
            <div class="totals-row">
              <span>إجمالي المنتجات</span>
              <strong>${Number(data.productsTotal).toFixed(2)} د.ل</strong>
            </div>
            <div class="totals-row">
              <span>التوصيل</span>
              <strong>${Number(data.payment.deliveryFee || 0).toFixed(
                2
              )} د.ل</strong>
            </div>
            ${
              Number(data.payment.discount || 0) > 0
                ? `
                  <div class="totals-row">
                    <span>الخصم</span>
                    <strong>-${Number(
                      data.payment.discount || 0
                    ).toFixed(2)} د.ل</strong>
                  </div>
                `
                : ""
            }
            <div class="totals-row">
              <span>الإجمالي النهائي</span>
              <strong>${Number(data.finalTotal).toFixed(2)} د.ل</strong>
            </div>
            <div class="totals-row">
              <span>المدفوع</span>
              <strong>${Number(data.totalPaid).toFixed(2)} د.ل</strong>
            </div>
            <div class="totals-row">
              <span>المتبقي</span>
              <strong>${Number(remaining).toFixed(2)} د.ل</strong>
            </div>
          </div>

          ${
            data.customer.notes
              ? `
                <div class="notes">
                  <strong>ملاحظات:</strong>
                  ${escapeHtml(data.customer.notes)}
                </div>
              `
              : ""
          }

          <div class="footer">
            شكرًا لاختياركم MOOD
          </div>
        </section>

        <section class="invoice-page">
          <header class="header">
            <div class="brand">MOOD | مود</div>
            <div class="invoice-title">فاتورة الإنتاج والتغليف</div>
          </header>

          <div class="meta">
            <div><strong>رقم الطلب:</strong> ${escapeHtml(
              data.orderNumber
            )}</div>
            <div><strong>العميل:</strong> ${escapeHtml(
              data.customer.customerName || "-"
            )}</div>
            <div><strong>الهاتف:</strong> ${escapeHtml(
              data.customer.customerPhone || "-"
            )}</div>
            <div><strong>موعد التسليم:</strong> ${escapeHtml(
              [data.customer.deliveryDate, data.customer.deliveryTime]
                .filter(Boolean)
                .join(" — ") || "-"
            )}</div>
            <div><strong>مكان التوصيل:</strong> ${escapeHtml(
              data.payment.deliveryAddress ||
                data.customer.address ||
                "-"
            )}</div>
            <div><strong>الكابتن:</strong> ${escapeHtml(
              data.payment.deliveryDriverName || "-"
            )}</div>
          </div>

          ${productionItems}

          ${
            Number(data.payment.deliveryFee || 0) > 0
              ? `
                <div class="notes">
                  <div class="important">بيانات التوصيل</div>
                  <div>قيمة التوصيل: ${Number(
                    data.payment.deliveryFee || 0
                  ).toFixed(2)} د.ل</div>
                  <div>طريقة دفع التوصيل: ${escapeHtml(
                    deliveryMethod
                  )}</div>
                </div>
              `
              : ""
          }

          ${
            data.customer.notes
              ? `
                <div class="notes">
                  <strong>ملاحظات الطلب:</strong>
                  ${escapeHtml(data.customer.notes)}
                </div>
              `
              : ""
          }
        </section>

        <script>
          window.addEventListener("load", function () {
            window.focus();
            setTimeout(function () {
              window.print();
            }, 250);
          });

          window.addEventListener("afterprint", function () {
            window.close();
          });
        </script>
      </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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