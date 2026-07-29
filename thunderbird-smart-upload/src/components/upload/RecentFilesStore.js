/**
 * Helper store using localStorage to remember the last 100 uploads,
 * pinned files, favorite folders, and last opened folders by document type.
 */

const RECENT_UPLOADS_KEY = 'celron_recent_uploads';
const FAVORITE_FOLDERS_KEY = 'celron_favorite_folders';
const LAST_OPENED_FOLDERS_KEY = 'celron_last_opened_folders';

export const RecentFilesStore = {
    getUploads: (documentType = null) => {
        try {
            const raw = localStorage.getItem(RECENT_UPLOADS_KEY);
            let uploads = raw ? JSON.parse(raw) : [];
            uploads = uploads.filter(u => u && u.name);

            if (documentType) {
                return uploads.filter(u => u.documentType === documentType || u.documentType === 'thunderbird');
            }
            return uploads;
        } catch (e) {
            console.error('Failed to get uploads from store:', e);
            return [];
        }
    },

    saveUpload: (fileRecord) => {
        try {
            const uploads = RecentFilesStore.getUploads();
            
            const newRecord = {
                id: fileRecord.id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                name: fileRecord.name,
                size: fileRecord.size || 0,
                documentType: fileRecord.documentType || 'thunderbird',
                uploadDate: new Date().toISOString(),
                company: fileRecord.company || '',
                category: fileRecord.category || '',
                path: fileRecord.path || 'Local Computer',
                pinned: !!fileRecord.pinned,
                hash: fileRecord.hash || '',
                lastOpened: new Date().toISOString(),
                url: fileRecord.url || ''
            };

            const filtered = uploads.filter(u => 
                u.name !== newRecord.name && 
                (!newRecord.hash || u.hash !== newRecord.hash)
            );

            const updated = [newRecord, ...filtered].slice(0, 100);
            localStorage.setItem(RECENT_UPLOADS_KEY, JSON.stringify(updated));
            return updated;
        } catch (e) {
            console.error('Failed to save upload to store:', e);
            return [];
        }
    },

    togglePin: (id) => {
        try {
            const uploads = RecentFilesStore.getUploads();
            const updated = uploads.map(u => u.id === id ? { ...u, pinned: !u.pinned } : u);
            localStorage.setItem(RECENT_UPLOADS_KEY, JSON.stringify(updated));
            return updated;
        } catch (e) {
            console.error('Failed to toggle pin:', e);
            return [];
        }
    },

    getFavoriteFolders: () => {
        try {
            const raw = localStorage.getItem(FAVORITE_FOLDERS_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    },

    toggleFavoriteFolder: (folder) => {
        try {
            const favorites = RecentFilesStore.getFavoriteFolders();
            const exists = favorites.some(f => f.id === folder.id);
            const updated = exists ? favorites.filter(f => f.id !== folder.id) : [...favorites, folder];
            localStorage.setItem(FAVORITE_FOLDERS_KEY, JSON.stringify(updated));
            return updated;
        } catch (e) {
            return [];
        }
    },

    getLastOpenedFolder: () => {
        try {
            return localStorage.getItem(LAST_OPENED_FOLDERS_KEY) || '';
        } catch (e) {
            return '';
        }
    },

    setLastOpenedFolder: (folderName) => {
        try {
            localStorage.setItem(LAST_OPENED_FOLDERS_KEY, folderName);
        } catch (e) {}
    }
};
