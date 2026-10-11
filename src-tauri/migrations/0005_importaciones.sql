-- Fase 2 · Importar extractos.
--  · importaciones: cada archivo importado (su huella evita subir el mismo archivo dos veces).
--  · transacciones.importacion_id: de qué importación salió el movimiento («Deshacer» borra solo esos).
--  La huella por movimiento ya existe (transacciones.huella, única por usuario); incluye la cuenta.
CREATE TABLE importaciones (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL DEFAULT 1 REFERENCES usuarios(id),
  archivo TEXT NOT NULL,
  huella_archivo TEXT NOT NULL,
  banco TEXT NOT NULL,
  cuenta_id INTEGER REFERENCES cuentas(id) ON DELETE SET NULL,
  desde TEXT,
  hasta TEXT,
  movimientos INTEGER NOT NULL DEFAULT 0,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX ux_imp_huella ON importaciones (usuario_id, huella_archivo);

ALTER TABLE transacciones ADD COLUMN importacion_id INTEGER REFERENCES importaciones(id) ON DELETE SET NULL;
CREATE INDEX ix_tx_importacion ON transacciones (importacion_id);
