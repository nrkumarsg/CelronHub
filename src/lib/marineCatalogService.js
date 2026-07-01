import { supabase } from './supabase';

// Helper to handle API responses cleanly
const handleResponse = async (promise) => {
    try {
        const { data, error, count } = await promise;
        if (error) throw error;
        return { data, error: null, count };
    } catch (error) {
        console.error('API Error:', error.message || error);
        return { data: null, error, count: 0 };
    }
};

// 1. Departments Service
export const getDepartments = async (companyId) => {
    let query = supabase.from('catalog_departments').select('*').order('name');
    if (companyId) query = query.eq('company_id', companyId);
    return handleResponse(query);
};

export const createDepartment = async (name, companyId) => {
    const payload = { name };
    if (companyId) payload.company_id = companyId;
    return handleResponse(supabase.from('catalog_departments').insert([payload]).select().single());
};

// 2. Equipment Groups Service
export const getEquipmentGroups = async (companyId) => {
    let query = supabase.from('catalog_equipment_groups').select('*').order('name');
    if (companyId) query = query.eq('company_id', companyId);
    return handleResponse(query);
};

export const createEquipmentGroup = async (name, companyId) => {
    const payload = { name };
    if (companyId) payload.company_id = companyId;
    return handleResponse(supabase.from('catalog_equipment_groups').insert([payload]).select().single());
};

// 3. Makers (Manufacturers / Makes) Service
export const getMakers = async (companyId) => {
    let query = supabase.from('catalog_makers').select('*').order('name');
    if (companyId) query = query.eq('company_id', companyId);
    return handleResponse(query);
};

export const createMaker = async (name, companyId) => {
    const payload = { name };
    if (companyId) payload.company_id = companyId;
    return handleResponse(supabase.from('catalog_makers').insert([payload]).select().single());
};

// 4. Models Service
export const getModels = async (companyId, makerId = null) => {
    let query = supabase.from('catalog_models').select('*, maker:catalog_makers(name)').order('name');
    if (companyId) query = query.eq('company_id', companyId);
    if (makerId) query = query.eq('maker_id', makerId);
    return handleResponse(query);
};

export const createModel = async (name, makerId, companyId) => {
    const payload = { name, maker_id: makerId };
    if (companyId) payload.company_id = companyId;
    return handleResponse(supabase.from('catalog_models').insert([payload]).select().single());
};

// 5. Assemblies Service
export const getAssemblies = async (companyId, modelId = null) => {
    let query = supabase.from('catalog_assemblies').select('*, model:catalog_models(name)').order('name');
    if (companyId) query = query.eq('company_id', companyId);
    if (modelId) query = query.eq('model_id', modelId);
    return handleResponse(query);
};

export const createAssembly = async (name, modelId, companyId) => {
    const payload = { name, model_id: modelId };
    if (companyId) payload.company_id = companyId;
    return handleResponse(supabase.from('catalog_assemblies').insert([payload]).select().single());
};

// 6. Warehouses Service
export const getWarehouses = async (companyId) => {
    let query = supabase.from('catalog_warehouses').select('*').order('name');
    if (companyId) query = query.eq('company_id', companyId);
    return handleResponse(query);
};

export const createWarehouse = async (name, location, companyId) => {
    const payload = { name, location };
    if (companyId) payload.company_id = companyId;
    return handleResponse(supabase.from('catalog_warehouses').insert([payload]).select().single());
};

// 7. Units (UOM) Service
export const getUnits = async (companyId) => {
    let query = supabase.from('catalog_units').select('*').order('name');
    if (companyId) query = query.eq('company_id', companyId);
    return handleResponse(query);
};

export const createUnit = async (name, symbol, companyId) => {
    const payload = { name, symbol };
    if (companyId) payload.company_id = companyId;
    return handleResponse(supabase.from('catalog_units').insert([payload]).select().single());
};

// 8. Systems Service
export const getSystems = async (page = 1, limit = 50, searchQuery = '', filters = {}, companyId) => {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase.from('marine_systems').select(`
        *,
        department:catalog_departments(name),
        equipment_group:catalog_equipment_groups(name),
        maker:catalog_makers(name),
        model:catalog_models(name)
    `, { count: 'exact' });

    if (companyId) query = query.eq('company_id', companyId);
    if (filters.department_id) query = query.eq('department_id', filters.department_id);
    if (filters.equipment_group_id) query = query.eq('equipment_group_id', filters.equipment_group_id);
    if (filters.maker_id) query = query.eq('maker_id', filters.maker_id);

    if (searchQuery) {
        query = query.or(`name.ilike.%${searchQuery}%,system_no.ilike.%${searchQuery}%`);
    }

    return handleResponse(query.order('name').range(from, to));
};

export const getSystemById = async (id) => {
    return handleResponse(supabase.from('marine_systems').select(`
        *,
        department:catalog_departments(name),
        equipment_group:catalog_equipment_groups(name),
        maker:catalog_makers(name),
        model:catalog_models(name)
    `).eq('id', id).single());
};

export const createSystem = async (systemData) => {
    return handleResponse(supabase.from('marine_systems').insert([systemData]).select().single());
};

export const updateSystem = async (id, systemData) => {
    return handleResponse(supabase.from('marine_systems').update(systemData).eq('id', id).select().single());
};

export const deleteSystem = async (id) => {
    return handleResponse(supabase.from('marine_systems').delete().eq('id', id));
};

// 9. Documents, Photos, and Notes Unified Service
export const getMarineDocuments = async (entityType, entityId) => {
    return handleResponse(supabase.from('marine_documents').select('*').eq('entity_type', entityType).eq('entity_id', entityId).order('created_at', { ascending: false }));
};

export const createMarineDocument = async (payload) => {
    return handleResponse(supabase.from('marine_documents').insert([payload]).select().single());
};

export const deleteMarineDocument = async (id) => {
    return handleResponse(supabase.from('marine_documents').delete().eq('id', id));
};

export const getMarinePhotos = async (entityType, entityId) => {
    return handleResponse(supabase.from('marine_photos').select('*').eq('entity_type', entityType).eq('entity_id', entityId).order('created_at', { ascending: true }));
};

export const createMarinePhoto = async (payload) => {
    return handleResponse(supabase.from('marine_photos').insert([payload]).select().single());
};

export const deleteMarinePhoto = async (id) => {
    return handleResponse(supabase.from('marine_photos').delete().eq('id', id));
};

export const getMarineNotes = async (entityType, entityId) => {
    return handleResponse(supabase.from('marine_notes').select('*').eq('entity_type', entityType).eq('entity_id', entityId).order('created_at', { ascending: false }));
};

export const createMarineNote = async (payload) => {
    return handleResponse(supabase.from('marine_notes').insert([payload]).select().single());
};

export const deleteMarineNote = async (id) => {
    return handleResponse(supabase.from('marine_notes').delete().eq('id', id));
};

// 10. System Maintenance Service
export const getSystemMaintenanceTasks = async (systemId) => {
    return handleResponse(supabase.from('marine_system_maintenance').select('*').eq('system_id', systemId).order('next_due_date', { ascending: true }));
};

export const createSystemMaintenanceTask = async (taskData) => {
    return handleResponse(supabase.from('marine_system_maintenance').insert([taskData]).select().single());
};

export const updateSystemMaintenanceTask = async (id, taskData) => {
    return handleResponse(supabase.from('marine_system_maintenance').update(taskData).eq('id', id).select().single());
};

export const deleteSystemMaintenanceTask = async (id) => {
    return handleResponse(supabase.from('marine_system_maintenance').delete().eq('id', id));
};

// 11. Compatibility Service
export const getSparePartCompatibility = async (sparePartId) => {
    return handleResponse(supabase.from('spare_part_compatibility').select(`
        *,
        system:marine_systems(name, system_no),
        model:catalog_models(name, model_no)
    `).eq('spare_part_id', sparePartId));
};

export const createCompatibilityMapping = async (mappingData) => {
    return handleResponse(supabase.from('spare_part_compatibility').insert([mappingData]).select().single());
};

export const deleteCompatibilityMapping = async (id) => {
    return handleResponse(supabase.from('spare_part_compatibility').delete().eq('id', id));
};

// 12. Audit Logs Service
export const getMarineAuditLogs = async (entityType, entityId) => {
    return handleResponse(supabase.from('marine_audit_logs').select('*').eq('entity_type', entityType).eq('entity_id', entityId).order('created_at', { ascending: false }));
};

export const logMarineAction = async (entityType, entityId, action, changedFields = {}, userId, companyId) => {
    const payload = {
        entity_type: entityType,
        entity_id: entityId,
        action,
        changed_fields: changedFields,
        user_id: userId
    };
    if (companyId) payload.company_id = companyId;
    return handleResponse(supabase.from('marine_audit_logs').insert([payload]));
};
