-- Fase 5A · Gastos grupales: un gasto que pagaste tú y se reparte entre varias personas.
-- Tu parte es un egreso (con categoría); la de cada persona es un préstamo desde la misma cuenta.
-- Al dividir un egreso que ya existía, ese egreso se reduce a tu parte (el saldo de la cuenta no cambia).
-- Nace con id global (uid) para la sincronización.

CREATE TABLE gastos_grupales (
  id INTEGER PRIMARY KEY,
  uid TEXT NOT NULL UNIQUE DEFAULT (lower(
    hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' ||
    substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  usuario_id INTEGER NOT NULL DEFAULT 1 REFERENCES usuarios(id),
  descripcion TEXT NOT NULL,
  fecha TEXT NOT NULL,
  total INTEGER NOT NULL CHECK (total > 0),          -- lo que pagaste, propina incluida
  propina INTEGER NOT NULL DEFAULT 0 CHECK (propina >= 0),
  reparto TEXT NOT NULL CHECK (reparto IN ('igual','montos','porcentaje')),
  cuenta_id INTEGER REFERENCES cuentas(id) ON DELETE SET NULL,
  categoria_id INTEGER REFERENCES categorias(id) ON DELETE SET NULL,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE prestamos ADD COLUMN gasto_grupal_id INTEGER REFERENCES gastos_grupales(id) ON DELETE SET NULL;
ALTER TABLE transacciones ADD COLUMN gasto_grupal_id INTEGER REFERENCES gastos_grupales(id) ON DELETE SET NULL;

CREATE INDEX idx_prestamos_grupal ON prestamos(gasto_grupal_id) WHERE gasto_grupal_id IS NOT NULL;
CREATE INDEX idx_tx_grupal ON transacciones(gasto_grupal_id) WHERE gasto_grupal_id IS NOT NULL;
