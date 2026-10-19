import { z } from "zod";
import { addMonths, addWeeks, format } from "date-fns";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  type: z.enum(["Personal", "Cashea"]),
  creditor: z.string().trim().max(100).optional(),
  total: z.number().positive(),
  initial: z.number().min(0),
  installments: z.number().int().min(1).max(120),
  firstDueDate: z.string().date(),
  frequency: z.enum(["quincenal", "mensual"]),
  currency: z.enum(["USD", "VES"]),
}).refine(value => value.initial < value.total, { path: ["initial"], message: "El inicial debe ser menor al total." });

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Inicia sesión para registrar la deuda." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Revisa los datos de la deuda." }, { status: 400 });
  const form = parsed.data;
  const balance = form.total - form.initial;
  const installment = Math.round(balance / form.installments * 100) / 100;
  const { error: categoryError } = await supabase.from("categories").upsert({ user_id: user.id, name: "Cuotas de deudas", group_name: "Deudas", archived: false }, { onConflict: "user_id,name" });
  if (categoryError) return Response.json({ error: "No se pudo preparar la categoría de deudas." }, { status: 400 });
  const { data: debt, error } = await supabase.from("debts").insert({
    user_id: user.id, name: form.name, creditor: form.creditor || (form.type === "Cashea" ? form.name : null), debt_type: form.type,
    total_amount: form.total, initial_amount: form.initial, installment, remaining_payments: form.installments,
    pay_source: form.frequency === "quincenal" ? "Cada quincena" : "Día 30", starts_on: form.firstDueDate, next_due_date: form.firstDueDate,
  }).select("id").single();
  if (error || !debt) return Response.json({ error: "No se pudo guardar la deuda." }, { status: 400 });
  const payments = Array.from({ length: form.installments }, (_, index) => {
    const due = form.frequency === "quincenal" ? addWeeks(new Date(`${form.firstDueDate}T12:00:00Z`), index * 2) : addMonths(new Date(`${form.firstDueDate}T12:00:00Z`), index);
    return { user_id: user.id, debt_id: debt.id, due_date: format(due, "yyyy-MM-dd"), amount: index === form.installments - 1 ? Math.round((balance - installment * (form.installments - 1)) * 100) / 100 : installment };
  });
  const { error: paymentError } = await supabase.from("debt_payments").insert(payments);
  if (paymentError) {
    await supabase.from("debts").delete().eq("id", debt.id);
    return Response.json({ error: "No se pudo crear el calendario de cuotas." }, { status: 400 });
  }
  return Response.json({ saved: true, debt_id: debt.id }, { status: 201 });
}
