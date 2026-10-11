-- Fase 3 · Inversiones (CDT ahora; cajitas en el bloque 3).
-- Apertura: transferencia cuenta → CDT (cuenta_id = origen, cdt_destino_id).
-- Retiro: transferencia CDT → cuenta (cuenta_id = la cuenta que recibe, cdt_origen_id): SUMA a esa cuenta.
-- Ambos son movimientos entre tus propios activos: no son ingreso ni gasto y no mueven el patrimonio.

ALTER TABLE cdts ADD COLUMN banco TEXT;
ALTER TABLE cdts ADD COLUMN notas TEXT;
ALTER TABLE cdts ADD COLUMN cuenta_origen_id INTEGER REFERENCES cuentas(id) ON DELETE SET NULL;
ALTER TABLE cdts ADD COLUMN retencion REAL NOT NULL DEFAULT 0.04;
ALTER TABLE cdts ADD COLUMN retirado_en TEXT;         -- fecha en que se retiró o se renovó
ALTER TABLE cdts ADD COLUMN renovado INTEGER NOT NULL DEFAULT 0; -- 1 = se cerró porque se renovó
ALTER TABLE cdts ADD COLUMN cdt_anterior_id INTEGER REFERENCES cdts(id) ON DELETE SET NULL;

ALTER TABLE cajitas ADD COLUMN banco TEXT DEFAULT 'Nu';
ALTER TABLE cajitas ADD COLUMN notas TEXT;
ALTER TABLE cajitas ADD COLUMN fecha_saldo TEXT;      -- fecha del saldo guardado (base del interés)

ALTER TABLE transacciones ADD COLUMN cdt_origen_id INTEGER REFERENCES cdts(id) ON DELETE SET NULL;
ALTER TABLE transacciones ADD COLUMN cajita_origen_id INTEGER REFERENCES cajitas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tx_cdt_destino ON transacciones(cdt_destino_id) WHERE cdt_destino_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tx_cdt_origen ON transacciones(cdt_origen_id) WHERE cdt_origen_id IS NOT NULL;
