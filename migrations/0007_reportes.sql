-- BandGo · Fase 6 · reportes: presupuesto estimado del evento (para comparar contra el resultado real)
CREATE TABLE presupuestos (
  evento_id INTEGER PRIMARY KEY REFERENCES eventos(id) ON DELETE CASCADE,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nomina_c INTEGER NOT NULL DEFAULT 0,      -- todo en la moneda del evento
  comisiones_c INTEGER NOT NULL DEFAULT 0,
  viajes_c INTEGER NOT NULL DEFAULT 0,      -- vuelos, hotel, transporte y dietas
  otros_c INTEGER NOT NULL DEFAULT 0,
  notas TEXT,
  actualizado TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_por INTEGER
);
CREATE INDEX ix_presupuestos_empresa ON presupuestos(empresa_id);
