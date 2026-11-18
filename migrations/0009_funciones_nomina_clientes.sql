-- BandGo · mejoras: personas con varias funciones (y sus pagos), conceptos extra de la nómina, gastos guardados,
-- direcciones de EE. UU., estudios de ensayo y portal del cliente (firma de contratos, flyer y datos del evento).

-- funciones que cobran aparte: manager, booking, administración, dirección musical u otra.
-- Puede ser de un integrante (musico_id) o de un usuario de la oficina que no toca (usuario_id).
CREATE TABLE funciones_pago (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  musico_id INTEGER REFERENCES musicos(id) ON DELETE CASCADE,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
  funcion TEXT NOT NULL,                    -- manager · booking · administracion · direccion · otra
  nombre TEXT,                              -- cómo se llama en la nómina («Dirección musical»)
  modo TEXT NOT NULL DEFAULT 'fijo',        -- fijo · porcentaje
  monto_c INTEGER, moneda TEXT,
  porcentaje_e2 INTEGER,                    -- 10 % = 1000
  base TEXT NOT NULL DEFAULT 'contrato',    -- contrato · cobrado
  banda_id INTEGER REFERENCES bandas(id) ON DELETE CASCADE,  -- vacío = todas las bandas
  aplica TEXT NOT NULL DEFAULT 'banda',     -- banda (todo evento de la banda) · propios (donde es el booking/manager del evento) · toca (cuando está en el equipo)
  activo INTEGER NOT NULL DEFAULT 1,
  creado_por INTEGER,
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_funciones_empresa ON funciones_pago(empresa_id);
ALTER TABLE comisiones ADD COLUMN funcion_id INTEGER REFERENCES funciones_pago(id) ON DELETE SET NULL;
ALTER TABLE comisiones ADD COLUMN musico_id INTEGER REFERENCES musicos(id) ON DELETE SET NULL;

-- gastos guardados (plantillas con precio): transporte, combustible, dieta… se cargan a la nómina y se pueden cambiar
CREATE TABLE gastos_guardados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  categoria TEXT NOT NULL,                  -- una de las categorías de gasto del evento
  monto_c INTEGER NOT NULL DEFAULT 0, moneda TEXT NOT NULL DEFAULT 'USD',
  siempre INTEGER NOT NULL DEFAULT 0,       -- se agrega solo al armar cada nómina
  activo INTEGER NOT NULL DEFAULT 1,
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);
-- renglones extra de la nómina: pagos extra a un músico (función, combustible que pagó) o gastos generales del evento
CREATE TABLE nomina_conceptos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evento_id INTEGER NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
  empresa_id INTEGER NOT NULL,
  musico_id INTEGER REFERENCES musicos(id),          -- vacío = gasto general (se paga como gasto del evento)
  concepto TEXT NOT NULL,
  categoria TEXT,
  monto_c INTEGER NOT NULL,
  moneda TEXT NOT NULL,
  funcion_id INTEGER, gasto_id INTEGER,
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_nomconc_evento ON nomina_conceptos(evento_id);
ALTER TABLE nomina ADD COLUMN extras_c INTEGER NOT NULL DEFAULT 0;   -- suma de sus conceptos (se recalcula al guardar)
ALTER TABLE movimientos ADD COLUMN nomina_concepto_id INTEGER;       -- gasto general pagado desde la nómina

-- direcciones: en EE. UU. calle, ciudad, estado y ZIP; en otros países la dirección corrida
ALTER TABLE eventos ADD COLUMN estado_us TEXT;
ALTER TABLE eventos ADD COLUMN codigo_postal TEXT;
ALTER TABLE clientes ADD COLUMN estado_us TEXT;
ALTER TABLE clientes ADD COLUMN codigo_postal TEXT;
ALTER TABLE clientes ADD COLUMN lugar TEXT;          -- nombre del local (discoteca, salón) donde se toca

-- estudios de ensayo guardados
CREATE TABLE estudios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  direccion TEXT, telefono TEXT, notas TEXT,
  activo INTEGER NOT NULL DEFAULT 1,
  creado TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (empresa_id, nombre)
);
ALTER TABLE ensayos ADD COLUMN estudio_id INTEGER REFERENCES estudios(id);

-- portal del cliente
ALTER TABLE clientes ADD COLUMN usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE invitaciones ADD COLUMN cliente_id INTEGER REFERENCES clientes(id) ON DELETE CASCADE;
ALTER TABLE eventos ADD COLUMN flyer_r2 TEXT;        -- el post / flyer del evento (lo puede subir el cliente)
ALTER TABLE contratos ADD COLUMN firma_nombre TEXT;
ALTER TABLE contratos ADD COLUMN firma_r2 TEXT;      -- imagen de la firma dibujada
ALTER TABLE contratos ADD COLUMN firma_en TEXT;
ALTER TABLE contratos ADD COLUMN firma_ip TEXT;
ALTER TABLE contratos ADD COLUMN firma_huella TEXT;  -- sha256 del contenido firmado
ALTER TABLE contratos ADD COLUMN firma_usuario_id INTEGER;
