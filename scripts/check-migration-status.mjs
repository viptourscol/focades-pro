import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://jwifxjzxdxjntbdqbyku.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ Error: SUPABASE_SERVICE_KEY no está en las variables de ambiente');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function checkDocuments() {
  console.log('📊 Verificando estado de documentos...\n');

  // Contar documentos en R2 (empiezan con "soportes/")
  const { data: r2Docs, error: r2Error } = await supabase
    .from('portal_actualizacion_documentos')
    .select('id')
    .ilike('storage_path', 'soportes/%');

  if (r2Error) {
    console.error('❌ Error:', r2Error);
    process.exit(1);
  }

  // Contar documentos en Supabase Storage (no empiezan con "soportes/")
  const { data: supDocs, error: supError } = await supabase
    .from('portal_actualizacion_documentos')
    .select('id')
    .not('storage_path', 'ilike', 'soportes/%');

  if (supError) {
    console.error('❌ Error:', supError);
    process.exit(1);
  }

  const r2Count = r2Docs?.length || 0;
  const supCount = supDocs?.length || 0;
  const totalCount = r2Count + supCount;

  console.log(`📦 Total de documentos en BD: ${totalCount}`);
  console.log(`✅ En R2 (soportes/*): ${r2Count}`);
  console.log(`❌ Aún en Supabase Storage: ${supCount}`);
  console.log(`\n📈 Progreso: ${((r2Count / totalCount) * 100).toFixed(1)}% en R2`);

  if (supCount > 0) {
    console.log(`\n⚠️  Aún hay ${supCount} documentos por migrar`);
  } else {
    console.log(`\n🎉 ¡TODOS LOS DOCUMENTOS ESTÁN EN R2!`);
  }
}

checkDocuments().catch(console.error);
