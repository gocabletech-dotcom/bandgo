# BandGo

SaaS para agrupaciones musicales: booking, calendario, ensayos, giras, nómina por evento, cuadres y un portal para cada músico.
Corre en **Cloudflare** (un Worker + base D1 + archivos privados en R2). Mismo estilo que FoodPOS: JavaScript sin compilar.

## Cómo publicar (Windows)
Doble clic en **`tools/Publicar BandGo.bat`**. Hace todo: baja de GitHub, instala, corre las pruebas (si fallan, no publica),
crea la base `bandgo-db` y el bucket `bandgo-archivos` la primera vez, respalda, migra, publica y crea la llave de cifrado.
Al final abre la página: la primera vez pide crear el usuario de la plataforma.

## Qué hay (v0.7 · Fases 0 a 7)
- **Fase 0 · núcleo (copiado de FoodPOS):** login, registro con prueba de 15 días, «¿olvidó su contraseña?», dos pasos (obligatorio para la plataforma),
  frenos por conexión, Turnstile, avisos de seguridad, cifrado AES-GCM, bitácora, errores, Plataforma (empresas, planes, ajustes, errores),
  varias empresas por usuario, roles (dueño, admin, manager, booking, músico, sonidista, promotor) y permisos por acción que el dueño puede cambiar.
- **Fase 1 · personal:** bandas con logo, integrantes con foto, pasaportes y visas cifrados con alertas (180/90/60/30 días),
  datos de pago cifrados y enmascarados, invitaciones y portal del músico (inicio, documentos, pagos, perfil).

- **Fase 2 · agenda:** calendario mensual con filtros, eventos con expediente (código EVT-00001, estados, horarios, quién cubre cada cosa,
  equipo asignado, historial), motor de disponibilidad (bloqueos por empresa/país/banda/integrante, choques de horario, traslados entre países,
  excepción autorizada por el manager), clientes con historial, contratos con versiones y hoja para imprimir/PDF, ensayos (crear, repetir cada
  semana, repertorio, publicar y avisar por correo/WhatsApp, asistencia) y la agenda del músico con «Voy / Tal vez / No voy».
  El booking solo ve los montos de sus propios eventos.

- **Fase 3 · finanzas:** cobros por evento (anticipo y pago final, quién recibió, «entregado» y «el artista confirma que llegó»),
  gastos del evento por categoría y quién los cubre (lo que paga el cliente no resta), gastos generales con comprobante,
  multimoneda sin sumar monedas distintas (cada importe guarda su moneda, la tasa, la fecha y la fuente), tasas de cambio,
  nómina por presentación (sugerida desde el equipo, sustitutos, descuentos, pagos parciales PAG-00001, recibo 80 mm con WhatsApp,
  el músico confirma o reporta una diferencia desde su portal), comisiones fijas o por porcentaje (aprobar, pagar),
  y el cuadre: booking envía → manager revisa → artista aprueba o devuelve con observación; al aprobarse queda congelado,
  el evento pasa a «Liquidado» y cada versión guarda una huella. Reabrir exige un motivo y conserva la versión aprobada.

- **Fase 4 · giras y viajes:** giras (GIR-00001) que agrupan eventos y la delegación; traslados en avión, autobús, tren,
  vehículo privado o alquilado (salida y llegada con zona horaria, duración calculada, aerolínea, número, reserva, terminal,
  equipaje, asiento por pasajero y boleto adjunto); hoteles con huéspedes y habitación; actividades (para todos, solo técnicos
  o solo la oficina); itinerario consolidado por día, imprimible; alertas de pasaporte (6 meses), visa del país de destino y
  personas sin traslado u hotel; publicar y avisar a la delegación por correo y WhatsApp, y avisar los cambios posteriores;
  los costos pasan a los gastos del evento con un botón; los vuelos salen en el calendario; pestaña «Logística» en cada
  evento; y «Mi itinerario» en el portal del músico (no ve costos ni contactos privados).

- **Fase 5 · rider técnico:** riders por país (RD, EE. UU., Europa), generales y personalizados por evento (RID-00001);
  editor del plano del escenario en SVG (arrastrar con el dedo o el ratón, girar, duplicar, deshacer, medidas del escenario,
  batería, congas, timbales, teclado, amplificadores, micrófonos, DI, monitores, side fills, in-ear, tarimas, tomas, músicos);
  lista de canales (con «batería completa» y «crear canales desde el plano»), mezclas de monitor, requerimientos (consola,
  monitores, microfonía, DI y backline, energía, escenario, instrucciones) y contactos técnicos; se guarda solo mientras edita;
  versiones congeladas con nota, fecha, autor y huella; hoja para imprimir / PDF (cada descarga queda en la bitácora);
  pestaña «Técnico» en el evento (rider sugerido según el país, proveedor de sonido, técnico local, datos del escenario);
  y el portal del sonidista con sus eventos, horarios, contactos de sonido y la última versión del rider asignado.

- **Fase 6 · reportes:** ventas (por mes, año, booking, país, público/privado, banda, estado, cliente), cobrado y
  cuentas por cobrar con antigüedad, gastos (por categoría, mes, evento; nómina y comisiones; viajes), rentabilidad
  (por evento, mes, año, país, booking, banda; mismo cálculo que el cuadre), presupuesto estimado frente a lo real,
  pagos a músicos (por músico, mes, método, estado; pendientes y parciales) y control de comprobantes y entregas.
  Filtros por fechas, país, moneda, banda, booking, cliente, estado y tipo. Cada moneda por separado y, si se pide,
  consolidado en la moneda base con la tasa registrada (y se muestra cuál). Gráfico por moneda, exportación a Excel
  (.xlsx) y PDF; cada exportación queda en la bitácora. En la pestaña Finanzas del evento: presupuesto estimado.

- **Fase 7 · comunicados y chat:** comunicados oficiales a todos, una banda, el equipo de un evento, la delegación de una
  gira o personas escogidas (urgente, fijado, adjunto, «Enterado»), con quién leyó y quién confirmó, recordatorio a los
  que faltan por correo y WhatsApp, y retiro con constancia. Chat por banda (se crean solos), por evento y por gira
  (botón en su ficha), directos y grupos; fotos y PDF, responder citando, editar 15 minutos, borrar (la oficina puede
  ocultar con constancia en la bitácora), canales «solo la oficina escribe» y archivados; insignias de no leídos.
  En el portal, la pestaña «Mensajes» (Avisos y Chat); «Mis documentos» pasó a Perfil.

## Lo que sigue

La red interna con fotos (muro) queda en pausa hasta nuevo aviso. Opcional: chat en tiempo real con Durable Objects
(versión SQLite, disponible en el plan gratis de Workers con límites diarios); hoy se actualiza consultando cada 4 segundos.
