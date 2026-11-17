# BandGo · manual técnico

## Carpetas
| Archivo | Qué hay |
| --- | --- |
| `src/worker.js` | Entrada. `api()` resuelve la sesión (cookie `bg_session`), la empresa y el rol; empresa, usuarios, permisos, archivos R2, resumen y bitácora. |
| `src/nucleo.js` | Lo copiado de FoodPOS: utilidades, PBKDF2, revisión de contraseñas filtradas, cifrado AES-GCM (`BANDGO_LLAVE`), TOTP, Turnstile, correo (Resend), frenos, cabeceras, auditoría y errores. |
| `src/auth.js` | Setup, registro (código por correo si está activo), login + dos pasos, recuperar contraseña, invitaciones, cambio de clave, sesiones. |
| `src/permisos.js` | Roles, catálogo de permisos `recurso.acción` y los de fábrica. La empresa los cambia en `rol_permisos`. |
| `src/personal.js` | Fase 1: bandas, integrantes, documentos de viaje, datos de pago, invitaciones al portal y el portal del músico. |
| `src/agenda.js` | Fase 2: calendario, disponibilidad (`revisarAgenda`), bloqueos, clientes, eventos, contratos con versiones, ensayos y la agenda del portal. |
| `src/finanzas.js` | Fase 3: tasas (`tasaDe`), movimientos (cobros, gastos, nómina, comisiones), `calcularCuadre`, flujo del cuadre con versiones y huella, recibos y «mis pagos» del portal. |
| `src/plataforma.js` | Superadministrador: empresas, planes, ajustes, errores. |
| `migrations/` | `0001_nucleo.sql`, `0002_personal.sql`, `0003_agenda.sql`, `0004_finanzas.sql`. Nunca se edita una migración publicada: se agrega otra. |
| `public/app/` | La app: `app.js` (rutas `#/…`, oficina, portal, plataforma), `agenda.js` (pantallas de la Fase 2), `finanzas.js` (Fase 3), `app.css` (colores del logo). |
| `tools/pruebas.mjs` | Pruebas de punta a punta con una base local temporal (aislamiento, permisos, cifrado, portal, plataforma). |

## Reglas
- **Toda** consulta de datos de empresa lleva `empresa_id` y el permiso se revisa en el servidor.
- Dinero en **centavos enteros** (`*_c`). Monedas: USD, DOP, EUR. Las tasas se guardan como `tasa_e6` (tasa × 1 000 000). Nunca se suman monedas distintas: cada movimiento guarda su moneda original y, si difiere de la del evento, su conversión (`monto_evento_c`) con tasa, fecha y fuente.
- Un cuadre **aprobado** congela el evento: cobros, gastos, nómina y comisiones devuelven 409 hasta que se reabra. Cambiar algo en un cuadre «en revisión» o «con el artista» lo regresa a «abierto».
- Los movimientos no se borran: se **anulan** con motivo.
- Pasaportes, visas, cuentas bancarias y claves de terceros se guardan **cifrados**. Sin `BANDGO_LLAVE` no se guardan.
- Archivos (logos, fotos, documentos) en R2 **privado**; se sirven por `/api/archivo/…` revisando empresa y permiso.
- Cambios (POST/PUT/DELETE) exigen el encabezado `x-requested-with: bg`.
- **Nunca se prueba con datos de producción.**

## Probar en su computadora
```
npm install
node tools/pruebas.mjs
```
Para verla: `copy wrangler.ejemplo.jsonc wrangler.jsonc`, `npx wrangler d1 migrations apply bandgo-db --local`,
`npx wrangler dev --var BANDGO_LLAVE:una-llave-local-de-32-caracteres-o-mas` y abrir `http://localhost:8787/app/`.
