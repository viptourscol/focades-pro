import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

const supabaseUrl = process.env.SUPABASE_URL || 'https://ojnobfvwdpjcmdahgyjv.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY no está definida');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Script: Generar setup tokens para beneficiarios existentes y enviar emails
 * Uso: node create-beneficiary-auth-tokens.mjs
 * 
 * Opciones:
 *   --send-emails    Envía emails después de generar tokens (requiere SENDGRID_API_KEY)
 *   --batch N        Limita a N beneficiarios
 *   --dry-run        Simula sin hacer cambios en BD
 * 
 * Output: beneficiarios-setup-tokens.csv (con links de setup para reference)
 */

// Helpers para stdin
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise(resolve => rl.question(prompt, resolve));
}

function closeReadline() {
  rl.close();
}

async function main() {
  console.log('🔄 Iniciando generación de setup tokens...\n');

  // Parsear argumentos
  const args = process.argv.slice(2);
  const sendEmails = args.includes('--send-emails');
  const dryRun = args.includes('--dry-run');
  const batchArg = args.find(arg => arg.startsWith('--batch'));
  const batchLimit = batchArg ? parseInt(batchArg.split('=')[1]) : null;

  if (sendEmails && !process.env.SENDGRID_API_KEY) {
    console.warn('⚠️  --send-emails requiere SENDGRID_API_KEY en variables de entorno');
    console.log('   Ignorando envío de emails\n');
  }

  if (dryRun) {
    console.log('🔍 MODO DRY-RUN: Sin cambios reales en BD\n');
  }

  try {
    // 1. Obtener todos los beneficiarios
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
    
    let toSetup = beneficiarios.filter(b => !existingIds.has(b.id));
    
    if (batchLimit) {
      toSetup = toSetup.slice(0, batchLimit);
      console.log(`📦 Limitado a ${batchLimit} beneficiarios\n`);
    }

    console.log(`✅ ${toSetup.length} beneficiarios necesitan setup\n`);

    if (toSetup.length === 0) {
      console.log('✨ Todos los beneficiarios ya tienen credenciales');
      return;
    }

    // 3. Generar setup tokens
    console.log('🔐 Generando setup tokens...');
    const tokens = [];
    const errors = [];
    let createdCount = 0;

    for (let i = 0; i < toSetup.length; i++) {
      const beneficiario = toSetup[i];
      process.stdout.write(`\r  Procesando ${i + 1}/${toSetup.length}...`);

      try {
        const setupToken = crypto.randomBytes(32).toString('hex');
        const setupExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

        if (!dryRun) {
          // Insertar en portal_auth_credentials
          const { error: insertError } = await supabase
            .from('portal_auth_credentials')
            .insert([
              {
                beneficiario_id: beneficiario.id,
                document_number: beneficiario.n_documento,
                email_verified: beneficiario.email,
                password_hash: '',
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

          createdCount++;
        }

        const setupLink = `https://focades-pro.vercel.app/beneficiario/auth-setup?token=${setupToken}`;
        tokens.push({
          id: beneficiario.id,
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

    console.log(`\n✅ Se generaron ${tokens.length} tokens\n`);

    if (errors.length > 0) {
      console.error(`⚠️  ${errors.length} errores durante la generación:`);
      errors.forEach(e => console.error(`   - ${e.beneficiario}: ${e.error}`));
      console.log('');
    }

    // 4. Enviar emails si se especificó --send-emails
    let emailsSent = 0;
    let emailErrors = 0;

    if (sendEmails && process.env.SENDGRID_API_KEY && !dryRun) {
      console.log('📧 Enviando emails de activación...\n');
      
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        process.stdout.write(`\r  Enviando email ${i + 1}/${tokens.length}...`);

        try {
          const response = await supabase.functions.invoke('send-setup-emails', {
            body: {
              method: 'send-setup-email',
              beneficiario_id: token.id,
            },
          });

          if (response.data?.ok) {
            emailsSent++;
          } else {
            emailErrors++;
            console.error(`\n  ❌ Error enviando email a ${token.email}: ${response.data?.error}`);
          }

          // Delay para evitar rate limits
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (err) {
          emailErrors++;
          console.error(`\n  ❌ Error enviando email a ${token.email}: ${err.message}`);
        }
      }

      console.log(`\n✅ Emails enviados: ${emailsSent}/${tokens.length}\n`);
    }

    // 5. Generar CSV
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
          t.expires_at.split('T')[0],
        ].join(',')),
      ].join('\n');

      if (!dryRun) {
        fs.writeFileSync(csvPath, csvContent, 'utf-8');
        console.log(`📄 CSV generado: ${csvPath}`);
      } else {
        console.log(`📄 CSV (no guardado - dry-run): beneficiarios-setup-tokens.csv`);
      }
    }

    // 6. Resumen final
    console.log('\n' + '═'.repeat(60));
    console.log('✨ SETUP TOKENS GENERADOS');
    console.log('═'.repeat(60));
    console.log(`Total generado: ${tokens.length} beneficiarios`);
    if (!dryRun) {
      console.log(`Guardado en BD: ${createdCount} registros`);
      if (sendEmails && process.env.SENDGRID_API_KEY) {
        console.log(`Emails enviados: ${emailsSent}/${tokens.length}`);
        if (emailErrors > 0) console.log(`Errores en emails: ${emailErrors}`);
      }
    }
    console.log(`Errores: ${errors.length}`);
    console.log('═'.repeat(60));

    if (!sendEmails && process.env.SENDGRID_API_KEY) {
      console.log('\n💡 TIP: Usa --send-emails para enviar emails automáticamente');
      console.log('   node create-beneficiary-auth-tokens.mjs --send-emails\n');
    }

    console.log('📌 PRÓXIMOS PASOS:');
    console.log('1. ✅ Setup tokens generados (válidos 24 horas)');
    if (sendEmails && process.env.SENDGRID_API_KEY) {
      console.log('2. ✅ Emails enviados a beneficiarios');
    } else {
      console.log('2. 📧 Configurar SendGrid: export SENDGRID_API_KEY=your-key');
      console.log('      Luego: node create-beneficiary-auth-tokens.mjs --send-emails');
    }
    console.log('3. 🔍 Monitorear activaciones en admin dashboard');
    console.log('4. 📊 Ver: AdminBeneficiarioActivacionMonitor component\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    closeReadline();
  }
}

main();
