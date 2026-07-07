/**
 * Helper to calculate file SHA-256 hashes in the browser and check for duplicate uploads.
 */
import { RecentFilesStore } from './RecentFilesStore';

export const DuplicateChecker = {
    /**
     * Compute SHA-256 hash of a Browser File object.
     * @param {File} file
     * @returns {Promise<string>} SHA-256 hash string
     */
    calculateHash: async (file) => {
        try {
            if (!file) return '';
            const arrayBuffer = await file.arrayBuffer();
            const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            return hashHex;
        } catch (e) {
            console.error('Failed to calculate file hash:', e);
            return '';
        }
    },

    /**
     * Check if a file matches a previously uploaded file in the local history.
     * @param {string} hash
     * @param {string} filename
     * @param {string} documentType
     * @returns {Object|null} duplicate record if found
     */
    checkDuplicate: (hash, filename, documentType = null) => {
        try {
            const uploads = RecentFilesStore.getUploads(documentType);
            
            // 1. Check by SHA-256 hash (primary and highly reliable)
            if (hash) {
                const matchByHash = uploads.find(u => u.hash === hash);
                if (matchByHash) return matchByHash;
            }

            // 2. Fallback check by exact filename match
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
