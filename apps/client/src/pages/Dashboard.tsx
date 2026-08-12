import { useEffect, useMemo, useState, type ReactNode } from "react";
import { loadSettings } from "../lib/settings";
import { supabase } from "../lib/supabase";
import { useBranch } from "../context/BranchContext";

type DashboardOrder = {
  id: number;
  order_number: string | null;
  customer_name: string | null;
  products_total: number | null;
  total: number | null;
  profit: number | null;
  cost_total: number | null;
  paid_amount: number | null;
  remaining_amount: number | null;
  payment_method: string | null;
  cash_amount?: number | null;
  bank_amount?: number | null;
  transfer_amount?: number | null;
  balance_amount?: number | null;
  delivery_cash_expense: number | null;
  status: string | null;
  created_at: string;
  delivery_date: string | null;
  delivery_time: string | null;
  branch_id: string | null;
};

type DashboardProduct = {
  id: number | string;
  name: string | null;
  stock: number | null;
  alert_limit: number | null;
  is_important?: boolean | null;
  isImportant?: boolean | null;
};

type UsageTier = {
  id: string;
  usage_price: number | null;
  stock: number | null;
  alert_limit: number | null;
};

type Expense = {
  id: string;
  expense_date: string;
  amount: number | null;
  payment_method?: string | null;
  branch_id: string | null;
};

type Waste = {
  id: string;
  waste_date: string;
  total_cost: number | null;
  branch_id: string | null;
};

type SupplierInvoice = {
  id: string;
  supplier_id: string | null;
  grand_total: number | null;
  paid_amount: number | null;
  cash_amount?: number | null;
  bank_amount?: number | null;
  transfer_amount?: number | null;
  balance_amount?: number | null;
  branch_id: string | null;
};

type ExternalDebt = {
  id: string;
  branch_id: string | null;
  party_name: string;
  direction: "receivable" | "payable";
  original_amount: number;
  paid_amount: number;
  due_date: string | null;
  notes: string | null;
  is_closed: boolean;
};

type SupplierPayment = {
  id: string;
  supplier_id: string | null;
  amount: number | null;
  branch_id: string | null;
};

type BackupInfo = {
  enabled: boolean;
  reminderDays: number;
  lastBackupAt: string | null;
};

export default function Dashboard() {
  const { effectiveBranchId, selectedBranch, branches } = useBranch();
  const [orders, setOrders] = useState<DashboardOrder[]>([]);
  const [allOrders, setAllOrders] = useState<DashboardOrder[]>([]);
  const [products, setProducts] = useState<DashboardProduct[]>([]);
  const [usageTiers, setUsageTiers] = useState<UsageTier[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [allExpenses, setAllExpenses] = useState<Expense[]>([]);
  const [waste, setWaste] = useState<Waste[]>([]);
  const [allWaste, setAllWaste] = useState<Waste[]>([]);
  const [supplierInvoices, setSupplierInvoices] = useState<SupplierInvoice[]>([]);
  const [supplierPayments, setSupplierPayments] = useState<SupplierPayment[]>([]);
  const [externalDebts, setExternalDebts] = useState<ExternalDebt[]>([]);
  const [backupInfo, setBackupInfo] = useState<BackupInfo>({
    enabled: true,
    reminderDays: 7,
    lastBackupAt: null,
  });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [comparisonPeriod, setComparisonPeriod] = useState<"today" | "week" | "month">("month");

  useEffect(() => {
    void loadDashboard();

    const refreshTimer = window.setInterval(() => {
      void loadDashboard();
    }, 30_000);

    return () => window.clearInterval(refreshTimer);
  }, [effectiveBranchId]);

  async function loadDashboard() {
    setRefreshing(true);
    setErrorMessage("");

    try {
      const [
        ordersResult,
        productsResult,
        tiersResult,
        expensesResult,
        wasteResult,
        supplierInvoicesResult,
        supplierPaymentsResult,
        externalDebtsResult,
        settingsData,
      ] = await Promise.all([
        supabase
          .from("orders")
          .select(`
            id,
            order_number,
            customer_name,
            products_total,
            total,
            profit,
            cost_total,
            paid_amount,
            remaining_amount,
            payment_method,
            cash_amount,
            bank_amount,
            transfer_amount,
            balance_amount,
            delivery_cash_expense,
            status,
            created_at,
            delivery_date,
            delivery_time,
            branch_id
          `)
          .order("created_at", { ascending: false }),

        supabase
          .from("product_details")
          .select(`
            id,
            name,
            stock,
            alert_limit,
            is_important
          `),

        supabase
          .from("usage_price_tiers")
          .select(`
            id,
            usage_price,
            stock,
            alert_limit
          `)
          .eq("is_active", true)
          .order("sort_order"),

        supabase
          .from("expenses")
          .select("id,expense_date,amount,payment_method,branch_id")
          .order("expense_date", { ascending: false }),

        supabase
          .from("stock_waste")
          .select("id,waste_date,total_cost,branch_id")
          .order("waste_date", { ascending: false }),

        supabase
          .from("purchase_invoices")
          .select("id,supplier_id,grand_total,paid_amount,cash_amount,bank_amount,transfer_amount,balance_amount,branch_id"),

        supabase
          .from("supplier_payments")
          .select("id,supplier_id,amount,branch_id"),

        supabase
          .from("external_debts")
          .select("id,branch_id,party_name,direction,original_amount,paid_amount,due_date,notes,is_closed")
          .eq("is_closed", false),

        loadSettings(),
      ]);

      if (ordersResult.error) throw ordersResult.error;
      if (productsResult.error) throw productsResult.error;
      if (tiersResult.error) throw tiersResult.error;
      if (expensesResult.error) throw expensesResult.error;
      if (wasteResult.error) throw wasteResult.error;
      if (supplierInvoicesResult.error) throw supplierInvoicesResult.error;
      if (supplierPaymentsResult.error) throw supplierPaymentsResult.error;
      if (externalDebtsResult.error) throw externalDebtsResult.error;

      const allOrderRows = (ordersResult.data || []) as DashboardOrder[];
      const allExpenseRows = (expensesResult.data || []) as Expense[];
      const allWasteRows = (wasteResult.data || []) as Waste[];
      const allInvoiceRows = (supplierInvoicesResult.data || []) as SupplierInvoice[];
      const allPaymentRows = (supplierPaymentsResult.data || []) as SupplierPayment[];

      const belongsToSelectedBranch = (row: { branch_id?: string | null }) =>
        !effectiveBranchId || String(row.branch_id || "") === effectiveBranchId;

      setAllOrders(allOrderRows);
      setAllExpenses(allExpenseRows);
      setAllWaste(allWasteRows);
      setOrders(allOrderRows.filter(belongsToSelectedBranch));
      setProducts((productsResult.data || []) as DashboardProduct[]);
      setUsageTiers((tiersResult.data || []) as UsageTier[]);
      setExpenses(allExpenseRows.filter(belongsToSelectedBranch));
      setWaste(allWasteRows.filter(belongsToSelectedBranch));
      setSupplierInvoices(allInvoiceRows.filter(belongsToSelectedBranch));
      setSupplierPayments(allPaymentRows.filter(belongsToSelectedBranch));
      setExternalDebts(((externalDebtsResult.data || []) as ExternalDebt[]).filter(belongsToSelectedBranch));

      setBackupInfo({
        enabled: settingsData.backup_enabled ?? true,
        reminderDays: Number(settingsData.backup_reminder_days || 7),
        lastBackupAt: settingsData.last_backup_at || null,
      });

      setLastUpdatedAt(new Date());
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const today = getLocalDateKey(new Date());

  const activeOrders = useMemo(
    () =>
      orders.filter(
        (order) => normalizeStatus(order.status || "") !== "cancelled"
      ),
    [orders]
  );

  const todayOrders = useMemo(
    () =>
      activeOrders.filter(
        (order) => getLocalDateKey(new Date(order.created_at)) === today
      ),
    [activeOrders, today]
  );

  const dueTodayOrders = useMemo(
    () =>
      activeOrders.filter(
        (order) =>
          order.delivery_date === today &&
          !["done", "completed", "delivered", "cancelled"].includes(
            normalizeStatus(order.status || "")
          )
      ),
    [activeOrders, today]
  );

  const overdueOrders = useMemo(
    () =>
      activeOrders.filter(
        (order) =>
          Boolean(order.delivery_date) &&
          String(order.delivery_date) < today &&
          !["done", "completed", "delivered", "cancelled"].includes(
            normalizeStatus(order.status || "")
          )
      ),
    [activeOrders, today]
  );

  const workingOrders = useMemo(
    () =>
      activeOrders.filter((order) =>
        ["working", "preparing", "pending", "new"].includes(
          normalizeStatus(order.status || "")
        )
      ),
    [activeOrders]
  );

  const readyOrders = useMemo(
    () =>
      activeOrders.filter(
        (order) => normalizeStatus(order.status || "") === "ready"
      ),
    [activeOrders]
  );

  const todaySales = useMemo(
    () =>
      todayOrders.reduce(
        (sum, order) => sum + Number(order.products_total || 0),
        0
      ),
    [todayOrders]
  );

  const todayExpenses = useMemo(
    () =>
      expenses
        .filter((expense) => expense.expense_date === today)
        .reduce((sum, expense) => sum + Number(expense.amount || 0), 0),
    [expenses, today]
  );

  const todayWaste = useMemo(
    () =>
      waste
        .filter((record) => record.waste_date === today)
        .reduce((sum, record) => sum + Number(record.total_cost || 0), 0),
    [waste, today]
  );

  const todayProfitBeforeExpenses = useMemo(
    () =>
      todayOrders.reduce((sum, order) => {
        const storedProfit = Number(order.profit || 0);
        const deliveryCashExpense = Number(order.delivery_cash_expense || 0);

        if (storedProfit !== 0) {
          return sum + storedProfit - deliveryCashExpense;
        }

        return (
          sum +
          Number(order.products_total || 0) -
          Number(order.cost_total || 0) -
          deliveryCashExpense
        );
      }, 0),
    [todayOrders]
  );

  const todayNetProfit =
    todayProfitBeforeExpenses - todayExpenses - todayWaste;

  const customerDebt = useMemo(
    () =>
      activeOrders.reduce(
        (sum, order) => sum + Number(order.remaining_amount || 0),
        0
      ),
    [activeOrders]
  );

  const supplierDebt = useMemo(() => {
    const purchases = supplierInvoices.reduce(
      (sum, invoice) => sum + Number(invoice.grand_total || 0),
      0
    );

    const paidInInvoices = supplierInvoices.reduce(
      (sum, invoice) => sum + Number(invoice.paid_amount || 0),
      0
    );

    const laterPayments = supplierPayments.reduce(
      (sum, payment) => sum + Number(payment.amount || 0),
      0
    );

    return Math.max(purchases - paidInInvoices - laterPayments, 0);
  }, [supplierInvoices, supplierPayments]);

  const todayCash = useMemo(
    () =>
      todayOrders
        .filter(
          (order) =>
            normalizePaymentMethod(order.payment_method || "") === "cash"
        )
        .reduce((sum, order) => sum + Number(order.paid_amount || 0), 0),
    [todayOrders]
  );

  const todayBank = useMemo(
    () =>
      todayOrders
        .filter((order) =>
          ["bank", "transfer", "mixed"].includes(
            normalizePaymentMethod(order.payment_method || "")
          )
        )
        .reduce((sum, order) => sum + Number(order.paid_amount || 0), 0),
    [todayOrders]
  );

  const currentBalances = useMemo(() => {
    const orderCash = activeOrders.reduce((sum, order) => sum + Number(order.cash_amount || 0), 0);
    const orderBank = activeOrders.reduce((sum, order) => sum + Number(order.bank_amount || 0) + Number(order.transfer_amount || 0), 0);
    const orderBalance = activeOrders.reduce((sum, order) => sum + Number(order.balance_amount || 0), 0);

    const cashExpenses = expenses.filter((row) => normalizePaymentMethod(row.payment_method || "cash") === "cash").reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const bankExpenses = expenses.filter((row) => ["bank", "transfer"].includes(normalizePaymentMethod(row.payment_method || ""))).reduce((sum, row) => sum + Number(row.amount || 0), 0);

    const purchaseCash = supplierInvoices.reduce((sum, row) => sum + Number(row.cash_amount || 0), 0);
    const purchaseBank = supplierInvoices.reduce((sum, row) => sum + Number(row.bank_amount || 0) + Number(row.transfer_amount || 0), 0);
    const purchaseBalance = supplierInvoices.reduce((sum, row) => sum + Number(row.balance_amount || 0), 0);

    return {
      cash: orderCash - cashExpenses - purchaseCash,
      bank: orderBank - bankExpenses - purchaseBank,
      balance: orderBalance - purchaseBalance,
    };
  }, [activeOrders, expenses, supplierInvoices]);

  const externalReceivable = useMemo(() => externalDebts.filter((d) => d.direction === "receivable").reduce((sum, d) => sum + Math.max(Number(d.original_amount || 0) - Number(d.paid_amount || 0), 0), 0), [externalDebts]);
  const externalPayable = useMemo(() => externalDebts.filter((d) => d.direction === "payable").reduce((sum, d) => sum + Math.max(Number(d.original_amount || 0) - Number(d.paid_amount || 0), 0), 0), [externalDebts]);

  async function addExternalDebt() {
    const partyName = window.prompt("اسم الشخص أو الجهة:")?.trim();
    if (!partyName) return;
    const kind = window.prompt("اكتب 1 إذا نبي منه، أو 2 إذا هو يبي مني:", "1");
    if (kind !== "1" && kind !== "2") return alert("اختيار غير صحيح");
    const amount = Number(window.prompt("المبلغ:", "0") || 0);
    if (!Number.isFinite(amount) || amount <= 0) return alert("المبلغ غير صحيح");
    const notes = window.prompt("ملاحظات (اختياري):") || "";
    const { error } = await supabase.from("external_debts").insert({
      branch_id: effectiveBranchId || null,
      party_name: partyName,
      direction: kind === "1" ? "receivable" : "payable",
      original_amount: amount,
      notes: notes || null,
    });
    if (error) return alert(error.message);
    await loadDashboard();
  }

  const lowStockProducts = useMemo(() => {
    return products
      .filter(
        (product) =>
          Number(product.alert_limit || 0) > 0 &&
          Number(product.stock || 0) <= Number(product.alert_limit || 0)
      )
      .sort((a, b) => Number(a.stock || 0) - Number(b.stock || 0));
  }, [products]);

  const lowStockTiers = useMemo(() => {
    // الورد الصناعي أصبح مصروفًا تشغيليًا ولا يدخل في تنبيهات المخزون.
    return usageTiers.filter(() => false);
  }, [usageTiers]);

  const allLowStockCount = lowStockProducts.length + lowStockTiers.length;
  const lastOrders = useMemo(() => orders.slice(0, 7), [orders]);

  const backupNeedsAttention = useMemo(() => {
    if (!backupInfo.enabled) return false;
    if (!backupInfo.lastBackupAt) return true;

    const lastBackup = new Date(backupInfo.lastBackupAt);
    if (Number.isNaN(lastBackup.getTime())) return true;

    const elapsedMilliseconds = Date.now() - lastBackup.getTime();
    const elapsedDays = elapsedMilliseconds / (1000 * 60 * 60 * 24);

    return elapsedDays >= backupInfo.reminderDays;
  }, [backupInfo]);

  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = getLocalDateKey(yesterdayDate);

  const yesterdayOrders = useMemo(
    () =>
      activeOrders.filter(
        (order) => getLocalDateKey(new Date(order.created_at)) === yesterday
      ),
    [activeOrders, yesterday]
  );

  const yesterdaySales = useMemo(
    () =>
      yesterdayOrders.reduce(
        (sum, order) => sum + Number(order.products_total || 0),
        0
      ),
    [yesterdayOrders]
  );

  const salesChange = percentageChange(todaySales, yesterdaySales);
  const ordersChange = percentageChange(todayOrders.length, yesterdayOrders.length);

  const lastSevenDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - index));
      const key = getLocalDateKey(date);
      const dayOrders = activeOrders.filter(
        (order) => getLocalDateKey(new Date(order.created_at)) === key
      );

      return {
        key,
        label: date.toLocaleDateString("ar-LY", { weekday: "short" }),
        sales: dayOrders.reduce(
          (sum, order) => sum + Number(order.products_total || 0),
          0
        ),
        orders: dayOrders.length,
      };
    });
  }, [activeOrders]);

  const maxSevenDaySales = Math.max(
    ...lastSevenDays.map((day) => day.sales),
    1
  );

  const healthMessage = overdueOrders.length > 0
    ? `يوجد ${overdueOrders.length} طلب متأخر يحتاج متابعة`
    : allLowStockCount > 0
      ? `يوجد ${allLowStockCount} تنبيه مخزون يحتاج مراجعة`
      : "كل المؤشرات التشغيلية طبيعية الآن";
  const comparisonStartDate = useMemo(() => {
    const date = new Date();
    if (comparisonPeriod === "today") return getLocalDateKey(date);
    if (comparisonPeriod === "week") date.setDate(date.getDate() - 6);
    else date.setDate(1);
    return getLocalDateKey(date);
  }, [comparisonPeriod]);

  const branchComparison = useMemo(() => {
    return branches.map((branch) => {
      const branchOrders = allOrders.filter(
        (order) =>
          String(order.branch_id || "") === branch.id &&
          getLocalDateKey(new Date(order.created_at)) >= comparisonStartDate &&
          normalizeStatus(order.status || "") !== "cancelled"
      );
      const branchExpenses = allExpenses.filter(
        (expense) =>
          String(expense.branch_id || "") === branch.id &&
          expense.expense_date >= comparisonStartDate
      );
      const branchWaste = allWaste.filter(
        (record) =>
          String(record.branch_id || "") === branch.id &&
          record.waste_date >= comparisonStartDate
      );

      const sales = branchOrders.reduce(
        (sum, order) => sum + Number(order.products_total || 0),
        0
      );
      const grossProfit = branchOrders.reduce((sum, order) => {
        const storedProfit = Number(order.profit || 0);
        const deliveryExpense = Number(order.delivery_cash_expense || 0);
        return sum + (storedProfit !== 0
          ? storedProfit - deliveryExpense
          : Number(order.products_total || 0) - Number(order.cost_total || 0) - deliveryExpense);
      }, 0);
      const expenseTotal = branchExpenses.reduce(
        (sum, expense) => sum + Number(expense.amount || 0),
        0
      );
      const wasteTotal = branchWaste.reduce(
        (sum, record) => sum + Number(record.total_cost || 0),
        0
      );
      const netProfit = grossProfit - expenseTotal - wasteTotal;
      const collected = branchOrders.reduce(
        (sum, order) => sum + Number(order.paid_amount || 0),
        0
      );
      const outstanding = branchOrders.reduce(
        (sum, order) => sum + Number(order.remaining_amount || 0),
        0
      );

      return {
        id: branch.id,
        name: branch.name,
        color: branch.primaryColor,
        orders: branchOrders.length,
        sales,
        netProfit,
        expenses: expenseTotal,
        waste: wasteTotal,
        collected,
        outstanding,
        averageOrder: branchOrders.length ? sales / branchOrders.length : 0,
      };
    });
  }, [branches, allOrders, allExpenses, allWaste, comparisonStartDate]);

  const comparisonLeader = useMemo(
    () => [...branchComparison].sort((a, b) => b.sales - a.sales)[0] || null,
    [branchComparison]
  );


  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center" dir="rtl">
        <div className="rounded-2xl bg-white px-8 py-6 text-xl font-bold shadow-sm">
          جاري تحميل لوحة التحكم...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-3 md:p-5" dir="rtl">
      <header
        className="overflow-hidden rounded-3xl border p-5 text-white shadow-lg md:p-7"
        style={{
          borderColor: "color-mix(in srgb, var(--branch-primary) 24%, white)",
          background:
            "linear-gradient(to left, color-mix(in srgb, var(--branch-primary) 100%, black), color-mix(in srgb, var(--branch-primary) 86%, black), color-mix(in srgb, var(--branch-primary) 72%, white))",
        }}
      >
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm text-white/80">
              <span className="inline-flex h-2.5 w-2.5 rounded-full bg-white/80 shadow-[0_0_0_5px_rgba(255,255,255,0.14)]" />
              لوحة مباشرة — تحديث تلقائي كل 30 ثانية
            </div>
            <h1 className="text-3xl font-black md:text-4xl">
              لوحة تحكم {selectedBranch?.name || "الفروع"}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-white/90 md:text-base">
              نظرة سريعة على المبيعات والطلبات والمخزون والتحصيلات.
            </p>
          </div>

          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <div className="rounded-2xl bg-white/10 px-4 py-3 text-sm backdrop-blur">
              <p className="font-semibold">
                {new Date().toLocaleDateString("ar-LY", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
              <p className="mt-1 text-xs text-white/75">
                {lastUpdatedAt
                  ? `آخر تحديث ${lastUpdatedAt.toLocaleTimeString("ar-LY")}`
                  : "لم يتم التحديث بعد"}
              </p>
            </div>

            <button
              type="button"
              onClick={() => void loadDashboard()}
              disabled={refreshing}
              className="rounded-2xl bg-white px-5 py-3 font-bold shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
              style={{ color: "var(--branch-primary)" }}
            >
              {refreshing ? "جاري التحديث..." : "↻ تحديث الآن"}
            </button>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3 rounded-2xl bg-black/10 px-4 py-3 text-sm backdrop-blur">
          <span className="text-xl">
            {overdueOrders.length > 0 ? "🔴" : allLowStockCount > 0 ? "🟠" : "🟢"}
          </span>
          <span className="font-semibold">{healthMessage}</span>
        </div>
      </header>

      {errorMessage && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 font-semibold text-red-700">
          {errorMessage}
        </div>
      )}

      {branches.length > 1 && (
        <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm md:p-6">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <h2 className="text-2xl font-black text-gray-800">مقارنة الفروع</h2>
              <p className="mt-1 text-sm text-gray-500">
                مقارنة مباشرة بين MOOD وAlpha حسب المبيعات والربح والتحصيل.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {([
                ["today", "اليوم"],
                ["week", "آخر 7 أيام"],
                ["month", "هذا الشهر"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setComparisonPeriod(value)}
                  className={`rounded-xl px-4 py-2 text-sm font-black transition ${
                    comparisonPeriod === value
                      ? "text-white shadow-sm"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                  style={comparisonPeriod === value ? { backgroundColor: "var(--branch-primary)" } : undefined}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {comparisonLeader && (
            <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
              🏆 الأعلى مبيعًا في الفترة: {comparisonLeader.name} — {money(comparisonLeader.sales)}
            </div>
          )}

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {branchComparison.map((branch) => (
              <div key={branch.id} className="overflow-hidden rounded-3xl border border-gray-100 bg-gray-50">
                <div className="flex items-center justify-between gap-3 px-5 py-4 text-white" style={{ backgroundColor: branch.color }}>
                  <div>
                    <p className="text-sm text-white/80">الفرع</p>
                    <h3 className="text-2xl font-black">{branch.name}</h3>
                  </div>
                  <div className="rounded-2xl bg-white/15 px-4 py-2 text-center backdrop-blur">
                    <p className="text-xs text-white/75">المبيعات</p>
                    <p className="text-xl font-black">{money(branch.sales)}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-px bg-gray-200 sm:grid-cols-4">
                  <ComparisonStat label="الطلبات" value={branch.orders} />
                  <ComparisonStat label="صافي الربح" value={money(branch.netProfit)} positive={branch.netProfit >= 0} />
                  <ComparisonStat label="متوسط الطلب" value={money(branch.averageOrder)} />
                  <ComparisonStat label="المصروفات" value={money(branch.expenses)} />
                  <ComparisonStat label="المحصل" value={money(branch.collected)} />
                  <ComparisonStat label="المتبقي" value={money(branch.outstanding)} />
                  <ComparisonStat label="التوالف" value={money(branch.waste)} />
                  <ComparisonStat
                    label="هامش الربح"
                    value={`${branch.sales > 0 ? ((branch.netProfit / branch.sales) * 100).toFixed(1) : "0.0"}%`}
                    positive={branch.netProfit >= 0}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black text-gray-800">الرصيد الحالي — بدون مدة زمنية</h2>
            <p className="mt-1 text-sm text-gray-500">يزيد وينقص مع المبيعات والمصروفات والمشتريات، ويمكن أن يظهر بالسالب.</p>
          </div>
          <button type="button" onClick={() => void addExternalDebt()} className="rounded-xl bg-gray-900 px-4 py-3 font-bold text-white">+ إضافة دين خارجي</button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-5">
          <MetricCard icon="💵" title="الكاش الحالي" value={money(currentBalances.cash)} tone={currentBalances.cash >= 0 ? "emerald" : "red"} />
          <MetricCard icon="🏦" title="المصرف الحالي" value={money(currentBalances.bank)} tone={currentBalances.bank >= 0 ? "blue" : "red"} />
          <MetricCard icon="💳" title="الرصيد الحالي" value={money(currentBalances.balance)} tone={currentBalances.balance >= 0 ? "purple" : "red"} />
          <MetricCard icon="📈" title="ديون لينا" value={money(externalReceivable)} tone="emerald" />
          <MetricCard icon="📉" title="ديون علينا" value={money(externalPayable)} tone="red" />
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard icon="💰" title="مبيعات اليوم" value={money(todaySales)} tone="emerald" trend={salesChange} trendLabel="عن أمس" />
        <MetricCard icon="📈" title="صافي ربح اليوم" value={money(todayNetProfit)} tone={todayNetProfit >= 0 ? "blue" : "red"} />
        <MetricCard icon="🧾" title="طلبات اليوم" value={todayOrders.length} tone="purple" trend={ordersChange} trendLabel="عن أمس" />
        <MetricCard icon="💸" title="مصروفات اليوم" value={money(todayExpenses)} tone="red" />
        <MetricCard icon="🗑️" title="التوالف اليوم" value={money(todayWaste)} tone="orange" />
        <MetricCard icon="⏳" title="قيد التنفيذ" value={workingOrders.length} tone="orange" />
        <MetricCard icon="✅" title="جاهزة للاستلام" value={readyOrders.length} tone="purple" />
        <MetricCard icon="📦" title="تنبيهات المخزون" value={allLowStockCount} tone={allLowStockCount > 0 ? "red" : "emerald"} />
        <MetricCard icon="👥" title="المتبقي من العملاء" value={money(customerDebt)} tone="red" />
        <MetricCard icon="🚚" title="ديون الموردين" value={money(supplierDebt)} tone="blue" />
        <MetricCard icon="💵" title="تحصيل نقدي اليوم" value={money(todayCash)} tone="emerald" />
        <MetricCard icon="💳" title="تحصيل مصرفي اليوم" value={money(todayBank)} tone="blue" />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm xl:col-span-2">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-black text-gray-800">مبيعات آخر 7 أيام</h2>
              <p className="mt-1 text-sm text-gray-500">اتجاه المبيعات وعدد الطلبات يومًا بيوم</p>
            </div>
            <span className="rounded-full px-3 py-1 text-sm font-bold"
              style={{
                backgroundColor: "color-mix(in srgb, var(--branch-primary) 9%, white)",
                color: "var(--branch-primary)",
              }}>
              {money(lastSevenDays.reduce((sum, day) => sum + day.sales, 0))}
            </span>
          </div>

          <div className="flex h-64 items-end gap-2 rounded-2xl bg-gray-50 p-4 sm:gap-4">
            {lastSevenDays.map((day) => {
              const height = Math.max((day.sales / maxSevenDaySales) * 100, day.sales > 0 ? 8 : 2);
              return (
                <div key={day.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
                  <div className="text-center text-xs font-bold text-gray-600">{day.sales > 0 ? Math.round(day.sales) : ""}</div>
                  <div className="group relative flex h-[75%] w-full items-end justify-center">
                    <div
                      className="w-full max-w-12 rounded-t-xl bg-gradient-to-t from-emerald-700 to-emerald-400 transition hover:brightness-110"
                      style={{ height: `${height}%` }}
                      title={`${day.label}: ${money(day.sales)} — ${day.orders} طلب`}
                    />
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-bold text-gray-700">{day.label}</p>
                    <p className="text-[11px] text-gray-400">{day.orders} طلب</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-xl font-black text-gray-800">التنبيهات المهمة</h2>
            <p className="mt-1 text-sm text-gray-500">أهم ما يحتاج متابعة الآن</p>
          </div>
          <div className="space-y-3">
            <AlertCard title="طلبات موعدها اليوم" value={dueTodayOrders.length} description="لم يتم تسليمها بعد" className="border-amber-200 bg-amber-50 text-amber-800" />
            <AlertCard title="طلبات متأخرة" value={overdueOrders.length} description="تجاوزت موعد التسليم" className="border-red-200 bg-red-50 text-red-700" />
            <AlertCard title="ديون الموردين" value={money(supplierDebt)} description="إجمالي الرصيد غير المسدد" className="border-blue-200 bg-blue-50 text-blue-700" />
            <AlertCard title="النسخ الاحتياطي" value={backupNeedsAttention ? "مطلوب" : "سليم"} description={backupNeedsAttention ? "حان موعد إنشاء نسخة جديدة" : "لا يحتاج إجراء الآن"} className={backupNeedsAttention ? "border-orange-200 bg-orange-50 text-orange-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"} />
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <StockPanel title="المنتجات منخفضة المخزون" count={lowStockProducts.length} emptyText="لا توجد تنبيهات للمنتجات.">
          {lowStockProducts.slice(0, 10).map((product) => (
            <StockRow key={String(product.id)} title={`${(product.is_important ?? product.isImportant) ? "⭐ " : ""}${product.name || "منتج بدون اسم"}`} subtitle={`حد التنبيه: ${Number(product.alert_limit || 0)}`} stock={Number(product.stock || 0)} />
          ))}
        </StockPanel>

        <StockPanel title="فئات الاستخدام المنخفضة" count={lowStockTiers.length} emptyText="مخزون فئات الاستخدام جيد.">
          {lowStockTiers.map((tier) => (
            <StockRow key={tier.id} title={`فئة ${Number(tier.usage_price || 0)} د.ل`} subtitle={`حد التنبيه: ${Number(tier.alert_limit || 0)}`} stock={Number(tier.stock || 0)} />
          ))}
        </StockPanel>

        <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-black text-gray-800">آخر الطلبات</h2>
            <span className="text-sm font-semibold text-gray-400">آخر {lastOrders.length}</span>
          </div>
          {lastOrders.length === 0 ? (
            <EmptyState text="لا توجد طلبات بعد." />
          ) : (
            <div className="max-h-[420px] space-y-3 overflow-y-auto pl-1">
              {lastOrders.map((order) => (
                <div key={order.id} className="rounded-2xl border border-gray-100 p-4 transition"
                  onMouseEnter={(event) => {
                    event.currentTarget.style.borderColor =
                      "color-mix(in srgb, var(--branch-primary) 25%, white)";
                    event.currentTarget.style.backgroundColor =
                      "color-mix(in srgb, var(--branch-primary) 4%, white)";
                  }}
                  onMouseLeave={(event) => {
                    event.currentTarget.style.borderColor = "";
                    event.currentTarget.style.backgroundColor = "";
                  }}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold text-gray-800">طلب #{order.order_number || order.id}</p>
                        <StatusBadge status={order.status || "new"} />
                      </div>
                      <p className="mt-1 text-sm text-gray-500">{order.customer_name || "عميل غير مسجل"}</p>
                      <p className="mt-1 text-xs text-gray-400">{formatDateTime(order.created_at)}</p>
                    </div>
                    <span className="whitespace-nowrap font-black"
                    style={{ color: "var(--branch-primary)" }}>{money(Number(order.total || 0))}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {(dueTodayOrders.length > 0 || overdueOrders.length > 0) && (
        <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xl font-black text-gray-800">طلبات تحتاج متابعة</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {[...overdueOrders, ...dueTodayOrders]
              .filter((order, index, list) => list.findIndex((entry) => entry.id === order.id) === index)
              .slice(0, 10)
              .map((order) => {
                const isOverdue = Boolean(order.delivery_date) && String(order.delivery_date) < today;
                return (
                  <div key={order.id} className={`flex items-center justify-between gap-3 rounded-2xl border p-4 ${isOverdue ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
                    <div>
                      <p className="font-black text-gray-800">طلب #{order.order_number || order.id}</p>
                      <p className="mt-1 text-sm text-gray-600">{order.customer_name || "عميل غير مسجل"}</p>
                    </div>
                    <div className="text-left text-sm">
                      <p className={isOverdue ? "font-black text-red-700" : "font-black text-amber-700"}>{isOverdue ? "متأخر" : "موعده اليوم"}</p>
                      <p className="mt-1 text-gray-500">{formatDeliveryDateTime(order.delivery_date, order.delivery_time)}</p>
                    </div>
                  </div>
                );
              })}
          </div>
        </section>
      )}
    </div>
  );
}

function ComparisonStat({
  label,
  value,
  positive,
}: {
  label: string;
  value: string | number;
  positive?: boolean;
}) {
  return (
    <div className="bg-white p-4 text-center">
      <p className="text-xs font-semibold text-gray-500">{label}</p>
      <p className={`mt-2 text-base font-black ${
        positive === undefined ? "text-gray-800" : positive ? "text-emerald-700" : "text-red-700"
      }`}>
        {value}
      </p>
    </div>
  );
}

function MetricCard({
  icon,
  title,
  value,
  tone,
  trend,
  trendLabel,
}: {
  icon: string;
  title: string;
  value: string | number;
  tone: "emerald" | "blue" | "purple" | "red" | "orange";
  trend?: number | null;
  trendLabel?: string;
}) {
  const tones = {
    emerald: "border-emerald-100 bg-gradient-to-br from-white to-emerald-50 text-emerald-700",
    blue: "border-blue-100 bg-gradient-to-br from-white to-blue-50 text-blue-700",
    purple: "border-purple-100 bg-gradient-to-br from-white to-purple-50 text-purple-700",
    red: "border-red-100 bg-gradient-to-br from-white to-red-50 text-red-700",
    orange: "border-orange-100 bg-gradient-to-br from-white to-orange-50 text-orange-700",
  };

  return (
    <div className={`group min-h-36 rounded-3xl border p-4 shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-md md:p-5 ${tones[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-500">{title}</p>
          <h3 className="mt-3 text-2xl font-black md:text-3xl">{value}</h3>
        </div>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-2xl shadow-sm transition group-hover:scale-105">
          {icon}
        </span>
      </div>
      {trend !== undefined && trend !== null && (
        <p className={`mt-3 text-xs font-bold ${trend >= 0 ? "text-emerald-600" : "text-red-600"}`}>
          {trend >= 0 ? "↑" : "↓"} {Math.abs(trend).toFixed(1)}% {trendLabel || ""}
        </p>
      )}
    </div>
  );
}

function StockPanel({
  title,
  count,
  emptyText,
  children,
}: {
  title: string;
  count: number;
  emptyText: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xl font-black text-gray-800">{title}</h2>
        <span className={`rounded-full px-3 py-1 text-sm font-black ${count > 0 ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
          {count}
        </span>
      </div>
      {count === 0 ? <EmptyState text={emptyText} /> : <div className="max-h-[420px] space-y-3 overflow-y-auto pl-1">{children}</div>}
    </section>
  );
}

function StockRow({ title, subtitle, stock }: { title: string; subtitle: string; stock: number }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-red-100 bg-red-50/60 p-4">
      <div>
        <p className="font-bold text-gray-800">{title}</p>
        <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
      </div>
      <span className="flex h-10 min-w-10 items-center justify-center rounded-xl bg-white px-2 font-black text-red-600 shadow-sm">{stock}</span>
    </div>
  );
}

function AlertCard({
  title,
  value,
  description,
  className,
}: {
  title: string;
  value: string | number;
  description: string;
  className: string;
}) {
  return (
    <div className={`rounded-xl border p-4 ${className}`}>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
      <p className="mt-1 text-xs opacity-80">{description}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl bg-gray-50 p-8 text-center text-gray-500">
      {text}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const normalized = normalizeStatus(status);

  const labels: Record<string, string> = {
    new: "جديد",
    pending: "قيد الانتظار",
    working: "جاري التنفيذ",
    preparing: "قيد التجهيز",
    ready: "جاهز",
    done: "تم التسليم",
    completed: "مكتمل",
    delivered: "تم التوصيل",
    cancelled: "ملغي",
  };

  const classes: Record<string, string> = {
    new: "bg-blue-100 text-blue-700",
    pending: "bg-yellow-100 text-yellow-700",
    working: "bg-orange-100 text-orange-700",
    preparing: "bg-orange-100 text-orange-700",
    ready: "bg-purple-100 text-purple-700",
    done: "bg-green-100 text-green-700",
    completed: "bg-green-100 text-green-700",
    delivered: "bg-green-100 text-green-700",
    cancelled: "bg-red-100 text-red-700",
  };

  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
        classes[normalized] || "bg-gray-100 text-gray-700"
      }`}
    >
      {labels[normalized] || normalized}
    </span>
  );
}

function normalizeStatus(status: string) {
  const value = status.trim().toLowerCase();

  if (value.includes("cancel") || value.includes("ملغ")) return "cancelled";
  if (value.includes("deliver") || value.includes("تم التوصيل")) return "delivered";
  if (value.includes("complete") || value.includes("مكتمل")) return "completed";
  if (value.includes("done") || value.includes("تم التسليم")) return "done";
  if (value.includes("ready") || value.includes("جاهز")) return "ready";
  if (value.includes("prepar") || value.includes("تجهيز")) return "preparing";
  if (value.includes("working") || value.includes("تنفيذ")) return "working";
  if (value.includes("pending") || value.includes("انتظار")) return "pending";
  if (value.includes("new") || value.includes("جديد")) return "new";

  return value || "new";
}

function normalizePaymentMethod(method: string) {
  const value = method.trim().toLowerCase();

  if (value.includes("mixed") || value.includes("مختلط")) return "mixed";
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

function getLocalDateKey(date: Date) {
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("ar-LY");
}

function formatDeliveryDateTime(
  deliveryDate: string | null,
  deliveryTime: string | null
) {
  return [deliveryDate, deliveryTime].filter(Boolean).join(" — ") || "-";
}

function money(value: number) {
  return `${Number(value || 0).toFixed(2)} د.ل`;
}

function percentageChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / Math.abs(previous)) * 100;
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

  return "حدث خطأ أثناء تحميل لوحة التحكم";
}