-- BandGo · Fase 3 · libro de movimientos multimoneda, tasas, nómina por evento, comisiones y cuadres con versiones.
-- Nunca se suman monedas distintas: cada movimiento guarda su moneda e importe originales y, si se convierte a la moneda
-- del evento, la tasa, su fecha, su fuente y el importe convertido. Lo aprobado no se sobrescribe.

CREATE TABLE tasas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  fecha TEXT NOT NULL,
  de TEXT NOT NULL, a TEXT NOT NULL,
  tasa_e6 INTEGER NOT NULL,                 -- 1 «de» = tasa_e6 / 1.000.000 «a»
  fuente TEXT,
  creado_por INTEGER,
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_tasas ON tasas(empresa_id, de, a, fecha);

CREATE TABLE movimientos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL,                     -- MOV-00001
  evento_id INTEGER REFERENCES eventos(id),  -- NULL = gasto general de la empresa
  tipo TEXT NOT NULL,                       -- ingreso · gasto · nomina · comision
  categoria TEXT,
  descripcion TEXT,
  fecha TEXT NOT NULL,
  monto_c INTEGER NOT NULL,                 -- importe original
  moneda TEXT NOT NULL,
  tasa_e6 INTEGER,                          -- si se convierte a la moneda del evento
  tasa_fecha TEXT, tasa_fuente TEXT,
  monto_evento_c INTEGER,                   -- importe en la moneda del evento (igual al original si es la misma)
  metodo TEXT,                              -- efectivo · deposito · transferencia · zelle · cheque · tarjeta · otro
  referencia TEXT,
  pagador TEXT,                             -- quién pagó / entregó el dinero
  receptor TEXT,                            -- quién lo recibió (booking, manager, artista, empresa, músico…)
  receptor_usuario_id INTEGER,
  cubierto_por TEXT,                        -- en gastos: empresa · cliente · booking · otro
  musico_id INTEGER REFERENCES musicos(id), -- en nómina
  comision_id INTEGER,
  entregado INTEGER NOT NULL DEFAULT 1,     -- en cobros: 0 = el que lo recibió todavía no lo entregó a la empresa
  entregado_a TEXT, entregado_en TEXT,
  confirmado_por INTEGER, confirmado_en TEXT, -- el artista confirma que el dinero llegó / el músico confirma su pago
  discrepancia TEXT,
  comprobante_r2 TEXT,
  anulado INTEGER NOT NULL DEFAULT 0, anulado_por INTEGER, anulado_motivo TEXT,
  creado_por INTEGER,
  creado TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (empresa_id, codigo)
);
CREATE INDEX ix_mov_evento ON movimientos(evento_id);
CREATE INDEX ix_mov_empresa ON movimientos(empresa_id, fecha);
CREATE INDEX ix_mov_musico ON movimientos(musico_id);

-- nómina por presentación
CREATE TABLE nomina (
  evento_id INTEGER NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
  musico_id INTEGER NOT NULL REFERENCES musicos(id),
  empresa_id INTEGER NOT NULL,
  funcion TEXT,
  sustituto INTEGER NOT NULL DEFAULT 0,
  acordado_c INTEGER NOT NULL,
  moneda TEXT NOT NULL,
  descuento_c INTEGER NOT NULL DEFAULT 0,
  descuento_motivo TEXT,
  excepcion TEXT,                           -- acuerdo individual si se paga en otra moneda
  PRIMARY KEY (evento_id, musico_id)
);

CREATE TABLE comisiones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  evento_id INTEGER NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
  beneficiario TEXT NOT NULL,
  usuario_id INTEGER,
  relacion TEXT,                            -- booking · referido · intermediario · otro
  modo TEXT NOT NULL DEFAULT 'fijo',        -- fijo · porcentaje
  porcentaje_e2 INTEGER,                    -- 10.5 % = 1050
  base TEXT,                                -- contrato · cobrado
  monto_c INTEGER NOT NULL,
  moneda TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente', -- pendiente · aprobada · pagada · anulada
  creado_por INTEGER,
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_com_evento ON comisiones(evento_id);

CREATE TABLE cuadres (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  evento_id INTEGER NOT NULL UNIQUE REFERENCES eventos(id) ON DELETE CASCADE,
  estado TEXT NOT NULL DEFAULT 'abierto',   -- abierto · en_revision · con_artista · aprobado · devuelto
  version INTEGER NOT NULL DEFAULT 0,
  actualizado TEXT NOT NULL DEFAULT (datetime('now'))
);
-- cada envío congela una foto de los números; la aprobada no se toca nunca
CREATE TABLE cuadre_versiones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cuadre_id INTEGER NOT NULL REFERENCES cuadres(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  datos TEXT NOT NULL,
  huella TEXT NOT NULL,                     -- sha256 de los datos: prueba de que no cambiaron
  enviado_por INTEGER, enviado_en TEXT NOT NULL DEFAULT (datetime('now')),
  revisado_por INTEGER, revisado_en TEXT,
  decision TEXT,                            -- aprobado · devuelto
  decidido_por INTEGER, decidido_en TEXT,
  observacion TEXT,
  UNIQUE (cuadre_id, version)
);
