import { supabase } from './supabase';

/**
 * Deduplicate partners by normalized company name.
 * Excludes merged duplicates and pending approval records.
 * If multiple records exist for the same company, preserves the active/primary record
 * and consolidates contacts and details.
 */
export const deduplicatePartners = (partnersList) => {
  if (!Array.isArray(partnersList)) return [];
  const map = new Map();

  for (const p of partnersList) {
    if (!p) continue;
    // Exclude merged duplicates and pending approval records
    if (p.status === 'merged_duplicate' || p.status === 'pending_approval') continue;

    const key = (p.name || '').trim().toLowerCase();
    if (!key) {
      map.set(p.id, p);
      continue;
    }

    if (!map.has(key)) {
      map.set(key, { ...p, contacts: Array.isArray(p.contacts) ? [...p.contacts] : [] });
    } else {
      const existing = map.get(key);

      // Merge contacts without duplicate IDs or emails
      const existingContactIds = new Set((existing.contacts || []).map(c => c.id || c.email || c.name));
      if (Array.isArray(p.contacts)) {
        p.contacts.forEach(c => {
          const cKey = c.id || c.email || c.name;
          if (cKey && !existingContactIds.has(cKey)) {
            existing.contacts.push(c);
            existingContactIds.add(cKey);
          }
        });
      }

      // If incoming record is Active and existing is not, prioritize incoming core details
      if (p.status === 'Active' && existing.status !== 'Active') {
        const mergedContacts = existing.contacts;
        Object.assign(existing, p);
        existing.contacts = mergedContacts;
      }

      // Fill in missing communication / profile details
      if (!existing.email1 && (p.email1 || p.email)) existing.email1 = p.email1 || p.email;
      if (!existing.email2 && p.email2) existing.email2 = p.email2;
      if (!existing.phone1 && (p.phone1 || p.phone)) existing.phone1 = p.phone1 || p.phone;
      if (!existing.phone2 && p.phone2) existing.phone2 = p.phone2;
      if (!existing.activity_summary && p.activity_summary) existing.activity_summary = p.activity_summary;
      if (!existing.info && p.info) existing.info = p.info;
      if (!existing.weblink && p.weblink) existing.weblink = p.weblink;
      if (!existing.country && p.country) existing.country = p.country;
      if (!existing.city && p.city) existing.city = p.city;
      if (!existing.address && p.address) existing.address = p.address;

      // Merge types
      if (Array.isArray(p.types)) {
        const typeSet = new Set(Array.isArray(existing.types) ? existing.types : []);
        p.types.forEach(t => t && typeSet.add(t));
        existing.types = Array.from(typeSet);
      }
    }
  }

  return Array.from(map.values());
};

export const getPartners = async (profile = null) => {
  let allData = [];
  let page = 0;
  const pageSize = 1000;
  let keepFetching = true;

  while (keepFetching) {
    let query = supabase
      .from('partners')
      .select('*, contacts(*)')
      .range(page * pageSize, (page + 1) * pageSize - 1)
      .order('name', { ascending: true });

    // Exclude pending drafts and merged duplicates from active lists
    query = query.or('status.is.null,and(status.neq.pending_approval,status.neq.merged_duplicate)');

    // ONLY filter if user is NOT a superadmin. Include company-specific and global/unassigned partners.
    if (profile?.company_id && profile.role !== 'superadmin') {
      query = query.or(`company_id.eq.${profile.company_id},company_id.is.null`);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching partners:', error);
      break;
    }

    if (data && data.length > 0) {
      allData = [...allData, ...data];
      if (data.length < pageSize) {
        keepFetching = false;
      } else {
        page++;
      }
    } else {
      keepFetching = false;
    }
  }

  // Fallback: If company filter returned 0 records, fetch global partners to prevent empty directory
  if (allData.length === 0 && profile?.company_id) {
    const { data } = await supabase
      .from('partners')
      .select('*, contacts(*)')
      .or('status.is.null,and(status.neq.pending_approval,status.neq.merged_duplicate)')
      .order('name', { ascending: true })
      .limit(1000);
    if (data && data.length > 0) {
      allData = data;
    }
  }

  return deduplicatePartners(allData);
};

export const getPendingPartners = async (profile = null) => {
  let allData = [];
  let page = 0;
  const pageSize = 1000;
  let keepFetching = true;

  while (keepFetching) {
    let query = supabase
      .from('partners')
      .select('*, contacts(*)')
      .range(page * pageSize, (page + 1) * pageSize - 1)
      .eq('status', 'pending_approval')
      .order('name', { ascending: true });

    if (profile?.company_id && profile.role !== 'superadmin') {
      query = query.eq('company_id', profile.company_id);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching pending partners:', error);
      break;
    }

    if (data && data.length > 0) {
      allData = [...allData, ...data];
      if (data.length < pageSize) {
        keepFetching = false;
      } else {
        page++;
      }
    } else {
      keepFetching = false;
    }
  }

  return allData;
};


export const savePartner = async (partnerData) => {
  const isExisting = !!partnerData.id;
  const payload = { ...partnerData };
  delete payload.createdAt;
  delete payload.updatedAt;
  delete payload.created_at;
  delete payload.updated_at;
  delete payload.contacts;

  // Remove generated/computed columns (e.g. norm_name) that PostgreSQL prohibits updating
  Object.keys(payload).forEach(key => {
    if (key.startsWith('norm_')) {
      delete payload[key];
    }
  });

  // Fix empty strings for Supabase
  if (payload.customerCredit === '') payload.customerCredit = null;
  if (payload.supplierCredit === '') payload.supplierCredit = null;
  if (payload.customerCreditTime === '') payload.customerCreditTime = null;
  if (payload.supplierCreditTime === '') payload.supplierCreditTime = null;

  if (isExisting) {
    const { data, error } = await supabase.from('partners').update(payload).eq('id', payload.id).select();
    if (error) {
      console.error(error);
      throw error;
    }
    return data[0];
  } else {
    delete payload.id; // Allow Supabase to auto-generate UUID
    const { data, error } = await supabase.from('partners').insert([payload]).select();
    if (error) {
      console.error(error);
      throw error;
    }
    return data[0];
  }
};

export const deletePartner = async (id) => {
  const { error } = await supabase.from('partners').delete().eq('id', id);
  if (error) console.error('Error deleting partner:', error);
  // Contacts cascade delete based on Supabase schema definition
};

export const getContacts = async (profile = null) => {
  let allData = [];
  let page = 0;
  const pageSize = 1000;
  let keepFetching = true;

  while (keepFetching) {
    let query = supabase
      .from('contacts')
      .select('*')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    // Isolation for non-superadmins
    if (profile?.company_id && profile.role !== 'superadmin') {
      query = query.eq('company_id', profile.company_id);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching contacts:', error);
      break;
    }

    if (data && data.length > 0) {
      allData = [...allData, ...data];
      if (data.length < pageSize) {
        keepFetching = false;
      } else {
        page++;
      }
    } else {
      keepFetching = false;
    }
  }

  return allData;
};

export const getContactsByPartner = async (partnerId) => {
  const { data, error } = await supabase.from('contacts').select('*').eq('partnerId', partnerId);
  if (error) console.error('Error fetching contacts by partner:', error);
  return data || [];
};

export const saveContact = async (contactData) => {
  const isExisting = !!contactData.id;
  const payload = { ...contactData };
  delete payload.createdAt;
  delete payload.updatedAt;
  delete payload.created_at;
  delete payload.updated_at;
  delete payload.isAiResearching;
  delete payload.aiPreview;
  delete payload.isCleaning;
  delete payload.isExtracting;
  delete payload.customCategory;
  delete payload.partners;
  delete payload.partner;

  // Validate company_id if present
  if (payload.company_id) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(payload.company_id)) {
      delete payload.company_id;
    }
  }

  if (isExisting) {
    const { data, error } = await supabase.from('contacts').update(payload).eq('id', payload.id).select();
    if (error) throw error;
    return data[0];
  } else {
    delete payload.id; // Allow Supabase to auto-generate UUID
    const { data, error } = await supabase.from('contacts').insert([payload]).select();
    if (error) throw error;
    return data[0];
  }
};

export const deleteContact = async (id) => {
  const { error } = await supabase.from('contacts').delete().eq('id', id);
  if (error) console.error('Error deleting contact:', error);
};

// --- Categories ---
export const getCategories = async () => {
  const { data, error } = await supabase.from('categories').select('*').order('name');
  if (error) console.error('Error fetching categories:', error);
  return data || [];
};

export const saveCategory = async (payload) => {
  const isExisting = !!payload.id;
  const dataToSave = { ...payload };
  delete dataToSave.created_at;

  if (isExisting) {
    const { data, error } = await supabase.from('categories').update(dataToSave).eq('id', payload.id).select();
    if (error) throw error;
    return data[0];
  } else {
    delete dataToSave.id;
    const { data, error } = await supabase.from('categories').insert([dataToSave]).select();
    if (error) throw error;
    return data[0];
  }
};

export const deleteCategory = async (id) => {
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) console.error('Error deleting category:', error);
};

export const purgeCategoryGlobally = async (categoryName) => {
  const { data: partners, error: fetchError } = await supabase.from('partners').select('id, types');
  if (fetchError) throw fetchError;

  const updates = partners
    .filter(p => (p.types || []).includes(categoryName))
    .map(p => ({
      id: p.id,
      types: p.types.filter(t => t !== categoryName)
    }));

  if (updates.length > 0) {
    for (const update of updates) {
      await supabase.from('partners').update({ types: update.types }).eq('id', update.id);
    }
  }
};

// --- Brands ---
export const getBrands = async () => {
  const { data, error } = await supabase.from('brands').select('*').order('name');
  if (error) console.error('Error fetching brands:', error);
  return data || [];
};

export const saveBrand = async (payload) => {
  const isExisting = !!payload.id;
  const dataToSave = { ...payload };
  delete dataToSave.created_at;

  if (isExisting) {
    const { data, error } = await supabase.from('brands').update(dataToSave).eq('id', payload.id).select();
    if (error) throw error;
    return data[0];
  } else {
    delete dataToSave.id;
    const { data, error } = await supabase.from('brands').insert([dataToSave]).select();
    if (error) throw error;
    return data[0];
  }
};

export const deleteBrand = async (id) => {
  const { error } = await supabase.from('brands').delete().eq('id', id);
  if (error) console.error('Error deleting brand:', error);
};

// --- Document Settings ---
export const getDocumentSettings = async (companyId = null) => {
  let query = supabase.from('document_settings').select('*');

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { data, error } = await query.limit(1).maybeSingle();
  if (error) console.error('Error fetching settings:', error);
  return data || null;
};

export const saveDocumentSettings = async (payload) => {
  const isExisting = !!payload.id;
  const dataToSave = { ...payload };
  delete dataToSave.created_at;
  delete dataToSave.updated_at;

  if (isExisting) {
    const { data, error } = await supabase.from('document_settings').update(dataToSave).eq('id', payload.id).select();
    if (error) throw error;
    const saved = data[0];
    try {
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('documentSettingsUpdated', { detail: { companyId: saved.company_id, settings: saved } }));
      }
    } catch (e) {
      console.warn('Failed to dispatch documentSettingsUpdated event', e);
    }
    return saved;
  } else {
    delete dataToSave.id;
    const { data, error } = await supabase.from('document_settings').insert([dataToSave]).select();
    if (error) throw error;
    const saved = data[0];
    try {
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('documentSettingsUpdated', { detail: { companyId: saved.company_id, settings: saved } }));
      }
    } catch (e) {
      console.warn('Failed to dispatch documentSettingsUpdated event', e);
    }
    return saved;
  }
};

// --- Vessels ---
export const getVessels = async () => {
  const { data, error } = await supabase.from('vessels').select('*').order('vessel_name');
  if (error) console.error('Error fetching vessels:', error);
  return data || [];
};

export const saveVessel = async (vesselData) => {
  const isExisting = !!vesselData.id;
  if (isExisting) {
    const { data, error } = await supabase.from('vessels').update(vesselData).eq('id', vesselData.id).select();
    if (error) throw error;
    return data[0];
  } else {
    const { data, error } = await supabase.from('vessels').insert([vesselData]).select();
    if (error) throw error;
    return data[0];
  }
};

// --- Work Locations ---
export const getWorkLocations = async () => {
  const { data, error } = await supabase.from('work_locations').select('*').order('location_name');
  if (error) console.error('Error fetching work locations:', error);
  return data || [];
};

export const saveWorkLocation = async (locationData) => {
  const isExisting = !!locationData.id;
  if (isExisting) {
    const { data, error } = await supabase.from('work_locations').update(locationData).eq('id', locationData.id).select();
    if (error) throw error;
    return data[0];
  } else {
    const { data, error } = await supabase.from('work_locations').insert([locationData]).select();
    if (error) throw error;
    return data[0];
  }
};

// --- Storage / File Uploads ---
export const uploadFile = async (bucket, folderPath, file, options = {}) => {
  let fileToUpload = file;

  // Resize if it's an image and resize options are provided
  if (file.type.startsWith('image/') && (options.maxWidth || options.maxHeight)) {
    try {
      fileToUpload = await resizeImage(file, options.maxWidth || 1024, options.maxHeight || 1024);
    } catch (e) {
      console.warn('Image resize failed, uploading original:', e);
    }
  }

  const fileExt = file.name.split('.').pop();
  const fileName = `${Math.random()}.${fileExt}`;
  const filePath = `${folderPath}/${fileName}`;

  const { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, fileToUpload);
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return data.publicUrl;
};

/**
 * Resizes an image file to fit within maxWidth/maxHeight.
 * Returns a Blob.
 */
export const resizeImage = (file, maxWidth, maxHeight) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          if (blob) {
            // Keep the original filename but as a Blob
            const resizedFile = new File([blob], file.name, {
              type: file.type,
              lastModified: Date.now(),
            });
            resolve(resizedFile);
          } else {
            reject(new Error('Canvas to Blob failed'));
          }
        }, file.type, 0.8); // 0.8 quality for JPEG
      };
      img.onerror = (e) => reject(e);
    };
    reader.onerror = (e) => reject(e);
  });
};

// --- Job Major Categories ---
export const getJobMajorCategories = async (companyId = null) => {
  let query = supabase.from('job_major_categories').select('*').order('name');
  if (companyId) {
    query = query.eq('company_id', companyId);
  }
  const { data, error } = await query;
  if (error) {
    if (error.code === 'PGRST205' || error.message?.includes('not found') || error.details?.includes('not found')) {
      return null; // Fallback indicator
    }
    console.error('Error fetching job major categories:', error);
    throw error;
  }
  return data || [];
};

export const saveJobMajorCategory = async (payload) => {
  const isExisting = !!payload.id;
  if (isExisting) {
    const { data, error } = await supabase.from('job_major_categories').update(payload).eq('id', payload.id).select();
    if (error) throw error;
    return data[0];
  } else {
    const { data, error } = await supabase.from('job_major_categories').insert([payload]).select();
    if (error) throw error;
    return data[0];
  }
};

export const deleteJobMajorCategory = async (id) => {
  const { error } = await supabase.from('job_major_categories').delete().eq('id', id);
  if (error) {
    console.error('Error deleting job major category:', error);
    throw error;
  }
};


