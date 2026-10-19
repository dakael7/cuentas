export function getSupabaseUrl(value = process.env.NEXT_PUBLIC_SUPABASE_URL): string {
  if (!value) throw new Error("Falta NEXT_PUBLIC_SUPABASE_URL.");
  return value.trim().replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
}
