import { useBranch } from "../../context/BranchContext";

export default function BranchSelector() {
  const {
    branches,
    selectedBranchId,
    setSelectedBranchId,
    canViewAllBranches,
    selectedBranch,
    loading,
  } = useBranch();

  if (loading) {
    return <div className="rounded-xl bg-gray-100 px-3 py-2 text-sm font-bold">جاري تحميل الفرع...</div>;
  }

  if (!canViewAllBranches) {
    return (
      <div dir="rtl" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-800">
        🏢 {selectedBranch?.name || "الفرع المحدد"}
      </div>
    );
  }

  return (
    <label dir="rtl" className="flex items-center gap-2 rounded-xl border bg-white px-2 py-1 shadow-sm">
      <span className="hidden text-sm font-bold text-gray-600 sm:inline">عرض الفرع:</span>
      <select
        className="max-w-[180px] rounded-lg border-0 bg-transparent p-2 text-sm font-black outline-none"
        value={selectedBranchId}
        onChange={(event) => setSelectedBranchId(event.target.value)}
      >
        <option value="all">جميع الفروع</option>
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name} {branch.code ? `— ${branch.code}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
