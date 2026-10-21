# Anversol Gym

Sistema web del gimnasio hecho con **React (Vite)** y **Supabase** (Postgres + Auth). Tiene tres partes:

- **`/`** · sitio público: planes, próximas clases, equipo, horarios y contacto.
- **`/admin`** · administración: socios, accesos, cuotas, caja, ventas, clases, rutinas, reportes, usuarios y auditoría.
- **`/socios`** · portal de socios: el socio entra con su DNI y ve su cuota, asistencia, racha, rutina, medidas y clases reservadas.

El sistema funciona en la nube: se usa desde cualquier PC, celular o tablet con Internet. **Sin Internet no se pueden registrar ingresos, cobros ni ventas.**

## Puesta en marcha

### 1. Crear el proyecto en Supabase

1. Crear un proyecto en [supabase.com](https://supabase.com).
2. **Authentication → Sign In / Providers → Email**: dejar Email habilitado y **desactivar “Confirm email”**. El personal entra con nombre de usuario; el sistema lo convierte en un email interno que no recibe correos.
3. **SQL Editor**: ejecutar, en orden, los archivos de [supabase/migrations/](supabase/migrations/): primero `20261021000000_init.sql` y después `20261021010000_realtime.sql`. (Con la CLI de Supabase también sirve `supabase db push`.)

**Tiempo real:** cualquier cambio (un cobro en otra PC, un ingreso en recepción o un dato editado en el Table Editor de Supabase) actualiza solas las pantallas abiertas del panel, el portal de socios y el sitio. Se transmite sólo un aviso con el nombre de la tabla que cambió; los datos se vuelven a pedir con los permisos del usuario.

### 2. Configurar y correr la aplicación

Se necesita Node.js 18 o superior.

```powershell
copy .env.example .env    # completar con Project Settings → API (URL y anon key)
npm install
npm run dev
```

Abrir `http://localhost:5173/admin`. La primera vez se crea el usuario **dueño**; se puede cargar datos de demostración para recorrer el sistema (dejarlo desactivado para empezar con datos reales).

La `anon key` es pública por diseño. **Nunca** pongas la `service_role key` en el `.env` ni en el código del frontend.

### 3. Publicar

Cualquier hosting estático sirve (Vercel, Netlify, Cloudflare Pages):

- Comando de build: `npm run build` · carpeta de salida: `dist`
- Variables de entorno: las mismas del `.env`
- Ya están incluidas las reglas para que `/admin` y `/socios` funcionen (`vercel.json` y `public/_redirects`).

## Cómo está armado

```
supabase/migrations/   esquema, reglas de negocio y permisos (SQL)
src/site/              sitio público
src/portal/            portal de socios
src/admin/             administración (páginas, modales, contexto)
src/lib/               cliente Supabase, formatos, CSV, imágenes, QR
src/styles/            estilos (los mismos de la versión anterior)
legacy/                versión anterior (Node + SQLite), sólo como referencia
```

**Seguridad:** todas las tablas tienen RLS activado y ninguna política, así que el navegador no puede leer ni escribir tablas directamente. Todo pasa por funciones SQL (`supabase.rpc(...)`) que verifican el rol del usuario, validan los datos y registran auditoría. Precios, descuentos, vencimientos, stock, caja y reglas de ingreso se calculan en la base, nunca en el navegador.

**Roles:** dueño, administrador, recepcionista, profesor y contador, con los mismos permisos que antes. Desactivar un usuario le corta el acceso en la siguiente operación.

**Personal nuevo:** se crea desde Configuración → Usuarios. El sistema registra una invitación y da de alta la cuenta en Supabase Auth; una cuenta creada sin invitación no tiene acceso a nada.

## Reglas que se mantienen

- Elegir un plan no equivale a cobrar: el socio se activa al registrar el pago.
- Las renovaciones anticipadas conservan los días ya pagados.
- Cobros, ventas y movimientos requieren la caja abierta; hay una sola caja compartida.
- Los ingresos rechazados quedan registrados pero no cuentan como asistencia; no se puede registrar dos veces al mismo socio dentro del gimnasio.
- Las ventas anuladas devuelven el stock y generan un movimiento compensatorio; nada financiero se borra.
- Importes en pesos enteros; fechas y horarios en hora de Argentina.

## Copias de seguridad

Supabase guarda los datos en sus servidores. Desde **Configuración → Copias de seguridad** se descarga un archivo JSON con todos los datos (incluye fotos y certificados) para guardarlo aparte. Contiene datos personales: guardalo en un lugar privado.

## Límites y cosas a tener en cuenta

- **Plan gratuito de Supabase:** el proyecto se pausa tras una semana sin uso y tiene límites de espacio. Para el uso diario de un gimnasio conviene revisar el plan.
- **Fotos y certificados** se guardan comprimidos dentro de la base (foto de socio ≈ 350 KB máx., certificados hasta 4 MB). Los certificados y las fotos de progreso se descargan sólo cuando se abren.
- **Portal de socios:** se entra sólo con el DNI (igual que antes), con límite de 10 intentos fallidos cada 15 minutos por conexión. Cualquiera que conozca un DNI puede ver la asistencia y la rutina de ese socio; no se muestran datos médicos, de contacto ni de pagos.
- **Cambiar la contraseña de otro usuario** (Configuración → Usuarios → Editar) actualiza directamente Supabase Auth desde SQL. Si tu proyecto no lo permite, el usuario puede cambiarla él mismo desde su perfil o se puede resetear desde el panel de Supabase.
- **`VITE_STAFF_EMAIL_DOMAIN`**: no cambiarlo después de crear usuarios, porque el inicio de sesión dejaría de encontrarlos.
- **Huella digital, WhatsApp automático, pagos online y facturación** siguen sin integrarse: WhatsApp abre borradores para enviar a mano y los medios de pago sólo documentan lo informado por el personal.
