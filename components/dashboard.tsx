"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { ArrowDownLeft, ArrowUpRight, Check, ChevronDown, CircleHelp, CreditCard, Download, Eye, EyeOff, FileSpreadsheet, Home, LogOut, Plus, Search, Settings2, ShieldCheck, Sparkles, Trash2, Wallet, X } from "lucide-react";
import { simulateCashea, type Group } from "@/lib/finance";
import { createClient as createSupabaseBrowserClient } from "@/lib/supabase/client";

export interface DashboardData {
  month: string;
  today: string;
  email: string;
  displayName: string;
  currency: "USD" | "VES";
  privacyMode: boolean;
  bonusDay: number;
  budget: null | { income15: number; income30: number; bonusIncome: number; bonusDate: string | null; targets: Record<Group, number> };
  categories: { id: string; name: string; group: string }[];
  budgetItems: { id: string; categoryId: string; category: string; group: string; amount: number; percent: number; spent: number; paySource: string }[];
  transactions: { id: string; date: string; amount: number; currency: "USD" | "VES"; amountUsd: number | null; amountVes: number | null; rate: number | null; rateDate: string | null; category: string; categoryId: string | null; note: string | null; source: string }[];
  debts: { id: string; name: string; creditor: string | null; type: string; total: number; initial: number; installment: number; remainingPayments: number; paySource: string; nextDueDate: string | null; payments: { date: string; amount: number; status: string }[] }[];
  rate: null | { date: string; value: number; source: string; fetchedAt: string };
  previousRate: number | null;
  dataError: string | null;
}

const groupStyles: Record<Group, { color: string; percent: number }> = {
  Necesidades: { color: "#81947b", percent: 45 },
  Deseos: { color: "#c08a49", percent: 25 },
  Ahorro: { color: "#8296a4", percent: 15 },
  Deudas: { color: "#92758b", percent: 15 },
};
const groups = Object.keys(groupStyles) as Group[];
const navItems = ["Resumen", "Presupuesto", "Gastos", "Deudas", "Simulador", "Reportes"];
const money = (value: number, currency: "USD" | "VES") => new Intl.NumberFormat("es-VE", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
const readableDate = (value: string) => new Intl.DateTimeFormat("es-VE", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
const frequencyCount = (source: string) => source === "Cada quincena" ? 2 : 1;

function navIcon(index: number, size = 17) {
  switch (index) {
    case 0: return <Home size={size}/>;
    case 1: return <Wallet size={size}/>;
    case 2: return <ArrowDownLeft size={size}/>;
    case 3: return <CreditCard size={size}/>;
    case 4: return <Sparkles size={size}/>;
    default: return <FileSpreadsheet size={size}/>;
  }
}

export default function Dashboard({ data }: { data: DashboardData }) {
  const router = useRouter();
  const [active, setActive] = useState("Resumen");
  const [hideAmounts, setHideAmounts] = useState(data.privacyMode);
  const [currency, setCurrency] = useState(data.currency);
  const [modal, setModal] = useState(false);
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [expenseCurrency, setExpenseCurrency] = useState<"USD" | "VES">(data.currency);
  const [busy, setBusy] = useState(false);
  const [savingBudget, setSavingBudget] = useState(false);
  const [income15, setIncome15] = useState(String(data.budget?.income15 ?? ""));
  const [income30, setIncome30] = useState(String(data.budget?.income30 ?? ""));
  const [bonusIncome, setBonusIncome] = useState(String(data.budget?.bonusIncome ?? ""));
  const [bonusDate, setBonusDate] = useState(data.budget?.bonusDate ?? "");
  const [budgetAmounts, setBudgetAmounts] = useState<Record<string, string>>(() => Object.fromEntries(data.categories.map(category => [category.id, String(data.budgetItems.find(item => item.categoryId === category.id)?.amount ?? "0")] )));
  const [rateInput, setRateInput] = useState("");
  const [purchase, setPurchase] = useState("");
  const [initialPercent, setInitialPercent] = useState(30);
  const [installments, setInstallments] = useState(6);
  const [conversionAmount, setConversionAmount] = useState("");
  const [conversionDate, setConversionDate] = useState(data.today);
  const [conversionResult, setConversionResult] = useState("");
  const [debtName, setDebtName] = useState("");
  const [debtTotal, setDebtTotal] = useState("");
  const [debtInitial, setDebtInitial] = useState("0");
  const [debtCount, setDebtCount] = useState("4");
  const [debtFirstDate, setDebtFirstDate] = useState(data.today);
  const [debtType, setDebtType] = useState<"Cashea" | "Personal">("Cashea");
  const [debtFrequency, setDebtFrequency] = useState<"quincenal" | "mensual">("quincenal");

  useEffect(() => { if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js").catch(() => undefined); }, []);
  useEffect(() => {
    if (data.rate?.date === data.today || data.dataError) return;
    let activeRequest = true;
    void fetch(`/api/fx?date=${data.today}`, { cache: "no-store" }).then(response => {
      if (response.ok && activeRequest) router.refresh();
    }).catch(() => undefined);
    return () => { activeRequest = false; };
  }, [data.rate?.date, data.today, data.dataError, router]);
  const totalIncome = data.budget ? data.budget.income15 + data.budget.income30 + data.budget.bonusIncome : 0;
  const totalSpent = data.transactions.reduce((sum, item) => sum + (currency === "VES" ? item.amountVes ?? 0 : item.amountUsd ?? 0), 0);
  const totalAssigned = data.budgetItems.reduce((sum, item) => sum + item.amount, 0);
  const remaining = totalIncome - totalSpent;
  const debtCommitment = data.debts.reduce((sum, debt) => sum + debt.installment * frequencyCount(debt.paySource), 0);
  const debtTarget = totalIncome * ((data.budget?.targets.Deudas ?? 15) / 100);
  const newDebtCapacity = Math.max(0, debtTarget - debtCommitment);
  const variableBudgetRemaining = data.budgetItems.filter(item => item.group === "Deseos").reduce((sum, item) => sum + item.amount - item.spent, 0);
  const daysLeft = Math.max(1, new Date(`${data.month}-01T12:00:00Z`).getUTCMonth() === new Date(`${data.today}T12:00:00Z`).getUTCMonth() ? new Date(Date.UTC(Number(data.month.slice(0, 4)), Number(data.month.slice(5, 7)), 0)).getUTCDate() - Number(data.today.slice(8, 10)) + 1 : 1);
  const dailyAvailable = Math.max(0, variableBudgetRemaining) / daysLeft;
  const simulation = useMemo(() => simulateCashea({ purchaseAmount: Number(purchase) || 0, downPaymentPercent: initialPercent, installments, installmentsPerMonth: 2, remainingMonthlyCash: Math.max(0, remaining), remainingDebtCapacity: newDebtCapacity, remainingPerPaycheck: Math.max(0, remaining / 2) }), [purchase, initialPercent, installments, remaining, newDebtCapacity]);
  const formatted = (value: number) => hideAmounts ? "••••" : money(value, currency);
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 3500); };
  const monthDate = `${data.month}-01`;
  const changeMonth = (value: string) => { if (/^\d{4}-\d{2}$/.test(value)) router.push(`/?month=${value}`); };
  const signOut = async () => { await createSupabaseBrowserClient().auth.signOut(); router.push("/login"); };
  const saveProfile = async (profile: { currency?: "USD" | "VES"; privacy_mode?: boolean }) => {
    const response = await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profile) });
    const result = await response.json();
    if (!response.ok) { notify(result.error ?? "No se pudo guardar el ajuste."); return false; }
    return true;
  };
  const deleteAccount = async () => {
    if (!window.confirm("¿Eliminar permanentemente tu cuenta y todos tus datos? Esta acción no se puede deshacer.")) return;
    const response = await fetch("/api/account", { method: "DELETE" });
    if (response.ok) { await createSupabaseBrowserClient().auth.signOut(); router.push("/login"); return; }
    notify("No se pudo eliminar la cuenta.");
  };

  const addExpense = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedAmount = Number(amount.replace(",", "."));
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return;
    setBusy(true);
    try {
      const response = await fetch("/api/transactions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ happened_on: data.today, amount_original: parsedAmount, currency: expenseCurrency, category_id: categoryId || undefined, note: "", pay_source: "Día 15" }) });
      const result = await response.json();
      if (!response.ok) { notify(result.error ?? "No se pudo guardar el movimiento."); return; }
      setAmount(""); setModal(false); router.refresh(); notify("Movimiento guardado en tu cuenta.");
    } catch { notify("No fue posible conectar con tu cuenta."); }
    finally { setBusy(false); }
  };

  const saveBudget = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingBudget(true);
    const parseMoney = (value: string) => Number(value.replace(",", ".")) || 0;
    const payload = {
      month: monthDate,
      income_15: parseMoney(income15), income_30: parseMoney(income30), bonus_income: parseMoney(bonusIncome), bonus_date: bonusDate || null,
      needs_target: data.budget?.targets.Necesidades ?? 45, wants_target: data.budget?.targets.Deseos ?? 25, savings_target: data.budget?.targets.Ahorro ?? 15, debts_target: data.budget?.targets.Deudas ?? 15,
      items: data.categories.map(category => ({ category_id: category.id, amount: parseMoney(budgetAmounts[category.id] ?? "0"), pay_source: data.budgetItems.find(item => item.categoryId === category.id)?.paySource ?? "Mitad y mitad" })),
    };
    try {
      const response = await fetch("/api/budget", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) { notify(result.error ?? "No se pudo guardar el presupuesto."); return; }
      router.refresh(); notify("Tu presupuesto quedó guardado.");
    } catch { notify("No fue posible conectar con tu cuenta."); }
    finally { setSavingBudget(false); }
  };

  const refreshRate = async () => {
    setBusy(true);
    try {
      const response = await fetch(`/api/fx?date=${data.today}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) { notify(result.error ?? "No se pudo actualizar la tasa."); return; }
      router.refresh(); notify("Tasa consultada: Bs " + Number(result.rate).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 6 }));
    } catch { notify("No se pudo conectar con las fuentes de tasa."); }
    finally { setBusy(false); }
  };

  const saveManualRate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = Number(rateInput.replace(",", "."));
    if (!(value > 0)) { notify("Introduce una tasa mayor que cero."); return; }
    let response = await fetch("/api/fx", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rate_date: data.today, rate: value }) });
    let result = await response.json();
    if (!response.ok && String(result.error).includes("Confirma") && window.confirm(`${result.error}\n\n¿Confirmas que esta tasa oficial la verificaste manualmente?`)) {
      response = await fetch("/api/fx", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rate_date: data.today, rate: value, confirm_outlier: true }) });
      result = await response.json();
    }
    if (!response.ok) { notify(result.error ?? "No se pudo guardar la tasa manual."); return; }
    setRateInput(""); router.refresh(); notify("Tasa manual guardada.");
  };

  const convert = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const response = await fetch(`/api/fx?date=${conversionDate}`, { cache: "no-store" });
    const quote = await response.json();
    if (!response.ok) { setConversionResult(quote.error ?? "No hay una tasa disponible."); return; }
    const input = Number(conversionAmount.replace(",", "."));
    if (!(input > 0)) { setConversionResult("Escribe un monto mayor que cero."); return; }
    setConversionResult(`${money(input, "VES")} ≈ ${money(input / Number(quote.rate), "USD")} · tasa ${Number(quote.rate).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 6 })} (${readableDate(quote.rate_date)})`);
  };

  const addDebt = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true);
    try {
      const response = await fetch("/api/debts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: debtName, type: debtType, total: Number(debtTotal), initial: Number(debtInitial), installments: Number(debtCount), firstDueDate: debtFirstDate, frequency: debtFrequency, currency }) });
      const result = await response.json();
      if (!response.ok) { notify(result.error ?? "No se pudo guardar la deuda."); return; }
      setDebtName(""); setDebtTotal(""); router.refresh(); notify("Deuda y calendario de cuotas guardados.");
    } catch { notify("No fue posible guardar la deuda."); }
    finally { setBusy(false); }
  };

  const transactionMatches = data.transactions.filter(item => `${item.category} ${item.note ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  const trend = [...data.transactions].reverse().map(item => ({ day: readableDate(item.date), value: currency === "VES" ? item.amountVes ?? 0 : item.amountUsd ?? 0 }));
  const monthLabel = new Intl.DateTimeFormat("es-VE", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${monthDate}T12:00:00Z`));
  const balanceForItem = (item: DashboardData["transactions"][number]) => currency === "VES" ? item.amountVes ?? 0 : item.amountUsd ?? 0;

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><Wallet size={19}/></span><span>Cuentas<span className="brand-dot">.</span></span></div>
      <div className="side-label">USO PERSONAL</div>
      <nav aria-label="Navegación principal">{navItems.map((item, index) => <button key={item} className={`nav-link ${active === item ? "selected" : ""}`} onClick={() => setActive(item)}><span className="nav-glyph">{navIcon(index)}</span>{item}</button>)}</nav>
      <div className="sidebar-spacer"/>
      <button className={`nav-link ${active === "Ajustes" ? "selected" : ""}`} onClick={() => setActive("Ajustes")}><Settings2 size={17}/> Ajustes</button>
      <div className="sidebar-profile"><span className="avatar">{data.displayName.slice(0, 1).toUpperCase()}</span><span><b>{data.displayName}</b><small>Espacio privado</small></span></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="mobile-brand"><span className="brand-mark"><Wallet size={18}/></span><b>Cuentas<span className="brand-dot">.</span></b></div><div className="breadcrumbs"><span>{data.displayName}</span><span className="crumb-sep">/</span><b>{active}</b></div><div className="top-actions"><button className="icon-button hide-mobile" aria-label="Buscar" onClick={() => document.getElementById("global-search")?.focus()}><Search size={18}/></button><input id="global-search" className="global-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar" aria-label="Buscar movimientos"/><button className="icon-button" aria-label={hideAmounts ? "Mostrar montos" : "Ocultar montos"} onClick={() => setHideAmounts(!hideAmounts)}>{hideAmounts ? <Eye size={18}/> : <EyeOff size={18}/>}</button><button className="icon-button" aria-label="Cerrar sesión" onClick={() => void signOut()}><LogOut size={17}/></button></div></header>
      <div className="content-wrap">
        <div className="page-heading"><div><div className="eyebrow">TU ESPACIO · {data.today}</div><h1>{active === "Resumen" ? `Hola, ${data.displayName}.` : active}</h1><p className="heading-sub">Tus datos privados, solo para ti.</p></div><label className="month-select">{monthLabel}<ChevronDown size={14}/><input aria-label="Elegir mes" type="month" value={data.month} onChange={event => changeMonth(event.target.value)}/></label></div>
        {data.dataError && <div className="private-error" role="alert">{data.dataError}</div>}
        {!data.budget && <section className="personal-welcome"><span className="eyebrow">PRIMERA CONFIGURACIÓN</span><h2>Este espacio es solo tuyo.</h2><p>No hay datos cargados para {monthLabel}. Añade tus cobros y asignaciones en Presupuesto, o registra un movimiento. Aquí no mostramos cifras de ejemplo.</p><button className="primary-button" onClick={() => setActive("Presupuesto")}>Configurar este mes <span>→</span></button></section>}
        {active === "Resumen" && <>
          <section className="income-grid" aria-label="Cobros del mes">
            <article className="income-card primary-income"><div className="card-topline"><span>INGRESOS CONFIGURADOS</span><span className="income-icon"><ArrowDownLeft size={16}/></span></div><div className="income-amount">{formatted(totalIncome)}</div><div className="income-foot"><span>{data.budget ? "Según los cobros de este mes" : "Aún sin configurar"}</span></div></article>
            <article className="pay-card"><div className="pay-label"><span className="pay-dot dot-sage"/>Día 15</div><strong>{formatted(data.budget?.income15 ?? 0)}</strong><div className="pay-detail">Cobro configurado</div></article>
            <article className="pay-card"><div className="pay-label"><span className="pay-dot dot-blue"/>Día 30</div><strong>{formatted(data.budget?.income30 ?? 0)}</strong><div className="pay-detail">Fin de mes, incluido febrero</div></article>
            <article className="pay-card bonus-card"><div className="pay-label"><span className="pay-dot dot-gold"/>Bono</div><strong>{formatted(data.budget?.bonusIncome ?? 0)}</strong><div className="pay-detail">{data.budget?.bonusDate ? `Fecha ${readableDate(data.budget.bonusDate)}` : `Día habitual ${data.bonusDay}`}</div></article>
          </section>
          <section className="overview-grid"><article className="panel spending-panel"><div className="panel-heading"><div><span className="eyebrow">DATOS DE {monthLabel.toLocaleUpperCase()}</span><h2>Presupuesto por grupo</h2></div><button className="quiet-button" onClick={() => setActive("Presupuesto")}>Editar <span>↗</span></button></div>
            <div className="real-summary"><div><span>Asignado</span><b>{formatted(totalAssigned)}</b></div><div><span>Gastado</span><b>{formatted(totalSpent)}</b></div><div><span>Sin asignar</span><b>{formatted(totalIncome - totalAssigned)}</b></div></div>
            <div className="group-list real-group-list">{groups.map(group => { const items = data.budgetItems.filter(item => item.group === group); const assigned = items.reduce((sum, item) => sum + item.amount, 0); const spent = items.reduce((sum, item) => sum + item.spent, 0); const target = data.budget?.targets[group] ?? groupStyles[group].percent; return <div className="group-row" key={group}><span className="group-dot" style={{ background: groupStyles[group].color }}/><span className="group-name">{group}<small>Meta {target}% · {formatted(totalIncome * target / 100)}</small></span><span className="group-numbers"><b>{formatted(assigned)}</b><small>gastado {formatted(spent)}</small></span><span className="group-status">{assigned ? `${Math.round(spent / assigned * 100)}%` : "—"}</span></div>; })}</div>
            {data.budgetItems.length === 0 && <p className="empty-inline">Aún no has asignado montos a categorías.</p>}
          </article>
          <article className="panel cash-panel"><div className="panel-heading"><div><span className="eyebrow">MOVIMIENTOS REGISTRADOS</span><h2>Tu saldo del mes</h2></div><button className="more-button" onClick={() => setActive("Gastos")} aria-label="Ver movimientos">···</button></div><div className="cash-balance">{formatted(remaining)}<span>{remaining < 0 ? "por cubrir" : "ingresos menos gastos"}</span></div><div className="cash-caption">{data.transactions.length} movimientos guardados este mes</div><div className="chart-wrap">{trend.length > 0 ? <ResponsiveContainer width="100%" height="100%"><AreaChart data={trend} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}><defs><linearGradient id="cashFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#d97757" stopOpacity={0.18}/><stop offset="95%" stopColor="#d97757" stopOpacity={0}/></linearGradient></defs><CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 5"/><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 9 }}/><Tooltip formatter={value => [money(Number(value), currency), "Movimiento"]} contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, fontSize: 11 }}/><Area type="monotone" dataKey="value" stroke="#d97757" strokeWidth={2} fill="url(#cashFill)"/></AreaChart></ResponsiveContainer> : <div className="chart-empty">Cuando registres gastos, aquí verás el ritmo real del mes.</div>}</div></article></section>
          <section className="bottom-grid"><article className="panel transactions-panel"><div className="panel-heading"><div><span className="eyebrow">MOVIMIENTOS DE TU CUENTA</span><h2>Actividad reciente</h2></div><button className="quiet-button" onClick={() => setActive("Gastos")}>Ver todos <span>↗</span></button></div><div className="transaction-list">{data.transactions.slice(0, 5).map(item => <div className="transaction-row" key={item.id}><span className="transaction-icon green"><ArrowUpRight size={17}/></span><span className="transaction-title"><b>{item.note || item.category}</b><small>{item.category} · {readableDate(item.date)}</small></span><span className="transaction-value">−{formatted(balanceForItem(item))}<small>{item.currency} · {item.rate ? `tasa ${item.rate.toLocaleString("es-VE")}` : "sin tasa"}</small></span></div>)}</div>{data.transactions.length === 0 && <p className="empty-state">Todavía no hay movimientos para este mes.</p>}</article>
          <article className="panel today-panel"><span className="eyebrow">SEGÚN TUS ASIGNACIONES</span><div className="today-illustration"><div className="sun-shape"/><div className="plant-pot"><i/><i/><i/><b/></div></div><h2>Disponible en deseos</h2><div className="today-amount">{formatted(dailyAvailable)}<span>/ día</span></div><p>{data.budgetItems.some(item => item.group === "Deseos") ? `Calculado sobre el saldo de tus categorías variables y los ${daysLeft} días restantes.` : "Asigna un presupuesto a tus categorías para ver el disponible diario."}</p><button className="text-link" onClick={() => setActive("Presupuesto")}>Ver asignaciones <span>→</span></button></article></section>
          <section className="rate-strip"><div className="rate-symbol">Bs</div><div className="rate-info"><b>Tasa oficial USD → VES</b><span>{data.rate ? `Vigente ${readableDate(data.rate.date)} · ${data.rate.source.toUpperCase()}` : "Sin tasa guardada todavía"}</span></div><div className="rate-value"><b>{data.rate ? `Bs ${data.rate.value.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}` : "—"}</b><span>{data.rate && data.previousRate ? `${((data.rate.value / data.previousRate - 1) * 100).toFixed(2)}% vs. anterior` : ""}</span></div><button className="rate-convert" disabled={busy} onClick={() => void refreshRate()}>{busy ? "Consultando…" : "Consultar BCV"} <span>↻</span></button></section>
        </>}
        {active === "Presupuesto" && <section className="panel table-panel"><form onSubmit={saveBudget}><div className="panel-heading"><div><span className="eyebrow">{monthLabel.toLocaleUpperCase()}</span><h2>Tu presupuesto</h2><p className="panel-description">Guarda tus ingresos y asignaciones. Los montos pertenecen a tu cuenta.</p></div><button className="primary-button small-button" disabled={savingBudget}>{savingBudget ? "Guardando…" : "Guardar cambios"}</button></div><div className="income-form-grid"><label>Día 15<input type="number" min="0" step="0.01" inputMode="decimal" value={income15} onChange={event => setIncome15(event.target.value)}/></label><label>Día 30<input type="number" min="0" step="0.01" inputMode="decimal" value={income30} onChange={event => setIncome30(event.target.value)}/></label><label>Bono<input type="number" min="0" step="0.01" inputMode="decimal" value={bonusIncome} onChange={event => setBonusIncome(event.target.value)}/></label><label>Fecha del bono<input type="date" value={bonusDate} onChange={event => setBonusDate(event.target.value)}/></label></div><div className="table-scroll"><table><thead><tr><th>CATEGORÍA</th><th>GRUPO</th><th>META</th><th>ASIGNADO</th><th>GASTADO</th><th>QUEDA</th></tr></thead><tbody>{data.categories.map(category => { const item = data.budgetItems.find(row => row.categoryId === category.id); const amountValue = Number((budgetAmounts[category.id] ?? "0").replace(",", ".")) || 0; const editIncomeTotal = (Number(income15) || 0) + (Number(income30) || 0) + (Number(bonusIncome) || 0); const pct = editIncomeTotal > 0 ? amountValue / editIncomeTotal * 100 : 0; return <tr key={category.id}><td><b>{category.name}</b></td><td><span className="table-tag">{category.group}</span></td><td>{pct.toFixed(1)}%</td><td><input className="budget-number" aria-label={`Asignación para ${category.name}`} type="number" min="0" step="0.01" inputMode="decimal" value={budgetAmounts[category.id] ?? "0"} onChange={event => setBudgetAmounts(previous => ({ ...previous, [category.id]: event.target.value }))}/></td><td>{formatted(item?.spent ?? 0)}</td><td className={(item?.spent ?? 0) > amountValue ? "over-budget" : ""}>{formatted(amountValue - (item?.spent ?? 0))}</td></tr>; })}</tbody></table></div>{data.categories.length === 0 && <p className="empty-state">No hay categorías activas. Revisa que la migración esté ejecutada.</p>}<div className="table-footer">Ingreso del mes <b>{formatted(Number(income15 || 0) + Number(income30 || 0) + Number(bonusIncome || 0))}</b><span>Asignado <b>{formatted(data.categories.reduce((sum, category) => sum + (Number(budgetAmounts[category.id]) || 0), 0))}</b></span></div></form></section>}
        {active === "Gastos" && <section className="panel transactions-panel full-transactions"><div className="panel-heading"><div><span className="eyebrow">{monthLabel.toLocaleUpperCase()}</span><h2>Tus movimientos</h2></div><button className="primary-button small-button" onClick={() => { setCategoryId(data.categories[0]?.id ?? ""); setModal(true); }}><Plus size={15}/> Agregar movimiento</button></div><div className="transaction-list">{transactionMatches.map(item => <div className="transaction-row" key={item.id}><span className="transaction-icon green"><ArrowUpRight size={17}/></span><span className="transaction-title"><b>{item.note || item.category}</b><small>{item.category} · {readableDate(item.date)} · {item.source}</small></span><span className="transaction-value">−{formatted(balanceForItem(item))}<small>{item.currency}{item.rate ? ` · Bs ${item.amountVes?.toLocaleString("es-VE")} · tasa ${item.rate.toLocaleString("es-VE")}` : " · tasa no registrada"}</small></span></div>)}</div>{transactionMatches.length === 0 && <p className="empty-state">No hay movimientos que coincidan con este mes o búsqueda.</p>}</section>}
        {active === "Deudas" && <section className="debt-layout"><article className="panel simulator-panel"><span className="eyebrow">NUEVO COMPROMISO</span><h2>Registrar deuda</h2><form className="debt-form" onSubmit={addDebt}><label>Tipo<select value={debtType} onChange={event => setDebtType(event.target.value as "Cashea" | "Personal")}><option>Cashea</option><option>Personal</option></select></label><label>{debtType === "Cashea" ? "Nombre del comercio" : "Nombre o acreedor"}<input required maxLength={100} value={debtName} onChange={event => setDebtName(event.target.value)} placeholder={debtType === "Cashea" ? "Comercio" : "A quién debes"}/></label><div className="income-form-grid"><label>Monto total<input required type="number" min="0.01" step="0.01" value={debtTotal} onChange={event => setDebtTotal(event.target.value)}/></label><label>Monto inicial<input required type="number" min="0" step="0.01" value={debtInitial} onChange={event => setDebtInitial(event.target.value)}/></label><label>Número de cuotas<input required type="number" min="1" max="120" step="1" value={debtCount} onChange={event => setDebtCount(event.target.value)}/></label><label>Frecuencia<select value={debtFrequency} onChange={event => setDebtFrequency(event.target.value as "quincenal" | "mensual")}><option value="quincenal">Cada 15 días</option><option value="mensual">Mensual</option></select></label></div><label>Fecha del primer pago<input required type="date" value={debtFirstDate} onChange={event => setDebtFirstDate(event.target.value)}/></label><button className="primary-button" disabled={busy}>{busy ? "Guardando…" : "Guardar deuda"}</button></form></article><article className="panel transactions-panel"><div className="panel-heading"><div><span className="eyebrow">CUOTAS QUE RESERVAN TU DINERO</span><h2>Deudas activas</h2><p className="panel-description">Las cuotas con vencimiento este mes se apartan automáticamente en Presupuesto → Deudas.</p></div></div>{data.debts.length ? <div className="transaction-list">{data.debts.map(debt => <div className="debt-record" key={debt.id}><div className="transaction-row"><span className="transaction-icon blue"><CreditCard size={17}/></span><span className="transaction-title"><b>{debt.name}</b><small>{debt.type} · Total {formatted(debt.total)} · Inicial {formatted(debt.initial)} · {debt.remainingPayments} cuotas pendientes</small></span><span className="transaction-value">{formatted(debt.installment)}<small>{debt.paySource}</small></span></div><div className="debt-schedule">{debt.payments.map(payment => <span key={payment.date} className={payment.status === "pagada" ? "paid" : ""}>{readableDate(payment.date)} · {formatted(payment.amount)}</span>)}</div></div>)}</div> : <p className="empty-state">No hay deudas activas registradas.</p>}</article></section>}
        {active === "Simulador" && <section className="simulator-layout"><article className="panel simulator-panel"><div className="panel-heading"><div><span className="eyebrow">CÁLCULO CON TUS DATOS</span><h2>Simulador Cashea</h2><p className="panel-description">El resultado usa tus ingresos, gastos y compromisos registrados este mes.</p></div><span className="sim-icon"><Sparkles size={18}/></span></div><label className="field-label" htmlFor="purchase">Monto de compra</label><div className="amount-input"><span>{currency === "USD" ? "$" : "Bs"}</span><input id="purchase" type="number" min="0" step="0.01" inputMode="decimal" value={purchase} onChange={event => setPurchase(event.target.value)}/></div><div className="range-field"><div className="range-heading"><label htmlFor="initial">Pago inicial</label><b>{initialPercent}%</b></div><input id="initial" type="range" min="0" max="80" value={initialPercent} onChange={event => setInitialPercent(Number(event.target.value))}/></div><div className="range-field"><div className="range-heading"><label htmlFor="installments">Cuotas quincenales</label><b>{installments}</b></div><input id="installments" type="range" min="2" max="12" step="2" value={installments} onChange={event => setInstallments(Number(event.target.value))}/></div><div className="sim-breakdown"><div><span>Pago inicial</span><b>{formatted(simulation.downPayment)}</b></div><div><span>Cuota estimada</span><b>{formatted(simulation.installment)}</b></div><div><span>Impacto este mes</span><b>{formatted(simulation.monthImpact)}</b></div></div><p className="panel-description">Capacidad mensual disponible para nuevas cuotas: {formatted(newDebtCapacity)}.</p></article><article className={`panel verdict-panel verdict-${simulation.verdict}`}><div className="verdict-icon">{simulation.verdict === "yes" ? <Check size={20}/> : <CircleHelp size={20}/>}</div><span className="eyebrow">RESULTADO APROXIMADO</span><h2>{!totalIncome ? "Configura tus ingresos primero." : simulation.verdict === "yes" ? "Cabe en tus números actuales." : simulation.verdict === "caution" ? "Supera tu meta de deudas." : "No cabe en tu saldo disponible."}</h2><p>Cuota mensual nueva: <b>{formatted(simulation.newMonthlyPayment)}</b><span>Disponible para cuotas: {formatted(newDebtCapacity)}/mes</span></p><div className="verdict-foot"><ShieldCheck size={15}/> Es una estimación basada solo en la información que has guardado.</div></article></section>}
        {active === "Reportes" && <section className="report-layout"><article className="panel report-preview"><div className="panel-heading"><div><span className="eyebrow">INFORME DE TU CUENTA</span><h2>{monthLabel}</h2></div><span className="report-mark"><FileSpreadsheet size={18}/></span></div><p className="panel-description">Resumen de los movimientos y presupuestos que guardaste.</p><div className="report-kpis"><div><span>INGRESOS</span><b>{formatted(totalIncome)}</b></div><div><span>MOVIMIENTOS</span><b>{data.transactions.length}</b></div><div><span>GASTADO</span><b>{formatted(totalSpent)}</b></div></div><div className="report-bars">{groups.map(group => { const groupItems = data.budgetItems.filter(item => item.group === group); const budget = groupItems.reduce((sum, item) => sum + item.amount, 0); const spent = groupItems.reduce((sum, item) => sum + item.spent, 0); return <div key={group}><span>{group}</span><i><b style={{ width: `${budget ? Math.min(100, spent / budget * 100) : 0}%`, background: groupStyles[group].color }}/></i><small>{budget ? `${Math.round(spent / budget * 100)}%` : "—"}</small></div>; })}</div><div className="report-actions"><a className="primary-button" href={`/api/reports/export?format=xlsx&from=${monthDate}&to=${data.today}`}><Download size={16}/> Descargar Excel</a><a className="secondary-button" href={`/api/reports/export?format=pdf&from=${monthDate}&to=${data.today}`}><Download size={16}/> Descargar PDF</a></div></article><article className="panel convert-panel"><span className="eyebrow">CONVERSIÓN CON TASA GUARDADA</span><h2>Consulta por fecha.</h2><p className="panel-description">Usa la tasa registrada para esa fecha o la última tasa vigente anterior.</p><form onSubmit={convert}><label className="field-label" htmlFor="conversion-amount">Monto en bolívares</label><div className="amount-input"><span>Bs</span><input id="conversion-amount" type="number" min="0" step="0.01" inputMode="decimal" value={conversionAmount} onChange={event => setConversionAmount(event.target.value)}/></div><label className="field-label" htmlFor="conversion-date">Fecha</label><input id="conversion-date" className="date-input" type="date" value={conversionDate} onChange={event => setConversionDate(event.target.value)}/><button className="secondary-button convert-submit" type="submit">Consultar tasa</button></form>{conversionResult && <p className="conversion-result">{conversionResult}</p>}</article></section>}
        {active === "Ajustes" && <section className="panel settings-panel"><span className="eyebrow">DATOS Y PRIVACIDAD</span><h2>Ajustes personales</h2><div className="setting-row"><span><b>Moneda de visualización</b><small>Los movimientos mantienen su snapshot en USD y VES</small></span><button className="setting-control" onClick={() => { const next = currency === "USD" ? "VES" : "USD"; void saveProfile({ currency: next }).then(saved => { if (saved) { setCurrency(next); router.refresh(); } }); }}>{currency} <ChevronDown size={14}/></button></div><div className="setting-row"><span><b>Modo privacidad</b><small>Oculta los montos en esta vista</small></span><button className={`toggle ${hideAmounts ? "on" : ""}`} onClick={() => { const next = !hideAmounts; void saveProfile({ privacy_mode: next }).then(saved => { if (saved) setHideAmounts(next); }); }} aria-label="Cambiar modo privacidad"><i/></button></div><div className="setting-row"><span><b>Tasa manual de hoy</b><small>Solo si no se puede consultar el BCV</small></span><form className="manual-rate-form" onSubmit={saveManualRate}><input className="rate-edit" aria-label="Tasa manual USD a VES" placeholder="Bs por USD" type="number" min="0.000001" step="0.000001" value={rateInput} onChange={event => setRateInput(event.target.value)}/><button className="secondary-button">Guardar</button></form></div><div className="setting-row"><span><b>Copia de tus datos</b><small>Descarga los registros guardados en tu cuenta</small></span><a className="secondary-button" href="/api/account"><Download size={14}/> Exportar JSON</a></div><div className="setting-row"><span><b>Sesión</b><small>{data.email}</small></span><button className="secondary-button" onClick={() => void signOut()}><LogOut size={14}/> Cerrar sesión</button></div><div className="setting-row danger-setting"><span><b>Eliminar cuenta y datos</b><small>Eliminación permanente de tu cuenta</small></span><button className="danger-button" onClick={() => void deleteAccount()}><Trash2 size={14}/> Eliminar</button></div><div className="settings-note"><ShieldCheck size={17}/> Sesión protegida; las filas personales están aisladas mediante RLS.</div></section>}
        <footer className="footer-note"><span>Tu espacio personal. Sin planes ni anuncios.</span><span>Privado por diseño <ShieldCheck size={13}/></span></footer>
      </div>
    </main>
    <button className="floating-add" onClick={() => { setCategoryId(data.categories[0]?.id ?? ""); setModal(true); }} aria-label="Agregar movimiento"><Plus size={18}/><span>Gasto</span></button>
    <nav className="bottom-nav" aria-label="Navegación móvil">{["Resumen", "Presupuesto", "Gastos", "Deudas", "Simulador"].map((item, index) => <button key={item} className={active === item ? "active" : ""} onClick={() => setActive(item)}>{navIcon(index, 19)}<span>{item === "Simulador" ? "Cashea" : item}</span></button>)}</nav>
    <AnimatePresence>{modal && <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={event => { if (event.target === event.currentTarget) setModal(false); }}><motion.form className="expense-sheet" onSubmit={addExpense} initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}><div className="sheet-handle"/><div className="sheet-heading"><div><span className="eyebrow">MOVIMIENTO NUEVO</span><h2>Registrar un gasto</h2></div><button type="button" className="icon-button" onClick={() => setModal(false)} aria-label="Cerrar"><X size={19}/></button></div><label className="field-label" htmlFor="expense-amount">Monto</label><div className="amount-input"><select aria-label="Moneda del gasto" value={expenseCurrency} onChange={event => setExpenseCurrency(event.target.value as "USD" | "VES")}><option value="VES">Bs</option><option value="USD">$</option></select><input id="expense-amount" autoFocus required type="number" min="0.01" step="0.01" inputMode="decimal" placeholder="0,00" value={amount} onChange={event => setAmount(event.target.value)}/></div><label className="field-label" htmlFor="expense-category">Categoría</label><select id="expense-category" className="category-select" required value={categoryId} onChange={event => setCategoryId(event.target.value)}><option value="" disabled>Selecciona una categoría</option>{data.categories.map(category => <option value={category.id} key={category.id}>{category.name}</option>)}</select>{!data.categories.length && <p className="empty-inline">No tienes categorías activas para asignar.</p>}<button type="submit" disabled={busy || !data.categories.length} className="primary-button full-button">{busy ? "Guardando…" : "Guardar movimiento"} <span>→</span></button></motion.form></motion.div>}</AnimatePresence>
    <AnimatePresence>{toast && <motion.div className="toast" role="status" aria-live="polite" initial={{ y: 15, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 10, opacity: 0 }}><span className="toast-check"><Check size={14}/></span>{toast}<button onClick={() => setToast("")} aria-label="Cerrar aviso"><X size={15}/></button></motion.div>}</AnimatePresence>
  </div>;
}
