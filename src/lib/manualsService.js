import { supabase } from './supabase';

/**
 * Fetch all manuals from the library.
 */
export const getManuals = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: [], error: 'Not authenticated' };

    const { data, error } = await supabase
        .from('manuals_library')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
    return { data, error };
};

/**
 * Save a new manual metadata record.
 */
export const saveManual = async (manual) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const row = {
        ...manual,
        user_id: user.id,
        company_id: manual.company_id || user.user_metadata?.company_id
    };

    const { data, error } = await supabase
        .from('manuals_library')
        .upsert([row])
        .select()
        .single();

    if (error && error.code === 'PGRST204') {
        console.warn('[DB Fallback] Column not found, packing custom columns into info JSON...');
        const packedInfo = JSON.stringify({
            manufacturer: row.manufacturer,
            model: row.model,
            category: row.category,
            keywords: row.keywords,
            summary: row.summary,
            thumbnail_url: row.thumbnail_url,
            is_missing: row.is_missing,
            is_duplicate: row.is_duplicate,
            tags: row.tags,
            file_size: row.file_size,
            content_extracted: row.content_extracted
        });

        const fallbackRow = {
            title: row.title,
            group_name: row.category || row.group_name || 'Technical',
            author_company: row.manufacturer || row.author_company || 'Unknown',
            file_url: row.file_url,
            file_id: row.file_id,
            info: packedInfo,
            user_id: user.id,
            company_id: row.company_id
        };

        if (row.id) {
            fallbackRow.id = row.id;
        }

        const fallbackRes = await supabase
            .from('manuals_library')
            .upsert([fallbackRow])
            .select()
            .single();

        return fallbackRes;
    }

    return { data, error };
};

/**
 * Delete a manual record.
 */
export const deleteManual = async (id) => {
    const { error } = await supabase
        .from('manuals_library')
        .delete()
        .eq('id', id);
    return { error };
};
