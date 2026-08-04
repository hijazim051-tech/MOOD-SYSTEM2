import { useBranch } from "../../context/BranchContext";

export default function BranchScopeBanner() {
  const {
    effectiveBranchId,
    selectedBranch,
    canViewAllBranches,
    loading,
  } = useBranch();

  if (loading) {
    return (
      <div
        dir="rtl"
        className="border-b px-4 py-2 text-sm font-bold"
        style={{
          borderColor: "color-mix(in srgb, var(--branch-primary) 20%, white)",
          backgroundColor:
            "color-mix(in srgb, var(--branch-primary) 8%, white)",
          color: "var(--branch-primary)",
        }}
      >
        جاري تحميل بيانات الفرع...
      </div>
    );
  }

  const message = effectiveBranchId
    ? `البيانات المعروضة تخص: ${selectedBranch?.name || "الفرع المحدد"}`
    : canViewAllBranches
      ? "البيانات المعروضة مجمعة من جميع الفروع"
      : "يتم عرض بيانات فرعك فقط";

  return (
    <div
      dir="rtl"
      className="flex items-center justify-between gap-3 border-b px-4 py-2"
      style={{
        borderColor:
          "color-mix(in srgb, var(--branch-primary) 20%, white)",
        backgroundColor:
          "color-mix(in srgb, var(--branch-primary) 8%, white)",
      }}
    >
      <div className="flex min-w-0 items-center gap-3">
        {selectedBranch?.logoUrl ? (
          <img
            src={selectedBranch.logoUrl}
            alt={selectedBranch.name}
            className="h-9 w-9 shrink-0 rounded-lg border bg-white object-contain p-1"
          />
        ) : (
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-black text-white"
            style={{ backgroundColor: "var(--branch-primary)" }}
          >
            {selectedBranch?.name?.trim().charAt(0) || "M"}
          </div>
        )}

        <div className="min-w-0">
          <div
            className="truncate text-sm font-black"
            style={{ color: "var(--branch-primary)" }}
          >
            {effectiveBranchId
              ? selectedBranch?.name || "الفرع المحدد"
              : "جميع الفروع"}
          </div>

          <div className="truncate text-xs font-semibold text-slate-600">
            {message}
          </div>
        </div>
      </div>

      {selectedBranch?.code && (
        <span
          className="shrink-0 rounded-full px-3 py-1 text-xs font-black"
          style={{
            backgroundColor:
              "color-mix(in srgb, var(--branch-primary) 14%, white)",
            color: "var(--branch-primary)",
          }}
        >
          {selectedBranch.code}
        </span>
      )}
    </div>
  );
}