-- BandGo · Fase 4 · giras y viajes: tramos (avión, autobús, tren, vehículo), hoteles, actividades e itinerario consolidado
CREATE TABLE viajes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL,                     -- GIR-00001 por empresa
  nombre TEXT NOT NULL,
  banda_id INTEGER REFERENCES bandas(id),
  desde TEXT, hasta TEXT,
  estado TEXT NOT NULL DEFAULT 'planificando',  -- planificando · confirmado · en_curso · terminado · cancelado
  responsable_id INTEGER REFERENCES usuarios(id),
  notas TEXT,
  publicado_en TEXT,                        -- cuando se avisó a la delegación
  cambios_sin_avisar INTEGER NOT NULL DEFAULT 0,
  creado_por INTEGER,
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_viajes_empresa ON viajes(empresa_id, desde);
ALTER TABLE eventos ADD COLUMN viaje_id INTEGER REFERENCES viajes(id) ON DELETE SET NULL;

-- quiénes viajan (la delegación)
CREATE TABLE viaje_personas (
  viaje_id INTEGER NOT NULL REFERENCES viajes(id) ON DELETE CASCADE,
  musico_id INTEGER NOT NULL REFERENCES musicos(id) ON DELETE CASCADE,
  funcion TEXT,
  PRIMARY KEY (viaje_id, musico_id)
);

-- un tramo es un traslado: vuelo, autobús, tren, vehículo privado o alquilado
CREATE TABLE tramos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  viaje_id INTEGER REFERENCES viajes(id) ON DELETE CASCADE,
  evento_id INTEGER REFERENCES eventos(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL DEFAULT 'vuelo',       -- vuelo · autobus · tren · privado · alquilado · otro
  sale_fecha TEXT NOT NULL, sale_hora TEXT, sale_tz TEXT,
  llega_fecha TEXT, llega_hora TEXT, llega_tz TEXT,
  origen TEXT, origen_ciudad TEXT, origen_pais TEXT,     -- aeropuerto, terminal o dirección
  destino TEXT, destino_ciudad TEXT, destino_pais TEXT,
  compania TEXT,                            -- aerolínea, empresa de autobús, rent car
  numero TEXT,                              -- número de vuelo, ruta, placa
  reserva TEXT,                             -- código de reserva / localizador
  terminal TEXT, equipaje TEXT, notas TEXT,
  contacto TEXT,                            -- lo ven los pasajeros (chofer, guía)
  contacto_privado TEXT,                    -- solo la oficina
  responsable_id INTEGER REFERENCES usuarios(id),   -- quién hizo la reserva
  cubierto_por TEXT,                        -- empresa · cliente · booking · otro
  costo_c INTEGER, moneda TEXT,
  archivo_r2 TEXT,                          -- boleto o reserva
  movimiento_id INTEGER REFERENCES movimientos(id),  -- si ya se registró como gasto
  creado_por INTEGER,
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_tramos_empresa ON tramos(empresa_id, sale_fecha);
CREATE INDEX ix_tramos_viaje ON tramos(viaje_id);
CREATE INDEX ix_tramos_evento ON tramos(evento_id);

CREATE TABLE tramo_pasajeros (
  tramo_id INTEGER NOT NULL REFERENCES tramos(id) ON DELETE CASCADE,
  musico_id INTEGER NOT NULL REFERENCES musicos(id) ON DELETE CASCADE,
  asiento TEXT,
  archivo_r2 TEXT,                          -- boleto individual
  PRIMARY KEY (tramo_id, musico_id)
);

CREATE TABLE hoteles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  viaje_id INTEGER REFERENCES viajes(id) ON DELETE CASCADE,
  evento_id INTEGER REFERENCES eventos(id) ON DELETE SET NULL,
  nombre TEXT NOT NULL,
  direccion TEXT, ciudad TEXT, pais TEXT, telefono TEXT,
  entrada TEXT NOT NULL, entrada_hora TEXT,
  salida TEXT NOT NULL, salida_hora TEXT,
  reserva TEXT, habitaciones INTEGER,
  contacto TEXT, contacto_privado TEXT,
  cubierto_por TEXT, costo_c INTEGER, moneda TEXT,
  archivo_r2 TEXT, notas TEXT,
  movimiento_id INTEGER REFERENCES movimientos(id),
  creado_por INTEGER,
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_hoteles_empresa ON hoteles(empresa_id, entrada);
CREATE INDEX ix_hoteles_viaje ON hoteles(viaje_id);

CREATE TABLE hotel_huespedes (
  hotel_id INTEGER NOT NULL REFERENCES hoteles(id) ON DELETE CASCADE,
  musico_id INTEGER NOT NULL REFERENCES musicos(id) ON DELETE CASCADE,
  habitacion TEXT,
  PRIMARY KEY (hotel_id, musico_id)
);

-- otras actividades del itinerario: recogida, entrevista, cena, prueba de sonido extra…
CREATE TABLE actividades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  viaje_id INTEGER REFERENCES viajes(id) ON DELETE CASCADE,
  evento_id INTEGER REFERENCES eventos(id) ON DELETE CASCADE,
  fecha TEXT NOT NULL, hora TEXT, hora_fin TEXT,
  titulo TEXT NOT NULL, lugar TEXT, direccion TEXT, notas TEXT,
  para TEXT NOT NULL DEFAULT 'todos',       -- todos · tecnico (sonidistas y técnicos) · oficina
  creado_por INTEGER,
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_actividades_empresa ON actividades(empresa_id, fecha);

-- lo que cambió después de avisar a la delegación
CREATE TABLE itinerario_cambios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  viaje_id INTEGER NOT NULL REFERENCES viajes(id) ON DELETE CASCADE,
  detalle TEXT NOT NULL,
  avisado INTEGER NOT NULL DEFAULT 0,
  creado_por INTEGER,
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_itcambios_viaje ON itinerario_cambios(viaje_id);
