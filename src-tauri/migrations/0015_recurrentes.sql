-- Fase 6 · bloque 1: movimientos recurrentes (arriendo, servicios, nómina…).
-- · recurrentes: la plantilla (qué, cuánto, en qué cuenta) y cada cuánto (frecuencia + día).
--   modo 'confirmar' (por defecto): las ocurrencias vencidas se calculan al vuelo y no tocan saldos hasta confirmarlas.
--   modo 'auto': se registran solas en su fecha.
-- · Cada ocurrencia registrada es un movimiento con recurrente_id y huella «rec|uid|AAAA-MM-DD»
--   (única por usuario): si la crean dos equipos, la sincronización las une.
-- · recurrentes_omitidas: ocurrencias que se saltaron. Borrar un movimiento recurrente la anota sola
--   (así el modo automático no lo vuelve a crear).
-- · etiquetas: nombres en JSON (los id de etiqueta son locales de cada equipo).

CREATE TABLE recurrentes (
  id INTEGER PRIMARY KEY,
  uid TEXT NOT NULL UNIQUE DEFAULT (lower(
    hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' ||
    substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  usuario_id INTEGER NOT NULL DEFAULT 1 REFERENCES usuarios(id),
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('ingreso','egreso','transferencia')),
  monto INTEGER NOT NULL CHECK (monto > 0),
  cuenta_id INTEGER NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  cuenta_destino_id INTEGER REFERENCES cuentas(id) ON DELETE CASCADE,
  categoria_id INTEGER REFERENCES categorias(id) ON DELETE SET NULL,
  comercio TEXT,
  notas TEXT,
  etiquetas TEXT,                                     -- JSON con nombres
  frecuencia TEXT NOT NULL CHECK (frecuencia IN ('mensual','quincenal','semanal','anual')),
  dia INTEGER NOT NULL CHECK (dia BETWEEN 1 AND 31),   -- semanal: 1 = lunes … 7 = domingo
  dia2 INTEGER CHECK (dia2 IS NULL OR dia2 BETWEEN 1 AND 31), -- quincenal (31 = último día)
  mes INTEGER CHECK (mes IS NULL OR mes BETWEEN 1 AND 12),    -- anual
  modo TEXT NOT NULL DEFAULT 'confirmar' CHECK (modo IN ('confirmar','auto')),
  inicio TEXT NOT NULL,
  fin TEXT,
  activa INTEGER NOT NULL DEFAULT 1,
  modificado_en TEXT,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE recurrentes_omitidas (
  id INTEGER PRIMARY KEY,
  uid TEXT NOT NULL UNIQUE DEFAULT (lower(
    hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' ||
    substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  recurrente_id INTEGER NOT NULL REFERENCES recurrentes(id) ON DELETE CASCADE,
  fecha TEXT NOT NULL,
  modificado_en TEXT,
  UNIQUE (recurrente_id, fecha)
);

ALTER TABLE transacciones ADD COLUMN recurrente_id INTEGER REFERENCES recurrentes(id) ON DELETE SET NULL;
CREATE INDEX idx_tx_recurrente ON transacciones(recurrente_id) WHERE recurrente_id IS NOT NULL;

-- Borrar una ocurrencia registrada = omitirla.
CREATE TRIGGER rec_omitir_al_borrar AFTER DELETE ON transacciones
  WHEN OLD.recurrente_id IS NOT NULL AND OLD.huella LIKE 'rec|%'
    AND EXISTS (SELECT 1 FROM recurrentes WHERE id = OLD.recurrente_id) BEGIN
  INSERT OR IGNORE INTO recurrentes_omitidas (recurrente_id, fecha) VALUES (OLD.recurrente_id, substr(OLD.huella, -10));
END;

-- Sincronización (igual que en 0014).
CREATE TRIGGER sinc_recurrentes_ins AFTER INSERT ON recurrentes WHEN NEW.modificado_en IS NULL BEGIN
  UPDATE recurrentes SET modificado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER sinc_recurrentes_upd AFTER UPDATE ON recurrentes WHEN NEW.modificado_en IS OLD.modificado_en AND NEW.uid IS OLD.uid BEGIN
  UPDATE recurrentes SET modificado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER sinc_recurrentes_del AFTER DELETE ON recurrentes BEGIN
  INSERT OR REPLACE INTO borrados (tabla, uid, borrado_en) VALUES ('recurrentes', OLD.uid, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER sinc_recurrentes_omitidas_ins AFTER INSERT ON recurrentes_omitidas WHEN NEW.modificado_en IS NULL BEGIN
  UPDATE recurrentes_omitidas SET modificado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER sinc_recurrentes_omitidas_upd AFTER UPDATE ON recurrentes_omitidas WHEN NEW.modificado_en IS OLD.modificado_en AND NEW.uid IS OLD.uid BEGIN
  UPDATE recurrentes_omitidas SET modificado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER sinc_recurrentes_omitidas_del AFTER DELETE ON recurrentes_omitidas BEGIN
  INSERT OR REPLACE INTO borrados (tabla, uid, borrado_en) VALUES ('recurrentes_omitidas', OLD.uid, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;
