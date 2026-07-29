import { RecentFilesStore } from './RecentFilesStore';

export const DuplicateChecker = {
    calculateHash: async (file) => {
        try {
            if (!file) return '';
            const arrayBuffer = await file.arrayBuffer();
            const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (e) {
            console.error('Failed to calculate file hash:', e);
            return '';
        }
    },

    checkDuplicate: (hash, filename, documentType = null) => {
        try {
            const uploads = RecentFilesStore.getUploads(documentType);
            
            if (hash) {
                const matchByHash = uploads.find(u => u.hash === hash);
                if (matchByHash) return matchByHash;
            }

            if (filename) {
                const matchByName = uploads.find(u => u.name === filename);
                if (matchByName) return matchByName;
            }

            return null;
        } catch (e) {
            console.error('Failed duplicate check:', e);
            return null;
        }
    }
};
