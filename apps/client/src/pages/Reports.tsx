import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useBranch } from "../context/BranchContext";
import OfferReportPanel from "../components/OfferReportPanel";
import { downloadExcelHtml, printHtmlReport } from "../lib/reportExport";

type PeriodKey =
  | "today"
  | "yesterday"
  | "week"
  | "month"
  | "year"
  | "custom"
  | "all";

type ReportOrder = {
  id: number;
  branchId: string;
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
};

type ExpenseRecord = {
  id: string;
  branchId: string;
  expenseDate: string;
  categoryName: string;
  expenseType: string;
  accountingType: "asset" | "operating" | "liability";
  paidAmount: number;
  amount: number;
  paymentMethod: string;
};

type WasteRecord = {
  id: string;
  branchId: string;
  wasteDate: string;
  itemName: string;
  detailName: string;
  quantity: number;
  totalCost: number;
  reason: string;
};

type SupplierInvoice = {
  id: string;
  branchId: string;
  supplierId: string;
  supplierName: string;
  grandTotal: number;
  paidAmount: number;
};

type SupplierPayment = {
  id: string;
  branchId: string;
  supplierId: string;
  amount: number;
};

type PaymentSummary = {
  method: string;
  label: string;
  amount: number;
  count: number;
  percentage: number;
};

type GroupSummary = {
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
  profitBeforeExpenses: number;
  expenses: number;
  waste: number;
  netProfit: number;
  paid: number;
  remaining: number;
};

type FinancialSummary = {
  ordersCount: number;
  sales: number;
  productsSales: number;
  cost: number;
  grossProfit: number;
  profitBeforeExpenses: number;
  netProfit: number;
  deliveryFees: number;
  deliveryCashExpenses: number;
  discounts: number;
  paid: number;
  remaining: number;
  averageOrder: number;
  collectionRate: number;
  profitMargin: number;
  expenses: number;
  waste: number;
  supplierDebt: number;
};

const EMPTY_SUMMARY: FinancialSummary = {
  ordersCount: 0,
  sales: 0,
  productsSales: 0,
  cost: 0,
  grossProfit: 0,
  profitBeforeExpenses: 0,
  netProfit: 0,
  deliveryFees: 0,
  deliveryCashExpenses: 0,
  discounts: 0,
  paid: 0,
  remaining: 0,
  averageOrder: 0,
  collectionRate: 0,
  profitMargin: 0,
  expenses: 0,
  waste: 0,
  supplierDebt: 0,
};

export default function Reports() {
  const { effectiveBranchId, branches } = useBranch();
  const [orders, setOrders] = useState<ReportOrder[]>([]);
  const [allOrders, setAllOrders] = useState<ReportOrder[]>([]);
  const [allExpenses, setAllExpenses] = useState<ExpenseRecord[]>([]);
  const [allWaste, setAllWaste] = useState<WasteRecord[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [waste, setWaste] = useState<WasteRecord[]>([]);
  const [supplierInvoices, setSupplierInvoices] = useState<SupplierInvoice[]>([]);
  const [supplierPayments, setSupplierPayments] = useState<SupplierPayment[]>([]);

  const [period, setPeriod] = useState<PeriodKey>("month");
  const [loading, setLoading] = useState(true);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");

  useEffect(() => {
    void loadReports();
  }, [effectiveBranchId]);

  async function loadReports() {
    setLoading(true);

    try {
      const [
        ordersResult,
        expensesResult,
        wasteResult,
        supplierInvoicesResult,
        supplierPaymentsResult,
      ] = await Promise.all([
        supabase
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
            branch_id
          `)
          .order("created_at", { ascending: false }),

        supabase
          .from("expenses")
          .select(`
            id,
            expense_date,
            category_name_snapshot,
            expense_type,
            accounting_type,
            paid_amount,
            amount,
            payment_method,
            branch_id
          `)
          .order("expense_date", { ascending: false }),

        supabase
          .from("stock_waste")
          .select(`
            id,
            waste_date,
            item_name_snapshot,
            detail_name_snapshot,
            quantity,
            total_cost,
            reason,
            branch_id
          `)
          .order("waste_date", { ascending: false }),

        supabase
          .from("purchase_invoices")
          .select(`
            id,
            supplier_id,
            supplier_name_snapshot,
            grand_total,
            paid_amount,
            branch_id
          `),

        supabase
          .from("supplier_payments")
          .select(`
            id,
            supplier_id,
            amount,
            branch_id
          `),
      ]);

      if (ordersResult.error) throw ordersResult.error;
      if (expensesResult.error) throw expensesResult.error;
      if (wasteResult.error) throw wasteResult.error;
      if (supplierInvoicesResult.error) throw supplierInvoicesResult.error;
      if (supplierPaymentsResult.error) throw supplierPaymentsResult.error;

      const mappedOrders: ReportOrder[] = (ordersResult.data || []).map((order: any) => ({
          id: Number(order.id),
          branchId: String(order.branch_id || ""),
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
        }));
      setAllOrders(mappedOrders);
      setOrders(effectiveBranchId ? mappedOrders.filter((order) => order.branchId === effectiveBranchId) : mappedOrders);

      const mappedExpenses: ExpenseRecord[] = (expensesResult.data || []).map((expense: any) => ({
          id: String(expense.id),
          branchId: String(expense.branch_id || ""),
          expenseDate: String(expense.expense_date || ""),
          categoryName: String(
            expense.category_name_snapshot || "مصروفات أخرى"
          ),
          expenseType: String(expense.expense_type || "variable"),
          accountingType: String(expense.accounting_type || "operating") as ExpenseRecord["accountingType"],
          paidAmount: Number(expense.paid_amount ?? expense.amount ?? 0),
          amount: Number(expense.amount || 0),
          paymentMethod: String(expense.payment_method || "cash"),
        }));
      setAllExpenses(mappedExpenses);
      setExpenses(effectiveBranchId ? mappedExpenses.filter((expense) => expense.branchId === effectiveBranchId) : mappedExpenses);

      const mappedWaste: WasteRecord[] = (wasteResult.data || []).map((record: any) => ({
          id: String(record.id),
          branchId: String(record.branch_id || ""),
          wasteDate: String(record.waste_date || ""),
          itemName: String(record.item_name_snapshot || ""),
          detailName: String(record.detail_name_snapshot || ""),
          quantity: Number(record.quantity || 0),
          totalCost: Number(record.total_cost || 0),
          reason: String(record.reason || "أخرى"),
        }));
      setAllWaste(mappedWaste);
      setWaste(effectiveBranchId ? mappedWaste.filter((record) => record.branchId === effectiveBranchId) : mappedWaste);

      setSupplierInvoices(
        (supplierInvoicesResult.data || []).map((invoice: any) => ({
          id: String(invoice.id),
          branchId: String(invoice.branch_id || ""),
          supplierId: String(invoice.supplier_id || ""),
          supplierName: String(invoice.supplier_name_snapshot || "بدون اسم"),
          grandTotal: Number(invoice.grand_total || 0),
          paidAmount: Number(invoice.paid_amount || 0),
        })).filter((invoice) => !effectiveBranchId || invoice.branchId === effectiveBranchId)
      );

      setSupplierPayments(
        (supplierPaymentsResult.data || []).map((payment: any) => ({
          id: String(payment.id),
          branchId: String(payment.branch_id || ""),
          supplierId: String(payment.supplier_id || ""),
          amount: Number(payment.amount || 0),
        })).filter((payment) => !effectiveBranchId || payment.branchId === effectiveBranchId)
      );
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  const dateFilteredOrders = useMemo(
    () => filterByPeriod(orders, period, customFrom, customTo, (item) => item.createdAt),
    [orders, period, customFrom, customTo]
  );

  const filteredExpenses = useMemo(
    () =>
      filterByPeriod(
        expenses,
        period,
        customFrom,
        customTo,
        (item) => `${item.expenseDate}T12:00:00`
      ),
    [expenses, period, customFrom, customTo]
  );

  const filteredWaste = useMemo(
    () =>
      filterByPeriod(
        waste,
        period,
        customFrom,
        customTo,
        (item) => `${item.wasteDate}T12:00:00`
      ),
    [waste, period, customFrom, customTo]
  );

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

  const totalExpenses = useMemo(
    () => filteredExpenses.reduce((sum, expense) => sum + expense.amount, 0),
    [filteredExpenses]
  );

  const accountingSummary = useMemo(() => ({
    assets: filteredExpenses.filter((x) => x.accountingType === "asset").reduce((s, x) => s + x.amount, 0),
    operating: filteredExpenses.filter((x) => x.accountingType === "operating").reduce((s, x) => s + x.amount, 0),
    liabilities: filteredExpenses.filter((x) => x.accountingType === "liability").reduce((s, x) => s + Math.max(x.amount - x.paidAmount, 0), 0),
  }), [filteredExpenses]);

  const totalWaste = useMemo(
    () => filteredWaste.reduce((sum, record) => sum + record.totalCost, 0),
    [filteredWaste]
  );

  const supplierDebt = useMemo(() => {
    const totalPurchases = supplierInvoices.reduce(
      (sum, invoice) => sum + invoice.grandTotal,
      0
    );
    const paidInsideInvoices = supplierInvoices.reduce(
      (sum, invoice) => sum + invoice.paidAmount,
      0
    );
    const laterPayments = supplierPayments.reduce(
      (sum, payment) => sum + payment.amount,
      0
    );

    return Math.max(totalPurchases - paidInsideInvoices - laterPayments, 0);
  }, [supplierInvoices, supplierPayments]);

  const summary = useMemo(
    () =>
      calculateFinancialSummary(
        completedOrders,
        totalExpenses,
        totalWaste,
        supplierDebt
      ),
    [completedOrders, totalExpenses, totalWaste, supplierDebt]
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

    return addPercentages(
      Array.from(map.values()).map((item) => ({
        ...item,
        percentage: 0,
      }))
    ).sort((a, b) => b.amount - a.amount);
  }, [completedOrders]);

  const expenseSummary = useMemo<GroupSummary[]>(() => {
    const map = new Map<string, { label: string; amount: number; count: number }>();

    for (const expense of filteredExpenses) {
      const label = expense.categoryName || "مصروفات أخرى";
      const current = map.get(label);

      if (current) {
        current.amount += expense.amount;
        current.count += 1;
      } else {
        map.set(label, { label, amount: expense.amount, count: 1 });
      }
    }

    return addPercentages(
      Array.from(map.values()).map((item) => ({
        ...item,
        percentage: 0,
      }))
    ).sort((a, b) => b.amount - a.amount);
  }, [filteredExpenses]);

  const wasteSummary = useMemo<GroupSummary[]>(() => {
    const map = new Map<string, { label: string; amount: number; count: number }>();

    for (const record of filteredWaste) {
      const label =
        [record.itemName, record.detailName].filter(Boolean).join(" — ") ||
        "عنصر غير محدد";
      const current = map.get(label);

      if (current) {
        current.amount += record.totalCost;
        current.count += record.quantity;
      } else {
        map.set(label, {
          label,
          amount: record.totalCost,
          count: record.quantity,
        });
      }
    }

    return addPercentages(
      Array.from(map.values()).map((item) => ({
        ...item,
        percentage: 0,
      }))
    ).sort((a, b) => b.amount - a.amount);
  }, [filteredWaste]);

  const supplierDebtSummary = useMemo<GroupSummary[]>(() => {
    const map = new Map<
      string,
      {
        label: string;
        supplierId: string;
        amount: number;
        count: number;
        paidInsideInvoices: number;
      }
    >();

    for (const invoice of supplierInvoices) {
      const key = invoice.supplierId || invoice.supplierName;
      const current = map.get(key);

      if (current) {
        current.amount += invoice.grandTotal;
        current.paidInsideInvoices += invoice.paidAmount;
        current.count += 1;
      } else {
        map.set(key, {
          label: invoice.supplierName,
          supplierId: invoice.supplierId,
          amount: invoice.grandTotal,
          paidInsideInvoices: invoice.paidAmount,
          count: 1,
        });
      }
    }

    for (const payment of supplierPayments) {
      const entry = Array.from(map.values()).find(
        (item) => item.supplierId === payment.supplierId
      );
      if (entry) entry.paidInsideInvoices += payment.amount;
    }

    const result = Array.from(map.values())
      .map((item) => ({
        label: item.label,
        amount: Math.max(item.amount - item.paidInsideInvoices, 0),
        count: item.count,
        percentage: 0,
      }))
      .filter((item) => item.amount > 0);

    return addPercentages(result).sort((a, b) => b.amount - a.amount);
  }, [supplierInvoices, supplierPayments]);

  const dailySummary = useMemo<DailySummary[]>(() => {
    const map = new Map<string, DailySummary>();

    for (const order of completedOrders) {
      const key = toLocalDateKey(new Date(order.createdAt));
      const current = map.get(key);
      const orderProfit = getOrderProfitBeforeExpenses(order);

      if (current) {
        current.orders += 1;
        current.sales += order.total;
        current.productsSales += order.productsTotal;
        current.cost += order.costTotal;
        current.profitBeforeExpenses += orderProfit;
        current.paid += order.paidAmount;
        current.remaining += order.remainingAmount;
      } else {
        map.set(key, {
          date: key,
          orders: 1,
          sales: order.total,
          productsSales: order.productsTotal,
          cost: order.costTotal,
          profitBeforeExpenses: orderProfit,
          expenses: 0,
          waste: 0,
          netProfit: orderProfit,
          paid: order.paidAmount,
          remaining: order.remainingAmount,
        });
      }
    }

    for (const expense of filteredExpenses) {
      const key = expense.expenseDate;
      const current = map.get(key);

      if (current) {
        current.expenses += expense.amount;
      } else {
        map.set(key, {
          date: key,
          orders: 0,
          sales: 0,
          productsSales: 0,
          cost: 0,
          profitBeforeExpenses: 0,
          expenses: expense.amount,
          waste: 0,
          netProfit: 0,
          paid: 0,
          remaining: 0,
        });
      }
    }

    for (const record of filteredWaste) {
      const key = record.wasteDate;
      const current = map.get(key);

      if (current) {
        current.waste += record.totalCost;
      } else {
        map.set(key, {
          date: key,
          orders: 0,
          sales: 0,
          productsSales: 0,
          cost: 0,
          profitBeforeExpenses: 0,
          expenses: 0,
          waste: record.totalCost,
          netProfit: 0,
          paid: 0,
          remaining: 0,
        });
      }
    }

    for (const value of map.values()) {
      value.netProfit =
        value.profitBeforeExpenses - value.expenses - value.waste;
    }

    return Array.from(map.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );
  }, [completedOrders, filteredExpenses, filteredWaste]);

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

  const branchComparison = useMemo(() => {
    if (effectiveBranchId || branches.length < 2) return [];

    return branches.map((branch) => {
      const branchOrders = filterByPeriod(
        allOrders.filter((order) => order.branchId === branch.id && normalizeStatus(order.status) !== "cancelled"),
        period, customFrom, customTo, (item) => item.createdAt
      );
      const branchExpenses = filterByPeriod(
        allExpenses.filter((expense) => expense.branchId === branch.id),
        period, customFrom, customTo, (item) => `${item.expenseDate}T12:00:00`
      );
      const branchWaste = filterByPeriod(
        allWaste.filter((record) => record.branchId === branch.id),
        period, customFrom, customTo, (item) => `${item.wasteDate}T12:00:00`
      );
      const expensesTotal = branchExpenses.reduce((sum, item) => sum + item.amount, 0);
      const wasteTotal = branchWaste.reduce((sum, item) => sum + item.totalCost, 0);
      const result = calculateFinancialSummary(branchOrders, expensesTotal, wasteTotal, 0);
      return { branchId: branch.id, branchName: branch.name, ...result };
    }).sort((a, b) => b.sales - a.sales);
  }, [effectiveBranchId, branches, allOrders, allExpenses, allWaste, period, customFrom, customTo]);

  function exportCsv() {
    const headers = [
      "رقم الطلب",
      "التاريخ",
      "الحالة",
      "طريقة الدفع",
      "إجمالي الطلب",
      "مبيعات المنتجات",
      "التكلفة",
      "ربح الطلب قبل المصروفات",
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
      getOrderProfitBeforeExpenses(order).toFixed(2),
      order.deliveryFee.toFixed(2),
      order.deliveryCashExpense.toFixed(2),
      order.discount.toFixed(2),
      order.paidAmount.toFixed(2),
      order.remainingAmount.toFixed(2),
    ]);

    rows.push([]);
    rows.push(["إجمالي المصروفات", totalExpenses.toFixed(2)]);
    rows.push(["إجمالي التوالف", totalWaste.toFixed(2)]);
    rows.push(["صافي الربح الحقيقي", summary.netProfit.toFixed(2)]);
    rows.push(["ديون الموردين الحالية", supplierDebt.toFixed(2)]);

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


  function exportExcel() {
    const headers = [
      "رقم الطلب", "التاريخ", "الحالة", "طريقة الدفع", "الإجمالي",
      "مبيعات المنتجات", "التكلفة", "الربح", "المدفوع", "المتبقي"
    ];
    const rows = filteredOrders.map((order) => [
      order.orderNumber,
      formatDateTime(order.createdAt),
      getStatusLabel(normalizeStatus(order.status)),
      getPaymentLabel(normalizePaymentMethod(order.paymentMethod)),
      order.total.toFixed(2),
      order.productsTotal.toFixed(2),
      order.costTotal.toFixed(2),
      getOrderProfitBeforeExpenses(order).toFixed(2),
      order.paidAmount.toFixed(2),
      order.remainingAmount.toFixed(2),
    ]);
    downloadExcelHtml({
      filename: `mood-report-${new Date().toISOString().slice(0, 10)}.xls`,
      title: "تقرير MOOD المالي",
      headers,
      rows,
      summaryRows: [
        ["عدد الطلبات", summary.ordersCount],
        ["إجمالي المبيعات", summary.sales.toFixed(2)],
        ["إجمالي المصروفات", summary.expenses.toFixed(2)],
        ["إجمالي الهالك", summary.waste.toFixed(2)],
        ["صافي الربح", summary.netProfit.toFixed(2)],
        ["ديون الموردين", summary.supplierDebt.toFixed(2)],
      ],
    });
  }

  function printPdfReport() {
    const rows = filteredOrders.slice(0, 500).map((order) => `
      <tr>
        <td>${order.orderNumber}</td>
        <td>${formatDateTime(order.createdAt)}</td>
        <td>${getStatusLabel(normalizeStatus(order.status))}</td>
        <td>${order.total.toFixed(2)}</td>
        <td>${getOrderProfitBeforeExpenses(order).toFixed(2)}</td>
        <td>${order.paidAmount.toFixed(2)}</td>
        <td>${order.remainingAmount.toFixed(2)}</td>
      </tr>`).join("");
    printHtmlReport({
      title: "التقرير المالي الشامل — MOOD",
      subtitle: `تاريخ الإصدار: ${new Date().toLocaleString("ar-LY")}`,
      bodyHtml: `
        <div class="summary">
          <div class="card">المبيعات<strong>${summary.sales.toFixed(2)} د.ل</strong></div>
          <div class="card">صافي الربح<strong>${summary.netProfit.toFixed(2)} د.ل</strong></div>
          <div class="card">عدد الطلبات<strong>${summary.ordersCount}</strong></div>
          <div class="card">المصروفات<strong>${summary.expenses.toFixed(2)} د.ل</strong></div>
          <div class="card">الهالك<strong>${summary.waste.toFixed(2)} د.ل</strong></div>
          <div class="card">ديون الموردين<strong>${summary.supplierDebt.toFixed(2)} د.ل</strong></div>
        </div>
        <table><thead><tr><th>الطلب</th><th>التاريخ</th><th>الحالة</th><th>الإجمالي</th><th>الربح</th><th>المدفوع</th><th>المتبقي</th></tr></thead><tbody>${rows}</tbody></table>
      `,
    });
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
          <h1 className="text-3xl font-bold md:text-4xl">
            التقارير المالية الشاملة
          </h1>
          <p className="mt-1 text-gray-500">
            المبيعات، التكلفة، المصروفات، التوالف وصافي الربح الحقيقي
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadReports()}
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
            onClick={exportExcel}
            className="rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white"
          >
            تصدير Excel
          </button>

          <button
            type="button"
            onClick={printPdfReport}
            className="rounded-xl bg-rose-700 px-5 py-3 font-bold text-white"
          >
            حفظ PDF / طباعة
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-xl bg-gray-800 px-5 py-3 font-bold text-white"
          >
            طباعة الصفحة
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
                onChange={(event) => setCustomFrom(event.target.value)}
                className="w-full rounded-xl border p-3"
              />
            </label>

            <label className="space-y-2">
              <span className="font-semibold">إلى تاريخ</span>
              <input
                type="date"
                value={customTo}
                onChange={(event) => setCustomTo(event.target.value)}
                className="w-full rounded-xl border p-3"
              />
            </label>
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
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
            onChange={(event) => setPaymentFilter(event.target.value)}
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

      <OfferReportPanel />

      {branchComparison.length > 1 && (
        <section className="rounded-2xl bg-white p-6 shadow">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold">مقارنة الفروع</h2>
              <p className="mt-1 text-sm text-gray-500">مقارنة MOOD وAlpha حسب الفترة المختارة</p>
            </div>
            <span className="rounded-full bg-amber-100 px-4 py-2 font-bold text-amber-800">المتصدر: {branchComparison[0]?.branchName}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-right">
              <thead className="bg-gray-900 text-white"><tr><th className="p-3">الفرع</th><th className="p-3">المبيعات</th><th className="p-3">صافي الربح</th><th className="p-3">الطلبات</th><th className="p-3">متوسط الطلب</th><th className="p-3">المصروفات</th><th className="p-3">الهالك</th><th className="p-3">هامش الربح</th></tr></thead>
              <tbody>{branchComparison.map((item, index) => (
                <tr key={item.branchId} className="border-b last:border-0">
                  <td className="p-3 font-bold">{index === 0 ? "🏆 " : ""}{item.branchName}</td>
                  <td className="p-3 font-semibold text-emerald-700">{money(item.sales)}</td>
                  <td className={`p-3 font-semibold ${item.netProfit >= 0 ? "text-blue-700" : "text-red-700"}`}>{money(item.netProfit)}</td>
                  <td className="p-3">{item.ordersCount}</td><td className="p-3">{money(item.averageOrder)}</td><td className="p-3 text-red-700">{money(item.expenses)}</td><td className="p-3 text-red-700">{money(item.waste)}</td><td className="p-3">{item.profitMargin.toFixed(1)}%</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      )}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="الأصول المسجلة" value={money(accountingSummary.assets)} valueClass="text-blue-700" />
        <StatCard label="المصروفات التشغيلية" value={money(accountingSummary.operating)} valueClass="text-red-700" />
        <StatCard label="الالتزامات المتبقية" value={money(accountingSummary.liabilities)} valueClass="text-amber-700" />
      </section>

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="إجمالي المبيعات" value={money(summary.sales)} valueClass="text-emerald-700" />
        <StatCard label="تكلفة المواد" value={money(summary.cost)} valueClass="text-orange-700" />
        <StatCard label="إجمالي المصروفات" value={money(summary.expenses)} valueClass="text-red-700" />
        <StatCard label="تكلفة التوالف" value={money(summary.waste)} valueClass="text-red-700" />
      </section>

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="مجمل الربح" value={money(summary.grossProfit)} valueClass="text-indigo-700" />
        <StatCard label="الربح قبل المصروفات" value={money(summary.profitBeforeExpenses)} valueClass="text-blue-700" />
        <StatCard label="صافي الربح الحقيقي" value={money(summary.netProfit)} valueClass={summary.netProfit >= 0 ? "text-emerald-700" : "text-red-700"} />
        <StatCard label="هامش صافي الربح" value={`${summary.profitMargin.toFixed(1)}%`} valueClass="text-blue-700" />
      </section>

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="عدد الطلبات" value={summary.ordersCount} valueClass="text-purple-700" />
        <StatCard label="متوسط الطلب" value={money(summary.averageOrder)} valueClass="text-gray-800" />
        <StatCard label="المدفوع" value={money(summary.paid)} valueClass="text-green-700" />
        <StatCard label="المتبقي من العملاء" value={money(summary.remaining)} valueClass="text-red-700" />
      </section>

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="نسبة التحصيل" value={`${summary.collectionRate.toFixed(1)}%`} valueClass="text-cyan-700" />
        <StatCard label="الخصومات" value={money(summary.discounts)} valueClass="text-orange-700" />
        <StatCard label="مصروف التوصيل النقدي" value={money(summary.deliveryCashExpenses)} valueClass="text-red-700" />
        <StatCard label="ديون الموردين الحالية" value={money(summary.supplierDebt)} valueClass="text-red-700" />
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <BarList
          title="المصروفات حسب الفئة"
          items={expenseSummary}
          emptyMessage="لا توجد مصروفات في هذه الفترة."
        />

        <BarList
          title="طرق الدفع"
          items={paymentSummary}
          emptyMessage="لا توجد بيانات دفع في هذه الفترة."
        />

        <BarList
          title="أكثر التوالف تكلفة"
          items={wasteSummary.slice(0, 10)}
          emptyMessage="لا توجد توالف في هذه الفترة."
        />

        <BarList
          title="ديون الموردين"
          items={supplierDebtSummary.slice(0, 10)}
          emptyMessage="لا توجد ديون موردين."
        />
      </section>

      <section className="rounded-2xl bg-white p-6 shadow">
        <h2 className="mb-5 text-2xl font-bold">المبيعات اليومية</h2>

        {dailySummary.length === 0 ? (
          <p className="py-8 text-center text-gray-500">
            لا توجد بيانات في هذه الفترة.
          </p>
        ) : (
          <div className="space-y-4">
            {dailySummary.slice(-14).map((day) => {
              const width = (day.sales / maxDailySales) * 100;

              return (
                <div key={day.date}>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-semibold">
                      {new Date(`${day.date}T12:00:00`).toLocaleDateString("ar-LY")}
                    </span>
                    <span>
                      {money(day.sales)} — {day.orders} طلب — صافي {money(day.netProfit)}
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
      </section>

      <section className="overflow-x-auto rounded-2xl bg-white p-6 shadow">
        <h2 className="mb-5 text-2xl font-bold">التقرير اليومي التفصيلي</h2>

        <table className="w-full min-w-[1250px]">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-3 text-right">التاريخ</th>
              <th className="p-3 text-right">الطلبات</th>
              <th className="p-3 text-right">المبيعات</th>
              <th className="p-3 text-right">التكلفة</th>
              <th className="p-3 text-right">الربح قبل المصروفات</th>
              <th className="p-3 text-right">المصروفات</th>
              <th className="p-3 text-right">التوالف</th>
              <th className="p-3 text-right">صافي الربح</th>
              <th className="p-3 text-right">المدفوع</th>
              <th className="p-3 text-right">المتبقي</th>
            </tr>
          </thead>

          <tbody>
            {dailySummary.map((day) => (
              <tr key={day.date} className="border-b">
                <td className="p-3 font-semibold">
                  {new Date(`${day.date}T12:00:00`).toLocaleDateString("ar-LY")}
                </td>
                <td className="p-3">{day.orders}</td>
                <td className="p-3">{money(day.sales)}</td>
                <td className="p-3">{money(day.cost)}</td>
                <td className="p-3 text-blue-700">
                  {money(day.profitBeforeExpenses)}
                </td>
                <td className="p-3 text-red-700">{money(day.expenses)}</td>
                <td className="p-3 text-red-700">{money(day.waste)}</td>
                <td
                  className={`p-3 font-bold ${
                    day.netProfit >= 0 ? "text-emerald-700" : "text-red-700"
                  }`}
                >
                  {money(day.netProfit)}
                </td>
                <td className="p-3 text-green-700">{money(day.paid)}</td>
                <td className="p-3 text-red-700">{money(day.remaining)}</td>
              </tr>
            ))}

            {dailySummary.length === 0 && (
              <tr>
                <td colSpan={10} className="p-10 text-center text-gray-500">
                  لا توجد بيانات في هذه الفترة.
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

function BarList({
  title,
  items,
  emptyMessage,
}: {
  title: string;
  items: Array<{
    label: string;
    amount: number;
    count: number;
    percentage: number;
  }>;
  emptyMessage: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow">
      <h2 className="mb-5 text-2xl font-bold">{title}</h2>

      {items.length === 0 ? (
        <p className="py-8 text-center text-gray-500">{emptyMessage}</p>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <div key={item.label} className="rounded-xl bg-gray-50 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-bold">{item.label}</p>
                  <p className="mt-1 text-sm text-gray-500">
                    {item.count} حركة
                  </p>
                </div>

                <div className="text-left">
                  <p className="text-xl font-bold text-emerald-700">
                    {money(item.amount)}
                  </p>
                  <p className="text-sm text-gray-500">
                    {item.percentage.toFixed(1)}%
                  </p>
                </div>
              </div>

              <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-emerald-600"
                  style={{ width: `${item.percentage}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function calculateFinancialSummary(
  sourceOrders: ReportOrder[],
  expenses: number,
  waste: number,
  supplierDebt: number
): FinancialSummary {
  if (sourceOrders.length === 0) {
    return {
      ...EMPTY_SUMMARY,
      expenses,
      waste,
      supplierDebt,
      netProfit: -expenses - waste,
    };
  }

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
  const profitBeforeExpenses = sourceOrders.reduce(
    (sum, order) => sum + getOrderProfitBeforeExpenses(order),
    0
  );
  const netProfit = profitBeforeExpenses - expenses - waste;

  return {
    ordersCount: sourceOrders.length,
    sales,
    productsSales,
    cost,
    grossProfit,
    profitBeforeExpenses,
    netProfit,
    deliveryFees,
    deliveryCashExpenses,
    discounts,
    paid,
    remaining,
    averageOrder: sourceOrders.length > 0 ? sales / sourceOrders.length : 0,
    collectionRate: sales > 0 ? (paid / sales) * 100 : 0,
    profitMargin: productsSales > 0 ? (netProfit / productsSales) * 100 : 0,
    expenses,
    waste,
    supplierDebt,
  };
}

function filterByPeriod<T>(
  items: T[],
  period: PeriodKey,
  customFrom: string,
  customTo: string,
  getDate: (item: T) => string
) {
  if (period === "all") return items;

  if (period === "custom") {
    if (!customFrom && !customTo) return items;

    const from = customFrom ? new Date(`${customFrom}T00:00:00`) : null;
    const to = customTo ? new Date(`${customTo}T23:59:59.999`) : null;

    return items.filter((item) => {
      const date = new Date(getDate(item));
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

  return items.filter((item) => {
    const date = new Date(getDate(item));
    return date >= start && date <= end;
  });
}

function addPercentages<
  T extends { amount: number; percentage: number }
>(items: T[]): T[] {
  const total = items.reduce((sum, item) => sum + item.amount, 0);

  return items.map((item) => ({
    ...item,
    percentage: total > 0 ? (item.amount / total) * 100 : 0,
  }));
}

function getOrderProfitBeforeExpenses(order: ReportOrder) {
  const storedProfit = Number(order.profit || 0);

  if (storedProfit !== 0) {
    return storedProfit - order.deliveryCashExpense;
  }

  return order.productsTotal - order.costTotal - order.deliveryCashExpense;
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

function money(value: number) {
  return `${Number(value || 0).toFixed(2)} د.ل`;
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