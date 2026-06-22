import { supabase } from './supabase';

/**
 * Fetches all companies that the current user belongs to.
 */
export const getMyCompanies = async (userId) => {
    if (!userId) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return { data: [], error: 'Not authenticated' };
        userId = session.user.id;
    }

    // Fetch flat memberships
    const { data: memberships, error: cuError } = await supabase
        .from('company_users')
        .select('id, role, company_id')
        .eq('user_id', userId);

    if (cuError) {
        console.error('Error fetching company_users:', cuError);
        return { data: [], error: cuError };
    }

    if (!memberships || memberships.length === 0) {
        return { data: [], error: null };
    }

    // Fetch all companies to join in-memory
    let { data: allCompanies, error: cError } = await supabase
        .from('companies')
        .select('id, name, slug, logo_url, enabled_modules');

    if (cError && (cError.code === '42703' || String(cError.message).includes('enabled_modules'))) {
        console.warn('enabled_modules column is missing. Querying without it...');
        const retry = await supabase
            .from('companies')
            .select('id, name, slug, logo_url');
        if (!retry.error) {
            allCompanies = retry.data;
            cError = null;
        }
    }

    if (cError) {
        console.error('Error fetching companies for join fallback:', cError);
        // Fallback to stubs if companies cannot be queried directly
        const companies = memberships.map(cu => ({
            id: cu.company_id,
            name: cu.company_id === '8431cd0b-7449-44a5-8213-2a8680d09ebe' ? 'CEL-RON ENTERPRISES PTE LTD' : 'Company ' + cu.company_id.substring(0, 8),
            slug: cu.company_id === '8431cd0b-7449-44a5-8213-2a8680d09ebe' ? 'celron-enterprises' : 'company-' + cu.company_id.substring(0, 8),
            logo_url: cu.company_id === '8431cd0b-7449-44a5-8213-2a8680d09ebe' ? '/logo.png' : null,
            role: cu.role,
            junction_id: cu.id
        }));
        return { data: companies, error: null };
    }

    // Map companies in-memory
    const companyMap = {};
    if (allCompanies) {
        allCompanies.forEach(c => {
            companyMap[c.id] = c;
        });
    }

    const companies = memberships.map(cu => {
        const comp = companyMap[cu.company_id] || {
            id: cu.company_id,
            name: cu.company_id === '8431cd0b-7449-44a5-8213-2a8680d09ebe' ? 'CEL-RON ENTERPRISES PTE LTD' : 'Unknown Company',
            slug: cu.company_id === '8431cd0b-7449-44a5-8213-2a8680d09ebe' ? 'celron-enterprises' : 'unknown'
        };
        return {
            ...comp,
            role: cu.role,
            junction_id: cu.id
        };
    }).filter(comp => {
        const nameLower = comp.name?.toLowerCase();
        const isCelron = nameLower === 'cel-ron enterprises pte ltd' || 
                         nameLower === 'celron hub' || 
                         nameLower === 'cel-ron hub';
        if (isCelron && comp.id !== '8431cd0b-7449-44a5-8213-2a8680d09ebe') {
            return false;
        }
        return true;
    });

    return { data: companies, error: null };
};

/**
 * Creates a new company record.
 * Handles slug generation: if slug is provided, uses it; otherwise generates from name.
 */
export const createCompany = async (name, slug) => {
    let finalSlug = slug || name.toLowerCase().trim().replace(/ /g, '-').replace(/[^a-z0-9-]/g, '');

    // Ensure slug is not empty
    if (!finalSlug) finalSlug = 'company-' + Math.floor(Math.random() * 1000);

    const { data, error } = await supabase
        .from('companies')
        .insert([{ name, slug: finalSlug }])
        .select()
        .single();
    return { data, error };
};

/**
 * Ensures a company exists with the given name for demo purposes.
 */
export const ensureDemoCompany = async (name = 'Cel-Ron Demo') => {
    const { data: existing } = await supabase
        .from('companies')
        .select('*')
        .eq('name', name)
        .limit(1)
        .single();

    if (existing) return existing;

    const { data } = await createCompany(name);
    return data;
};

/**
 * Superadmin utility: Get all companies in the system.
 */
export const getAllCompanies = async () => {
    const { data, error } = await supabase
        .from('companies')
        .select('*')
        .order('name', { ascending: true });
        
    if (data) {
        const filtered = data.filter(comp => {
            const nameLower = comp.name?.toLowerCase();
            const isCelron = nameLower === 'cel-ron enterprises pte ltd' || 
                             nameLower === 'celron hub' || 
                             nameLower === 'cel-ron hub';
            if (isCelron && comp.id !== '8431cd0b-7449-44a5-8213-2a8680d09ebe') {
                return false;
            }
            return true;
        });
        return { data: filtered, error };
    }
    return { data, error };
};

/**
 * Assign or update a user's role in a company.
 */
export const assignUserToCompany = async (userId, companyId, role = 'staff') => {
    const { data, error } = await supabase
        .from('company_users')
        .upsert([{ user_id: userId, company_id: companyId, role }], { onConflict: 'user_id,company_id' })
        .select()
        .single();
    return { data, error };
};

/**
 * Remove a user from a company.
 */
export const removeUserFromCompany = async (userId, companyId) => {
    const { error } = await supabase
        .from('company_users')
        .delete()
        .eq('user_id', userId)
        .eq('company_id', companyId);
    return { error };
};

/**
 * Update company metadata (name, logo_url, etc.)
 */
export const updateCompany = async (companyId, updates) => {
    const { data, error } = await supabase
        .from('companies')
        .update(updates)
        .eq('id', companyId)
        .select()
        .single();
    return { data, error };
};

/**
 * Superadmin utility: Delete a company from the system.
 * WARNING: This will likely fail if there are foreign key constraints (cascade should be handled in DB).
 */
export const deleteCompany = async (companyId) => {
    const { error } = await supabase
        .from('companies')
        .delete()
        .eq('id', companyId);
    return { error };
};
