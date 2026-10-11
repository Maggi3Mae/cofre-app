-- Fase 2 · Bloque 3: reglas de categoría y cruce de movimientos.
--  · reglas.tipo: 'comercio' (comercio exacto, aprendida) o 'palabra' (palabra clave en la descripción).
--  · reglas.origen: 'aprendida' (la creó la usuaria) o 'fabrica' (diccionario inicial, editable).
--    Los patrones se guardan en minúsculas y sin tildes.
--  · transacciones.huella_par: huella del «otro lado» cuando un movimiento importado se une con uno que
--    ya existía (pago de tarjeta visto en los dos extractos, Bre-B entre cuentas, registro a mano).
ALTER TABLE reglas ADD COLUMN tipo TEXT NOT NULL DEFAULT 'comercio' CHECK (tipo IN ('comercio','palabra'));
ALTER TABLE reglas ADD COLUMN origen TEXT NOT NULL DEFAULT 'aprendida' CHECK (origen IN ('aprendida','fabrica'));
CREATE UNIQUE INDEX ux_reglas_patron ON reglas (usuario_id, tipo, patron);

ALTER TABLE transacciones ADD COLUMN huella_par TEXT;
CREATE UNIQUE INDEX ux_tx_huella_par ON transacciones (usuario_id, huella_par) WHERE huella_par IS NOT NULL;

-- Diccionario inicial (solo si la categoría existe con ese nombre).
INSERT OR IGNORE INTO reglas (usuario_id, patron, categoria_id, tipo, origen)
SELECT 1, p.column1, c.id, 'palabra', 'fabrica' FROM (VALUES
  ('supermercado'),
  ('mercado'),
  ('d1'),
  ('ara'),
  ('exito'),
  ('jumbo'),
  ('olimpica'),
  ('carulla'),
  ('pricesmart'),
  ('alkosto'),
  ('makro'),
  ('colanta'),
  ('mercolanta'),
  ('carniceria'),
  ('carnica'),
  ('fruver'),
  ('surtimax'),
  ('isimo'),
  ('justo y bueno'),
  ('zapatoca'),
  ('mercaderia')
) p, categorias c
WHERE c.usuario_id = 1 AND c.nombre = 'Mercado' AND c.padre_id IS NULL;

INSERT OR IGNORE INTO reglas (usuario_id, patron, categoria_id, tipo, origen)
SELECT 1, p.column1, c.id, 'palabra', 'fabrica' FROM (VALUES
  ('drogueria'),
  ('drog'),
  ('farmatodo'),
  ('cruz verde'),
  ('farmacia'),
  ('ips'),
  ('eps'),
  ('clinica'),
  ('hospital'),
  ('laboratorio'),
  ('odontologia'),
  ('optica'),
  ('medico'),
  ('colsanitas'),
  ('sura')
) p, categorias c
WHERE c.usuario_id = 1 AND c.nombre = 'Salud' AND c.padre_id IS NULL;

INSERT OR IGNORE INTO reglas (usuario_id, patron, categoria_id, tipo, origen)
SELECT 1, p.column1, c.id, 'palabra', 'fabrica' FROM (VALUES
  ('uber'),
  ('didi'),
  ('cabify'),
  ('indrive'),
  ('transmilenio'),
  ('tullave'),
  ('peaje'),
  ('terpel'),
  ('gasolina'),
  ('eds'),
  ('primax'),
  ('texaco'),
  ('biomax'),
  ('soat'),
  ('parqueadero'),
  ('parking')
) p, categorias c
WHERE c.usuario_id = 1 AND c.nombre = 'Transporte' AND c.padre_id IS NULL;

INSERT OR IGNORE INTO reglas (usuario_id, patron, categoria_id, tipo, origen)
SELECT 1, p.column1, c.id, 'palabra', 'fabrica' FROM (VALUES
  ('restaurante'),
  ('rappi'),
  ('crepes'),
  ('crepesywaffles'),
  ('sandwich'),
  ('pizza'),
  ('cafe'),
  ('panaderia'),
  ('ifood'),
  ('burger'),
  ('mcdonalds'),
  ('frisby'),
  ('kfc'),
  ('juan valdez'),
  ('starbucks'),
  ('oma'),
  ('sushi'),
  ('wok'),
  ('el corral'),
  ('seafood'),
  ('domicilios')
) p, categorias c
WHERE c.usuario_id = 1 AND c.nombre = 'Comida' AND c.padre_id IS NULL;

INSERT OR IGNORE INTO reglas (usuario_id, patron, categoria_id, tipo, origen)
SELECT 1, p.column1, c.id, 'palabra', 'fabrica' FROM (VALUES
  ('tigo'),
  ('claro'),
  ('movistar'),
  ('etb'),
  ('wom'),
  ('codensa'),
  ('enel'),
  ('vanti'),
  ('acueducto'),
  ('gas natural'),
  ('administracion')
) p, categorias c
WHERE c.usuario_id = 1 AND c.nombre = 'Servicios' AND c.padre_id IS NULL;

INSERT OR IGNORE INTO reglas (usuario_id, patron, categoria_id, tipo, origen)
SELECT 1, p.column1, c.id, 'palabra', 'fabrica' FROM (VALUES
  ('netflix'),
  ('spotify'),
  ('disney'),
  ('hbo'),
  ('youtube'),
  ('apple'),
  ('icloud'),
  ('google'),
  ('prime video'),
  ('amazon prime'),
  ('chatgpt'),
  ('openai'),
  ('crunchyroll'),
  ('paramount')
) p, categorias c
WHERE c.usuario_id = 1 AND c.nombre = 'Suscripciones' AND c.padre_id IS NULL;

INSERT OR IGNORE INTO reglas (usuario_id, patron, categoria_id, tipo, origen)
SELECT 1, p.column1, c.id, 'palabra', 'fabrica' FROM (VALUES
  ('cine'),
  ('cinecolombia'),
  ('cine colombia'),
  ('cinemark'),
  ('procinal'),
  ('tuboleta'),
  ('eticket'),
  ('teatro')
) p, categorias c
WHERE c.usuario_id = 1 AND c.nombre = 'Entretenimiento' AND c.padre_id IS NULL;

INSERT OR IGNORE INTO reglas (usuario_id, patron, categoria_id, tipo, origen)
SELECT 1, p.column1, c.id, 'palabra', 'fabrica' FROM (VALUES
  ('zara'),
  ('arturo calle'),
  ('studio f'),
  ('koaj'),
  ('adidas'),
  ('nike'),
  ('tennis'),
  ('pull bear'),
  ('bershka'),
  ('mango')
) p, categorias c
WHERE c.usuario_id = 1 AND c.nombre = 'Ropa' AND c.padre_id IS NULL;

INSERT OR IGNORE INTO reglas (usuario_id, patron, categoria_id, tipo, origen)
SELECT 1, p.column1, c.id, 'palabra', 'fabrica' FROM (VALUES
  ('universidad'),
  ('colegio'),
  ('platzi'),
  ('udemy'),
  ('coursera'),
  ('libreria')
) p, categorias c
WHERE c.usuario_id = 1 AND c.nombre = 'Educación' AND c.padre_id IS NULL;

INSERT OR IGNORE INTO reglas (usuario_id, patron, categoria_id, tipo, origen)
SELECT 1, p.column1, c.id, 'palabra', 'fabrica' FROM (VALUES
  ('homecenter'),
  ('ikea'),
  ('tugo'),
  ('ferreteria')
) p, categorias c
WHERE c.usuario_id = 1 AND c.nombre = 'Hogar' AND c.padre_id IS NULL;

INSERT OR IGNORE INTO reglas (usuario_id, patron, categoria_id, tipo, origen)
SELECT 1, p.column1, c.id, 'palabra', 'fabrica' FROM (VALUES
  ('intereses'),
  ('rendimientos')
) p, categorias c
WHERE c.usuario_id = 1 AND c.nombre = 'Rendimientos' AND c.padre_id IS NULL;

-- De qué importación vino el «otro lado» (para que «Deshacer» suelte el enlace).
ALTER TABLE transacciones ADD COLUMN importacion_par_id INTEGER REFERENCES importaciones(id) ON DELETE SET NULL;
