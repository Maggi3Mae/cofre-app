-- Fase 2 · Bloque 4: formatos de extracto que enseña la usuaria (bancos que Cofre no trae).
--  · frase: texto que aparece en el extracto y lo identifica (comparado sin tildes ni mayúsculas).
--  · config: JSON con columnas, formato de fecha, separador decimal y convención de signo.
CREATE TABLE plantillas_banco (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL DEFAULT 1 REFERENCES usuarios(id),
  nombre TEXT NOT NULL,
  banco TEXT NOT NULL,
  tipo_cuenta TEXT NOT NULL CHECK (tipo_cuenta IN ('debito','credito','efectivo','inversion')),
  cuenta_id INTEGER REFERENCES cuentas(id) ON DELETE SET NULL,
  frase TEXT NOT NULL,
  documento TEXT NOT NULL CHECK (documento IN ('pdf','hoja')),
  config TEXT NOT NULL,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);
