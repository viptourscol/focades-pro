import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://vnxmsmzkmikqyqhbtlpo.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error('Error: SUPABASE_SERVICE_ROLE_KEY no está definida');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const { data, error } = await supabase
  .from('portal_actualizaciones')
  .select('id, estado, campos_a_corregir, documentos_a_corregir, observacion_admin, marcado_subsanacion_at, updated_at')
  .eq('id', 75)
  .single();

if (error) {
  console.error('Error:', error.message);
  process.exit(1);
}

console.log(JSON.stringify(data, null, 2));
