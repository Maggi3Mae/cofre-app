-- Fase 1b · ajustes de modelo:
--  · Deuda de tarjetas en positivo + configuración de intereses y comisión por tarjeta.
--  · Compras a cuotas: compras_credito + cuotas (reemplaza planes_cuotas, sin uso aún).
--  · Ajustes clave/valor (TRM, orden del Dashboard…).
--  · Categorías: ícono de trazo (nunca emoji) y color por rol del sistema Cofre.

-- 1. Tarjetas de crédito
UPDATE cuentas SET saldo_inicial = ABS(saldo_inicial) WHERE tipo = 'credito';
-- Si cobra interés en compras a 1 cuota (0 = no cobra si pagas antes de la fecha límite).
ALTER TABLE cuentas ADD COLUMN interes_una_cuota INTEGER NOT NULL DEFAULT 1;
-- Comisión por compra internacional (0,029 = 2,9 %), se suma al capital.
ALTER TABLE cuentas ADD COLUMN comision_internacional REAL NOT NULL DEFAULT 0.029;

-- 2. Quitar transacciones.plan_cuotas_id (SQLite exige reconstruir la tabla).
--    Se respaldan las etiquetas porque borrar la tabla vieja dispara el ON DELETE CASCADE.
CREATE TEMP TABLE _te AS SELECT * FROM transaccion_etiquetas;

CREATE TABLE transacciones_nueva (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL DEFAULT 1 REFERENCES usuarios(id),
  fecha TEXT NOT NULL,
  monto INTEGER NOT NULL CHECK (monto >= 0),
  tipo TEXT NOT NULL CHECK (tipo IN ('ingreso','egreso','transferencia')),
  cuenta_id INTEGER NOT NULL REFERENCES cuentas(id),
  cuenta_destino_id INTEGER REFERENCES cuentas(id),
  categoria_id INTEGER REFERENCES categorias(id) ON DELETE SET NULL,
  comercio TEXT,
  notas TEXT,
  huella TEXT,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO transacciones_nueva
  SELECT id, usuario_id, fecha, monto, tipo, cuenta_id, cuenta_destino_id, categoria_id,
         comercio, notas, huella, creado_en
  FROM transacciones;
DROP TABLE transacciones;
ALTER TABLE transacciones_nueva RENAME TO transacciones;

CREATE INDEX ix_tx_fecha ON transacciones (usuario_id, fecha);
CREATE UNIQUE INDEX ux_tx_huella ON transacciones (usuario_id, huella) WHERE huella IS NOT NULL;
CREATE INDEX ix_tx_comercio ON transacciones (usuario_id, comercio COLLATE NOCASE);
CREATE INDEX ix_tx_cuenta ON transacciones (cuenta_id);
CREATE INDEX ix_tx_destino ON transacciones (cuenta_destino_id);
CREATE INDEX ix_tx_categoria ON transacciones (categoria_id);

INSERT INTO transaccion_etiquetas SELECT * FROM _te;
DROP TABLE _te;

DROP TABLE planes_cuotas;

-- 3. Compras a cuotas. Las cuotas futuras NO son transacciones: son el plan teórico.
--    Los pagos reales llegan del extracto.
CREATE TABLE compras_credito (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL DEFAULT 1 REFERENCES usuarios(id),
  cuenta_id INTEGER NOT NULL REFERENCES cuentas(id),
  -- Egreso creado al registrar la compra; al importar el extracto se reconoce como ya registrado.
  transaccion_id INTEGER REFERENCES transacciones(id) ON DELETE SET NULL,
  comercio TEXT NOT NULL,
  fecha TEXT NOT NULL,
  monto_base INTEGER NOT NULL CHECK (monto_base > 0),
  internacional INTEGER NOT NULL DEFAULT 0,
  comision INTEGER NOT NULL DEFAULT 0,
  capital INTEGER NOT NULL,              -- monto_base + comision
  num_cuotas INTEGER NOT NULL CHECK (num_cuotas >= 1),
  tasa_ea REAL NOT NULL,                 -- tasa aplicada (0 si no cobra interés)
  cuota INTEGER NOT NULL,                -- cuota fija (anualidad)
  total INTEGER NOT NULL,                -- cuota × num_cuotas
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_compras_cuenta ON compras_credito (cuenta_id);

CREATE TABLE cuotas (
  id INTEGER PRIMARY KEY,
  compra_id INTEGER NOT NULL REFERENCES compras_credito(id) ON DELETE CASCADE,
  numero INTEGER NOT NULL,
  fecha TEXT NOT NULL,
  capital INTEGER NOT NULL,
  interes INTEGER NOT NULL,
  saldo INTEGER NOT NULL,                -- capital pendiente después de esta cuota
  UNIQUE (compra_id, numero)
);
CREATE INDEX ix_cuotas_fecha ON cuotas (fecha);

-- 4. Ajustes (TRM, orden del Dashboard, etc.)
CREATE TABLE ajustes (
  usuario_id INTEGER NOT NULL DEFAULT 1 REFERENCES usuarios(id),
  clave TEXT NOT NULL,
  valor TEXT NOT NULL,
  PRIMARY KEY (usuario_id, clave)
);

-- 5. Categorías: ícono de trazo y rol de color (marca | ingreso | egreso | ahorro).
UPDATE categorias SET color = CASE tipo WHEN 'ingreso' THEN 'ingreso' ELSE 'egreso' END;
UPDATE categorias SET color = 'ahorro' WHERE nombre = 'Rendimientos';
UPDATE categorias SET icono = CASE nombre
  WHEN 'Comida' THEN 'comida'
  WHEN 'Mercado' THEN 'carrito'
  WHEN 'Transporte' THEN 'transporte'
  WHEN 'Hogar' THEN 'hogar'
  WHEN 'Servicios' THEN 'servicios'
  WHEN 'Suscripciones' THEN 'suscripciones'
  WHEN 'Salud' THEN 'salud'
  WHEN 'Entretenimiento' THEN 'entretenimiento'
  WHEN 'Ropa' THEN 'ropa'
  WHEN 'Educación' THEN 'educacion'
  WHEN 'Salario' THEN 'salario'
  WHEN 'Rendimientos' THEN 'rendimientos'
  ELSE 'otros' END;
