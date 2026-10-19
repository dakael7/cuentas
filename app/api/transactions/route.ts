import { z } from "zod";
import { caracasDate, fetchOfficialRate } from "@/lib/fx/fetchBcv";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { getSupabaseUrl } from "@/lib/supabase/url";

const schema = z.object({ happened_on: z.string().date(), amount_original: z.number().positive().max(99_999_999_999), currency: z.enum(["USD", "VES"]), category_id: z.string().uuid().optional(), note: z.string().max(500).optional(), payment_method: z.string().max(80).optional(), pay_source: z.enum(["Día 15", "Día 30", "Mitad y mitad", "Bono", "Cada quincena"]).optional(), rate_applied: z.number().positive().optional() });

export async function POST(request: Request) {
  const session = await createClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return Response.json({ error: "Inicia sesión para guardar movimientos." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Revisa los datos del movimiento." }, { status: 400 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return Response.json({ error: "El servidor aún no está configurado para guardar tasas." }, { status: 503 });
  const admin = createSupabaseClient<Database>(getSupabaseUrl(url), serviceKey, { auth: { persistSession: false } });
  const { data: existing } = await admin.from("exchange_rates").select("rate,rate_date").eq("currency", "USD").lte("rate_date", parsed.data.happened_on).order("rate_date", { ascending: false }).limit(1).maybeSingle();
  const rateApplied = parsed.data.rate_applied;
  const rateIsManual = Boolean(rateApplied);
  if (!rateApplied && (!existing || existing.rate_date !== parsed.data.happened_on) && parsed.data.happened_on === caracasDate()) {
    try {
      const quote = await fetchOfficialRate();
      await admin.from("exchange_rates").upsert({ rate_date: parsed.data.happened_on, currency: "USD", rate: quote.rate, source: quote.source, fetched_at: quote.fetchedAt }, { onConflict: "rate_date,currency" });
    } catch { return Response.json({ error: "No hay tasa para hoy. Añade una tasa manual desde Ajustes y vuelve a guardar." }, { status: 503 }); }
  }
  if (!rateApplied && !existing && parsed.data.happened_on !== caracasDate()) return Response.json({ error: "No hay tasa para la fecha; agrega una tasa manual desde Ajustes." }, { status: 400 });
  const { data, error } = await session.from("transactions").insert({ ...parsed.data, user_id: user.id, rate_applied: rateApplied ?? null, rate_is_manual: rateIsManual }).select().single();
  if (error) return Response.json({ error: "No se pudo guardar el movimiento. Comprueba que haya una tasa vigente para esa fecha." }, { status: 400 });
  return Response.json(data, { status: 201 });
}
