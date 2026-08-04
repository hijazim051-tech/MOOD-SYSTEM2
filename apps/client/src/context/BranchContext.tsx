import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "../lib/supabase";

export type Branch = {
  id: string;
  name: string;
  code: string;
  isActive: boolean;

  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;

  phone: string | null;
  whatsappNumber: string | null;
  email: string | null;
  address: string | null;

  invoicePrefix: string;
  currency: string;
  timezone: string;

  settings: BranchSettings | null;
};

export type BranchSettings = {
  id: string;
  branchId: string;

  invoiceTitle: string | null;
  invoiceFooter: string | null;
  invoiceLogoUrl: string | null;

  printerName: string | null;
  printCopies: number;

  autoPrintCustomerInvoice: boolean;
  autoPrintProductionInvoice: boolean;
  showPrintPreview: boolean;

  bankName: string | null;
  bankAccount: string | null;
  iban: string | null;

  whatsappReadyMessage: string | null;
  whatsappDriverMessage: string | null;
  whatsappDeliveredMessage: string | null;
};

type BranchContextValue = {
  branches: Branch[];
  selectedBranchId: string;
  effectiveBranchId: string | null;
  selectedBranch: Branch | null;

  canViewAllBranches: boolean;
  userBranchId: string | null;
  loading: boolean;
  error: string | null;

  setSelectedBranchId: (id: string) => void;
  refreshBranches: () => Promise<void>;
};

const BranchContext = createContext<BranchContextValue | null>(null);

type BranchProviderProps = {
  children: ReactNode;
  userRole: string;
  userBranchId: string | null;
  canViewAllBranches: boolean;
};

export function BranchProvider({
  children,
  userRole,
  userBranchId,
  canViewAllBranches,
}: BranchProviderProps) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const storageKey = `mood:selected-branch:${userRole}`;

  const [selectedBranchId, setSelectedBranchIdState] = useState(() => {
    if (!canViewAllBranches) {
      return userBranchId || "";
    }

    return localStorage.getItem(storageKey) || "all";
  });

  async function refreshBranches() {
    setLoading(true);
    setError(null);

    try {
      const [
        { data: branchesData, error: branchesError },
        { data: settingsData, error: settingsError },
      ] = await Promise.all([
        supabase
          .from("branches")
          .select(`
            id,
            name,
            code,
            is_active,
            logo_url,
            primary_color,
            secondary_color,
            phone,
            whatsapp_number,
            email,
            address,
            invoice_prefix,
            currency,
            timezone
          `)
          .eq("is_active", true)
          .order("name"),

        supabase
          .from("branch_settings")
          .select(`
            id,
            branch_id,
            invoice_title,
            invoice_footer,
            invoice_logo_url,
            printer_name,
            print_copies,
            auto_print_customer_invoice,
            auto_print_production_invoice,
            show_print_preview,
            bank_name,
            bank_account,
            iban,
            whatsapp_ready_message,
            whatsapp_driver_message,
            whatsapp_delivered_message
          `),
      ]);

      if (branchesError) {
        throw branchesError;
      }

      if (settingsError) {
        console.warn(
          "تعذر تحميل إعدادات الفروع:",
          settingsError.message
        );
      }

      const settingsMap = new Map<string, BranchSettings>();

      for (const row of settingsData || []) {
        settingsMap.set(String(row.branch_id), {
          id: String(row.id),
          branchId: String(row.branch_id),

          invoiceTitle: row.invoice_title || null,
          invoiceFooter: row.invoice_footer || null,
          invoiceLogoUrl: row.invoice_logo_url || null,

          printerName: row.printer_name || null,
          printCopies: Number(row.print_copies || 1),

          autoPrintCustomerInvoice:
            row.auto_print_customer_invoice !== false,
          autoPrintProductionInvoice:
            row.auto_print_production_invoice !== false,
          showPrintPreview: row.show_print_preview !== false,

          bankName: row.bank_name || null,
          bankAccount: row.bank_account || null,
          iban: row.iban || null,

          whatsappReadyMessage:
            row.whatsapp_ready_message || null,
          whatsappDriverMessage:
            row.whatsapp_driver_message || null,
          whatsappDeliveredMessage:
            row.whatsapp_delivered_message || null,
        });
      }

      const list: Branch[] = (branchesData || []).map((row) => {
        const branchId = String(row.id);

        return {
          id: branchId,
          name: String(row.name || "فرع"),
          code: String(row.code || ""),
          isActive: Boolean(row.is_active),

          logoUrl: row.logo_url || null,
          primaryColor: String(row.primary_color || "#16a34a"),
          secondaryColor: String(row.secondary_color || "#ffffff"),

          phone: row.phone || null,
          whatsappNumber: row.whatsapp_number || null,
          email: row.email || null,
          address: row.address || null,

          invoicePrefix: String(
            row.invoice_prefix || row.code || "BR"
          ),
          currency: String(row.currency || "LYD"),
          timezone: String(row.timezone || "Africa/Tripoli"),

          settings: settingsMap.get(branchId) || null,
        };
      });

      setBranches(list);

      if (!canViewAllBranches) {
        setSelectedBranchIdState(userBranchId || "");
        return;
      }

      const storedBranchId =
        localStorage.getItem(storageKey) || selectedBranchId;

      const isValidSelection =
        storedBranchId === "all" ||
        list.some((branch) => branch.id === storedBranchId);

      if (!isValidSelection) {
        setSelectedBranchIdState("all");
        localStorage.setItem(storageKey, "all");
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "تعذر تحميل بيانات الفروع";

      console.error("تعذر تحميل الفروع:", err);
      setError(message);
      setBranches([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userBranchId, canViewAllBranches]);

  function setSelectedBranchId(id: string) {
    const safeId = canViewAllBranches
      ? id
      : userBranchId || "";

    setSelectedBranchIdState(safeId);
    localStorage.setItem(storageKey, safeId);
  }

  const effectiveBranchId =
    selectedBranchId && selectedBranchId !== "all"
      ? selectedBranchId
      : canViewAllBranches
        ? null
        : userBranchId;

  const selectedBranch = useMemo(
    () =>
      branches.find(
        (branch) => branch.id === effectiveBranchId
      ) || null,
    [branches, effectiveBranchId]
  );

  /*
   * يطبق ألوان الفرع على كامل النظام تلقائيًا.
   * عند اختيار "كل الفروع" يستخدم ألوان MOOD الافتراضية.
   */
  useEffect(() => {
    const primaryColor =
      selectedBranch?.primaryColor || "#16a34a";

    const secondaryColor =
      selectedBranch?.secondaryColor || "#ffffff";

    document.documentElement.style.setProperty(
      "--branch-primary",
      primaryColor
    );

    document.documentElement.style.setProperty(
      "--branch-secondary",
      secondaryColor
    );

    document.documentElement.dataset.branchId =
      effectiveBranchId || "all";
  }, [selectedBranch, effectiveBranchId]);

  const value = useMemo<BranchContextValue>(
    () => ({
      branches,
      selectedBranchId,
      effectiveBranchId,
      selectedBranch,

      canViewAllBranches,
      userBranchId,
      loading,
      error,

      setSelectedBranchId,
      refreshBranches,
    }),
    [
      branches,
      selectedBranchId,
      effectiveBranchId,
      selectedBranch,
      canViewAllBranches,
      userBranchId,
      loading,
      error,
    ]
  );

  return (
    <BranchContext.Provider value={value}>
      {children}
    </BranchContext.Provider>
  );
}

export function useBranch() {
  const context = useContext(BranchContext);

  if (!context) {
    throw new Error(
      "useBranch must be used inside BranchProvider"
    );
  }

  return context;
}

/*
 * تستخدم مع جداول تحتوي على branch_id.
 *
 * مثال:
 * const query = applyBranchFilter(
 *   supabase.from("orders").select("*"),
 *   effectiveBranchId
 * );
 */
export function applyBranchFilter<
  T extends {
    eq: (column: string, value: string) => T;
  },
>(query: T, branchId: string | null) {
  return branchId
    ? query.eq("branch_id", branchId)
    : query;
}

/*
 * تستخدم عند إنشاء سجل جديد.
 *
 * مثال:
 * const payload = withBranchId(orderData, effectiveBranchId);
 */
export function withBranchId<T extends Record<string, unknown>>(
  data: T,
  branchId: string | null
): T & { branch_id?: string } {
  if (!branchId) {
    return data;
  }

  return {
    ...data,
    branch_id: branchId,
  };
}