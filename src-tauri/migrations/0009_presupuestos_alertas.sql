-- Fase 3 · Presupuestos y alertas.
--  · presupuestos (0001) ya tiene UNIQUE(usuario_id, categoria_id): uno por categoría.
--  · Solo categorías de egreso: se bloquea a nivel de base de datos.
--  · Alertas: se usa alertas_enviadas (0001) con clave «tipo|referencia|período|umbral»: un aviso por evento.

CREATE TRIGGER presupuesto_solo_egreso_ins BEFORE INSERT ON presupuestos
WHEN (SELECT tipo FROM categorias WHERE id = NEW.categoria_id) IS NOT 'egreso'
BEGIN SELECT RAISE(ABORT, 'Solo las categorías de egreso pueden tener presupuesto.'); END;

CREATE TRIGGER presupuesto_solo_egreso_upd BEFORE UPDATE OF categoria_id ON presupuestos
WHEN (SELECT tipo FROM categorias WHERE id = NEW.categoria_id) IS NOT 'egreso'
BEGIN SELECT RAISE(ABORT, 'Solo las categorías de egreso pueden tener presupuesto.'); END;

-- Si una categoría pasa a ser de ingreso, pierde su presupuesto.
CREATE TRIGGER presupuesto_categoria_a_ingreso AFTER UPDATE OF tipo ON categorias
WHEN NEW.tipo = 'ingreso'
BEGIN DELETE FROM presupuestos WHERE categoria_id = NEW.id; END;

-- Limpiar presupuestos que ya estuvieran en categorías de ingreso.
DELETE FROM presupuestos WHERE categoria_id IN (SELECT id FROM categorias WHERE tipo <> 'egreso');
