export interface BusinessCard {
  fileId: string;
  fileName: string;
  modifiedTime: string;
  name: string;
  title: string;
  company: string;
  emails: string[];
  phones: string[];
  address: string;
  website: string;
  ocrText: string;
  indexedAt: string;
  isPending?: boolean;
}

export interface CardIndex {
  [fileId: string]: Omit<BusinessCard, "fileId">;
}

export interface IndexingProgress {
  current: number;
  total: number;
  fileName: string;
  isProcessing: boolean;
}

export interface DriveFolder {
  id: string;
  name: string;
}
