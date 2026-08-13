import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import {
  getBranches,
  getRoles,
  type Branch,
  type Role,
  type UserProfile,
} from "../../lib/users";

type Props = {
  open: boolean;
  onClose: () => void;
  editingUser?: UserProfile | null;
  onSaved?: () => void;
};

type ManageUserResponse = {
  success?: boolean;
  error?: string;
  message?: string;
};

export default function UserDialog({
  open,
  onClose,
  editingUser,
  onSaved,
}: Props) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);
  const [saving, setSaving] = useState(false);

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [isActive, setIsActive] = useState(true);

  const isEditMode = !!editingUser;

  useEffect(() => {
    if (open) {
      loadLists();
      fillForm();
    }
  }, [open, editingUser]);

  async function loadLists() {
    setLoadingLists(true);

    try {
      const [rolesData, branchesData] = await Promise.all([
        getRoles(),
        getBranches(),
      ]);

      setRoles(rolesData);
      setBranches(branchesData);
    } catch (error: any) {
      alert(error.message || "تعذر تحميل الأدوار والفروع");
    } finally {
      setLoadingLists(false);
    }
  }

  function fillForm() {
    if (editingUser) {
      setFullName(editingUser.full_name || "");
      setUsername(editingUser.username || "");
      setRoleId(editingUser.role_id || "");
      setBranchId(editingUser.branch_id || "");
      setIsActive(editingUser.is_active);
      setPassword("");
      return;
    }

    resetForm();
  }

  function resetForm() {
    setFullName("");
    setUsername("");
    setPassword("");
    setRoleId("");
    setBranchId("");
    setIsActive(true);
  }

  function handleClose() {
    if (saving) return;

    resetForm();
    onClose();
  }

  async function manageUser(action: "create" | "update") {
    const { data, error } = await supabase.functions.invoke<ManageUserResponse>(
      "manage-user",
      {
        body: {
          action,
          userId: editingUser?.id,
          fullName: fullName.trim(),
          username: username.trim(),
          password: action === "create" ? password : undefined,
          roleId,
          branchId,
          isActive,
        },
      },
    );

    if (error) throw new Error(error.message || "فشل الاتصال بخدمة إدارة المستخدم");
    if (!data?.success) throw new Error(data?.error || data?.message || "فشل حفظ المستخدم");
  }

  async function handleSave() {
    const cleanFullName = fullName.trim();
    const cleanUsername = username.trim();
    if (
      !cleanFullName ||
      !cleanUsername ||
      !roleId ||
      !branchId
    ) {
      alert("عبّي كل البيانات");
      return;
    }

    if (!isEditMode && password.length < 6) {
      alert("كلمة المرور لازم تكون 6 أحرف أو أكثر");
      return;
    }

    setSaving(true);

    try {
      if (isEditMode && editingUser) {
        await manageUser("update");
        alert("تم تعديل المستخدم وبيانات الدخول بنجاح");
      } else {
        await manageUser("create");
        alert("تم إنشاء المستخدم بنجاح");
      }

      await onSaved?.();
      handleClose();
    } catch (error: any) {
      alert(error.message || "حدث خطأ أثناء حفظ المستخدم");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl"
        dir="rtl"
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold">
            {isEditMode ? "تعديل المستخدم" : "إضافة مستخدم جديد"}
          </h2>

          <button
            type="button"
            onClick={handleClose}
            disabled={saving}
            className="rounded-lg bg-red-100 px-3 py-2 text-red-700 disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="rounded-xl border p-3"
            placeholder="الاسم الكامل"
            disabled={saving}
          />

          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="rounded-xl border p-3"
            placeholder="اسم المستخدم"
            disabled={saving}
          />

          <input
            value={username.trim() ? `${username.trim().toLowerCase()}@mood.local` : ""}
            readOnly
            type="email"
            className="rounded-xl border bg-gray-50 p-3 text-gray-500"
            placeholder="بريد الدخول يُنشأ تلقائيًا"
            title="بريد تسجيل الدخول يُنشأ تلقائيًا من اسم المستخدم"
          />

          {!isEditMode && (
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              className="rounded-xl border p-3"
              placeholder="كلمة المرور"
              disabled={saving}
            />
          )}

          <select
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
            className="rounded-xl border p-3"
            disabled={loadingLists || saving}
          >
            <option value="">اختر الدور</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>

          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="rounded-xl border p-3"
            disabled={loadingLists || saving}
          >
            <option value="">اختر الفرع</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-2 rounded-xl border p-3">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              disabled={saving || editingUser?.is_owner}
            />
            المستخدم نشط
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={saving}
            className="rounded-xl border px-5 py-3 disabled:opacity-50"
          >
            إلغاء
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loadingLists}
            className="rounded-xl bg-emerald-700 px-6 py-3 font-semibold text-white disabled:opacity-50"
          >
            {saving
              ? "جاري الحفظ..."
              : isEditMode
                ? "حفظ التعديل"
                : "حفظ المستخدم"}
          </button>
        </div>
      </div>
    </div>
  );
}