/**
 * Service to handle Google Drive specific operations
 */

/**
 * Upload a file to Google Drive.
 * @param {string} accessToken - Google OAuth token
 * @param {File} file - Browser file object
 * @param {Object} metadata - Metadata for the file
 * @returns {Promise<Object>} - The created file object from G Drive
 */
export const uploadFileToDrive = async (accessToken, file, metadata = {}, onProgress = null) => {
    const progressCallback = onProgress || metadata.onProgress;
    // For large files (> 5MB), use resumable upload
    if (file.size > 5 * 1024 * 1024) {
        return uploadFileResumable(accessToken, file, metadata, progressCallback);
    }

    const boundary = '-------314159265358979323846';
    const delimiter = "\r\n--" + boundary + "\r\n";
    const close_delim = "\r\n--" + boundary + "--";

    const driveMetadata = {
        name: metadata.title || file.name,
        mimeType: file.type || 'application/octet-stream',
        ...metadata.folderId ? { parents: [metadata.folderId] } : {}
    };

    // Use Blob to avoid memory issues with base64/btoa
    const metadataBlob = new Blob([JSON.stringify(driveMetadata)], { type: 'application/json' });
    const multipartBody = new FormData();
    multipartBody.append('metadata', metadataBlob);
    multipartBody.append('file', file);

    // Note: Google's 'multipart' upload expects a specific format, 
    // but the most efficient way with modern fetch is just sending the file if no metadata is needed,
    // OR using the Resumable upload for better control.
    // Let's implement Resumable as the primary for anything not tiny.
    return uploadFileResumable(accessToken, file, metadata, progressCallback);
};

/**
 * Resumable upload for large files.
 * Provides better reliability and bypasses base64 memory limits.
 */
export const uploadFileResumable = async (accessToken, file, metadata = {}, onProgress = null) => {
    const progressCallback = onProgress || metadata.onProgress;
    const driveMetadata = {
        name: metadata.title || file.name,
        mimeType: file.type || 'application/octet-stream',
        ...metadata.folderId ? { parents: [metadata.folderId] } : {}
    };

    // 1. Initial request to get upload URL
    const initResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + accessToken,
            'Content-Type': 'application/json; charset=UTF-8',
            'X-Upload-Content-Type': file.type || 'application/octet-stream',
            'X-Upload-Content-Length': file.size.toString()
        },
        body: JSON.stringify(driveMetadata),
        signal: metadata.signal
    });

    if (!initResponse.ok) {
        const err = await initResponse.json();
        throw new Error(err.error?.message || 'Failed to initiate resumable upload');
    }

    const uploadUrl = initResponse.headers.get('Location');

    // 2. Perform the actual upload using XMLHttpRequest for progress tracking
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

        let onAbort = null;
        if (metadata.signal) {
            onAbort = () => {
                xhr.abort();
                reject(new DOMException('Aborted', 'AbortError'));
            };
            metadata.signal.addEventListener('abort', onAbort);
        }

        const cleanupSignal = () => {
            if (metadata.signal && onAbort) {
                metadata.signal.removeEventListener('abort', onAbort);
            }
        };

        if (progressCallback) {
            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                    const percentComplete = Math.round((e.loaded / e.total) * 100);
                    progressCallback(percentComplete);
                }
            };
        }

        xhr.onload = () => {
            cleanupSignal();
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(JSON.parse(xhr.responseText));
            } else {
                try {
                    const err = JSON.parse(xhr.responseText);
                    reject(new Error(err.error?.message || 'Upload failed'));
                } catch (e) {
                    reject(new Error('Upload failed with status ' + xhr.status));
                }
            }
        };

        xhr.onerror = () => {
            cleanupSignal();
            reject(new Error('Network error during upload'));
        };
        xhr.send(file);
    });
};

/**
 * Makes a file publicly viewable via link (anyone with link can view).
 * This is necessary for thumbnails and direct image display.
 */
export const makeFilePublic = async (accessToken, fileId) => {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + accessToken,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            role: 'reader',
            type: 'anyone'
        })
    });

    if (!response.ok) {
        console.warn('Failed to make file public:', await response.text());
    }
    return response.ok;
};

/**
 * Returns a direct viewable image URL from a Google Drive file ID.
 */
export const getDirectImageUrl = (fileIdOrUrl) => {
    if (!fileIdOrUrl) return '';
    // Extract ID from webViewLink if needed
    const match = fileIdOrUrl.match(/\/d\/([^/]+)/);
    const fileId = match ? match[1] : fileIdOrUrl;
    return `https://lh3.googleusercontent.com/d/${fileId}=w400`;
};

/**
 * Finds or creates a specific folder in Google Drive.
 * Now supports optional parentId to avoid root pollution.
 */
export const getOrCreateFolder = async (accessToken, folderName, parentId = null) => {
    // Search for folder
    let query = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    if (parentId) {
        query += ` and '${parentId}' in parents`;
    }

    const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}`, {
        headers: { 'Authorization': 'Bearer ' + accessToken }
    });

    if (!searchRes.ok) {
        const err = await searchRes.json().catch(() => ({}));
        throw new Error(err.error?.message || `Failed to search folder: ${folderName}`);
    }

    const { files } = await searchRes.json();

    if (files && files.length > 0) {
        return files[0].id;
    }

    // Create if not exists
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + accessToken,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
            ...(parentId ? { parents: [parentId] } : {})
        })
    });

    if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}));
        throw new Error(err.error?.message || `Failed to create folder: ${folderName}`);
    }

    const folder = await createRes.json();
    return folder.id;
};

/**
 * Creates a nested folder structure.
 * Path like 'Jobs/CEL2403-5001/Documents'
 */
export const createFolderStructure = async (accessToken, path, parentId = null) => {
    const segments = path.split('/').filter(s => s.trim() !== '');
    let currentParentId = parentId;

    for (const segment of segments) {
        // Search for segment under currentParentId
        let query = `name='${segment}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        if (currentParentId) {
            query += ` and '${currentParentId}' in parents`;
        }

        const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}`, {
            headers: { 'Authorization': 'Bearer ' + accessToken }
        });

        if (!searchRes.ok) {
            const err = await searchRes.json();
            throw new Error(err.error?.message || `Failed to search for folder: ${segment}`);
        }

        const { files } = await searchRes.json();

        if (files && files.length > 0) {
            currentParentId = files[0].id;
        } else {
            // Create
            const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + accessToken,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: segment,
                    mimeType: 'application/vnd.google-apps.folder',
                    ...(currentParentId ? { parents: [currentParentId] } : {})
                })
            });

            if (!createRes.ok) {
                const err = await createRes.json();
                throw new Error(err.error?.message || `Failed to create folder: ${segment}`);
            }

            const folder = await createRes.json();
            currentParentId = folder.id;
        }
    }
    return currentParentId;
};

/**
 * Standardized Job project structure provisioning (Option B - Flat Documents, subfolder for Photos).
 * Path: [CELRON]/01. TIME_BASED/JOBS/[Year]/[Project Name]
 */
export const provisionFullProjectStructure = async (accessToken, celronRootId, year, projectFolderName, forceCreate = false) => {
    const customJobsRootId = '1GPr3g5mq6_TotBzM8gDz_atJPR7TgbB-';
    
    // Check if the root matches the custom Jobs root folder ID (directly or as part of a link)
    const isCustomJobsRoot = celronRootId === customJobsRootId || 
                             (celronRootId && celronRootId.includes(customJobsRootId));
    
    let jobsRootId;
    if (isCustomJobsRoot) {
        jobsRootId = customJobsRootId;
    } else {
        // 1. Navigate to 01. TIME_BASED
        const timeBasedId = await getOrCreateFolder(accessToken, '01. TIME_BASED', celronRootId);
        
        // 2. Navigate to Year
        const yearId = await getOrCreateFolder(accessToken, year, timeBasedId);
 
        // 3. Navigate to JOBS
        jobsRootId = await getOrCreateFolder(accessToken, 'JOBS', yearId);
 
        // 3b. Also ensure AccountPayable folder exists under yearId
        await getOrCreateFolder(accessToken, 'AccountPayable', yearId);
    }
 
    // 4. Create/Find the specific Project folder (using prefix-contains query to avoid duplication)
    const jobNoPrefix = projectFolderName.split(' ')[0]; // E.g., 'CEL-2605-6063'
    let projectFolderId;
 
    if (!forceCreate) {
        try {
            let query = `name contains '${jobNoPrefix}' and mimeType='application/vnd.google-apps.folder' and trashed=false and '${jobsRootId}' in parents`;
            const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}`, {
                headers: { 'Authorization': 'Bearer ' + accessToken }
            });
            if (searchRes.ok) {
                const { files } = await searchRes.json();
                if (files && files.length > 0) {
                    projectFolderId = files[0].id;
                }
            }
        } catch (e) {
            console.warn("Prefix search failed, falling back to exact create/find:", e);
        }
    }
 
    if (!projectFolderId) {
        if (forceCreate) {
            const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + accessToken,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: projectFolderName,
                    mimeType: 'application/vnd.google-apps.folder',
                    ...(jobsRootId ? { parents: [jobsRootId] } : {})
                })
            });
            if (!createRes.ok) {
                const err = await createRes.json().catch(() => ({}));
                throw new Error(err.error?.message || `Failed to create folder: ${projectFolderName}`);
            }
            const folder = await createRes.json();
            projectFolderId = folder.id;
        } else {
            projectFolderId = await getOrCreateFolder(accessToken, projectFolderName, jobsRootId);
        }
    }
 
    // 5. Provision sub-folders inside the Job folder
    await getOrCreateFolder(accessToken, 'Photos & Gallery', projectFolderId);
    await getOrCreateFolder(accessToken, 'Worksuite', projectFolderId);
    await getOrCreateFolder(accessToken, 'SupplierBills&Expenses', projectFolderId);
    await getOrCreateFolder(accessToken, 'SupportDocs', projectFolderId);
 
    return projectFolderId;
};

/**
 * Standardized Enquiry folder structure provisioning.
 * Path: [CELRONHUB]/01. TIME_BASED/ENQUIRIES/[Year]/[ENQ-CEL-YYMM-XXXX - CustomerName]
 *   Subfolders: Enquiry_Detail | Quote2Cust | Order2Supplier | Photos & Docs
 */
export const provisionEnquiryFolderStructure = async (accessToken, celronRootId, year, enqFolderName, forceCreate = false) => {
    // Hardcoded Enquiries Folder ID
    const enquiriesRootId = '1Hr9-SFbjS-1pPIYu1kY57cRdc-1PVRij';
    
    // Create/Find specific Enquiry folder (search by prefix/exact name inside enquiriesRootId)
    const enqNoPrefix = enqFolderName.split(' ')[0]; 
    let enqFolderId;

    if (!forceCreate) {
        try {
            const query = `name contains '${enqNoPrefix}' and mimeType='application/vnd.google-apps.folder' and trashed=false and '${enquiriesRootId}' in parents`;
            const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}`, {
                headers: { 'Authorization': 'Bearer ' + accessToken }
            });
            if (searchRes.ok) {
                const { files } = await searchRes.json();
                if (files && files.length > 0) {
                    enqFolderId = files[0].id;
                }
            }
        } catch (e) {
            console.warn('Enquiry prefix search failed, falling back:', e);
        }
    }

    if (!enqFolderId) {
        enqFolderId = await getOrCreateFolder(accessToken, enqFolderName, enquiriesRootId);
    }

    // Provision the 3 default subfolders inside the Enquiry folder
    const supplierEnquiryUploadsId = await getOrCreateFolder(accessToken, 'Supplier Enquiry uploads', enqFolderId);
    const photosMediaId = await getOrCreateFolder(accessToken, 'Photos & Media', enqFolderId);
    const quotationsReceivedId = await getOrCreateFolder(accessToken, 'Quotations received', enqFolderId);

    return {
        enqFolderId,
        supplierEnquiryUploadsId,
        photosMediaId,
        quotationsReceivedId,
        webViewLink: `https://drive.google.com/drive/folders/${enqFolderId}`
    };
};

/**
 * Lists contents of a specific folder.
 */
export const listFolderContent = async (accessToken, folderId, query = '') => {
    let q = `'${folderId}' in parents and trashed = false`;
    if (query) {
        q += ` and name contains '${query}'`;
    }

    const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id, name, mimeType, thumbnailLink, webViewLink, iconLink, size, createdTime)&orderBy=folder,name`, {
        headers: { 'Authorization': 'Bearer ' + accessToken }
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || 'Failed to list drive content');
    }

    const data = await response.json();
    return data.files || [];
};

/**
 * Deletes or trashes a file/folder.
 */
export const deleteFile = async (accessToken, fileId) => {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + accessToken }
    });

    if (!response.ok && response.status !== 204) {
        const err = await response.json();
        throw new Error(err.error?.message || 'Failed to delete file');
    }

    return true;
};

/**
 * Checks if a file exists on Google Drive and is not trashed.
 * @param {string} accessToken 
 * @param {string} fileId 
 * @returns {Promise<boolean>}
 */
export const checkFileExists = async (accessToken, fileIdOrUrl) => {
    if (!fileIdOrUrl) return false;
    
    // Extract ID from webViewLink if a URL was passed
    const match = fileIdOrUrl.match(/\/d\/([^/]+)/);
    const fileId = match ? match[1] : fileIdOrUrl;

    try {
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=trashed`, {
            headers: { 'Authorization': 'Bearer ' + accessToken }
        });
        if (!response.ok) return false;
        const data = await response.json();
        return !data.trashed;
    } catch (e) {
        console.error('Error checking file existence:', e);
        return false;
    }
};

/**
 * Fetches the webViewLink for a specific file.
 * @param {string} accessToken 
 * @param {string} fileId 
 * @returns {Promise<string|null>}
 */
export const getFileLink = async (accessToken, fileId) => {
    if (!fileId) return null;
    try {
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=webViewLink`, {
            headers: { 'Authorization': 'Bearer ' + accessToken }
        });
        if (!response.ok) return null;
        const data = await response.json();
        return data.webViewLink;
    } catch (e) {
        console.error('Error fetching file link:', e);
        return null;
    }
};

/**
 * Fetches the plain text content of a file from Google Drive.
 */
export const getFileContent = async (accessToken, fileId) => {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { 'Authorization': 'Bearer ' + accessToken }
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || 'Failed to fetch file content');
    }

    return await response.text();
};

/**
 * Moves a file or folder to a new parent.
 */
export const moveFile = async (accessToken, fileId, newParentId) => {
    // 1. Get current parents
    const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents`, {
        headers: { 'Authorization': 'Bearer ' + accessToken }
    });
    const fileInfo = await fileRes.json();
    const previousParents = (fileInfo.parents || []).join(',');

    // 2. Patch to move
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${newParentId}&removeParents=${previousParents}`, {
        method: 'PATCH',
        headers: {
            'Authorization': 'Bearer ' + accessToken,
            'Content-Type': 'application/json'
        }
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || 'Failed to move item');
    }

    return await response.json();
};

export const moveFolder = moveFile; // Alias for backward compatibility

/**
 * Copies a file on Google Drive to a new parent folder.
 */
export const copyFile = async (accessToken, fileId, newParentId) => {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/copy`, {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + accessToken,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            parents: [newParentId]
        })
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || 'Failed to copy item');
    }

    return await response.json();
};


/**
 * Standardized Partner folder provisioning.
 * Path: [Parent]/Partners/[Partner Name]
 */
export const provisionPartnerStructure = async (accessToken, partnerName, parentId = null) => {
    const rootFolderName = 'Partners';

    // 1. Ensure 'Partners' root exists under parent
    const rootId = await getOrCreateFolder(accessToken, rootFolderName, parentId);

    // 2. Ensure Partner-specific folder exists under 'Partners'
    const partnerFolderId = await createFolderStructure(accessToken, partnerName, rootId);

    // 3. Create sub-folders as requested in Image 2
    const subFolders = [
        '01. Inspection Forms',
        '02. Credit Applications',
        '03. Company Certificates',
        '04. Agreements & Contracts',
        '05. KYC Documents'
    ];

    for (const sub of subFolders) {
        await getOrCreateFolder(accessToken, sub, partnerFolderId);
    }

    return {
        id: partnerFolderId,
        link: `https://drive.google.com/drive/folders/${partnerFolderId}`
    };
};

/**
 * Standardized Calibration Lab structure provisioning.
 * Path: [Parent]/CalibrationLab/Certificates/[Customer]/[Vessel]/[Job No]
 */
export const provisionCalibrationStructure = async (accessToken, customerName, vesselName, jobNo, parentId = null) => {
    const rootName = 'CalibrationLab';
    const rootId = await getOrCreateFolder(accessToken, rootName, parentId);

    // Ensure TemplateLib folder exists
    await createFolderStructure(accessToken, 'TemplateLib', rootId);

    // Create Certificates path
    const certificatesRootId = await createFolderStructure(accessToken, 'Certificates', rootId);

    // Create nested path [Customer]/[Vessel]/[Job No]
    const path = `${customerName}/${vesselName}/${jobNo}`;
    const leafId = await createFolderStructure(accessToken, path, certificatesRootId);

    return { id: leafId, webViewLink: `https://drive.google.com/drive/folders/${leafId}` };
};

/**
 * Provision Template Library structure.
 * Path: [Parent]/CalibrationLab/TemplateLib
 */
export const provisionTemplateLibrary = async (accessToken, parentId = null) => {
    const rootName = 'CalibrationLab';
    const rootId = await getOrCreateFolder(accessToken, rootName, parentId);

    const templateLibId = await createFolderStructure(accessToken, 'TemplateLib', rootId);

    return { id: templateLibId, webViewLink: `https://drive.google.com/drive/folders/${templateLibId}` };
};
/**
 * Provision Instrument-specific Vault.
 * Path: [Parent]/CalibrationLab/Instruments/[Instrument Name]/Certificates
 */
export const provisionInstrumentVault = async (accessToken, instrumentName, parentId = null) => {
    const rootName = 'CalibrationLab';
    const rootId = await getOrCreateFolder(accessToken, rootName, parentId);

    // Ensure 'Instruments' master folder exists
    const instrumentsRootId = await createFolderStructure(accessToken, 'Instruments', rootId);

    // Create folder for the specific instrument
    const instrumentFolderId = await createFolderStructure(accessToken, instrumentName, instrumentsRootId);

    // Create Certificates subfolder for better organization
    const certsFolderId = await createFolderStructure(accessToken, 'Certificates', instrumentFolderId);

    return { id: certsFolderId, rootId: instrumentFolderId };
};

/**
 * Standardized APK management structure provisioning.
 * Path: [Parent]/Celron APK/[App Category]
 */
export const provisionApkStructure = async (accessToken, appCategory, parentId = null) => {
    const rootName = 'Celron APK';
    
    // 1. Ensure 'Celron APK' root exists under parent
    const rootId = await getOrCreateFolder(accessToken, rootName, parentId);

    // 2. Ensure App-specific folder exists under root
    const categoryFolderId = await createFolderStructure(accessToken, appCategory, rootId);

    return {
        id: categoryFolderId,
        rootId: rootId,
        link: `https://drive.google.com/drive/folders/${categoryFolderId}`
    };
};

/**
 * Fetches the latest APK link from Supabase and triggers a download.
 * Falls back to local path if database entry is missing.
 * @param {string} identifier - App identifier (e.g., 'scanner')
 */
export async function downloadApkByIdentifier(identifier) {
    try {
        const { supabase } = await import('./supabase');
        const { data, error } = await supabase
            .from('application_apks')
            .select('download_url')
            .eq('app_identifier', identifier)
            .single();
        
        const url = (error || !data?.download_url) 
            ? `/apks/celron-${identifier}.apk` 
            : data.download_url;
            
        // Trigger download
        window.open(url, '_blank');
    } catch (err) {
        console.error(`Error downloading APK for ${identifier}:`, err);
        window.open(`/apks/celron-${identifier}.apk`, '_blank');
    }
}

/**
 * Provisions a standardized folder structure for a Spare Part catalog item.
 * Root parent: https://drive.google.com/drive/folders/1_yktMHYXmdp7MnZT9BNfPCTTluPzOWxA
 * Structure:
 *   [Spare Parts Root] /
 *     {spareNumber}-{spareName}  /
 *       Photos_Media
 *       Datasheets_Manuals
 *
 * @param {string} accessToken - Google OAuth access token
 * @param {string} spareNumber - e.g. "100004"
 * @param {string} spareName   - e.g. "BALL SCREW NUT"
 * @returns {{ folderId, photosFolderId, datasheetsFolderId, webViewLink }}
 */
export const provisionSparepartFolderStructure = async (accessToken, spareNumber, spareName, customRootId = null) => {
    const parentFolderId = customRootId || '1_yktMHYXmdp7MnZT9BNfPCTTluPzOWxA';

    // 1. Find or create the "Catalog Photos" directory under the root parent folder
    const catalogPhotosId = await getOrCreateFolder(accessToken, 'Catalog Photos', parentFolderId);

    // Sanitise name for use in folder title (remove illegal Drive chars)
    const safeName = spareName.replace(/[/\\:*?"<>|]/g, ' ').trim();
    const folderTitle = `${spareNumber} - ${safeName}`;

    // 2. Create / find the top-level spare part folder inside "Catalog Photos"
    const folderId = await getOrCreateFolder(accessToken, folderTitle, catalogPhotosId);

    // 3. Create subfolders
    const photosFolderId    = await getOrCreateFolder(accessToken, 'Photos_Media',       folderId);
    const datasheetsFolderId = await getOrCreateFolder(accessToken, 'Datasheets_Manuals', folderId);

    return {
        folderId,
        photosFolderId,
        datasheetsFolderId,
        webViewLink:            `https://drive.google.com/drive/folders/${folderId}`,
        photosWebViewLink:      `https://drive.google.com/drive/folders/${photosFolderId}`,
        datasheetsWebViewLink:  `https://drive.google.com/drive/folders/${datasheetsFolderId}`
    };
};

/**
 * Migrates files from an Enquiry's subfolders to a Job's subfolders.
 * @param {string} accessToken - Google OAuth token
 * @param {string} enquiryFolderId - GDrive folder ID of the Enquiry
 * @param {string} jobFolderId - GDrive folder ID of the Job
 */
export const migrateEnquiryFilesToJob = async (accessToken, enquiryFolderId, jobFolderId) => {
    if (!enquiryFolderId || !jobFolderId) return;

    try {
        // 1. Find or create target subfolders inside the Job folder to ensure they exist
        const photosGalleryId = await getOrCreateFolder(accessToken, 'Photos & Gallery', jobFolderId);
        const supportDocsId = await getOrCreateFolder(accessToken, 'SupportDocs', jobFolderId);

        // 2. List all contents of the Enquiry folder
        const enquiryContents = await listFolderContent(accessToken, enquiryFolderId);

        for (const item of enquiryContents) {
            if (item.mimeType === 'application/vnd.google-apps.folder') {
                // If it's a standard subfolder, move its files to respective target folders
                const filesInSub = await listFolderContent(accessToken, item.id);
                
                let targetSubfolderId;
                if (item.name === 'Photos & Media') {
                    targetSubfolderId = photosGalleryId;
                } else if (item.name === 'Supplier Enquiry uploads' || item.name === 'Quotations received') {
                    targetSubfolderId = supportDocsId;
                } else {
                    // Non-standard subfolder, move the folder itself to SupportDocs
                    targetSubfolderId = supportDocsId;
                    await moveFile(accessToken, item.id, targetSubfolderId);
                    continue;
                }

                // Move all files inside the standard folder
                for (const file of filesInSub) {
                    await moveFile(accessToken, file.id, targetSubfolderId);
                }
            } else {
                // Loose files in Enquiry root are moved to SupportDocs
                await moveFile(accessToken, item.id, supportDocsId);
            }
        }
        console.log(`Successfully migrated files from Enquiry folder (${enquiryFolderId}) to Job folder (${jobFolderId})`);
    } catch (err) {
        console.error('Failed to migrate Enquiry files to Job folder:', err);
        throw err;
    }
};

