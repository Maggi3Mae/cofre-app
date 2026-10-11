-- Fase 2 · Bloque 5: facturas.
--  · transacciones.cufe: código único de la factura electrónica DIAN; evita registrar la misma dos veces.
--  · comercios_nit: el nombre que la usuaria le da a cada NIT («890904478» → «Colanta»).
ALTER TABLE transacciones ADD COLUMN cufe TEXT;
CREATE UNIQUE INDEX ux_tx_cufe ON transacciones (usuario_id, cufe) WHERE cufe IS NOT NULL;

CREATE TABLE comercios_nit (
  usuario_id INTEGER NOT NULL DEFAULT 1 REFERENCES usuarios(id),
  nit TEXT NOT NULL,
  nombre TEXT NOT NULL,
  PRIMARY KEY (usuario_id, nit)
);
