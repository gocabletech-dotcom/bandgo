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
};
const TODOS = Object.keys(PERMISOS_CAT);
export const FABRICA = {
  dueno: TODOS,
  admin: TODOS.filter((p) => p !== 'permisos.editar'),
  manager: ['empresa.ver', 'usuarios.ver', 'bandas.ver', 'bandas.crear', 'bandas.editar', 'musicos.ver', 'musicos.crear', 'musicos.editar', 'documentos.ver', 'documentos.editar', 'pagos.ver', 'auditoria.ver'],
  booking: ['empresa.ver', 'bandas.ver', 'musicos.ver'],
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
