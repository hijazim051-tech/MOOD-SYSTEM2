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
};

export async function loadSettings(): Promise<Settings> {
  const { data, error } = await supabase
    .from("settings")
    .select("*")
    .eq("id", 1)
    .single();

  if (error) throw error;

  return data as Settings;
}

export async function saveSettings(values: Partial<Settings>) {
  const { error } = await supabase
    .from("settings")
    .update(values)
    .eq("id", 1);

  if (error) throw error;
}