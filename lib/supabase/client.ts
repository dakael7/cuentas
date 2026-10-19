import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { getSupabaseUrl } from "./url";

export function createClient() {
  return createBrowserClient<Database>(getSupabaseUrl(), process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
