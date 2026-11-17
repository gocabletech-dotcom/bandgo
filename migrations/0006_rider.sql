-- BandGo · Fase 5 · rider técnico: plano del escenario (stage plot), lista de canales, monitores, requerimientos y versiones
CREATE TABLE riders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL,                     -- RID-00001 por empresa
  nombre TEXT NOT NULL,
  banda_id INTEGER REFERENCES bandas(id),
  alcance TEXT NOT NULL DEFAULT 'general',  -- general · rd · us · eu · evento
  evento_id INTEGER REFERENCES eventos(id) ON DELETE SET NULL,  -- solo si es una versión personalizada para un evento
  base_id INTEGER REFERENCES riders(id) ON DELETE SET NULL,     -- de cuál se copió
  estado TEXT NOT NULL DEFAULT 'borrador',  -- borrador · vigente · archivado
  version INTEGER NOT NULL DEFAULT 0,       -- última versión guardada (0 = nunca)
  datos TEXT NOT NULL,                      -- JSON del borrador actual
  sin_version INTEGER NOT NULL DEFAULT 1,   -- el borrador tiene cambios que no están en una versión
  actualizado TEXT, actualizado_por INTEGER,
  creado_por INTEGER,
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_riders_empresa ON riders(empresa_id, banda_id);

CREATE TABLE rider_versiones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rider_id INTEGER NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  datos TEXT NOT NULL,
  cambios TEXT NOT NULL,                    -- qué cambió (lo escribe quien guarda la versión)
  huella TEXT NOT NULL,
  creado_por INTEGER,
  creado TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (rider_id, version)
);

-- datos técnicos del evento: qué rider aplica, quién provee el sonido y cómo es el escenario
ALTER TABLE eventos ADD COLUMN rider_id INTEGER REFERENCES riders(id) ON DELETE SET NULL;
ALTER TABLE eventos ADD COLUMN sonido_proveedor TEXT;
ALTER TABLE eventos ADD COLUMN sonido_tecnico TEXT;
ALTER TABLE eventos ADD COLUMN sonido_telefono TEXT;
ALTER TABLE eventos ADD COLUMN sonido_email TEXT;
ALTER TABLE eventos ADD COLUMN escenario_info TEXT;
