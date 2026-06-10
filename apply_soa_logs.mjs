import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

// Try both .env and .env.local
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials in .env or .env.local");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const sql = fs.readFileSync('create_soa_dispatch_logs.sql', 'utf-8');

async function run() {
    console.log('Applying SQL migration to create public.soa_dispatch_logs table...');
    try {
        const { data, error } = await supabase.rpc('exec_sql', { query: sql });
        if (error) {
            console.error('RPC ERROR:', error.message);
            console.log('\nTIP: If "exec_sql" function is not found, you can run the SQL manually in the Supabase SQL Editor.');
            process.exit(1);
        }
        console.log('SUCCESS: Table public.soa_dispatch_logs created successfully.');
    } catch (err) {
        console.error('FAILED:', err.message);
        process.exit(1);
    }
}

run();
