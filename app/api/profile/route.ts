import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const profileSchema = z.object({
  currency: z.enum(["USD", "VES"]).optional(),
  privacy_mode: z.boolean().optional(),
}).refine(value => Object.keys(value).length > 0);

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Inicia sesión para guardar ajustes." }, { status: 401 });
  const parsed = profileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "El ajuste no es válido." }, { status: 400 });
  const { error } = await supabase.from("profiles").update(parsed.data).eq("id", user.id);
  if (error) return Response.json({ error: "No se pudo guardar el ajuste." }, { status: 400 });
  return Response.json({ saved: true });
}
