import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}-01$/),
  income_15: z.number().min(0).max(99_999_999_999),
  income_30: z.number().min(0).max(99_999_999_999),
  bonus_income: z.number().min(0).max(99_999_999_999),
  bonus_date: z.string().date().nullable(),
  needs_target: z.number().min(0).max(100),
  wants_target: z.number().min(0).max(100),
  savings_target: z.number().min(0).max(100),
  debts_target: z.number().min(0).max(100),
  items: z.array(z.object({ category_id: z.string().uuid(), amount: z.number().min(0), pay_source: z.enum(["Día 15", "Día 30", "Mitad y mitad", "Bono"]) })).max(100),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Inicia sesión para guardar tu presupuesto." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Revisa los ingresos y las metas del presupuesto." }, { status: 400 });
  const { items, ...monthData } = parsed.data;
  const { data: month, error: monthError } = await supabase.from("budget_months").upsert({ ...monthData, user_id: user.id }, { onConflict: "user_id,month" }).select("id").single();
  if (monthError || !month) return Response.json({ error: "No se pudo guardar el mes." }, { status: 400 });
  if (items.length) {
    const totalIncome = monthData.income_15 + monthData.income_30 + monthData.bonus_income;
    const [startYear, startMonth] = monthData.month.slice(0, 7).split("-").map(Number);
    const lastDay = new Date(Date.UTC(startYear, startMonth, 0)).getUTCDate();
    const endDate = `${monthData.month.slice(0, 7)}-${String(lastDay).padStart(2, "0")}`;
    const { data: payments, error: paymentsError } = await supabase.from("debt_payments").select("amount").eq("user_id", user.id).eq("status", "pendiente").gte("due_date", monthData.month).lte("due_date", endDate);
    if (paymentsError) return Response.json({ error: "No se pudo calcular el presupuesto de cuotas." }, { status: 400 });
    const scheduledDebtAmount = (payments ?? []).reduce((sum, payment) => sum + Number(payment.amount), 0);
    const { data: debtCategory, error: categoryError } = await supabase.from("categories").upsert({ user_id: user.id, name: "Cuotas de deudas", group_name: "Deudas", archived: false }, { onConflict: "user_id,name" }).select("id").single();
    if (categoryError || !debtCategory) return Response.json({ error: "No se pudo preparar la categoría de deudas." }, { status: 400 });
    const customItems = items.filter(item => item.category_id !== debtCategory.id);
    const rows = customItems.map(item => ({ ...item, user_id: user.id, budget_month_id: month.id, percent: totalIncome > 0 ? Math.round(item.amount / totalIncome * 10000) / 100 : 0 }));
    rows.push({ category_id: debtCategory.id, user_id: user.id, budget_month_id: month.id, amount: scheduledDebtAmount, percent: totalIncome > 0 ? Math.round(scheduledDebtAmount / totalIncome * 10000) / 100 : 0, pay_source: "Cada quincena" as const });
    const { error } = await supabase.from("budget_items").upsert(rows, { onConflict: "budget_month_id,category_id" });
    if (error) return Response.json({ error: "El mes se guardó, pero no se pudieron guardar las asignaciones." }, { status: 400 });
  }
  return Response.json({ saved: true });
}
