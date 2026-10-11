-- Fase 3 · Foto de la factura adjunta al movimiento.
-- Solo el nombre del archivo (WebP en <datos de la app>/adjuntos/); la imagen nunca entra a la base.
ALTER TABLE transacciones ADD COLUMN adjunto TEXT;
