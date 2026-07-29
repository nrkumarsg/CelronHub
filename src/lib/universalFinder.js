// src/lib/universalFinder.js
import { supabase } from './supabase.js';
import { chatWithGemini } from './geminiService.js';

const GOOGLE_API_KEYS = [
  (typeof process !== 'undefined' && process.env?.VITE_GOOGLE_API_KEY) || (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GOOGLE_API_KEY),
  (typeof process !== 'undefined' && process.env?.VITE_GOOGLE_GEOCODE_KEY) || (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GOOGLE_GEOCODE_KEY)
].filter(Boolean);

const GOOGLE_CX = (typeof process !== 'undefined' && (process.env.VITE_GOOGLE_CX || process.env.GOOGLE_CX)) || (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GOOGLE_CX);

const COUNTRY_CODES = {
    'Singapore': 'SG', 'Malaysia': 'MY', 'Indonesia': 'ID', 'Thailand': 'TH', 'Vietnam': 'VN',
    'Philippines': 'PH', 'United Arab Emirates': 'AE', 'Saudi Arabia': 'SA', 'Qatar': 'QA',
    'United Kingdom': 'GB', 'United States': 'US', 'Germany': 'DE', 'China': 'CN', 'India': 'IN'
};

/**
 * Perform a deep maritime/industrial search for a partner or entity.
 */
export async function performMaritimeIntelligenceSearch({
    query,
    userId,
    brand = '',
    country = '',
    category = '',
    restrictToCountry = false,
    skipAi = false
}) {
    // 1. Check for existing recent search (Cache)
    const { data: existingSearch } = await supabase
        .from('searches')
        .select('id, created_at')
        .eq('query', query)
        .order('created_at', { ascending: false })
        .limit(1);

    if (existingSearch && existingSearch.length > 0) {
        const ageHours = (new Date() - new Date(existingSearch[0].created_at)) / (1000 * 60 * 60);
        if (ageHours < 24) {
            console.log(`[Finder] Reusing recent search:`, existingSearch[0].id);
            return existingSearch[0].id;
        }
    }

    // 2. Perform Live Search using Free Options first, then falling back to Key Rotation
    return runUniversalSearch({ query, userId, skipAi });
}

export async function runNominatimSearch(query) {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5`;
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'CelronHub-Procurement-System/1.0 (contact@celron.net)'
            }
        });
        const data = await response.json();
        return data.map(item => ({
            title: item.display_name,
            link: `https://www.openstreetmap.org/?mlat=${item.lat}&mlon=${item.lon}`,
            snippet: `Official Address: ${item.display_name}. Category: ${item.category}, Type: ${item.type}`,
            address_data: item.address,
            lat: item.lat,
            lon: item.lon,
            source: 'nominatim'
        }));
    } catch (err) {
        console.warn('[Nominatim] Search failed:', err);
        return [];
    }
}

export async function runDuckDuckGoSearch(query) {
    const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        if (!response.ok) return [];
        const html = await response.text();
        
        const results = [];
        const resultRegex = /<div class="result__body">([\s\S]*?)<\/div>/g;
        let match;
        while ((match = resultRegex.exec(html)) !== null && results.length < 5) {
            const body = match[1];
            const titleMatch = body.match(/<a class="result__a"[\s\S]*?>([\s\S]*?)<\/a>/);
            const linkMatch = body.match(/href="([\s\S]*?)"/);
            const snippetMatch = body.match(/<a class="result__snippet"[\s\S]*?>([\s\S]*?)<\/a>/);
            
            if (titleMatch && linkMatch) {
                let link = linkMatch[1];
                // Clean up DDG redirect links
                if (link.includes('uddg=')) {
                    try {
                        const urlParams = new URLSearchParams(link.split('?')[1]);
                        link = urlParams.get('uddg') || link;
                    } catch (e) {
                        // fallback to original link
                    }
                }

                results.push({
                    title: titleMatch[1].replace(/<[^>]*>?/gm, '').trim(),
                    url: link,
                    snippet: snippetMatch ? snippetMatch[1].replace(/<[^>]*>?/gm, '').trim() : '',
                    source: 'duckduckgo'
                });
            }
        }
        return results;
    } catch (err) {
        console.warn('[DDG] Search failed:', err);
        return [];
    }
}

export async function runUniversalSearch(params, keyIndex = 0) {
    const { query, userId } = params;
    if (!query) return null;

    // 1. Create Search Entry
    const { data: search, error: searchErr } = await supabase
        .from('searches')
        .insert({ 
            query, 
            user_id: userId,
            source: 'maritime_finder'
        })
        .select()
        .single();
    
    if (searchErr) throw searchErr;

    // 2. Try FREE Options First (Nominatim + DDG)
    console.log(`[Finder] Attempting free search for: ${query}`);
    try {
        const [nomRes, ddgRes] = await Promise.all([
            runNominatimSearch(query),
            runDuckDuckGoSearch(query)
        ]);

        const freeResults = [...nomRes, ...ddgRes];
        if (freeResults.length > 0) {
            const resultsToSave = freeResults.map(item => ({
                search_id: search.id,
                title: item.title,
                url: item.url || item.link,
                snippet: item.snippet,
                pagemap: item.address_data ? { address: item.address_data } : {}
            }));
            await supabase.from('search_results').insert(resultsToSave);
            console.log(`[Finder] Free search succeeded with ${freeResults.length} items.`);
            return search.id;
        }
    } catch (freeErr) {
        console.warn('[Finder] Free search attempt failed, falling back to Google:', freeErr);
    }

    // 3. Fallback to Google Search API
    if (keyIndex >= GOOGLE_API_KEYS.length) {
        console.error('All Search options (Free & Google) exhausted');
        return search.id;
    }
    
    const currentKey = GOOGLE_API_KEYS[keyIndex];
    
    try {
        const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${currentKey}&cx=${GOOGLE_CX}&q=${encodeURIComponent(query)}`;
        const response = await fetch(searchUrl);
        const data = await response.json();

        if (data.error) {
            const isRetryable = [429, 403, 400].includes(data.error.code);
            if (isRetryable) {
                console.warn(`[Finder] Google Key ${keyIndex} failed. Trying next...`);
                return runUniversalSearch(params, keyIndex + 1);
            }
            throw new Error(data.error.message);
        }

        const googleResults = (data.items || []).map(item => ({
            search_id: search.id,
            title: item.title,
            url: item.link,
            snippet: item.snippet,
            pagemap: item.pagemap
        }));

        if (googleResults.length > 0) {
            await supabase.from('search_results').insert(googleResults);
        }

        return search.id;
    } catch (err) {
        console.error('[Finder] Google Search failed:', err);
        return search.id;
    }
}
