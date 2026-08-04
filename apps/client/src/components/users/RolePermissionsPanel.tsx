import { useEffect, useMemo, useState } from "react";
import {
  getAppPermissions,
  getRolePermissionIds,
  getRoles,
  saveRolePermissions,
  type AppPermission,
  type Role,
} from "../../lib/users";

export default function RolePermissionsPanel() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<AppPermission[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<string[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (selectedRoleId) {
      loadRolePermissions(selectedRoleId);
    }
  }, [selectedRoleId]);

  async function loadInitialData() {
    setLoading(true);

    try {
      const [rolesData, permissionsData] = await Promise.all([
        getRoles(),
        getAppPermissions(),
      ]);

      setRoles(rolesData);
      setPermissions(permissionsData);

      if (rolesData.length > 0) {
        setSelectedRoleId(rolesData[0].id);
      }
    } catch (error: any) {
      alert(error.message);
    }

    setLoading(false);
  }

  async function loadRolePermissions(roleId: string) {
    try {
      const ids = await getRolePermissionIds(roleId);
      setSelectedPermissionIds(ids);
    } catch (error: any) {
      alert(error.message);
    }
  }

  function togglePermission(permissionId: string) {
    setSelectedPermissionIds((prev) =>
      prev.includes(permissionId)
        ? prev.filter((id) => id !== permissionId)
        : [...prev, permissionId]
    );
  }

  async function savePermissions() {
    if (!selectedRoleId) {
      alert("اختر الدور");
      return;
    }

    setSaving(true);

    try {
      await saveRolePermissions(selectedRoleId, selectedPermissionIds);
      alert("تم حفظ صلاحيات الدور");
    } catch (error: any) {
      alert(error.message);
    }

    setSaving(false);
  }

  const groupedPermissions = useMemo(() => {
    return permissions.reduce<Record<string, AppPermission[]>>(
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
  }, [permissions]);

  if (loading) {
    return (
      <div className="rounded-2xl bg-white p-6 shadow">
        جاري تحميل الصلاحيات...
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow" dir="rtl">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">الأدوار والصلاحيات</h2>
          <p className="mt-1 text-gray-500">
            اختر دورًا ثم عدّل الصلاحيات المسموحة له
          </p>
        </div>

        <button
          onClick={savePermissions}
          disabled={saving}
          className="rounded-xl bg-emerald-700 px-6 py-3 font-semibold text-white disabled:opacity-50"
        >
          {saving ? "جاري الحفظ..." : "حفظ الصلاحيات"}
        </button>
      </div>

      <div className="mb-6">
        <label className="mb-2 block font-semibold">الدور</label>
        <select
          value={selectedRoleId}
          onChange={(e) => setSelectedRoleId(e.target.value)}
          className="w-full rounded-xl border p-3"
        >
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-5">
        {Object.entries(groupedPermissions).map(([groupName, items]) => (
          <div key={groupName} className="rounded-xl border p-4">
            <h3 className="mb-3 text-lg font-bold text-emerald-800">
              {groupName}
            </h3>

            <div className="grid grid-cols-2 gap-3">
              {items.map((permission) => (
                <label
                  key={permission.id}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border p-3 hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedPermissionIds.includes(permission.id)}
                    onChange={() => togglePermission(permission.id)}
                  />

                  <div>
                    <div className="font-semibold">{permission.name}</div>
                    <div className="text-xs text-gray-500">
                      {permission.code}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}