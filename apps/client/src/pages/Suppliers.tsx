import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useBranch } from "../context/BranchContext";
import { moveToTrash } from "../lib/trash";

type Supplier = {
  id: string;
  name: string;
  phone: string;
  city: string;
  address: string;
  supplierType: string;
  notes: string;
  isActive: boolean;
  createdAt: string;
};

type PurchaseInvoice = {
  id: string;
  supplierId: string;
  invoiceNo: string;
  invoiceDate: string;
  grandTotal: number;
  paidAmount: number;
  remainingAmount: number;
  paymentStatus: string;
};

type SupplierPayment = {
  id: string;
  supplierId: string;
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  notes: string;
  createdAt: string;
};

type SupplierSummary = Supplier & {
  totalPurchases: number;
  invoicePayments: number;
  separatePayments: number;
  totalPaid: number;
  balance: number;
  invoicesCount: number;
};

const inputClass =
  "w-full rounded-xl border border-gray-200 bg-white p-3 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";

export default function Suppliers() {
 const { effectiveBranchId } = useBranch();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [balanceFilter, setBalanceFilter] = useState<
    "all" | "debtor" | "clear"
  >("all");

  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [showSupplierDialog, setShowSupplierDialog] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);

  useEffect(() => {
    void loadData();
  }, [effectiveBranchId]);

  const supplierSummaries = useMemo<SupplierSummary[]>(() => {
    return suppliers.map((supplier) => {
      const supplierInvoices = invoices.filter(
        (invoice) => invoice.supplierId === supplier.id
      );
      const supplierPayments = payments.filter(
        (payment) => payment.supplierId === supplier.id
      );

      const totalPurchases = supplierInvoices.reduce(
        (sum, invoice) => sum + invoice.grandTotal,
        0
      );

      const invoicePayments = supplierInvoices.reduce(
        (sum, invoice) => sum + invoice.paidAmount,
        0
      );

      const separatePayments = supplierPayments.reduce(
        (sum, payment) => sum + payment.amount,
        0
      );

      const totalPaid = invoicePayments + separatePayments;
      const balance = Math.max(totalPurchases - totalPaid, 0);

      return {
        ...supplier,
        totalPurchases,
        invoicePayments,
        separatePayments,
        totalPaid,
        balance,
        invoicesCount: supplierInvoices.length,
      };
    });
  }, [suppliers, invoices, payments]);

  const filteredSuppliers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return supplierSummaries.filter((supplier) => {
      const matchesSearch =
        !normalizedSearch ||
        supplier.name.toLowerCase().includes(normalizedSearch) ||
        supplier.phone.toLowerCase().includes(normalizedSearch) ||
        supplier.city.toLowerCase().includes(normalizedSearch) ||
        supplier.supplierType.toLowerCase().includes(normalizedSearch);

      const matchesBalance =
        balanceFilter === "all" ||
        (balanceFilter === "debtor" && supplier.balance > 0) ||
        (balanceFilter === "clear" && supplier.balance <= 0);

      return matchesSearch && matchesBalance;
    });
  }, [supplierSummaries, search, balanceFilter]);

  const selectedSupplier = useMemo(
    () =>
      supplierSummaries.find(
        (supplier) => supplier.id === selectedSupplierId
      ) || null,
    [supplierSummaries, selectedSupplierId]
  );

  const selectedInvoices = useMemo(
    () =>
      invoices
        .filter((invoice) => invoice.supplierId === selectedSupplierId)
        .sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate)),
    [invoices, selectedSupplierId]
  );

  const selectedPayments = useMemo(
    () =>
      payments
        .filter((payment) => payment.supplierId === selectedSupplierId)
        .sort((a, b) =>
          `${b.paymentDate}-${b.createdAt}`.localeCompare(
            `${a.paymentDate}-${a.createdAt}`
          )
        ),
    [payments, selectedSupplierId]
  );

  const totals = useMemo(
    () => ({
      suppliers: supplierSummaries.length,
      totalPurchases: supplierSummaries.reduce(
        (sum, supplier) => sum + supplier.totalPurchases,
        0
      ),
      totalPaid: supplierSummaries.reduce(
        (sum, supplier) => sum + supplier.totalPaid,
        0
      ),
      totalDebt: supplierSummaries.reduce(
        (sum, supplier) => sum + supplier.balance,
        0
      ),
    }),
    [supplierSummaries]
  );

  async function loadData() {
    setLoading(true);

    try {
      const [suppliersResult, invoicesResult, paymentsResult] =
        await Promise.all([
          supabase
            .from("suppliers")
            .select(
              "id,name,phone,city,address,supplier_type,notes,is_active,created_at,branch_id"
            )
            .order("name"),

          supabase
            .from("purchase_invoices")
            .select(
              "id,supplier_id,invoice_no,invoice_date,grand_total,paid_amount,remaining_amount,branch_id"
            )
            .order("invoice_date", { ascending: false }),

          supabase
            .from("supplier_payments")
            .select(
              "id,supplier_id,amount,payment_date,payment_method,notes,created_at,branch_id"
            )
            .order("payment_date", { ascending: false }),
        ]);

      if (suppliersResult.error) throw suppliersResult.error;
      if (invoicesResult.error) throw invoicesResult.error;
      if (paymentsResult.error) throw paymentsResult.error;

      const scopedSuppliers = effectiveBranchId ? (suppliersResult.data || []).filter((x:any)=>String(x.branch_id||"")===effectiveBranchId) : (suppliersResult.data || []);
      const scopedInvoices = effectiveBranchId ? (invoicesResult.data || []).filter((x:any)=>String(x.branch_id||"")===effectiveBranchId) : (invoicesResult.data || []);
      const scopedPayments = effectiveBranchId ? (paymentsResult.data || []).filter((x:any)=>String(x.branch_id||"")===effectiveBranchId) : (paymentsResult.data || []);
      setSuppliers(
        scopedSuppliers.map((supplier: any) => ({
          id: String(supplier.id),
          name: String(supplier.name || ""),
          phone: String(supplier.phone || ""),
          city: String(supplier.city || ""),
          address: String(supplier.address || ""),
          supplierType: String(supplier.supplier_type || "عام"),
          notes: String(supplier.notes || ""),
          isActive: Boolean(supplier.is_active ?? true),
          createdAt: String(supplier.created_at || ""),
        }))
      );

      setInvoices(
        scopedInvoices.map((invoice: any) => ({
          id: String(invoice.id),
          supplierId: String(invoice.supplier_id || ""),
          invoiceNo: String(invoice.invoice_no || ""),
          invoiceDate: String(invoice.invoice_date || ""),
          grandTotal: Number(invoice.grand_total || 0),
          paidAmount: Number(invoice.paid_amount || 0),
          remainingAmount: Number(invoice.remaining_amount || 0),
          paymentStatus: Number(invoice.remaining_amount || 0) > 0 ? "غير مكتملة" : "مدفوعة",
        }))
      );

      setPayments(
        scopedPayments.map((payment: any) => ({
          id: String(payment.id),
          supplierId: String(payment.supplier_id || ""),
          amount: Number(payment.amount || 0),
          paymentDate: String(payment.payment_date || ""),
          paymentMethod: String(payment.payment_method || "cash"),
          notes: String(payment.notes || ""),
          createdAt: String(payment.created_at || ""),
        }))
      );
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function toggleSupplierStatus(supplier: SupplierSummary) {
    const message = supplier.isActive
      ? `هل تريد إيقاف المورد "${supplier.name}"؟`
      : `هل تريد تفعيل المورد "${supplier.name}"؟`;

    if (!window.confirm(message)) return;

    const { error } = await supabase
      .from("suppliers")
      .update({ is_active: !supplier.isActive })
      .eq("id", supplier.id);

    if (error) {
      alert(error.message);
      return;
    }

    await loadData();
  }

  async function deletePayment(payment: SupplierPayment) {
    if (!window.confirm(`حذف دفعة بقيمة ${money(payment.amount)}؟`)) {
      return;
    }

    await moveToTrash({
      table: "supplier_payments",
      id: payment.id,
      label: `دفعة ${money(payment.amount)}`,
    });

    const { error } = await supabase
      .from("supplier_payments")
      .delete()
      .eq("id", payment.id);

    if (error) {
      alert(error.message);
      return;
    }

    await loadData();
  }

  function openNewSupplier() {
    setEditingSupplier(null);
    setShowSupplierDialog(true);
  }

  function openEditSupplier(supplier: SupplierSummary) {
    setEditingSupplier(supplier);
    setShowSupplierDialog(true);
  }

  function printStatement() {
    if (!selectedSupplier) return;

    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) {
      alert("تعذر فتح نافذة الطباعة");
      return;
    }

    const invoiceRows = selectedInvoices
      .map(
        (invoice) => `
          <tr>
            <td>${escapeHtml(invoice.invoiceDate)}</td>
            <td>${escapeHtml(invoice.invoiceNo || "-")}</td>
            <td>${money(invoice.grandTotal)}</td>
            <td>${money(invoice.paidAmount)}</td>
            <td>${money(invoice.remainingAmount)}</td>
          </tr>
        `
      )
      .join("");

    const paymentRows = selectedPayments
      .map(
        (payment) => `
          <tr>
            <td>${escapeHtml(payment.paymentDate)}</td>
            <td>${escapeHtml(paymentMethodLabel(payment.paymentMethod))}</td>
            <td>${money(payment.amount)}</td>
            <td>${escapeHtml(payment.notes || "-")}</td>
          </tr>
        `
      )
      .join("");

    printWindow.document.write(`
      <!doctype html>
      <html lang="ar" dir="rtl">
        <head>
          <meta charset="utf-8" />
          <title>كشف حساب ${escapeHtml(selectedSupplier.name)}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 30px; color: #111; }
            h1, h2 { margin: 0 0 14px; }
            .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 22px 0; }
            .card { border: 1px solid #ddd; padding: 14px; border-radius: 10px; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; }
            th, td { border: 1px solid #ddd; padding: 9px; text-align: right; }
            th { background: #f3f4f6; }
            .section { margin-top: 28px; }
            @media print { button { display: none; } }
          </style>
        </head>
        <body>
          <h1>MOOD — كشف حساب مورد</h1>
          <p><strong>المورد:</strong> ${escapeHtml(selectedSupplier.name)}</p>
          <p><strong>الهاتف:</strong> ${escapeHtml(selectedSupplier.phone || "-")}</p>
          <p><strong>العنوان:</strong> ${escapeHtml(
            [selectedSupplier.city, selectedSupplier.address]
              .filter(Boolean)
              .join(" - ") || "-"
          )}</p>

          <div class="summary">
            <div class="card"><strong>إجمالي المشتريات</strong><br>${money(
              selectedSupplier.totalPurchases
            )}</div>
            <div class="card"><strong>إجمالي المدفوع</strong><br>${money(
              selectedSupplier.totalPaid
            )}</div>
            <div class="card"><strong>الرصيد المتبقي</strong><br>${money(
              selectedSupplier.balance
            )}</div>
          </div>

          <div class="section">
            <h2>فواتير المشتريات</h2>
            <table>
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>رقم الفاتورة</th>
                  <th>الإجمالي</th>
                  <th>المدفوع داخل الفاتورة</th>
                  <th>المتبقي وقت الحفظ</th>
                </tr>
              </thead>
              <tbody>${invoiceRows || '<tr><td colspan="5">لا توجد فواتير</td></tr>'}</tbody>
            </table>
          </div>

          <div class="section">
            <h2>دفعات المورد</h2>
            <table>
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>الطريقة</th>
                  <th>المبلغ</th>
                  <th>ملاحظات</th>
                </tr>
              </thead>
              <tbody>${paymentRows || '<tr><td colspan="4">لا توجد دفعات منفصلة</td></tr>'}</tbody>
            </table>
          </div>

          <script>window.onload = () => window.print();</script>
        </body>
      </html>
    `);

    printWindow.document.close();
  }

  if (loading) {
    return (
      <div className="p-8 text-2xl font-bold text-gray-700">
        جاري تحميل الموردين...
      </div>
    );
  }

  return (
    <div className="space-y-7 p-4 md:p-8" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold md:text-4xl">الموردون</h1>
          <p className="mt-2 text-gray-500">
            إدارة الموردين والديون والدفعات وكشوف الحساب
          </p>
        </div>

        <button
          type="button"
          onClick={openNewSupplier}
          className="rounded-xl bg-emerald-700 px-6 py-3 font-bold text-white"
        >
          + إضافة مورد
        </button>
      </header>

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <SummaryCard label="عدد الموردين" value={totals.suppliers} count />
        <SummaryCard
          label="إجمالي المشتريات"
          value={totals.totalPurchases}
        />
        <SummaryCard label="إجمالي المدفوع" value={totals.totalPaid} />
        <SummaryCard
          label="إجمالي ديون الموردين"
          value={totals.totalDebt}
          danger={totals.totalDebt > 0}
        />
      </section>

      <section className="rounded-2xl bg-white p-5 shadow">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_220px]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className={inputClass}
            placeholder="ابحث بالاسم أو الهاتف أو المدينة أو نوع المورد"
          />

          <select
            value={balanceFilter}
            onChange={(event) =>
              setBalanceFilter(
                event.target.value as "all" | "debtor" | "clear"
              )
            }
            className={inputClass}
          >
            <option value="all">كل الموردين</option>
            <option value="debtor">عليهم رصيد متبقي</option>
            <option value="clear">حسابهم مسدد</option>
          </select>
        </div>
      </section>

      <section className="overflow-x-auto rounded-2xl bg-white p-5 shadow">
        <table className="w-full min-w-[1200px]">
          <thead className="bg-emerald-700 text-white">
            <tr>
              <th className="p-4 text-right">المورد</th>
              <th className="p-4 text-right">الهاتف</th>
              <th className="p-4 text-right">النوع</th>
              <th className="p-4 text-right">الفواتير</th>
              <th className="p-4 text-right">المشتريات</th>
              <th className="p-4 text-right">المدفوع</th>
              <th className="p-4 text-right">المتبقي</th>
              <th className="p-4 text-right">الحالة</th>
              <th className="p-4 text-right">الإجراءات</th>
            </tr>
          </thead>

          <tbody>
            {filteredSuppliers.map((supplier) => (
              <tr
                key={supplier.id}
                className={`border-b hover:bg-gray-50 ${
                  !supplier.isActive ? "opacity-60" : ""
                }`}
              >
                <td className="p-4">
                  <button
                    type="button"
                    onClick={() => setSelectedSupplierId(supplier.id)}
                    className="font-bold text-emerald-800 hover:underline"
                  >
                    {supplier.name}
                  </button>
                  <p className="mt-1 text-xs text-gray-500">
                    {[supplier.city, supplier.address]
                      .filter(Boolean)
                      .join(" - ") || "بدون عنوان"}
                  </p>
                </td>
                <td className="p-4">{supplier.phone || "-"}</td>
                <td className="p-4">{supplier.supplierType}</td>
                <td className="p-4">{supplier.invoicesCount}</td>
                <td className="p-4 font-semibold">
                  {money(supplier.totalPurchases)}
                </td>
                <td className="p-4 text-green-700">
                  {money(supplier.totalPaid)}
                </td>
                <td className="p-4 font-bold text-red-700">
                  {money(supplier.balance)}
                </td>
                <td className="p-4">
                  <span
                    className={`rounded-full px-3 py-1 text-sm font-semibold ${
                      supplier.isActive
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-200 text-gray-600"
                    }`}
                  >
                    {supplier.isActive ? "نشط" : "موقوف"}
                  </span>
                </td>
                <td className="p-4">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedSupplierId(supplier.id)}
                      className="rounded-lg bg-emerald-100 px-3 py-2 font-semibold text-emerald-800"
                    >
                      كشف الحساب
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSupplierId(supplier.id);
                        setShowPaymentDialog(true);
                      }}
                      className="rounded-lg bg-blue-100 px-3 py-2 font-semibold text-blue-800"
                    >
                      تسجيل دفعة
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditSupplier(supplier)}
                      className="rounded-lg bg-gray-100 px-3 py-2 font-semibold"
                    >
                      تعديل
                    </button>
                    <button
                      type="button"
                      onClick={() => void toggleSupplierStatus(supplier)}
                      className="rounded-lg bg-orange-100 px-3 py-2 font-semibold text-orange-800"
                    >
                      {supplier.isActive ? "إيقاف" : "تفعيل"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {filteredSuppliers.length === 0 && (
              <tr>
                <td colSpan={9} className="p-10 text-center text-gray-500">
                  لا توجد نتائج مطابقة
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {selectedSupplier && (
        <section className="rounded-2xl bg-white p-5 shadow md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold">
                كشف حساب: {selectedSupplier.name}
              </h2>
              <p className="mt-2 text-gray-500">
                {selectedSupplier.phone || "بدون هاتف"} —{" "}
                {selectedSupplier.supplierType}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowPaymentDialog(true)}
                className="rounded-xl bg-blue-700 px-5 py-3 font-bold text-white"
              >
                + تسجيل دفعة
              </button>
              <button
                type="button"
                onClick={printStatement}
                className="rounded-xl bg-gray-900 px-5 py-3 font-bold text-white"
              >
                طباعة كشف الحساب
              </button>
              <button
                type="button"
                onClick={() => setSelectedSupplierId("")}
                className="rounded-xl border px-5 py-3 font-semibold"
              >
                إغلاق
              </button>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <SummaryCard
              label="إجمالي المشتريات"
              value={selectedSupplier.totalPurchases}
            />
            <SummaryCard
              label="المدفوع داخل الفواتير"
              value={selectedSupplier.invoicePayments}
            />
            <SummaryCard
              label="الدفعات اللاحقة"
              value={selectedSupplier.separatePayments}
            />
            <SummaryCard
              label="الرصيد المتبقي"
              value={selectedSupplier.balance}
              danger={selectedSupplier.balance > 0}
            />
          </div>

          <div className="mt-7 grid grid-cols-1 gap-7 xl:grid-cols-2">
            <div className="overflow-x-auto">
              <h3 className="mb-3 text-xl font-bold">فواتير المشتريات</h3>
              <table className="w-full min-w-[650px]">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="p-3 text-right">التاريخ</th>
                    <th className="p-3 text-right">رقم الفاتورة</th>
                    <th className="p-3 text-right">الإجمالي</th>
                    <th className="p-3 text-right">المدفوع</th>
                    <th className="p-3 text-right">المتبقي</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedInvoices.map((invoice) => (
                    <tr key={invoice.id} className="border-b">
                      <td className="p-3">{invoice.invoiceDate}</td>
                      <td className="p-3">{invoice.invoiceNo || "-"}</td>
                      <td className="p-3 font-semibold">
                        {money(invoice.grandTotal)}
                      </td>
                      <td className="p-3 text-green-700">
                        {money(invoice.paidAmount)}
                      </td>
                      <td className="p-3 text-red-700">
                        {money(invoice.remainingAmount)}
                      </td>
                    </tr>
                  ))}
                  {selectedInvoices.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="p-8 text-center text-gray-500"
                      >
                        لا توجد فواتير لهذا المورد
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto">
              <h3 className="mb-3 text-xl font-bold">الدفعات اللاحقة</h3>
              <table className="w-full min-w-[650px]">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="p-3 text-right">التاريخ</th>
                    <th className="p-3 text-right">الطريقة</th>
                    <th className="p-3 text-right">المبلغ</th>
                    <th className="p-3 text-right">ملاحظات</th>
                    <th className="p-3 text-right">حذف</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedPayments.map((payment) => (
                    <tr key={payment.id} className="border-b">
                      <td className="p-3">{payment.paymentDate}</td>
                      <td className="p-3">
                        {paymentMethodLabel(payment.paymentMethod)}
                      </td>
                      <td className="p-3 font-bold text-green-700">
                        {money(payment.amount)}
                      </td>
                      <td className="p-3">{payment.notes || "-"}</td>
                      <td className="p-3">
                        <button
                          type="button"
                          onClick={() => void deletePayment(payment)}
                          className="rounded-lg bg-red-100 px-3 py-2 font-semibold text-red-700"
                        >
                          حذف
                        </button>
                      </td>
                    </tr>
                  ))}
                  {selectedPayments.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="p-8 text-center text-gray-500"
                      >
                        لا توجد دفعات منفصلة
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {showSupplierDialog && (
        <SupplierDialog
          supplier={editingSupplier}
          branchId={effectiveBranchId}
          onClose={() => {
            setShowSupplierDialog(false);
            setEditingSupplier(null);
          }}
          onSaved={async () => {
            setShowSupplierDialog(false);
            setEditingSupplier(null);
            await loadData();
          }}
        />
      )}

      {showPaymentDialog && selectedSupplier && (
        <PaymentDialog
          supplier={selectedSupplier}
          branchId={effectiveBranchId}
          onClose={() => setShowPaymentDialog(false)}
          onSaved={async () => {
            setShowPaymentDialog(false);
            await loadData();
          }}
        />
      )}
    </div>
  );
}

function SupplierDialog({
  supplier,
  branchId,
  onClose,
  onSaved,
}: {
  supplier: Supplier | null;
  branchId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(supplier?.name || "");
  const [phone, setPhone] = useState(supplier?.phone || "");
  const [city, setCity] = useState(supplier?.city || "");
  const [address, setAddress] = useState(supplier?.address || "");
  const [supplierType, setSupplierType] = useState(
    supplier?.supplierType || "عام"
  );
  const [notes, setNotes] = useState(supplier?.notes || "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) {
      alert("اسم المورد مطلوب");
      return;
    }

    setSaving(true);

    const payload = {
      name: name.trim(),
      phone: phone.trim(),
      city: city.trim(),
      address: address.trim(),
      supplier_type: supplierType.trim() || "عام",
      notes: notes.trim(),
      branch_id: branchId,
    };

    const query = supplier
      ? supabase.from("suppliers").update(payload).eq("id", supplier.id)
      : supabase.from("suppliers").insert(payload);

    const { error } = await query;

    setSaving(false);

    if (error) {
      alert(error.message);
      return;
    }

    onSaved();
  }

  return (
    <Modal title={supplier ? "تعديل المورد" : "إضافة مورد جديد"} onClose={onClose}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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

      <div className="mt-4">
        <Field label="العنوان">
          <input
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      <textarea
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        rows={3}
        className={`${inputClass} mt-4`}
        placeholder="ملاحظات"
      />

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="mt-5 rounded-xl bg-emerald-700 px-8 py-3 font-bold text-white disabled:opacity-50"
      >
        {saving ? "جاري الحفظ..." : "حفظ المورد"}
      </button>
    </Modal>
  );
}

function PaymentDialog({
  supplier,
  branchId,
  onClose,
  onSaved,
}: {
  supplier: SupplierSummary;
  branchId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(
    supplier.balance > 0 ? String(supplier.balance) : ""
  );
  const [paymentDate, setPaymentDate] = useState(today());
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function savePayment() {
    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      alert("أدخل مبلغ دفعة صحيح");
      return;
    }

    if (numericAmount > supplier.balance && supplier.balance > 0) {
      const proceed = window.confirm(
        "قيمة الدفعة أكبر من الرصيد المتبقي. هل تريد الحفظ رغم ذلك؟"
      );
      if (!proceed) return;
    }

    setSaving(true);

    const { error } = await supabase.from("supplier_payments").insert({
      supplier_id: supplier.id,
      amount: numericAmount,
      payment_date: paymentDate,
      payment_method: paymentMethod,
      notes: notes.trim(),
      branch_id: branchId,
    });

    setSaving(false);

    if (error) {
      alert(error.message);
      return;
    }

    onSaved();
  }

  return (
    <Modal title={`دفعة للمورد: ${supplier.name}`} onClose={onClose}>
      <div className="mb-5 rounded-xl bg-red-50 p-4">
        <p className="text-sm text-gray-500">الرصيد الحالي</p>
        <p className="mt-1 text-2xl font-bold text-red-700">
          {money(supplier.balance)}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="قيمة الدفعة">
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="تاريخ الدفعة">
          <input
            type="date"
            value={paymentDate}
            onChange={(event) => setPaymentDate(event.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="طريقة الدفع">
          <select
            value={paymentMethod}
            onChange={(event) => setPaymentMethod(event.target.value)}
            className={inputClass}
          >
            <option value="cash">نقدًا</option>
            <option value="card">بطاقة</option>
            <option value="bank_transfer">تحويل مصرفي</option>
            <option value="mixed">مختلط</option>
          </select>
        </Field>
      </div>

      <textarea
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        rows={3}
        className={`${inputClass} mt-4`}
        placeholder="ملاحظات الدفعة أو رقم الإيصال"
      />

      <button
        type="button"
        onClick={() => void savePayment()}
        disabled={saving}
        className="mt-5 rounded-xl bg-blue-700 px-8 py-3 font-bold text-white disabled:opacity-50"
      >
        {saving ? "جاري تسجيل الدفعة..." : "حفظ الدفعة"}
      </button>
    </Modal>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
        dir="rtl"
      >
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-gray-100 px-4 py-2"
          >
            ✕
          </button>
        </div>

        <div className="mt-6">{children}</div>
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

function SummaryCard({
  label,
  value,
  count = false,
  danger = false,
}: {
  label: string;
  value: number;
  count?: boolean;
  danger?: boolean;
}) {
  return (
    <div className={`rounded-2xl p-5 shadow ${danger ? "bg-red-50" : "bg-white"}`}>
      <p className="text-sm text-gray-500">{label}</p>
      <p
        className={`mt-2 text-2xl font-bold ${
          danger ? "text-red-700" : "text-gray-900"
        }`}
      >
        {count ? value : money(value)}
      </p>
    </div>
  );
}

function paymentMethodLabel(method: string) {
  const labels: Record<string, string> = {
    cash: "نقدًا",
    card: "بطاقة",
    bank_transfer: "تحويل مصرفي",
    mixed: "مختلط",
  };

  return labels[method] || method || "-";
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

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}