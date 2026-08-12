import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const supabaseUrl = process.env.SUPABASE_URL || 'https://ojnobfvwdpjcmdahgyjv.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY no está definida');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Script: Generar setup tokens para beneficiarios existentes
 * Uso: node create-beneficiary-auth-tokens.mjs
 * Output: beneficiarios-setup-tokens.csv (con links de setup para email campaign)
 */

async function main() {
  console.log('🔄 Iniciando generación de setup tokens...\n');

  try {
    // 1. Obtener todos los beneficiarios que no tienen credentials aún
    console.log('📋 Obteniendo beneficiarios...');
    const { data: beneficiarios, error: benefError } = await supabase
      .from('portal_beneficiarios')
      .select('id,n_documento,email,nombre_completo,telefono')
      .order('id', { ascending: true });

    if (benefError) throw new Error(`Error al obtener beneficiarios: ${benefError.message}`);
    if (!beneficiarios || beneficiarios.length === 0) {
      console.warn('⚠️  No hay beneficiarios en la base de datos');
      return;
    }

    console.log(`✅ Se encontraron ${beneficiarios.length} beneficiarios\n`);

    // 2. Verificar cuáles ya tienen credentials
    console.log('🔍 Verificando credenciales existentes...');
    const { data: existingCreds, error: credsError } = await supabase
      .from('portal_auth_credentials')
      .select('beneficiario_id');

    if (credsError) throw new Error(`Error al obtener credentials: ${credsError.message}`);
    const existingIds = new Set(existingCreds?.map(c => c.beneficiario_id) || []);
    
    const toSetup = beneficiarios.filter(b => !existingIds.has(b.id));
    console.log(`✅ ${toSetup.length} beneficiarios necesitan setup\n`);

    if (toSetup.length === 0) {
      console.log('✨ Todos los beneficiarios ya tienen credenciales');
      return;
    }

    // 3. Generar setup tokens para cada beneficiario
    console.log('🔐 Generando setup tokens...');
    const tokens = [];
    const errors = [];

    for (const beneficiario of toSetup) {
      try {
        const setupToken = crypto.randomBytes(32).toString('hex');
        const setupExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

        // Insertar en portal_auth_credentials
        const { error: insertError } = await supabase
          .from('portal_auth_credentials')
          .insert([
            {
              beneficiario_id: beneficiario.id,
              document_number: beneficiario.n_documento,
              email_verified: beneficiario.email,
              password_hash: '', // Se completa durante setup
              setup_token: setupToken,
              setup_token_expires_at: setupExpiresAt,
              setup_completed_at: null,
              failed_login_attempts: 0,
              locked_until: null,
            },
          ]);

        if (insertError) {
          errors.push({ beneficiario: beneficiario.n_documento, error: insertError.message });
          continue;
        }

        const setupLink = `https://app.focades.com/beneficiario/auth-setup?token=${setupToken}`;
        tokens.push({
          nombre: beneficiario.nombre_completo,
          documento: beneficiario.n_documento,
          email: beneficiario.email,
          telefono: beneficiario.telefono || '',
          setup_token: setupToken,
          setup_link: setupLink,
          expires_at: setupExpiresAt,
        });

      } catch (err) {
        errors.push({ beneficiario: beneficiario.n_documento, error: err.message });
      }
    }

    console.log(`✅ Se generaron ${tokens.length} tokens\n`);

    if (errors.length > 0) {
      console.error(`⚠️  ${errors.length} errores durante la generación:`);
      errors.forEach(e => console.error(`   - ${e.beneficiario}: ${e.error}`));
    }

    // 4. Generar CSV para email campaign
    if (tokens.length > 0) {
      const csvPath = path.join(process.cwd(), 'beneficiarios-setup-tokens.csv');
      const csvContent = [
        ['Nombre', 'Documento', 'Email', 'Teléfono', 'Setup Link', 'Caduca en'].join(','),
        ...tokens.map(t => [
          `"${t.nombre}"`,
          t.documento,
          t.email,
          `"${t.telefono}"`,
          t.setup_link,
          t.expires_at.split('T')[0], // Solo fecha
        ].join(',')),
      ].join('\n');

      fs.writeFileSync(csvPath, csvContent, 'utf-8');
      console.log(`📄 CSV generado: ${csvPath}`);
      console.log(`   - Use este archivo para enviar emails con setup links`);
      console.log(`   - Los links expiran en 24 horas\n`);
    }

    // 5. Resumen
    console.log('═'.repeat(50));
    console.log('✨ SETUP TOKENS GENERADOS EXITOSAMENTE');
    console.log('═'.repeat(50));
    console.log(`Total: ${tokens.length} beneficiarios`);
    console.log(`Errores: ${errors.length}`);
    console.log(`Archivo CSV: beneficiarios-setup-tokens.csv`);
    console.log('\n📌 PRÓXIMOS PASOS:');
    console.log('1. Revisar beneficiarios-setup-tokens.csv');
    console.log('2. Configurar servicio de email (SendGrid/Mailgun)');
    console.log('3. Enviar emails con setup links');
    console.log('4. Monitorear portal_auth_login_attempts para completions');
    console.log('5. Recordar: setup links válidos por 24 horas\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
