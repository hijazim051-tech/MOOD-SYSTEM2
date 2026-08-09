import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type PeriodKey =
  | "today"
  | "yesterday"
  | "week"
  | "month"
  | "year"
  | "custom"
  | "all";

type ReportItem = {
  id: string | number;
  itemType: string;
  title: string;
  sellPrice: number;
  costPrice: number;
  profit: number;
};

type ReportOrder = {
  id: number;
  orderNumber: string;
  total: number;
  productsTotal: number;
  costTotal: number;
  profit: number;
  deliveryFee: number;
  deliveryCashExpense: number;
  discount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentMethod: string;
  status: string;
  createdAt: string;
  items: ReportItem[];
};

type PaymentSummary = {
  method: string;
  label: string;
  amount: number;
  count: number;
  percentage: number;
};

type DailySummary = {
  date: string;
  orders: number;
  sales: number;
  productsSales: number;
  cost: number;
  profit: number;
  paid: number;
  remaining: number;
};

type FinancialSummary = {
  ordersCount: number;
  sales: number;
  productsSales: number;
  cost: number;
  grossProfit: number;
  netProfit: number;
  deliveryFees: number;
  deliveryCashExpenses: number;
  discounts: number;
  paid: number;
  remaining: number;
  averageOrder: number;
  collectionRate: number;
  profitMargin: number;
};

const EMPTY_SUMMARY: FinancialSummary = {
  ordersCount: 0,
  sales: 0,
  productsSales: 0,
  cost: 0,
  grossProfit: 0,
  netProfit: 0,
  deliveryFees: 0,
  deliveryCashExpenses: 0,
  discounts: 0,
  paid: 0,
  remaining: 0,
  averageOrder: 0,
  collectionRate: 0,
  profitMargin: 0,
};

export default function Reports() {
  const [orders, setOrders] = useState<ReportOrder[]>([]);
  const [period, setPeriod] = useState<PeriodKey>("month");
  const [loading, setLoading] = useState(true);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [reportType, setReportType] = useState<"all" | "bouquet" | "box" | "product">("all");

  useEffect(() => {
    loadReports();
  }, []);

  async function loadReports() {
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("orders")
        .select(`
          id,
          order_number,
          total,
          products_total,
          cost_total,
          profit,
          delivery_fee,
          delivery_cash_expense,
          discount,
          paid_amount,
          remaining_amount,
          payment_method,
          status,
          created_at,
          order_custom_items (
            id,
            item_type,
            title,
            sell_price,
            cost_price,
            profit
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const formatted: ReportOrder[] = (data || []).map((order: any) => ({
        id: Number(order.id),
        orderNumber: String(order.order_number || order.id || ""),
        total: Number(order.total || 0),
        productsTotal: Number(order.products_total || 0),
        costTotal: Number(order.cost_total || 0),
        profit: Number(order.profit || 0),
        deliveryFee: Number(order.delivery_fee || 0),
        deliveryCashExpense: Number(order.delivery_cash_expense || 0),
        discount: Number(order.discount || 0),
        paidAmount: Number(order.paid_amount || 0),
        remainingAmount: Number(order.remaining_amount || 0),
        paymentMethod: String(order.payment_method || "cash"),
        status: String(order.status || "new"),
        createdAt: String(order.created_at || ""),
        items: (order.order_custom_items || []).map((item: any) => ({
          id: item.id,
          itemType: String(item.item_type || "product"),
          title: String(item.title || ""),
          sellPrice: Number(item.sell_price || 0),
          costPrice: Number(item.cost_price || 0),
          profit: Number(item.profit || 0),
        })),
      }));

      setOrders(formatted);
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  const dateFilteredOrders = useMemo(() => {
    return filterOrdersByPeriod(orders, period, customFrom, customTo);
  }, [orders, period, customFrom, customTo]);

  const filteredOrders = useMemo(() => {
    return dateFilteredOrders.filter((order) => {
      const matchesStatus =
        statusFilter === "all" || normalizeStatus(order.status) === statusFilter;

      const matchesPayment =
        paymentFilter === "all" ||
        normalizePaymentMethod(order.paymentMethod) === paymentFilter;

      return matchesStatus && matchesPayment;
    });
  }, [dateFilteredOrders, statusFilter, paymentFilter]);

  const completedOrders = useMemo(
    () =>
      filteredOrders.filter(
        (order) => normalizeStatus(order.status) !== "cancelled"
      ),
    [filteredOrders]
  );

  const summary = useMemo(
    () => calculateFinancialSummary(completedOrders),
    [completedOrders]
  );

  const paymentSummary = useMemo<PaymentSummary[]>(() => {
    const map = new Map<
      string,
      { method: string; label: string; amount: number; count: number }
    >();

    for (const order of completedOrders) {
      const method = normalizePaymentMethod(order.paymentMethod);
      const current = map.get(method);

      if (current) {
        current.amount += order.paidAmount;
        current.count += 1;
      } else {
        map.set(method, {
          method,
          label: getPaymentLabel(method),
          amount: order.paidAmount,
          count: 1,
        });
      }
    }

    const totalPaid = Array.from(map.values()).reduce(
      (sum, item) => sum + item.amount,
      0
    );

    return Array.from(map.values())
      .map((item) => ({
        ...item,
        percentage: totalPaid > 0 ? (item.amount / totalPaid) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [completedOrders]);

  const dailySummary = useMemo<DailySummary[]>(() => {
    const map = new Map<string, DailySummary>();

    for (const order of completedOrders) {
      const key = toLocalDateKey(new Date(order.createdAt));
      const current = map.get(key);
      const profit = getOrderNetProfit(order);

      if (current) {
        current.orders += 1;
        current.sales += order.total;
        current.productsSales += order.productsTotal;
        current.cost += order.costTotal;
        current.profit += profit;
        current.paid += order.paidAmount;
        current.remaining += order.remainingAmount;
      } else {
        map.set(key, {
          date: key,
          orders: 1,
          sales: order.total,
          productsSales: order.productsTotal,
          cost: order.costTotal,
          profit,
          paid: order.paidAmount,
          remaining: order.remainingAmount,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );
  }, [completedOrders]);

  const maxDailySales = useMemo(
    () => Math.max(1, ...dailySummary.map((day) => day.sales)),
    [dailySummary]
  );

  const availableStatuses = useMemo(
    () =>
      Array.from(
        new Set(orders.map((order) => normalizeStatus(order.status)))
      ),
    [orders]
  );

  const availablePayments = useMemo(
    () =>
      Array.from(
        new Set(
          orders.map((order) =>
            normalizePaymentMethod(order.paymentMethod)
          )
        )
      ),
    [orders]
  );

  const itemReport = useMemo(() => {
    const rows = completedOrders.flatMap((order) =>
      order.items.map((item) => ({ ...item, orderId: order.id }))
    );
    const filtered = reportType === "all"
      ? rows
      : rows.filter((item) => normalizeItemType(item.itemType) === reportType);
    const sales = filtered.reduce((sum, item) => sum + item.sellPrice, 0);
    const cost = filtered.reduce((sum, item) => sum + item.costPrice, 0);
    const profit = filtered.reduce((sum, item) =>
      sum + (item.profit || item.sellPrice - item.costPrice), 0);
    const ordersCount = new Set(filtered.map((item) => item.orderId)).size;
    return { rows: filtered, sales, cost, profit, ordersCount };
  }, [completedOrders, reportType]);

  function exportCsv() {
    const headers = [
      "رقم الطلب",
      "التاريخ",
      "الحالة",
      "طريقة الدفع",
      "إجمالي الطلب",
      "مبيعات المنتجات",
      "التكلفة",
      "الربح",
      "التوصيل",
      "مصروف التوصيل النقدي",
      "الخصم",
      "المدفوع",
      "المتبقي",
    ];

    const rows = filteredOrders.map((order) => [
      order.orderNumber,
      formatDateTime(order.createdAt),
      getStatusLabel(normalizeStatus(order.status)),
      getPaymentLabel(normalizePaymentMethod(order.paymentMethod)),
      order.total.toFixed(2),
      order.productsTotal.toFixed(2),
      order.costTotal.toFixed(2),
      getOrderNetProfit(order).toFixed(2),
      order.deliveryFee.toFixed(2),
      order.deliveryCashExpense.toFixed(2),
      order.discount.toFixed(2),
      order.paidAmount.toFixed(2),
      order.remainingAmount.toFixed(2),
    ]);

    const csv = [headers, ...rows]
      .map((row) =>
        row
          .map((value) => `"${String(value).replaceAll('"', '""')}"`)
          .join(",")
      )
      .join("\n");

    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `mood-report-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="p-8 text-2xl font-bold text-gray-700">
        جاري تحميل التقارير...
      </div>
    );
  }

  return (
    <div className="space-y-7 p-4 md:p-8" dir="rtl">
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <h1 className="text-3xl font-bold md:text-4xl">التقارير الاحترافية</h1>
          <p className="mt-1 text-gray-500">
            المبيعات، الأرباح، التحصيل، طرق الدفع والتوصيل
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={loadReports}
            className="rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white"
          >
            تحديث
          </button>

          <button
            type="button"
            onClick={exportCsv}
            className="rounded-xl bg-blue-700 px-5 py-3 font-bold text-white"
          >
            تصدير CSV
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-xl bg-gray-800 px-5 py-3 font-bold text-white"
          >
            طباعة التقرير
          </button>
        </div>
      </header>

      <section className="rounded-2xl bg-white p-4 shadow">
        <div className="flex flex-wrap gap-2">
          <PeriodButton active={period === "today"} label="اليوم" onClick={() => setPeriod("today")} />
          <PeriodButton active={period === "yesterday"} label="أمس" onClick={() => setPeriod("yesterday")} />
          <PeriodButton active={period === "week"} label="آخر 7 أيام" onClick={() => setPeriod("week")} />
          <PeriodButton active={period === "month"} label="هذا الشهر" onClick={() => setPeriod("month")} />
          <PeriodButton active={period === "year"} label="هذه السنة" onClick={() => setPeriod("year")} />
          <PeriodButton active={period === "custom"} label="فترة مخصصة" onClick={() => setPeriod("custom")} />
          <PeriodButton active={period === "all"} label="الكل" onClick={() => setPeriod("all")} />
        </div>

        {period === "custom" && (
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="space-y-2">
              <span className="font-semibold">من تاريخ</span>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="w-full rounded-xl border p-3"
              />
            </label>

            <label className="space-y-2">
              <span className="font-semibold">إلى تاريخ</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="w-full rounded-xl border p-3"
              />
            </label>
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border p-3"
          >
            <option value="all">كل حالات الطلبات</option>
            {availableStatuses.map((status) => (
              <option key={status} value={status}>
                {getStatusLabel(status)}
              </option>
            ))}
          </select>

          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            className="rounded-xl border p-3"
          >
            <option value="all">كل طرق الدفع</option>
            {availablePayments.map((method) => (
              <option key={method} value={method}>
                {getPaymentLabel(method)}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-4 shadow">
        <p className="mb-3 font-bold">فصل التقرير حسب نوع الشغل</p>
        <div className="flex flex-wrap gap-2">
          {[
            ["all", "الكل"],
            ["bouquet", "🌹 الورد الطبيعي"],
            ["box", "🎁 البوكسات"],
            ["product", "📦 المنتجات"],
          ].map(([value, label]) => (
            <button key={value} type="button" onClick={() => setReportType(value as typeof reportType)} className={`rounded-xl px-4 py-3 font-bold ${reportType === value ? "bg-emerald-700 text-white" : "bg-gray-100 text-gray-700"}`}>{label}</button>
          ))}
        </div>
      </section>

      {reportType !== "all" && (
        <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <StatCard label="مبيعات القسم" value={`${itemReport.sales.toFixed(2)} د.ل`} valueClass="text-emerald-700" />
          <StatCard label="تكلفة القسم" value={`${itemReport.cost.toFixed(2)} د.ل`} valueClass="text-orange-700" />
          <StatCard label="ربح القسم" value={`${itemReport.profit.toFixed(2)} د.ل`} valueClass="text-blue-700" />
          <StatCard label="طلبات فيها هذا القسم" value={itemReport.ordersCount} valueClass="text-purple-700" />
        </section>
      )}

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="إجمالي المبيعات" value={`${summary.sales.toFixed(2)} د.ل`} valueClass="text-emerald-700" />
        <StatCard label="صافي الربح" value={`${summary.netProfit.toFixed(2)} د.ل`} valueClass="text-blue-700" />
        <StatCard label="عدد الطلبات" value={summary.ordersCount} valueClass="text-purple-700" />
        <StatCard label="متوسط الطلب" value={`${summary.averageOrder.toFixed(2)} د.ل`} valueClass="text-gray-800" />
      </section>

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="مبيعات المنتجات" value={`${summary.productsSales.toFixed(2)} د.ل`} valueClass="text-emerald-700" />
        <StatCard label="تكلفة المواد" value={`${summary.cost.toFixed(2)} د.ل`} valueClass="text-orange-700" />
        <StatCard label="مجمل الربح" value={`${summary.grossProfit.toFixed(2)} د.ل`} valueClass="text-indigo-700" />
        <StatCard label="هامش الربح" value={`${summary.profitMargin.toFixed(1)}%`} valueClass="text-blue-700" />
      </section>

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="المدفوع" value={`${summary.paid.toFixed(2)} د.ل`} valueClass="text-green-700" />
        <StatCard label="المتبقي" value={`${summary.remaining.toFixed(2)} د.ل`} valueClass="text-red-700" />
        <StatCard label="نسبة التحصيل" value={`${summary.collectionRate.toFixed(1)}%`} valueClass="text-cyan-700" />
        <StatCard label="الخصومات" value={`${summary.discounts.toFixed(2)} د.ل`} valueClass="text-orange-700" />
      </section>

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="رسوم التوصيل المحصلة" value={`${summary.deliveryFees.toFixed(2)} د.ل`} valueClass="text-sky-700" />
        <StatCard label="مصاريف التوصيل النقدي" value={`${summary.deliveryCashExpenses.toFixed(2)} د.ل`} valueClass="text-red-700" />
        <StatCard label="صافي دخل المنتجات" value={`${Math.max(0, summary.productsSales - summary.cost).toFixed(2)} د.ل`} valueClass="text-emerald-700" />
        <StatCard label="الطلبات الملغاة" value={filteredOrders.filter((o) => normalizeStatus(o.status) === "cancelled").length} valueClass="text-red-700" />
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-2xl bg-white p-6 shadow">
          <h2 className="mb-5 text-2xl font-bold">المبيعات اليومية</h2>

          {dailySummary.length === 0 ? (
            <p className="py-8 text-center text-gray-500">
              لا توجد مبيعات في هذه الفترة.
            </p>
          ) : (
            <div className="space-y-4">
              {dailySummary.slice(-14).map((day) => {
                const width = (day.sales / maxDailySales) * 100;

                return (
                  <div key={day.date}>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="font-semibold">
                        {new Date(day.date).toLocaleDateString("ar-LY")}
                      </span>
                      <span>
                        {day.sales.toFixed(2)} د.ل — {day.orders} طلب
                      </span>
                    </div>

                    <div className="h-3 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-emerald-600"
                        style={{ width: `${Math.max(2, width)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-white p-6 shadow">
          <h2 className="mb-5 text-2xl font-bold">طرق الدفع</h2>

          <div className="space-y-4">
            {paymentSummary.map((payment) => (
              <div key={payment.method} className="rounded-xl bg-gray-50 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold">{payment.label}</p>
                    <p className="mt-1 text-sm text-gray-500">
                      {payment.count} طلب
                    </p>
                  </div>

                  <div className="text-left">
                    <p className="text-xl font-bold text-emerald-700">
                      {payment.amount.toFixed(2)} د.ل
                    </p>
                    <p className="text-sm text-gray-500">
                      {payment.percentage.toFixed(1)}%
                    </p>
                  </div>
                </div>

                <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-200">
                  <div
                    className="h-full rounded-full bg-emerald-600"
                    style={{ width: `${payment.percentage}%` }}
                  />
                </div>
              </div>
            ))}

            {paymentSummary.length === 0 && (
              <p className="py-8 text-center text-gray-500">
                لا توجد بيانات دفع في هذه الفترة.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="overflow-x-auto rounded-2xl bg-white p-6 shadow">
        <h2 className="mb-5 text-2xl font-bold">التقرير اليومي التفصيلي</h2>

        <table className="w-full min-w-[950px]">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-3 text-right">التاريخ</th>
              <th className="p-3 text-right">الطلبات</th>
              <th className="p-3 text-right">المبيعات</th>
              <th className="p-3 text-right">مبيعات المنتجات</th>
              <th className="p-3 text-right">التكلفة</th>
              <th className="p-3 text-right">الربح</th>
              <th className="p-3 text-right">المدفوع</th>
              <th className="p-3 text-right">المتبقي</th>
            </tr>
          </thead>

          <tbody>
            {dailySummary.map((day) => (
              <tr key={day.date} className="border-b">
                <td className="p-3 font-semibold">
                  {new Date(day.date).toLocaleDateString("ar-LY")}
                </td>
                <td className="p-3">{day.orders}</td>
                <td className="p-3">{day.sales.toFixed(2)} د.ل</td>
                <td className="p-3">{day.productsSales.toFixed(2)} د.ل</td>
                <td className="p-3">{day.cost.toFixed(2)} د.ل</td>
                <td className="p-3 font-bold text-emerald-700">
                  {day.profit.toFixed(2)} د.ل
                </td>
                <td className="p-3 text-green-700">
                  {day.paid.toFixed(2)} د.ل
                </td>
                <td className="p-3 text-red-700">
                  {day.remaining.toFixed(2)} د.ل
                </td>
              </tr>
            ))}

            {dailySummary.length === 0 && (
              <tr>
                <td colSpan={8} className="p-10 text-center text-gray-500">
                  لا توجد طلبات في هذه الفترة.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function PeriodButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-5 py-3 font-semibold ${
        active
          ? "bg-emerald-700 text-white"
          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
      }`}
    >
      {label}
    </button>
  );
}

function StatCard({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string | number;
  valueClass: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow">
      <p className="text-gray-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold md:text-3xl ${valueClass}`}>
        {value}
      </p>
    </div>
  );
}

function calculateFinancialSummary(
  sourceOrders: ReportOrder[]
): FinancialSummary {
  if (sourceOrders.length === 0) return EMPTY_SUMMARY;

  const sales = sourceOrders.reduce((sum, order) => sum + order.total, 0);
  const productsSales = sourceOrders.reduce(
    (sum, order) => sum + order.productsTotal,
    0
  );
  const cost = sourceOrders.reduce(
    (sum, order) => sum + order.costTotal,
    0
  );
  const deliveryFees = sourceOrders.reduce(
    (sum, order) => sum + order.deliveryFee,
    0
  );
  const deliveryCashExpenses = sourceOrders.reduce(
    (sum, order) => sum + order.deliveryCashExpense,
    0
  );
  const discounts = sourceOrders.reduce(
    (sum, order) => sum + order.discount,
    0
  );
  const paid = sourceOrders.reduce(
    (sum, order) => sum + order.paidAmount,
    0
  );
  const remaining = sourceOrders.reduce(
    (sum, order) => sum + order.remainingAmount,
    0
  );

  const grossProfit = productsSales - cost;
  const netProfit = sourceOrders.reduce(
    (sum, order) => sum + getOrderNetProfit(order),
    0
  );

  return {
    ordersCount: sourceOrders.length,
    sales,
    productsSales,
    cost,
    grossProfit,
    netProfit,
    deliveryFees,
    deliveryCashExpenses,
    discounts,
    paid,
    remaining,
    averageOrder: sourceOrders.length > 0 ? sales / sourceOrders.length : 0,
    collectionRate: sales > 0 ? (paid / sales) * 100 : 0,
    profitMargin: productsSales > 0 ? (netProfit / productsSales) * 100 : 0,
  };
}

function filterOrdersByPeriod(
  orders: ReportOrder[],
  period: PeriodKey,
  customFrom: string,
  customTo: string
) {
  if (period === "all") return orders;

  if (period === "custom") {
    if (!customFrom && !customTo) return orders;

    const from = customFrom ? new Date(`${customFrom}T00:00:00`) : null;
    const to = customTo ? new Date(`${customTo}T23:59:59.999`) : null;

    return orders.filter((order) => {
      const date = new Date(order.createdAt);
      if (from && date < from) return false;
      if (to && date > to) return false;
      return true;
    });
  }

  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  if (period === "today") {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (period === "yesterday") {
    start.setDate(now.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    end.setDate(now.getDate() - 1);
    end.setHours(23, 59, 59, 999);
  } else if (period === "week") {
    start.setDate(now.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (period === "month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  }

  return orders.filter((order) => {
    const date = new Date(order.createdAt);
    return date >= start && date <= end;
  });
}

function getOrderNetProfit(order: ReportOrder) {
  const storedProfit = Number(order.profit || 0);

  if (storedProfit !== 0) {
    return storedProfit - order.deliveryCashExpense;
  }

  return order.productsTotal - order.costTotal - order.deliveryCashExpense;
}

function normalizeItemType(itemType: string): "bouquet" | "box" | "product" {
  const value = String(itemType || "").trim().toLowerCase();
  if (value.includes("bouquet") || value.includes("باقة")) return "bouquet";
  if (value.includes("box") || value.includes("بوكس")) return "box";
  return "product";
}

function normalizePaymentMethod(method: string) {
  const value = method.trim().toLowerCase();

  if (value.includes("mixed") || value.includes("مختلط")) return "mixed";
  if (value.includes("deposit") || value.includes("عربون")) return "deposit";
  if (value.includes("transfer") || value.includes("تحويل")) return "transfer";
  if (
    value.includes("bank") ||
    value.includes("card") ||
    value.includes("بطاق") ||
    value.includes("مصرف")
  ) {
    return "bank";
  }
  if (value.includes("cash") || value.includes("نقد")) return "cash";

  return value || "unknown";
}

function getPaymentLabel(method: string) {
  const labels: Record<string, string> = {
    cash: "نقدي",
    bank: "بطاقة / خدمات مصرفية",
    transfer: "تحويل مصرفي",
    deposit: "عربون",
    mixed: "دفع مختلط",
    unknown: "غير محدد",
  };

  return labels[method] || method;
}

function normalizeStatus(status: string) {
  const value = status.trim().toLowerCase();

  if (value.includes("cancel") || value.includes("ملغ")) return "cancelled";
  if (value.includes("deliver") || value.includes("تم التوصيل")) return "delivered";
  if (value.includes("complete") || value.includes("مكتمل")) return "completed";
  if (value.includes("ready") || value.includes("جاهز")) return "ready";
  if (value.includes("prepar") || value.includes("تجهيز")) return "preparing";
  if (value.includes("pending") || value.includes("انتظار")) return "pending";
  if (value.includes("new") || value.includes("جديد")) return "new";

  return value || "new";
}

function getStatusLabel(status: string) {
  const labels: Record<string, string> = {
    new: "جديد",
    pending: "قيد الانتظار",
    preparing: "قيد التجهيز",
    ready: "جاهز",
    completed: "مكتمل",
    delivered: "تم التوصيل",
    cancelled: "ملغي",
  };

  return labels[status] || status;
}

function toLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateTime(value: string) {
  if (!value) return "-";

  return new Date(value).toLocaleString("ar-LY", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "حدث خطأ غير متوقع";
}
