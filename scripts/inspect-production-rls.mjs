#!/usr/bin/env node
/**
 * Inspect production database RLS policies
 * Uses service_role key for full access
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../.env.local');

// Load environment variables
let supabaseUrl, supabaseServiceKey;
try {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const urlMatch = envContent.match(/VITE_SUPABASE_URL=(.+)/);
  const keyMatch = envContent.match(/SUPABASE_SERVICE_KEY=(.+)|SUPABASE_SERVICE_ROLE_KEY=(.+)/);
  
  supabaseUrl = urlMatch?.[1]?.trim();
  supabaseServiceKey = keyMatch?.[1]?.trim() || keyMatch?.[2]?.trim();
  
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing env vars');
  }
} catch (error) {
  console.error('❌ Cannot read .env.local:', error.message);
  console.error('Please set VITE_SUPABASE_URL and SUPABASE_SERVICE_KEY/.env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

console.log('🔍 Production RLS Policy Inspector\n');
console.log(`📍 Supabase URL: ${supabaseUrl}`);
console.log(`🔑 Using service_role key\n`);

async function inspectPolicies() {
  console.log('📋 Querying storage.objects policies from production...\n');
  
  try {
    // Query pg_policy table directly
    const { data, error } = await supabase
      .from('pg_policies')
      .select('*')
      .eq('tablename', 'objects')
      .eq('schemaname', 'storage');
    
    if (error) {
      console.log('⚠️  Cannot query pg_policies table (expected)');
      console.log(`   Error: ${error.message}\n`);
    } else if (data && data.length > 0) {
      console.log(`✅ Found ${data.length} policies:\n`);
      data.forEach((policy, i) => {
        console.log(`${i + 1}. ${policy.policyname}`);
        console.log(`   - Role: ${policy.roles || 'public'}`);
        console.log(`   - Type: ${policy.permissive ? 'PERMISSIVE' : 'RESTRICTIVE'}`);
        console.log(`   - Cmd: ${policy.cmd}`);
      });
    }
  } catch (error) {
    console.log('⚠️  pg_policies query failed (expected)\n');
  }

  // Try direct SQL query
  console.log('\n📋 Attempting direct SQL query...\n');
  
  try {
    const { data, error } = await supabase.rpc('get_storage_policies');
    
    if (error) {
      console.log('⚠️  RPC call failed');
      console.log(`   Error: ${error.message}\n`);
    } else {
      console.log('✅ RPC Response:', data);
    }
  } catch (error) {
    console.log('⚠️  RPC failed (expected)\n');
  }

  // Try another approach: query information_schema
  console.log('\n📋 Checking table existence and RLS state...\n');
  
  try {
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name, table_schema')
      .eq('table_name', 'objects')
      .eq('table_schema', 'storage');
    
    if (tablesError) {
      console.log('⚠️  Cannot query information_schema.tables');
    } else if (tables && tables.length > 0) {
      console.log(`✅ Table storage.objects exists`);
    }
  } catch (error) {
    console.log('⚠️  information_schema query failed\n');
  }

  // Check bucket configuration
  console.log('\n📋 Checking bucket configuration...\n');
  
  try {
    const { data: buckets, error } = await supabase.storage.listBuckets();
    
    if (error) {
      console.log('❌ Cannot list buckets:', error.message);
    } else {
      const soportes = buckets.find(b => b.name === 'soportes');
      if (soportes) {
        console.log('✅ Bucket "soportes" configuration:');
        console.log(`   - ID: ${soportes.id}`);
        console.log(`   - Public: ${soportes.public}`);
        console.log(`   - Created: ${soportes.created_at}`);
        console.log(`   - Updated: ${soportes.updated_at}`);
      } else {
        console.log('❌ Bucket "soportes" not found!');
      }
    }
  } catch (error) {
    console.log('❌ Bucket inspection failed:', error.message);
  }

  // Try to get more info about bucket restrictions
  console.log('\n📋 Checking Supabase project settings...\n');
  
  try {
    const { data: config, error } = await supabase
      .from('storage.buckets')
      .select('*')
      .eq('name', 'soportes');
    
    if (error) {
      console.log('⚠️  Cannot query storage.buckets directly:', error.message);
    } else if (config) {
      console.log('✅ Bucket config:', JSON.stringify(config, null, 2));
    }
  } catch (error) {
    console.log('⚠️  Direct bucket query failed\n');
  }
}

await inspectPolicies();

console.log('\n' + '='.repeat(60));
console.log('✅ Inspection completed\n');
console.log('💡 IMPORTANT: Check Supabase dashboard directly at:');
console.log('   https://supabase.com/dashboard/project/*/storage/policies');
console.log('\n   You may need to manually review/fix the RLS policies there.\n');
