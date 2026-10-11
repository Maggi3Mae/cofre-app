-- Fase 5A · «Me deben»: plata que le prestas a otras personas.
-- Préstamo: transferencia cuenta → persona (cuenta_id = origen, prestamo_destino_id). Baja el saldo, no es gasto.
-- Abono:    transferencia persona → cuenta (cuenta_id = la que recibe, prestamo_origen_id). SUMA a esa cuenta, no es ingreso.
-- Perdido:  egreso por lo pendiente (prestamo_perdido_id). Es gasto, pero NO toca el saldo de la cuenta
--           (la plata ya había salido con el préstamo): solo baja «Te deben».
-- Las tablas nuevas nacen con id global (uid, UUID v4) para la sincronización entre equipos (Fase 5B).

CREATE TABLE personas (
  id INTEGER PRIMARY KEY,
  uid TEXT NOT NULL UNIQUE DEFAULT (lower(
    hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' ||
    substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  usuario_id INTEGER NOT NULL DEFAULT 1 REFERENCES usuarios(id),
  nombre TEXT NOT NULL,
  notas TEXT,
  archivada INTEGER NOT NULL DEFAULT 0,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX ux_personas_nombre ON personas (usuario_id, nombre COLLATE NOCASE);

CREATE TABLE prestamos (
  id INTEGER PRIMARY KEY,
  uid TEXT NOT NULL UNIQUE DEFAULT (lower(
    hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' ||
    substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  usuario_id INTEGER NOT NULL DEFAULT 1 REFERENCES usuarios(id),
  persona_id INTEGER NOT NULL REFERENCES personas(id),
  monto INTEGER NOT NULL CHECK (monto > 0),
  fecha TEXT NOT NULL,
  fecha_acordada TEXT,                 -- cuándo quedó en pagarte (opcional)
  descripcion TEXT,
  cuenta_origen_id INTEGER REFERENCES cuentas(id) ON DELETE SET NULL, -- NULL = solo registro
  perdido_en TEXT,                     -- fecha en que se dio por perdido
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_prestamos_persona ON prestamos (persona_id);

-- Plan de cuotas opcional: lo que se acordó pagar y cuándo. Los abonos se reparten en orden.
CREATE TABLE prestamo_cuotas (
  id INTEGER PRIMARY KEY,
  uid TEXT NOT NULL UNIQUE DEFAULT (lower(
    hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' ||
    substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  prestamo_id INTEGER NOT NULL REFERENCES prestamos(id) ON DELETE CASCADE,
  numero INTEGER NOT NULL,
  fecha TEXT NOT NULL,
  monto INTEGER NOT NULL CHECK (monto > 0),
  UNIQUE (prestamo_id, numero)
);

ALTER TABLE transacciones ADD COLUMN prestamo_destino_id INTEGER REFERENCES prestamos(id) ON DELETE SET NULL;
ALTER TABLE transacciones ADD COLUMN prestamo_origen_id INTEGER REFERENCES prestamos(id) ON DELETE SET NULL;
ALTER TABLE transacciones ADD COLUMN prestamo_perdido_id INTEGER REFERENCES prestamos(id) ON DELETE SET NULL;

CREATE INDEX idx_tx_prestamo_destino ON transacciones(prestamo_destino_id) WHERE prestamo_destino_id IS NOT NULL;
CREATE INDEX idx_tx_prestamo_origen ON transacciones(prestamo_origen_id) WHERE prestamo_origen_id IS NOT NULL;
CREATE INDEX idx_tx_prestamo_perdido ON transacciones(prestamo_perdido_id) WHERE prestamo_perdido_id IS NOT NULL;
