import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const envFile = readFileSync('.env.local', 'utf8');
const envVars = {};
envFile.split('\n').forEach(line => {
  line = line.trim();
  if (!line || line.startsWith('#')) return;
  const eqIndex = line.indexOf('=');
  if (eqIndex > 0) {
    const key = line.substring(0, eqIndex).trim();
    const value = line.substring(eqIndex + 1).trim();
    envVars[key] = value;
  }
});

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || envVars.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || envVars.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Sin filtro
const { count: countAll, error: errorAll } = await supabase
  .from('portal_actualizacion_documentos')
  .select('*', { count: 'exact', head: true });

console.log('📊 Total SIN filtro:', countAll);
console.log('Error:', errorAll);

// Con filtro is not null
const { count: countNotNull } = await supabase
  .from('portal_actualizacion_documentos')
  .select('*', { count: 'exact', head: true })
  .not('storage_path', 'is', null);

console.log('📊 Total CON "not null" filtro:', countNotNull);

// Obtener primeros 5 sin filtro
const { data: dataAll, error: dataError } = await supabase
  .from('portal_actualizacion_documentos')
  .select('id, storage_path, nombre_original')
  .limit(5);

console.log('\n📁 Primeros 5 (sin filtro):');
dataAll?.forEach(doc => {
  console.log(`  - ID: ${doc.id}, Path: ${doc.storage_path?.substring(0, 50) || 'NULL'}`);
});
