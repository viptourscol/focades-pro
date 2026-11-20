const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const { PGlite } = require(process.env.PGLITE_PATH || '@electric-sql/pglite');
const dir = path.join(__dirname, '../../supabase/migrations');
const read = (name) => fs.readFileSync(path.join(dir, name), 'utf8');
const ddl = (sql, name) => sql.match(new RegExp(`create table if not exists public\\.${name} \\([\\s\\S]*?\\n\\);`, 'i'))[0];
const fn = (sql, name) => sql.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`, 'i'))[0];

async function main() {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE TABLE portal_beneficiarios(id bigint primary key,n_documento text,deleted_at timestamptz,
        nivel_formacion text, modalidad text, semestre_ingreso integer, semestre_actual integer, estado_beneficiario text);
      CREATE TABLE portal_actualizaciones(id bigserial primary key,beneficiario_id bigint, promedio_semestre_anterior numeric,
        estado text, revisado_at timestamptz, updated_at timestamptz, created_at timestamptz, semestre_actual integer);
      CREATE TABLE pagos(id bigint);
      CREATE TABLE portal_valores_cargue(identificacion text, valor_bruto numeric, valor_neto numeric, numero_rp text,
        numero_op text, numero_egreso text, documento_id uuid);
      CREATE TABLE portal_archivos_op(rp_id uuid,datos jsonb);
    `);
    const rights = read('202603160002_beneficiario_payment_rights.sql');
    const cond = read('202603160013_modulo_condonaciones_base.sql');
    await db.exec([
      ddl(read('202603130006_portal_beneficiarios_360.sql'), 'portal_beneficiario_pagos'),
      ddl(rights, 'portal_beneficiario_pago_ajustes'), ddl(cond, 'portal_condonacion_semestral'),
      fn(rights, 'normalize_beneficiario_level'), fn(rights, 'payment_cap_for_level'),
      fn(read('202608260001_fix_semestre_ingreso_type.sql'), 'compute_beneficiario_payment_rights'),
      fn(rights, 'validate_beneficiario_pago_rights'), fn(cond, 'crear_o_actualizar_condonacion_semestral_por_pago'),
      fn(cond, 'portal_condonacion_handle_pago_trigger'),
      `CREATE TRIGGER validation BEFORE INSERT OR UPDATE OF estado,beneficiario_id ON portal_beneficiario_pagos
        FOR EACH ROW EXECUTE FUNCTION validate_beneficiario_pago_rights();
       CREATE TRIGGER condonacion AFTER INSERT OR UPDATE OF estado ON portal_beneficiario_pagos
        FOR EACH ROW EXECUTE FUNCTION portal_condonacion_handle_pago_trigger();
       INSERT INTO portal_beneficiarios VALUES (1,'111',NULL,'Universitario',NULL,10,NULL,'activo'),
         (2,'222',NULL,'Tecnológico',NULL,8,NULL,'suspendido'),(3,'333',NULL,NULL,NULL,NULL,NULL,'activo'),
         (4,'444',NULL,'Universitario',NULL,1,NULL,'activo');
       INSERT INTO portal_actualizaciones(beneficiario_id,promedio_semestre_anterior,estado)
         VALUES (1,4.1,'aprobada'),(2,4.8,'aprobada'),(4,4.2,'aprobada');`,
      read('20261120143000_piloto_pagos_historicos.sql'),
    ].join('\n'));
    const call = async (id, payments) => (await db.query(
      'SELECT focades_importacion.aplicar_piloto($1,$2,$3) AS r',
      [`10000000-0000-4000-8000-00000000000${id}`, '1'.repeat(64), JSON.stringify(payments)],
    )).rows[0].r;
    const payment = (id, row) => ({
      fila: row, beneficiario_id: id, documento: String(id).repeat(3), monto: 1000,
      concepto: 'Desembolso', periodo: `2018-${row}`, numero_egreso: `EG-${row}`, fecha_egreso: '2018-06-01',
    });
    const people = () => db.query('SELECT * FROM portal_beneficiarios ORDER BY id').then((r) => r.rows);
    const initial = await people();
    const items = [payment(1, 2), payment(2, 3), payment(3, 4), payment(1, 5)];
    items[3].fecha_egreso = '2018-07-01';
    assert.equal((await call(1, items)).incrementos_cupo, 3);
    assert.equal((await call(1, items)).repetido, true);
    await assert.rejects(call(1, [items[0]]), /otro manifiesto/);
    await assert.rejects(call(2, [payment(4, 6), { ...payment(2, 7), documento: '99' }]), /identidad/);
    await assert.rejects(call(3, [items[0]]), /posible pago/);
    await assert.rejects(call(3, [{ ...items[0], fila: 9, monto: 1100 }]), /duplicate key/);
    await db.exec("INSERT INTO portal_valores_cargue (identificacion,valor_bruto) VALUES ('444',1000)");
    await assert.rejects(call(3, [payment(4, 8)]), /posible pago/);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM portal_beneficiario_pagos')).rows[0].n, 4);
    for (const id of [1, 2, 3]) {
      await assert.rejects(db.query(
        "INSERT INTO portal_beneficiario_pagos(beneficiario_id,concepto,monto,estado) VALUES ($1,'Ordinario',100,'efectuado')", [id],
      ), /cupos|activo|Nivel de formacion/);
    }
    await db.exec("INSERT INTO portal_beneficiario_pagos(beneficiario_id,concepto,monto,estado) VALUES (4,'Ordinario',100,'efectuado')");
    await db.exec('SET ROLE authenticated; SELECT public.crear_o_actualizar_condonacion_semestral_por_pago(2); RESET ROLE;');
    const { rows } = await db.query('SELECT promedio_reportado,actualizacion_id,estado_condonacion FROM portal_condonacion_semestral ORDER BY id');
    assert.ok(rows.slice(0, 4).every((c) => c.promedio_reportado === null && c.actualizacion_id === null && c.estado_condonacion === 'pendiente_admin'));
    assert.equal(Number(rows[4].promedio_reportado), 4.2);
    assert.deepEqual(await people(), initial);
    await db.exec('SET ROLE authenticated');
    await assert.rejects(call(4, [payment(4, 8)]), /permission denied/);
    await db.exec('RESET ROLE');
    await db.exec(`
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid $$;
      CREATE FUNCTION public.is_portal_admin(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT current_setting('test.role',true) IN ('admin','pagos') $$;
      CREATE FUNCTION public.exigir_pagos_cargue() RETURNS void LANGUAGE plpgsql AS $$
      BEGIN IF current_setting('test.role',true) IS DISTINCT FROM 'pagos' THEN RAISE EXCEPTION 'No autorizado'; END IF; END $$;
      ALTER TABLE auth.users ADD COLUMN raw_app_meta_data jsonb;
      INSERT INTO auth.users VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','{"roles":["admin_pagos"]}');
      CREATE TABLE public.portal_ventanas_actualizacion(id bigint primary key,nombre text);
      CREATE TABLE public.portal_documentos_cargue(id uuid primary key,convocatoria_id uuid,rp_ventana_id bigint,datos_generales_rp jsonb);
      CREATE TABLE public.portal_archivos_contabilidad(rp_id uuid primary key,estado text,archivos_aprobados jsonb);
      CREATE TABLE public.portal_rp_actualizaciones(fila_id uuid, rp_id uuid, beneficiario_id bigint);
      ALTER TABLE public.portal_valores_cargue ADD COLUMN id uuid DEFAULT gen_random_uuid();
      ALTER TABLE public.portal_valores_cargue ADD PRIMARY KEY(id);
      ALTER TABLE public.portal_valores_cargue ADD COLUMN nombre_beneficiario text;
      ALTER TABLE public.portal_beneficiarios ADD COLUMN nombre_completo text;
      INSERT INTO portal_beneficiarios VALUES
        (5,'555',NULL,'Universitario',NULL,1,NULL,'activo','Persona Cinco'),(6,'666',NULL,'Universitario',NULL,1,NULL,'activo','Persona Seis');
      INSERT INTO portal_ventanas_actualizacion VALUES (1,'2026-2');
      INSERT INTO portal_documentos_cargue VALUES
        ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc',1,'{"fecha_rp":"2026-01-01"}');
      INSERT INTO portal_valores_cargue(id,documento_id,identificacion,nombre_beneficiario) VALUES
        ('dddddddd-dddd-4ddd-8ddd-ddddddddddd1','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','555','Persona Cinco'),
        ('dddddddd-dddd-4ddd-8ddd-ddddddddddd2','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','666','Persona Seis');
      INSERT INTO portal_archivos_contabilidad VALUES (
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','aprobado',jsonb_build_object(
          'op',jsonb_build_object('datos',jsonb_build_object('fecha','2026-02-01'),'filas',jsonb_build_array(
            jsonb_build_object('id','dddddddd-dddd-4ddd-8ddd-ddddddddddd1','no_rp','RP-1','valor','1000'),
            jsonb_build_object('id','dddddddd-dddd-4ddd-8ddd-ddddddddddd2','no_rp','RP-2','valor','2000'))),
          'contabilidad',jsonb_build_object('filas',jsonb_build_array(
            jsonb_build_object('id','dddddddd-dddd-4ddd-8ddd-ddddddddddd1','no_obligacion','OP-1'),
            jsonb_build_object('id','dddddddd-dddd-4ddd-8ddd-ddddddddddd2','no_obligacion','OP-2')))));
      SET test.role='pagos';
    `);
    await db.exec(read('20261120170000_trazabilidad_pagos.sql'));
    const cv = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const rp = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const row1 = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
    const row2 = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2';
    const list = async () => (await db.query('SELECT public.leer_obligaciones_egreso($1,$2,NULL) AS filas',[cv,rp])).rows[0].filas;
    const confirm = async (fila,numero,pago=null) => (await db.query(
      'SELECT public.confirmar_egreso_beneficiario($1,$2,$3,NULL,$4,$5,$6) AS resultado',
      [cv,rp,fila,numero,'2026-03-01',pago],
    )).rows[0].resultado;
    const available = await list();
    assert.equal(available.length,2);
    assert.equal(available[0].periodo,'2026-2');
    assert.equal(available[0].beneficiario_id,5);
    await db.exec("UPDATE portal_documentos_cargue SET rp_ventana_id=NULL");
    assert.equal((await list())[0].periodo,null);
    assert.equal((await db.query('SELECT public.leer_obligaciones_egreso($1,$2,$3) AS filas',[cv,rp,'2026-1'])).rows[0].filas[0].periodo,'2026-1');
    await db.exec("UPDATE portal_documentos_cargue SET rp_ventana_id=1");
    await db.exec("UPDATE portal_archivos_contabilidad SET archivos_aprobados=jsonb_set(archivos_aprobados,'{contabilidad,filas,1,id}','\"bad-id\"')");
    await assert.rejects(list(),/no coinciden/);
    await db.exec("UPDATE portal_archivos_contabilidad SET archivos_aprobados=jsonb_set(archivos_aprobados,'{contabilidad,filas,1,id}','\"dddddddd-dddd-4ddd-8ddd-ddddddddddd2\"')");
    assert.equal((await confirm(row1,'EG-NEW')).ok,true);
    assert.equal((await list())[0].confirmado,true);
    await assert.rejects(confirm(row1,'EG-OTHER'),/ya fue confirmada/);
    await assert.rejects(confirm(row2,'eg-new'),/ya existe/);
    await assert.rejects(confirm(row2,'EG-2'),/ya existe/);
    await db.exec("INSERT INTO portal_beneficiario_pagos(beneficiario_id,concepto,periodo,monto,estado) VALUES (6,'Desembolso','2026-2',2000,'pendiente')");
    const existing = (await list())[1].coincidencias[0];
    await assert.rejects(confirm(row2,'EG-UNICO'),/seleccione uno existente/);
    assert.equal((await confirm(row2,'EG-UNICO',existing.id)).ok,true);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM portal_pago_trazabilidad')).rows[0].n,2);
    await assert.rejects(db.exec("UPDATE portal_beneficiario_pagos SET monto=1200 WHERE beneficiario_id=5"),/corrección controlada/);
    const history=(await db.query('SELECT public.trazabilidad_beneficiario(1) AS datos')).rows[0].datos;
    assert.equal(history[0].origen,'historico');
    const search=(await db.query("SELECT public.buscar_trazabilidad_pagos('555') AS datos")).rows[0].datos;
    assert.equal(search.pagos[0].soporte.numero_egreso,'EG-NEW');
    await db.exec("SET test.role='admin'");
    await assert.rejects(confirm(row1,'OTRO'),/No autorizado/);
    await db.exec("UPDATE auth.users SET raw_app_meta_data='{\"roles\":[\"admin_educacion\"]}'");
    await assert.rejects(db.query("SELECT public.buscar_trazabilidad_pagos('555')"),/Hacienda/);
    await db.exec("SET test.role='sin_acceso'");
    await assert.rejects(db.query('SELECT public.trazabilidad_beneficiario(1)'),/administrador activo/);
    console.log('OK: trazabilidad, acceso, egresos únicos y conciliación de pago existente.');
    console.log('OK: piloto, reintento, atomicidad, fichas intactas y reglas de pagos ordinarios.');
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
