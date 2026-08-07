import { useBranch } from "../context/BranchContext";
import { getBranchTheme } from "../lib/branchTheme";

type SidebarProps = {
  page: string;
  setPage: (page: string) => void;
  userRole: string;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  allowedPages?: Set<string> | null;
};

type MenuItem = {
  key: string;
  label: string;
  roles?: string[];
};

const items: MenuItem[] = [
  { key: "packaging", label: "🎁 واجهة التغليف" },
  { key: "dashboard", label: "🏠 لوحة التحكم" },
  { key: "tasks", label: "✅ المهام" },
  { key: "task-create", label: "➕ إضافة مهمة", roles: ["owner", "admin", "manager"] },
  { key: "orders", label: "📋 الطلبات" },
  { key: "driver-orders", label: "💰 تحصيل المندوبين" },
  { key: "new-order", label: "➕ طلب جديد" },
  { key: "ready-products", label: "📦 الجاهزات" },
  { key: "offer-create", label: "➕ إضافة عرض" },
  { key: "offers", label: "🏷️ قائمة العروض" },
  { key: "production", label: "🏭 مركز الإنتاج" },
  { key: "items", label: "🌹 إدارة المنتجات" },
  { key: "inventory", label: "📦 المخزون" },
  { key: "opening-stock", label: "🧾 الرصيد الافتتاحي", roles: ["owner", "admin", "manager", "accountant"] },
  { key: "item-tracking", label: "🔎 تتبع الأصناف" },
  { key: "purchases", label: "💰 المشتريات" },
  { key: "purchase-invoices", label: "🧾 فواتير المشتريات" },
  { key: "waste", label: "🗑️ التوالف والهالك" },
  { key: "expenses", label: "💸 المصروفات" },
  {
    key: "activity-log",
    label: "🕘 سجل العمليات",
    roles: ["owner", "admin"],
  },
  {
    key: "trash",
    label: "🗑️ سلة المحذوفات",
    roles: ["owner", "admin"],
  },
  {
    key: "whatsapp-logs",
    label: "📱 سجل واتساب",
    roles: ["owner", "admin", "manager"],
  },
  { key: "suppliers", label: "🚚 الموردون" },
  {
    key: "supplier-reports",
    label: "📈 تقارير الموردين",
    roles: ["owner", "admin", "manager", "accountant"],
  },
  { key: "customers", label: "👥 العملاء" },
  { key: "employees", label: "👨‍💼 الموظفون" },
  { key: "attendance", label: "📍 الحضور والانصراف" },
  { key: "withdrawals", label: "💵 مسحوبات الموظفين" },
  { key: "drivers", label: "🚚 مندوبو التوصيل" },
  {
    key: "branches",
    label: "🏢 الفروع",
    roles: ["owner", "admin", "manager"],
  },
  {
    key: "users",
    label: "🛡️ المستخدمون والصلاحيات",
    roles: ["owner", "admin"],
  },
  {
    key: "reports",
    label: "📊 التقارير",
    roles: ["owner", "admin", "manager", "accountant"],
  },
  {
    key: "daily-closing",
    label: "🧮 حساب اليوم الكامل",
    roles: ["owner", "admin", "manager", "accountant"],
  },
  { key: "settings", label: "⚙️ الإعدادات" },
];

export default function Sidebar({
  page,
  setPage,
  userRole,
  mobileOpen = false,
  onCloseMobile,
  allowedPages = null,
}: SidebarProps) {
  const normalizedRole = String(
    userRole || "employee"
  ).toLowerCase();

  const {
    selectedBranch,
    effectiveBranchId,
    canViewAllBranches,
  } = useBranch();

  /*
   * نمرر اسم الفرع بدل الكود لأن كود Alpha الحالي رقم "2".
   * الاسم "Alpha" سيختار الثيم الأزرق مباشرة.
   */
  const theme = getBranchTheme(
    selectedBranch?.name || selectedBranch?.code
  );

  const displayName = effectiveBranchId
    ? selectedBranch?.name || theme.name
    : canViewAllBranches
      ? "جميع الفروع"
      : selectedBranch?.name || theme.name;

  const displayLogo =
    selectedBranch?.logoUrl || theme.logo;

  function openPage(nextPage: string) {
    setPage(nextPage);
    onCloseMobile?.();
  }

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="إغلاق القائمة"
          onClick={onCloseMobile}
          className="fixed inset-0 z-[9997] bg-black/45 lg:hidden"
        />
      )}

      <aside
        dir="rtl"
        className={`fixed inset-y-0 right-0 z-[9998] flex w-[86vw] max-w-72 flex-col p-4 text-white shadow-2xl transition-transform duration-200 lg:sticky lg:top-0 lg:z-20 lg:h-screen lg:w-64 lg:translate-x-0 lg:p-6 lg:shadow-none ${
          mobileOpen
            ? "translate-x-0"
            : "translate-x-full"
        } ${theme.sidebar}`}
      >
        <div className="mb-5 flex items-center justify-between gap-3 lg:mb-8">
          <div className="flex min-w-0 items-center gap-3">
            {selectedBranch?.logoUrl ? (
              <img
                src={selectedBranch.logoUrl}
                alt={displayName}
                className="h-12 w-12 shrink-0 rounded-2xl bg-white object-contain p-1.5 shadow"
              />
            ) : (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-xl font-black shadow">
                {displayLogo}
              </div>
            )}

            <div className="min-w-0">
              <h1 className="truncate text-2xl font-black tracking-wide lg:text-3xl">
                {displayName}
              </h1>

              {selectedBranch?.code && (
                <p className="mt-1 truncate text-xs font-bold text-white/65">
                  {selectedBranch.code}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onCloseMobile}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-xl lg:hidden"
            aria-label="إغلاق القائمة"
          >
            ✕
          </button>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-6">
          <ul className="space-y-2 text-base lg:text-lg">
            {items
              .filter((item) =>
                (!item.roles || item.roles.includes(normalizedRole)) &&
                (allowedPages === null || allowedPages.has(item.key) || (item.key === "driver-orders" && allowedPages.has("orders")) || (item.key === "opening-stock" && allowedPages.has("inventory")))
              )
              .map((item) => {
                const active = page === item.key;

                return (
                  <li key={item.key}>
                    <button
                      type="button"
                      onClick={() => openPage(item.key)}
                      className={`w-full rounded-xl px-3 py-3 text-right font-semibold transition active:scale-[0.99] ${
                        active
                          ? `${theme.sidebarActive} text-white shadow`
                          : theme.sidebarHover
                      }`}
                    >
                      {item.label}
                    </button>
                  </li>
                );
              })}
          </ul>
        </nav>
      </aside>
    </>
  );
}