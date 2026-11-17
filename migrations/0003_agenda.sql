-- BandGo · Fase 2 · clientes, eventos (expediente), contratos con versiones, ensayos y bloqueos de fechas
CREATE TABLE correlativos (empresa_id INTEGER NOT NULL, prefijo TEXT NOT NULL, ultimo INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (empresa_id, prefijo));

CREATE TABLE clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,                     -- persona o empresa
  nombre_comercial TEXT,
  tipo TEXT NOT NULL DEFAULT 'empresa',     -- persona · empresa
  telefono TEXT, whatsapp TEXT, email TEXT,
  pais TEXT, ciudad TEXT, direccion TEXT,
  fiscal TEXT,                              -- RNC, EIN, NIF…
  contacto_nombre TEXT, contacto_telefono TEXT,   -- quien contrata / contacto el día del evento
  notas TEXT,
  activo INTEGER NOT NULL DEFAULT 1,
  creado_por INTEGER,
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_clientes_empresa ON clientes(empresa_id);

CREATE TABLE eventos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL,                     -- EVT-00001 por empresa
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'privado',     -- publico · privado
  estado TEXT NOT NULL DEFAULT 'cotizacion',
  fecha TEXT NOT NULL,                      -- YYYY-MM-DD (fecha local del lugar)
  zona_horaria TEXT,
  hora_llegada TEXT, hora_montaje TEXT, hora_soundcheck TEXT, hora_show TEXT, hora_fin TEXT,
  pais TEXT, ciudad TEXT, lugar TEXT, direccion TEXT,
  cliente_id INTEGER REFERENCES clientes(id),
  banda_id INTEGER REFERENCES bandas(id),
  booking_id INTEGER REFERENCES usuarios(id),
  manager_id INTEGER REFERENCES usuarios(id),
  precio_c INTEGER,                         -- valor contratado (centavos)
  moneda TEXT NOT NULL DEFAULT 'USD',
  cubre TEXT,                               -- JSON: quién paga vuelo, hotel, transporte, dietas, sonido
  notas TEXT,
  creado_por INTEGER,
  creado TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (empresa_id, codigo)
);
CREATE INDEX ix_eventos_fecha ON eventos(empresa_id, fecha);

CREATE TABLE evento_asignaciones (
  evento_id INTEGER NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
  musico_id INTEGER NOT NULL REFERENCES musicos(id) ON DELETE CASCADE,
  funcion TEXT,
  confirmado INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (evento_id, musico_id)
);
CREATE INDEX ix_asig_musico ON evento_asignaciones(musico_id);

CREATE TABLE evento_historial (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evento_id INTEGER NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
  usuario_id INTEGER,
  cambio TEXT NOT NULL,
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);

-- cada vez que se guarda el contrato se crea una versión nueva; las anteriores no se tocan
CREATE TABLE contratos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  evento_id INTEGER NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  estado TEXT NOT NULL DEFAULT 'borrador',  -- borrador · enviado · firmado · anulado
  precio_c INTEGER,
  moneda TEXT NOT NULL,
  anticipo_c INTEGER,
  anticipo_vence TEXT,
  saldo_vence TEXT,
  condiciones TEXT,
  datos TEXT NOT NULL,                      -- foto (JSON) del evento, cliente y empresa al momento de esta versión
  archivo_firmado_r2 TEXT,
  creado_por INTEGER,
  creado TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (evento_id, version)
);

CREATE TABLE ensayos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  banda_id INTEGER REFERENCES bandas(id),
  titulo TEXT NOT NULL,
  fecha TEXT NOT NULL,
  hora_inicio TEXT, hora_fin TEXT,
  lugar TEXT, direccion TEXT,
  notas TEXT,
  estado TEXT NOT NULL DEFAULT 'borrador',  -- borrador · publicado · cancelado
  serie TEXT,                               -- mismo valor para los ensayos creados juntos (repetición semanal)
  creado_por INTEGER,
  publicado_en TEXT,
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_ensayos_fecha ON ensayos(empresa_id, fecha);
CREATE TABLE ensayo_citados (
  ensayo_id INTEGER NOT NULL REFERENCES ensayos(id) ON DELETE CASCADE,
  musico_id INTEGER NOT NULL REFERENCES musicos(id) ON DELETE CASCADE,
  respuesta TEXT NOT NULL DEFAULT 'pendiente', -- pendiente · voy · no · talvez
  motivo TEXT,
  respondido TEXT,
  asistio INTEGER,
  PRIMARY KEY (ensayo_id, musico_id)
);
CREATE INDEX ix_citados_musico ON ensayo_citados(musico_id);
CREATE TABLE ensayo_repertorio (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ensayo_id INTEGER NOT NULL REFERENCES ensayos(id) ON DELETE CASCADE,
  orden INTEGER NOT NULL DEFAULT 0,
  titulo TEXT NOT NULL,
  detalle TEXT,
  enlace TEXT
);

-- bloqueos de fechas: para toda la empresa, un país, una banda o un integrante
CREATE TABLE bloqueos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  desde TEXT NOT NULL, hasta TEXT NOT NULL,
  alcance TEXT NOT NULL DEFAULT 'global',   -- global · pais · banda · musico
  pais TEXT, banda_id INTEGER, musico_id INTEGER,
  motivo TEXT,
  vence TEXT,                               -- el bloqueo se cae solo después de esta fecha (opcional)
  activo INTEGER NOT NULL DEFAULT 1,
  creado_por INTEGER,
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_bloqueos ON bloqueos(empresa_id, desde, hasta);
