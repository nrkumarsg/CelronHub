import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://dfoihdzpgkrtyerzzchm.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmb2loZHpwZ2tydHllcnp6Y2htIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1NzMxMTgsImV4cCI6MjA4NzE0OTExOH0.9FGN21KeUpS0UyyFJJ1YjXLElL4AF6ym_hKAJsr_ek4';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  console.log('Signing in...');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'testuser@celron.com',
    password: 'password123',
  });

  if (authError) {
    console.error('Sign in failed:', authError.message);
    return;
  }
  console.log('Signed in successfully as:', authData.user.email);

  // Run the exact query from GstReporting.jsx
  console.log('Running query with select("*, partners(name)")...');
  const { data, error } = await supabase
    .from('workflow_documents')
    .select('*, partners(name)')
    .eq('company_id', '8431cd0b-7449-44a5-8213-2a8680d09ebe')
    .in('document_type', ['Tax Invoice', 'Proforma Invoice', 'Purchase Order'])
    .order('issue_date', { ascending: false });

  if (error) {
    console.error('Query FAILED with select("*, partners(name)"):', error);
  } else {
    console.log('Query succeeded! Total returned:', data?.length);
    console.log('First doc:', data?.[0]);
  }

  // Run query with select("*")
  console.log('Running query with select("*")...');
  const { data: data2, error: error2 } = await supabase
    .from('workflow_documents')
    .select('*')
    .eq('company_id', '8431cd0b-7449-44a5-8213-2a8680d09ebe')
    .in('document_type', ['Tax Invoice', 'Proforma Invoice', 'Purchase Order'])
    .order('issue_date', { ascending: false });

  if (error2) {
    console.error('Query FAILED with select("*"):', error2);
  } else {
    console.log('Query with select("*") succeeded! Total returned:', data2?.length);
    console.log('First doc:', data2?.[0]);
  }
}

run();
