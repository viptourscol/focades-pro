#!/usr/bin/env node
/**
 * ============================================================
 *  FOCADES – Script de activación en lote de beneficiarios
 * ============================================================
 *
 * MODOS DE USO
 * ─────────────────────────────────────────────────────────────
 * 1. Desde inscripciones admitidas (convierte aspirantes ya
 *    gestionados en la tabla inscripciones a beneficiarios):
 *
 *    node scripts/activar-beneficiarios.mjs --desde-inscripciones
 *    node scripts/activar-beneficiarios.mjs --desde-inscripciones --estado legalizacion
 *    node scripts/activar-beneficiarios.mjs --desde-inscripciones --etapa admitido
 *
 * 2. Desde lista manual (edita la constante LISTA_MANUAL):
 *
 *    node scripts/activar-beneficiarios.mjs --lista-manual
 *
 * 3. Desde CSV (columnas: nombre_completo,email,n_documento,
 *                          tipo_documento,semestre_actual,telefono):
 *
 *    node scripts/activar-beneficiarios.mjs --desde-csv beneficiarios.csv
 *
 * VARIABLES DE ENTORNO REQUERIDAS (en .env o exportadas)
 * ─────────────────────────────────────────────────────────────
 *    SUPABASE_URL            = https://<ref>.supabase.co
 *    SUPABASE_SERVICE_KEY    = tu service_role key (no la anon)
 *
 * OPCIONES ADICIONALES
 * ─────────────────────────────────────────────────────────────
 *    --dry-run     Muestra qué se insertaría sin tocar la BD
 *    --estado STR  Filtra inscripciones por columna 'estado'
 *    --etapa STR   Filtra inscripciones por columna 'etapa'
 *    --verbose     Muestra cada fila procesada
 * ============================================================
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// ──────────────────────────────────────────────────────────────
// Leer .env manualmente (sin depender de dotenv)
// ──────────────────────────────────────────────────────────────
const loadEnv = () => {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !(key in process.env)) process.env[key] = value;
  }
};

loadEnv();

// ──────────────────────────────────────────────────────────────
// LISTA MANUAL – edita aquí cuando uses --lista-manual
// ──────────────────────────────────────────────────────────────
/** @type {Array<{nombre_completo: string, email: string, n_documento?: string, tipo_documento?: string, semestre_actual?: number, telefono?: string, radicado_inscripcion?: string}>} */
const LISTA_MANUAL = [
  // Ejemplo:
  // {
  //   nombre_completo: 'Juan Pérez García',
  //   email: 'juan.perez@gmail.com',
  //   tipo_documento: 'CC',
  //   n_documento: '1012345678',
  //   semestre_actual: 1,
  //   telefono: '3001234567',
  // },
];

// ──────────────────────────────────────────────────────────────
// Colores para consola
// ──────────────────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};
const ok = (msg) => console.log(`${c.green}✔${c.reset} ${msg}`);
const warn = (msg) => console.log(`${c.yellow}⚠${c.reset} ${msg}`);
const err = (msg) => console.error(`${c.red}✘${c.reset} ${msg}`);
const info = (msg) => console.log(`${c.cyan}ℹ${c.reset} ${msg}`);
const dim = (msg) => console.log(`${c.gray}  ${msg}${c.reset}`);

// ──────────────────────────────────────────────────────────────
// Parsear argumentos de línea de comandos
// ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const hasFlag = (flag) => args.includes(flag);
const getArg = (flag) => {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
};

const MODE_INSCRIPCIONES = hasFlag('--desde-inscripciones');
const MODE_MANUAL = hasFlag('--lista-manual');
const MODE_CSV = hasFlag('--desde-csv');
const CSV_PATH = getArg('--desde-csv');
const DRY_RUN = hasFlag('--dry-run');
const VERBOSE = hasFlag('--verbose');
const FILTER_ESTADO = getArg('--estado');
const FILTER_ETAPA = getArg('--etapa');

if (!MODE_INSCRIPCIONES && !MODE_MANUAL && !MODE_CSV) {
  console.log(`
${c.bold}FOCADES – Activador de beneficiarios en lote${c.reset}

  node scripts/activar-beneficiarios.mjs [modo] [opciones]

${c.bold}Modos:${c.reset}
  --desde-inscripciones   Importa desde la tabla inscripciones
  --lista-manual          Usa la constante LISTA_MANUAL del script
  --desde-csv <archivo>   Lee un CSV con cabeceras

${c.bold}Opciones:${c.reset}
  --estado STR            Filtro de estado (p.ej. legalizacion, admitido)
  --etapa STR             Filtro de etapa (p.ej. admitido, legalizacion)
  --dry-run               Simula sin modificar la BD
  --verbose               Detalle de cada fila

${c.bold}Variables de entorno requeridas:${c.reset}
  SUPABASE_URL            URL del proyecto Supabase
  SUPABASE_SERVICE_KEY    Service role key (Settings → API)
`);
  process.exit(0);
}

// ──────────────────────────────────────────────────────────────
// Validar credenciales
// ──────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL) {
  err('Falta SUPABASE_URL en .env o en el entorno.');
  process.exit(1);
}
if (!SERVICE_KEY) {
  err('Falta SUPABASE_SERVICE_KEY en .env o en el entorno.');
  err('Agrégala en .env: SUPABASE_SERVICE_KEY=eyJhbGci...');
  err('La encuentras en: Supabase Dashboard → Settings → API → service_role');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ──────────────────────────────────────────────────────────────
// Leer fuente de datos
// ──────────────────────────────────────────────────────────────

/** @returns {Promise<Array<object>>} */
async function obtenerCandidatos() {
  // ── Modo: desde la tabla inscripciones ──────────────────────
  if (MODE_INSCRIPCIONES) {
    info('Leyendo inscripciones desde Supabase…');

    let query = supabase
      .from('inscripciones')
      .select(
        'id, radicado, numero_radicado, nombre_completo, email, ' +
        'n_documento, tipo_documento, estado, etapa, modalidad, programa_academico, ' +
        'persona_id'
      );

    if (FILTER_ESTADO) {
      query = query.ilike('estado', `%${FILTER_ESTADO}%`);
      info(`  Filtro estado: contiene "${FILTER_ESTADO}"`);
    }

    if (FILTER_ETAPA) {
      query = query.ilike('etapa', `%${FILTER_ETAPA}%`);
      info(`  Filtro etapa: contiene "${FILTER_ETAPA}"`);
    }

    if (!FILTER_ESTADO && !FILTER_ETAPA) {
      // Sin filtro: trae admitidos / legalizacion por defecto
      query = query.or(
        'estado.ilike.%admitid%,' +
        'estado.ilike.%legaliz%,' +
        'etapa.ilike.%admitid%,' +
        'etapa.ilike.%legaliz%'
      );
      info('  Filtro por defecto: estado o etapa contiene "admitid" o "legaliz"');
    }

    const { data, error: fetchErr } = await query.order('created_at', { ascending: false });

    if (fetchErr) {
      err(`Error al leer inscripciones: ${fetchErr.message}`);
      process.exit(1);
    }

    info(`  ${data.length} inscripción(es) encontrada(s).`);

    return (data || []).map((row) => ({
      nombre_completo: row.nombre_completo || '',
      email: (row.email || '').toLowerCase().trim(),
      tipo_documento: row.tipo_documento || '',
      n_documento: row.n_documento || '',
      inscripcion_id: row.id || null,
      radicado_inscripcion: row.radicado || row.numero_radicado || '',
      persona_id: row.persona_id || null,
      semestre_actual: 1,
    }));
  }

  // ── Modo: lista manual ───────────────────────────────────────
  if (MODE_MANUAL) {
    if (LISTA_MANUAL.length === 0) {
      warn('La constante LISTA_MANUAL está vacía. Edita el script antes de ejecutar.');
      process.exit(0);
    }
    info(`${LISTA_MANUAL.length} beneficiario(s) en lista manual.`);
    return LISTA_MANUAL.map((row) => ({
      ...row,
      email: (row.email || '').toLowerCase().trim(),
      semestre_actual: row.semestre_actual ?? 1,
    }));
  }

  // ── Modo: CSV ────────────────────────────────────────────────
  if (MODE_CSV) {
    const csvAbsPath = resolve(process.cwd(), CSV_PATH);
    if (!existsSync(csvAbsPath)) {
      err(`No se encontró el archivo CSV: ${csvAbsPath}`);
      process.exit(1);
    }

    const raw = readFileSync(csvAbsPath, 'utf8');
    const lines = raw.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) {
      err('El CSV está vacío o solo tiene cabecera.');
      process.exit(1);
    }

    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ''));
    const REQUIRED = ['nombre_completo', 'email'];
    for (const req of REQUIRED) {
      if (!headers.includes(req)) {
        err(`El CSV no tiene la columna requerida: "${req}"`);
        process.exit(1);
      }
    }

    info(`CSV: ${lines.length - 1} fila(s) leída(s).`);

    return lines.slice(1).map((line, idx) => {
      const cells = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      const row = {};
      headers.forEach((h, i) => { row[h] = cells[i] || ''; });

      if (!row.email) warn(`  Fila ${idx + 2}: email vacío, se omitirá.`);

      return {
        nombre_completo: row.nombre_completo || '',
        email: (row.email || '').toLowerCase().trim(),
        tipo_documento: row.tipo_documento || '',
        n_documento: row.n_documento || '',
        semestre_actual: Number(row.semestre_actual) || 1,
        telefono: row.telefono || '',
        radicado_inscripcion: row.radicado_inscripcion || '',
      };
    }).filter((r) => r.email);
  }

  return [];
}

// ──────────────────────────────────────────────────────────────
// Validar y limpiar cada candidato
// ──────────────────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validar(candidato, idx) {
  const errores = [];
  if (!candidato.nombre_completo?.trim()) errores.push('nombre_completo vacío');
  if (!candidato.email?.trim()) errores.push('email vacío');
  else if (!EMAIL_RE.test(candidato.email)) errores.push(`email inválido: "${candidato.email}"`);
  return errores;
}

// ──────────────────────────────────────────────────────────────
// Consultar emails ya existentes de una vez (batch)
// ──────────────────────────────────────────────────────────────
async function obtenerEmailsExistentes(emails) {
  if (emails.length === 0) return new Set();

  const { data, error: fetchErr } = await supabase
    .from('portal_beneficiarios')
    .select('email')
    .in('email', emails);

  if (fetchErr) {
    warn(`No se pudo verificar duplicados: ${fetchErr.message}`);
    return new Set();
  }

  return new Set((data || []).map((r) => (r.email || '').toLowerCase()));
}

// ──────────────────────────────────────────────────────────────
// Auto-vincular auth_user_id si el email ya existe en auth.users
// No falla si no hay usuario, simplemente deja auth_user_id null
// ──────────────────────────────────────────────────────────────
async function resolverAuthUserId(email) {
  try {
    // listUsers no tiene filtro directo por email en la API de admin,
    // pero podemos buscar con getUserByEmail a través de la API de administración.
    // Como @supabase/supabase-js no expone getUserByEmail con service_role de forma
    // directa en el cliente, consultamos la API REST de administración:
    const response = await fetch(
      `${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
      {
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
      }
    );

    if (!response.ok) return null;

    const json = await response.json();
    // La respuesta es { users: [...] } o similar según la versión de Supabase
    const users = json?.users || (Array.isArray(json) ? json : []);
    const match = users.find(
      (u) => (u.email || '').toLowerCase() === email.toLowerCase()
    );
    return match?.id || null;
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────────────────────
// Script principal
// ──────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${c.bold}═══ FOCADES – Activación en lote de beneficiarios ═══${c.reset}`);
  if (DRY_RUN) warn('MODO DRY-RUN: no se realizarán cambios en la BD.\n');

  // 1. Obtener candidatos
  const candidatos = await obtenerCandidatos();

  if (candidatos.length === 0) {
    warn('No hay candidatos para procesar.');
    process.exit(0);
  }

  console.log('');

  // 2. Validar
  const validos = [];
  const invalidos = [];

  for (const [idx, cand] of candidatos.entries()) {
    const errores = validar(cand, idx);
    if (errores.length > 0) {
      invalidos.push({ cand, errores });
      err(`Fila ${idx + 1} inválida [${cand.email || 'sin email'}]: ${errores.join(', ')}`);
    } else {
      validos.push(cand);
    }
  }

  info(`${validos.length} válido(s), ${invalidos.length} inválido(s).`);

  if (validos.length === 0) {
    err('Ningún candidato válido. Verifica los datos de entrada.');
    process.exit(1);
  }

  // 3. Verificar duplicados en batch
  const emails = validos.map((c) => c.email);
  info('Verificando duplicados en portal_beneficiarios…');
  const existentes = await obtenerEmailsExistentes(emails);
  info(`  ${existentes.size} email(s) ya registrados.`);

  const nuevos = validos.filter((c) => !existentes.has(c.email));
  const duplicados = validos.filter((c) => existentes.has(c.email));

  duplicados.forEach((c) => {
    warn(`  Ya existe: ${c.email} (${c.nombre_completo}) – se omite.`);
  });

  if (nuevos.length === 0) {
    warn('\nTodos los candidatos ya están registrados como beneficiarios. Nada que insertar.');
    printResumen(0, 0, duplicados.length, invalidos.length);
    process.exit(0);
  }

  info(`\n${nuevos.length} beneficiario(s) por activar.`);

  // 4. Resolver auth_user_id para los nuevos (en paralelo, sin bloquear)
  info('Buscando usuarios ya registrados en Supabase Auth…');
  const authIds = await Promise.all(
    nuevos.map((c) => resolverAuthUserId(c.email).catch(() => null))
  );

  // 5. Construir payloads
  const payloads = nuevos.map((cand, i) => {
    const authUserId = authIds[i] || null;
    if (VERBOSE) {
      dim(`  ${cand.email} → auth_user_id: ${authUserId || '(pendiente de primer login)'}`);
    }
    return {
      nombre_completo: cand.nombre_completo.trim(),
      email: cand.email,
      tipo_documento: cand.tipo_documento || null,
      n_documento: cand.n_documento || null,
      persona_id: cand.persona_id || null,
      inscripcion_id: cand.inscripcion_id || null,
      radicado_inscripcion: cand.radicado_inscripcion || null,
      semestre_actual: cand.semestre_actual || 1,
      telefono: cand.telefono || null,
      estado_beneficiario: 'activo',
      auth_user_id: authUserId,
    };
  });

  if (DRY_RUN) {
    console.log('\nPayloads que se insertarían:\n');
    payloads.forEach((p, i) => {
      console.log(`  [${i + 1}] ${p.nombre_completo} <${p.email}>`);
      if (VERBOSE) console.log(JSON.stringify(p, null, 4));
    });
    printResumen(0, nuevos.length, duplicados.length, invalidos.length, true);
    process.exit(0);
  }

  // 6. Insertar en lotes de 100
  const BATCH_SIZE = 100;
  let insertados = 0;
  let erroresInsert = 0;

  console.log('');

  for (let i = 0; i < payloads.length; i += BATCH_SIZE) {
    const lote = payloads.slice(i, i + BATCH_SIZE);
    const desde = i + 1;
    const hasta = Math.min(i + BATCH_SIZE, payloads.length);

    process.stdout.write(`  Insertando lote [${desde}–${hasta}]…`);

    const { data: inserted, error: insertErr } = await supabase
      .from('portal_beneficiarios')
      .insert(lote)
      .select('id, email');

    if (insertErr) {
      process.stdout.write(` ${c.red}ERROR${c.reset}\n`);
      err(`  ${insertErr.message}`);
      // Intento unitario para saber cuáles fallaron
      for (const payload of lote) {
        const { error: singleErr } = await supabase
          .from('portal_beneficiarios')
          .insert(payload);
        if (singleErr) {
          erroresInsert += 1;
          err(`    ✘ ${payload.email}: ${singleErr.message}`);
        } else {
          insertados += 1;
          if (VERBOSE) ok(`    ${payload.email}`);
        }
      }
    } else {
      process.stdout.write(` ${c.green}OK${c.reset} (${inserted?.length || lote.length})\n`);
      insertados += inserted?.length || lote.length;
      if (VERBOSE && inserted) {
        inserted.forEach((r) => dim(`    id=${r.id} ${r.email}`));
      }
    }
  }

  printResumen(insertados, 0, duplicados.length, invalidos.length);

  if (erroresInsert > 0) {
    process.exit(1);
  }
}

// ──────────────────────────────────────────────────────────────
// Resumen final
// ──────────────────────────────────────────────────────────────
function printResumen(insertados, pendientes, duplicados, invalidos, isDryRun = false) {
  console.log(`\n${c.bold}─── Resumen ─────────────────────────────────────${c.reset}`);
  if (isDryRun) {
    warn(`  ${pendientes} beneficiario(s) se insertarían (DRY-RUN)`);
  } else {
    ok(`  ${insertados} beneficiario(s) activado(s) correctamente`);
  }
  if (duplicados > 0) warn(`  ${duplicados} omitido(s) – ya existían`);
  if (invalidos > 0) err(`  ${invalidos} inválido(s) – revisión manual requerida`);
  console.log(`${c.bold}─────────────────────────────────────────────────${c.reset}\n`);
}

main().catch((e) => {
  err(`Error inesperado: ${e?.message || e}`);
  process.exit(1);
});
