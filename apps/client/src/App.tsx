import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { supabase } from "./lib/supabase";
import Inventory from "./pages/Inventory";
import Settings from "./pages/Settings";
import Sidebar from "./components/Sidebar";
import Login from "./pages/Login";
import { getCurrentUserRole } from "./lib/auth";
import Dashboard from "./pages/Dashboard";
import POS from "./pages/POS";
import Orders from "./pages/Orders";
import NewOrder from "./pages/NewOrder";
import Drafts from "./pages/Drafts";
import Items from "./pages/Items";
import Suppliers from "./pages/Suppliers";
import Purchases from "./pages/Purchases";
import Treasury from "./pages/Treasury";
import Customers from "./pages/Customers";
import Reports from "./pages/Reports";
import Employees from "./pages/Employees";
import Users from "./pages/Users";
import Waste from "./pages/Waste";
import Expenses from "./pages/Expenses";
import ActivityLogPage from "./pages/ActivityLog";
import PackagingEmployee from "./pages/PackagingEmployee";
import ReadyProducts from "./pages/ReadyProducts";
import Offers from "./pages/Offers";
import PwaControls from "./components/PwaControls";
import Tasks from "./pages/Tasks";
import ItemTracking from "./pages/ItemTracking";
import SupplierReports from "./pages/SupplierReports";
import Branches from "./pages/Branches";
import Attendance from "./pages/Attendance";
import PurchaseInvoices from "./pages/PurchaseInvoices";
import AdvancedOperations from "./pages/AdvancedOperations";
import GrowthCenter from "./pages/GrowthCenter";
import WhatsAppLogs from "./pages/WhatsAppLogs";
import WhatsAppCampaigns from "./pages/WhatsAppCampaigns";
import { getUserNotificationPreferences, preferenceMap, type UserNotificationPreference } from "./lib/notificationPreferences";
import { BranchProvider, useBranch } from "./context/BranchContext";
import { refreshWhatsAppSettings } from "./lib/whatsappSettings";
import BranchSelector from "./components/branches/BranchSelector";
import BranchScopeBanner from "./components/branches/BranchScopeBanner";

type AppNotification = {
  id: string;
  title: string;
  description: string;
  page: string;
  level: "info" | "warning" | "danger";
  createdAt: string;
  eventKey?: string;
};

function App() {
  const [page, setPage] = useState("dashboard");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [checkingLogin, setCheckingLogin] = useState(true);
  const [userRole, setUserRole] = useState("employee");
  const [userBranchId, setUserBranchId] = useState<string | null>(null);
  const [canViewAllBranches, setCanViewAllBranches] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationPreferences, setNotificationPreferences] = useState<Map<string, UserNotificationPreference>>(new Map());

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);

  const notificationsRef = useRef<HTMLDivElement | null>(null);
  const notifiedIdsRef = useRef<Set<string>>(new Set());
  const notificationsInitializedRef = useRef(false);

  useEffect(() => {
    void checkUser();
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;

    void loadNotifications();

    const interval = window.setInterval(() => {
      void loadNotifications();
    }, 60_000);

    return () => window.clearInterval(interval);
  }, [isLoggedIn]);

  useEffect(() => {
    if (!notificationsInitializedRef.current) {
      notifiedIdsRef.current = new Set(notifications.map((item) => item.id));
      notificationsInitializedRef.current = true;
      return;
    }

    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

    const newItems = notifications.filter((item) => !notifiedIdsRef.current.has(item.id));
    newItems.filter((item) => notificationPreferences.get(item.eventKey || "")?.push_enabled !== false).slice(0, 3).forEach((item) => {
      void navigator.serviceWorker?.ready.then((registration) =>
        registration.showNotification(item.title, {
          body: item.description,
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
          tag: item.id,
          data: { url: "/" },
        })
      );
    });

    notifiedIdsRef.current = new Set(notifications.map((item) => item.id));
  }, [notifications, notificationPreferences]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (
        notificationsRef.current &&
        !notificationsRef.current.contains(event.target as Node)
      ) {
        setNotificationsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  async function checkUser() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    setIsLoggedIn(Boolean(user));

    if (user) {
      const profile = await getCurrentUserRole();

      if (profile) {
        const role = String(
          profile.role || "employee"
        ).toLowerCase();

        setUserRole(role);
        setUserBranchId(profile.branch_id || null);
        setCanViewAllBranches(Boolean(profile.access_all_branches) || ["owner", "admin"].includes(role));
        console.log("Role from Supabase:", role);
      }

      void refreshWhatsAppSettings();

      try {
        const prefs = await getUserNotificationPreferences(user.id);
        setNotificationPreferences(preferenceMap(prefs));
      } catch (error) {
        console.warn("تعذر تحميل تفضيلات الإشعارات:", error);
        setNotificationPreferences(new Map());
      }
    }

    setCheckingLogin(false);
  }

  async function logout() {
    await supabase.auth.signOut();
    setIsLoggedIn(false);
    setNotifications([]);
    setNotificationsOpen(false);
  }

  async function loadNotifications() {
    setNotificationsLoading(true);

    try {
      const now = new Date();
      const notificationsList: AppNotification[] = [];

      const [
        ordersResult,
        stockResult,
        readyProductsResult,
      ] = await Promise.all([
        supabase
          .from("orders")
          .select(`
            id,
            order_number,
            customer_name,
            status,
            delivery_date,
            delivery_time,
            created_at,
            delivery_driver_name,
            driver_collection_amount,
            driver_money_status,
            handed_to_driver_at
          `)
          .in("status", [
            "packaging",
            "ready",
            "out_for_delivery",
          ])
          .order("created_at", { ascending: false })
          .limit(100),

        supabase
          .from("product_details")
          .select(`
            id,
            product_id,
            name,
            color,
            stock,
            products (
              name
            )
          `)
          .lte("stock", 5)
          .order("stock", { ascending: true })
          .limit(30),

        supabase
          .from("ready_products")
          .select(`
            id,
            ready_number,
            name,
            product_type,
            status,
            created_at
          `)
          .eq("status", "ready")
          .order("created_at", { ascending: true })
          .limit(30),
      ]);

      if (ordersResult.error) throw ordersResult.error;
      if (stockResult.error) throw stockResult.error;

      /*
       * لو جدول الجاهزات لم يُنشأ بعد في جهاز آخر،
       * لا نوقف كل التنبيهات بسببه.
       */
      if (readyProductsResult.error) {
        console.warn(
          "تعذر تحميل تنبيهات الجاهزات:",
          readyProductsResult.error
        );
      }

      for (const order of ordersResult.data || []) {
        const orderNumber = String(
          order.order_number || order.id
        );

        const customerName = String(
          order.customer_name || "عميل"
        );

        const status = String(order.status || "");

        if (status === "packaging") {
          notificationsList.push({
            id: `packaging-${order.id}`,
            title: "طلب بانتظار التغليف",
            description: `الطلب #${orderNumber} — ${customerName}`,
            page: "packaging",
            level: "info",
            createdAt: String(order.created_at || ""),
          });
        }

        if (status === "ready") {
          notificationsList.push({
            id: `ready-${order.id}`,
            title: "طلب جاهز للتسليم",
            description: `الطلب #${orderNumber} — ${customerName}`,
            page: "orders",
            level: "info",
            createdAt: String(order.created_at || ""),
          });
        }

        const deliveryDateTime = getDeliveryDateTime(
          String(order.delivery_date || ""),
          String(order.delivery_time || "")
        );

        if (
          deliveryDateTime &&
          deliveryDateTime.getTime() < now.getTime() &&
          status !== "delivered" &&
          status !== "cancelled"
        ) {
          notificationsList.push({
            id: `late-${order.id}`,
            title: "طلب متأخر عن موعد التسليم",
            description: `الطلب #${orderNumber} — ${customerName}`,
            page: "orders",
            level: "danger",
            createdAt: deliveryDateTime.toISOString(),
          });
        }

        if (
          String(order.driver_money_status || "") === "with_driver" &&
          Number(order.driver_collection_amount || 0) > 0
        ) {
          notificationsList.push({
            id: `driver-money-${order.id}`,
            title: "مبلغ ما زال مع المندوب",
            description:
              `${String(
                order.delivery_driver_name || "مندوب"
              )} — طلب #${orderNumber} — ` +
              `${Number(
                order.driver_collection_amount || 0
              ).toFixed(2)} د.ل`,
            page: "orders",
            level: "warning",
            createdAt: String(
              order.handed_to_driver_at ||
                order.created_at ||
                ""
            ),
          });
        }
      }

      for (const material of stockResult.data || []) {
        const productRelation = material.products as
          | { name?: string | null }
          | Array<{ name?: string | null }>
          | null;

        const productName = Array.isArray(productRelation)
          ? productRelation[0]?.name
          : productRelation?.name;

        const materialName = [
          productName,
          material.color || material.name,
        ]
          .filter(Boolean)
          .join(" - ");

        const stock = Number(material.stock || 0);

        notificationsList.push({
          id: `stock-${material.id}`,
          title:
            stock <= 0
              ? "نفد من المخزون"
              : "المخزون منخفض",
          description: `${materialName || "منتج"} — المتوفر ${stock}`,
          page: "inventory",
          level: stock <= 0 ? "danger" : "warning",
          createdAt: new Date().toISOString(),
        });
      }

      if (!readyProductsResult.error) {
        for (const ready of readyProductsResult.data || []) {
          const createdAt = new Date(
            String(ready.created_at || "")
          );

          if (Number.isNaN(createdAt.getTime())) continue;

          const ageInDays =
            (now.getTime() - createdAt.getTime()) /
            (1000 * 60 * 60 * 24);

          if (ageInDays >= 14) {
            notificationsList.push({
              id: `old-ready-${ready.id}`,
              title: "جاهز لم يُبع منذ مدة",
              description:
                `${String(ready.ready_number || "")} — ` +
                `${String(ready.name || "جاهز")}`,
              page: "ready-products",
              level: "warning",
              createdAt: String(ready.created_at || ""),
            });
          }
        }
      }

      notificationsList.sort((a, b) => {
        const levelScore = {
          danger: 3,
          warning: 2,
          info: 1,
        };

        const levelDifference =
          levelScore[b.level] - levelScore[a.level];

        if (levelDifference !== 0) {
          return levelDifference;
        }

        return (
          new Date(b.createdAt).getTime() -
          new Date(a.createdAt).getTime()
        );
      });

      const withEvents = notificationsList.map((item) => ({
        ...item,
        eventKey: getNotificationEventKey(item.id),
      }));
      const visible = withEvents.filter((item) => {
        const pref = notificationPreferences.get(item.eventKey || "");
        return pref?.enabled !== false && pref?.in_app !== false;
      });
      setNotifications(visible);
    } catch (error) {
      console.error("خطأ تحميل التنبيهات:", error);
    } finally {
      setNotificationsLoading(false);
    }
  }

  function openNotification(notification: AppNotification) {
    setPage(notification.page);
    setNotificationsOpen(false);
  }

  const notificationCount = notifications.length;

  const notificationGroups = useMemo(
    () => ({
      danger: notifications.filter(
        (notification) =>
          notification.level === "danger"
      ).length,
      warning: notifications.filter(
        (notification) =>
          notification.level === "warning"
      ).length,
      info: notifications.filter(
        (notification) =>
          notification.level === "info"
      ).length,
    }),
    [notifications]
  );

  if (checkingLogin) {
    return (
      <div className="flex min-h-screen items-center justify-center text-2xl font-bold">
        جاري التحميل...
      </div>
    );
  }

  if (!isLoggedIn) {
    return <Login onLogin={checkUser} />;
  }

  return (
    <BranchProvider userRole={userRole} userBranchId={userBranchId} canViewAllBranches={canViewAllBranches}>
    <div className="flex min-h-screen bg-gray-100">
      <Sidebar
        page={page}
        setPage={setPage}
        userRole={userRole}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <main className="min-w-0 flex-1 overflow-x-hidden">
        <BranchHeader
          setMobileMenuOpen={setMobileMenuOpen}
          notificationsRef={notificationsRef}
          notificationsOpen={notificationsOpen}
          setNotificationsOpen={setNotificationsOpen}
          notificationCount={notificationCount}
          notifications={notifications}
          notificationsLoading={notificationsLoading}
          notificationGroups={notificationGroups}
          loadNotifications={loadNotifications}
          openNotification={openNotification}
          logout={logout}
        />

        <BranchScopeBanner />
        <section className="app-page-shell">
        {page === "dashboard" && <Dashboard />}
        {page === "pos" && <POS setPage={setPage} />}
        {page === "orders" && (
          <Orders
            setPage={setPage}
            userRole={userRole}
          />
        )}
        {page === "new-order" && <NewOrder />}
        {page === "drafts" && <Drafts setPage={setPage} />}
        {page === "items" && <Items />}
        {page === "inventory" && <Inventory />}
                {page === "purchases" && <Purchases />}
        {page === "treasury" && <Treasury />}
        {page === "suppliers" && <Suppliers />}
        {page === "packaging" && <PackagingEmployee />}
        {page === "ready-products" && <ReadyProducts />}
        {page === "offers" && <Offers />}
        {page === "waste" && <Waste />}
        {page === "expenses" && <Expenses />}
        {page === "tasks" && <Tasks />}
        {page === "item-tracking" && <ItemTracking />}
        {page === "supplier-reports" && <SupplierReports />}
        {page === "purchase-invoices" && <PurchaseInvoices />}
        {page === "branches" && <Branches />}
        {page === "advanced-operations" && <AdvancedOperations />}
        {page === "growth-center" && <GrowthCenter />}
        {page === "attendance" && <Attendance />}
        {page === "customers" && <Customers />}
        {page === "employees" && <Employees />}

        {page === "activity-log" &&
          (userRole === "owner" ||
            userRole === "admin") && (
            <ActivityLogPage />
          )}

        {page === "users" &&
          (userRole === "owner" ||
            userRole === "admin") && <Users />}

        {page === "reports" &&
          userRole !== "employee" && <Reports />}

        {page === "whatsapp-campaigns" && (userRole === "owner" || userRole === "admin" || userRole === "manager") && <WhatsAppCampaigns />}
        {page === "whatsapp-logs" && <WhatsAppLogs />}
        {page === "settings" && <Settings />}
        </section>
      </main>
    </div>
    </BranchProvider>
  );
}


type BranchHeaderProps = {
  setMobileMenuOpen: (open: boolean) => void;
  notificationsRef: RefObject<HTMLDivElement | null>;
  notificationsOpen: boolean;
  setNotificationsOpen: Dispatch<SetStateAction<boolean>>;
  notificationCount: number;
  notifications: AppNotification[];
  notificationsLoading: boolean;
  notificationGroups: {
    danger: number;
    warning: number;
    info: number;
  };
  loadNotifications: () => Promise<void>;
  openNotification: (notification: AppNotification) => void;
  logout: () => Promise<void>;
};

function BranchHeader({
  setMobileMenuOpen,
  notificationsRef,
  notificationsOpen,
  setNotificationsOpen,
  notificationCount,
  notifications,
  notificationsLoading,
  notificationGroups,
  loadNotifications,
  openNotification,
  logout,
}: BranchHeaderProps) {
  const {
    selectedBranch,
    effectiveBranchId,
    canViewAllBranches,
    loading,
  } = useBranch();

  const branchName = effectiveBranchId
    ? selectedBranch?.name || "الفرع المحدد"
    : canViewAllBranches
      ? "جميع الفروع"
      : selectedBranch?.name || "فرعك";

  const primaryColor =
    selectedBranch?.primaryColor || "#16a34a";

  const secondaryColor =
    selectedBranch?.secondaryColor || "#ffffff";

  useEffect(() => {
    const previousTitle = document.title;
    const title = effectiveBranchId
      ? `${branchName} | MOOD System`
      : "MOOD System | جميع الفروع";

    document.title = title;

    let themeColor = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]'
    );

    if (!themeColor) {
      themeColor = document.createElement("meta");
      themeColor.name = "theme-color";
      document.head.appendChild(themeColor);
    }

    themeColor.content = primaryColor;

    return () => {
      document.title = previousTitle;
    };
  }, [branchName, effectiveBranchId, primaryColor]);

  return (
    <div
      className="sticky top-0 z-[9990] flex items-center justify-between gap-2 border-b bg-white p-2 shadow sm:p-3"
      style={{
        borderColor:
          "color-mix(in srgb, var(--branch-primary) 18%, transparent)",
      }}
    >
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl text-white shadow-sm lg:hidden"
          style={{ backgroundColor: primaryColor }}
          aria-label="فتح القائمة"
        >
          ☰
        </button>

        <div className="hidden min-w-0 items-center gap-3 sm:flex">
          {selectedBranch?.logoUrl ? (
            <img
              src={selectedBranch.logoUrl}
              alt={branchName}
              className="h-11 w-11 shrink-0 rounded-xl border bg-white object-contain p-1"
            />
          ) : (
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg font-black shadow-sm"
              style={{
                backgroundColor: primaryColor,
                color: secondaryColor,
              }}
            >
              {branchName.trim().charAt(0) || "M"}
            </div>
          )}

          <div className="min-w-0" dir="rtl">
            <p
              className="truncate text-sm font-black sm:text-base"
              style={{ color: primaryColor }}
            >
              {loading ? "جاري تحميل الفرع..." : branchName}
            </p>
            <p className="truncate text-[11px] font-semibold text-gray-500 sm:text-xs">
              {effectiveBranchId
                ? selectedBranch?.address || selectedBranch?.code || "بيانات الفرع الحالي"
                : "عرض موحد لجميع الفروع"}
            </p>
          </div>
        </div>

        <PwaControls />
        <BranchSelector />
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <div
          ref={notificationsRef}
          className="relative z-[9995]"
          dir="rtl"
        >
          <button
            type="button"
            onClick={() =>
              setNotificationsOpen((current) => !current)
            }
            className="relative flex h-11 w-11 items-center justify-center rounded-xl text-xl transition"
            style={{
              backgroundColor:
                "color-mix(in srgb, var(--branch-primary) 9%, white)",
              color: primaryColor,
            }}
            aria-label="التنبيهات"
          >
            🔔

            {notificationCount > 0 && (
              <span className="absolute -left-2 -top-2 flex min-h-6 min-w-6 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-bold text-white">
                {notificationCount > 99 ? "99+" : notificationCount}
              </span>
            )}
          </button>

          {notificationsOpen && (
            <div className="fixed left-4 top-16 z-[99999] w-[430px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
              <div
                className="border-b p-4"
                style={{
                  borderColor:
                    "color-mix(in srgb, var(--branch-primary) 16%, transparent)",
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2
                      className="text-lg font-bold"
                      style={{ color: primaryColor }}
                    >
                      تنبيهات {branchName}
                    </h2>
                    <p className="mt-1 text-xs text-gray-500">
                      تتحدث تلقائيًا كل دقيقة
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => void loadNotifications()}
                    disabled={notificationsLoading}
                    className="rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50"
                    style={{
                      backgroundColor:
                        "color-mix(in srgb, var(--branch-primary) 10%, white)",
                      color: primaryColor,
                    }}
                  >
                    {notificationsLoading ? "جاري..." : "تحديث"}
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                  {notificationGroups.danger > 0 && (
                    <span className="rounded-full bg-red-100 px-3 py-1 text-red-700">
                      عاجل {notificationGroups.danger}
                    </span>
                  )}

                  {notificationGroups.warning > 0 && (
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-700">
                      تنبيه {notificationGroups.warning}
                    </span>
                  )}

                  {notificationGroups.info > 0 && (
                    <span className="rounded-full bg-blue-100 px-3 py-1 text-blue-700">
                      متابعة {notificationGroups.info}
                    </span>
                  )}
                </div>
              </div>

              <div className="max-h-[65vh] overflow-y-auto p-2">
                {notifications.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    لا توجد تنبيهات حاليًا ✅
                  </div>
                ) : (
                  notifications.map((notification) => (
                    <button
                      key={notification.id}
                      type="button"
                      onClick={() => openNotification(notification)}
                      className={`mb-2 w-full rounded-xl border p-4 text-right transition hover:shadow ${
                        notification.level === "danger"
                          ? "border-red-200 bg-red-50"
                          : notification.level === "warning"
                            ? "border-amber-200 bg-amber-50"
                            : "border-blue-200 bg-blue-50"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-xl">
                          {notification.level === "danger"
                            ? "🚨"
                            : notification.level === "warning"
                              ? "⚠️"
                              : "ℹ️"}
                        </span>

                        <div className="min-w-0 flex-1">
                          <p className="font-bold">
                            {notification.title}
                          </p>
                          <p className="mt-1 text-sm text-gray-600">
                            {notification.description}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => void logout()}
          className="rounded-lg bg-red-100 px-3 py-2 text-sm font-semibold text-red-700 sm:px-4 sm:text-base"
        >
          تسجيل خروج
        </button>
      </div>
    </div>
  );
}


function getNotificationEventKey(id: string) {
  if (id.startsWith("packaging-")) return "order.packaging";
  if (id.startsWith("ready-")) return "order.ready";
  if (id.startsWith("late-")) return "system.anomaly";
  if (id.startsWith("driver-money-")) return "driver.money";
  if (id.startsWith("stock-")) return "stock.low";
  if (id.startsWith("old-ready-")) return "product.stagnant";
  return "system.anomaly";
}

function getDeliveryDateTime(
  deliveryDate: string,
  deliveryTime: string
) {
  if (!deliveryDate) return null;

  const time = deliveryTime || "23:59";
  const date = new Date(`${deliveryDate}T${time}`);

  if (Number.isNaN(date.getTime())) return null;

  return date;
}

export default App;