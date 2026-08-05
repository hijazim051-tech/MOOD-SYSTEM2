import { supabase } from "./supabase";

export type Settings = {
  shop_name: string;
  phone: string;
  address: string;
  currency: string;

  logo_url: string;
  whatsapp: string;

  invoice_title: string;
  invoice_footer: string;
  invoice_prefix: string;
  invoice_show_logo: boolean;
  invoice_show_address: boolean;
  invoice_show_phone: boolean;
  invoice_show_customer_phone: boolean;
  invoice_show_notes: boolean;
  invoice_show_payment_method: boolean;
  invoice_paper_size: string;
  invoice_orientation: string;

  printer_name: string;
  print_copies: number;
  auto_print_customer_invoice: boolean;
  auto_print_production_invoice: boolean;
  show_print_preview: boolean;

  payment_cash_enabled: boolean;
  payment_card_enabled: boolean;
  payment_transfer_enabled: boolean;
  payment_deposit_enabled: boolean;
  payment_mixed_enabled: boolean;

  bank_name: string;
  bank_account_name: string;
  bank_account_number: string;
  bank_iban: string;
  bank_notes: string;

  delivery_enabled: boolean;
  default_delivery_fee: number;
  free_delivery_limit: number;
  delivery_note: string;
  require_delivery_address: boolean;
  require_delivery_phone: boolean;

  backup_enabled: boolean;
  backup_reminder_days: number;
  last_backup_at: string | null;

  system_version: string;
  system_name: string;

  branch_id?: string | null;
  branch_code?: string;
  primary_color?: string;
  secondary_color?: string;
};

export async function loadSettings(
  branchId?: string | null
): Promise<Settings> {
  const { data, error } = await supabase
    .from("settings")
    .select("*")
    .eq("id", 1)
    .single();

  if (error) throw error;

  const globalSettings = data as Settings;

  if (!branchId) {
    return globalSettings;
  }

  const [{ data: branch, error: branchError }, { data: branchSettings, error: branchSettingsError }] =
    await Promise.all([
      supabase
        .from("branches")
        .select(
          "id, code, name, logo_url, primary_color, secondary_color, phone, whatsapp_number, address, invoice_prefix, currency"
        )
        .eq("id", branchId)
        .maybeSingle(),
      supabase
        .from("branch_settings")
        .select("invoice_title, invoice_footer")
        .eq("branch_id", branchId)
        .maybeSingle(),
    ]);

  if (branchError) {
    console.warn("تعذر تحميل بيانات الفرع للفاتورة:", branchError);
    return globalSettings;
  }

  if (branchSettingsError) {
    console.warn(
      "تعذر تحميل إعدادات فاتورة الفرع:",
      branchSettingsError
    );
  }

  if (!branch) {
    return globalSettings;
  }

  const branchCode = String(branch.code || "").trim().toLowerCase();
  const isAlpha =
    branchCode === "alpha" ||
    String(branch.name || "").trim().toLowerCase() === "alpha";

  return {
    ...globalSettings,
    branch_id: branch.id,
    branch_code: branchCode,
    shop_name: String(branch.name || globalSettings.shop_name || "MOOD"),
    logo_url: String(branch.logo_url || ""),
    phone: String(branch.phone || ""),
    whatsapp: String(branch.whatsapp_number || ""),
    address: String(branch.address || ""),
    invoice_prefix: String(
      branch.invoice_prefix || globalSettings.invoice_prefix || "INV"
    ),
    currency: String(branch.currency || globalSettings.currency || "LYD"),
    invoice_title: String(
      branchSettings?.invoice_title ||
        (isAlpha ? "فاتورة مبيعات ALPHA" : globalSettings.invoice_title) ||
        "فاتورة مبيعات"
    ),
    invoice_footer: String(
      branchSettings?.invoice_footer ||
        (isAlpha
          ? "شكرًا لاختياركم ALPHA — نهتم بتفاصيل هديتكم"
          : globalSettings.invoice_footer) ||
        "شكرًا لاختياركم"
    ),
    primary_color: String(
      branch.primary_color || (isAlpha ? "#1d4ed8" : "#184b34")
    ),
    secondary_color: String(
      branch.secondary_color || (isAlpha ? "#dbeafe" : "#eef5f0")
    ),
  };
}

export async function saveSettings(values: Partial<Settings>) {
  const { error } = await supabase
    .from("settings")
    .update(values)
    .eq("id", 1);

  if (error) throw error;
}