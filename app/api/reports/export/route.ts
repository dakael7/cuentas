import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { createElement } from "react";
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Inicia sesión para exportar tus datos." }, { status: 401 });
  const url = new URL(request.url);
  const format = url.searchParams.get("format");
  if (format !== "xlsx" && format !== "pdf") return Response.json({ error: "Formato no válido." }, { status: 400 });
  const start = url.searchParams.get("from") ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const end = url.searchParams.get("to") ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) return Response.json({ error: "Rango de fechas no válido." }, { status: 400 });
  const [{ data: transactions, error }, { data: debts }, { data: simulations }] = await Promise.all([
    supabase.from("transactions").select("happened_on,amount_original,currency,rate_applied,rate_date,amount_usd,amount_ves,rate_is_manual,note,pay_source").gte("happened_on", start).lte("happened_on", end).order("happened_on"),
    supabase.from("debts").select("name,debt_type,installment,remaining_payments,next_due_date,interest_rate"),
    supabase.from("cashea_simulations").select("purchase_amount,down_payment_percent,installments,created_at"),
  ]);
  if (error) return Response.json({ error: "No se pudieron leer tus movimientos." }, { status: 500 });
  const rows = transactions ?? [];
  const totalUsd = rows.reduce((sum, row) => sum + (row.amount_usd ?? 0), 0);
  const filename = `cuentas_${start}_a_${end}.${format}`;
  if (format === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Cuentas";
    const summary = workbook.addWorksheet("Resumen");
    summary.addRows([["Cuentas · Informe personal"], ["Periodo", `${start} a ${end}`], ["Movimientos", rows.length], ["Total USD", totalUsd], ["Total VES", rows.reduce((sum, row) => sum + (row.amount_ves ?? 0), 0)]]);
    summary.getRow(1).font = { bold: true, size: 16, color: { argb: "FF272622" } };
    summary.columns = [{ width: 30 }, { width: 26 }];
    const expenses = workbook.addWorksheet("Gastos");
    expenses.addRow(["Fecha", "Monto original", "Moneda", "Tasa aplicada", "Fecha de tasa", "Monto USD", "Monto VES", "Tasa manual", "Fuente", "Nota"]);
    rows.forEach(row => expenses.addRow([row.happened_on, row.amount_original, row.currency, row.rate_applied, row.rate_date, row.amount_usd, row.amount_ves, row.rate_is_manual ? "Sí" : "No", row.pay_source, row.note]));
    expenses.addRow(["TOTAL", { formula: `SUM(B2:B${rows.length + 1})` }, "", "", "", { formula: `SUM(F2:F${rows.length + 1})` }, { formula: `SUM(G2:G${rows.length + 1})` }]);
    const debtsSheet = workbook.addWorksheet("Deudas");
    debtsSheet.addRow(["Nombre", "Tipo", "Cuota", "Pagos restantes", "Próximo vencimiento", "Tasa"]);
    (debts ?? []).forEach(debt => debtsSheet.addRow([debt.name, debt.debt_type, debt.installment, debt.remaining_payments, debt.next_due_date, debt.interest_rate]));
    const saved = workbook.addWorksheet("Cashea");
    saved.addRow(["Fecha", "Compra", "Inicial %", "Cuotas"]);
    (simulations ?? []).forEach(item => saved.addRow([item.created_at, item.purchase_amount, item.down_payment_percent, item.installments]));
    for (const sheet of [expenses, debtsSheet, saved]) {
      sheet.views = [{ state: "frozen", ySplit: 1 }];
      sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF596B56" } };
      sheet.columns.forEach(column => { column.width = Math.max(14, Math.min(30, Math.max(...(column.values ?? []).map(value => String(value ?? "").length)) + 2)); });
      sheet.autoFilter = { from: "A1", to: `${String.fromCharCode(64 + sheet.columnCount)}1` };
    }
    for (const col of ["B", "F", "G"]) expenses.getColumn(col).numFmt = '#,##0.00';
    expenses.getColumn("D").numFmt = '#,##0.000000';
    const buffer = await workbook.xlsx.writeBuffer();
    return new Response(buffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store" } });
  }
  const styles = StyleSheet.create({ page: { padding: 38, fontFamily: "Helvetica", color: "#252521", fontSize: 9 }, title: { fontSize: 25, fontFamily: "Times-Roman", marginBottom: 8 }, sub: { color: "#77746b", marginBottom: 22 }, kpis: { flexDirection: "row", justifyContent: "space-between", padding: 12, backgroundColor: "#f4f2eb", marginBottom: 18 }, kpi: { fontSize: 14, marginTop: 5 }, heading: { flexDirection: "row", backgroundColor: "#596b56", color: "white", padding: 7, fontSize: 8 }, row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#e8e6dc", padding: 7, fontSize: 7 }, cellDate: { width: "15%" }, cellOriginal: { width: "20%" }, cellRate: { width: "19%" }, cellVes: { width: "15%" }, cellUsd: { width: "15%" }, cellNote: { width: "16%" }, footer: { marginTop: 20, color: "#817f76", fontSize: 8 } });
  const doc = createElement(Document, { title: "Informe Cuentas", author: "Cuentas" }, createElement(Page, { size: "A4", style: styles.page }, createElement(Text, { style: styles.title }, "Cuentas"), createElement(Text, { style: styles.sub }, `Informe personal · ${start} a ${end}`), createElement(View, { style: styles.kpis }, createElement(View, null, createElement(Text, null, "Movimientos"), createElement(Text, { style: styles.kpi }, String(rows.length))), createElement(View, null, createElement(Text, null, "Total USD"), createElement(Text, { style: styles.kpi }, `$ ${totalUsd.toFixed(2)}`)), createElement(View, null, createElement(Text, null, "Total VES"), createElement(Text, { style: styles.kpi }, `Bs ${rows.reduce((sum,row)=>sum+(row.amount_ves??0),0).toFixed(2)}`))), createElement(View, { style: styles.heading }, ...["Fecha", "Monto original", "Tasa aplicada", "Bs", "USD", "Nota"].map((label,i)=>createElement(Text,{key:label,style:[styles.cellDate,styles.cellOriginal,styles.cellRate,styles.cellVes,styles.cellUsd,styles.cellNote][i]},label))), ...rows.map((row,index)=>createElement(View,{key:`row-${index}`,style:styles.row},createElement(Text,{style:styles.cellDate},row.happened_on),createElement(Text,{style:styles.cellOriginal},`${Number(row.amount_original).toFixed(2)} ${row.currency}`),createElement(Text,{style:styles.cellRate},String(row.rate_applied??"—")),createElement(Text,{style:styles.cellVes},Number(row.amount_ves??0).toFixed(2)),createElement(Text,{style:styles.cellUsd},Number(row.amount_usd??0).toFixed(2)),createElement(Text,{style:styles.cellNote},row.note??""))),createElement(Text,{style:styles.footer},"Los equivalentes usan la tasa fijada en la fecha de cada movimiento.")));
  const pdfBuffer = await renderToBuffer(doc as Parameters<typeof renderToBuffer>[0]);
  return new Response(new Uint8Array(pdfBuffer), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store" } });
}
