// BandGo · roles y permisos (recurso.acción). Se revisan en el servidor, en cada ruta: el menú solo los refleja.
// Cada empresa puede cambiar los de fábrica de un rol (tabla rol_permisos), excepto los del dueño.
export const ROLES = {
  dueno: 'Artista / propietario',
  admin: 'Administrador',
  manager: 'Manager',
  booking: 'Booking',
  musico: 'Músico',
  sonidista: 'Sonidista',
  promotor: 'Promotor',
};
export const ROLES_OFICINA = ['dueno', 'admin', 'manager', 'booking'];
export const ROLES_PORTAL = ['musico', 'sonidista'];
export const ROLES_2FA = ['dueno', 'admin', 'manager'];

export const PERMISOS_CAT = {
  'empresa.ver': 'Ver los datos de la empresa',
  'empresa.editar': 'Cambiar los datos y el logo de la empresa',
  'usuarios.ver': 'Ver los usuarios de la oficina',
  'usuarios.invitar': 'Invitar usuarios y dar acceso al portal',
  'usuarios.editar': 'Cambiar roles y quitar accesos',
  'permisos.editar': 'Cambiar lo que puede hacer cada rol',
  'bandas.ver': 'Ver bandas',
  'bandas.crear': 'Crear bandas',
  'bandas.editar': 'Editar bandas y su logo',
  'bandas.eliminar': 'Archivar bandas',
  'musicos.ver': 'Ver integrantes',
  'musicos.crear': 'Agregar integrantes',
  'musicos.editar': 'Editar integrantes y su foto',
  'musicos.eliminar': 'Dar de baja integrantes',
  'documentos.ver': 'Ver pasaportes y visas (números enmascarados)',
  'documentos.editar': 'Agregar o cambiar pasaportes y visas',
  'documentos.descargar': 'Ver el número completo y descargar el archivo',
  'pagos.ver': 'Ver los datos bancarios de los integrantes (enmascarados)',
  'pagos.editar': 'Cambiar los datos bancarios de los integrantes',
  'auditoria.ver': 'Ver la bitácora de cambios',
  'clientes.ver': 'Ver clientes',
  'clientes.editar': 'Crear y editar clientes',
  'eventos.ver': 'Ver el calendario y los eventos',
  'eventos.crear': 'Crear eventos (contrataciones)',
  'eventos.editar': 'Editar los eventos propios (el booking, solo los suyos)',
  'eventos.editar_todos': 'Editar los eventos de cualquier booking',
  'eventos.ver_montos': 'Ver los importes de todos los eventos',
  'eventos.excepcion': 'Autorizar fechas bloqueadas y choques de agenda',
  'contratos.ver': 'Ver contratos',
  'contratos.editar': 'Crear versiones del contrato y marcarlo firmado',
  'ensayos.ver': 'Ver ensayos y asistencia',
  'ensayos.editar': 'Crear y editar ensayos',
  'ensayos.publicar': 'Publicar ensayos y avisar a los músicos',
  'bloqueos.editar': 'Bloquear y desbloquear fechas',
  'finanzas.ver': 'Ver las finanzas de todos los eventos y de la empresa',
  'finanzas.registrar': 'Registrar cobros y gastos (el booking, solo en sus eventos)',
  'finanzas.anular': 'Anular movimientos (no se borran)',
  'finanzas.confirmar': 'Confirmar que el dinero llegó a la cuenta',
  'gastos.generales': 'Registrar gastos generales de la empresa',
  'tasas.editar': 'Registrar tasas de cambio',
  'nomina.ver': 'Ver la nómina de los eventos',
  'nomina.editar': 'Armar la nómina (músicos, tarifas, descuentos)',
  'nomina.pagar': 'Registrar pagos a músicos',
  'comisiones.ver': 'Ver comisiones',
  'comisiones.editar': 'Crear, aprobar y pagar comisiones',
  'cuadres.enviar': 'Enviar el cuadre a revisión',
  'cuadres.revisar': 'Revisar el cuadre y pasarlo al artista',
  'cuadres.aprobar': 'Aprobar o devolver el cuadre (liquidar)',
  'viajes.ver': 'Ver giras, vuelos, hoteles e itinerarios',
  'viajes.editar': 'Crear y cambiar giras, traslados, hoteles y actividades',
  'viajes.publicar': 'Publicar el itinerario y avisar a la delegación',
  'rider.ver': 'Ver los riders técnicos y el plano del escenario',
  'rider.editar': 'Crear y editar riders, guardar versiones',
  'rider.descargar': 'Imprimir o descargar el rider en PDF',
  'reportes.ver': 'Ver reportes de ventas, gastos, pagos y rentabilidad',
  'reportes.exportar': 'Exportar reportes a Excel y PDF',
};
const TODOS = Object.keys(PERMISOS_CAT);
export const FABRICA = {
  dueno: TODOS,
  admin: TODOS.filter((p) => !['permisos.editar', 'cuadres.aprobar', 'finanzas.confirmar'].includes(p)), // el blueprint: el admin no aprueba liquidaciones sin permiso específico
  manager: ['empresa.ver', 'usuarios.ver', 'bandas.ver', 'bandas.crear', 'bandas.editar', 'musicos.ver', 'musicos.crear', 'musicos.editar', 'documentos.ver', 'documentos.editar', 'pagos.ver', 'auditoria.ver',
    'clientes.ver', 'clientes.editar', 'eventos.ver', 'eventos.crear', 'eventos.editar', 'eventos.editar_todos', 'eventos.ver_montos', 'eventos.excepcion', 'contratos.ver', 'contratos.editar', 'ensayos.ver', 'ensayos.editar', 'ensayos.publicar', 'bloqueos.editar',
    'finanzas.ver', 'finanzas.registrar', 'finanzas.anular', 'gastos.generales', 'tasas.editar', 'nomina.ver', 'nomina.editar', 'nomina.pagar', 'comisiones.ver', 'comisiones.editar', 'cuadres.enviar', 'cuadres.revisar', 'viajes.ver', 'viajes.editar', 'viajes.publicar', 'rider.ver', 'rider.editar', 'rider.descargar', 'reportes.ver', 'reportes.exportar'],
  booking: ['empresa.ver', 'bandas.ver', 'musicos.ver', 'clientes.ver', 'clientes.editar', 'eventos.ver', 'eventos.crear', 'eventos.editar', 'contratos.ver', 'contratos.editar', 'ensayos.ver', 'finanzas.registrar', 'cuadres.enviar', 'viajes.ver', 'rider.ver', 'rider.descargar'],
  musico: [],
  sonidista: [],
  promotor: [],
};

// permisos efectivos de un rol en una empresa
export async function permisosDe(db, empresaId, rol) {
  if (rol === 'dueno') return new Set(TODOS);
  const s = new Set(FABRICA[rol] || []);
  const cambios = (await db.prepare('SELECT permiso, permitido FROM rol_permisos WHERE empresa_id = ? AND rol = ?').bind(empresaId, rol).all()).results;
  for (const c of cambios) { if (!PERMISOS_CAT[c.permiso]) continue; if (c.permitido) s.add(c.permiso); else s.delete(c.permiso); }
  return s;
}
