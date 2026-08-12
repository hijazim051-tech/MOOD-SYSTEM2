import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useBranch } from "../context/BranchContext";
import { sendAutomaticWhatsApp } from "../lib/whatsapp";
import { refreshWhatsAppSettings } from "../lib/whatsappSettings";

type UsageTier = {
  id: string;
  usagePrice: number;
  stock: number;
};

type WrappingOption = {
  id: string;
  productDetailId: number;
  materialName: string;
  stock: number;
  actualQuantity: number | null;
};

type PackagingComponent = {
  id: string;
  name: string;
  section: string;
  quantity: number;
};

type ExternalContent = {
  id: string;
  name: string;
  description: string;
  quantity: number;
};

type OrderItem = {
  id: number;
  title: string;
  description: string;
  itemType: string;
  contentValue: number;
  packagingStatus: string;
  wrappingOptions: WrappingOption[];
  components: PackagingComponent[];
  externalContents: ExternalContent[];
};

type PackagingOrder = {
  id: number;
  branchId?: string | null;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  occasion: string;
  deliveryDate: string;
  deliveryTime: string;
  address: string;
  notes: string;
  status: string;
  createdAt: string;
  items: OrderItem[];
};

type StockAlert = {
  id: string;
  name: string;
  stock: number;
};

type OrderFilter = "all" | "late" | "urgent";

type TierSelection = Record<string, number>;
type WrappingSelection = Record<string, number>;

const URGENT_HOURS = 2;

const packagingStatuses = ["packaging", "new", "working", "pending_packaging"];
const readyStatuses = ["ready"];
const deliveryStatuses = [
  "out_for_delivery",
  "delivery",
  "with_driver",
  "assigned_driver",
];
const completedStatuses = ["delivered", "completed", "cancelled", "canceled"];

const inputClass =
  "w-full rounded-xl border border-gray-200 bg-white p-3 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";

export default function PackagingEmployee() {
  const { effectiveBranchId } = useBranch();
  const [orders, setOrders] = useState<PackagingOrder[]>([]);
  const [tiers, setTiers] = useState<UsageTier[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [selections, setSelections] = useState<TierSelection>({});
  const [wrappingSelections, setWrappingSelections] =
    useState<WrappingSelection>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<OrderFilter>("all");
  const [stockAlerts, setStockAlerts] = useState<StockAlert[]>([]);
  const [completionImage, setCompletionImage] = useState<File | null>(null);
  const [completionImagePreview, setCompletionImagePreview] = useState("");

  useEffect(() => {
    void loadData();
  }, [effectiveBranchId]);

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) || null,
    [orders, selectedOrderId],
  );

  const selectedItem = useMemo(
    () =>
      selectedOrder?.items.find((item) => item.id === selectedItemId) || null,
    [selectedOrder, selectedItemId],
  );

  const activeOrders = useMemo(
    () => orders.filter((order) =>
      packagingStatuses.includes(normalizeStatus(order.status)) &&
      order.items.some((item) => item.packagingStatus !== "completed")
    ),
    [orders],
  );

  const stats = useMemo(() => {
    const now = new Date();
    return {
      all: activeOrders.length,
      pendingItems: activeOrders.reduce(
        (sum, order) =>
          sum + order.items.filter((item) => item.packagingStatus !== "completed").length,
        0,
      ),
      late: activeOrders.filter((order) => isLate(order, now)).length,
      urgent: activeOrders.filter(
        (order) => !isLate(order, now) && isUrgent(order, now),
      ).length,
      lowStock: stockAlerts.filter((item) => item.stock > 0).length,
      outOfStock: stockAlerts.filter((item) => item.stock <= 0).length,
    };
  }, [activeOrders, stockAlerts]);

  const filteredOrders = useMemo(() => {
    const value = search.trim().toLowerCase();
    const now = new Date();

    return activeOrders
      .filter((order) => {
        if (filter === "late" && !isLate(order, now)) return false;
        if (
          filter === "urgent" &&
          (isLate(order, now) || !isUrgent(order, now))
        )
          return false;
        if (!value) return true;
        return (
          order.orderNumber.toLowerCase().includes(value) ||
          order.customerName.toLowerCase().includes(value) ||
          order.customerPhone.toLowerCase().includes(value)
        );
      })
      .sort((a, b) => {
        const aDate = getDeliveryDate(a);
        const bDate = getDeliveryDate(b);
        if (aDate && bDate) return aDate.getTime() - bDate.getTime();
        if (aDate) return -1;
        if (bDate) return 1;
        return (
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
      });
  }, [activeOrders, search, filter]);

  const selectedValue = useMemo(
    () =>
      tiers.reduce(
        (sum, tier) => sum + tier.usagePrice * Number(selections[tier.id] || 0),
        0,
      ),
    [tiers, selections],
  );

  const targetValue = Number(selectedItem?.contentValue || 0);
  const remainingValue = Math.max(targetValue - selectedValue, 0);
  const excessValue = Math.max(selectedValue - targetValue, 0);
  const needsUsageTiers = false; // الورد الصناعي لم يعد يُتتبع بفئات استخدام
  const isBouquetItem =
    normalizeStatus(selectedItem?.itemType || "") === "bouquet";

  /*
   * الباقة الطبيعية تحفظ الورود المختارة وقت إنشاء الطلب
   * داخل order_custom_item_components بالقسم flowers.
   * نفصلها هنا عن باقي مكونات التجهيز حتى يرى موظف التغليف
   * اسم الوردة + اللون + الكمية بوضوح.
   */
  const selectedComponents = selectedItem?.components || [];
  const naturalFlowerComponents = selectedComponents.filter(
    (component) => normalizeStatus(component.section) === "flowers",
  );
  const otherPackagingComponents = selectedComponents.filter(
    (component) => normalizeStatus(component.section) !== "flowers",
  );
  const naturalFlowerTotal = naturalFlowerComponents.reduce(
    (sum, component) => sum + Number(component.quantity || 0),
    0,
  );

  const selectedWrappingOptions = selectedItem?.wrappingOptions || [];
  const wrappingTotal = selectedWrappingOptions.reduce(
    (sum, option) => sum + Number(wrappingSelections[option.id] || 0),
    0,
  );
  const allowedWrappingTotal = (selectedItem?.components || [])
    .filter((component) => normalizeStatus(component.section) === "wrapping")
    .reduce((sum, component) => sum + Number(component.quantity || 0), 0);

  async function loadData() {
    setLoading(true);

    try {
      // مخزون المنتجات أصبح منفصلًا لكل فرع داخل branch_product_stock.
      // نفلتر بالفرع الحالي حتى لا تختلط كميات MOOD مع Alpha.
      let branchStockQuery = supabase
        .from("branch_product_stock")
        .select("branch_id,product_detail_id,stock,alert_limit");

      if (effectiveBranchId) {
        branchStockQuery = branchStockQuery.eq("branch_id", effectiveBranchId);
      }

      const [
        ordersResult,
        tiersResult,
        stockResult,
        productsResult,
        customItemsResult,
        branchStockResult,
      ] = await Promise.all([
          supabase
            .from("orders")
            .select(
              `
            id,
            order_number,
            customer_name,
            customer_phone,
            occasion,
            delivery_date,
            delivery_time,
            delivery_address,
            notes,
            status,
            created_at,
            branch_id,
            order_items (
              id,
              title,
              notes,
              item_type,
              content_value,
              packaging_status,
              order_item_wrapping_options (
                id,
                product_detail_id,
                material_name,
                actual_quantity
              ),
              order_item_external_contents (
                id,
                item_name,
                description,
                quantity
              )
            )
          `,
            )
            .order("created_at", { ascending: true }),

          supabase
            .from("usage_price_tiers")
            .select("id,usage_price,stock")
            .eq("is_active", true)
            .order("sort_order"),

          // product_details هنا للبيانات الوصفية فقط؛ الكمية الفعلية تؤخذ من branch_product_stock.
          supabase
            .from("product_details")
            .select("id,product_id,name"),

          supabase.from("products").select("id,name"),

          supabase
            .from("order_custom_items")
            .select(`
              id,
              order_id,
              item_type,
              title,
              order_custom_item_components (
                id,
                component_name,
                section,
                quantity,
                is_external
              )
            `),

          branchStockQuery,
        ]);

      if (ordersResult.error) throw ordersResult.error;
      if (tiersResult.error) throw tiersResult.error;
      if (stockResult.error) throw stockResult.error;
      if (productsResult.error) throw productsResult.error;
      if (customItemsResult.error) throw customItemsResult.error;
      if (branchStockResult.error) throw branchStockResult.error;

      const customItems = (customItemsResult.data || []) as any[];

      // المفتاح مركب من الفرع + المنتج التفصيلي، لذلك نفس المنتج يمكن أن
      // يكون 20 في MOOD و0 في Alpha بدون أي تعارض.
      const branchStockMap = new Map<string, number>(
        (branchStockResult.data || []).map((row: any) => [
          `${String(row.branch_id || "")}:${Number(row.product_detail_id || 0)}`,
          Number(row.stock || 0),
        ]),
      );

      const packagingRows = effectiveBranchId ? (ordersResult.data || []).filter((row: any) => String(row.branch_id || "") === effectiveBranchId) : (ordersResult.data || []);
      const mappedOrders: PackagingOrder[] = packagingRows.map(
        (order: any) => ({
          id: Number(order.id),
          branchId: order.branch_id ? String(order.branch_id) : null,
          orderNumber: String(order.order_number || order.id || ""),
          customerName: String(order.customer_name || ""),
          customerPhone: String(order.customer_phone || ""),
          occasion: String(order.occasion || ""),
          deliveryDate: String(order.delivery_date || ""),
          deliveryTime: String(order.delivery_time || ""),
          address: String(order.delivery_address || ""),
          notes: String(order.notes || ""),
          status: String(order.status || "packaging"),
          createdAt: String(order.created_at || ""),
          items: (order.order_items || []).map((item: any) => {
            const matchingCustom =
              customItems.find(
                (custom: any) =>
                  Number(custom.order_id) === Number(order.id) &&
                  String(custom.item_type || "") ===
                    String(item.item_type || "") &&
                  String(custom.title || "") ===
                    String(item.title || "")
              ) ||
              customItems.find(
                (custom: any) =>
                  Number(custom.order_id) === Number(order.id) &&
                  String(custom.item_type || "") ===
                    String(item.item_type || "")
              );

            const components = (
              matchingCustom?.order_custom_item_components || []
            )
              .filter((component: any) => !component.is_external)
              .map((component: any) => ({
                id: String(component.id),
                name: String(component.component_name || "مكوّن"),
                section: String(component.section || "other"),
                quantity: Number(component.quantity || 0),
              }));

            return {
              id: Number(item.id),
              title: String(item.title || "عنصر طلب"),
              description: String(item.notes || ""),
              itemType: String(item.item_type || "custom"),
              contentValue: Number(item.content_value || 0),
              packagingStatus: String(
                item.packaging_status || "pending"
              ),
              wrappingOptions: (
                item.order_item_wrapping_options || []
              ).map((option: any) => ({
                id: String(option.id),
                productDetailId: Number(
                  option.product_detail_id || 0
                ),
                materialName: String(
                  option.material_name || "غلاف"
                ),
                stock: branchStockMap.get(
                  `${String(order.branch_id || "")}:${Number(option.product_detail_id || 0)}`
                ) ?? 0,
                actualQuantity:
                  option.actual_quantity === null ||
                  option.actual_quantity === undefined
                    ? null
                    : Number(option.actual_quantity),
              })),
              components,
              externalContents: (
                item.order_item_external_contents || []
              ).map((external: any) => ({
                id: String(external.id),
                name: String(external.item_name || ""),
                description: String(external.description || ""),
                quantity: Number(external.quantity || 0),
              })),
            };
          }),
        })
      );

      setOrders(mappedOrders);

      const mappedTiers: UsageTier[] = (tiersResult.data || []).map(
        (tier: any) => ({
          id: String(tier.id),
          usagePrice: Number(tier.usage_price || 0),
          stock: Number(tier.stock || 0),
        }),
      );

      setTiers(mappedTiers);

      const productsMap = new Map<number, string>(
        (productsResult.data || []).map((product: any) => [
          Number(product.id),
          String(product.name || ""),
        ]),
      );

      const detailsMap = new Map<number, any>(
        (stockResult.data || []).map((detail: any) => [Number(detail.id), detail]),
      );

      const productAlerts: StockAlert[] = (branchStockResult.data || [])
        .filter((row: any) => {
          const limit = Number(row.alert_limit || 0);
          return limit > 0 && Number(row.stock || 0) <= limit;
        })
        .map((row: any) => {
          const detail = detailsMap.get(Number(row.product_detail_id));
          const productName = productsMap.get(Number(detail?.product_id)) || "";
          const detailName = String(detail?.name || "");
          return {
            id: `product-${String(row.branch_id)}-${Number(row.product_detail_id)}`,
            name:
              [productName, detailName]
                .filter(Boolean)
                .filter((part, index, array) => array.indexOf(part) === index)
                .join(" - ") || `منتج #${Number(row.product_detail_id)}`,
            stock: Number(row.stock || 0),
          };
        });
      setStockAlerts(productAlerts);

      const requestedOrderId = Number(
        localStorage.getItem("mood-packaging-order-id") || 0,
      );

      if (requestedOrderId > 0) {
        const requestedOrder = mappedOrders.find(
          (order) => order.id === requestedOrderId,
        );
        const firstPendingItem = requestedOrder?.items.find(
          (item) => item.packagingStatus !== "completed",
        );

        if (requestedOrder && firstPendingItem) {
          setSelectedOrderId(requestedOrder.id);
          setSelectedItemId(firstPendingItem.id);
        }

        localStorage.removeItem("mood-packaging-order-id");
      }
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  function openItem(order: PackagingOrder, item: OrderItem) {
    setSelectedOrderId(order.id);
    setSelectedItemId(item.id);
    setSelections({});

    const initialWrapping: WrappingSelection = {};
    for (const option of item.wrappingOptions || []) {
      initialWrapping[option.id] = Number(option.actualQuantity || 0);
    }
    setWrappingSelections(initialWrapping);
    setCompletionImage(null);
    setCompletionImagePreview("");
  }

  function updateQuantity(tier: UsageTier, nextValue: number) {
    const safeValue = Math.max(0, Math.floor(nextValue));

    if (safeValue > tier.stock) {
      alert(`المتوفر من فئة ${tier.usagePrice} د.ل هو ${tier.stock}`);
      return;
    }

    setSelections((current) => ({
      ...current,
      [tier.id]: safeValue,
    }));
  }

  function updateWrappingQuantity(
    option: WrappingOption,
    nextValue: number,
  ) {
    const safeValue = Math.max(0, Math.floor(nextValue));

    if (safeValue > option.stock) {
      alert(
        `المتوفر من ${option.materialName} هو ${option.stock} ورقة فقط`,
      );
      return;
    }

    setWrappingSelections((current) => ({
      ...current,
      [option.id]: safeValue,
    }));
  }

  async function markSimpleItemCompleted(itemId: number) {
    const { error } = await supabase
      .from("order_items")
      .update({
        packaging_status: "completed",
        packaging_completed_at: new Date().toISOString(),
      })
      .eq("id", itemId);

    if (error) throw error;
  }

  async function finishOrderIfComplete(orderId: number) {
    const { data, error } = await supabase
      .from("order_items")
      .select("id,packaging_status")
      .eq("order_id", orderId);

    if (error) throw error;

    const allCompleted =
      (data || []).length > 0 &&
      (data || []).every((item: any) => item.packaging_status === "completed");

    if (!allCompleted) return false;

    const { error: orderError } = await supabase
      .from("orders")
      .update({ status: "ready" })
      .eq("id", orderId);

    if (orderError) throw orderError;

    return true;
  }

  async function uploadCompletionImage(orderId: number, itemId: number) {
    if (!completionImage) throw new Error("صورة التجهيز النهائية مطلوبة");
    const extension = completionImage.name.split(".").pop() || "jpg";
    const path = `${orderId}/${itemId}-${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("packaging-images")
      .upload(path, completionImage, { upsert: false });
    if (uploadError) throw uploadError;
    const { data } = supabase.storage.from("packaging-images").getPublicUrl(path);
    return data.publicUrl;
  }

  async function confirmPackaging() {
    if (!selectedItem || !selectedOrder) return;
    if (!completionImage) {
      alert("لا يمكن إتمام التغليف بدون إضافة صورة بعد التجهيز");
      return;
    }

    if (selectedItem.packagingStatus === "completed") {
      alert("هذا البند تم تأكيده سابقًا");
      return;
    }

    if (isBouquetItem) {
      for (const option of selectedWrappingOptions) {
        const quantity = Number(wrappingSelections[option.id] || 0);

        if (quantity > option.stock) {
          alert(
            `كمية ${option.materialName} أكبر من المخزون المتوفر`,
          );
          return;
        }
      }

      if (allowedWrappingTotal > 0 && wrappingTotal > allowedWrappingTotal) {
        alert(`عدد أوراق التغليف أكبر من المسموح. المسموح ${allowedWrappingTotal} ورقة فقط.`);
        return;
      }

      const bouquetMessage =
        selectedWrappingOptions.length === 0
          ? "هذه الباقة بدون غلاف. هل تم تجهيزها بالكامل؟"
          : wrappingTotal === 0
            ? "لم تُسجل أي ورقة غلاف. هل تم تجهيز الباقة بدون استخدام غلاف؟"
            : `سيتم خصم ${wrappingTotal} ورقة غلاف فعليًا. هل تريد التأكيد؟`;

      if (!window.confirm(bouquetMessage)) return;
    } else if (needsUsageTiers) {
      const usage = tiers
        .map((tier) => ({
          tierId: tier.id,
          quantity: Number(selections[tier.id] || 0),
        }))
        .filter((row) => row.quantity > 0);

      if (usage.length === 0) {
        alert("اختار عدد القطع المستخدمة");
        return;
      }

      const message =
        excessValue > 0
          ? `تنبيه: القيمة المختارة تزيد عن المسموح بـ ${excessValue.toFixed(2)} د.ل. يمكن المتابعة وسيصل إشعار للمالك. هل تريد التأكيد؟`
          : selectedValue < targetValue
            ? `القيمة أقل من المسموح بـ ${remainingValue.toFixed(2)} د.ل، وسيتم قبولها. هل تريد التأكيد؟`
            : "هل تريد تأكيد المحتوى وخصم المخزون؟";

      if (!window.confirm(message)) return;
    } else {
      const confirmed = window.confirm("هل تم تجهيز هذا البند بالكامل؟");

      if (!confirmed) return;
    }

    setSaving(true);

    try {
      const packagingImageUrl = await uploadCompletionImage(selectedOrder.id, selectedItem.id);
      if (isBouquetItem) {
        const wrappingUsage = selectedWrappingOptions.map((option) => ({
          optionId: option.id,
          quantity: Number(wrappingSelections[option.id] || 0),
        }));

        const { error } = await supabase.rpc(
          "confirm_bouquet_wrapping",
          {
            p_order_item_id: selectedItem.id,
            p_usage: wrappingUsage,
          },
        );

        if (error) throw error;
      } else if (needsUsageTiers) {
        const usage = tiers
          .map((tier) => ({
            tierId: tier.id,
            quantity: Number(selections[tier.id] || 0),
          }))
          .filter((row) => row.quantity > 0);

        const { error } = await supabase.rpc(
          "confirm_order_item_packaging",
          {
            p_order_item_id: selectedItem.id,
            p_usage: usage,
          },
        );

        if (error) throw error;

        if (excessValue > 0) {
          const { data: userData } = await supabase.auth.getUser();
          await supabase.from("owner_notifications").insert({
            notification_type: "packaging_over_budget",
            title: "تجاوز ميزانية محتوى البوكس",
            message: `الطلب #${selectedOrder.orderNumber}: المسموح ${targetValue.toFixed(2)} د.ل، المستخدم ${selectedValue.toFixed(2)} د.ل، الزيادة ${excessValue.toFixed(2)} د.ل`,
            entity_table: "orders",
            entity_id: String(selectedOrder.id),
            created_by: userData.user?.id || null,
          });
        }
      } else {
        await markSimpleItemCompleted(selectedItem.id);
      }

      const { error: imageUpdateError } = await supabase
        .from("order_items")
        .update({ packaging_image_url: packagingImageUrl })
        .eq("id", selectedItem.id);
      if (imageUpdateError) throw imageUpdateError;

      await supabase.rpc("log_activity", {
        p_action: "packaging_completed",
        p_entity_type: "orders",
        p_entity_id: String(selectedOrder.id),
        p_entity_label: selectedOrder.orderNumber,
        p_page_name: "packaging",
        p_description: `تم تجهيز البند ${selectedItem.title} مع إرفاق صورة نهائية`,
        p_old_data: null,
        p_new_data: { orderItemId: selectedItem.id, packagingImageUrl },
        p_metadata: {},
      });

      const orderCompleted = await finishOrderIfComplete(selectedOrder.id);

      let readyWhatsAppError = "";

      if (orderCompleted) {
        try {
          const whatsappSettings = await refreshWhatsAppSettings(selectedOrder.branchId);
          if (whatsappSettings.sendReadyMessage) {
            await sendAutomaticWhatsApp(
            {
              id: selectedOrder.id,
              branchId: selectedOrder.branchId,
              orderNumber: selectedOrder.orderNumber,
              customerName: selectedOrder.customerName,
              customerPhone: selectedOrder.customerPhone,
            },
            "ready"
          );
          }
        } catch (error) {
          readyWhatsAppError =
            error instanceof Error
              ? error.message
              : "تعذر إرسال رسالة جاهز";
        }
      }

      setSelectedItemId(null);
      setSelections({});
      setWrappingSelections({});
      setCompletionImage(null);
      setCompletionImagePreview("");
      await loadData();

      if (orderCompleted && readyWhatsAppError) {
        alert(
          `تم تحويل الطلب إلى جاهز، لكن رسالة واتساب لم تُرسل:\n${readyWhatsAppError}`
        );
      } else {
        alert(
          orderCompleted
            ? "تم إتمام آخر بند وتحويل الطلب إلى جاهز وإرسال الرسالة ✅"
            : "تم تأكيد تجهيز البند ✅",
        );
      }
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-2xl font-bold">جاري تحميل طلبات التغليف...</div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-8" dir="rtl">
      <header>
        <h1 className="text-3xl font-bold md:text-4xl">واجهة موظف التغليف</h1>
        <p className="mt-2 text-gray-500">
          تعرض فقط الطلبات التي ما زالت تحتاج تجهيز، بدون أسعار أو معلومات إدارية
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="طلبات تنتظر التجهيز"
          value={stats.all}
          active={filter === "all"}
          onClick={() => setFilter("all")}
          className="bg-slate-50 text-slate-700"
        />
        <StatCard
          label="بنود متبقية"
          value={stats.pendingItems}
          active={false}
          onClick={() => setFilter("all")}
          className="bg-orange-50 text-orange-700"
        />
        <StatCard
          label="طلبات متأخرة"
          value={stats.late}
          active={filter === "late"}
          onClick={() => setFilter("late")}
          className="bg-red-50 text-red-700"
        />
        <StatCard
          label="مستعجل خلال ساعتين"
          value={stats.urgent}
          active={filter === "urgent"}
          onClick={() => setFilter("urgent")}
          className="bg-amber-50 text-amber-700"
        />
        <StatCard
          label="مخزون منخفض"
          value={stats.lowStock}
          active={false}
          onClick={() => undefined}
          className="bg-yellow-50 text-yellow-700"
        />
        <StatCard
          label="نافد من المخزون"
          value={stats.outOfStock}
          active={false}
          onClick={() => undefined}
          className="bg-rose-50 text-rose-700"
        />
      </section>

      {(stats.late > 0 || stats.urgent > 0) && (
        <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {stats.late > 0 && (
            <button
              type="button"
              onClick={() => setFilter("late")}
              className="rounded-2xl border border-red-200 bg-red-50 p-5 text-right text-red-800"
            >
              <p className="text-lg font-bold">
                🔴 يوجد {stats.late} طلب متأخر
              </p>
              <p className="mt-1 text-sm">
                اضغط لعرض الطلبات التي تجاوزت موعد التسليم.
              </p>
            </button>
          )}
          {stats.urgent > 0 && (
            <button
              type="button"
              onClick={() => setFilter("urgent")}
              className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-right text-amber-800"
            >
              <p className="text-lg font-bold">
                🟠 يوجد {stats.urgent} طلب موعده خلال ساعتين
              </p>
              <p className="mt-1 text-sm">
                هذه الطلبات تحتاج أولوية في التجهيز.
              </p>
            </button>
          )}
        </section>
      )}

      <section className="rounded-2xl bg-white p-5 shadow">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className={inputClass}
          placeholder="بحث برقم الطلب أو اسم العميل أو الهاتف"
        />
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[420px_1fr]">
        <section className="rounded-2xl bg-white p-5 shadow">
          <h2 className="mb-4 text-xl font-bold">الطلبات</h2>

          <div className="max-h-[720px] space-y-3 overflow-y-auto">
            {filteredOrders.map((order) => {
              const pendingCount = order.items.filter(
                (item) => item.packagingStatus !== "completed",
              ).length;
              const completedCount = order.items.length - pendingCount;

              return (
                <div key={order.id} className="rounded-xl border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-bold">طلب #{order.orderNumber}</p>
                      <p className="mt-1 text-sm text-gray-500">
                        {order.customerName || "عميل غير مسجل"}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${getOrderStatusInfo(order.status).className}`}
                      >
                        {getOrderStatusInfo(order.status).label}
                      </span>
                      {getTimingInfo(order) && (
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${getTimingInfo(order)?.className}`}
                        >
                          {getTimingInfo(order)?.label}
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="mt-2 text-xs text-gray-500">
                    تم تجهيز {completedCount} من {order.items.length}
                  </p>

                  {pendingCount > 0 && (
                      <div className="mt-3 space-y-2">
                        {order.items
                          .filter(
                            (item) => item.packagingStatus !== "completed",
                          )
                          .map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => openItem(order, item)}
                              className={`block w-full rounded-lg p-3 text-right transition ${
                                selectedItemId === item.id
                                  ? "bg-emerald-700 text-white"
                                  : "bg-gray-50 hover:bg-emerald-50"
                              }`}
                            >
                              <p className="font-semibold">{item.title}</p>
                              <p className="mt-1 text-sm opacity-80">
                                {item.contentValue > 0
                                  ? `قيمة المحتوى: ${item.contentValue.toFixed(
                                      2,
                                    )} د.ل`
                                  : "تأكيد تجهيز البند"}
                              </p>
                            </button>
                          ))}
                      </div>
                    )}
                </div>
              );
            })}

            {filteredOrders.length === 0 && (
              <div className="rounded-xl bg-gray-50 p-8 text-center text-gray-500">
                لا توجد طلبات تنتظر التغليف
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl bg-white p-5 shadow md:p-6">
          {!selectedOrder || !selectedItem ? (
            <div className="flex min-h-[420px] items-center justify-center text-center text-gray-500">
              اختار طلبًا وبندًا من القائمة لبدء التجهيز
            </div>
          ) : (
            <>
              <div className="rounded-2xl bg-gray-50 p-5">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Info label="رقم الطلب" value={selectedOrder.orderNumber} />
                  <Info
                    label="العميل"
                    value={selectedOrder.customerName || "-"}
                  />
                  <Info
                    label="الهاتف"
                    value={selectedOrder.customerPhone || "-"}
                  />
                  <Info
                    label="المناسبة"
                    value={selectedOrder.occasion || "-"}
                  />
                  <Info
                    label="موعد التسليم"
                    value={
                      [selectedOrder.deliveryDate, selectedOrder.deliveryTime]
                        .filter(Boolean)
                        .join(" — ") || "-"
                    }
                  />
                  <Info label="العنوان" value={selectedOrder.address || "-"} />
                </div>

                {selectedOrder.notes && (
                  <div className="mt-4 rounded-xl bg-white p-4">
                    <p className="text-sm text-gray-500">ملاحظات الطلب</p>
                    <p className="mt-1 font-semibold">{selectedOrder.notes}</p>
                  </div>
                )}
              </div>

              <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
                <p className="text-sm text-gray-500">البند الحالي</p>
                <h2 className="mt-1 text-2xl font-bold">
                  {selectedItem.title}
                </h2>
                {selectedItem.description && (
                  <p className="mt-2 text-gray-600">
                    {selectedItem.description}
                  </p>
                )}
              </div>

              <div className="mt-5 rounded-2xl border p-5">
                <h2 className="text-xl font-bold">
                  بيانات التجهيز
                </h2>

                {isBouquetItem ? (
                  <>
                    <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-bold text-rose-900">
                            🌹 الورد الطبيعي المطلوب
                          </h3>
                          <p className="mt-1 text-sm text-rose-700">
                            نفس الأنواع والألوان والكميات التي اختيرت عند إنشاء الطلب.
                          </p>
                        </div>

                        <span className="rounded-full bg-white px-4 py-2 font-bold text-rose-800 shadow-sm">
                          الإجمالي: {naturalFlowerTotal} وردة
                        </span>
                      </div>

                      {naturalFlowerComponents.length > 0 ? (
                        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                          {naturalFlowerComponents.map((component) => (
                            <div
                              key={component.id}
                              className="flex items-center justify-between rounded-xl border border-rose-100 bg-white p-4"
                            >
                              <div>
                                <p className="font-bold text-gray-900">
                                  {component.name}
                                </p>
                                <p className="mt-1 text-xs text-rose-600">
                                  ورد طبيعي
                                </p>
                              </div>

                              <span className="rounded-full bg-rose-50 px-4 py-2 text-lg font-extrabold text-rose-800">
                                × {component.quantity}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
                          لم تُسجل زهور طبيعية لهذا البند. إذا كان الطلب قديمًا قبل آخر إصلاح،
                          أعد إنشاءه حتى تُحفظ أسماء الورود وألوانها وكمياتها مع الطلب.
                        </div>
                      )}
                    </div>

                    {otherPackagingComponents.length > 0 && (
                      <div className="mt-5">
                        <h3 className="font-bold text-gray-800">
                          مكونات وتجهيزات إضافية
                        </h3>
                        <div className="mt-3 space-y-2">
                          {otherPackagingComponents.map((component) => (
                            <div
                              key={component.id}
                              className="flex items-center justify-between rounded-xl bg-gray-50 p-3"
                            >
                              <div>
                                <p className="font-semibold">{component.name}</p>
                                <p className="mt-1 text-xs text-gray-500">
                                  {getSectionLabel(component.section)}
                                </p>
                              </div>
                              <span className="rounded-full bg-white px-3 py-1 font-bold">
                                × {component.quantity}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : selectedItem.components.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    {selectedItem.components.map((component) => (
                      <div
                        key={component.id}
                        className="flex items-center justify-between rounded-xl bg-gray-50 p-3"
                      >
                        <div>
                          <p className="font-semibold">
                            {component.name}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            {getSectionLabel(component.section)}
                          </p>
                        </div>

                        <span className="rounded-full bg-white px-3 py-1 font-bold">
                          × {component.quantity}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 rounded-xl bg-gray-50 p-4 text-gray-500">
                    لا توجد مكونات مخزون مسجلة لهذا البند.
                  </p>
                )}

                {selectedItem.externalContents.length > 0 && (
                  <div className="mt-5">
                    <h3 className="font-bold text-purple-800">
                      المحتوى الخارجي
                    </h3>

                    <div className="mt-3 space-y-2">
                      {selectedItem.externalContents.map((external) => (
                        <div
                          key={external.id}
                          className="rounded-xl bg-purple-50 p-3"
                        >
                          <div className="flex items-center justify-between">
                            <p className="font-semibold">
                              {external.name}
                            </p>
                            <span className="font-bold">
                              × {external.quantity}
                            </span>
                          </div>

                          {external.description && (
                            <p className="mt-1 text-sm text-gray-600">
                              {external.description}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {isBouquetItem &&
                  selectedItem.wrappingOptions.length > 0 && (
                    <div className="mt-5">
                      <h3 className="font-bold text-blue-800">
                        ألوان الغلاف المختارة
                      </h3>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {selectedItem.wrappingOptions.map((option) => (
                          <span
                            key={option.id}
                            className="rounded-full bg-blue-50 px-4 py-2 font-semibold text-blue-700"
                          >
                            {option.materialName}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
              </div>

              {isBouquetItem ? (
                <>
                  <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-5">
                    <h2 className="text-xl font-bold text-blue-900">
                      الغلاف المستخدم فعليًا
                    </h2>
                    <p className="mt-1 text-sm text-blue-700">
                      اكتب عدد الأوراق التي أخذتها من كل لون. الخصم يتم عند التأكيد.
                    </p>
                  </div>

                  {selectedWrappingOptions.length > 0 ? (
                    <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                      {selectedWrappingOptions.map((option) => {
                        const quantity = Number(
                          wrappingSelections[option.id] || 0,
                        );

                        return (
                          <div
                            key={option.id}
                            className="rounded-2xl border p-5"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-xl font-bold">
                                  {option.materialName}
                                </p>
                                <p className="mt-1 text-sm text-gray-500">
                                  المتوفر: {option.stock}
                                </p>
                              </div>
                              <p className="text-lg font-bold text-blue-700">
                                {quantity} ورقة
                              </p>
                            </div>

                            <div className="mt-5 flex items-center justify-center gap-4">
                              <button
                                type="button"
                                onClick={() =>
                                  updateWrappingQuantity(
                                    option,
                                    quantity - 1,
                                  )
                                }
                                className="h-12 w-12 rounded-full bg-red-100 text-2xl font-bold text-red-700"
                              >
                                −
                              </button>

                              <input
                                type="number"
                                min="0"
                                max={option.stock}
                                value={quantity}
                                onChange={(event) =>
                                  updateWrappingQuantity(
                                    option,
                                    Number(event.target.value || 0),
                                  )
                                }
                                className="w-24 rounded-xl border p-3 text-center text-xl font-bold"
                              />

                              <button
                                type="button"
                                onClick={() =>
                                  updateWrappingQuantity(
                                    option,
                                    quantity + 1,
                                  )
                                }
                                className="h-12 w-12 rounded-full bg-emerald-100 text-2xl font-bold text-emerald-700"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mt-5 rounded-2xl bg-gray-50 p-6 text-center">
                      <p className="text-lg font-bold">
                        الباقة بدون غلاف
                      </p>
                      <p className="mt-2 text-gray-600">
                        جهّز الباقة واضغط التأكيد بدون خصم أي ورق.
                      </p>
                    </div>
                  )}

                  <div className="mt-5 rounded-2xl bg-emerald-50 p-5 text-center">
                    <p className="text-gray-500">
                      إجمالي أوراق الغلاف المسجلة
                    </p>
                    <p className="mt-2 text-3xl font-bold text-emerald-700">
                      {wrappingTotal}
                    </p>
                  </div>
                </>
              ) : needsUsageTiers ? (
                <>
                  <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
                    <ValueCard
                      label="القيمة المطلوبة"
                      value={targetValue}
                      type="target"
                    />
                    <ValueCard
                      label="القيمة المختارة"
                      value={selectedValue}
                      type="selected"
                    />
                    <ValueCard
                      label={remainingValue > 0 ? "المتبقي" : "الزيادة"}
                      value={remainingValue > 0 ? remainingValue : excessValue}
                      type={remainingValue > 0 ? "remaining" : "excess"}
                    />
                  </div>

                  <h2 className="mb-4 mt-7 text-2xl font-bold">
                    فئات الاستخدام
                  </h2>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {tiers.map((tier) => {
                      const quantity = Number(selections[tier.id] || 0);

                      return (
                        <div key={tier.id} className="rounded-2xl border p-5">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-2xl font-bold">
                                فئة {tier.usagePrice} د.ل
                              </p>
                              <p className="mt-1 text-sm text-gray-500">
                                المتوفر: {tier.stock}
                              </p>
                            </div>

                            <p className="text-lg font-bold text-emerald-700">
                              {(tier.usagePrice * quantity).toFixed(2)} د.ل
                            </p>
                          </div>

                          <div className="mt-5 flex items-center justify-center gap-4">
                            <button
                              type="button"
                              onClick={() => updateQuantity(tier, quantity - 1)}
                              className="h-12 w-12 rounded-full bg-red-100 text-2xl font-bold text-red-700"
                            >
                              −
                            </button>

                            <input
                              type="number"
                              min="0"
                              max={tier.stock}
                              value={quantity}
                              onChange={(event) =>
                                updateQuantity(
                                  tier,
                                  Number(event.target.value || 0),
                                )
                              }
                              className="w-24 rounded-xl border p-3 text-center text-xl font-bold"
                            />

                            <button
                              type="button"
                              onClick={() => updateQuantity(tier, quantity + 1)}
                              className="h-12 w-12 rounded-full bg-emerald-100 text-2xl font-bold text-emerald-700"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="mt-5 rounded-2xl bg-blue-50 p-6 text-center">
                  <p className="text-lg font-bold text-blue-800">
                    هذا البند لا يحتاج اختيار فئات استخدام
                  </p>
                  <p className="mt-2 text-blue-700">
                    بعد تجهيزه فعليًا اضغط تم تجهيز البند.
                  </p>
                </div>
              )}

              <div className="mt-7 rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50 p-5">
                <h3 className="text-lg font-bold text-emerald-900">صورة الطلب بعد التجهيز *</h3>
                <p className="mt-1 text-sm text-emerald-700">إجبارية قبل إتمام أي بند. صوّر الشكل النهائي بوضوح.</p>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="mt-4 block w-full text-sm"
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    setCompletionImage(file);
                    setCompletionImagePreview(file ? URL.createObjectURL(file) : "");
                  }}
                />
                {completionImagePreview && (
                  <img src={completionImagePreview} alt="صورة التجهيز" className="mt-4 max-h-72 w-full rounded-xl object-contain bg-white" />
                )}
              </div>

              <button
                type="button"
                onClick={() => void confirmPackaging()}
                disabled={saving || !completionImage}
                className="mt-7 w-full rounded-xl bg-emerald-700 py-4 text-lg font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving
                  ? "جاري التأكيد..."
                  : isBouquetItem
                    ? "تأكيد الباقة وخصم الغلاف الفعلي"
                    : needsUsageTiers
                      ? "تأكيد المحتوى وخصم المخزون"
                      : "تم تجهيز البند"}
              </button>
            </>
          )}
        </section>
      </div>

      <section className="rounded-2xl bg-white p-5 shadow md:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold">تنبيهات المخزون</h2>
            <p className="mt-1 text-sm text-gray-500">
              يظهر التنبيه فقط للمنتج الذي حددت له حد تنبيه من إدارة المنتجات
            </p>
          </div>
          <div className="flex gap-2">
            <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-700">
              منخفض: {stats.lowStock}
            </span>
            <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-bold text-red-700">
              نافد: {stats.outOfStock}
            </span>
          </div>
        </div>

        {stockAlerts.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {stockAlerts.map((alert) => (
              <div
                key={alert.id}
                className={`rounded-xl border p-4 ${alert.stock <= 0 ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}
              >
                <p
                  className={`font-bold ${alert.stock <= 0 ? "text-red-800" : "text-amber-800"}`}
                >
                  {alert.stock <= 0 ? "⛔" : "⚠️"} {alert.name}
                </p>
                <p className="mt-2 text-sm">
                  {alert.stock <= 0
                    ? "نفد من المخزون"
                    : `المتوفر حاليًا: ${alert.stock}`}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl bg-emerald-50 p-6 text-center font-bold text-emerald-700">
            المخزون جيد ولا توجد تنبيهات حاليًا ✅
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  active,
  onClick,
  className,
}: {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
  className: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border p-4 text-right shadow-sm transition ${className} ${active ? "ring-2 ring-gray-400" : "hover:-translate-y-0.5"}`}
    >
      <p className="text-sm font-semibold">{label}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
    </button>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 font-bold">{value}</p>
    </div>
  );
}

function ValueCard({
  label,
  value,
  type,
}: {
  label: string;
  value: number;
  type: "target" | "selected" | "remaining" | "excess";
}) {
  const classes = {
    target: "bg-purple-50 text-purple-700",
    selected: "bg-emerald-50 text-emerald-700",
    remaining: "bg-red-50 text-red-700",
    excess: "bg-orange-50 text-orange-700",
  };

  return (
    <div className={`rounded-2xl p-5 ${classes[type]}`}>
      <p className="text-sm">{label}</p>
      <p className="mt-2 text-3xl font-bold">{value.toFixed(2)} د.ل</p>
    </div>
  );
}

function getSectionLabel(section: string) {
  const value = String(section || "").toLowerCase();

  if (value === "flowers") return "ورد";
  if (value === "wrapping") return "تغليف";
  if (value === "base") return "بوكس / قاعدة";
  if (value === "additions") return "إضافة";
  if (value === "accessories") return "إكسسوار";

  return "مكوّن";
}

function normalizeStatus(status: string) {
  return String(status || "")
    .trim()
    .toLowerCase();
}

function getOrderStatusInfo(status: string) {
  const value = normalizeStatus(status);
  if (packagingStatuses.includes(value))
    return { label: "قيد التغليف", className: "bg-orange-100 text-orange-700" };
  if (readyStatuses.includes(value))
    return { label: "جاهز", className: "bg-emerald-100 text-emerald-700" };
  if (deliveryStatuses.includes(value))
    return { label: "خرج للتوصيل", className: "bg-blue-100 text-blue-700" };
  if (value === "delivered" || value === "completed")
    return { label: "تم التسليم", className: "bg-gray-100 text-gray-700" };
  return {
    label: status || "غير محدد",
    className: "bg-gray-100 text-gray-700",
  };
}

function getDeliveryDate(order: PackagingOrder) {
  if (!order.deliveryDate) return null;
  const value = new Date(
    `${order.deliveryDate}T${order.deliveryTime || "23:59"}`,
  );
  return Number.isNaN(value.getTime()) ? null : value;
}

function isLate(order: PackagingOrder, now = new Date()) {
  const deliveryDate = getDeliveryDate(order);
  return Boolean(
    deliveryDate &&
    deliveryDate.getTime() < now.getTime() &&
    !completedStatuses.includes(normalizeStatus(order.status)),
  );
}

function isUrgent(order: PackagingOrder, now = new Date()) {
  const deliveryDate = getDeliveryDate(order);
  if (!deliveryDate) return false;
  const difference = deliveryDate.getTime() - now.getTime();
  return (
    difference >= 0 &&
    difference <= URGENT_HOURS * 60 * 60 * 1000 &&
    !completedStatuses.includes(normalizeStatus(order.status))
  );
}

function getTimingInfo(order: PackagingOrder) {
  if (isLate(order))
    return { label: "متأخر", className: "bg-red-100 text-red-700" };
  if (isUrgent(order))
    return { label: "مستعجل", className: "bg-amber-100 text-amber-700" };
  if (order.deliveryDate === new Date().toISOString().slice(0, 10))
    return { label: "موعده اليوم", className: "bg-yellow-100 text-yellow-700" };
  return null;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;

  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }

  return "حدث خطأ غير متوقع";
}