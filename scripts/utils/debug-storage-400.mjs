#!/usr/bin/env node
/**
 * Debug script to investigate Storage 400 error
 * Tests multiple upload scenarios to isolate the root cause
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../.env.local');

// Load environment variables
let supabaseUrl, supabaseAnonKey;
try {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const urlMatch = envContent.match(/VITE_SUPABASE_URL=(.+)/);
  const keyMatch = envContent.match(/VITE_SUPABASE_ANON_KEY=(.+)/);
  
  supabaseUrl = urlMatch?.[1]?.trim();
  supabaseAnonKey = keyMatch?.[1]?.trim();
  
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing env vars');
  }
} catch (error) {
  console.error('❌ Cannot read .env.local:', error.message);
  console.error('Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

console.log('🔍 Storage 400 Debug Script\n');
console.log(`📍 Supabase URL: ${supabaseUrl}`);
console.log(`🔑 Anon Key: ${supabaseAnonKey.substring(0, 20)}...\n`);

async function test(name, fn) {
  try {
    console.log(`\n📋 ${name}`);
    console.log('='.repeat(60));
    await fn();
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    if (error.response) {
      console.error(`Response Status: ${error.response.status}`);
      console.error(`Response Body:`, error.response.body);
    }
  }
}

// Test 1: Check if bucket exists and is accessible
await test('1️⃣  Check bucket access', async () => {
  try {
    const { data, error } = await supabase.storage.listBuckets();
    if (error) throw error;
    
    const supporteBucket = data.find(b => b.name === 'soportes');
    if (!supporteBucket) {
      console.log('❌ Bucket "soportes" not found!');
      console.log('Available buckets:', data.map(b => b.name).join(', '));
    } else {
      console.log(`✅ Bucket "soportes" found`);
      console.log(`   Public: ${supporteBucket.public}`);
      console.log(`   Created: ${supporteBucket.created_at}`);
    }
  } catch (error) {
    console.log('⚠️  Cannot list buckets (might be expected for anon user)');
  }
});

// Test 2: Upload minimal file to root of bucket
await test('2️⃣  Upload test file to root', async () => {
  const testBuffer = Buffer.from('test content');
  const fileName = `test-${Date.now()}.txt`;
  
  const { data, error } = await supabase.storage
    .from('soportes')
    .upload(fileName, testBuffer, {
      contentType: 'text/plain',
    });
  
  if (error) throw error;
  console.log(`✅ Upload successful: ${data.path}`);
  
  // Clean up
  await supabase.storage.from('soportes').remove([fileName]);
  console.log(`🧹 Cleaned up: ${fileName}`);
});

// Test 3: Upload PDF-like file to root
await test('3️⃣  Upload PDF-like file to root', async () => {
  // Minimal PDF header
  const pdfBuffer = Buffer.from('%PDF-1.4\n%EOF', 'utf-8');
  const fileName = `test-${Date.now()}.pdf`;
  
  const { data, error } = await supabase.storage
    .from('soportes')
    .upload(fileName, pdfBuffer, {
      contentType: 'application/pdf',
    });
  
  if (error) throw error;
  console.log(`✅ Upload successful: ${data.path}`);
  
  // Clean up
  await supabase.storage.from('soportes').remove([fileName]);
  console.log(`🧹 Cleaned up: ${fileName}`);
});

// Test 4: Upload to nested path like the actual code
await test('4️⃣  Upload to nested path (beneficiarios_historicos/)', async () => {
  const pdfBuffer = Buffer.from('%PDF-1.4\n%EOF', 'utf-8');
  const fileName = `beneficiarios_historicos/test-3027/documentos/test-${Date.now()}.pdf`;
  
  const { data, error } = await supabase.storage
    .from('soportes')
    .upload(fileName, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    });
  
  if (error) throw error;
  console.log(`✅ Upload successful: ${data.path}`);
  
  // Clean up
  const pathToDelete = `beneficiarios_historicos/test-3027/documentos/test-${Date.now()}.pdf`;
  await supabase.storage.from('soportes').remove([pathToDelete]);
  console.log(`🧹 Cleaned up: ${pathToDelete}`);
});

// Test 5: Try uploading exactly like the onboarding form
await test('5️⃣  Upload exactly like onboarding form', async () => {
  const beneficiarioId = 3027;
  const tipoDoc = 'acta_grado';
  
  // Create a minimal PDF
  const pdfBuffer = Buffer.from('%PDF-1.4\n%EOF', 'utf-8');
  const bucketPath = `beneficiarios_historicos/${beneficiarioId}/documentos/${tipoDoc}.pdf`;
  
  console.log(`   Path: ${bucketPath}`);
  console.log(`   File size: ${pdfBuffer.length} bytes`);
  console.log(`   Content-Type: application/pdf`);
  
  const { data, error } = await supabase.storage
    .from('soportes')
    .upload(bucketPath, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    });
  
  if (error) throw error;
  console.log(`✅ Upload successful: ${data.path}`);
});

// Test 6: Check if user is actually anonymous
await test('6️⃣  Check authentication status', async () => {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.log('⚠️  No session (expected for anon)');
  } else if (data.session) {
    console.log('⚠️  User is authenticated!');
    console.log(`   User ID: ${data.session.user.id}`);
  } else {
    console.log('✅ Correctly anonymous (no session)');
  }
});

// Test 7: Verify policies exist in database
await test('7️⃣  Check RLS policies in database', async () => {
  try {
    const { data, error } = await supabase
      .from('pg_policies')
      .select('policyname, qual, with_check')
      .eq('schemaname', 'storage')
      .eq('tablename', 'objects');
    
    if (error) throw error;
    console.log(`✅ Found ${data.length} policies`);
    data.forEach(p => console.log(`   - ${p.policyname}`));
  } catch (error) {
    console.log('⚠️  Cannot query policies directly (expected)');
  }
});

console.log('\n' + '='.repeat(60));
console.log('✅ Debug script completed\n');
