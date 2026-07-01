import { useState, useEffect, useCallback } from 'react';
import { getEnquiryById, updateEnquiry } from '../lib/workflowService';
import { getCatalogItems, createCatalogItem } from '../lib/catalogService';

export function useEnquiry(companyId, enquiryId) {
    const [enquiry, setEnquiry] = useState(null);
    const [catalog, setCatalog] = useState([]);
    const [selectedItems, setSelectedItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isSavingNewItem, setIsSavingNewItem] = useState(false);

    const fetchData = useCallback(async () => {
        if (!companyId || !enquiryId) return;
        
        if (enquiryId === 'new') {
            setEnquiry({
                enquiry_no: 'Draft',
                status: 'New Enquiry',
                enquiry_date: new Date().toISOString().split('T')[0],
                due_date: new Date(new Date().getTime() + 86400000).toISOString().split('T')[0],
                catalog_items: [],
                customer_id: '',
                contact_id: '',
                vessel_id: '',
                work_location_id: '',
                customer_ref: '',
                source_type: 'Email',
                description: '',
                gdrive_file_link: null
            });
            setSelectedItems([]);
            // Fetch catalog items for new enquiries
            getCatalogItems(1, 100, {}, '').then(res => {
                if (res.data) setCatalog(res.data);
            }).catch(err => {
                console.error('Error fetching catalog for new enquiry:', err);
            });
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const [enqRes, catRes] = await Promise.all([
                getEnquiryById(companyId, enquiryId),
                getCatalogItems(1, 100, {}, '')
            ]);

            if (enqRes.error) throw enqRes.error;
            
            if (enqRes.data) {
                setEnquiry(enqRes.data);
                if (enqRes.data.catalog_items) {
                    setSelectedItems(enqRes.data.catalog_items);
                }
            }
            if (catRes.data) {
                setCatalog(catRes.data);
            }
        } catch (err) {
            console.error('Error fetching enquiry data:', err);
            setError(err);
        } finally {
            setLoading(false);
        }
    }, [companyId, enquiryId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleAddItem = async (item, autoSaveToCatalog = false) => {
        if (selectedItems.some(i => (item.id && i.catalog_id === item.id) || (i.name && i.name.toLowerCase() === item.name.toLowerCase()))) {
            alert(`"${item.name || item.description}" is already in the list.`);
            return;
        }

        let finalItem = {
            id: Date.now().toString(),
            catalog_id: item.id || null,
            name: item.name || '',
            description: item.name || item.description || '',
            specification: item.specification || '',
            details: item.specification || '',
            qty: 1,
            quantity: 1,
            unit: item.unit || 'UNIT(S)',
            uom: item.unit || 'UNIT(S)',
            unit_price: item.selling_price || item.price || 0,
            amount: item.selling_price || item.price || 0,
            tax_rate: 9,
            tax_enabled: true,
            is_section: item.is_section || false,
            is_note: item.is_note || false
        };

        if (autoSaveToCatalog && !item.id && !item.is_section && !item.is_note) {
            setIsSavingNewItem(true);
            try {
                const { data, error } = await createCatalogItem({
                    name: finalItem.name,
                    specification: finalItem.specification || '',
                    type: 'Supply',
                    company_id: companyId
                });
                if (!error && data) {
                    finalItem.catalog_id = data.id;
                    // Refresh catalog
                    const catRes = await getCatalogItems(1, 100, {}, '');
                    if (catRes.data) setCatalog(catRes.data);
                }
            } catch (err) {
                console.error("Auto-catalog save failed:", err);
            } finally {
                setIsSavingNewItem(false);
            }
        }

        const updated = [...selectedItems, finalItem];
        setSelectedItems(updated);
        if (enquiryId !== 'new') {
            await updateEnquiry(enquiryId, { catalog_items: updated });
        }
        setEnquiry(prev => ({ ...prev, catalog_items: updated }));
    };

    const handleUpdateItem = async (idx, updates) => {
        const updated = [...selectedItems];
        const item = { ...updated[idx], ...updates };
        
        // Recalculate amount if quantity or unit_price changed
        if (updates.quantity !== undefined || updates.unit_price !== undefined || updates.qty !== undefined) {
            const q = parseFloat(updates.quantity !== undefined ? updates.quantity : (updates.qty !== undefined ? updates.qty : item.quantity)) || 0;
            const p = parseFloat(item.unit_price) || 0;
            item.amount = q * p;
            item.quantity = q;
            item.qty = q;
        }

        updated[idx] = item;
        setSelectedItems(updated);
        if (enquiryId !== 'new') {
            await updateEnquiry(enquiryId, { catalog_items: updated });
        }
        setEnquiry(prev => ({ ...prev, catalog_items: updated }));
    };

    const handleUpdateHeader = async (updates) => {
        if (!enquiry) return;
        
        // Sanitize updates to avoid schema errors for V1 table
        const sanitizedUpdates = { ...updates };
        const invalidColumns = ['vessel_id', 'work_location_id', 'vessel_name', 'location_name'];
        invalidColumns.forEach(p => delete sanitizedUpdates[p]);

        const updated = { ...enquiry, ...updates };
        setEnquiry(updated);

        if (enquiryId !== 'new' && Object.keys(sanitizedUpdates).length > 0) {
            const { error } = await updateEnquiry(enquiryId, sanitizedUpdates);
            if (error) {
                console.error("Failed to update enquiry header:", error);
                alert("Failed to save changes: " + error.message);
            }
        }
    };

    const handleRemoveItem = async (idx) => {
        const updated = selectedItems.filter((_, i) => i !== idx);
        setSelectedItems(updated);
        if (enquiryId !== 'new') {
            await updateEnquiry(enquiryId, { catalog_items: updated });
        }
        setEnquiry(prev => ({ ...prev, catalog_items: updated }));
    };

    return {
        enquiry,
        setEnquiry,
        catalog,
        selectedItems,
        setSelectedItems,
        loading,
        error,
        isSavingNewItem,
        handleAddItem,
        handleUpdateItem,
        handleRemoveItem,
        handleUpdateHeader,
        setCatalog,
        refresh: fetchData
    };
}
