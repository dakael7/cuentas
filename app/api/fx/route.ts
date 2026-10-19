import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { caracasDate, fetchOfficialRate } from "@/lib/fx/fetchBcv";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { getSupabaseUrl } from "@/lib/supabase/url";

const manualSchema = z.object({ rate_date: z.string().date(), rate: z.number().positive().max(1_000_000), confirm_outlier: z.boolean().optional() });

async function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("El servidor no está configurado para guardar tasas.");
  return createSupabaseClient<Database>(getSupabaseUrl(url), key, { auth: { persistSession: false } });
}

export async function GET(request: Request) {
  const session = await createClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return Response.json({ error: "Inicia sesión." }, { status: 401 });
  const date = new URL(request.url).searchParams.get("date") ?? caracasDate();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: "Fecha inválida." }, { status: 400 });
  try {
    const admin = await serviceClient();
    const { data: existing } = await admin.from("exchange_rates").select("rate_date,currency,rate,source,fetched_at").eq("currency", "USD").lte("rate_date", date).order("rate_date", { ascending: false }).limit(1).maybeSingle();
    if (date !== caracasDate() || existing?.rate_date === date || existing?.source === "manual") {
      if (existing) return Response.json(existing);
      return Response.json({ error: "No hay tasa guardada para esa fecha." }, { status: 404 });
    }
    const quote = await fetchOfficialRate(existing?.rate);
    const { data, error } = await admin.from("exchange_rates").upsert({ rate_date: date, currency: "USD", rate: quote.rate, source: quote.source, fetched_at: quote.fetchedAt }, { onConflict: "rate_date,currency" }).select().single();
    if (error) throw error;
    return Response.json(data);
  } catch { return Response.json({ error: "No fue posible consultar la tasa del BCV." }, { status: 502 }); }
}

export async function POST(request: Request) {
  const session = await createClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return Response.json({ error: "Inicia sesión." }, { status: 401 });
  const parsed = manualSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Indica una fecha y tasa válidas." }, { status: 400 });
  try {
    const admin = await serviceClient();
    const { data: previous } = await admin.from("exchange_rates").select("rate").lt("rate_date", parsed.data.rate_date).order("rate_date", { ascending: false }).limit(1).maybeSingle();
    if (previous?.rate && Math.abs(parsed.data.rate / previous.rate - 1) > 0.2 && !parsed.data.confirm_outlier) return Response.json({ error: "La tasa varía más de 20 % frente a la anterior. Confirma el valor para guardarlo manualmente." }, { status: 400 });
    const { data, error } = await admin.from("exchange_rates").upsert({ rate_date: parsed.data.rate_date, currency: "USD", rate: parsed.data.rate, source: "manual", fetched_at: new Date().toISOString() }, { onConflict: "rate_date,currency" }).select().single();
    if (error) throw error;
    return Response.json(data, { status: 201 });
  } catch { return Response.json({ error: "No se pudo guardar la tasa manual." }, { status: 500 }); }
}
