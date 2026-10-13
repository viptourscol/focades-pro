#!/usr/bin/env node
/**
 * Script: Actualizar roles para usuarios admin
 * Uso: node scripts/update-admin-roles.mjs
 */

import { createClient } from '@supabase/supabase-js';
import * as process from 'process';

const supabaseUrl = process.env.SUPABASE_URL || 'https://jwifxjzxdxjntbdqbyku.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY no está definida');
  console.error('   Configúrala con: export SUPABASE_SERVICE_ROLE_KEY="..."');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Mapeo de correos a roles
const adminEmails = [
  { email: 'educación@focades.info', role: 'admin_educacion' },
  { email: 'presupuesto@focades.info', role: 'admin_presupuesto' },
  { email: 'contabilidad@focades.info', role: 'admin_contabilidad' },
  { email: 'pagos@focades.info', role: 'admin_pagos' },
  { email: 'visualizacion@focades.info', role: 'admin_visualizacion' },
];

async function main() {
  console.log('🔄 Actualizando roles para usuarios admin...\n');

  try {
    // 1. Verificar usuarios actuales usando Admin API
    console.log('📋 Buscando usuarios...');
    const users = [];
    
    for (const { email, role } of adminEmails) {
      try {
        const { data: { user }, error } = await supabase.auth.admin.getUserByEmail(email);
        if (error) {
          console.log(`⏭️  ${email}: No encontrado`);
        } else if (user) {
          users.push({ email, role, id: user.id, metadata: user.user_metadata || {} });
        }
      } catch (e) {
        console.log(`⏭️  ${email}: Error - ${e.message}`);
      }
    }

    console.log(`✅ Se encontraron ${users.length} usuarios\n`);

    if (users.length === 0) {
      console.warn('⚠️  No se encontraron usuarios con esos correos');
      console.log('\n📧 Correos esperados:');
      adminEmails.forEach(a => console.log(`   - ${a.email} (${a.role})`));
      return;
    }

    // 2. Actualizar cada usuario con su rol
    console.log('🔐 Actualizando roles...');
    for (const { email, role, id, metadata } of users) {
      metadata.roles = [role];

      const { error: updateError } = await supabase.auth.admin.updateUserById(id, {
        user_metadata: metadata
      });

      if (updateError) {
        console.log(`❌ ${email}: Error - ${updateError.message}`);
      } else {
        console.log(`✅ ${email}: Asignado rol ${role}`);
      }
    }

    // 3. Verificar cambios
    console.log('\n📋 Verificando cambios...');
    console.log('\n🎯 Estado final:');
    for (const { email } of adminEmails) {
      try {
        const { data: { user } } = await supabase.auth.admin.getUserByEmail(email);
        if (user) {
          const roles = user.user_metadata?.roles || [];
          console.log(`   ${email}: roles = ${JSON.stringify(roles)}`);
        }
      } catch (e) {
        // Skip
      }
    }

    console.log('\n✨ ¡Hecho!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
