-- Fase 1b · transferencias:
--  · monto_destino: lo que entra a la cuenta destino cuando es de otra moneda (COP ↔ USD).
--    NULL = entra lo mismo que sale.
--  · cajita_destino_id / cdt_destino_id: preparados para transferir a cajitas y CDT
--    (se usan en la fase de Inversiones).
ALTER TABLE transacciones ADD COLUMN monto_destino INTEGER CHECK (monto_destino IS NULL OR monto_destino > 0);
ALTER TABLE transacciones ADD COLUMN cajita_destino_id INTEGER REFERENCES cajitas(id) ON DELETE SET NULL;
ALTER TABLE transacciones ADD COLUMN cdt_destino_id INTEGER REFERENCES cdts(id) ON DELETE SET NULL;
