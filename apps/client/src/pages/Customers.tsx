import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useBranch } from "../context/BranchContext";

const NEW_ORDER_DRAFT_KEY = "mood-new-order-draft";
const VIP_SPENDING_LIMIT = 5000;

type OrderRow = {
  id: number;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  address: string;
  occasion: string;
  notes: string;
  total: number;
  paidAmount: number;
  remainingAmount: number;
  status: string;
  createdAt: string;
};

type CustomerSummary = {
  key: string;
  name: string;
  phone: string;
  address: string;
  ordersCount: number;
  totalSpent: number;
  totalPaid: number;
  totalRemaining: number;
  averageOrder: number;
  lastOrderDate: string;
  lastOrderNumber: string;
  lastOccasion: string;
  mostCommonOccasion: string;
  isVip: boolean;
  orders: OrderRow[];
};

export default function Customers() {
  const { effectiveBranchId } = useBranch();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] =
    useState<CustomerSummary | null>(null);

  useEffect(() => {
    loadCustomers();
  }, [effectiveBranchId]);

  async function loadCustomers() {
    setRefreshing(true);

    try {
      const { data, error } = await supabase
        .from("orders")
        .select(`
          id,
          order_number,
          customer_name,
          customer_phone,
          delivery_address,
          occasion,
          notes,
          total,
          paid_amount,
          remaining_amount,
          status,
          created_at,
          branch_id
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const customerRows = effectiveBranchId
        ? (data || []).filter((row: any) => String(row.branch_id || "") === effectiveBranchId)
        : (data || []);
      const formatted: OrderRow[] = customerRows.map((order: any) => ({
        id: Number(order.id),
        orderNumber: String(order.order_number || order.id || ""),
        customerName: String(order.customer_name || "عميل غير مسجل"),
        customerPhone: String(order.customer_phone || ""),
        address: String(order.delivery_address || ""),
        occasion: String(order.occasion || ""),
        notes: String(order.notes || ""),
        total: Number(order.total || 0),
        paidAmount: Number(order.paid_amount || 0),
        remainingAmount: Number(order.remaining_amount || 0),
        status: String(order.status || "new"),
        createdAt: String(order.created_at || ""),
      }));

      setOrders(formatted);
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const customers = useMemo<CustomerSummary[]>(() => {
    const map = new Map<string, CustomerSummary>();

    for (const order of orders) {
      const normalizedPhone = order.customerPhone.trim();
      const normalizedName = order.customerName.trim();
      const key = normalizedPhone || normalizedName.toLowerCase();

      const current = map.get(key);

      if (current) {
        current.orders.push(order);
        current.ordersCount += 1;
        current.totalSpent += order.total;
        current.totalPaid += order.paidAmount;
        current.totalRemaining += order.remainingAmount;

        if (
          !current.lastOrderDate ||
          new Date(order.createdAt).getTime() >
            new Date(current.lastOrderDate).getTime()
        ) {
          current.lastOrderDate = order.createdAt;
          current.lastOrderNumber = order.orderNumber;
          current.lastOccasion = order.occasion;
          current.address = order.address || current.address;
        }
      } else {
        map.set(key, {
          key,
          name: normalizedName || "عميل غير مسجل",
          phone: normalizedPhone,
          address: order.address,
          ordersCount: 1,
          totalSpent: order.total,
          totalPaid: order.paidAmount,
          totalRemaining: order.remainingAmount,
          averageOrder: 0,
          lastOrderDate: order.createdAt,
          lastOrderNumber: order.orderNumber,
          lastOccasion: order.occasion,
          mostCommonOccasion: "",
          isVip: false,
          orders: [order],
        });
      }
    }

    return Array.from(map.values())
      .map((customer) => {
        const sortedOrders = [...customer.orders].sort(
          (a, b) =>
            new Date(b.createdAt).getTime() -
            new Date(a.createdAt).getTime()
        );

        return {
          ...customer,
          averageOrder:
            customer.ordersCount > 0
              ? customer.totalSpent / customer.ordersCount
              : 0,
          mostCommonOccasion: getMostCommonOccasion(sortedOrders),
          isVip: customer.totalSpent >= VIP_SPENDING_LIMIT,
          orders: sortedOrders,
        };
      })
      .sort(
        (a, b) =>
          new Date(b.lastOrderDate).getTime() -
          new Date(a.lastOrderDate).getTime()
      );
  }, [orders]);

  const filteredCustomers = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) return customers;

    return customers.filter((customer) =>
      [
        customer.name,
        customer.phone,
        customer.address,
        customer.lastOccasion,
        customer.mostCommonOccasion,
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword)
    );
  }, [customers, search]);

  const stats = useMemo(() => {
    const totalSpent = customers.reduce(
      (sum, customer) => sum + customer.totalSpent,
      0
    );

    const bestCustomer = [...customers].sort(
      (a, b) => b.totalSpent - a.totalSpent
    )[0];

    return {
      customers: customers.length,
      orders: orders.length,
      totalSpent,
      totalRemaining: customers.reduce(
        (sum, customer) => sum + customer.totalRemaining,
        0
      ),
      averageOrder:
        orders.length > 0 ? totalSpent / orders.length : 0,
      bestCustomer,
      mostCommonOccasion: getMostCommonOccasion(orders),
    };
  }, [customers, orders]);

  function createOrderForCustomer(customer: CustomerSummary) {
    try {
      localStorage.setItem(
        NEW_ORDER_DRAFT_KEY,
        JSON.stringify({
          entries: [],
          customer: {
            customerName: customer.name,
            customerPhone: customer.phone,
            occasion: "",
            deliveryDate: "",
            deliveryTime: "",
            address: customer.address,
            notes: "",
          },
          payment: {
            paymentMethod: "cash",
            cashAmount: 0,
            bankAmount: 0,
            transferAmount: 0,
            depositAmount: 0,
            deliveryFee: 0,
            deliveryPaidCash: false,
            deliveryPaymentMethod: "none",
            deliveryStatus: "pending",
            deliveryDriverName: "",
            deliveryCompanyName: "",
            discount: 0,
          },
          savedAt: new Date().toISOString(),
        })
      );

      window.location.href = "/new-order";
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-2xl font-bold text-gray-700">
        جاري تحميل العملاء...
      </div>
    );
  }

  return (
    <div className="space-y-7 p-8" dir="rtl">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <h1 className="text-4xl font-bold">العملاء</h1>
          <p className="mt-1 text-gray-500">
            سجل العملاء وتاريخ الطلبات والمدفوعات
          </p>
        </div>

        <button
          type="button"
          onClick={loadCustomers}
          disabled={refreshing}
          className="rounded-xl bg-emerald-700 px-6 py-3 font-bold text-white disabled:opacity-50"
        >
          {refreshing ? "جاري التحديث..." : "تحديث العملاء"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          label="عدد العملاء"
          value={stats.customers}
          valueClass="text-emerald-700"
        />

        <StatCard
          label="إجمالي الطلبات"
          value={stats.orders}
          valueClass="text-blue-700"
        />

        <StatCard
          label="متوسط قيمة الطلب"
          value={`${stats.averageOrder.toFixed(2)} د.ل`}
          valueClass="text-purple-700"
        />

        <StatCard
          label="إجمالي المتبقي"
          value={`${stats.totalRemaining.toFixed(2)} د.ل`}
          valueClass="text-red-700"
        />
      </div>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <HighlightCard
          label="أفضل عميل"
          value={stats.bestCustomer?.name || "-"}
          description={
            stats.bestCustomer
              ? `${stats.bestCustomer.totalSpent.toFixed(2)} د.ل`
              : "لا توجد بيانات"
          }
        />

        <HighlightCard
          label="أكثر مناسبة"
          value={stats.mostCommonOccasion || "-"}
          description="حسب الطلبات المسجلة"
        />

        <HighlightCard
          label="إجمالي قيمة الطلبات"
          value={`${stats.totalSpent.toFixed(2)} د.ل`}
          description={`${stats.orders} طلب`}
        />
      </section>

      <div className="rounded-2xl bg-white p-5 shadow">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="w-full rounded-xl border p-3"
          placeholder="بحث بالاسم أو الهاتف أو العنوان أو المناسبة..."
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredCustomers.map((customer) => {
          const status = getCustomerStatus(customer);

          return (
            <article
              key={customer.key}
              className="rounded-2xl bg-white p-5 shadow"
            >
              <button
                type="button"
                onClick={() => setSelectedCustomer(customer)}
                className="w-full text-right"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-2xl">
                      👤
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-bold">
                          {customer.name}
                        </h2>

                        {customer.isVip && (
                          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700">
                            ⭐ VIP
                          </span>
                        )}
                      </div>

                      <p className="mt-1 text-gray-500">
                        {customer.phone || "بدون رقم هاتف"}
                      </p>

                      {customer.address && (
                        <p className="mt-1 text-sm text-gray-500">
                          {customer.address}
                        </p>
                      )}
                    </div>
                  </div>

                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${status.className}`}
                  >
                    {status.label}
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <MiniStat
                    label="عدد الزيارات"
                    value={customer.ordersCount}
                  />

                  <MiniStat
                    label="إجمالي الطلبات"
                    value={`${customer.totalSpent.toFixed(2)} د.ل`}
                  />

                  <MiniStat
                    label="متوسط الطلب"
                    value={`${customer.averageOrder.toFixed(2)} د.ل`}
                  />

                  <MiniStat
                    label="المتبقي"
                    value={`${customer.totalRemaining.toFixed(2)} د.ل`}
                    danger={customer.totalRemaining > 0}
                  />
                </div>

                <div className="mt-4 rounded-xl bg-gray-50 p-3 text-sm">
                  <p>
                    آخر طلب: #{customer.lastOrderNumber}
                  </p>

                  <p className="mt-1 text-gray-500">
                    {formatDate(customer.lastOrderDate)}
                  </p>

                  {customer.mostCommonOccasion && (
                    <p className="mt-1 text-gray-500">
                      أكثر مناسبة: {customer.mostCommonOccasion}
                    </p>
                  )}
                </div>
              </button>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <ContactButton
                  href={
                    customer.phone
                      ? `tel:${normalizePhone(customer.phone)}`
                      : undefined
                  }
                  label="اتصال"
                  disabled={!customer.phone}
                />

                <ContactButton
                  href={
                    customer.phone
                      ? `https://wa.me/${normalizeWhatsAppPhone(
                          customer.phone
                        )}`
                      : undefined
                  }
                  label="واتساب"
                  disabled={!customer.phone}
                  external
                />
              </div>

              <button
                type="button"
                onClick={() => createOrderForCustomer(customer)}
                className="mt-3 w-full rounded-xl bg-emerald-700 px-4 py-3 font-bold text-white"
              >
                ➕ إنشاء طلب جديد لهذا العميل
              </button>
            </article>
          );
        })}

        {filteredCustomers.length === 0 && (
          <div className="rounded-2xl bg-white p-10 text-center text-gray-500 shadow md:col-span-2 xl:col-span-3">
            لا توجد نتائج مطابقة.
          </div>
        )}
      </div>

      {selectedCustomer && (
        <CustomerModal
          customer={selectedCustomer}
          onClose={() => setSelectedCustomer(null)}
          onCreateOrder={() =>
            createOrderForCustomer(selectedCustomer)
          }
        />
      )}
    </div>
  );
}

function CustomerModal({
  customer,
  onClose,
  onCreateOrder,
}: {
  customer: CustomerSummary;
  onClose: () => void;
  onCreateOrder: () => void;
}) {
  const status = getCustomerStatus(customer);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
        dir="rtl"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl">
              👤
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-3xl font-bold">
                  {customer.name}
                </h2>

                {customer.isVip && (
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-700">
                    ⭐ عميل مميز
                  </span>
                )}

                <span
                  className={`rounded-full px-3 py-1 text-sm font-bold ${status.className}`}
                >
                  {status.label}
                </span>
              </div>

              <p className="mt-1 text-gray-500">
                {customer.phone || "بدون رقم هاتف"}
              </p>

              {customer.address && (
                <p className="mt-1 text-gray-500">
                  {customer.address}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-red-100 px-4 py-2 text-red-700"
          >
            ✕
          </button>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
          <MiniStat
            label="عدد الزيارات"
            value={customer.ordersCount}
          />

          <MiniStat
            label="إجمالي الطلبات"
            value={`${customer.totalSpent.toFixed(2)} د.ل`}
          />

          <MiniStat
            label="متوسط الطلب"
            value={`${customer.averageOrder.toFixed(2)} د.ل`}
          />

          <MiniStat
            label="المدفوع"
            value={`${customer.totalPaid.toFixed(2)} د.ل`}
          />

          <MiniStat
            label="المتبقي"
            value={`${customer.totalRemaining.toFixed(2)} د.ل`}
            danger={customer.totalRemaining > 0}
          />
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onCreateOrder}
            className="rounded-xl bg-emerald-700 px-6 py-3 font-bold text-white"
          >
            ➕ إنشاء طلب جديد
          </button>

          {customer.phone && (
            <>
              <a
                href={`tel:${normalizePhone(customer.phone)}`}
                className="rounded-xl border px-6 py-3 font-bold"
              >
                📞 اتصال
              </a>

              <a
                href={`https://wa.me/${normalizeWhatsAppPhone(
                  customer.phone
                )}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border px-6 py-3 font-bold"
              >
                💬 واتساب
              </a>
            </>
          )}
        </div>

        <h3 className="mt-8 text-2xl font-bold">
          سجل الطلبات
        </h3>

        <div className="mt-5 space-y-4">
          {customer.orders.map((order, index) => (
            <div
              key={order.id}
              className="relative pr-8"
            >
              {index < customer.orders.length - 1 && (
                <div className="absolute right-[9px] top-6 h-[calc(100%+16px)] w-px bg-gray-200" />
              )}

              <div className="absolute right-0 top-2 h-5 w-5 rounded-full border-4 border-white bg-emerald-600 shadow" />

              <div className="rounded-xl border bg-gray-50 p-4">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold">
                        طلب #{order.orderNumber}
                      </p>

                      <StatusBadge status={order.status} />
                    </div>

                    <p className="mt-1 text-sm text-gray-500">
                      {formatDate(order.createdAt)}
                    </p>

                    {order.occasion && (
                      <p className="mt-2 text-sm text-gray-600">
                        المناسبة: {order.occasion}
                      </p>
                    )}
                  </div>

                  <div className="sm:text-left">
                    <p className="text-lg font-bold text-emerald-700">
                      {order.total.toFixed(2)} د.ل
                    </p>

                    <p className="mt-1 text-sm text-gray-500">
                      المدفوع: {order.paidAmount.toFixed(2)} د.ل
                    </p>

                    {order.remainingAmount > 0 && (
                      <p className="mt-1 text-sm font-bold text-red-700">
                        المتبقي: {order.remainingAmount.toFixed(2)} د.ل
                      </p>
                    )}
                  </div>
                </div>

                {order.notes && (
                  <div className="mt-3 rounded-lg bg-white p-3 text-sm text-gray-600">
                    {order.notes}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
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
      <p className={`mt-2 text-3xl font-bold ${valueClass}`}>
        {value}
      </p>
    </div>
  );
}

function HighlightCard({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
      <p className="text-sm font-semibold text-emerald-700">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold text-gray-800">
        {value}
      </p>
      <p className="mt-1 text-sm text-gray-500">
        {description}
      </p>
    </div>
  );
}

function MiniStat({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string | number;
  danger?: boolean;
}) {
  return (
    <div className="rounded-xl bg-gray-50 p-3">
      <p className="text-sm text-gray-500">{label}</p>
      <p
        className={`mt-1 font-bold ${
          danger ? "text-red-700" : "text-gray-800"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function ContactButton({
  href,
  label,
  disabled,
  external = false,
}: {
  href?: string;
  label: string;
  disabled: boolean;
  external?: boolean;
}) {
  if (disabled || !href) {
    return (
      <span className="cursor-not-allowed rounded-xl border bg-gray-50 px-4 py-3 text-center font-bold text-gray-400">
        {label}
      </span>
    );
  }

  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className="rounded-xl border px-4 py-3 text-center font-bold hover:bg-gray-50"
    >
      {label}
    </a>
  );
}

function StatusBadge({ status }: { status: string }) {
  const classes: Record<string, string> = {
    new: "bg-blue-100 text-blue-700",
    working: "bg-orange-100 text-orange-700",
    ready: "bg-purple-100 text-purple-700",
    done: "bg-green-100 text-green-700",
    cancelled: "bg-red-100 text-red-700",
  };

  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-bold ${
        classes[status] || "bg-gray-100 text-gray-700"
      }`}
    >
      {getStatusLabel(status)}
    </span>
  );
}

function getCustomerStatus(customer: CustomerSummary) {
  if (customer.totalRemaining <= 0) {
    return {
      label: "حساب سليم",
      className: "bg-emerald-100 text-emerald-700",
    };
  }

  if (customer.totalRemaining <= customer.averageOrder) {
    return {
      label: "لديه متبقي",
      className: "bg-amber-100 text-amber-700",
    };
  }

  return {
    label: "متبقي مرتفع",
    className: "bg-red-100 text-red-700",
  };
}

function getMostCommonOccasion(orders: OrderRow[]) {
  const counts = new Map<string, number>();

  for (const order of orders) {
    const occasion = order.occasion.trim();

    if (!occasion) continue;

    counts.set(occasion, (counts.get(occasion) || 0) + 1);
  }

  return (
    Array.from(counts.entries()).sort(
      (a, b) => b[1] - a[1]
    )[0]?.[0] || ""
  );
}

function normalizePhone(value: string) {
  return value.replace(/[^\d+]/g, "");
}

function normalizeWhatsAppPhone(value: string) {
  let phone = value.replace(/\D/g, "");

  if (phone.startsWith("00")) {
    phone = phone.slice(2);
  }

  return phone;
}

function formatDate(value: string) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("ar-LY");
}

function getStatusLabel(status: string) {
  const values: Record<string, string> = {
    new: "جديد",
    working: "جاري التنفيذ",
    ready: "جاهز",
    done: "تم التسليم",
    cancelled: "ملغي",
  };

  return values[status] || status;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "حدث خطأ غير متوقع";
}