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

console.log('URL:', SUPABASE_URL);
console.log('KEY:', SUPABASE_ANON_KEY?.substring(0, 20) + '...');

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Obtener cuenta total
const { count, error: countError } = await supabase
  .from('portal_actualizacion_documentos')
  .select('*', { count: 'exact', head: true })
  .not('storage_path', 'is', null);

console.log('\n📊 Total con COUNT:', count);
console.log('Error:', countError);

// Obtener primeros 5
const { data, error: dataError } = await supabase
  .from('portal_actualizacion_documentos')
  .select('id, storage_path, nombre_original')
  .not('storage_path', 'is', null)
  .limit(5);

console.log('\n📁 Primeros 5:');
console.log(data);
console.log('Error:', dataError);
