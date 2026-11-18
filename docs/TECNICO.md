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
| `src/viajes.js` | Fase 4: giras, delegación, tramos, hoteles, actividades, `armarItinerario` (vista oficina y portal), `alertasViaje`, publicar y avisar cambios. `aUTC` convierte hora local + zona horaria. |
| `src/rider.js` | Fase 5: riders (borrador + versiones con huella), `limpiarDatos` (valida todo lo que manda el editor), `riderSugerido` por país, datos técnicos del evento y portal del sonidista. |
| `src/reportes.js` | Fase 6: 7 reportes con filtros, totales por moneda, consolidado con `tasaDe`, exportación .xlsx y presupuesto del evento. |
| `src/xlsx.js` | Escribe .xlsx sin librerías (ZIP sin compresión + XML de hoja). |
| `src/comunicacion.js` | Fase 7: comunicados (destinatarios congelados, lectura y «Enterado»), chat (acceso calculado por banda, evento, gira y miembros; mensajes, lecturas, moderación), `accesoAdjunto`. |
| `src/extras.js` | v0.8: `roles-info`, funciones con pago (`funciones_pago`), gastos guardados, acceso de clientes (invitar/quitar) y el portal del cliente (`cliente/…`: eventos, datos editables, flyer, contrato y firma con huella). `accesoArchivoCliente`. |
| `src/plataforma.js` | Superadministrador: empresas, planes, ajustes, errores. |
| `migrations/` | `0001_nucleo.sql`, `0002_personal.sql`, `0003_agenda.sql`, `0004_finanzas.sql`, `0005_viajes.sql`, `0006_rider.sql`, `0007_reportes.sql`, `0008_comunicacion.sql`, `0009_funciones_nomina_clientes.sql`. Nunca se edita una migración publicada: se agrega otra. |
| `public/app/` | La app: `app.js` (rutas `#/…`, oficina, portal, plataforma), `agenda.js` (pantallas de la Fase 2), `finanzas.js` (Fase 3), `viajes.js` (Fase 4), `rider.js` (Fase 5: editor SVG del plano), `reportes.js` (Fase 6), `mensajes.js` (Fase 7), `extras.js` (roles desplegables, funciones y gastos guardados, «Mi perfil de músico», portal del cliente), `app.css` (colores del logo). |
| `tools/pruebas.mjs` | Pruebas de punta a punta con una base local temporal (aislamiento, permisos, cifrado, portal, plataforma). |

## Reglas
- **Toda** consulta de datos de empresa lleva `empresa_id` y el permiso se revisa en el servidor.
- Dinero en **centavos enteros** (`*_c`). Monedas: USD, DOP, EUR. Las tasas se guardan como `tasa_e6` (tasa × 1 000 000). Nunca se suman monedas distintas: cada movimiento guarda su moneda original y, si difiere de la del evento, su conversión (`monto_evento_c`) con tasa, fecha y fuente.
- Un cuadre **aprobado** congela el evento: cobros, gastos, nómina y comisiones devuelven 409 hasta que se reabra. Cambiar algo en un cuadre «en revisión» o «con el artista» lo regresa a «abierto».
- Los movimientos no se borran: se **anulan** con motivo.
- Itinerario: el músico solo ve lo de una gira **publicada** y solo los tramos y hoteles donde va él. Lo que se cambie después de publicar queda en `itinerario_cambios` hasta que se avise.
- Rider: el sonidista y el PDF usan solo versiones guardadas, nunca el borrador. El plano se guarda en metros (x desde la izquierda, y desde el fondo del escenario; el público abajo).
- Reportes: no guardan cifras; se calculan cada vez desde movimientos, nómina, comisiones y el cálculo del cuadre. Gastos = base de caja (fecha del movimiento); rentabilidad = base devengada (como el cuadre).
- Chat: quién entra a un canal se calcula en cada consulta (banda_miembros, evento_asignaciones, viaje_personas, chat_miembros), así que al salir de una banda se pierde el acceso. Los adjuntos son archivos tipo `adjunto` y solo los usa quien los subió. Los mensajes borrados conservan el texto en la base (no se muestra).
- Boletos y reservas (archivos tipo `documento`) los abre quien tenga `viajes.ver` o el propio pasajero.
- Pasaportes, visas, cuentas bancarias y claves de terceros se guardan **cifrados**. Sin `BANDGO_LLAVE` no se guardan.
- Archivos (logos, fotos, documentos) en R2 **privado**; se sirven por `/api/archivo/…` revisando empresa y permiso.
- Cambios (POST/PUT/DELETE) exigen el encabezado `x-requested-with: bg`.
- Nómina: neto = acordado − descuento + `extras_c` (suma de los renglones del músico en `nomina_conceptos`). Los renglones «General» se pagan como gasto del evento (`movimientos.nomina_concepto_id`) y el cuadre no los cuenta dos veces. `armarNomina` es idempotente: funciones fijas del músico → renglón; funciones % y las de usuarios de oficina → `comisiones`.
- Direcciones: `estado_us` y `codigo_postal` solo se guardan si el país es Estados Unidos (estado de 2 letras, ZIP de 5 o 5-4 dígitos).
- Cliente (rol `cliente`): solo ve los eventos de su ficha (`clientes.usuario_id`); no puede cambiar nada si el evento está en cuadre, liquidado o cancelado; cada cambio queda en el historial. Firmar deja el contrato «firmado» y el evento «confirmado».
- **Nunca se prueba con datos de producción.**

## Probar en su computadora
```
npm install
node tools/pruebas.mjs
```
Para verla: `copy wrangler.ejemplo.jsonc wrangler.jsonc`, `npx wrangler d1 migrations apply bandgo-db --local`,
`npx wrangler dev --var BANDGO_LLAVE:una-llave-local-de-32-caracteres-o-mas` y abrir `http://localhost:8787/app/`.
