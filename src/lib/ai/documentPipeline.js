import { runWithFallback } from './engine';
import { getOrCreateFolder, moveFile } from '../driveService';

/**
 * Executes the CEL-RON Hub Intelligent Document Ingestion Pipeline.
 * Extracts structured data, calculates confidence, and performs Google Drive archiving/routing.
 * 
 * @param {string} accessToken - Google Drive OAuth Token
 * @param {string} sourceFolder - "Raw_Bus_Cards" | "Raw_Supplier_Invoices" | "Raw_Other_Documents"
 * @param {string} fileId - Main file Google Drive ID
 * @param {string} inputTypeUsed - "text_file" | "image_vision"
 * @param {string} payload - Raw OCR text (for text_file) or Base64 image payload (for image_vision)
 * @param {string} [txtFileId] - Optional companion text file Google Drive ID
 * @returns {Promise<Object>} The pipeline JSON output
 */
export async function runDocumentPipeline(accessToken, sourceFolder, fileId, inputTypeUsed, payload, txtFileId = null, secondaryPayload = null) {
    const isText = inputTypeUsed === 'text_file';
    const isMultiImage = Array.isArray(payload) || (payload && secondaryPayload);
    
    const systemPrompt = `
You are the structural parsing layer of the CEL-RON Hub Intelligent Document Ingestion Pipeline. Your job is to process document payloads and output a single, strictly valid JSON object.

### INPUT MODALITY
The input provided to you will be either:
1. A raw text string extracted from a companion .txt file.
2. A direct image asset analysis via vision fallback.
3. Multi-image candidate front and back business card scans.

### SCHEMA EXTRACTORS

IF processing a Business Card (Raw_Bus_Cards):
Extract these fields: company_name, contact_person, designation, email, phone_numbers (array), address, uen, website, brands, business_scope, notes.

IF processing a Supplier Invoice (Raw_Supplier_Invoices):
Extract these fields: supplier_name, invoice_number, invoice_date (YYYY-MM-DD), currency, subtotal, tax_amount, grand_total, line_items (array of objects containing description, quantity, unit_price, amount).

IF processing any other file (Raw_Other_Documents):
Extract these fields: document_title, document_type, key_entities (array), summary, dates_found (array).

### PIPELINE ARCHIVE & GALLERY ROUTING LOGIC
1. Evaluate the completeness and reliability of your extraction. Assign a confidence_score between 0.00 and 1.00.
2. If confidence_score >= 0.80:
   - Set pipeline_action to "ARCHIVE"
   - Set target_folder to "[Current_Folder]/Archive/"
3. If confidence_score < 0.80:
   - Set pipeline_action to "PENDING_REVIEW"
   - Set target_folder to "[Keep in current root folder]"
4. Always set gallery_sync to true so the image asset is successfully bound to the gallery UI card.

### STRICT OUTPUT FORMAT
Return ONLY JSON. Do not write introductory text, markdown code blocks, or conversational wrap-ups.

{
  "document_metadata": {
    "source_folder": "${sourceFolder}",
    "input_type_used": "${inputTypeUsed}"
  },
  "confidence_metrics": {
    "confidence_score": 0.00,
    "pipeline_action": "[ARCHIVE / PENDING_REVIEW]",
    "gallery_sync": true
  },
  "extracted_data": {
    // Structural extraction fields insert here
  }
}
`;

    const userPrompt = isText 
        ? `Here is the raw text extracted from the companion text file:\n"""\n${payload}\n"""`
        : (isMultiImage 
            ? `Please analyze the provided Front and Back business card image assets simultaneously.`
            : `Please analyze the provided image asset.`);

    const history = [{ role: 'system', content: systemPrompt }];
    
    let imagePayload = null;
    let imagesPayload = null;

    if (!isText) {
        if (Array.isArray(payload)) {
            imagesPayload = payload;
        } else if (payload && secondaryPayload) {
            imagesPayload = [payload, secondaryPayload];
        } else {
            imagePayload = payload;
        }
    }

    // Execute through AI fallback router
    const result = await runWithFallback(userPrompt, false, history, null, imagePayload, true, imagesPayload);
    
    console.log('[Document Ingestion Pipeline] Raw LLM response:', result);

    // Validate result shape
    if (!result || !result.confidence_metrics) {
        throw new Error('Pipeline failed to return valid instruction structure.');
    }

    // Execute routing actions if ARCHIVE is selected
    if (result.confidence_metrics.pipeline_action === 'ARCHIVE' && accessToken && fileId) {
        try {
            console.log(`[Document Ingestion Pipeline] Ingestion Confidence >= 0.80. Executing ARCHIVE routing...`);
            
            // 1. Get current parent folder
            const parentRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            if (parentRes.ok) {
                const parentInfo = await parentRes.json();
                const parentId = parentInfo.parents?.[0];
                if (parentId) {
                    // 2. Get or create Archive folder
                    const archiveFolderId = await getOrCreateFolder(accessToken, 'Archive', parentId);
                    
                    // 3. Move main file to Archive
                    await moveFile(accessToken, fileId, archiveFolderId);
                    console.log(`[Document Ingestion Pipeline] Successfully archived main file ID ${fileId} to folder ${archiveFolderId}`);

                    // 4. Move companion text file to Archive if present
                    if (txtFileId) {
                        await moveFile(accessToken, txtFileId, archiveFolderId);
                        console.log(`[Document Ingestion Pipeline] Successfully archived companion text file ID ${txtFileId} to folder ${archiveFolderId}`);
                    }
                }
            }
        } catch (routeErr) {
            console.error('[Document Ingestion Pipeline] Error performing routing action:', routeErr);
        }
    }

    return result;
}
