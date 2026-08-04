type SidebarProps = {
  page: string;
  setPage: (page: string) => void;
};

export default function Sidebar({ page, setPage }: SidebarProps) {
  const itemClass = (item: string) =>
    `cursor-pointer rounded-lg p-3 transition ${
      page === item ? "bg-emerald-700 text-white" : "hover:bg-emerald-700"
    }`;

  return (
    <aside className="w-64 min-h-screen bg-emerald-900 p-6 text-white" dir="rtl">
      <h1 className="mb-10 text-center text-4xl font-bold">MOOD</h1>

      <ul className="space-y-3 text-lg">
        <li onClick={() => setPage("pos")} className={itemClass("pos")}>
          👩‍💼 واجهة الموظف
        </li>

        <li onClick={() => setPage("new-order")} className={itemClass("new-order")}>
          ➕ طلب جديد
        </li>

        <li onClick={() => setPage("orders")} className={itemClass("orders")}>
          📋 الطلبات
        </li>

        <li onClick={() => setPage("dashboard")} className={itemClass("dashboard")}>
          🏠 لوحة التحكم
        </li>

        <li onClick={() => setPage("items")} className={itemClass("items")}>
          🌹 إدارة المنتجات
        </li>

        <li onClick={() => setPage("inventory")} className={itemClass("inventory")}>
          📦 المخزون
        </li>

        <li onClick={() => setPage("reports")} className={itemClass("reports")}>
          📊 التقارير
        </li>
      </ul>
    </aside>
  );
}