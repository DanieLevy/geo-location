export interface DrivePoint {
  frameId: number;
  lat: number;
  lng: number;
  altitude?: number;
  // Keep speed flexible for now, might need refinement
  speed?: { ms: number; kmh: number }; 
  speedKmh?: number;
  timestamp?: string;
  sourceFile: string;
} 