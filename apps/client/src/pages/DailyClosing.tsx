import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useBranch } from "../context/BranchContext";

type OrderRow = Record<string, any>;
type ReturnRow = Record<string, any>;
type ExpenseRow = Record<string, any>;

function today() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function amount(value: unknown) {
  return Math.round(Number(value || 0));
}

function methodName(value: string) {
  const labels: Record<string, string> = {
    cash: "كاش",
    bank: "مصرف",
    card: "مصرف",
    transfer: "تحويل",
    balance: "رصيد",
    credit: "رصيد",
    deposit: "عربون",
    none: "بدون رد",
    exchange: "استبدال",
  };
  return labels[value] || value || "غير محدد";
}

export default function DailyClosing() {
  const { effectiveBranchId, selectedBranch } = useBranch();
  const [date, setDate] = useState(today());
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [returns, setReturns] = useState<ReturnRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void load();
  }, [date, effectiveBranchId]);

  async function load() {
    setLoading(true);
    try {
      const start = `${date}T00:00:00`;
      const endDate = new Date(`${date}T00:00:00`);
      endDate.setDate(endDate.getDate() + 1);
      const end = endDate.toISOString();

      const [ordersResult, returnsResult, expensesResult] = await Promise.all([
        supabase
          .from("orders")
          .select("*")
          .gte("created_at", start)
          .lt("created_at", end)
          .order("created_at", { ascending: false }),
        supabase
          .from("order_returns")
          .select("*")
          .gte("created_at", start)
          .lt("created_at", end)
          .order("created_at", { ascending: false }),
        supabase
          .from("expenses")
          .select("*")
          .gte("expense_date", date)
          .lte("expense_date", date)
          .order("created_at", { ascending: false }),
      ]);

      if (ordersResult.error) throw ordersResult.error;
      if (returnsResult.error) throw returnsResult.error;
      if (expensesResult.error) throw expensesResult.error;

      const scope = (rows: any[]) =>
        effectiveBranchId
          ? rows.filter((row) => String(row.branch_id || "") === effectiveBranchId)
          : rows;

      setOrders(scope(ordersResult.data || []));
      setReturns(scope(returnsResult.data || []));
      setExpenses(scope(expensesResult.data || []));
    } catch (error) {
      alert(error instanceof Error ? error.message : "تعذر تحميل حساب اليوم");
    } finally {
      setLoading(false);
    }
  }

  const totals = useMemo(() => {
    const activeOrders = orders.filter(
      (order) => !["cancelled"].includes(String(order.status || ""))
    );

    const sales = activeOrders.reduce((sum, order) => sum + amount(order.total), 0);
    const paid = activeOrders.reduce(
      (sum, order) => sum + amount(order.paid_amount),
      0
    );
    const remaining = activeOrders.reduce(
      (sum, order) => sum + amount(order.remaining_amount),
      0
    );

    const cashIn = activeOrders.reduce(
      (sum, order) => sum + amount(order.cash_amount),
      0
    );
    const bankIn = activeOrders.reduce(
      (sum, order) =>
        sum + amount(order.bank_amount) + amount(order.transfer_amount),
      0
    );
    const balanceIn = activeOrders.reduce(
      (sum, order) => sum + amount(order.balance_amount),
      0
    );

    const refundBy = (method: string[]) =>
      returns
        .filter((item) => method.includes(String(item.refund_method || "")))
        .reduce((sum, item) => sum + amount(item.refund_amount), 0);

    const cashRefund = refundBy(["cash"]);
    const bankRefund = refundBy(["bank", "transfer"]);
    const balanceRefund = refundBy(["balance", "credit"]);
    const totalRefunds = returns.reduce(
      (sum, item) => sum + amount(item.refund_amount),
      0
    );
    const returnedValue = returns.reduce(
      (sum, item) => sum + amount(item.return_value),
      0
    );

    const expenseBy = (method: string[]) =>
      expenses
        .filter((item) => method.includes(String(item.payment_method || "")))
        .reduce(
          (sum, item) =>
            sum + amount(item.paid_amount ?? item.amount ?? item.total_amount),
          0
        );

    const cashExpenses = expenseBy(["cash"]);
    const bankExpenses = expenseBy(["bank", "card", "transfer"]);
    const balanceExpenses = expenseBy(["balance", "credit"]);
    const totalExpenses = expenses.reduce(
      (sum, item) =>
        sum + amount(item.paid_amount ?? item.amount ?? item.total_amount),
      0
    );

    return {
      sales,
      paid,
      remaining,
      cashIn,
      bankIn,
      balanceIn,
      cashRefund,
      bankRefund,
      balanceRefund,
      totalRefunds,
      returnedValue,
      cashExpenses,
      bankExpenses,
      balanceExpenses,
      totalExpenses,
      netCash: cashIn - cashRefund - cashExpenses,
      netBank: bankIn - bankRefund - bankExpenses,
      netBalance: balanceIn - balanceRefund - balanceExpenses,
      netDay: paid - totalRefunds - totalExpenses,
      delivered: activeOrders.filter((item) => item.status === "delivered").length,
      packaging: activeOrders.filter((item) => item.status === "packaging").length,
      ready: activeOrders.filter((item) => item.status === "ready").length,
      delivery: activeOrders.filter((item) => item.status === "out_for_delivery")
        .length,
    };
  }, [orders, returns, expenses]);

  function printReport() {
    window.print();
  }

  if (loading) {
    return <div className="p-8 text-xl font-bold">جاري تجهيز حساب اليوم...</div>;
  }

  return (
    <div dir="rtl" className="space-y-6 p-4 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black">حساب اليوم الكامل</h1>
          <p className="mt-2 text-gray-500">
            تفاصيل المبيعات، المقبوضات، المرتجعات، المصروفات، وصافي الخزينة — {selectedBranch?.name || "كل الفروع"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="rounded-xl border bg-white p-3"
          />
          <button
            onClick={printReport}
            className="rounded-xl bg-gray-900 px-5 py-3 font-bold text-white"
          >
            طباعة / PDF
          </button>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card label="إجمالي مبيعات اليوم" value={totals.sales} />
        <Card label="إجمالي المقبوض" value={totals.paid} />
        <Card label="المتبقي على الزبائن" value={totals.remaining} warning />
        <Card label="صافي اليوم" value={totals.netDay} strong />
      </section>

      <section className="rounded-2xl bg-white p-5 shadow">
        <h2 className="mb-4 text-2xl font-black">حركة الخزينة حسب وسيلة الدفع</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <MoneyBox
            title="الكاش"
            incoming={totals.cashIn}
            refunds={totals.cashRefund}
            expenses={totals.cashExpenses}
            net={totals.netCash}
          />
          <MoneyBox
            title="المصرف والتحويل"
            incoming={totals.bankIn}
            refunds={totals.bankRefund}
            expenses={totals.bankExpenses}
            net={totals.netBank}
          />
          <MoneyBox
            title="الرصيد"
            incoming={totals.balanceIn}
            refunds={totals.balanceRefund}
            expenses={totals.balanceExpenses}
            net={totals.netBalance}
          />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SmallCard label="طلبات قيد التغليف" value={totals.packaging} />
        <SmallCard label="طلبات جاهزة" value={totals.ready} />
        <SmallCard label="خرجت للتوصيل" value={totals.delivery} />
        <SmallCard label="تم تسليمها" value={totals.delivered} />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="overflow-x-auto rounded-2xl bg-white p-5 shadow">
          <h2 className="mb-4 text-xl font-black">طلبات اليوم ({orders.length})</h2>
          <table className="w-full min-w-[700px] text-right">
            <thead className="bg-gray-50">
              <tr>
                <Th>الطلب</Th>
                <Th>العميل</Th>
                <Th>الحالة</Th>
                <Th>الإجمالي</Th>
                <Th>المدفوع</Th>
                <Th>المتبقي</Th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-b">
                  <Td>#{order.order_number || order.id}</Td>
                  <Td>{order.customer_name || "-"}</Td>
                  <Td>{String(order.status || "-")}</Td>
                  <Td>{amount(order.total)} د.ل</Td>
                  <Td>{amount(order.paid_amount)} د.ل</Td>
                  <Td>{amount(order.remaining_amount)} د.ل</Td>
                </tr>
              ))}
              {orders.length === 0 && <Empty colSpan={6} />}
            </tbody>
          </table>
        </div>

        <div className="overflow-x-auto rounded-2xl bg-white p-5 shadow">
          <h2 className="mb-4 text-xl font-black">
            مرتجعات اليوم ({returns.length}) — قيمة مرتجعة {totals.returnedValue} د.ل
          </h2>
          <table className="w-full min-w-[650px] text-right">
            <thead className="bg-orange-50">
              <tr>
                <Th>الطلب</Th>
                <Th>النوع</Th>
                <Th>قيمة الجزء</Th>
                <Th>المبلغ المردود</Th>
                <Th>الطريقة</Th>
                <Th>السبب</Th>
              </tr>
            </thead>
            <tbody>
              {returns.map((item) => (
                <tr key={item.id} className="border-b">
                  <Td>#{item.order_number_snapshot || item.order_id}</Td>
                  <Td>{item.return_type === "full" ? "كامل" : "جزئي"}</Td>
                  <Td>{amount(item.return_value)} د.ل</Td>
                  <Td>{amount(item.refund_amount)} د.ل</Td>
                  <Td>{methodName(String(item.refund_method || ""))}</Td>
                  <Td>{item.reason || "-"}</Td>
                </tr>
              ))}
              {returns.length === 0 && <Empty colSpan={6} />}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-x-auto rounded-2xl bg-white p-5 shadow">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-black">مصروفات اليوم ({expenses.length})</h2>
          <div className="rounded-xl bg-red-50 px-4 py-2 font-black text-red-700">
            الإجمالي: {totals.totalExpenses} د.ل
          </div>
        </div>
        <table className="w-full min-w-[850px] text-right">
          <thead className="bg-red-50">
            <tr>
              <Th>الفئة</Th>
              <Th>القيمة</Th>
              <Th>المدفوع</Th>
              <Th>طريقة الدفع</Th>
              <Th>الموظف</Th>
              <Th>ملاحظات</Th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((item) => (
              <tr key={item.id} className="border-b">
                <Td>{item.category_name_snapshot || item.expense_type || "-"}</Td>
                <Td>{amount(item.amount)} د.ل</Td>
                <Td>{amount(item.paid_amount ?? item.amount)} د.ل</Td>
                <Td>{methodName(String(item.payment_method || ""))}</Td>
                <Td>{item.employee_name || "-"}</Td>
                <Td>{item.notes || "-"}</Td>
              </tr>
            ))}
            {expenses.length === 0 && <Empty colSpan={6} />}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Card({
  label,
  value,
  warning = false,
  strong = false,
}: {
  label: string;
  value: number;
  warning?: boolean;
  strong?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl p-5 shadow ${
        strong ? "bg-emerald-700 text-white" : warning ? "bg-amber-50" : "bg-white"
      }`}
    >
      <p className={strong ? "text-emerald-100" : "text-gray-500"}>{label}</p>
      <p className="mt-2 text-3xl font-black">{amount(value)} د.ل</p>
    </div>
  );
}

function MoneyBox({
  title,
  incoming,
  refunds,
  expenses,
  net,
}: {
  title: string;
  incoming: number;
  refunds: number;
  expenses: number;
  net: number;
}) {
  return (
    <div className="rounded-2xl border p-5">
      <h3 className="text-xl font-black">{title}</h3>
      <Row label="داخل" value={incoming} />
      <Row label="مرتجعات" value={-refunds} danger />
      <Row label="مصروفات" value={-expenses} danger />
      <div className="mt-3 border-t pt-3">
        <Row label="الصافي المتوقع" value={net} strong />
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  danger = false,
  strong = false,
}: {
  label: string;
  value: number;
  danger?: boolean;
  strong?: boolean;
}) {
  return (
    <div className={`mt-3 flex justify-between ${strong ? "font-black" : ""}`}>
      <span>{label}</span>
      <span className={danger ? "text-red-700" : ""}>{amount(value)} د.ل</span>
    </div>
  );
}

function SmallCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white p-4 text-center shadow">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-2 text-3xl font-black">{value}</p>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="p-3">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="p-3">{children}</td>;
}

function Empty({ colSpan }: { colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="p-8 text-center text-gray-500">
        لا توجد بيانات في هذا اليوم
      </td>
    </tr>
  );
}
