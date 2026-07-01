import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(url, key);

async function createTestUser() {
    console.log('Attempting to create test user...');
    const { data, error } = await supabase.auth.signUp({
        email: 'nrkumarsg@gmail.com',
        password: 'Mother1973',
    });

    if (error) {
        console.error('Error:', error.message);
    } else {
        console.log('User created or already exists:', data.user?.email);
        console.log('Identities:', data.user?.identities);
    }
}

createTestUser();

