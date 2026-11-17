-- BandGo · Fase 0 · núcleo SaaS multiempresa (copiado del diseño de FoodPOS)
-- Regla: nunca se edita una migración publicada; los cambios van en una nueva.
-- Dinero: siempre en enteros de centavos (*_c). Nunca REAL.

CREATE TABLE plataforma_config (clave TEXT PRIMARY KEY, valor TEXT);
INSERT INTO plataforma_config (clave, valor) VALUES ('registro_abierto', '1'), ('prueba_dias', '15');

CREATE TABLE planes (
  clave TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  precio_c INTEGER NOT NULL DEFAULT 0,      -- USD en centavos por mes
  bandas INTEGER,                           -- NULL = sin límite
  musicos INTEGER,
  usuarios INTEGER,
  almacenamiento_mb INTEGER NOT NULL DEFAULT 2048,
  descripcion TEXT,
  visible INTEGER NOT NULL DEFAULT 1,
  orden INTEGER NOT NULL DEFAULT 0
);
INSERT INTO planes (clave, nombre, precio_c, bandas, musicos, usuarios, almacenamiento_mb, descripcion, visible, orden) VALUES
 ('prueba', 'Prueba', 0, 3, 40, 10, 2048, '15 días gratis con todo, sin tarjeta', 0, 0),
 ('basico', 'Básico', 0, 1, 15, 5, 2048, '1 banda · hasta 15 integrantes', 1, 1),
 ('pro', 'Pro', 0, 3, 40, 15, 10240, '3 bandas · hasta 40 integrantes', 1, 2),
 ('full', 'Full', 0, NULL, 100, 40, 30720, 'Bandas ilimitadas · hasta 100 integrantes', 1, 3);

CREATE TABLE empresas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  pais TEXT NOT NULL DEFAULT 'DO',          -- DO, US, PR, ES…
  moneda_base TEXT NOT NULL DEFAULT 'USD',  -- moneda de los reportes consolidados
  zona_horaria TEXT NOT NULL DEFAULT 'America/Santo_Domingo',
  telefono TEXT,
  email TEXT,
  logo_r2 TEXT,
  plan TEXT NOT NULL DEFAULT 'prueba' REFERENCES planes(clave),
  prueba_hasta TEXT,
  estado TEXT NOT NULL DEFAULT 'activo',    -- activo · suspendida · archivada
  terminos_version TEXT,
  terminos_en TEXT,
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);

-- una persona = un usuario; puede pertenecer a varias empresas (un músico que toca con dos agrupaciones)
CREATE TABLE usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  telefono TEXT,
  pass_hash TEXT NOT NULL,
  pass_salt TEXT NOT NULL,
  superadmin INTEGER NOT NULL DEFAULT 0,
  activo INTEGER NOT NULL DEFAULT 1,
  creado TEXT NOT NULL DEFAULT (datetime('now')),
  visto_en TEXT
);
CREATE TABLE miembros (
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  rol TEXT NOT NULL,                        -- dueno · admin · manager · booking · musico · sonidista · promotor
  activo INTEGER NOT NULL DEFAULT 1,
  creado TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (usuario_id, empresa_id)
);
CREATE INDEX ix_miembros_empresa ON miembros(empresa_id);
-- permisos que la empresa cambió respecto a los de fábrica del rol ('+bandas.editar' o '-bandas.editar')
CREATE TABLE rol_permisos (
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  rol TEXT NOT NULL,
  permiso TEXT NOT NULL,
  permitido INTEGER NOT NULL,
  PRIMARY KEY (empresa_id, rol, permiso)
);

CREATE TABLE sesiones (
  token TEXT PRIMARY KEY,                   -- huella del token (el token real solo está en la cookie)
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  empresa_id INTEGER,                       -- empresa abierta en esta sesión
  expira TEXT NOT NULL,
  uso TEXT,
  cookie TEXT
);
CREATE INDEX ix_sesiones_usuario ON sesiones(usuario_id);

CREATE TABLE usuario_2fa (
  usuario_id INTEGER PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  secreto TEXT NOT NULL,
  activo INTEGER NOT NULL DEFAULT 0,
  respaldo TEXT,
  ultimo_paso INTEGER,
  creado TEXT NOT NULL DEFAULT (datetime('now')),
  activado TEXT
);
CREATE TABLE retos_2fa (
  token TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  cookie TEXT NOT NULL DEFAULT 'bg_session',
  expira TEXT NOT NULL,
  intentos INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE codigos_correo (email TEXT PRIMARY KEY, codigo TEXT NOT NULL, expira TEXT NOT NULL, intentos INTEGER NOT NULL DEFAULT 0);
CREATE TABLE recuperaciones (
  token TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira TEXT NOT NULL,
  usado INTEGER NOT NULL DEFAULT 0,
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);
-- invitaciones: enlace para que un músico o alguien de la oficina cree su contraseña
CREATE TABLE invitaciones (
  token TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  nombre TEXT,
  rol TEXT NOT NULL,
  musico_id INTEGER,
  expira TEXT NOT NULL,
  usado INTEGER NOT NULL DEFAULT 0,
  creado_por INTEGER,
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE equipos_usuario (
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  huella TEXT NOT NULL,
  nombre TEXT,
  creado TEXT NOT NULL DEFAULT (datetime('now')),
  visto TEXT,
  PRIMARY KEY (usuario_id, huella)
);
CREATE TABLE frenos (clave TEXT PRIMARY KEY, desde INTEGER NOT NULL, n INTEGER NOT NULL DEFAULT 0);

-- auditoría: quién hizo qué. No se edita ni se borra desde la app.
CREATE TABLE auditoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER,
  usuario_id INTEGER,
  accion TEXT NOT NULL,
  recurso TEXT,
  recurso_id INTEGER,
  detalle TEXT,
  ip TEXT,
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_auditoria_empresa ON auditoria(empresa_id, creado);

CREATE TABLE errores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT NOT NULL,
  origen TEXT NOT NULL DEFAULT 'web',
  metodo TEXT,
  ruta TEXT,
  empresa TEXT,
  mensaje TEXT,
  pila TEXT,
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_errores_creado ON errores(creado);

-- archivos privados en R2 (fotos, logos, documentos): se cuenta el espacio por empresa
CREATE TABLE archivos (
  clave TEXT PRIMARY KEY,                   -- ruta en R2: e/<empresa>/<tipo>/<aleatorio>.<ext>
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,                       -- logo_empresa · logo_banda · foto_musico · documento
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  creado_por INTEGER,
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_archivos_empresa ON archivos(empresa_id);
