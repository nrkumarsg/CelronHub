import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(url, key);

async function run() {
    const { data: companies, error } = await supabase.from('companies').select('*');
    if (error) {
        console.error('Error fetching companies:', error.message);
    } else {
        console.log('Companies:', companies);
    }
}
run();
