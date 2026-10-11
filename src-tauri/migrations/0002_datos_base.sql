-- Fase 1b: índices para filtros y sugerencias, y categorías por defecto.
-- color guarda una clave de la paleta de Cofre (ver src/lib/datos/paleta.ts), no un hex,
-- para que se adapte al tema claro/oscuro.
CREATE INDEX ix_tx_comercio ON transacciones (usuario_id, comercio COLLATE NOCASE);
CREATE INDEX ix_tx_cuenta ON transacciones (cuenta_id);
CREATE INDEX ix_tx_destino ON transacciones (cuenta_destino_id);
CREATE INDEX ix_tx_categoria ON transacciones (categoria_id);

INSERT INTO categorias (nombre, tipo, icono, color) VALUES
  ('Comida',          'egreso',  '🍔', 'rosa'),
  ('Mercado',         'egreso',  '🛒', 'menta'),
  ('Transporte',      'egreso',  '🚗', 'naranja'),
  ('Hogar',           'egreso',  '🏠', 'violeta'),
  ('Servicios',       'egreso',  '💡', 'ambar'),
  ('Suscripciones',   'egreso',  '📺', 'coral'),
  ('Salud',           'egreso',  '💊', 'menta'),
  ('Entretenimiento', 'egreso',  '🎉', 'rosa'),
  ('Ropa',            'egreso',  '👕', 'violeta'),
  ('Educación',       'egreso',  '📚', 'ambar'),
  ('Otros gastos',    'egreso',  '📦', 'gris'),
  ('Salario',         'ingreso', '💼', 'menta'),
  ('Rendimientos',    'ingreso', '📈', 'ambar'),
  ('Otros ingresos',  'ingreso', '💰', 'gris');
