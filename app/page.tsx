import { redirect } from "next/navigation";
import Dashboard, { type DashboardData } from "@/components/dashboard";
import { createClient } from "@/lib/supabase/server";

function caracasToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export default async function Home({ searchParams }: PageProps<"/">) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <main className="private-state"><h1>Falta conectar tu base de datos.</h1><p>Configura las variables de Supabase indicadas en el README y reinicia la aplicación.</p><a href="/login">Ir a iniciar sesión</a></main>;
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const today = caracasToday();
  const requestedMonth = Array.isArray(params.month) ? params.month[0] : params.month;
  const monthKey = requestedMonth && /^\d{4}-\d{2}$/.test(requestedMonth) ? requestedMonth : today.slice(0, 7);
  const month = `${monthKey}-01`;
  const [year, monthNumber] = monthKey.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const monthEnd = `${monthKey}-${String(lastDay).padStart(2, "0")}`;
  const [profileResult, monthResult, categoriesResult, transactionsResult, debtsResult, paymentsResult, rateResult] = await Promise.all([
    supabase.from("profiles").select("id,display_name,currency,bonus_day,privacy_mode").eq("id", user.id).maybeSingle(),
    supabase.from("budget_months").select("id,month,income_15,income_30,bonus_income,bonus_date,needs_target,wants_target,savings_target,debts_target").eq("user_id", user.id).eq("month", month).maybeSingle(),
    supabase.from("categories").select("id,name,group_name,archived").eq("user_id", user.id).eq("archived", false).order("name"),
    supabase.from("transactions").select("id,happened_on,amount_original,currency,rate_applied,rate_date,amount_usd,amount_ves,category_id,note,pay_source").eq("user_id", user.id).gte("happened_on", month).lte("happened_on", monthEnd).order("happened_on", { ascending: false }),
    supabase.from("debts").select("id,name,creditor,debt_type,total_amount,initial_amount,installment,remaining_payments,pay_source,next_due_date").eq("user_id", user.id).gt("remaining_payments", 0).order("next_due_date"),
    supabase.from("debt_payments").select("debt_id,due_date,amount,status").eq("user_id", user.id).gte("due_date", month).lte("due_date", monthEnd).order("due_date"),
    supabase.from("exchange_rates").select("rate_date,currency,rate,source,fetched_at").eq("currency", "USD").lte("rate_date", today).order("rate_date", { ascending: false }).limit(2),
  ]);
  const missing = [profileResult.error, monthResult.error, categoriesResult.error, transactionsResult.error, debtsResult.error, paymentsResult.error, rateResult.error].some(Boolean);
  const budgetItemsResult = monthResult.data
    ? await supabase.from("budget_items").select("id,category_id,amount,percent,pay_source").eq("user_id", user.id).eq("budget_month_id", monthResult.data.id)
    : { data: [], error: null };
  const categoryById = new Map((categoriesResult.data ?? []).map(category => [category.id, category]));
  const spentByCategory = new Map<string, number>();
  for (const transaction of transactionsResult.data ?? []) {
    if (!transaction.category_id) continue;
    const value = profileResult.data?.currency === "VES" ? transaction.amount_ves : transaction.amount_usd;
    spentByCategory.set(transaction.category_id, (spentByCategory.get(transaction.category_id) ?? 0) + Number(value ?? transaction.amount_original));
  }
  const budgetItems = (budgetItemsResult.data ?? []).map(item => ({
    id: item.id,
    categoryId: item.category_id,
    category: categoryById.get(item.category_id)?.name ?? "Categoría archivada",
    group: categoryById.get(item.category_id)?.group_name ?? "Necesidades",
    amount: Number(item.amount),
    percent: Number(item.percent),
    spent: Number(spentByCategory.get(item.category_id) ?? 0),
    paySource: item.pay_source,
  }));
  const debtCategory = (categoriesResult.data ?? []).find(category => category.group_name === "Deudas");
  const scheduledDebtAmount = (paymentsResult.data ?? []).filter(payment => payment.status === "pendiente").reduce((sum, payment) => sum + Number(payment.amount), 0);
  if (debtCategory) {
    const automaticItem = budgetItems.find(item => item.categoryId === debtCategory.id);
    if (automaticItem) automaticItem.amount = scheduledDebtAmount;
    else if (scheduledDebtAmount > 0) budgetItems.push({ id: `auto-${month}`, categoryId: debtCategory.id, category: debtCategory.name, group: "Deudas", amount: scheduledDebtAmount, percent: totalBudgetPercent(scheduledDebtAmount, monthResult.data), spent: 0, paySource: "Cada quincena" });
  }
  const data: DashboardData = {
    month: monthKey,
    today,
    email: user.email ?? "",
    displayName: profileResult.data?.display_name?.trim() || user.email?.split("@")[0] || "Personal",
    currency: profileResult.data?.currency === "VES" ? "VES" : "USD",
    privacyMode: profileResult.data?.privacy_mode ?? false,
    bonusDay: profileResult.data?.bonus_day ?? 7,
    budget: monthResult.data ? {
      income15: Number(monthResult.data.income_15),
      income30: Number(monthResult.data.income_30),
      bonusIncome: Number(monthResult.data.bonus_income),
      bonusDate: monthResult.data.bonus_date,
      targets: { Necesidades: Number(monthResult.data.needs_target), Deseos: Number(monthResult.data.wants_target), Ahorro: Number(monthResult.data.savings_target), Deudas: Number(monthResult.data.debts_target) },
    } : null,
    categories: (categoriesResult.data ?? []).map(item => ({ id: item.id, name: item.name, group: item.group_name })),
    budgetItems,
    transactions: (transactionsResult.data ?? []).map(item => ({ id: item.id, date: item.happened_on, amount: Number(item.amount_original), currency: item.currency === "USD" ? "USD" : "VES", amountUsd: item.amount_usd == null ? null : Number(item.amount_usd), amountVes: item.amount_ves == null ? null : Number(item.amount_ves), rate: item.rate_applied == null ? null : Number(item.rate_applied), rateDate: item.rate_date, category: item.category_id ? categoryById.get(item.category_id)?.name ?? "Sin categoría" : "Sin categoría", categoryId: item.category_id, note: item.note, source: item.pay_source })),
    debts: (debtsResult.data ?? []).map(item => ({ id: item.id, name: item.name, creditor: item.creditor, type: item.debt_type, total: Number(item.total_amount), initial: Number(item.initial_amount), installment: Number(item.installment), remainingPayments: item.remaining_payments, paySource: item.pay_source, nextDueDate: item.next_due_date, payments: (paymentsResult.data ?? []).filter(payment => payment.debt_id === item.id).map(payment => ({ date: payment.due_date, amount: Number(payment.amount), status: payment.status })) })),
    rate: rateResult.data?.[0] ? { date: rateResult.data[0].rate_date, value: Number(rateResult.data[0].rate), source: rateResult.data[0].source, fetchedAt: rateResult.data[0].fetched_at } : null,
    previousRate: rateResult.data?.[1] ? Number(rateResult.data[1].rate) : null,
    dataError: missing || Boolean(budgetItemsResult.error) ? "No se pudieron cargar algunas tablas. Ejecuta la migración Supabase y vuelve a cargar la página." : null,
  };
  return <Dashboard data={data} />;
}

function totalBudgetPercent(amount: number, budget: { income_15: number; income_30: number; bonus_income: number } | null) {
  const income = Number(budget?.income_15 ?? 0) + Number(budget?.income_30 ?? 0) + Number(budget?.bonus_income ?? 0);
  return income ? Math.round(amount / income * 10000) / 100 : 0;
}
