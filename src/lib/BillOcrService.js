import { runAI } from './ai/engine.js';

/**
 * Parses a supplier bill image/PDF using Gemini AI.
 * Supports both base64 image OCR and pre-extracted OCR text parsing.
 * @param {string} base64Image - Base64 encoded image data.
 * @param {string} [extractedText] - Pre-extracted OCR text from Google Vision API.
 * @returns {Promise<Object>} - The structured bill data.
 */
export async function parseSupplierBillWithAi(base64Image, extractedText = '') {
    try {
        let result;
        if (extractedText) {
            console.log('[Bill AI] Parsing bill via extracted OCR text...');
            const prompt = `
                TASK: Extract structured data from this Supplier Bill/Invoice OCR text.
                OCR Text:
                """
                ${extractedText}
                """
                
                Return ONLY JSON:
                { 
                  "supplier_name": "string", 
                  "uen": "string", 
                  "invoice_no": "string", 
                  "invoice_date": "string (YYYY-MM-DD)", 
                  "currency": "string (e.g. SGD, USD)",
                  "subtotal": number, 
                  "gst_amount": number, 
                  "total_amount": number, 
                  "items": [{ "description": "string", "quantity": number, "unit_price": number, "amount": number }] 
                }
            `;
            result = await runAI('autofill', { prompt });
        } else {
            console.log('[Bill AI] Sending image for OCR...');
            result = await runAI('bill_ocr', { image: base64Image });
        }
        
        if (!result || result.error) {
            throw new Error(result?.error || 'AI failed to parse the bill.');
        }

        return {
            supplier_name: result.supplier_name || '',
            uen: result.uen || '',
            invoice_no: result.invoice_no || '',
            invoice_date: result.invoice_date || '',
            currency: result.currency || 'SGD',
            subtotal: result.subtotal || 0,
            gst_amount: result.gst_amount || 0,
            total_amount: result.total_amount || 0,
            items: result.items || [],
            confidence: 90 // Default high confidence for visual OCR
        };
    } catch (err) {
        console.error('[Bill AI] Parsing failed:', err);
        throw err;
    }
}
