import { useState, useCallback } from 'react';
import { getPartners, getContactsByPartner, saveContact, savePartner, deleteContact, deletePartner } from '../lib/store';
import { updateEnquiry } from '../lib/workflowService';

export function useSupplierActions(companyId, enquiryId, initialEnquiry) {
    const [suppliers, setSuppliers] = useState([]);
    const [selectedSuppliers, setSelectedSuppliers] = useState([]);
    const [supplierContacts, setSupplierContacts] = useState({});
    const [recipientOverrides, setRecipientOverrides] = useState({});
    const [isFloating, setIsFloating] = useState(false);
    const [isSavingContact, setIsSavingContact] = useState(false);
    const [supplierSearch, setSupplierSearch] = useState('');

    const fetchSuppliers = useCallback(async () => {
        try {
            const suppliersData = await getPartners();
            if (suppliersData) {
                const supps = suppliersData.filter(p => Array.isArray(p.types) && p.types.includes('Supplier'));
                setSuppliers(supps);
            }
        } catch (err) {
            console.error("Failed to load suppliers:", err);
        }
    }, []);

    const handleToggleSupplier = async (supplier) => {
        if (selectedSuppliers.some(s => s.id === supplier.id)) {
            setSelectedSuppliers(selectedSuppliers.filter(s => s.id !== supplier.id));
            const newOverrides = { ...recipientOverrides };
            delete newOverrides[supplier.id];
            setRecipientOverrides(newOverrides);
        } else {
            setSelectedSuppliers([...selectedSuppliers, supplier]);
            
            let contacts = [];
            if (!supplierContacts[supplier.id]) {
                try {
                    contacts = await getContactsByPartner(supplier.id);
                    setSupplierContacts(prev => ({ ...prev, [supplier.id]: contacts }));
                } catch (err) {
                    console.error("Failed to fetch contacts for", supplier.name, err);
                }
            } else {
                contacts = supplierContacts[supplier.id];
            }

            const primaryContact = contacts[0] || null;
            setRecipientOverrides(prev => ({
                ...prev,
                [supplier.id]: {
                    address: supplier.address || '',
                    phone: supplier.phone || '',
                    email: supplier.email1 || '',
                    attn_name: primaryContact?.name || '',
                    attn_phone: primaryContact?.handphone || primaryContact?.phone || '',
                    attn_email: primaryContact?.email || ''
                }
            }));
        }
    };

    const handleUpdateRecipientOverride = (supplierId, updates) => {
        setRecipientOverrides(prev => ({
            ...prev,
            [supplierId]: {
                ...prev[supplierId],
                ...updates
            }
        }));
    };

    const handleUpdatePartner = async (partnerId, data) => {
        try {
            const updated = await savePartner({ ...data, id: partnerId });
            setSuppliers(prev => prev.map(s => s.id === partnerId ? { ...s, ...updated } : s));
            setSelectedSuppliers(prev => prev.map(s => s.id === partnerId ? { ...s, ...updated } : s));
            return updated;
        } catch (err) {
            console.error("Failed to update partner:", err);
            throw err;
        }
    };

    const handleCreatePartner = async (data) => {
        try {
            const payload = {
                ...data,
                company_id: companyId,
                types: ['Supplier']
            };
            const created = await savePartner(payload);
            setSuppliers(prev => [created, ...prev]);
            return created;
        } catch (err) {
            console.error("Failed to create partner:", err);
            throw err;
        }
    };

    const handleDeletePartner = async (partnerId) => {
        try {
            await deletePartner(partnerId);
            setSuppliers(prev => prev.filter(s => s.id !== partnerId));
            setSelectedSuppliers(prev => prev.filter(s => s.id !== partnerId));
        } catch (err) {
            console.error("Failed to delete partner:", err);
            throw err;
        }
    };

    const handleUpdateContact = async (contactId, data) => {
        try {
            const updated = await saveContact({ ...data, id: contactId });
            const partnerId = data.partnerId;
            if (partnerId) {
                const updatedContacts = await getContactsByPartner(partnerId);
                setSupplierContacts(prev => ({ ...prev, [partnerId]: updatedContacts }));
            }
            return updated;
        } catch (err) {
            console.error("Failed to update contact:", err);
            throw err;
        }
    };

    const handleDeleteContact = async (contactId, partnerId) => {
        try {
            await deleteContact(contactId);
            const updatedContacts = await getContactsByPartner(partnerId);
            setSupplierContacts(prev => ({ ...prev, [partnerId]: updatedContacts }));
        } catch (err) {
            console.error("Failed to delete contact:", err);
            throw err;
        }
    };

    const handleSaveNewContact = async (supplierId, contactData) => {
        setIsSavingContact(true);
        try {
            const data = {
                ...contactData,
                partnerId: supplierId,
                company_id: companyId
            };
            await saveContact(data);
            const updatedContacts = await getContactsByPartner(supplierId);
            setSupplierContacts(prev => ({ ...prev, [supplierId]: updatedContacts }));
        } catch (err) {
            console.error("Failed to save contact:", err);
            alert("Failed to save contact: " + err.message);
        } finally {
            setIsSavingContact(false);
        }
    };

    const handleFloatQuotation = async (selectedItems, enquiryData) => {
        if (selectedSuppliers.length === 0) return alert("Select at least one supplier.");
        if (selectedItems.length === 0) return alert("Add at least one item from the catalog.");

        setIsFloating(true);
        try {
            const emails = selectedSuppliers.map(s => {
                const override = recipientOverrides[s.id];
                return override?.email || s.email1;
            }).filter(e => e).join(',');
            
            const subject = encodeURIComponent(`Request for Quotation: ${enquiryData?.enquiry_no} - CELRON ENTERPRISES`);

            let itemRows = selectedItems.map((item, idx) => {
                const specPrefix = item.specification ? `\n   - Spec: ${item.specification.substring(0, 100)}${item.specification.length > 100 ? '...' : ''}` : '';
                return `${idx + 1}. ${item.name} (${item.qty} ${item.unit || 'pcs'})${specPrefix}`;
            }).join('\n\n');

            const greeting = selectedSuppliers.length === 1 
                ? `Dear ${recipientOverrides[selectedSuppliers[0].id]?.attn_name || 'Supplier'},\n\n`
                : `Dear Supplier,\n\n`;

            const body = encodeURIComponent(`${greeting}We are pleased to invite you to quote for the following items:\n\n${itemRows}\n\n${enquiryData.gdrive_file_link ? `You can view photos and additional attachments here: ${enquiryData.gdrive_file_link}\n\n` : ''}Please revert with your best price and lead time at your earliest convenience.\n\nThank you,\nN.R.KUMAR HP:+65 97685891\nCELRON ENTERPRISES PTE LTD\n10, Jln, Besar,"Sim Lim Tower", #03-05, Singapore 208787\nEmail: sales@celron.net | Tel: +6597685891/81962270 Web : https://www.celron.net    / https://celron.shop`);

            const defaultBcc = 'celron.simlim0305@gmail.com,accounts@celron.net';
            window.open(`mailto:?bcc=${emails}${emails ? ',' : ''}${defaultBcc}&subject=${subject}&body=${body}`, '_blank');

            // Record the floating action in the database
            const supplierIds = selectedSuppliers.map(s => s.id);
            await import('../lib/workflowService').then(m => m.trackFloatedRFQ(enquiryId, supplierIds, companyId));

            await updateEnquiry(enquiryId, { status: 'RFQ Floated' });
            return true;
        } catch (error) {
            console.error("Floating failed:", error);
            return false;
        } finally {
            setIsFloating(false);
        }
    };

    const trackRFQFloat = async (enquiryIdToUpdate, supplierIds, compId) => {
        try {
            await import('../lib/workflowService').then(m => m.trackFloatedRFQ(enquiryIdToUpdate, supplierIds, compId));
            await updateEnquiry(enquiryIdToUpdate, { status: 'RFQ Floated' });
            return true;
        } catch (error) {
            console.error("Failed to track RFQ float:", error);
            return false;
        }
    };

    return {
        suppliers,
        selectedSuppliers,
        setSelectedSuppliers,
        supplierContacts,
        recipientOverrides,
        setRecipientOverrides,
        isFloating,
        isSavingContact,
        supplierSearch,
        setSupplierSearch,
        fetchSuppliers,
        handleToggleSupplier,
        handleUpdateRecipientOverride,
        handleSaveNewContact,
        handleUpdatePartner,
        handleUpdateContact,
        handleDeleteContact,
        handleCreatePartner,
        handleDeletePartner,
        handleFloatQuotation,
        trackRFQFloat
    };
}
