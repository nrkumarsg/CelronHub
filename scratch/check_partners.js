import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(url, key);

async function run() {
    const { data: partners, error } = await supabase
        .from('partners')
        .select('id, name');
    
    if (error) {
        console.error('Error fetching partners:', error);
    } else {
        const matches = partners.filter(p => 
            p.name.toLowerCase().includes('seagull') || 
            p.name.toLowerCase().includes('renis')
        );
        console.log('Matches:', matches);
    }
}

run();
