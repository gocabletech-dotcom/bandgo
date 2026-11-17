# BandGo

SaaS para agrupaciones musicales: booking, calendario, ensayos, giras, nómina por evento, cuadres y un portal para cada músico.
Corre en **Cloudflare** (un Worker + base D1 + archivos privados en R2). Mismo estilo que FoodPOS: JavaScript sin compilar.

## Cómo publicar (Windows)
Doble clic en **`tools/Publicar BandGo.bat`**. Hace todo: baja de GitHub, instala, corre las pruebas (si fallan, no publica),
crea la base `bandgo-db` y el bucket `bandgo-archivos` la primera vez, respalda, migra, publica y crea la llave de cifrado.
Al final abre la página: la primera vez pide crear el usuario de la plataforma.

## Qué hay (v0.1 · Fases 0 y 1)
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

## Lo que sigue
Fase 3 finanzas, nómina y cuadres · Fase 4 giras y viajes ·
Fase 5 rider · Fase 6 reportes · Fase 7 comunicados y chat. La red interna con fotos (muro) queda en pausa hasta nuevo aviso.

Detalles técnicos: `docs/TECNICO.md`.
