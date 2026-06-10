import { supabase } from './supabase';

export const getCatalogItems = async (page = 1, limit = 50, filters = {}, searchQuery = '', sortBy = 'name', sortDirection = 'desc') => {
    try {
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        let query = supabase.from('catalog_items').select('*', { count: 'exact' });

        if (searchQuery) {
            query = query.or(`name.ilike.%${searchQuery}%,specification.ilike.%${searchQuery}%,stored_location.ilike.%${searchQuery}%,barcode.eq.${searchQuery}`);
        }

        if (filters.type) {
            query = query.eq('type', filters.type);
        }

        const { data, error, count } = await query
            .order(sortBy, { ascending: sortDirection === 'asc' })
            .range(from, to);

        if (error) throw error;
        return { data, error: null, count };
    } catch (error) {
        console.error('Error fetching catalog items:', error);
        return { data: null, error, count: 0 };
    }
};

export const getAllCatalogItemsForExport = async () => {
    try {
        const { data, error } = await supabase
            .from('catalog_items')
            .select('*')
            .order('name', { ascending: true });

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        console.error('Error fetching all catalog items:', error);
        return { data: null, error };
    }
};

export const getCatalogItemById = async (id) => {
    try {
        const { data, error } = await supabase
            .from('catalog_items')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        console.error('Error fetching catalog item:', error);
        return { data: null, error };
    }
};

export const createCatalogItem = async (catalogData) => {
    try {
        const { data, error } = await supabase
            .from('catalog_items')
            .insert([catalogData])
            .select()
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        console.error('Error creating catalog item:', error);
        return { data: null, error };
    }
};

export const updateCatalogItem = async (id, catalogData) => {
    try {
        const { data, error } = await supabase
            .from('catalog_items')
            .update(catalogData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        console.error('Error updating catalog item:', error);
        return { data: null, error };
    }
};

export const deleteCatalogItem = async (id) => {
    try {
        const { error } = await supabase
            .from('catalog_items')
            .delete()
            .eq('id', id);

        if (error) throw error;
        return { error: null };
    } catch (error) {
        console.error('Error deleting catalog item:', error);
        return { error };
    }
};
