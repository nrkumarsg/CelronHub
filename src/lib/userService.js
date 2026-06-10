import { supabase } from './supabase';

export const getProfile = async (userId) => {
    try {
        const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (profileError) throw profileError;

        // Fetch company separately if profile has company_id
        let companyData = null;
        if (profileData?.company_id) {
            const { data: cData } = await supabase
                .from('companies')
                .select('*')
                .eq('id', profileData.company_id)
                .single();
            companyData = cData;
        }

        return { data: { ...profileData, company: companyData }, error: null };
    } catch (error) {
        console.error('Error fetching profile:', error);
        return { data: null, error };
    }
};

export const getAllProfiles = async () => {
    try {
        // Fetch profiles first
        const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select('*')
            .order('created_at', { ascending: false });

        if (profilesError) throw profilesError;

        if (!profiles || profiles.length === 0) {
            return { data: [], error: null };
        }

        // Fetch all companies to map them in memory separately
        const { data: companies } = await supabase
            .from('companies')
            .select('id, name');

        // Create a lookup map for companies
        const companyMap = {};
        if (companies) {
            companies.forEach(c => {
                companyMap[c.id] = c;
            });
        }

        // Map the company info to each profile in memory
        const data = profiles.map(p => ({
            ...p,
            company: p.company_id ? companyMap[p.company_id] : null
        }));

        return { data, error: null };
    } catch (error) {
        console.error('Error fetching all profiles:', error);
        return { data: null, error };
    }
};

export const updateProfile = async (userId, updates) => {
    try {
        const payload = { ...updates };
        // Remove fields that shouldn't be updated directly via profile
        delete payload.id;
        delete payload.created_at;
        delete payload.updated_at;

        const { data, error } = await supabase
            .from('profiles')
            .update(payload)
            .eq('id', userId)
            .select()
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        console.error('Error updating profile:', error);
        return { data: null, error };
    }
};

export const createProfileManually = async (profileData) => {
    try {
        const isNrKumar = profileData.email?.toLowerCase() === 'nrkumarsg@gmail.com';
        // Clean the payload to keep only database-level columns and prevent schema cache errors
        const payload = {
            id: profileData.id,
            email: profileData.email,
            role: profileData.role || (isNrKumar ? 'superadmin' : 'user'),
            status: profileData.status || 'active',
            company_id: profileData.company_id,
            accessible_modules: profileData.accessible_modules || []
        };

        const { data, error } = await supabase
            .from('profiles')
            .insert([payload])
            .select()
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        console.error('Error creating profile:', error);
        return { data: null, error };
    }
};

export const deleteProfile = async (userId) => {
    try {
        // Note: This usually requires elevated permissions or deleting the Auth user first
        const { error } = await supabase
            .from('profiles')
            .delete()
            .eq('id', userId);

        if (error) throw error;
        return { error: null };
    } catch (error) {
        console.error('Error deleting profile:', error);
        return { error };
    }
};

export const getAllCompanies = async () => {
    try {
        const { data, error } = await supabase
            .from('companies')
            .select('*')
            .order('name', { ascending: true });

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        console.error('Error fetching companies:', error);
        return { data: null, error };
    }
};

// --- STAFF DIRECTORY (NEW TABLE) ---

export const getAllStaff = async () => {
    try {
        const { data, error } = await supabase
            .from('staff')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        console.error('Error fetching staff:', error);
        return { data: null, error };
    }
};

export const createStaff = async (staffData) => {
    try {
        const { data, error } = await supabase
            .from('staff')
            .insert([staffData])
            .select()
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        console.error('Error creating staff:', error);
        return { data: null, error };
    }
};

export const updateStaff = async (staffId, updates) => {
    try {
        const payload = { ...updates };
        delete payload.id;
        delete payload.created_at;

        const { data, error } = await supabase
            .from('staff')
            .update(payload)
            .eq('id', staffId)
            .select()
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        console.error('Error updating staff:', error);
        return { data: null, error };
    }
};

export const deleteStaff = async (staffId) => {
    try {
        const { error } = await supabase
            .from('staff')
            .delete()
            .eq('id', staffId);

        if (error) throw error;
        return { error: null };
    } catch (error) {
        console.error('Error deleting staff:', error);
        return { error };
    }
};
