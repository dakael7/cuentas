import * as cheerio from "cheerio";

export type RateSource = "bcv" | "dolarapi";
export interface FetchedRate { rate: number; source: RateSource; fetchedAt: string; warning?: string }

async function fetchWithRetry(url: string, attempts = 3): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fetch(url, { signal: AbortSignal.timeout(10_000), headers: { "User-Agent": "Cuentas/1.0 (BCV rate reader)" }, cache: "no-store" });
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("No se pudo conectar con la fuente de tasa.");
}

function parseBcv(html: string): number | null {
  const $ = cheerio.load(html);
  const text = $("body").text().replace(/\s+/g, " ");
  const matches = [...text.matchAll(/(?:USD|\$|d[oó]lar)[^\d]{0,80}(\d{1,3}(?:\.\d{3})*,\d{2,6}|\d{1,3},\d{2,6}|\d{1,3}\.\d{2,6})/gi)];
  for (const match of matches) {
    const raw = match[1].replace(/\./g, "").replace(",", ".");
    const value = Number(raw);
    if (Number.isFinite(value) && value > 0 && value < 1_000_000) return value;
  }
  return null;
}

async function getBcvRate(): Promise<number> {
  const response = await fetchWithRetry("https://www.bcv.org.ve/");
  if (!response.ok) throw new Error(`BCV respondió ${response.status}.`);
  const rate = parseBcv(await response.text());
  if (!rate) throw new Error("No se encontró una tasa USD válida en la página del BCV.");
  return rate;
}

async function getDolarApiRate(): Promise<number> {
  const response = await fetchWithRetry("https://ve.dolarapi.com/v1/dolares/oficial");
  if (!response.ok) throw new Error(`DolarApi respondió ${response.status}.`);
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object" || !("promedio" in payload)) throw new Error("La respuesta de DolarApi no contiene promedio.");
  const rate = Number((payload as { promedio: unknown }).promedio);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("DolarApi devolvió una tasa inválida.");
  return rate;
}

export async function fetchOfficialRate(previousRate?: number): Promise<FetchedRate> {
  let bcvRate: number | undefined;
  let fallbackRate: number | undefined;
  let bcvError: unknown;
  try { bcvRate = await getBcvRate(); } catch (error) { bcvError = error; }
  try { fallbackRate = await getDolarApiRate(); } catch { /* La fuente primaria puede bastar. */ }
  const rate = bcvRate ?? fallbackRate;
  if (!rate) throw new Error(`No fue posible obtener la tasa del BCV ni de DolarApi: ${String(bcvError ?? "sin respuesta")}`);
  if (previousRate && Math.abs(rate / previousRate - 1) > 0.2) throw new Error("La variación supera 20 %; requiere confirmación manual.");
  const warning = bcvRate && fallbackRate && Math.abs(bcvRate / fallbackRate - 1) > 0.01
    ? `Diferencia superior a 1 %: BCV ${bcvRate}, respaldo ${fallbackRate}. Se conserva BCV.`
    : undefined;
  return { rate, source: bcvRate ? "bcv" : "dolarapi", fetchedAt: new Date().toISOString(), warning };
}

export function caracasDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
