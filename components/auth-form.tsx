"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft, LockKeyhole, Wallet } from "lucide-react";
import Link from "next/link";

export default function AuthForm() {
  const [mode, setMode] = useState<"login"|"signup"|"reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setNotice("");
    try {
      const supabase = createClient();
      if (mode === "reset") {
        await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/callback?next=/login/cambiar` });
        setNotice("Si el correo está registrado, recibirás instrucciones para cambiar tu contraseña.");
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/app` } });
        if (error) throw error;
        setNotice("Revisa tu correo para confirmar la cuenta y empezar.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace("/app"); router.refresh();
      }
    } catch { setNotice("No se pudo completar la solicitud. Revisa los datos e inténtalo de nuevo."); }
    finally { setBusy(false); }
  };
  return <main className="auth-screen"><Link href="/" className="auth-back"><ArrowLeft size={16}/> Volver a Cuentas</Link><section className="auth-card"><Link href="/" className="auth-brand"><span className="brand-mark"><Wallet size={19}/></span><b>Cuentas<span className="brand-dot">.</span></b></Link><span className="eyebrow">UN ESPACIO PARA TU DINERO</span><h1>{mode==="login"?"Qué bueno verte.":mode==="signup"?"Empecemos con calma.":"Recupera el acceso."}</h1><p className="auth-description">{mode==="reset"?"Te enviaremos un enlace seguro si el correo está registrado.":"Tus finanzas, con un poco más de claridad y mucho menos ruido."}</p><form onSubmit={submit}><label htmlFor="email">Correo electrónico</label><input id="email" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="tu@correo.com"/><label htmlFor="password">Contraseña</label>{mode!=="reset"&&<input id="password" type="password" autoComplete={mode==="login"?"current-password":"new-password"} minLength={10} required value={password} onChange={e=>setPassword(e.target.value)} placeholder="Al menos 10 caracteres"/>}{mode==="login"&&<button type="button" className="forgot-link" onClick={()=>setMode("reset")}>¿Olvidaste tu contraseña?</button>}{notice&&<p className="auth-notice" role="status" aria-live="polite">{notice}</p>}<button className="primary-button auth-submit" type="submit" disabled={busy}>{busy?"Un momento…":mode==="login"?"Iniciar sesión":mode==="signup"?"Crear mi cuenta":"Enviar instrucciones"}</button></form><div className="auth-switch">{mode==="login"?<>¿Primera vez por aquí? <button onClick={()=>setMode("signup")}>Crear una cuenta</button></>:<>¿Ya tienes cuenta? <button onClick={()=>setMode("login")}>Iniciar sesión</button></>}</div><div className="auth-security"><LockKeyhole size={14}/> Tus datos están cifrados y solo tú puedes verlos.</div></section><footer className="auth-foot">Cuentas · Un presupuesto que se siente tuyo.</footer></main>;
}
