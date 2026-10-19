import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { caracasDate, fetchOfficialRate } from "@/lib/fx/fetchBcv";
import type { Database } from "@/lib/supabase/database.types";
import { getSupabaseUrl } from "@/lib/supabase/url";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "No autorizado." }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return Response.json({ error: "Falta configurar el almacenamiento de tasas." }, { status: 503 });
  const supabase = createSupabaseClient<Database>(getSupabaseUrl(url), serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const rateDate = caracasDate();
  const { data: previous } = await supabase.from("exchange_rates").select("rate").eq("currency", "USD").lt("rate_date", rateDate).order("rate_date", { ascending: false }).limit(1).maybeSingle();
  try {
    const quote = await fetchOfficialRate(previous?.rate);
    const { error } = await supabase.from("exchange_rates").upsert({ rate_date: rateDate, currency: "USD", rate: quote.rate, source: quote.source, fetched_at: quote.fetchedAt }, { onConflict: "rate_date,currency" });
    if (error) throw error;
    if (quote.warning) await supabase.from("exchange_rate_alerts").insert({ rate_date: rateDate, message: quote.warning });
    return Response.json({ date: rateDate, ...quote });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo actualizar la tasa." }, { status: 502 });
  }
}
