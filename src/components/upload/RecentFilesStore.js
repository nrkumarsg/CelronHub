/**
 * Helper store using localStorage to remember the last 100 uploads,
 * pinned files, favorite folders, and last opened folders by document type.
 */

const RECENT_UPLOADS_KEY = 'celron_recent_uploads';
const FAVORITE_FOLDERS_KEY = 'celron_favorite_folders';
const LAST_OPENED_FOLDERS_KEY = 'celron_last_opened_folders';

export const RecentFilesStore = {
    /**
     * Get all recent uploads, optionally filtered by document type.
     */
    getUploads: (documentType = null) => {
        try {
            const raw = localStorage.getItem(RECENT_UPLOADS_KEY);
            let uploads = raw ? JSON.parse(raw) : [];
            
            // Clean up any malformed records
            uploads = uploads.filter(u => u && u.name);

            if (documentType) {
                return uploads.filter(u => u.documentType === documentType);
            }
            return uploads;
        } catch (e) {
            console.error('Failed to get uploads from store:', e);
            return [];
        }
    },

    /**
     * Save a new upload record. Limits history to 100 entries.
     */
    saveUpload: (fileRecord) => {
        try {
            const uploads = RecentFilesStore.getUploads();
            
            const newRecord = {
                id: fileRecord.id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                name: fileRecord.name,
                size: fileRecord.size || 0,
                documentType: fileRecord.documentType || 'general',
                uploadDate: new Date().toISOString(),
                company: fileRecord.company || '',
                category: fileRecord.category || '',
                path: fileRecord.path || 'Local Computer',
                pinned: !!fileRecord.pinned,
                hash: fileRecord.hash || '',
                lastOpened: new Date().toISOString(),
                url: fileRecord.url || ''
            };

            // Remove existing duplicate (by name or hash) to move it to the top
            const filtered = uploads.filter(u => 
                u.name !== newRecord.name && 
                (!newRecord.hash || u.hash !== newRecord.hash)
            );

            const updated = [newRecord, ...filtered].slice(0, 100);
            localStorage.setItem(RECENT_UPLOADS_KEY, JSON.stringify(updated));
            return newRecord;
        } catch (e) {
            console.error('Failed to save upload in store:', e);
            return null;
        }
    },

    /**
     * Toggle pinned status of a recent upload.
     */
    togglePin: (id) => {
        try {
            const uploads = RecentFilesStore.getUploads();
            const updated = uploads.map(u => {
                if (u.id === id) {
                    return { ...u, pinned: !u.pinned };
                }
                return u;
            });
            localStorage.setItem(RECENT_UPLOADS_KEY, JSON.stringify(updated));
            return updated.find(u => u.id === id);
        } catch (e) {
            console.error('Failed to toggle pin in store:', e);
            return null;
        }
    },

    /**
     * Delete an upload from the history.
     */
    deleteUpload: (id) => {
        try {
            const uploads = RecentFilesStore.getUploads();
            const updated = uploads.filter(u => u.id !== id);
            localStorage.setItem(RECENT_UPLOADS_KEY, JSON.stringify(updated));
            return true;
        } catch (e) {
            console.error('Failed to delete upload from store:', e);
            return false;
        }
    },

    /**
     * Get the last opened directory path for a given document type.
     */
    getLastOpenedFolder: (documentType) => {
        try {
            const raw = localStorage.getItem(LAST_OPENED_FOLDERS_KEY);
            const mapping = raw ? JSON.parse(raw) : {};
            return mapping[documentType] || '';
        } catch (e) {
            console.error('Failed to get last opened folder:', e);
            return '';
        }
    },

    /**
     * Save the last opened directory path for a given document type.
     */
    setLastOpenedFolder: (documentType, folderPath) => {
        try {
            const raw = localStorage.getItem(LAST_OPENED_FOLDERS_KEY);
            const mapping = raw ? JSON.parse(raw) : {};
            mapping[documentType] = folderPath;
            localStorage.setItem(LAST_OPENED_FOLDERS_KEY, JSON.stringify(mapping));
        } catch (e) {
            console.error('Failed to set last opened folder:', e);
        }
    },

    /**
     * Get favorite folders/categories for a document type.
     */
    getFavoriteFolders: (documentType) => {
        try {
            const raw = localStorage.getItem(FAVORITE_FOLDERS_KEY);
            let favorites = raw ? JSON.parse(raw) : {};
            
            // Default seeding if empty
            if (!favorites[documentType]) {
                const defaults = {
                    manual: ['Marine Engine Manuals', 'Auxiliary Systems', 'Bridge Gear manuals', 'Deck Machinery'],
                    invoice: ['Invoices/2026/Q1', 'Supplier Invoices', 'Logistics & Freight'],
                    certificate: ['Calibration Reports', 'Class Certificates', 'Safety Declarations'],
                    drawing: ['General Arrangements', 'Electrical Schematic Diagrams', 'Piping Layouts']
                };
                favorites[documentType] = defaults[documentType] || ['General Files'];
                localStorage.setItem(FAVORITE_FOLDERS_KEY, JSON.stringify(favorites));
            }

            return favorites[documentType];
        } catch (e) {
            console.error('Failed to get favorite folders:', e);
            return [];
        }
    },

    /**
     * Add a folder path to favorites.
     */
    addFavoriteFolder: (documentType, folderPath) => {
        try {
            const raw = localStorage.getItem(FAVORITE_FOLDERS_KEY);
            const favorites = raw ? JSON.parse(raw) : {};
            if (!favorites[documentType]) {
                favorites[documentType] = [];
            }
            if (!favorites[documentType].includes(folderPath)) {
                favorites[documentType].push(folderPath);
                localStorage.setItem(FAVORITE_FOLDERS_KEY, JSON.stringify(favorites));
            }
            return favorites[documentType];
        } catch (e) {
            console.error('Failed to add favorite folder:', e);
            return [];
        }
    },

    /**
     * Remove a folder path from favorites.
     */
    removeFavoriteFolder: (documentType, folderPath) => {
        try {
            const raw = localStorage.getItem(FAVORITE_FOLDERS_KEY);
            const favorites = raw ? JSON.parse(raw) : {};
            if (favorites[documentType]) {
                favorites[documentType] = favorites[documentType].filter(f => f !== folderPath);
                localStorage.setItem(FAVORITE_FOLDERS_KEY, JSON.stringify(favorites));
            }
            return favorites[documentType] || [];
        } catch (e) {
            console.error('Failed to remove favorite folder:', e);
            return [];
        }
    },

    /**
     * Get dynamic downloads history from browser storage
     */
    getDownloadsHistory: () => {
        try {
            const raw = localStorage.getItem('celron_downloads_history');
            const items = raw ? JSON.parse(raw) : [];
            return Array.isArray(items) ? items : [];
        } catch (e) {
            console.error('Failed to get downloads history:', e);
            return [];
        }
    },

    /**
     * Save an item into the dynamic downloads history
     */
    saveDownloadItem: (item) => {
        try {
            const current = RecentFilesStore.getDownloadsHistory();
            const record = {
                id: item.id || `dl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                name: item.name,
                size: item.size || 0,
                type: item.type || 'application/pdf',
                date: item.date || new Date().toISOString(),
                category: item.category || 'Downloaded File',
                source: item.source || 'Local Downloads'
            };
            const filtered = current.filter(c => c.name !== record.name);
            const updated = [record, ...filtered].slice(0, 100);
            localStorage.setItem('celron_downloads_history', JSON.stringify(updated));
            return updated;
        } catch (e) {
            console.error('Failed to save download item:', e);
            return [];
        }
    },

    /**
     * Remove an item from the downloads history
     */
    removeDownloadItem: (id) => {
        try {
            const current = RecentFilesStore.getDownloadsHistory();
            const updated = current.filter(c => c.id !== id);
            localStorage.setItem('celron_downloads_history', JSON.stringify(updated));
            return updated;
        } catch (e) {
            console.error('Failed to remove download item:', e);
            return [];
        }
    },

    /**
     * Clear all downloads history
     */
    clearDownloadsHistory: () => {
        try {
            localStorage.removeItem('celron_downloads_history');
            return [];
        } catch (e) {
            console.error('Failed to clear downloads history:', e);
            return [];
        }
    }
};
