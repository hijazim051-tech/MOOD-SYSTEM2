import { useEffect, useMemo, useState } from "react";
import PrintDialog from "../components/printing/PrintDialog";
import OrderReturnDialog from "../components/OrderReturnDialog";
import type { PrintableOrder as PrintOrder } from "../components/printing/types";
import { supabase } from "../lib/supabase";
import { useBranch } from "../context/BranchContext";
import { moveToTrash } from "../lib/trash";
import { openInvoiceWhatsApp, sendAutomaticWhatsApp } from "../lib/whatsapp";
import { refreshWhatsAppSettings } from "../lib/whatsappSettings";
import { transferOrderToBranch } from "../lib/branchStock";
import {
  reopenOrder,
  resetOrderPackagingForEdit,
} from "../lib/orderEditWorkflow";
import { sendSystemPush } from "../lib/pushNotifications";

type PackagingUsage = {
  usagePrice: number;
  quantity: number;
  lineValue: number;
};

type ExternalContent = {
  id: string;
  itemName: string;
  description: string;
  quantity: number;
  unitCost: number;
  unitSellPrice: number;
  totalCost: number;
  totalSellPrice: number;
  supplierName: string;
  notes: string;
};

type PackagingItem = {
  id: number;
  title: string;
  itemType: string;
  sellPrice: number;
  contentValue: number;
  packagingStatus: string;
  packagingActualValue: number;
  packagingDifference: number;
  packagingStartedAt: string;
  packagingCompletedAt: string;
  notes: string;
  packagingImageUrl: string;
  usage: PackagingUsage[];
  externalContents: ExternalContent[];
};

type DriverMoneyStatus =
  | "not_applicable"
  | "received_now"
  | "with_driver"
  | "settled";

type Order = PrintOrder & {
  recipientPhone: string;
  packagingItems: PackagingItem[];
  isLocked: boolean;
  deliveryDriverPhone: string;
  handedToDriverAt: string;
  deliveredAt: string;
  driverCollectionAmount: number;
  driverMoneyStatus: DriverMoneyStatus;
  driverMoneyReceivedAt: string;
  driverMoneyNotes: string;
  branchId: string | null;
  branchName?: string;
  balanceAmount?: number;
};

type Props = {
  setPage?: (page: string) => void;
  userRole?: string;
  viewMode?: "shop" | "drivers";
};

type DriverForm = {
  driverName: string;
  driverPhone: string;
  amount: string;
  moneyStatus: "received_now" | "with_driver";
  notes: string;
};

type CollectionMethod = "cash" | "bank" | "balance";

type CollectionForm = {
  amount: string;
  method: CollectionMethod;
};

type DriverSummary = {
  key: string;
  driverName: string;
  driverPhone: string;
  activeOrders: Order[];
  openMoneyOrders: Order[];
  ordersCount: number;
  amountDue: number;
};

const statusOptions = [
  { value: "packaging", label: "قيد التغليف" },
  { value: "ready", label: "جاهز" },
  { value: "out_for_delivery", label: "خرج للتوصيل" },
  { value: "delivered", label: "تم التسليم" },
  { value: "cancelled", label: "ملغي" },
  { value: "returned", label: "مُرجع" },
  { value: "partially_returned", label: "إرجاع جزئي" },
];

const statusTabs = [
  { value: "all", label: "كل الطلبات" },
  { value: "packaging", label: "قيد التغليف" },
  { value: "ready", label: "جاهزة" },
  { value: "out_for_delivery", label: "خرجت للتوصيل" },
  { value: "delivered", label: "تم التسليم" },
  { value: "cancelled", label: "ملغاة" },
  { value: "returned", label: "مرتجعة" },
  { value: "partially_returned", label: "إرجاع جزئي" },
];

const inputClass =
  "w-full rounded-xl border border-gray-200 bg-white p-3 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";

export default function Orders({
  setPage,
  userRole = "employee",
  viewMode = "shop",
}: Props) {
  const { effectiveBranchId } = useBranch();
  const [orders, setOrders] = useState<Order[]>([]);
  const [savedDrivers, setSavedDrivers] = useState<Array<{ name: string; phone: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [busyOrderId, setBusyOrderId] = useState<number | null>(null);
  const [deletingOrderId, setDeletingOrderId] = useState<number | null>(null);

  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [printOrder, setPrintOrder] = useState<PrintOrder | null>(null);
  const [driverOrder, setDriverOrder] = useState<Order | null>(null);
  const [returnOrder, setReturnOrder] = useState<Order | null>(null);
  const [collectionOrder, setCollectionOrder] = useState<Order | null>(null);
  const [collectionForm, setCollectionForm] = useState<CollectionForm>({
    amount: "0",
    method: "cash",
  });
  const [selectedDriver, setSelectedDriver] =
    useState<DriverSummary | null>(null);
  const [driverForm, setDriverForm] = useState<DriverForm>({
    driverName: "",
    driverPhone: "",
    amount: "0",
    moneyStatus: "with_driver",
    notes: "",
  });
  const driverDirectory = useMemo(() => {
    const map = new Map<string, { name: string; phone: string }>();
    for (const driver of savedDrivers) {
      const name = driver.name.trim();
      if (!name) continue;
      map.set(name.toLowerCase(), { name, phone: driver.phone.trim() });
    }
    for (const order of orders) {
      const name = order.deliveryDriverName.trim();
      const phone = order.deliveryDriverPhone.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (!map.has(key)) map.set(key, { name, phone });
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "ar"));
  }, [orders, savedDrivers]);

  useEffect(() => {
    void loadOrders();
  }, [effectiveBranchId]);

  async function loadOrders() {
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("orders")
        .select(`
          *,
          order_custom_items (
            id,
            item_type,
            title,
            sell_price,
            notes,
            order_custom_item_components (
              id,
              component_name,
              section,
              quantity,
              is_external
            )
          ),
          order_items (
            id,
            item_type,
            title,
            sell_price,
            notes,
            content_value,
            packaging_status,
            packaging_actual_value,
            packaging_value_difference,
            packaging_started_at,
            packaging_completed_at,
            packaging_image_url,
            order_item_usage_tiers (
              usage_price,
              quantity,
              line_value
            ),
            order_item_external_contents (
              id,
              item_name,
              description,
              quantity,
              unit_cost,
              unit_sell_price,
              total_cost,
              total_sell_price,
              supplier_name,
              notes
            )
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const branchRows = effectiveBranchId
        ? (data || []).filter((row: any) => String(row.branch_id || "") === effectiveBranchId)
        : (data || []);
      const formattedOrders: Order[] = branchRows.map((order: any) => ({
        id: Number(order.id),
        branchId: order.branch_id || null,
        orderNumber: order.order_number || String(order.id),
        customerName: order.customer_name || "",
        customerPhone: order.customer_phone || "",
        recipientPhone: order.recipient_phone || "",
        occasion: order.occasion || "",
        deliveryDate: order.delivery_date || "",
        deliveryTime: order.delivery_time || "",
        deliveryAddress: order.delivery_address || order.address || "",
        notes: order.notes || "",
        productsTotal: Number(order.products_total || 0),
        deliveryFee: Number(order.delivery_fee || 0),
        discount: Number(order.discount || 0),
        total: Number(order.total || 0),
        paidAmount: Number(order.paid_amount || 0),
        remainingAmount: Number(order.remaining_amount || 0),
        cashAmount: Number(order.cash_amount || 0),
        bankAmount: Number(order.bank_amount || 0),
        transferAmount: Number(order.transfer_amount || 0),
        balanceAmount: Number(order.balance_amount || 0),
        depositAmount: Number(order.deposit_amount || 0),
        paymentMethod: order.payment_method || "cash",
        deliveryPaymentMethod: order.delivery_payment_method || "none",
        deliveryStatus: order.delivery_status || "pending",
        deliveryDriverName: order.delivery_driver_name || "",
        deliveryDriverPhone: order.delivery_driver_phone || "",
        deliveryCompanyName: order.delivery_company_name || "",
        handedToDriverAt: order.handed_to_driver_at || "",
        deliveredAt: order.delivered_at || "",
        driverCollectionAmount: Number(order.driver_collection_amount || 0),
        driverMoneyStatus:
          (order.driver_money_status as DriverMoneyStatus) || "not_applicable",
        driverMoneyReceivedAt: order.driver_money_received_at || "",
        driverMoneyNotes: order.driver_money_notes || "",
        status: normalizeStatus(order.status),
        createdAt: order.created_at,
        isLocked: Boolean(order.is_locked),
        items: (order.order_custom_items || []).map((item: any) => ({
          id: item.id,
          itemType: item.item_type || "custom",
          title: item.title || "عنصر طلب",
          sellPrice: Number(item.sell_price || 0),
          notes: item.notes || "",
          components: (item.order_custom_item_components || []).map(
            (component: any) => ({
              id: component.id,
              name: component.component_name || "مكون",
              section: component.section || "additions",
              quantity: Number(component.quantity || 0),
              isExternal: Boolean(component.is_external),
            })
          ),
        })),
        packagingItems: (order.order_items || []).map((item: any) => ({
          id: Number(item.id),
          title: String(item.title || "عنصر طلب"),
          itemType: String(item.item_type || "custom"),
          sellPrice: Number(item.sell_price || 0),
          contentValue: Number(item.content_value || 0),
          packagingStatus: String(item.packaging_status || "pending"),
          packagingActualValue: Number(item.packaging_actual_value || 0),
          packagingDifference: Number(item.packaging_value_difference || 0),
          packagingStartedAt: String(item.packaging_started_at || ""),
          packagingCompletedAt: String(item.packaging_completed_at || ""),
          notes: String(item.notes || ""),
          packagingImageUrl: String(item.packaging_image_url || ""),
          usage: (item.order_item_usage_tiers || []).map((usage: any) => ({
            usagePrice: Number(usage.usage_price || 0),
            quantity: Number(usage.quantity || 0),
            lineValue: Number(usage.line_value || 0),
          })),
          externalContents: (item.order_item_external_contents || []).map(
            (external: any) => ({
              id: String(external.id),
              itemName: String(external.item_name || ""),
              description: String(external.description || ""),
              quantity: Number(external.quantity || 0),
              unitCost: Number(external.unit_cost || 0),
              unitSellPrice: Number(external.unit_sell_price || 0),
              totalCost: Number(external.total_cost || 0),
              totalSellPrice: Number(external.total_sell_price || 0),
              supplierName: String(external.supplier_name || ""),
              notes: String(external.notes || ""),
            })
          ),
        })),
      }));

      setOrders(formattedOrders);

      let driversQuery = supabase
        .from("delivery_drivers")
        .select("name,phone,is_active,branch_id")
        .eq("is_active", true)
        .order("name");
      if (effectiveBranchId) driversQuery = driversQuery.eq("branch_id", effectiveBranchId);
      const { data: driversData, error: driversError } = await driversQuery;
      if (driversError) {
        console.warn("تعذر تحميل المندوبين المحفوظين:", driversError.message);
      } else {
        setSavedDrivers((driversData || []).map((row: any) => ({
          name: String(row.name || ""),
          phone: String(row.phone || ""),
        })));
      }
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  const filteredOrders = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return orders.filter((order) => {
      if (viewMode === "shop" && order.status === "out_for_delivery") return false;
      if (viewMode === "drivers" && order.status !== "out_for_delivery") return false;
      const searchableText = [
        order.orderNumber,
        order.customerName,
        order.customerPhone,
        order.occasion,
        order.deliveryDriverName,
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch = !keyword || searchableText.includes(keyword);
      const matchesDate = dateFilter
        ? formatDateInput(order.createdAt) === dateFilter
        : true;
      const matchesStatus =
        statusFilter === "all" || order.status === statusFilter;

      return matchesSearch && matchesDate && matchesStatus;
    });
  }, [orders, search, dateFilter, statusFilter, viewMode]);

  const statistics = useMemo(() => {
    const scopedOrders = orders.filter((order) =>
      viewMode === "drivers"
        ? order.status === "out_for_delivery"
        : order.status !== "out_for_delivery"
    );
    return {
      total: scopedOrders.length,
      packaging: scopedOrders.filter((order) => order.status === "packaging").length,
      ready: scopedOrders.filter((order) => order.status === "ready").length,
      delivery: scopedOrders.filter((order) => order.status === "out_for_delivery").length,
      delivered: scopedOrders.filter((order) => order.status === "delivered").length,
    };
  }, [orders, viewMode]);

  const driverSummaries = useMemo<DriverSummary[]>(() => {
    const map = new Map<string, DriverSummary>();

    for (const order of orders) {
      if (
        order.status !== "out_for_delivery" ||
        !order.deliveryDriverName.trim()
      ) {
        continue;
      }

      const normalizedName = order.deliveryDriverName
        .trim()
        .toLowerCase();
      const normalizedPhone = order.deliveryDriverPhone.trim();
      const key = `${normalizedName}__${normalizedPhone}`;

      const current = map.get(key) || {
        key,
        driverName: order.deliveryDriverName.trim(),
        driverPhone: normalizedPhone,
        activeOrders: [],
        openMoneyOrders: [],
        ordersCount: 0,
        amountDue: 0,
      };

      current.activeOrders.push(order);
      current.ordersCount += 1;

      if (
        order.driverMoneyStatus === "with_driver" &&
        order.driverCollectionAmount > 0
      ) {
        current.openMoneyOrders.push(order);
        current.amountDue += Number(
          order.driverCollectionAmount || 0
        );
      }

      map.set(key, current);
    }

    return Array.from(map.values()).sort(
      (a, b) => b.amountDue - a.amountDue
    );
  }, [orders]);

  const outsideMoneyTotal = useMemo(
    () =>
      driverSummaries.reduce(
        (sum, driver) => sum + driver.amountDue,
        0
      ),
    [driverSummaries]
  );

  const activeDriverOrdersCount = useMemo(
    () =>
      driverSummaries.reduce(
        (sum, driver) => sum + driver.ordersCount,
        0
      ),
    [driverSummaries]
  );

  const canDelete = userRole === "owner" || userRole === "admin";

  function openPackaging(order: Order) {
    localStorage.setItem("mood-packaging-order-id", String(order.id));

    if (setPage) {
      setPage("packaging");
      return;
    }

    alert("افتح واجهة التغليف من القائمة الجانبية. تم حفظ رقم الطلب.");
  }

  async function prepareFullEdit(order: Order) {
    if (order.isLocked) {
      alert("الطلب مقفل. أعد فتحه أولًا.");
      return;
    }

    const hasStartedPackaging = order.packagingItems.some(
      (item) => item.packagingStatus !== "pending"
    );

    if (hasStartedPackaging) {
      const confirmed = window.confirm(
        "بدأ أو اكتمل تغليف هذا الطلب. سيتم إرجاع فئات الاستخدام للمخزون وحذف سجل التغليف ثم فتح الطلب للتعديل. هل تريد المتابعة؟"
      );

      if (!confirmed) return;

      try {
        await resetOrderPackagingForEdit(order.id);
      } catch (error: unknown) {
        alert(getErrorMessage(error));
        return;
      }
    }

    localStorage.setItem("mood-edit-order-id", String(order.id));

    if (setPage) {
      setPage("new-order");
      return;
    }

    alert("افتح صفحة طلب جديد لإكمال تعديل الطلب.");
  }

  async function reopenDeliveredOrder(order: Order) {
    const reason = window.prompt("اكتب سبب إعادة فتح الطلب:");
    if (!reason?.trim()) return;

    try {
      await reopenOrder(order.id, reason);
      await loadOrders();
      alert("تمت إعادة فتح الطلب للتعديل ✅");
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    }
  }

  async function markPackagingComplete(order: Order) {
    const summary = getPackagingSummary(order);

    if (summary.total === 0) {
      alert("لا توجد بنود تغليف داخل هذا الطلب.");
      return;
    }

    if (summary.pending > 0) {
      alert(
        `يجب تأكيد جميع البنود داخل واجهة التغليف أولًا. المتبقي: ${summary.pending}`
      );
      return;
    }

    if (!window.confirm("تأكيد أن الطلب تم تغليفه وأصبح جاهزًا؟")) return;

    await updateOrder(order.id, {
      status: "ready",
    });

    try {
      const whatsappSettings = await refreshWhatsAppSettings(order.branchId);
      if (whatsappSettings.sendReadyMessage) await sendAutomaticWhatsApp(order, "ready");
    } catch (error) {
      alert(
        error instanceof Error
          ? `تم تجهيز الطلب، لكن تعذر إرسال رسالة الجاهزية: ${error.message}`
          : "تم تجهيز الطلب، لكن تعذر إرسال رسالة الجاهزية"
      );
    }
  }

  function openCustomerCollection(order: Order) {
    const remaining = Math.max(Math.round(Number(order.remainingAmount || 0)), 0);
    if (remaining <= 0) {
      void completeCustomerCollection(order);
      return;
    }

    setCollectionOrder(order);
    setCollectionForm({ amount: String(remaining), method: "cash" });
  }

  async function completeCustomerCollection(order: Order) {
    if (!window.confirm("تأكيد أن العميل استلم الطلب من المحل؟")) return;

    await updateOrder(order.id, {
      status: "delivered",
      delivered_at: new Date().toISOString(),
      delivery_status: "delivered",
      driver_money_status: "not_applicable",
      driver_collection_amount: 0,
    });

    try {
      const whatsappSettings = await refreshWhatsAppSettings(order.branchId);
      if (whatsappSettings.sendCustomerCollectedMessage)
        await sendAutomaticWhatsApp(order, "customer_collected");
    } catch (error) {
      alert(
        error instanceof Error
          ? `تم تسجيل استلام العميل، لكن تعذر إرسال الرسالة: ${error.message}`
          : "تم تسجيل استلام العميل، لكن تعذر إرسال الرسالة"
      );
    }
  }

  async function submitCustomerCollection() {
    if (!collectionOrder) return;

    const remaining = Math.max(
      Math.round(Number(collectionOrder.remainingAmount || 0)),
      0
    );
    const amount = Math.round(Number(collectionForm.amount || 0));

    if (!Number.isFinite(amount) || amount <= 0) {
      alert("اكتب قيمة الدفعة المستلمة.");
      return;
    }

    if (amount !== remaining) {
      alert(`لا يمكن تسليم الطلب قبل سداد المتبقي كاملًا: ${remaining} د.ل`);
      return;
    }

    const amountColumn =
      collectionForm.method === "cash"
        ? "cash_amount"
        : collectionForm.method === "bank"
          ? "bank_amount"
          : "balance_amount";

    const currentMethodAmount =
      collectionForm.method === "cash"
        ? Number(collectionOrder.cashAmount || 0)
        : collectionForm.method === "bank"
          ? Number(collectionOrder.bankAmount || 0)
          : Number(collectionOrder.balanceAmount || 0);

    setBusyOrderId(collectionOrder.id);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("orders")
        .update({
          paid_amount: Math.round(Number(collectionOrder.paidAmount || 0)) + amount,
          remaining_amount: 0,
          [amountColumn]: Math.round(currentMethodAmount) + amount,
          status: "delivered",
          delivered_at: now,
          delivery_status: "delivered",
          driver_money_status: "not_applicable",
          driver_collection_amount: 0,
        })
        .eq("id", collectionOrder.id);

      if (error) throw error;

      const completedOrder: Order = {
        ...collectionOrder,
        paidAmount: Math.round(Number(collectionOrder.paidAmount || 0)) + amount,
        remainingAmount: 0,
        status: "delivered",
      };

      setCollectionOrder(null);
      setSelectedOrder(null);
      await loadOrders();
      alert(`تم استلام المتبقي ${amount} د.ل وتسليم الطلب ✅`);

      try {
        const whatsappSettings = await refreshWhatsAppSettings(completedOrder.branchId);
        if (whatsappSettings.sendCustomerCollectedMessage)
          await sendAutomaticWhatsApp(completedOrder, "customer_collected");
      } catch (error) {
        alert(
          error instanceof Error
            ? `تم التسليم، لكن تعذر إرسال الرسالة: ${error.message}`
            : "تم التسليم، لكن تعذر إرسال الرسالة"
        );
      }
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      setBusyOrderId(null);
    }
  }

  function openDriverDialog(order: Order) {
    setDriverOrder(order);
    setDriverForm({
      driverName: order.deliveryDriverName || "",
      driverPhone: order.deliveryDriverPhone || "",
      amount: String(Math.max(Math.round(Number(order.remainingAmount || 0)), 0)),
      moneyStatus: "with_driver",
      notes:
        Number(order.remainingAmount || 0) > 0
          ? `مطلوب من المندوب تحصيل المتبقي من المستلم: ${Math.round(Number(order.remainingAmount || 0))} د.ل`
          : "",
    });
  }

  async function submitDriverHandover() {
    if (!driverOrder) return;

    const driverName = driverForm.driverName.trim();
    const remaining = Math.max(Math.round(Number(driverOrder.remainingAmount || 0)), 0);
    const amount = remaining;

    if (!driverName) {
      alert("اكتب اسم المندوب.");
      return;
    }

    if (!Number.isFinite(amount) || amount < 0) {
      alert("المبلغ المطلوب غير صحيح.");
      return;
    }

    setBusyOrderId(driverOrder.id);

    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("orders")
        .update({
          status: "out_for_delivery",
          delivery_status: "out_for_delivery",
          delivery_driver_name: driverName,
          delivery_driver_phone: driverForm.driverPhone.trim() || null,
          handed_to_driver_at: now,
          driver_collection_amount: amount,
          driver_money_status: driverForm.moneyStatus,
          driver_money_received_at:
            driverForm.moneyStatus === "received_now" ? now : null,
          driver_money_notes:
            remaining > 0
              ? `مطلوب تحصيل ${remaining} د.ل من المستلم. ${driverForm.notes.trim()}`.trim()
              : driverForm.notes.trim() ||
                `تم استلام الطلب بواسطة المندوب ${driverName}`,
        })
        .eq("id", driverOrder.id);

      if (error) throw error;

      setDriverOrder(null);
      setSelectedOrder(null);
      await loadOrders();
      alert("تم تسجيل استلام المندوب للطلب ✅");
      void sendSystemPush({
        title: "الطلب خرج للتوصيل",
        message: `الطلب #${driverOrder.orderNumber} مع المندوب ${driverName}`,
        url: "/",
        tag: `driver-handover-${driverOrder.id}`,
      });

      try {
        const whatsappSettings = await refreshWhatsAppSettings(driverOrder.branchId);
        if (whatsappSettings.sendDriverHandoverMessage) await sendAutomaticWhatsApp(
          {
            ...driverOrder,
            delegateName: driverName,
            deliveryDriverName: driverName,
          },
          "driver_handover"
        );
      } catch (error) {
        alert(
          error instanceof Error
            ? `تم تسليم الطلب للمندوب، لكن تعذر إرسال الرسالة: ${error.message}`
            : "تم تسليم الطلب للمندوب، لكن تعذر إرسال الرسالة"
        );
      }
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      setBusyOrderId(null);
    }
  }

  async function settleDriverMoney(order: Order) {
    const confirmed = window.confirm(
      `تأكيد استلام ${order.driverCollectionAmount.toFixed(2)} د.ل من المندوب ${order.deliveryDriverName}؟`
    );

    if (!confirmed) return;

    setBusyOrderId(order.id);

    try {
      const { error } = await supabase.rpc("settle_driver_money", {
        p_order_id: order.id,
        p_notes: "تم استلام المبلغ من صفحة الطلبات",
      });

      if (error) throw error;

      await loadOrders();
      alert("تم استلام المبلغ وإغلاق التسوية ✅");
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      setBusyOrderId(null);
    }
  }

  async function updateOrder(orderId: number, updates: Record<string, unknown>) {
    setBusyOrderId(orderId);

    try {
      const { error } = await supabase
        .from("orders")
        .update(updates)
        .eq("id", orderId);

      if (error) throw error;

      setSelectedOrder(null);
      await loadOrders();
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      setBusyOrderId(null);
    }
  }

  async function cancelOrder(order: Order) {
    if (order.status === "cancelled") return;

    const confirmed = window.confirm(
      "هل تريد إلغاء الطلب؟ ستتم إعادة مكونات الطلب التي خُصمت من المخزون."
    );

    if (!confirmed) return;

    setBusyOrderId(order.id);

    try {
      const { error } = await supabase.rpc("cancel_order_and_restore_stock", {
        p_order_id: order.id,
      });

      if (error) throw error;

      setSelectedOrder(null);
      await loadOrders();
      alert("تم إلغاء الطلب وإرجاع مكوناته إلى المخزون ✅");
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      setBusyOrderId(null);
    }
  }

  async function deleteOrder(order: Order) {
    if (!canDelete) {
      alert("الحذف النهائي متاح للمالك فقط");
      return;
    }

    if (order.status !== "cancelled") {
      alert("يجب إلغاء الطلب وإعادة المخزون أولًا، ثم يمكن حذفه نهائيًا.");
      return;
    }

    const confirmed = window.confirm(
      `نقل الطلب #${order.orderNumber} إلى سلة المحذوفات؟`
    );

    if (!confirmed) return;

    setDeletingOrderId(order.id);

    try {
      await moveToTrash({
        table: "orders",
        id: order.id,
        label: `طلب #${order.orderNumber}`,
        related: [
          { table: "order_items", column: "order_id", value: order.id },
          { table: "order_custom_items", column: "order_id", value: order.id },
        ],
      });

      const { error } = await supabase
        .from("orders")
        .delete()
        .eq("id", order.id);

      if (error) throw error;

      setSelectedOrder(null);
      await loadOrders();
      alert("تم نقل الطلب إلى سلة المحذوفات");
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      setDeletingOrderId(null);
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-2xl font-bold text-gray-700">
        جاري تحميل الطلبات...
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-8" dir="rtl">
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <h1 className="text-3xl font-bold md:text-4xl">{viewMode === "drivers" ? "طلبات المندوبين" : "طلبات المحل"}</h1>
          <p className="mt-1 text-gray-500">
            {viewMode === "drivers" ? "الطلبات الخارجة للتوصيل وتسوية أموال المندوبين" : "الطلبات الموجودة داخل المحل حتى تسليمها للمندوب أو العميل"}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadOrders()}
          className="rounded-xl bg-emerald-700 px-6 py-3 font-semibold text-white"
        >
          تحديث الطلبات
        </button>
      </header>

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-5">
        <StatCard label="إجمالي الطلبات" value={statistics.total} className="text-emerald-700" />
        <StatCard label="قيد التغليف" value={statistics.packaging} className="text-orange-700" />
        <StatCard label="جاهزة" value={statistics.ready} className="text-purple-700" />
        <StatCard label="خرجت للتوصيل" value={statistics.delivery} className="text-blue-700" />
        <StatCard label="تم التسليم" value={statistics.delivered} className="text-green-700" />
      </section>

      {viewMode === "drivers" && (
      <section className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <p className="text-sm font-semibold text-amber-700">
              حسابات المندوبين
            </p>
            <p className="mt-1 text-4xl font-bold text-amber-900">
              {outsideMoneyTotal.toFixed(2)} د.ل
            </p>
            <p className="mt-1 text-sm text-amber-700">
              {driverSummaries.length} مندوب — {activeDriverOrdersCount} طلب معهم حاليًا
            </p>
          </div>
        </div>

        {driverSummaries.length > 0 ? (
          <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {driverSummaries.map((driver) => (
              <div
                key={driver.key}
                className="rounded-2xl bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xl font-bold">
                      {driver.driverName}
                    </p>
                    <p className="mt-1 text-sm text-gray-500">
                      {driver.driverPhone || "لا يوجد رقم هاتف"}
                    </p>
                  </div>
                  <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-bold text-blue-700">
                    {driver.ordersCount} طلب
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-blue-50 p-3 text-center">
                    <p className="text-xs text-blue-600">الطلبات معه</p>
                    <p className="mt-1 text-2xl font-bold text-blue-800">
                      {driver.ordersCount}
                    </p>
                  </div>

                  <div className="rounded-xl bg-amber-50 p-3 text-center">
                    <p className="text-xs text-amber-700">المبلغ عليه</p>
                    <p className="mt-1 text-2xl font-bold text-amber-900">
                      {driver.amountDue.toFixed(2)} د.ل
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedDriver(driver)}
                  className="mt-4 w-full rounded-xl bg-gray-900 px-4 py-3 font-bold text-white"
                >
                  عرض طلبات المندوب
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-xl bg-white p-5 text-center text-gray-500">
            لا توجد طلبات مع المندوبين حاليًا.
          </div>
        )}
      </section>

      )}

      <section className="rounded-2xl bg-white p-5 shadow">
        <div className="mb-4 flex flex-wrap gap-2">
          {statusTabs.filter((tab) => viewMode === "drivers" ? ["all", "out_for_delivery"].includes(tab.value) : tab.value !== "out_for_delivery").map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setStatusFilter(tab.value)}
              className={`rounded-xl px-4 py-2 font-semibold ${
                statusFilter === tab.value
                  ? "bg-emerald-700 text-white"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className={inputClass}
            placeholder="بحث برقم الطلب أو العميل أو الهاتف أو المندوب"
          />
          <input
            type="date"
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value)}
            className={inputClass}
          />
        </div>
      </section>

      <section className="space-y-4">
        {filteredOrders.map((order) => {
          const packagingSummary = getPackagingSummary(order);

          return (
            <article key={order.id} className="rounded-2xl bg-white p-5 shadow md:p-6">
              <div className="flex flex-col justify-between gap-5 lg:flex-row">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-xl font-bold">طلب #{order.orderNumber}</h2>
                    <StatusBadge status={order.status} />
                    {packagingSummary.total > 0 && (
                      <PackagingBadge
                        completed={packagingSummary.completed}
                        total={packagingSummary.total}
                      />
                    )}
                  </div>

                  <p className="mt-2 text-sm text-gray-500">{formatDateTime(order.createdAt)}</p>
                  <p className="mt-3 font-semibold">{order.customerName || "عميل غير مسجل"}</p>
                  <p className="text-gray-500">{order.customerPhone || "-"}</p>

                  {order.status === "out_for_delivery" && (
                    <div className="mt-3 rounded-xl bg-blue-50 p-3 text-sm">
                      <p className="font-bold text-blue-900">
                        ✅ تم استلام الطلب بواسطة المندوب {order.deliveryDriverName || "-"}
                      </p>
                      <p className="mt-1 text-blue-700">
                        وقت الاستلام: {formatDateTime(order.handedToDriverAt)}
                      </p>
                      <p className="mt-1 font-bold text-blue-800">
                        المندوب: {order.deliveryDriverName || "-"}
                      </p>
                      <p className="text-blue-700">
                        المبلغ المطلوب: {order.driverCollectionAmount.toFixed(2)} د.ل
                      </p>
                      <p className="text-blue-700">
                        حالة المال: {getMoneyStatusLabel(order.driverMoneyStatus)}
                      </p>
                    </div>
                  )}
                </div>

                <div className="lg:text-left">
                  <p className="text-gray-500">إجمالي الطلب</p>
                  <p className="text-3xl font-bold text-emerald-700">
                    {order.total.toFixed(2)} د.ل
                  </p>
                  <p className="mt-2 text-sm text-gray-500">
                    المدفوع: {order.paidAmount.toFixed(2)} د.ل
                  </p>
                  <p
                    className={`text-sm font-semibold ${
                      order.remainingAmount > 0 ? "text-red-600" : "text-green-700"
                    }`}
                  >
                    المتبقي: {order.remainingAmount.toFixed(2)} د.ل
                  </p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedOrder(order)}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-white"
                >
                  عرض التفاصيل
                </button>

                <button
                  type="button"
                  onClick={() => {
                    void openInvoiceWhatsApp(order).catch((error) => {
                      alert(error instanceof Error ? error.message : "تعذر تجهيز فاتورة PDF");
                    });
                  }}
                  className="rounded-lg bg-green-600 px-4 py-2 font-semibold text-white"
                >
                  📱 واتساب
                </button>

                {order.status === "packaging" && packagingSummary.pending > 0 && (
                  <button
                    type="button"
                    onClick={() => openPackaging(order)}
                    className="rounded-lg bg-purple-700 px-4 py-2 font-semibold text-white"
                  >
                    🎁 فتح التغليف
                  </button>
                )}

                {order.status === "packaging" && (
                  <button
                    type="button"
                    disabled={busyOrderId === order.id}
                    onClick={() => void markPackagingComplete(order)}
                    className="rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white disabled:opacity-50"
                  >
                    تم التغليف
                  </button>
                )}

                {order.status === "ready" && (
                  <>
                    <button
                      type="button"
                      disabled={busyOrderId === order.id}
                      onClick={() => openCustomerCollection(order)}
                      className="rounded-lg bg-green-700 px-4 py-2 font-semibold text-white disabled:opacity-50"
                    >
                      استلمه العميل
                    </button>
                    <button
                      type="button"
                      onClick={() => openDriverDialog(order)}
                      className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white"
                    >
                      استلمه المندوب
                    </button>
                  </>
                )}

                {!order.isLocked ? (
                  <button
                    type="button"
                    onClick={() => void prepareFullEdit(order)}
                    disabled={
                      order.status === "cancelled" ||
                      order.status === "out_for_delivery" ||
                      order.status === "delivered"
                    }
                    className="rounded-lg bg-orange-100 px-4 py-2 font-semibold text-orange-700 disabled:opacity-40"
                  >
                    ✏️ تعديل كامل
                  </button>
                ) : canDelete ? (
                  <button
                    type="button"
                    onClick={() => void reopenDeliveredOrder(order)}
                    className="rounded-lg bg-yellow-100 px-4 py-2 font-semibold text-yellow-800"
                  >
                    🔓 إعادة فتح
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={() => setPrintOrder(order)}
                  className="rounded-lg bg-gray-800 px-4 py-2 text-white"
                >
                  الطباعة
                </button>

                {order.status !== "cancelled" && order.status !== "delivered" && (
                  <button
                    type="button"
                    disabled={busyOrderId === order.id}
                    onClick={() => void cancelOrder(order)}
                    className="rounded-lg bg-red-100 px-4 py-2 font-semibold text-red-700 disabled:opacity-50"
                  >
                    إلغاء الطلب
                  </button>
                )}

                {canDelete && order.status === "cancelled" && (
                  <button
                    type="button"
                    disabled={deletingOrderId === order.id}
                    onClick={() => void deleteOrder(order)}
                    className="rounded-lg bg-red-700 px-4 py-2 font-semibold text-white disabled:opacity-50"
                  >
                    حذف نهائي
                  </button>
                )}
              </div>
            </article>
          );
        })}

        {filteredOrders.length === 0 && (
          <div className="rounded-2xl bg-white p-12 text-center text-gray-500 shadow">
            لا توجد طلبات مطابقة.
          </div>
        )}
      </section>

      {selectedOrder && (
        <OrderDetailsDialog
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onPrint={() => setPrintOrder(selectedOrder)}
          onPackaging={() => openPackaging(selectedOrder)}
          onReturn={() => { setReturnOrder(selectedOrder); setSelectedOrder(null); }}
          onTransferred={async () => { setSelectedOrder(null); await loadOrders(); }}
        />
      )}

      {selectedDriver && (
        <DriverAccountDialog
          driver={selectedDriver}
          busyOrderId={busyOrderId}
          onClose={() => setSelectedDriver(null)}
          onOpenOrder={(order) => {
            setSelectedDriver(null);
            setSelectedOrder(order);
          }}
          onSettle={async (order) => {
            await settleDriverMoney(order);
            const refreshedOrders = orders.filter(
              (current) => current.id !== order.id
            );
            const stillOpen = selectedDriver.activeOrders.filter(
              (current) => current.id !== order.id
            );

            if (stillOpen.length === 0) {
              setSelectedDriver(null);
            } else {
              setSelectedDriver((current) =>
                current
                  ? {
                      ...current,
                      activeOrders: stillOpen,
                      openMoneyOrders:
                        current.openMoneyOrders.filter(
                          (entry) => entry.id !== order.id
                        ),
                      ordersCount: stillOpen.length,
                      amountDue: Math.max(
                        0,
                        current.amountDue -
                          Number(order.driverCollectionAmount || 0)
                      ),
                    }
                  : null
              );
            }

            void refreshedOrders;
          }}
        />
      )}

      {collectionOrder && (
        <Modal title="تحصيل المتبقي قبل التسليم" onClose={() => setCollectionOrder(null)}>
          <div className="space-y-5">
            <div className="rounded-xl bg-red-50 p-4 text-red-800">
              <p className="font-bold">لا يمكن تسليم الطلب قبل سداد المتبقي كاملًا.</p>
              <p className="mt-2 text-2xl font-black">
                المتبقي: {Math.round(Number(collectionOrder.remainingAmount || 0))} د.ل
              </p>
            </div>

            <Field label="المبلغ المستلم الآن">
              <input
                type="number"
                min="0"
                step="1"
                className={inputClass}
                value={collectionForm.amount}
                onChange={(event) =>
                  setCollectionForm((current) => ({
                    ...current,
                    amount: event.target.value,
                  }))
                }
              />
            </Field>

            <Field label="طريقة استلام المتبقي">
              <select
                className={inputClass}
                value={collectionForm.method}
                onChange={(event) =>
                  setCollectionForm((current) => ({
                    ...current,
                    method: event.target.value as CollectionMethod,
                  }))
                }
              >
                <option value="cash">كاش</option>
                <option value="bank">مصرف</option>
                <option value="balance">رصيد</option>
              </select>
            </Field>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setCollectionOrder(null)}
                className="rounded-xl bg-gray-100 px-6 py-3 font-semibold"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={busyOrderId === collectionOrder.id}
                onClick={() => void submitCustomerCollection()}
                className="rounded-xl bg-emerald-700 px-6 py-3 font-semibold text-white disabled:opacity-50"
              >
                تحصيل وتسليم الطلب
              </button>
            </div>
          </div>
        </Modal>
      )}

      {driverOrder && (
        <Modal
          title={`تسليم الطلب #${driverOrder.orderNumber} للمندوب`}
          onClose={() => setDriverOrder(null)}
        >
          <div className="space-y-4">
            <Field label="اسم المندوب *">
              <input
                className={inputClass}
                value={driverForm.driverName}
                list="mood-driver-directory"
                onChange={(event) => {
                  const name = event.target.value;
                  const match = driverDirectory.find(
                    (driver) => driver.name.toLowerCase() === name.trim().toLowerCase()
                  );
                  setDriverForm((current) => ({
                    ...current,
                    driverName: name,
                    driverPhone: match?.phone || current.driverPhone,
                  }));
                }}
                placeholder="اكتب أول حروف اسم المندوب"
              />
              <datalist id="mood-driver-directory">
                {driverDirectory.map((driver) => (
                  <option key={`${driver.name}-${driver.phone}`} value={driver.name}>
                    {driver.phone}
                  </option>
                ))}
              </datalist>
            </Field>

            <Field label="رقم هاتف المندوب">
              <input
                className={inputClass}
                value={driverForm.driverPhone}
                onChange={(event) =>
                  setDriverForm((current) => ({
                    ...current,
                    driverPhone: event.target.value,
                  }))
                }
                placeholder="رقم الهاتف"
              />
            </Field>

            <Field label="المبلغ المطلوب من المندوب">
              <input
                type="number"
                min="0"
                step="1"
                className={`${inputClass} bg-gray-50 font-bold`}
                value={driverForm.amount}
                readOnly
              />
              {Number(driverForm.amount || 0) > 0 && (
                <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-800">
                  يجب على المندوب تحصيل هذا المبلغ من المستلم.
                </p>
              )}
            </Field>

            <Field label="حالة المال">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <button
                  type="button"
                  onClick={() =>
                    setDriverForm((current) => ({
                      ...current,
                      moneyStatus: "received_now",
                    }))
                  }
                  className={`rounded-xl border p-4 text-right font-semibold ${
                    driverForm.moneyStatus === "received_now"
                      ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                      : "border-gray-200"
                  }`}
                >
                  سلّم المال فورًا
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setDriverForm((current) => ({
                      ...current,
                      moneyStatus: "with_driver",
                    }))
                  }
                  className={`rounded-xl border p-4 text-right font-semibold ${
                    driverForm.moneyStatus === "with_driver"
                      ? "border-amber-600 bg-amber-50 text-amber-800"
                      : "border-gray-200"
                  }`}
                >
                  المبلغ ما زال مع المندوب
                </button>
              </div>
            </Field>

            <Field label="ملاحظات">
              <textarea
                className={inputClass}
                value={driverForm.notes}
                onChange={(event) =>
                  setDriverForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                rows={3}
              />
            </Field>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDriverOrder(null)}
                className="rounded-xl bg-gray-100 px-6 py-3 font-semibold"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={busyOrderId === driverOrder.id}
                onClick={() => void submitDriverHandover()}
                className="rounded-xl bg-blue-700 px-6 py-3 font-semibold text-white disabled:opacity-50"
              >
                تأكيد استلام المندوب
              </button>
            </div>
          </div>
        </Modal>
      )}


      {returnOrder && (
        <OrderReturnDialog
          orderId={returnOrder.id}
          orderNumber={returnOrder.orderNumber}
          orderTotal={returnOrder.total}
          branchId={returnOrder.branchId}
          onClose={() => setReturnOrder(null)}
          onCompleted={loadOrders}
        />
      )}

      {printOrder && (
        <PrintDialog order={printOrder} onClose={() => setPrintOrder(null)} />
      )}
    </div>
  );
}

function DriverAccountDialog({
  driver,
  busyOrderId,
  onClose,
  onOpenOrder,
  onSettle,
}: {
  driver: DriverSummary;
  busyOrderId: number | null;
  onClose: () => void;
  onOpenOrder: (order: Order) => void;
  onSettle: (order: Order) => Promise<void>;
}) {
  return (
    <Modal
      title={`حساب المندوب: ${driver.driverName}`}
      onClose={onClose}
      maxWidth="max-w-5xl"
    >
      <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-3">
        <InfoCard
          label="عدد الطلبات معه"
          value={String(driver.ordersCount)}
        />
        <InfoCard
          label="المبلغ المطلوب منه"
          value={`${driver.amountDue.toFixed(2)} د.ل`}
        />
        <InfoCard
          label="رقم الهاتف"
          value={driver.driverPhone || "-"}
        />
      </div>

      <div className="space-y-4">
        {driver.activeOrders.map((order) => {
          const moneyOpen =
            order.driverMoneyStatus === "with_driver" &&
            order.driverCollectionAmount > 0;

          return (
            <div
              key={order.id}
              className="rounded-2xl border bg-white p-5"
            >
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-bold">
                      طلب #{order.orderNumber}
                    </h3>
                    <StatusBadge status={order.status} />
                  </div>
                  <p className="mt-2 font-semibold">
                    {order.customerName || "عميل"}
                  </p>
                  <p className="text-sm text-gray-500">
                    {order.customerPhone || "-"}
                  </p>
                  <p className="mt-2 text-sm text-blue-700">
                    تم استلامه: {formatDateTime(order.handedToDriverAt)}
                  </p>
                </div>

                <div className="lg:text-left">
                  <p className="text-sm text-gray-500">
                    المبلغ المطلوب من المندوب
                  </p>
                  <p className="text-2xl font-bold text-amber-800">
                    {order.driverCollectionAmount.toFixed(2)} د.ل
                  </p>
                  <p className="mt-1 text-sm font-semibold">
                    {getMoneyStatusLabel(order.driverMoneyStatus)}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => onOpenOrder(order)}
                  className="rounded-xl bg-blue-100 px-4 py-2 font-bold text-blue-700"
                >
                  عرض الطلب
                </button>

                {moneyOpen && (
                  <button
                    type="button"
                    disabled={busyOrderId === order.id}
                    onClick={() => void onSettle(order)}
                    className="rounded-xl bg-emerald-700 px-4 py-2 font-bold text-white disabled:opacity-50"
                  >
                    تم استلام المبلغ
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

function OrderDetailsDialog({
  order,
  onClose,
  onPrint,
  onPackaging,
  onReturn,
  onTransferred,
}: {
  order: Order;
  onClose: () => void;
  onPrint: () => void;
  onPackaging: () => void;
  onReturn: () => void;
  onTransferred: () => Promise<void>;
}) {
  const packagingSummary = getPackagingSummary(order);
  const { branches } = useBranch();
  const [transferring, setTransferring] = useState(false);

  async function transferOrderBranch() {
    const options = branches.filter((branch) => branch.id !== order.branchId);
    if (options.length === 0) return alert("لا يوجد فرع آخر متاح");
    const choices = options.map((branch, index) => `${index + 1}. ${branch.name}`).join("\n");
    const answer = window.prompt(`اختار رقم الفرع المستلم:\n${choices}`);
    if (!answer) return;
    const target = options[Number(answer) - 1];
    if (!target) return alert("اختيار غير صحيح");
    const reason = window.prompt("سبب تحويل الطلب (اختياري):") || "";
    if (!window.confirm(`تأكيد تحويل الطلب إلى فرع ${target.name}؟`)) return;
    setTransferring(true);
    try {
      await transferOrderToBranch({ orderId: order.id, toBranchId: target.id, reason });
      alert("تم تحويل الطلب للفرع الجديد ✅");
      await onTransferred();
    } catch (error) {
      alert(error instanceof Error ? error.message : "تعذر تحويل الطلب");
    } finally {
      setTransferring(false);
    }
  }

  return (
    <Modal title={`تفاصيل الطلب #${order.orderNumber}`} onClose={onClose} maxWidth="max-w-5xl">
      <p className="mb-5 text-gray-500">{formatDateTime(order.createdAt)}</p>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <InfoCard label="اسم العميل" value={order.customerName || "-"} />
        <InfoCard label="رقم الزبون" value={order.customerPhone || "-"} />
        <InfoCard label="رقم مستلم الهدية" value={order.recipientPhone || "-"} />
        <InfoCard label="المناسبة" value={order.occasion || "-"} />
        <InfoCard
          label="موعد التسليم"
          value={[order.deliveryDate, order.deliveryTime].filter(Boolean).join(" — ") || "-"}
        />
        <InfoCard label="عنوان التوصيل" value={order.deliveryAddress || "-"} />
        <InfoCard label="الحالة" value={getStatusLabel(order.status)} />
        <InfoCard label="الفرع" value={order.branchName || branches.find((b) => b.id === order.branchId)?.name || "غير محدد"} />
      </div>

      {!['delivered','cancelled','returned','partially_returned'].includes(order.status) && (
        <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h3 className="font-bold text-blue-900">تحويل الطلب لفرع آخر</h3><p className="text-sm text-blue-700">يتغير الفرع المسؤول عن الطلب. المخزون المخصوم سابقًا يبقى مسجلًا على الفرع الأصلي، ويمكن تعويضه من صفحة نقل المخزون.</p></div>
            <button disabled={transferring} onClick={() => void transferOrderBranch()} className="rounded-xl bg-blue-700 px-4 py-3 font-bold text-white disabled:opacity-50">{transferring ? "جاري التحويل..." : "تحويل الطلب"}</button>
          </div>
        </div>
      )}

      {order.handedToDriverAt && (
        <div className="mb-6 rounded-xl bg-blue-50 p-5">
          <h3 className="mb-2 text-lg font-bold text-blue-900">
            ✅ تم استلام الطلب بواسطة المندوب
          </h3>
          <p className="mb-4 text-sm text-blue-700">
            وقت الاستلام: {formatDateTime(order.handedToDriverAt)}
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <InfoCard label="اسم المندوب" value={order.deliveryDriverName || "-"} />
            <InfoCard label="هاتف المندوب" value={order.deliveryDriverPhone || "-"} />
            <InfoCard
              label="المبلغ المطلوب"
              value={`${order.driverCollectionAmount.toFixed(2)} د.ل`}
            />
            <InfoCard
              label="حالة المال"
              value={getMoneyStatusLabel(order.driverMoneyStatus)}
            />
          </div>
        </div>
      )}

      {order.notes && (
        <div className="mb-6 rounded-xl bg-yellow-50 p-4">
          <p className="text-sm text-gray-500">ملاحظات الطلب</p>
          <p className="mt-1 font-semibold">{order.notes}</p>
        </div>
      )}

      <h3 className="mb-4 text-xl font-bold">حالة التغليف</h3>

      {order.packagingItems.length === 0 ? (
        <div className="rounded-xl bg-gray-50 p-6 text-center text-gray-500">
          لا توجد بيانات تغليف حديثة لهذا الطلب.
        </div>
      ) : (
        <div className="space-y-4">
          {order.packagingItems.map((item) => (
            <div key={item.id} className="rounded-xl border p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h4 className="text-lg font-bold">{item.title}</h4>
                  <p className="mt-1 text-sm text-gray-500">
                    {getItemTypeLabel(item.itemType)}
                  </p>
                </div>
                <PackagingStatusBadge status={item.packagingStatus} />
              </div>

              {item.contentValue > 0 && (
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <InfoCard label="القيمة المطلوبة" value={`${item.contentValue.toFixed(2)} د.ل`} />
                  <InfoCard label="القيمة المستخدمة" value={`${item.packagingActualValue.toFixed(2)} د.ل`} />
                  <InfoCard label="الفرق" value={`${item.packagingDifference.toFixed(2)} د.ل`} />
                </div>
              )}

              {item.usage.length > 0 && (
                <div className="mt-4 rounded-xl bg-purple-50 p-4">
                  <p className="mb-2 font-bold">فئات الاستخدام</p>
                  <div className="flex flex-wrap gap-2">
                    {item.usage.map((usage, index) => (
                      <span
                        key={`${usage.usagePrice}-${index}`}
                        className="rounded-full bg-white px-3 py-2 text-sm font-semibold"
                      >
                        فئة {usage.usagePrice} × {usage.quantity}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {item.packagingImageUrl && (
                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="font-bold text-emerald-900">صورة تجهيز الطلب — مرجع داخلي فقط</p>
                    <a
                      href={item.packagingImageUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white"
                    >
                      فتح بالحجم الكامل
                    </a>
                  </div>
                  <img
                    src={item.packagingImageUrl}
                    alt={`صورة تجهيز ${item.title}`}
                    className="max-h-96 w-full rounded-xl object-contain bg-white"
                  />
                  <p className="mt-2 text-xs text-emerald-800">هذه الصورة لا تُرسل للعميل وتظهر فقط داخل تفاصيل الطلب.</p>
                </div>
              )}

              {item.externalContents.length > 0 && (
                <div className="mt-4">
                  <p className="mb-3 font-bold">المحتوى الخارجي</p>
                  <div className="space-y-2">
                    {item.externalContents.map((external) => (
                      <div key={external.id} className="rounded-xl bg-gray-50 p-4">
                        <p className="font-bold">
                          {external.itemName} × {external.quantity}
                        </p>
                        {external.description && (
                          <p className="mt-1 text-sm text-gray-500">{external.description}</p>
                        )}
                        <p className="mt-2 text-sm">
                          شراء: {external.totalCost.toFixed(2)} — بيع: {external.totalSellPrice.toFixed(2)} د.ل
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl bg-gray-50 p-5">
          <h3 className="mb-4 text-lg font-bold">الدفع</h3>
          <PaymentRow label="كاش" value={order.cashAmount} />
          <PaymentRow label="خدمات مصرفية" value={order.bankAmount} />
          <PaymentRow label="تحويل" value={order.transferAmount} />
          <PaymentRow label="عربون" value={order.depositAmount} />
          <PaymentRow label="إجمالي المدفوع" value={order.paidAmount} />
        </div>

        <div className="rounded-xl bg-emerald-50 p-5">
          <h3 className="mb-4 text-lg font-bold">الحساب</h3>
          <PaymentRow label="إجمالي المنتجات" value={order.productsTotal} />
          <PaymentRow label="التوصيل" value={order.deliveryFee} />
          <PaymentRow label="الخصم" value={order.discount} />
          <PaymentRow label="الإجمالي" value={order.total} />
          <PaymentRow label="المتبقي" value={order.remainingAmount} />
        </div>
      </div>

      <div className="mt-6 flex flex-wrap justify-end gap-3">
        {order.status === "packaging" && packagingSummary.pending > 0 && (
          <button
            type="button"
            onClick={onPackaging}
            className="rounded-xl bg-purple-700 px-6 py-3 font-semibold text-white"
          >
            فتح التغليف
          </button>
        )}
        {(order.status === "delivered" || order.status === "partially_returned") && (
          <button
            type="button"
            onClick={onReturn}
            className="rounded-xl bg-orange-700 px-6 py-3 font-semibold text-white"
          >
            إرجاع الطلب
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            void openInvoiceWhatsApp(order).catch((error) => {
              alert(error instanceof Error ? error.message : "تعذر تجهيز فاتورة PDF");
            });
          }}
          className="rounded-xl bg-green-600 px-6 py-3 font-semibold text-white"
        >
          إرسال الفاتورة واتساب
        </button>
        <button
          type="button"
          onClick={onPrint}
          className="rounded-xl bg-emerald-700 px-6 py-3 font-semibold text-white"
        >
          الطباعة
        </button>
      </div>
    </Modal>
  );
}

function Modal({
  title,
  onClose,
  children,
  maxWidth = "max-w-3xl",
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        className={`max-h-[92vh] w-full ${maxWidth} overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl`}
        dir="rtl"
      >
        <div className="mb-5 flex items-center justify-between gap-4">
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-2 block font-semibold">{label}</label>
      {children}
    </div>
  );
}

function StatCard({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow">
      <p className="text-gray-500">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${className}`}>{value}</p>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-50 p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

function PaymentRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between border-b py-2 last:border-b-0">
      <span>{label}</span>
      <strong>{Number(value || 0).toFixed(2)} د.ل</strong>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const classes: Record<string, string> = {
    packaging: "bg-orange-100 text-orange-700",
    ready: "bg-purple-100 text-purple-700",
    out_for_delivery: "bg-blue-100 text-blue-700",
    delivered: "bg-green-100 text-green-700",
    cancelled: "bg-red-100 text-red-700",
    returned: "bg-orange-100 text-orange-800",
    partially_returned: "bg-amber-100 text-amber-800",
  };

  return (
    <span
      className={`rounded-full px-3 py-1 text-sm font-semibold ${
        classes[status] || "bg-gray-100 text-gray-700"
      }`}
    >
      {getStatusLabel(status)}
    </span>
  );
}

function PackagingBadge({ completed, total }: { completed: number; total: number }) {
  return (
    <span className="rounded-full bg-purple-100 px-3 py-1 text-sm font-semibold text-purple-700">
      تغليف {completed}/{total}
    </span>
  );
}

function PackagingStatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    pending: "بانتظار التغليف",
    in_progress: "جاري التغليف",
    completed: "مكتمل",
  };

  const classes: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-700",
    in_progress: "bg-orange-100 text-orange-700",
    completed: "bg-green-100 text-green-700",
  };

  return (
    <span
      className={`rounded-full px-3 py-1 text-sm font-semibold ${
        classes[status] || "bg-gray-100 text-gray-700"
      }`}
    >
      {labels[status] || status}
    </span>
  );
}

function getPackagingSummary(order: Order) {
  const packagingItems = order.packagingItems;
  const completed = packagingItems.filter(
    (item) => item.packagingStatus === "completed"
  ).length;

  return {
    total: packagingItems.length,
    completed,
    pending: packagingItems.length - completed,
  };
}

function getStatusLabel(status: string) {
  return statusOptions.find((entry) => entry.value === status)?.label || status;
}

function getMoneyStatusLabel(status: DriverMoneyStatus) {
  const labels: Record<DriverMoneyStatus, string> = {
    not_applicable: "لا توجد تسوية",
    received_now: "استُلم فورًا",
    with_driver: "المبلغ مع المندوب",
    settled: "تمت التسوية",
  };

  return labels[status] || status;
}

function normalizeStatus(status: string | null | undefined) {
  const aliases: Record<string, string> = {
    new: "packaging",
    working: "packaging",
    pending: "packaging",
    done: "delivered",
    completed: "delivered",
    delivery: "out_for_delivery",
  };

  const value = String(status || "").trim();
  return aliases[value] || value || "packaging";
}

function getItemTypeLabel(type: string) {
  const labels: Record<string, string> = {
    bouquet: "باقة ورد",
    box: "بوكس",
    gift_wrap: "تغليف هدية",
    custom: "تصميم مخصص",
    single: "منتج فردي",
  };

  return labels[type] || type;
}

function formatDateInput(date: string) {
  if (!date) return "";
  const parsedDate = new Date(date);
  if (Number.isNaN(parsedDate.getTime())) return "";
  return parsedDate.toISOString().slice(0, 10);
}

function formatDateTime(date: string) {
  if (!date) return "-";
  const parsedDate = new Date(date);
  if (Number.isNaN(parsedDate.getTime())) return "-";
  return parsedDate.toLocaleString("ar-LY");
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;

  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }

  return "حدث خطأ غير متوقع";
}
