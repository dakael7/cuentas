export type Group = "Necesidades" | "Deseos" | "Ahorro" | "Deudas";
export type PaySource = "Día 15" | "Día 30" | "Mitad y mitad" | "Bono" | "Cada quincena";

export function amountFromPercent(income: number, percent: number): number {
  return roundMoney((income * percent) / 100);
}

export function percentFromAmount(income: number, amount: number): number {
  return income <= 0 ? 0 : Math.round((amount / income) * 10000) / 100;
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function splitBySource(amount: number, source: PaySource): Record<string, number> {
  if (source === "Mitad y mitad" || source === "Cada quincena") {
    const first = roundMoney(amount / 2);
    return { "Día 15": first, "Día 30": roundMoney(amount - first), Bono: 0 };
  }
  if (source === "Bono") return { "Día 15": 0, "Día 30": 0, Bono: roundMoney(amount) };
  return { "Día 15": source === "Día 15" ? roundMoney(amount) : 0, "Día 30": source === "Día 30" ? roundMoney(amount) : 0, Bono: 0 };
}

export function installmentsPerMonth(frequency: "quincenal" | "mensual" | "semanal" | "personalizada", custom = 2): number {
  if (frequency === "mensual") return 1;
  if (frequency === "semanal") return 4;
  if (frequency === "personalizada") return Math.max(0, custom);
  return 2;
}

export interface CasheaInput {
  purchaseAmount: number;
  downPaymentPercent: number;
  installments: number;
  installmentsPerMonth: number;
  availableCredit?: number;
  remainingMonthlyCash: number;
  remainingDebtCapacity: number;
  remainingPerPaycheck: number;
}

export interface CasheaResult {
  downPayment: number;
  financed: number;
  installment: number;
  monthImpact: number;
  newMonthlyPayment: number;
  availableForNewPayments: number;
  checks: { cash: boolean; debtCapacity: boolean; paycheck: boolean; credit: boolean };
  verdict: "yes" | "caution" | "no";
}

export function simulateCashea(input: CasheaInput): CasheaResult {
  const downPayment = roundMoney(input.purchaseAmount * input.downPaymentPercent / 100);
  const financed = roundMoney(input.purchaseAmount - downPayment);
  const installment = input.installments > 0 ? roundMoney(financed / input.installments) : 0;
  const monthInstallments = Math.min(input.installments, Math.max(0, input.installmentsPerMonth));
  const monthImpact = roundMoney(downPayment + installment * monthInstallments);
  const newMonthlyPayment = roundMoney(installment * input.installmentsPerMonth);
  const availableForNewPayments = roundMoney(Math.max(0, input.remainingDebtCapacity));
  const checks = {
    cash: monthImpact <= input.remainingMonthlyCash,
    debtCapacity: newMonthlyPayment <= availableForNewPayments,
    paycheck: installment <= input.remainingPerPaycheck,
    credit: input.availableCredit === undefined || financed <= input.availableCredit,
  };
  const allChecks = Object.values(checks).every(Boolean);
  const debtOnlyFailure = checks.cash && checks.paycheck && checks.credit && !checks.debtCapacity;
  return {
    downPayment,
    financed,
    installment,
    monthImpact,
    newMonthlyPayment,
    availableForNewPayments,
    checks,
    verdict: allChecks ? "yes" : debtOnlyFailure ? "caution" : "no",
  };
}

export function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function getPaydayDates(year: number, month: number): { first: Date; second: Date } {
  return { first: new Date(year, month - 1, 15), second: new Date(year, month - 1, lastDayOfMonth(year, month)) };
}

export function estimateDebtPayoff(start: Date, remainingPayments: number, frequency: "quincenal" | "mensual" = "mensual"): Date | null {
  if (remainingPayments <= 0) return null;
  const date = new Date(start);
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + Math.ceil(remainingPayments / (frequency === "quincenal" ? 2 : 1)));
  return date;
}

export function monthClose(income: number, expenses: number, debtPayments: number): { saved: number; savingsRate: number } {
  const saved = roundMoney(income - expenses - debtPayments);
  return { saved, savingsRate: income > 0 ? Math.round((saved / income) * 10000) / 100 : 0 };
}

export function getRateForDate<T extends { rate_date: string }>(rates: T[], date: string): T | undefined {
  return rates.filter((rate) => rate.rate_date <= date).sort((a, b) => b.rate_date.localeCompare(a.rate_date))[0];
}

export function validateRate(rate: number, previousRate?: number): boolean {
  if (!Number.isFinite(rate) || rate <= 0 || rate > 1000000) return false;
  if (previousRate && previousRate > 0 && Math.abs(rate / previousRate - 1) > 0.2) return false;
  return true;
}

export function transactionEquivalents(amount: number, currency: "USD" | "VES", rate: number): { usd: number; ves: number } {
  return currency === "USD"
    ? { usd: roundMoney(amount), ves: roundMoney(amount * rate) }
    : { usd: roundMoney(amount / rate), ves: roundMoney(amount) };
}
