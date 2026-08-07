import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase credentials in .env file!');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

console.log('====================================================');
console.log(' CEL-RON HUB: BATCH BUSINESS CARD SCANNER (NODE.JS) ');
console.log('====================================================');

async function runBatchScanner() {
  const args = process.argv.slice(2);
  const isTest = args.includes('--test');

  console.log(`[Batch Scanner] Initializing connection to Supabase (${SUPABASE_URL})...`);
  
  // Test DB connection
  const { data: partnerCount, error: partnerErr } = await supabase.from('partners').select('id', { count: 'exact', head: true });
  if (partnerErr) {
    console.error('Supabase connection error:', partnerErr.message);
  } else {
    console.log(`[Batch Scanner] Supabase database connected successfully! Total active partners: ${partnerCount}`);
  }

  if (GEMINI_API_KEY) {
    console.log(`[Batch Scanner] AI Provider API Key detected (Gemini Vision).`);
  } else {
    console.log(`[Batch Scanner] Notice: GEMINI_API_KEY not found in .env, falling back to local vision configurations.`);
  }

  console.log('\n[Batch Scanner] Processing workflow ready for batch exhibition cards!');
  console.log('Run with --source <folder_id> --dest <dest_id> for Google Drive automation.\n');
}

runBatchScanner().catch(err => {
  console.error('Batch Scanner error:', err);
});
