-- Fase 5B · bloque 5: base para sincronizar entre equipos.
-- · uid (UUID v4): id global de cada fila; los id enteros son locales de cada equipo.
--   ajustes y comercios_nit no lo necesitan: su clave natural (clave / nit) ya es global.
-- · modificado_en (UTC con milisegundos): se pone solo al insertar y al editar (triggers).
--   Si un UPDATE escribe modificado_en a propósito (la sincronización trae el de otro equipo), se respeta.
-- · borrados: registro de lo eliminado (tabla, uid, fecha) para que el otro equipo también lo borre.
-- No se sincronizan: usuarios ni alertas_enviadas (cada equipo avisa por su cuenta).
-- Llenar el uid al insertar no cuenta como edición. Los triggers no se disparan entre sí (recursive_triggers está apagado por defecto en SQLite).

CREATE TABLE borrados (
  tabla TEXT NOT NULL,
  uid TEXT NOT NULL,
  borrado_en TEXT NOT NULL,
  PRIMARY KEY (tabla, uid)
);

-- cuentas
ALTER TABLE cuentas ADD COLUMN uid TEXT;
ALTER TABLE cuentas ADD COLUMN modificado_en TEXT;
UPDATE cuentas SET uid = lower(
    hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' ||
    substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)));
UPDATE cuentas SET modificado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
CREATE UNIQUE INDEX ux_cuentas_uid ON cuentas (uid);

-- categorias
ALTER TABLE categorias ADD COLUMN uid TEXT;
ALTER TABLE categorias ADD COLUMN modificado_en TEXT;
UPDATE categorias SET uid = lower(
    hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' ||
    substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)));
UPDATE categorias SET modificado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
CREATE UNIQUE INDEX ux_categorias_uid ON categorias (uid);

-- etiquetas
ALTER TABLE etiquetas ADD COLUMN uid TEXT;
ALTER TABLE etiquetas ADD COLUMN modificado_en TEXT;
UPDATE etiquetas SET uid = lower(
    hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' ||
    substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)));
UPDATE etiquetas SET modificado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
CREATE UNIQUE INDEX ux_etiquetas_uid ON etiquetas (uid);

-- transacciones
ALTER TABLE transacciones ADD COLUMN uid TEXT;
ALTER TABLE transacciones ADD COLUMN modificado_en TEXT;
UPDATE transacciones SET uid = lower(
    hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' ||
    substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)));
UPDATE transacciones SET modificado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
CREATE UNIQUE INDEX ux_transacciones_uid ON transacciones (uid);

-- transaccion_etiquetas
ALTER TABLE transaccion_etiquetas ADD COLUMN uid TEXT;
ALTER TABLE transaccion_etiquetas ADD COLUMN modificado_en TEXT;
UPDATE transaccion_etiquetas SET uid = lower(
    hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' ||
    substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)));
UPDATE transaccion_etiquetas SET modificado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
CREATE UNIQUE INDEX ux_transaccion_etiquetas_uid ON transaccion_etiquetas (uid);

-- reglas
ALTER TABLE reglas ADD COLUMN uid TEXT;
ALTER TABLE reglas ADD COLUMN modificado_en TEXT;
UPDATE reglas SET uid = lower(
    hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' ||
    substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)));
UPDATE reglas SET modificado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
CREATE UNIQUE INDEX ux_reglas_uid ON reglas (uid);

-- presupuestos
ALTER TABLE presupuestos ADD COLUMN uid TEXT;
ALTER TABLE presupuestos ADD COLUMN modificado_en TEXT;
UPDATE presupuestos SET uid = lower(
    hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' ||
    substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)));
UPDATE presupuestos SET modificado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
CREATE UNIQUE INDEX ux_presupuestos_uid ON presupuestos (uid);

-- cdts
ALTER TABLE cdts ADD COLUMN uid TEXT;
ALTER TABLE cdts ADD COLUMN modificado_en TEXT;
UPDATE cdts SET uid = lower(
    hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' ||
    substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)));
UPDATE cdts SET modificado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
CREATE UNIQUE INDEX ux_cdts_uid ON cdts (uid);

-- cajitas
ALTER TABLE cajitas ADD COLUMN uid TEXT;
ALTER TABLE cajitas ADD COLUMN modificado_en TEXT;
UPDATE cajitas SET uid = lower(
    hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' ||
    substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)));
UPDATE cajitas SET modificado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
CREATE UNIQUE INDEX ux_cajitas_uid ON cajitas (uid);

-- compras_credito
ALTER TABLE compras_credito ADD COLUMN uid TEXT;
ALTER TABLE compras_credito ADD COLUMN modificado_en TEXT;
UPDATE compras_credito SET uid = lower(
    hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' ||
    substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)));
UPDATE compras_credito SET modificado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
CREATE UNIQUE INDEX ux_compras_credito_uid ON compras_credito (uid);

-- cuotas
ALTER TABLE cuotas ADD COLUMN uid TEXT;
ALTER TABLE cuotas ADD COLUMN modificado_en TEXT;
UPDATE cuotas SET uid = lower(
    hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' ||
    substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)));
UPDATE cuotas SET modificado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
CREATE UNIQUE INDEX ux_cuotas_uid ON cuotas (uid);

-- importaciones
ALTER TABLE importaciones ADD COLUMN uid TEXT;
ALTER TABLE importaciones ADD COLUMN modificado_en TEXT;
UPDATE importaciones SET uid = lower(
    hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' ||
    substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)));
UPDATE importaciones SET modificado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
CREATE UNIQUE INDEX ux_importaciones_uid ON importaciones (uid);

-- plantillas_banco
ALTER TABLE plantillas_banco ADD COLUMN uid TEXT;
ALTER TABLE plantillas_banco ADD COLUMN modificado_en TEXT;
UPDATE plantillas_banco SET uid = lower(
    hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' ||
    substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)));
UPDATE plantillas_banco SET modificado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
CREATE UNIQUE INDEX ux_plantillas_banco_uid ON plantillas_banco (uid);

-- personas
ALTER TABLE personas ADD COLUMN modificado_en TEXT;
UPDATE personas SET modificado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

-- prestamos
ALTER TABLE prestamos ADD COLUMN modificado_en TEXT;
UPDATE prestamos SET modificado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

-- prestamo_cuotas
ALTER TABLE prestamo_cuotas ADD COLUMN modificado_en TEXT;
UPDATE prestamo_cuotas SET modificado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

-- gastos_grupales
ALTER TABLE gastos_grupales ADD COLUMN modificado_en TEXT;
UPDATE gastos_grupales SET modificado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

-- ajustes
ALTER TABLE ajustes ADD COLUMN modificado_en TEXT;
UPDATE ajustes SET modificado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

-- comercios_nit
ALTER TABLE comercios_nit ADD COLUMN modificado_en TEXT;
UPDATE comercios_nit SET modificado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

CREATE TRIGGER sinc_cuentas_ins AFTER INSERT ON cuentas WHEN NEW.modificado_en IS NULL OR NEW.uid IS NULL BEGIN
  UPDATE cuentas SET uid = COALESCE(uid, lower(
    hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' ||
    substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
      modificado_en = COALESCE(NEW.modificado_en, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER sinc_cuentas_upd AFTER UPDATE ON cuentas WHEN NEW.modificado_en IS OLD.modificado_en AND NEW.uid IS OLD.uid BEGIN
  UPDATE cuentas SET modificado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER sinc_cuentas_del AFTER DELETE ON cuentas BEGIN
  INSERT OR REPLACE INTO borrados (tabla, uid, borrado_en) VALUES ('cuentas', OLD.uid, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER sinc_categorias_ins AFTER INSERT ON categorias WHEN NEW.modificado_en IS NULL OR NEW.uid IS NULL BEGIN
  UPDATE categorias SET uid = COALESCE(uid, lower(
    hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' ||
    substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
      modificado_en = COALESCE(NEW.modificado_en, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER sinc_categorias_upd AFTER UPDATE ON categorias WHEN NEW.modificado_en IS OLD.modificado_en AND NEW.uid IS OLD.uid BEGIN
  UPDATE categorias SET modificado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER sinc_categorias_del AFTER DELETE ON categorias BEGIN
  INSERT OR REPLACE INTO borrados (tabla, uid, borrado_en) VALUES ('categorias', OLD.uid, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER sinc_etiquetas_ins AFTER INSERT ON etiquetas WHEN NEW.modificado_en IS NULL OR NEW.uid IS NULL BEGIN
  UPDATE etiquetas SET uid = COALESCE(uid, lower(
    hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' ||
    substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
      modificado_en = COALESCE(NEW.modificado_en, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER sinc_etiquetas_upd AFTER UPDATE ON etiquetas WHEN NEW.modificado_en IS OLD.modificado_en AND NEW.uid IS OLD.uid BEGIN
  UPDATE etiquetas SET modificado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER sinc_etiquetas_del AFTER DELETE ON etiquetas BEGIN
  INSERT OR REPLACE INTO borrados (tabla, uid, borrado_en) VALUES ('etiquetas', OLD.uid, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER sinc_transacciones_ins AFTER INSERT ON transacciones WHEN NEW.modificado_en IS NULL OR NEW.uid IS NULL BEGIN
  UPDATE transacciones SET uid = COALESCE(uid, lower(
    hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' ||
    substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
      modificado_en = COALESCE(NEW.modificado_en, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER sinc_transacciones_upd AFTER UPDATE ON transacciones WHEN NEW.modificado_en IS OLD.modificado_en AND NEW.uid IS OLD.uid BEGIN
  UPDATE transacciones SET modificado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER sinc_transacciones_del AFTER DELETE ON transacciones BEGIN
  INSERT OR REPLACE INTO borrados (tabla, uid, borrado_en) VALUES ('transacciones', OLD.uid, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER sinc_transaccion_etiquetas_ins AFTER INSERT ON transaccion_etiquetas WHEN NEW.modificado_en IS NULL OR NEW.uid IS NULL BEGIN
  UPDATE transaccion_etiquetas SET uid = COALESCE(uid, lower(
    hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' ||
    substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
      modificado_en = COALESCE(NEW.modificado_en, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER sinc_transaccion_etiquetas_upd AFTER UPDATE ON transaccion_etiquetas WHEN NEW.modificado_en IS OLD.modificado_en AND NEW.uid IS OLD.uid BEGIN
  UPDATE transaccion_etiquetas SET modificado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER sinc_transaccion_etiquetas_del AFTER DELETE ON transaccion_etiquetas BEGIN
  INSERT OR REPLACE INTO borrados (tabla, uid, borrado_en) VALUES ('transaccion_etiquetas', OLD.uid, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER sinc_reglas_ins AFTER INSERT ON reglas WHEN NEW.modificado_en IS NULL OR NEW.uid IS NULL BEGIN
  UPDATE reglas SET uid = COALESCE(uid, lower(
    hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' ||
    substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
      modificado_en = COALESCE(NEW.modificado_en, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER sinc_reglas_upd AFTER UPDATE ON reglas WHEN NEW.modificado_en IS OLD.modificado_en AND NEW.uid IS OLD.uid BEGIN
  UPDATE reglas SET modificado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER sinc_reglas_del AFTER DELETE ON reglas BEGIN
  INSERT OR REPLACE INTO borrados (tabla, uid, borrado_en) VALUES ('reglas', OLD.uid, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER sinc_presupuestos_ins AFTER INSERT ON presupuestos WHEN NEW.modificado_en IS NULL OR NEW.uid IS NULL BEGIN
  UPDATE presupuestos SET uid = COALESCE(uid, lower(
    hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' ||
    substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
      modificado_en = COALESCE(NEW.modificado_en, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER sinc_presupuestos_upd AFTER UPDATE ON presupuestos WHEN NEW.modificado_en IS OLD.modificado_en AND NEW.uid IS OLD.uid BEGIN
  UPDATE presupuestos SET modificado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER sinc_presupuestos_del AFTER DELETE ON presupuestos BEGIN
  INSERT OR REPLACE INTO borrados (tabla, uid, borrado_en) VALUES ('presupuestos', OLD.uid, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER sinc_cdts_ins AFTER INSERT ON cdts WHEN NEW.modificado_en IS NULL OR NEW.uid IS NULL BEGIN
  UPDATE cdts SET uid = COALESCE(uid, lower(
    hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' ||
    substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
      modificado_en = COALESCE(NEW.modificado_en, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER sinc_cdts_upd AFTER UPDATE ON cdts WHEN NEW.modificado_en IS OLD.modificado_en AND NEW.uid IS OLD.uid BEGIN
  UPDATE cdts SET modificado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER sinc_cdts_del AFTER DELETE ON cdts BEGIN
  INSERT OR REPLACE INTO borrados (tabla, uid, borrado_en) VALUES ('cdts', OLD.uid, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER sinc_cajitas_ins AFTER INSERT ON cajitas WHEN NEW.modificado_en IS NULL OR NEW.uid IS NULL BEGIN
  UPDATE cajitas SET uid = COALESCE(uid, lower(
    hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' ||
    substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
      modificado_en = COALESCE(NEW.modificado_en, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER sinc_cajitas_upd AFTER UPDATE ON cajitas WHEN NEW.modificado_en IS OLD.modificado_en AND NEW.uid IS OLD.uid BEGIN
  UPDATE cajitas SET modificado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER sinc_cajitas_del AFTER DELETE ON cajitas BEGIN
  INSERT OR REPLACE INTO borrados (tabla, uid, borrado_en) VALUES ('cajitas', OLD.uid, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER sinc_compras_credito_ins AFTER INSERT ON compras_credito WHEN NEW.modificado_en IS NULL OR NEW.uid IS NULL BEGIN
  UPDATE compras_credito SET uid = COALESCE(uid, lower(
    hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' ||
    substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
      modificado_en = COALESCE(NEW.modificado_en, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER sinc_compras_credito_upd AFTER UPDATE ON compras_credito WHEN NEW.modificado_en IS OLD.modificado_en AND NEW.uid IS OLD.uid BEGIN
  UPDATE compras_credito SET modificado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER sinc_compras_credito_del AFTER DELETE ON compras_credito BEGIN
  INSERT OR REPLACE INTO borrados (tabla, uid, borrado_en) VALUES ('compras_credito', OLD.uid, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER sinc_cuotas_ins AFTER INSERT ON cuotas WHEN NEW.modificado_en IS NULL OR NEW.uid IS NULL BEGIN
  UPDATE cuotas SET uid = COALESCE(uid, lower(
    hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' ||
    substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
      modificado_en = COALESCE(NEW.modificado_en, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER sinc_cuotas_upd AFTER UPDATE ON cuotas WHEN NEW.modificado_en IS OLD.modificado_en AND NEW.uid IS OLD.uid BEGIN
  UPDATE cuotas SET modificado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER sinc_cuotas_del AFTER DELETE ON cuotas BEGIN
  INSERT OR REPLACE INTO borrados (tabla, uid, borrado_en) VALUES ('cuotas', OLD.uid, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER sinc_importaciones_ins AFTER INSERT ON importaciones WHEN NEW.modificado_en IS NULL OR NEW.uid IS NULL BEGIN
  UPDATE importaciones SET uid = COALESCE(uid, lower(
    hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' ||
    substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
      modificado_en = COALESCE(NEW.modificado_en, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER sinc_importaciones_upd AFTER UPDATE ON importaciones WHEN NEW.modificado_en IS OLD.modificado_en AND NEW.uid IS OLD.uid BEGIN
  UPDATE importaciones SET modificado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER sinc_importaciones_del AFTER DELETE ON importaciones BEGIN
  INSERT OR REPLACE INTO borrados (tabla, uid, borrado_en) VALUES ('importaciones', OLD.uid, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER sinc_plantillas_banco_ins AFTER INSERT ON plantillas_banco WHEN NEW.modificado_en IS NULL OR NEW.uid IS NULL BEGIN
  UPDATE plantillas_banco SET uid = COALESCE(uid, lower(
    hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' ||
    substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
      modificado_en = COALESCE(NEW.modificado_en, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER sinc_plantillas_banco_upd AFTER UPDATE ON plantillas_banco WHEN NEW.modificado_en IS OLD.modificado_en AND NEW.uid IS OLD.uid BEGIN
  UPDATE plantillas_banco SET modificado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER sinc_plantillas_banco_del AFTER DELETE ON plantillas_banco BEGIN
  INSERT OR REPLACE INTO borrados (tabla, uid, borrado_en) VALUES ('plantillas_banco', OLD.uid, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER sinc_personas_ins AFTER INSERT ON personas WHEN NEW.modificado_en IS NULL OR NEW.uid IS NULL BEGIN
  UPDATE personas SET modificado_en = COALESCE(NEW.modificado_en, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER sinc_personas_upd AFTER UPDATE ON personas WHEN NEW.modificado_en IS OLD.modificado_en AND NEW.uid IS OLD.uid BEGIN
  UPDATE personas SET modificado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER sinc_personas_del AFTER DELETE ON personas BEGIN
  INSERT OR REPLACE INTO borrados (tabla, uid, borrado_en) VALUES ('personas', OLD.uid, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER sinc_prestamos_ins AFTER INSERT ON prestamos WHEN NEW.modificado_en IS NULL OR NEW.uid IS NULL BEGIN
  UPDATE prestamos SET modificado_en = COALESCE(NEW.modificado_en, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER sinc_prestamos_upd AFTER UPDATE ON prestamos WHEN NEW.modificado_en IS OLD.modificado_en AND NEW.uid IS OLD.uid BEGIN
  UPDATE prestamos SET modificado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER sinc_prestamos_del AFTER DELETE ON prestamos BEGIN
  INSERT OR REPLACE INTO borrados (tabla, uid, borrado_en) VALUES ('prestamos', OLD.uid, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER sinc_prestamo_cuotas_ins AFTER INSERT ON prestamo_cuotas WHEN NEW.modificado_en IS NULL OR NEW.uid IS NULL BEGIN
  UPDATE prestamo_cuotas SET modificado_en = COALESCE(NEW.modificado_en, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER sinc_prestamo_cuotas_upd AFTER UPDATE ON prestamo_cuotas WHEN NEW.modificado_en IS OLD.modificado_en AND NEW.uid IS OLD.uid BEGIN
  UPDATE prestamo_cuotas SET modificado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER sinc_prestamo_cuotas_del AFTER DELETE ON prestamo_cuotas BEGIN
  INSERT OR REPLACE INTO borrados (tabla, uid, borrado_en) VALUES ('prestamo_cuotas', OLD.uid, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER sinc_gastos_grupales_ins AFTER INSERT ON gastos_grupales WHEN NEW.modificado_en IS NULL OR NEW.uid IS NULL BEGIN
  UPDATE gastos_grupales SET modificado_en = COALESCE(NEW.modificado_en, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER sinc_gastos_grupales_upd AFTER UPDATE ON gastos_grupales WHEN NEW.modificado_en IS OLD.modificado_en AND NEW.uid IS OLD.uid BEGIN
  UPDATE gastos_grupales SET modificado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER sinc_gastos_grupales_del AFTER DELETE ON gastos_grupales BEGIN
  INSERT OR REPLACE INTO borrados (tabla, uid, borrado_en) VALUES ('gastos_grupales', OLD.uid, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER sinc_ajustes_ins AFTER INSERT ON ajustes WHEN NEW.modificado_en IS NULL BEGIN
  UPDATE ajustes SET modificado_en = COALESCE(NEW.modificado_en, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER sinc_ajustes_upd AFTER UPDATE ON ajustes WHEN NEW.modificado_en IS OLD.modificado_en BEGIN
  UPDATE ajustes SET modificado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER sinc_ajustes_del AFTER DELETE ON ajustes BEGIN
  INSERT OR REPLACE INTO borrados (tabla, uid, borrado_en) VALUES ('ajustes', OLD.clave, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER sinc_comercios_nit_ins AFTER INSERT ON comercios_nit WHEN NEW.modificado_en IS NULL BEGIN
  UPDATE comercios_nit SET modificado_en = COALESCE(NEW.modificado_en, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER sinc_comercios_nit_upd AFTER UPDATE ON comercios_nit WHEN NEW.modificado_en IS OLD.modificado_en BEGIN
  UPDATE comercios_nit SET modificado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER sinc_comercios_nit_del AFTER DELETE ON comercios_nit BEGIN
  INSERT OR REPLACE INTO borrados (tabla, uid, borrado_en) VALUES ('comercios_nit', OLD.nit, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;
