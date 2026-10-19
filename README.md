# Cuentas

Cuentas es una aplicación web mobile-first para organizar un presupuesto personal quincenal, movimientos, compromisos, escenarios Cashea y el equivalente histórico USD/VES según la tasa del BCV. Usa Next.js 16 App Router, TypeScript, Supabase Auth/Postgres con RLS y funciones puras de finanzas.

## Requisitos

- Node.js 20.9 o superior y npm.
- Un proyecto Supabase (plan gratuito suficiente para comenzar).
- Para actualizar automáticamente la tasa diaria en producción: Vercel Cron. En el plan Hobby Vercel permite una ejecución diaria; mayor frecuencia requiere Pro o `pg_cron` en Supabase.

## Configuración paso a paso

### 1. Crear el proyecto Supabase

En [supabase.com/dashboard](https://supabase.com/dashboard), crea una organización si todavía no tienes una y selecciona **New project**. Elige nombre, contraseña de base de datos y región. Guarda la contraseña de la base de datos en tu gestor de contraseñas; Cuentas no la necesita en el frontend.

### 2. Copiar URL y clave pública

En tu proyecto abre **Project Settings → API** (en las versiones nuevas del dashboard, **Project Settings → API Keys**):

- Copia **Project URL** para `NEXT_PUBLIC_SUPABASE_URL`.
- Copia la clave pública **anon** / **publishable** para `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Para el servidor, copia la clave **service_role** / **secret** a `SUPABASE_SERVICE_ROLE_KEY`. No la pongas en un nombre `NEXT_PUBLIC_*`, no la compartas y no la envíes al navegador. Solo la usan las rutas de servidor para escribir la tabla compartida de tasas y eliminar una cuenta autenticada.

### 3. Crear las tablas y políticas

Abre **SQL Editor → New query**. Abre `supabase/migrations/0001_init.sql` en el repositorio, copia su contenido completo al editor y ejecuta **Run**. La migración es repetible e idempotente para el esquema definido. Comprueba en **Table Editor** que aparecen `profiles`, `budget_months`, `categories`, `budget_items`, `transactions`, `debts`, `debt_payments`, `cashea_simulations`, `savings_goals`, `exchange_rates` y `exchange_rate_alerts`.

Las tasas son compartidas entre usuarios: autenticados pueden leerlas, pero no escribirlas. El rol de servicio de las rutas API mantiene esa restricción. Las filas personales aplican RLS con `auth.uid()`. La función `get_rate(fecha)` usa la tasa USD más reciente igual o anterior a la fecha; los triggers fijan los equivalentes en el movimiento.

### 4. Configurar autenticación

En **Authentication → Providers → Email**, activa email y contraseña y deja habilitada la confirmación de correo. En **Authentication → URL Configuration** configura:

- **Site URL**: `http://localhost:3000` en local y la URL del sitio desplegado en producción.
- **Redirect URLs**: `http://localhost:3000/auth/callback`, `http://localhost:3000/**` y la URL de producción con las mismas rutas, por ejemplo `https://tu-dominio.com/auth/callback` y `https://tu-dominio.com/**`.

En **Authentication → Email Templates → Confirm signup**, personaliza el asunto y el cuerpo en español. Incluye el enlace `{{ .ConfirmationURL }}`. La app responde con mensajes genéricos en recuperar contraseña para no revelar si existe un correo.

### 5. Crear variables locales

Copia `.env.example` a `.env.local` y reemplaza los valores. Variables:

- `NEXT_PUBLIC_SUPABASE_URL`: URL del proyecto; pública.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: clave pública con acceso restringido por RLS.
- `NEXT_PUBLIC_SITE_URL`: URL de la app, localmente `http://localhost:3000`.
- `SUPABASE_SERVICE_ROLE_KEY`: secreto solo del servidor para altas de tasas compartidas y eliminación de cuenta. Nunca exponerlo al navegador.
- `CRON_SECRET`: valor aleatorio largo para autenticar el cron. No lo reutilices como contraseña.

Sin las variables públicas, la aplicación informa que falta configurar Supabase y no presenta cuentas, balances ni movimientos de muestra. Con Supabase, las rutas privadas redirigen a `/login` hasta autenticar.

### 6. Instalar y ejecutar

En la carpeta del proyecto ejecuta `npm install`, luego `npm run dev` y abre `http://localhost:3000`. La app usa el App Router, con sus componentes cliente solo en las interacciones. Para comprobar calidad, ejecuta `npm run lint`, `npm test` y `npx tsc --noEmit`.

### 7. Desplegar en Vercel

Importa el repositorio en [Vercel](https://vercel.com/new) y agrega las cinco variables del paso 5 en **Project → Settings → Environment Variables** para Preview y Production. Pon la URL desplegada en `NEXT_PUBLIC_SITE_URL`, Supabase Site URL y las Redirect URLs. Despliega. `vercel.json` programa `GET /api/cron/bcv` diariamente a las 14:00 UTC (10:00 en Caracas). Vercel adjunta `Authorization: Bearer $CRON_SECRET` para los cron jobs; comprueba que el secreto esté definido en producción. El servidor deriva el día vigente de `America/Caracas`, aunque la programación se ejecute en UTC.

El cron consulta primero el BCV y usa DolarApi oficial como respaldo. Si ambas fuentes difieren más de 1 %, conserva BCV y registra una alerta. Rechaza variaciones mayores a 20 % hasta que confirmes una tasa manual. También consulta la fuente en vivo bajo demanda cuando falta la tasa de hoy. Si el BCV no responde, la interfaz indica que el origen es DolarApi; no se presenta esa cotización como proveniente del BCV. Si ambas fuentes fallan, introduce manualmente la tasa verificada en **Ajustes → Tasa manual de hoy**. Las fechas pasadas solo usan tasas históricas guardadas; no se inventa ni se sustituye su valor por el de hoy.

### 8. Verificar que RLS separa usuarios

1. Registra usuario A y confirma su correo. Añade categorías y movimientos de prueba.
2. Abre una ventana privada, registra usuario B y añade sus propios datos.
3. Confirma que B no ve filas de A en la interfaz ni consultando tablas mediante la clave pública (anon) y el JWT de B. Las políticas requieren `auth.uid() = user_id`; `profiles` usa su PK `id`.
4. Confirma que un usuario autenticado puede leer tasas compartidas y que no puede insertar, modificar ni borrar `exchange_rates` desde el cliente.
5. Elimina las filas de prueba en sus propias cuentas desde la app cuando el módulo esté conectado. No pruebes políticas con la clave `service_role`: esa clave omite RLS.

## Funciones implementadas

- Interfaz personal, responsive, tema del sistema claro/oscuro, navegación móvil, dashboard conectado a la cuenta autenticada, privacidad visual, registro de gasto, presupuesto, movimientos y deudas propias, simulador Cashea e informes. Los valores ausentes se muestran como vacíos, nunca se rellenan con datos de muestra.
- Inicio de sesión, registro, recuperación de contraseña y callback de confirmación Supabase; proxy Next.js 16 refresca la sesión y restringe `/app`.
- Migración Supabase idempotente con datos de perfil y categorías iniciales, índices, validaciones, triggers, `get_rate`, RLS y snapshots de moneda.
- Cron BCV, respaldo DolarApi, tasa manual protegida, rutas de registro con validación y exportación de hojas XLSX y PDF autenticadas.
- PWA con manifest, icono SVG y service worker básico; Vitest para cálculos de presupuesto, fechas, cuotas Cashea y tasa diaria.

## Decisiones y límites conocidos

- Importes contables en Postgres son `numeric`; TypeScript recibe números JSON y realiza cálculos financieros con redondeo a dos decimales. Para conciliación precisa, no se usan floats persistidos en base de datos.
- La fuente pública del BCV no ofrece una API contractual. El extractor valida el valor y tiene DolarApi de respaldo, pero puede requerir ajuste si cambia el HTML.
- Las tasas de cambio y los snapshots requieren `SUPABASE_SERVICE_ROLE_KEY` del lado servidor; nunca se crea el cliente de servicio en componentes cliente.
- El dashboard carga desde Supabase el mes elegido, ingresos, categorías, asignaciones, gastos y deudas del usuario autenticado. Se puede editar el presupuesto, registrar gastos, cambiar moneda/privacidad y exportar datos personales. El editor de deudas, onboarding y la importación CSV aún no están construidos.
- La ruta PDF genera un PDF real con `@react-pdf/renderer`; las fórmulas vivas XLSX son de totales de movimientos. El comparativo de tasas actuales frente a snapshots y análisis anterior aún no forman parte del reporte.
- El objetivo de Lighthouse depende también de la conexión, las fuentes servidas por `next/font`, el despliegue y el estado de sesión; comprueba el sitio final en Lighthouse móvil.

## Variables y secretos

`.env.example` contiene las variables públicas requeridas y los dos secretos de servidor del módulo BCV. La clave `SUPABASE_SERVICE_ROLE_KEY` no debe aparecer en commits, repositorios públicos, código cliente o logs.
