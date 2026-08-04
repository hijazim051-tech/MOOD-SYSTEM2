import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://eugxtbgeirvkfptqcmnp.supabase.co";

const supabaseAnonKey =
  "sb_publishable_sB7VZvaZ5hZ0-BEsSGwLyA_rNFUDCWu";

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey
);