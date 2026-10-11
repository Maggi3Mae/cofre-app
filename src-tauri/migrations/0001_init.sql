-- Esquema inicial de Cofre. Montos en centavos (INTEGER) para evitar errores de redondeo.
CREATE TABLE usuarios (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO usuarios (id, nombre) VALUES (1, 'Yo');

CREATE TABLE cuentas (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL DEFAULT 1 REFERENCES usuarios(id),
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('debito','credito','efectivo','inversion')),
  moneda TEXT NOT NULL DEFAULT 'COP' CHECK (moneda IN ('COP','USD')),
  banco TEXT,
  ultimos4 TEXT,
  saldo_inicial INTEGER NOT NULL DEFAULT 0,
  cupo INTEGER,
  dia_corte INTEGER,
  dia_pago INTEGER,
  tasa_ea REAL,
  principal INTEGER NOT NULL DEFAULT 0,
  archivada INTEGER NOT NULL DEFAULT 0,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE categorias (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL DEFAULT 1 REFERENCES usuarios(id),
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('ingreso','egreso')),
  icono TEXT,
  color TEXT,
  padre_id INTEGER REFERENCES categorias(id) ON DELETE SET NULL
);

CREATE TABLE etiquetas (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL DEFAULT 1 REFERENCES usuarios(id),
  nombre TEXT NOT NULL,
  UNIQUE (usuario_id, nombre)
);

CREATE TABLE transacciones (
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
  plan_cuotas_id INTEGER REFERENCES planes_cuotas(id) ON DELETE SET NULL,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_tx_fecha ON transacciones (usuario_id, fecha);
CREATE UNIQUE INDEX ux_tx_huella ON transacciones (usuario_id, huella) WHERE huella IS NOT NULL;

CREATE TABLE transaccion_etiquetas (
  transaccion_id INTEGER NOT NULL REFERENCES transacciones(id) ON DELETE CASCADE,
  etiqueta_id INTEGER NOT NULL REFERENCES etiquetas(id) ON DELETE CASCADE,
  PRIMARY KEY (transaccion_id, etiqueta_id)
);

CREATE TABLE reglas (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL DEFAULT 1 REFERENCES usuarios(id),
  patron TEXT NOT NULL,
  categoria_id INTEGER NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
  es_transferencia INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE presupuestos (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL DEFAULT 1 REFERENCES usuarios(id),
  categoria_id INTEGER NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
  monto_mensual INTEGER NOT NULL,
  UNIQUE (usuario_id, categoria_id)
);

CREATE TABLE cdts (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL DEFAULT 1 REFERENCES usuarios(id),
  nombre TEXT NOT NULL,
  monto INTEGER NOT NULL,
  tasa_ea REAL NOT NULL,
  fecha_inicio TEXT NOT NULL,
  plazo_dias INTEGER NOT NULL,
  renovacion_auto INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE cajitas (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL DEFAULT 1 REFERENCES usuarios(id),
  nombre TEXT NOT NULL,
  saldo INTEGER NOT NULL DEFAULT 0,
  tasa_ea REAL NOT NULL DEFAULT 0,
  meta INTEGER,
  fecha_meta TEXT,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE planes_cuotas (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL DEFAULT 1 REFERENCES usuarios(id),
  cuenta_id INTEGER NOT NULL REFERENCES cuentas(id),
  descripcion TEXT NOT NULL,
  monto INTEGER NOT NULL,
  num_cuotas INTEGER NOT NULL,
  tasa_ea REAL NOT NULL,
  fecha_inicio TEXT NOT NULL
);

CREATE TABLE alertas_enviadas (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL DEFAULT 1 REFERENCES usuarios(id),
  clave TEXT NOT NULL,
  enviada_en TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (usuario_id, clave)
);
