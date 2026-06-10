export interface Supplier {
  name: string;
  location: string;
  latitude: number;
  longitude: number;
  phoneNo: string;
  email: string;
  contactPerson: string;
  website: string;
  stockStatus: string;
  availableBrandsInfo: string;
  whyRecommended: string;
  industrySegment: string;
  distance: number;
  matchScore: number;
  isAiGenerated?: boolean;
  supplierRole?: "Maker" | "Distributor" | "Agent" | "Stockist"; 
  address?: string;
  price?: string;
  matchedProduct?: string;
}

export interface RFQRouting {
  partsName: string;
  quantity: number;
  urgency: "Routine" | "Critical AOG" | "Vessel in Distress";
  targetBudget?: string;
  notes?: string;
}

export const INDUSTRY_CATEGORIES = [
  { id: "Marine & Offshore Spares", label: "Marine & Offshore Spares", icon: "Anchor" },
  { id: "Industrial Spares", label: "Industrial Spares", icon: "Settings" },
  { id: "Innovative Spares", label: "Innovative Spares", icon: "Cpu" },
  { id: "Common Spares", label: "Common Spares", icon: "Hammer" }
];
