import { describe, expect, it } from "vitest";
import { amountFromPercent, estimateDebtPayoff, getPaydayDates, getRateForDate, monthClose, percentFromAmount, simulateCashea, splitBySource, transactionEquivalents, validateRate } from "./index";

describe("cálculos de presupuesto", () => {
  it("sincroniza porcentajes y montos con dos decimales", () => {
    expect(amountFromPercent(2000, 12.5)).toBe(250);
    expect(percentFromAmount(2000, 250)).toBe(12.5);
    expect(percentFromAmount(0, 10)).toBe(0);
  });
  it("reparte por cobro sin perder centavos", () => {
    expect(splitBySource(101, "Mitad y mitad")).toEqual({ "Día 15": 50.5, "Día 30": 50.5, Bono: 0 });
    expect(splitBySource(75.25, "Bono").Bono).toBe(75.25);
    expect(splitBySource(70, "Día 30")["Día 30"]).toBe(70);
  });
  it("calcula quincenas Cashea y dictamen con cuatro validaciones", () => {
    const outcome = simulateCashea({ purchaseAmount: 240, downPaymentPercent: 30, installments: 6, installmentsPerMonth: 2, remainingMonthlyCash: 420, remainingDebtCapacity: 122, remainingPerPaycheck: 190, availableCredit: 500 });
    expect(outcome.downPayment).toBe(72);
    expect(outcome.installment).toBe(28);
    expect(outcome.monthImpact).toBe(128);
    expect(outcome.verdict).toBe("yes");
    expect(Object.values(outcome.checks)).toEqual([true, true, true, true]);
    expect(simulateCashea({ purchaseAmount: 240, downPaymentPercent: 0, installments: 6, installmentsPerMonth: 2, remainingMonthlyCash: 0, remainingDebtCapacity: 0, remainingPerPaycheck: 0, availableCredit: 100 }).verdict).toBe("no");
  });
  it("calcula cierre mensual y liquidación", () => {
    expect(monthClose(2000, 1000, 200)).toEqual({ saved: 800, savingsRate: 40 });
    expect(estimateDebtPayoff(new Date("2026-10-19T00:00:00Z"), 6, "quincenal")?.toISOString().slice(0, 10)).toBe("2027-01-01");
  });
});

describe("fechas quincenales y tasas", () => {
  it("usa 28, 30 o 31 para la fecha de fin de mes", () => {
    expect(getPaydayDates(2024, 2).second.getDate()).toBe(29);
    expect(getPaydayDates(2026, 2).second.getDate()).toBe(28);
    expect(getPaydayDates(2026, 4).second.getDate()).toBe(30);
    expect(getPaydayDates(2026, 10).second.getDate()).toBe(31);
  });
  it("usa la última tasa anterior en fines de semana y feriados", () => {
    const rates = [{ rate_date: "2026-10-16", rate: 36.4 }, { rate_date: "2026-10-19", rate: 36.5 }];
    expect(getRateForDate(rates, "2026-10-17")?.rate).toBe(36.4);
    expect(getRateForDate(rates, "2026-10-18")?.rate).toBe(36.4);
    expect(getRateForDate(rates, "2026-10-19")?.rate).toBe(36.5);
  });
  it("rechaza fuentes caídas, tasas nulas y variaciones atípicas", () => {
    expect(validateRate(0)).toBe(false);
    expect(validateRate(Number.NaN)).toBe(false);
    expect(validateRate(50, 40)).toBe(false);
    expect(validateRate(40.5, 40)).toBe(true);
  });
  it("fija equivalentes USD/VES usando el snapshot histórico", () => {
    expect(transactionEquivalents(500, "VES", 36.5)).toEqual({ usd: 13.7, ves: 500 });
    expect(transactionEquivalents(10, "USD", 36.5)).toEqual({ usd: 10, ves: 365 });
  });
});
