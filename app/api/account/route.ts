import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { getSupabaseUrl } from "@/lib/supabase/url";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Inicia sesión para exportar tus datos." }, { status: 401 });
  const [profile, budgets, categories, items, transactions, debts, payments, simulations, goals] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("budget_months").select("*").eq("user_id", user.id),
    supabase.from("categories").select("*").eq("user_id", user.id),
    supabase.from("budget_items").select("*").eq("user_id", user.id),
    supabase.from("transactions").select("*").eq("user_id", user.id),
    supabase.from("debts").select("*").eq("user_id", user.id),
    supabase.from("debt_payments").select("*").eq("user_id", user.id),
    supabase.from("cashea_simulations").select("*").eq("user_id", user.id),
    supabase.from("savings_goals").select("*").eq("user_id", user.id),
  ]);
  const result = [profile, budgets, categories, items, transactions, debts, payments, simulations, goals];
  if (result.some((query) => query.error)) return Response.json({ error: "No se pudieron exportar todos tus datos." }, { status: 500 });
  const backup = { exported_at: new Date().toISOString(), account: { id: user.id, email: user.email }, profile: profile.data, budget_months: budgets.data, categories: categories.data, budget_items: items.data, transactions: transactions.data, debts: debts.data, debt_payments: payments.data, cashea_simulations: simulations.data, savings_goals: goals.data };
  return new Response(JSON.stringify(backup, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="cuentas_datos_${new Date().toISOString().slice(0, 10)}.json"`, "Cache-Control": "private, no-store" } });
}

export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Inicia sesión para eliminar tu cuenta." }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return Response.json({ error: "La eliminación requiere configuración del servidor." }, { status: 503 });
  // The service role is necessary only for Supabase Auth's admin.deleteUser; the caller is verified above.
  const admin = createAdminClient<Database>(getSupabaseUrl(url), serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return Response.json({ error: "No se pudo eliminar la cuenta." }, { status: 500 });
  return Response.json({ deleted: true });
}
