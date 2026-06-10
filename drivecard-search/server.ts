import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import "dotenv/config";

// Lazy-initialize Gemini client to avoid crashes on startup if key is missing
let aiClient: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // JSON parser for base64 uploads
  app.use(express.json({ limit: "20mb" }));

  // API 1: Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // API 2: Image Proxy
  // Allows frontend to load secure Google Drive thumbnails natively without credentials leaks
  app.get("/api/drive/image/:fileId", async (req, res) => {
    const fileId = req.params.fileId;
    const authHeader = req.headers.authorization;
    let token = authHeader;
    if (!token && req.query.token) {
      token = `Bearer ${req.query.token}`;
    }
    if (!token) {
      return res.status(401).json({ error: "Missing identity credential/token" });
    }

    try {
      const driveRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { Authorization: token },
      });

      if (!driveRes.ok) {
        throw new Error(`Google Drive API returned status: ${driveRes.status}`);
      }

      const contentType = driveRes.headers.get("content-type") || "image/jpeg";
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=3600");

      const arrayBuffer = await driveRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      res.send(buffer);
    } catch (err: any) {
      console.error("Error proxying image:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Helper: Recursive scanning of Google Drive folders up to nested level limits
  async function getDriveFilesRecursively(rootFolderId: string, token: string, sendEvent: (obj: any) => void): Promise<any[]> {
    const foldersToScan = [rootFolderId];
    const scannedFolders = new Set<string>();
    const allFiles: any[] = [];
    
    while (foldersToScan.length > 0 && scannedFolders.size < 50) {
      const currentFolderId = foldersToScan.shift()!;
      if (scannedFolders.has(currentFolderId)) continue;
      scannedFolders.add(currentFolderId);

      sendEvent({
        step: "listing-files",
        message: `Scanning Google Drive structure... Collected ${allFiles.length} file(s) so far.`,
      });

      let pageToken: string | null = null;
      do {
        // Query both subfolders and common image / document types in parents
        const query = `'${currentFolderId}' in parents and trashed = false and (` +
          `mimeType = 'application/vnd.google-apps.folder' or ` +
          `mimeType contains 'image/' or ` +
          `mimeType = 'application/pdf' or ` +
          `name contains '.jpg' or ` +
          `name contains '.jpeg' or ` +
          `name contains '.png' or ` +
          `name contains '.webp' or ` +
          `name contains '.pdf'` +
          `)`;

        const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=nextPageToken,files(id,name,mimeType,modifiedTime,size)&pageSize=500${pageToken ? `&pageToken=${pageToken}` : ""}`;
        
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          const errText = await res.text();
          console.error(`Error listing folder ${currentFolderId}: ${errText}`);
          break;
        }

        const data = await res.json();
        const files = data.files || [];

        for (const file of files) {
          if (file.mimeType === "application/vnd.google-apps.folder") {
            if (!scannedFolders.has(file.id) && !foldersToScan.includes(file.id)) {
              foldersToScan.push(file.id);
            }
          } else {
            allFiles.push(file);
          }
        }

        pageToken = data.nextPageToken || null;
      } while (pageToken);
    }

    return allFiles;
  }

  // API 3: Drive Folder Sync & Analysis (SSE Event Stream)
  // Walks folder structure recursively, loads files, looks up index file,
  // populates all cards (including placeholders for unindexed cards), and processes up to 25 uncached files with Gemini.
  app.get("/api/drive/cards/sync", async (req, res) => {
    const folderId = req.query.folderId as string;
    const token = req.query.token as string;

    if (!folderId || !token) {
      return res.status(400).json({ error: "Missing folderId or OAuth token in query" });
    }

    // Connect Server Sent Events
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });

    const sendEvent = (obj: any) => {
      res.write(`data: ${JSON.stringify(obj)}\n\n`);
    };

    try {
      // 1. Resolve folder name
      sendEvent({ step: "folder-verify", message: "Verifying Google Drive root folder..." });
      const folderMetaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,name`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!folderMetaRes.ok) {
        throw new Error(`Failed to access folder (Status ${folderMetaRes.status}). Verify sharing link or parameters.`);
      }

      const folderMeta = await folderMetaRes.json();
      sendEvent({ step: "folder-verified", folderName: folderMeta.name });

      // 2. Retrieve files in folder and its subfolders recursively with full pagination
      const files = await getDriveFilesRecursively(folderId, token, sendEvent);
      sendEvent({ step: "files-listed", totalFiles: files.length });

      if (files.length === 0) {
        sendEvent({ step: "complete", cards: [] });
        return res.end();
      }

      // 3. Search for existing index file '_business_cards_index.json' in that root folder
      sendEvent({ step: "searching-index", message: "Checking folder for active index tracker..." });
      const indexQuery = `name = '_business_cards_index.json' and '${folderId}' in parents and trashed = false`;
      const indexListRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(indexQuery)}&fields=files(id,name)`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      let indexFileId: string | null = null;
      let currentIndexData: any = {};

      if (indexListRes.ok) {
        const indexListData = await indexListRes.json();
        if (indexListData.files && indexListData.files.length > 0) {
          indexFileId = indexListData.files[0].id;
          // Download index data
          sendEvent({ step: "loading-index", message: "Loading card cache index..." });
          const indexContentRes = await fetch(`https://www.googleapis.com/drive/v3/files/${indexFileId}?alt=media`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (indexContentRes.ok) {
            try {
              currentIndexData = await indexContentRes.json();
            } catch (err) {
              console.warn("Index corruption found, starting fresh.");
              currentIndexData = {};
            }
          }
        }
      }

      // 4. Resolve cards and placeholders
      const finalCards: any[] = [];
      const cardsToProcess: any[] = [];

      for (const file of files) {
        const existing = currentIndexData[file.id];
        // Process if not in index, or modifiedTime has changed
        if (!existing || existing.modifiedTime !== file.modifiedTime) {
          cardsToProcess.push(file);
          // Insert a pending placeholder immediately so the user can see it in their dashboard!
          finalCards.push({
            fileId: file.id,
            fileName: file.name,
            modifiedTime: file.modifiedTime,
            name: "Click to Index",
            title: "Metadata extraction available",
            company: file.name,
            emails: [],
            phones: [],
            address: "",
            website: "",
            ocrText: "",
            indexedAt: "",
            isPending: true,
          });
        } else {
          finalCards.push({
            fileId: file.id,
            ...existing,
          });
        }
      }

      // We limit visual indexing processing to first 25 uncached files per Sync run to prevent connection timeouts.
      // The remaining ones are shown as placeholders in the list, and can be indexed on-demand!
      const maxBatchIndex = 25;
      const actualToProcess = cardsToProcess.slice(0, maxBatchIndex);

      sendEvent({
        step: "sync-ready",
        total: files.length,
        cached: finalCards.length - cardsToProcess.length,
        needsProcessing: cardsToProcess.length,
        actualProcessingLimit: actualToProcess.length,
      });

      // 5. Progressively process cards that need visual indexing
      if (actualToProcess.length > 0) {
        const gemini = getGemini();

        for (let i = 0; i < actualToProcess.length; i++) {
          const fileToProcess = actualToProcess[i];
          const fileId = fileToProcess.id;
          const fileName = fileToProcess.name;

          sendEvent({
            step: "processing-card",
            fileName,
            current: i + 1,
            total: actualToProcess.length,
            message: `Extracting data from ${fileName} via Gemini (${i + 1}/${actualToProcess.length})...`,
          });

          try {
            // Download file media
            const fileMediaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
              headers: { Authorization: `Bearer ${token}` },
            });

            if (!fileMediaRes.ok) {
              throw new Error(`Could not load media for ${fileName}`);
            }

            const mediaBuffer = await fileMediaRes.arrayBuffer();
            const base64Data = Buffer.from(mediaBuffer).toString("base64");

            // Extract with Gemini 3.5-flash
            const prompt = `Identify the person, company, title, contact details (emails, phone numbers), website, and physical address from this business card. Also provide a complete OCR text transcription of all printed words. Ensure that any arrays are cleanly formatted. Use proper capitalizations.`;

            const geminiRes = await gemini.models.generateContent({
              model: "gemini-3.5-flash",
              contents: [
                {
                  inlineData: {
                    data: base64Data,
                    mimeType: fileToProcess.mimeType || "image/jpeg",
                  },
                },
                prompt,
              ],
              config: {
                responseMimeType: "application/json",
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING, description: "Full name of the person on the card" },
                    title: { type: Type.STRING, description: "Job title or role of the person" },
                    company: { type: Type.STRING, description: "Company or organization name" },
                    emails: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    phones: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    address: { type: Type.STRING },
                    website: { type: Type.STRING },
                    ocrText: { type: Type.STRING },
                  },
                  required: ["name", "title", "company", "ocrText"],
                },
              },
            });

            const parsedExtracted = JSON.parse(geminiRes.text || "{}");

            const processedMetadata = {
              fileName: fileToProcess.name,
              modifiedTime: fileToProcess.modifiedTime,
              name: parsedExtracted.name || "Unknown",
              title: parsedExtracted.title || "Unknown Title",
              company: parsedExtracted.company || "Unknown Company",
              emails: parsedExtracted.emails || [],
              phones: parsedExtracted.phones || [],
              address: parsedExtracted.address || "",
              website: parsedExtracted.website || "",
              ocrText: parsedExtracted.ocrText || "",
              indexedAt: new Date().toISOString(),
            };

            // Save to memory cache
            currentIndexData[fileId] = processedMetadata;
            
            const cardObject = {
              fileId,
              ...processedMetadata,
            };

            // Replace the placeholder with the actual processed card
            const placeholderIndex = finalCards.findIndex((c) => c.fileId === fileId);
            if (placeholderIndex !== -1) {
              finalCards[placeholderIndex] = cardObject;
            } else {
              finalCards.push(cardObject);
            }

            sendEvent({
              step: "card-indexed",
              card: cardObject,
              current: i + 1,
              total: actualToProcess.length,
            });

            // Auto-save index to Drive after each card indexing to avoid data loss on breaks
            sendEvent({ step: "saving-index", message: `Updating Drive index tracker backup (${i + 1}/${actualToProcess.length})...` });
            if (indexFileId) {
              // Update File (PATCH)
              await fetch(`https://www.googleapis.com/upload/drive/v3/files/${indexFileId}?uploadType=media`, {
                method: "PATCH",
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(currentIndexData),
              });
            } else {
              // Create File (POST Multipart)
              const boundary = "------MultipartIndexBoundary" + Math.random().toString(16);
              const metadataPart = {
                name: "_business_cards_index.json",
                parents: [folderId],
                mimeType: "application/json",
              };
              const body = [
                `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadataPart)}\r\n`,
                `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(currentIndexData)}\r\n`,
                `--${boundary}--`,
              ].join("");

              const createIndexRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": `multipart/related; boundary=${boundary}`,
                },
                body,
              });

              if (createIndexRes.ok) {
                const createdFileInfo = await createIndexRes.json();
                indexFileId = createdFileInfo.id;
              }
            }

          } catch (itemErr: any) {
            console.error(`Error processing individual file ${fileName}:`, itemErr);
            sendEvent({ step: "item-failed", fileName, error: itemErr.message });
          }
        }
      }

      // Finish Event
      sendEvent({ step: "complete", cards: finalCards });
      res.end();
    } catch (err: any) {
      console.error("General Sync Error:", err);
      sendEvent({ step: "failed", error: err.message });
      res.end();
    }
  });

  // API 3.5: Index a single pending/on-demand card (Instant extraction saving)
  app.post("/api/drive/cards/index-single", async (req, res) => {
    const { fileId, folderId, token } = req.body;

    if (!fileId || !folderId || !token) {
      return res.status(400).json({ error: "Missing fileId, folderId, or token" });
    }

    try {
      // 1. Fetch file meta directly
      const fileMetaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,modifiedTime`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!fileMetaRes.ok) {
        throw new Error(`Failed to retrieve file from Drive (Code ${fileMetaRes.status})`);
      }

      const fileToProcess = await fileMetaRes.json();
      const fileName = fileToProcess.name;

      // 2. Load file media
      const fileMediaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!fileMediaRes.ok) {
        throw new Error(`Could not load media for ${fileName}`);
      }

      const mediaBuffer = await fileMediaRes.arrayBuffer();
      const base64Data = Buffer.from(mediaBuffer).toString("base64");

      // 3. Extract with Gemini 3.5-flash
      const gemini = getGemini();
      const prompt = `Identify the person, company, title, contact details (emails, phone numbers), website, and physical address from this business card. Also provide a complete OCR text transcription of all printed words. Ensure that any arrays are cleanly formatted. Use proper capitalizations.`;

      const geminiRes = await gemini.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          {
            inlineData: {
              data: base64Data,
              mimeType: fileToProcess.mimeType || "image/jpeg",
            },
          },
          prompt,
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING, description: "Full name of the person on the card" },
              title: { type: Type.STRING, description: "Job title or role of the person" },
              company: { type: Type.STRING, description: "Company or organization name" },
              emails: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              phones: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              address: { type: Type.STRING },
              website: { type: Type.STRING },
              ocrText: { type: Type.STRING },
            },
            required: ["name", "title", "company", "ocrText"],
          },
        },
      });

      const parsedExtracted = JSON.parse(geminiRes.text || "{}");

      const processedMetadata = {
        fileName: fileToProcess.name,
        modifiedTime: fileToProcess.modifiedTime,
        name: parsedExtracted.name || "Unknown",
        title: parsedExtracted.title || "Unknown Title",
        company: parsedExtracted.company || "Unknown Company",
        emails: parsedExtracted.emails || [],
        phones: parsedExtracted.phones || [],
        address: parsedExtracted.address || "",
        website: parsedExtracted.website || "",
        ocrText: parsedExtracted.ocrText || "",
        indexedAt: new Date().toISOString(),
      };

      // 4. Update index JSON on Google Drive
      const indexQuery = `name = '_business_cards_index.json' and '${folderId}' in parents and trashed = false`;
      const indexListRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(indexQuery)}&fields=files(id,name)`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      let indexFileId: string | null = null;
      let currentIndexData: any = {};

      if (indexListRes.ok) {
        const indexListData = await indexListRes.json();
        if (indexListData.files && indexListData.files.length > 0) {
          indexFileId = indexListData.files[0].id;
          const indexContentRes = await fetch(`https://www.googleapis.com/drive/v3/files/${indexFileId}?alt=media`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (indexContentRes.ok) {
            try {
              currentIndexData = await indexContentRes.json();
            } catch (err) {
              currentIndexData = {};
            }
          }
        }
      }

      // Update in memory
      currentIndexData[fileId] = processedMetadata;

      // Save back to Google Drive
      if (indexFileId) {
        await fetch(`https://www.googleapis.com/upload/drive/v3/files/${indexFileId}?uploadType=media`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(currentIndexData),
        });
      } else {
        const boundary = "------MultipartIndexBoundary" + Math.random().toString(16);
        const metadataPart = {
          name: "_business_cards_index.json",
          parents: [folderId],
          mimeType: "application/json",
        };
        const bodyContent = [
          `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadataPart)}\r\n`,
          `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(currentIndexData)}\r\n`,
          `--${boundary}--`,
        ].join("");

        await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": `multipart/related; boundary=${boundary}`,
          },
          body: bodyContent,
        });
      }

      res.json({
        success: true,
        card: {
          fileId,
          ...processedMetadata,
        },
      });

    } catch (err: any) {
      console.error("Single Index Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // API 4: Add New Card to Drive Folder
  // Uploads image to Google Drive folder and triggers indexing
  app.post("/api/drive/upload", async (req, res) => {
    const { folderId, base64Data, fileName, mimeType, token } = req.body;

    if (!folderId || !base64Data || !token) {
      return res.status(400).json({ error: "Missing folderId, base64Data, or token" });
    }

    try {
      const boundary = "------MultipartBoundary" + Math.random().toString(16);
      const metadata = {
        name: fileName || `BusinessCard_${Date.now()}.jpg`,
        parents: [folderId],
        mimeType: mimeType || "image/jpeg",
      };

      const metaPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
      const mediaPartHeader = `--${boundary}\r\nContent-Type: ${mimeType || "image/jpeg"}\r\nContent-Transfer-Encoding: base64\r\n\r\n`;
      const footer = `\r\n--${boundary}--`;

      const body = Buffer.concat([
        Buffer.from(metaPart),
        Buffer.from(mediaPartHeader),
        Buffer.from(base64Data),
        Buffer.from(footer),
      ]);

      const uploadRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body,
      });

      if (!uploadRes.ok) {
        throw new Error(`Google Drive Upload API returned ${uploadRes.status}`);
      }

      const uploadedInfo = await uploadRes.json();
      res.json({ success: true, fileId: uploadedInfo.id, file: uploadedInfo });
    } catch (err: any) {
      console.error("Upload error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Vite development integration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[DriveCard App] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
