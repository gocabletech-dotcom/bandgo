-- BandGo · Fase 7 · comunicados (avisos oficiales con confirmación de lectura) y chat (por banda, evento, gira y directo)
CREATE TABLE comunicados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  cuerpo TEXT NOT NULL,
  importancia TEXT NOT NULL DEFAULT 'normal',   -- normal · urgente
  requiere_acuse INTEGER NOT NULL DEFAULT 0,    -- pide «Enterado»
  alcance TEXT NOT NULL DEFAULT 'todos',        -- todos · banda · evento · viaje · personas
  alcance_id INTEGER,
  alcance_nombre TEXT,
  archivo_r2 TEXT,
  fijado INTEGER NOT NULL DEFAULT 0,
  retirado_en TEXT, retirado_por INTEGER,
  creado_por INTEGER,
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_comunicados_empresa ON comunicados(empresa_id, creado);

-- destinatarios congelados al enviar (si alguien entra a la banda después, no le aparece un aviso viejo)
CREATE TABLE comunicado_destinatarios (
  comunicado_id INTEGER NOT NULL REFERENCES comunicados(id) ON DELETE CASCADE,
  musico_id INTEGER NOT NULL REFERENCES musicos(id) ON DELETE CASCADE,
  leido_en TEXT,
  acuse_en TEXT,
  PRIMARY KEY (comunicado_id, musico_id)
);
CREATE INDEX ix_comdest_musico ON comunicado_destinatarios(musico_id);

CREATE TABLE chat_canales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,                       -- banda · evento · viaje · directo · grupo
  ref_id INTEGER,                           -- banda, evento o gira
  clave TEXT,                               -- para no duplicar: «banda:3», «directo:4:9»
  nombre TEXT NOT NULL,
  solo_oficina INTEGER NOT NULL DEFAULT 0,  -- solo la oficina escribe (canal de anuncios)
  archivado INTEGER NOT NULL DEFAULT 0,
  ultimo_id INTEGER, ultimo_en TEXT,
  creado_por INTEGER,
  creado TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (empresa_id, clave)
);
-- miembros explícitos (directos y grupos); los de banda, evento y gira salen del equipo de cada uno
CREATE TABLE chat_miembros (
  canal_id INTEGER NOT NULL REFERENCES chat_canales(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  PRIMARY KEY (canal_id, usuario_id)
);
CREATE TABLE chat_mensajes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  canal_id INTEGER NOT NULL REFERENCES chat_canales(id) ON DELETE CASCADE,
  empresa_id INTEGER NOT NULL,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  texto TEXT,
  archivo_r2 TEXT, archivo_mime TEXT,
  responde_a INTEGER,
  editado_en TEXT,
  borrado_en TEXT, borrado_por INTEGER,
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_chatmsg_canal ON chat_mensajes(canal_id, id);
CREATE TABLE chat_lecturas (
  canal_id INTEGER NOT NULL REFERENCES chat_canales(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  ultimo_id INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (canal_id, usuario_id)
);
