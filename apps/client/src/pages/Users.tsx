import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  getUsers,
  toggleUserStatus,
  type UserProfile,
} from "../lib/users";
import UserDialog from "../components/users/UserDialog";
import RolePermissionsPanel from "../components/users/RolePermissionsPanel";
import UserPermissionsDialog from "../components/users/UserPermissionsDialog";
import UserNotificationsDialog from "../components/users/UserNotificationsDialog";

export default function Users() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [activeTab, setActiveTab] = useState<"users" | "roles">("users");

  const [showUserDialog, setShowUserDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);

  const [showPermissionsDialog, setShowPermissionsDialog] = useState(false);
  const [showNotificationsDialog, setShowNotificationsDialog] = useState(false);
  const [notificationsUser, setNotificationsUser] =
    useState<UserProfile | null>(null);
  const [permissionsUser, setPermissionsUser] =
    useState<UserProfile | null>(null);

  useEffect(() => {
    void loadUsers();
  }, []);

  async function loadUsers() {
    setLoading(true);

    try {
      const data = await getUsers();
      setUsers(data);
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : "تعذر تحميل المستخدمين");
    } finally {
      setLoading(false);
    }
  }

  function openCreateDialog() {
    setEditingUser(null);
    setShowUserDialog(true);
  }

  function openEditDialog(user: UserProfile) {
    setEditingUser(user);
    setShowUserDialog(true);
  }

  function closeUserDialog() {
    setEditingUser(null);
    setShowUserDialog(false);
  }

  function openPermissionsDialog(user: UserProfile) {
    setPermissionsUser(user);
    setShowPermissionsDialog(true);
  }

  function closePermissionsDialog() {
    setPermissionsUser(null);
    setShowPermissionsDialog(false);
  }

  function openNotificationsDialog(user: UserProfile) {
    setNotificationsUser(user);
    setShowNotificationsDialog(true);
  }

  function closeNotificationsDialog() {
    setNotificationsUser(null);
    setShowNotificationsDialog(false);
  }

  async function handleToggleUserStatus(user: UserProfile) {
    const confirmMessage = user.is_active
      ? "هل تريد تعطيل هذا المستخدم؟"
      : "هل تريد تفعيل هذا المستخدم؟";

    if (!confirm(confirmMessage)) return;

    try {
      await toggleUserStatus(user);
      await loadUsers();
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : "تعذر تحديث حالة المستخدم");
    }
  }

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const keyword = search.trim().toLowerCase();

      const matchesSearch =
        !keyword ||
        user.full_name?.toLowerCase().includes(keyword) ||
        user.username?.toLowerCase().includes(keyword) ||
        user.email?.toLowerCase().includes(keyword);

      const matchesRole =
        roleFilter === "all" || user.roles?.name === roleFilter;

      return matchesSearch && matchesRole;
    });
  }, [users, search, roleFilter]);

  const stats = useMemo(() => {
    return {
      total: users.length,
      active: users.filter((user) => user.is_active).length,
      owners: users.filter((user) => user.is_owner).length,
      disabled: users.filter((user) => !user.is_active).length,
    };
  }, [users]);

  const roles = useMemo(() => {
    const list = users
      .map((user) => user.roles?.name)
      .filter(Boolean) as string[];

    return Array.from(new Set(list));
  }, [users]);


  async function handleChangePassword(user: UserProfile) {
    const password = window.prompt(`كلمة المرور الجديدة لـ ${user.full_name || user.username || "المستخدم"}:`);
    if (password === null) return;
    if (password.length < 6) {
      alert("كلمة المرور لازم تكون 6 أحرف أو أكثر");
      return;
    }

    const confirmed = window.confirm("تأكيد تغيير كلمة المرور لهذا الحساب؟");
    if (!confirmed) return;

    try {
      const { data, error } = await supabase.functions.invoke<{ success?: boolean; error?: string }>("manage-user", {
        body: { action: "password", userId: user.id, password },
      });
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || "تعذر تغيير كلمة المرور");
      alert("تم تغيير كلمة المرور بنجاح");
    } catch (error) {
      alert(error instanceof Error ? error.message : "تعذر تغيير كلمة المرور");
    }
  }

  function UserActions({ user }: { user: UserProfile }) {
    return (
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <button
          type="button"
          onClick={() => openEditDialog(user)}
          className="min-h-11 rounded-xl bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
        >
          ✏️ تعديل
        </button>

        <button
          type="button"
          onClick={() => openPermissionsDialog(user)}
          className="min-h-11 rounded-xl bg-purple-50 px-3 py-2 text-sm font-semibold text-purple-700 transition hover:bg-purple-100"
        >
          🛡️ الصلاحيات
        </button>

        <button
          type="button"
          onClick={() => openNotificationsDialog(user)}
          className="min-h-11 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
        >
          🔔 الإشعارات
        </button>

        <button
          type="button"
          title="إدارة كلمة المرور"
          onClick={() => void handleChangePassword(user)}
          className="min-h-11 rounded-xl bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-200"
        >
          🔑 كلمة المرور
        </button>

        {!user.is_owner && (
          <button
            type="button"
            onClick={() => void handleToggleUserStatus(user)}
            className={`col-span-2 min-h-11 rounded-xl px-3 py-2 text-sm font-semibold transition sm:col-span-1 ${
              user.is_active
                ? "bg-orange-50 text-orange-700 hover:bg-orange-100"
                : "bg-green-50 text-green-700 hover:bg-green-100"
            }`}
          >
            {user.is_active ? "🚫 تعطيل" : "✅ تفعيل"}
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className="min-h-full w-full overflow-x-hidden px-3 py-4 sm:px-5 lg:p-8"
      dir="rtl"
    >
      <div className="mb-5 sm:mb-8">
        <h1 className="text-2xl font-black text-gray-900 sm:text-3xl lg:text-4xl">
          المستخدمون والصلاحيات
        </h1>
        <p className="mt-1 text-sm text-gray-500 sm:text-base">
          إدارة حسابات المستخدمين والأدوار والصلاحيات
        </p>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:mb-6 lg:grid-cols-4 lg:gap-4">
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100 sm:p-5">
          <p className="text-xs font-medium text-gray-500 sm:text-base">
            عدد المستخدمين
          </p>
          <p className="mt-2 text-2xl font-black text-emerald-700 sm:text-3xl">
            {stats.total}
          </p>
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100 sm:p-5">
          <p className="text-xs font-medium text-gray-500 sm:text-base">
            النشطون
          </p>
          <p className="mt-2 text-2xl font-black text-green-700 sm:text-3xl">
            {stats.active}
          </p>
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100 sm:p-5">
          <p className="text-xs font-medium text-gray-500 sm:text-base">
            المالكون
          </p>
          <p className="mt-2 text-2xl font-black text-yellow-700 sm:text-3xl">
            {stats.owners}
          </p>
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100 sm:p-5">
          <p className="text-xs font-medium text-gray-500 sm:text-base">
            المعطلون
          </p>
          <p className="mt-2 text-2xl font-black text-red-700 sm:text-3xl">
            {stats.disabled}
          </p>
        </div>
      </div>

      <div className="mb-5 rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-gray-100 sm:mb-6 sm:p-2">
        <div className="grid grid-cols-2 gap-1.5 sm:flex sm:gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("users")}
            className={`min-h-11 rounded-xl px-3 py-2 text-sm font-bold transition sm:px-6 sm:py-3 sm:text-base ${
              activeTab === "users"
                ? "bg-emerald-700 text-white shadow-sm"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            المستخدمون
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("roles")}
            className={`min-h-11 rounded-xl px-3 py-2 text-sm font-bold transition sm:px-6 sm:py-3 sm:text-base ${
              activeTab === "roles"
                ? "bg-emerald-700 text-white shadow-sm"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            الأدوار والصلاحيات
          </button>
        </div>
      </div>

      {activeTab === "users" && (
        <section className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-gray-100 sm:p-6">
          <div className="mb-4 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-xl font-black text-gray-900 sm:text-2xl">
              قائمة المستخدمين
            </h2>

            <button
              type="button"
              onClick={openCreateDialog}
              className="min-h-12 w-full rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white shadow-sm transition hover:bg-emerald-800 sm:w-auto sm:px-6"
            >
              + مستخدم جديد
            </button>
          </div>

          <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-4">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="min-h-12 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-base outline-none transition placeholder:text-gray-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 md:col-span-2"
              placeholder="ابحث بالاسم أو اسم المستخدم أو البريد..."
            />

            <select
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value)}
              className="min-h-12 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-base outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            >
              <option value="all">كل الأدوار</option>
              {roles.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="rounded-2xl bg-gray-50 p-8 text-center text-gray-500">
              جاري تحميل المستخدمين...
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="rounded-2xl bg-gray-50 p-8 text-center text-gray-500">
              لا يوجد مستخدمون مطابقون للبحث
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 lg:hidden">
                {filteredUsers.map((user) => (
                  <article
                    key={user.id}
                    className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3 border-b border-gray-100 bg-gray-50/80 p-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="break-words text-lg font-black text-gray-900">
                            {user.full_name || "-"}
                          </h3>

                          {user.is_owner && (
                            <span className="rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-bold text-yellow-700">
                              Owner
                            </span>
                          )}
                        </div>

                        <p className="mt-1 break-all text-sm text-gray-500">
                          @{user.username || "-"}
                        </p>
                      </div>

                      <span
                        className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${
                          user.is_active
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {user.is_active ? "🟢 نشط" : "🔴 معطل"}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
                      <div className="rounded-xl bg-gray-50 p-3">
                        <p className="text-xs font-semibold text-gray-500">
                          البريد
                        </p>
                        <p className="mt-1 break-all text-sm font-semibold text-gray-900">
                          {user.email || "-"}
                        </p>
                      </div>

                      <div className="rounded-xl bg-gray-50 p-3">
                        <p className="text-xs font-semibold text-gray-500">
                          الدور
                        </p>
                        <p className="mt-1 text-sm font-semibold text-gray-900">
                          {user.roles?.name || "-"}
                        </p>
                      </div>

                      <div className="rounded-xl bg-gray-50 p-3 sm:col-span-2">
                        <p className="text-xs font-semibold text-gray-500">
                          الفرع
                        </p>
                        <p className="mt-1 text-sm font-semibold text-gray-900">
                          {user.branches?.name || "-"}
                        </p>
                      </div>
                    </div>

                    <div className="border-t border-gray-100 p-4">
                      <UserActions user={user} />
                    </div>
                  </article>
                ))}
              </div>

              <div className="hidden overflow-x-auto rounded-2xl border border-gray-100 lg:block">
                <table className="min-w-[1100px] w-full">
                  <thead className="bg-emerald-700 text-white">
                    <tr>
                      <th className="p-4 text-right">الاسم</th>
                      <th className="p-4 text-right">اسم المستخدم</th>
                      <th className="p-4 text-right">البريد</th>
                      <th className="p-4 text-right">الدور</th>
                      <th className="p-4 text-right">الفرع</th>
                      <th className="p-4 text-right">الحالة</th>
                      <th className="p-4 text-right">العمليات</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredUsers.map((user) => (
                      <tr
                        key={user.id}
                        className="border-b border-gray-100 align-top transition last:border-b-0 hover:bg-gray-50"
                      >
                        <td className="p-4 font-semibold">
                          <div className="flex flex-wrap items-center gap-2">
                            <span>{user.full_name || "-"}</span>
                            {user.is_owner && (
                              <span className="rounded-full bg-yellow-100 px-2 py-1 text-xs text-yellow-700">
                                Owner
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="p-4">{user.username || "-"}</td>
                        <td className="max-w-xs break-all p-4">
                          {user.email || "-"}
                        </td>
                        <td className="p-4">{user.roles?.name || "-"}</td>
                        <td className="p-4">{user.branches?.name || "-"}</td>

                        <td className="p-4">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${
                              user.is_active
                                ? "bg-green-100 text-green-700"
                                : "bg-red-100 text-red-700"
                            }`}
                          >
                            {user.is_active ? "🟢 نشط" : "🔴 معطل"}
                          </span>
                        </td>

                        <td className="p-4">
                          <UserActions user={user} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

      {activeTab === "roles" && (
        <div className="overflow-x-hidden">
          <RolePermissionsPanel />
        </div>
      )}

      <UserDialog
        open={showUserDialog}
        onClose={closeUserDialog}
        editingUser={editingUser}
        onSaved={loadUsers}
      />

      <UserPermissionsDialog
        open={showPermissionsDialog}
        user={permissionsUser}
        onClose={closePermissionsDialog}
      />

      <UserNotificationsDialog
        open={showNotificationsDialog}
        user={notificationsUser}
        onClose={closeNotificationsDialog}
      />
    </div>
  );
}