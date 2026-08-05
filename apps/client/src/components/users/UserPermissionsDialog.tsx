import { useEffect, useMemo, useState } from "react";
import {
  getAppPermissions,
  getUserPermissionOverrides,
  getRolePermissionIds,
  saveUserPermissionOverrides,
  type AppPermission,
  type UserProfile,
} from "../../lib/users";

type Props = {
  open: boolean;
  user: UserProfile | null;
  onClose: () => void;
};

type PermissionState = Record<string, "allow" | "deny">;

export default function UserPermissionsDialog({
  open,
  user,
  onClose,
}: Props) {
  const [permissions, setPermissions] = useState<AppPermission[]>([]);
  const [permissionStates, setPermissionStates] =
    useState<PermissionState>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && user) {
      loadData();
    }
  }, [open, user]);

  async function loadData() {
    if (!user) return;

    setLoading(true);

    try {
      const [permissionsData, overridesData, rolePermissionIds] = await Promise.all([
        getAppPermissions(),
        getUserPermissionOverrides(user.id),
        user.role_id ? getRolePermissionIds(user.role_id) : Promise.resolve([]),
      ]);

      setPermissions(permissionsData);

      const nextStates: PermissionState = {};

      const roleAllowed = new Set(rolePermissionIds);
      permissionsData.forEach((permission) => {
        nextStates[permission.id] = roleAllowed.has(permission.id) ? "allow" : "deny";
      });

      overridesData.forEach((override) => {
        nextStates[override.permission_id] = override.allowed
          ? "allow"
          : "deny";
      });

      setPermissionStates(nextStates);
    } catch (error: any) {
      alert(error.message);
    }

    setLoading(false);
  }

  function setPermissionState(
    permissionId: string,
    state: "allow" | "deny"
  ) {
    setPermissionStates((prev) => ({
      ...prev,
      [permissionId]: state,
    }));
  }

  async function handleSave() {
    if (!user) return;

    setSaving(true);

    try {
      const overrides = Object.entries(permissionStates)
        .map(([permissionId, state]) => ({
          permissionId,
          allowed: state === "allow",
        }));

      await saveUserPermissionOverrides(user.id, overrides);

      alert("تم حفظ صلاحيات المستخدم");
      onClose();
    } catch (error: any) {
      alert(error.message);
    }

    setSaving(false);
  }

  const pagePermissions = useMemo(() => permissions.filter((permission) => permission.code.startsWith("page.")), [permissions]);

  const groupedPermissions = useMemo(() => {
    return pagePermissions.reduce<Record<string, AppPermission[]>>(
      (groups, permission) => {
        const groupName = permission.group_name || "عام";

        if (!groups[groupName]) {
          groups[groupName] = [];
        }

        groups[groupName].push(permission);
        return groups;
      },
      {}
    );
  }, [pagePermissions]);

  if (!open || !user) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="max-h-[90vh] w-full max-w-5xl overflow-auto rounded-2xl bg-white p-6 shadow-2xl"
        dir="rtl"
      >
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">صلاحيات المستخدم</h2>
            <p className="mt-1 text-gray-500">
              {user.full_name || user.username || user.email}
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg bg-red-100 px-3 py-2 text-red-700"
          >
            ✕
          </button>
        </div>

        <div className="mb-5 rounded-xl bg-blue-50 p-4 text-sm font-semibold text-blue-800">
          افتح أو اقفل الصفحات لهذا المستخدم. الصفحة المقفولة لا تظهر في القائمة ولا يمكن فتحها من داخل النظام.
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-500">
            جاري تحميل الصلاحيات...
          </div>
        ) : (
          <div className="space-y-5">
            {Object.entries(groupedPermissions).map(([groupName, items]) => (
              <div key={groupName} className="rounded-xl border p-4">
                <h3 className="mb-4 text-lg font-bold text-emerald-800">
                  {groupName}
                </h3>

                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {items.map((permission) => {
                    const state =
                      permissionStates[permission.id] || "deny";

                    return (
                      <div
                        key={permission.id}
                        className="rounded-xl border p-4"
                      >
                        <div className="mb-3">
                          <div className="font-semibold">{permission.name}</div>
                          <div className="text-xs text-gray-500">
                            {permission.code}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setPermissionState(permission.id, state === "allow" ? "deny" : "allow")}
                          className={`flex w-full items-center justify-between rounded-xl px-4 py-3 font-bold transition ${
                            state === "allow" ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          <span>{state === "allow" ? "الصفحة مفتوحة" : "الصفحة مقفولة"}</span>
                          <span className={`relative h-7 w-12 rounded-full transition ${state === "allow" ? "bg-emerald-600" : "bg-gray-300"}`}>
                            <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${state === "allow" ? "left-1" : "right-1"}`} />
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-xl border px-5 py-3">
            إلغاء
          </button>

          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="rounded-xl bg-emerald-700 px-6 py-3 font-semibold text-white disabled:opacity-50"
          >
            {saving ? "جاري الحفظ..." : "حفظ الصلاحيات"}
          </button>
        </div>
      </div>
    </div>
  );
}