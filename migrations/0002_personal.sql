-- BandGo · Fase 1 · bandas, integrantes y documentos de viaje
CREATE TABLE bandas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  categoria TEXT,                           -- «Banda RD», «Banda USA» u otra
  pais TEXT,
  moneda TEXT NOT NULL DEFAULT 'USD',
  logo_r2 TEXT,
  notas TEXT,
  activa INTEGER NOT NULL DEFAULT 1,
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_bandas_empresa ON bandas(empresa_id);

CREATE TABLE musicos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,  -- su acceso al portal (si ya lo activó)
  nombre TEXT NOT NULL,
  instrumento TEXT,
  tipo TEXT NOT NULL DEFAULT 'musico',      -- musico · sonidista · tecnico
  telefono TEXT,
  whatsapp TEXT,
  email TEXT,
  nacimiento TEXT,
  direccion TEXT,
  pais_residencia TEXT,
  emergencia_nombre TEXT,
  emergencia_telefono TEXT,
  foto_r2 TEXT,
  tarifa_c INTEGER,                         -- tarifa base por presentación, en centavos
  tarifa_moneda TEXT,
  notas TEXT,
  activo INTEGER NOT NULL DEFAULT 1,
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_musicos_empresa ON musicos(empresa_id);

CREATE TABLE banda_miembros (
  banda_id INTEGER NOT NULL REFERENCES bandas(id) ON DELETE CASCADE,
  musico_id INTEGER NOT NULL REFERENCES musicos(id) ON DELETE CASCADE,
  funcion TEXT,                             -- lo que hace en esa banda (puede ser distinto)
  tarifa_c INTEGER,
  moneda TEXT,
  PRIMARY KEY (banda_id, musico_id)
);

-- pasaportes y visas: el número va cifrado; las fechas no, para poder avisar del vencimiento
CREATE TABLE documentos_viaje (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  musico_id INTEGER NOT NULL REFERENCES musicos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,                       -- pasaporte · visa
  pais TEXT,                                -- país emisor (pasaporte) o país de la visa
  clase TEXT,                               -- tipo de visa (B1/B2, Schengen…)
  numero_cif TEXT,
  numero_fin TEXT,                          -- últimos 4, para mostrar enmascarado
  emision TEXT,
  vence TEXT,
  archivo_r2 TEXT,
  creado_por INTEGER,
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_docs_musico ON documentos_viaje(musico_id);
CREATE INDEX ix_docs_vence ON documentos_viaje(empresa_id, vence);

-- datos para pagarle: todo cifrado; nunca se piden contraseñas bancarias
CREATE TABLE cuentas_pago (
  musico_id INTEGER PRIMARY KEY REFERENCES musicos(id) ON DELETE CASCADE,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  banco TEXT,
  titular_cif TEXT,
  tipo_cuenta TEXT,
  numero_cif TEXT,
  numero_fin TEXT,
  zelle_cif TEXT,
  actualizado TEXT NOT NULL DEFAULT (datetime('now'))
);
