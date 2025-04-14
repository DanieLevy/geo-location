'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';
import { Button } from "@/components/ui/button";
import { CoordinateDialog } from "@/components/ui/CoordinateDialog";
import { DrivePoint } from '@/lib/types';
import { JumpExportDialog } from '@/components/JumpExportDialog';
import {
  MapIcon, PlusIcon, EyeIcon, EyeOffIcon, TargetIcon, CircleIcon,
  FilterIcon, XIcon, Trash2Icon, Settings2Icon, CheckIcon, GaugeIcon,
  PlusCircle, MapPin, PinOff,
} from 'lucide-react';
import { Separator } from "@/components/ui/separator";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ObjectPointsPanel } from "./ManagedPointsPanel";
import { MapControls } from './MapControls';

// Constants for the debug point
const DEBUG_POINT_LAT = 31.327642333333333; // Re-add constant
const DEBUG_POINT_LNG = 35.38836366666666; // Re-add constant
// const DISTANCE_FILTER_TOLERANCE = 3; // Tolerance is now state
const MAX_CONSECUTIVE_FRAME_ID_DIFF = 30; // Updated from 10
const MAX_GROUPING_DISTANCE_METERS = 3.0; // Updated from 1.0
const TIME_TOLERANCE_MS = 100; // Allow up to 100ms difference for timestamp grouping
const DEFAULT_DISTANCE_TOLERANCE = 3; // meters
const DEFAULT_SPEED_TOLERANCE = 5; // km/h

// --- Calculate Distance (Haversine) ---
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // in metres
}

// --- Calculate Bearing ---
function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const φ1 = lat1 * Math.PI/180;
  const λ1 = lon1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const λ2 = lon2 * Math.PI/180;
  const y = Math.sin(λ2-λ1) * Math.cos(φ2);
  const x = Math.cos(φ1)*Math.sin(φ2) - Math.sin(φ1)*Math.cos(φ2)*Math.cos(λ2-λ1);
  const θ = Math.atan2(y, x);
  const brng = (θ*180/Math.PI + 360) % 360; // degrees
  return brng;
}

// --- Normalize Angle Difference ---
function angleDifference(angle1: number, angle2: number): number {
    let diff = ( angle2 - angle1 + 180 ) % 360 - 180;
    return diff < -180 ? diff + 360 : diff;
}

// --- Get Speed Color ---
const getSpeedColor = (speedKmh: number): string => {
    if (speedKmh < 20) return '#22c55e'; // Green
    if (speedKmh < 50) return '#eab308'; // Yellow
    if (speedKmh < 80) return '#f97316'; // Orange
    return '#ef4444'; // Red
};

interface DriveMapProps {
  points: DrivePoint[];
  onMarkerAdd?: (marker: L.Marker) => void;
  highlightedPoints?: number[]; // Add support for highlighted points
}

// Interface for managed objects (updated)
interface ObjectMarker {
  id: number; 
  marker: L.Marker;
  lat: number;
  lng: number;
  title: string;
  isSelected: boolean; // Replaces isReference, removed isTarget
}

export default function DriveMap({ points, onMarkerAdd, highlightedPoints }: DriveMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markerClusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const routeElementsRef = useRef<(L.Polyline | L.Marker)[]>([]);
  const debugMarkerRef = useRef<L.Marker | null>(null);
  const highlightedMarkersRef = useRef<L.CircleMarker[]>([]);
  const [isDebugPointVisible, setIsDebugPointVisible] = useState(false); // State to track debug point
  const [viewMode, setViewMode] = useState<'markers' | 'route'>('markers');
  const [isAddingMarker, setIsAddingMarker] = useState(false);
  const [isCoordinateDialogOpen, setIsCoordinateDialogOpen] = useState(false);
  const [distanceFilter, setDistanceFilter] = useState<number | null>(null); // Currently active filter distance
  const [manualDistanceInput, setManualDistanceInput] = useState<string>(""); // Value in the manual input field
  const [distanceTolerance, setDistanceTolerance] = useState<number>(DEFAULT_DISTANCE_TOLERANCE); // State for tolerance (default 3m)
  const [showDistanceCircles, setShowDistanceCircles] = useState(false);
  const distanceCirclesRef = useRef<L.Circle[]>([]);
  const [isJumpExportDialogOpen, setIsJumpExportDialogOpen] = useState(false);
  const [pointsForJumpExport, setPointsForJumpExport] = useState<DrivePoint[] | null>(null);
  const [sourceFilesForJumpExport, setSourceFilesForJumpExport] = useState<string[]>([]); // State for source files

  // Speed Filter State (NEW)
  const [speedFilter, setSpeedFilter] = useState<number | null>(null);
  const [manualSpeedInput, setManualSpeedInput] = useState<string>("");
  const [speedTolerance, setSpeedTolerance] = useState<number>(DEFAULT_SPEED_TOLERANCE);

  // Selected Object State (NEW) - Replaces referenceMarkerInfo
  const [selectedObjectInfo, setSelectedObjectInfo] = useState<{ marker: L.Marker | null; lat: number | null; lng: number | null }>({ marker: null, lat: null, lng: null });
  
  // State for Manually Added/Managed Markers -> Objects (NEW)
  const [objectMarkers, setObjectMarkers] = useState<ObjectMarker[]>([]); // Renamed, updated type

  const [isFilterPopoverOpen, setIsFilterPopoverOpen] = useState(false); // Control popover state if needed

  // Core map initialization effect (keep)
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Initialize the map
    mapRef.current = L.map(mapContainerRef.current).setView([0, 0], 13);

    // Add the OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors'
    }).addTo(mapRef.current);

    // Initialize marker cluster group
    markerClusterRef.current = L.markerClusterGroup({
      chunkedLoading: true,
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true
    });

    // Add right-click handler to the cluster group after it's created
    markerClusterRef.current.on('clustercontextmenu', (e: any) => {
      // Cast cluster to any to access internal _leaflet_id (type definitions might be incomplete/strict)
      const cluster = e.layer as any;
      const markerCount = cluster.getChildCount();
      
      // --- Improved Popup Content with Tailwind --- 
      const popupEl = document.createElement('div');
      popupEl.className = 'p-3 space-y-3 min-w-[200px]'; // Add padding and spacing

      // Title
      const titleEl = document.createElement('p');
      titleEl.className = 'text-sm font-semibold';
      titleEl.innerText = `Cluster contains ${markerCount} markers`;
      popupEl.appendChild(titleEl);

      // CSV Filename Input Section
      const csvInputDiv = document.createElement('div');
      csvInputDiv.className = 'space-y-1'; 
      const csvLabel = document.createElement('label');
      csvLabel.htmlFor = `csv-filename-${cluster._leaflet_id}`;
      csvLabel.className = 'block text-xs font-medium text-stone-700 dark:text-stone-300';
      csvLabel.innerText = 'CSV Filename:';
      const csvInput = document.createElement('input');
      csvInput.type = 'text';
      csvInput.id = `csv-filename-${cluster._leaflet_id}`;
      csvInput.value = 'map-data'; 
      // Apply input styles similar to shadcn/ui Input
      csvInput.className = 'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100';
      csvInputDiv.appendChild(csvLabel);
      csvInputDiv.appendChild(csvInput);
      popupEl.appendChild(csvInputDiv);

      // Button Container
      const buttonDiv = document.createElement('div');
      buttonDiv.className = 'flex gap-2 pt-2'; // Add gap between buttons

      // Create CSV Export Button with improved styles
      const csvExportButton = document.createElement('button');
      csvExportButton.id = `export-csv-btn-${cluster._leaflet_id}`;
      // Apply button styles similar to shadcn/ui Button (primary-like)
      csvExportButton.className = "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2 flex-1 bg-blue-600 hover:bg-blue-700 text-white";
      csvExportButton.innerText = 'Export CSV';
      csvExportButton.onclick = () => {
          const filenameInput = csvInput; // Use the input element directly
          const data = prepareMarkerDataForExport(cluster as L.MarkerCluster);
          if (data && data.length > 0) {
            let filename = filenameInput.value.trim() || 'map-data';
            if (!filename.endsWith('.csv')) filename += '.csv';
            exportToCsv(data, filename);
            contextMenu.close();
          }
      };
      buttonDiv.appendChild(csvExportButton);

      // Create Jump Export Button with improved styles
      const jumpExportButton = document.createElement('button');
      jumpExportButton.id = `export-jump-btn-${cluster._leaflet_id}`;
      // Apply button styles similar to shadcn/ui Button (secondary-like, adjusted colors)
      jumpExportButton.className = "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 h-9 px-4 py-2 flex-1 bg-green-600 hover:bg-green-700 text-white";
      jumpExportButton.innerText = 'Export .jump';
      jumpExportButton.onclick = () => {
          // Use prepareMarkerDataForExport directly, cast cluster back for type compatibility
          const data = prepareMarkerDataForExport(cluster as L.MarkerCluster);
          if (data && data.length > 0) {
              // Extract DrivePoints needed for jump export
              const drivePointsToExport = data.map(d => d!.drivePoint).filter(Boolean) as DrivePoint[];
              // Extract unique source filenames from the points to export
              const uniqueSourceFiles = Array.from(new Set(drivePointsToExport.map(p => p.sourceFile)));
              
              setPointsForJumpExport(drivePointsToExport); // Store points for dialog
              setSourceFilesForJumpExport(uniqueSourceFiles); // Store source files for dialog
              setIsJumpExportDialogOpen(true); // Open the dialog
              contextMenu.close(); // Close the popup
          } else {
              alert("No valid data points found in this cluster to export.");
          }
      };
      buttonDiv.appendChild(jumpExportButton);

      // --- >>> Add the container with the buttons to the main popup element <<< ---
      popupEl.appendChild(buttonDiv);
      
      // Create and open the popup with the buttons
      const contextMenu = L.popup({ closeButton: true, className: 'cluster-context-menu' })
        .setLatLng(e.latlng)
        .setContent(popupEl)
        .openOn(mapRef.current!); 
    });

    mapRef.current.addLayer(markerClusterRef.current);

    // Clean up on unmount
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Updated effect to handle adding/updating points based on the prop
  useEffect(() => {
    if (!mapRef.current || !markerClusterRef.current) return;

    markerClusterRef.current.clearLayers();
    clearRouteElements();

    if (points.length === 0) return;

    // --- Apply Filters Sequentially --- 
    let pointsToDisplay = points; // Start with all points

    // 1. Apply Distance Filter (if active and reference point exists)
    if (distanceFilter !== null && selectedObjectInfo.lat !== null && selectedObjectInfo.lng !== null) {
      pointsToDisplay = pointsToDisplay.filter(point => {
        // Use reference point coordinates
        const distance = calculateDistance(point.lat, point.lng, selectedObjectInfo.lat!, selectedObjectInfo.lng!); 
        return Math.abs(distance - distanceFilter) <= distanceTolerance;
      });
    }

    // 2. Apply Speed Filter (if active) to the result of the distance filter
    if (speedFilter !== null) {
      pointsToDisplay = pointsToDisplay.filter(point => {
        const speedKmh = point.speed?.kmh;
        if (speedKmh === null || speedKmh === undefined) return false;
        return Math.abs(speedKmh - speedFilter) <= speedTolerance;
      });
    }
    // --- End Apply Filters --- 

    // Now use pointsToDisplay for rendering
    if (viewMode === 'markers') {
      const markers = pointsToDisplay.map(point => {
        const marker = L.marker([point.lat, point.lng]);
        (marker as any)._drivePointData = point;
        let distanceInfo = '';
        // Calculate distance if reference point is set
        if (selectedObjectInfo.lat !== null && selectedObjectInfo.lng !== null) { 
          const distance = calculateDistance(point.lat, point.lng, selectedObjectInfo.lat, selectedObjectInfo.lng); 
          distanceInfo = `<div><strong>Dist (Ref):</strong> ${distance.toFixed(1)}m</div>`;
        }
        
        // Improved Popup Content
        const popupContent = `
          <div class="text-xs space-y-0.5 p-1 font-sans">
            <div><strong>ID:</strong> ${point.frameId}</div>
            <div><strong>Lat:</strong> ${point.lat.toFixed(6)}</div>
            <div><strong>Lng:</strong> ${point.lng.toFixed(6)}</div>
            ${point.altitude ? `<div><strong>Alt:</strong> ${point.altitude.toFixed(1)}m</div>` : ''}
            <div><strong>Speed:</strong> ${point.speed?.kmh?.toFixed(1) ?? 'N/A'} km/h (${point.speed?.ms?.toFixed(1) ?? 'N/A'} m/s)</div>
            ${distanceInfo}
            ${point.timestamp ? `<div><strong>Time:</strong> ${new Date(point.timestamp).toLocaleTimeString()}</div>` : ''}
            <div><strong>Source:</strong> ${point.sourceFile || 'N/A'}</div>
          </div>`;
        
        marker.bindPopup(popupContent, { 
            minWidth: 150, // Ensure minimum width for readability
            // closeButton: false // Optional: remove close button for cleaner look?
        });
        return marker;
      });
      markerClusterRef.current.addLayers(markers);
    } else {
      // Create route visualization with filtered points
      const routeCoordinates = pointsToDisplay.map(p => [p.lat, p.lng] as [number, number]);
      
      if (routeCoordinates.length > 0) {
        // Create gradient polyline based on speed using pointsToDisplay
        const segments = pointsToDisplay.slice(1).map((point, i) => {
          const prevPoint = pointsToDisplay[i]; 
          const speed = point.speed?.kmh ?? 0;
          const color = getSpeedColor(speed);
          return {
            coordinates: [[prevPoint.lat, prevPoint.lng], [point.lat, point.lng]],
            speed,
            color
          };
        });

        segments.forEach(segment => {
           // Ensure segment coordinates are valid LatLngExpression[]
          // Create LatLng objects explicitly for type safety
          const startLatLng = L.latLng(segment.coordinates[0][0], segment.coordinates[0][1]);
          const endLatLng = L.latLng(segment.coordinates[1][0], segment.coordinates[1][1]);
          const leafletCoords: L.LatLngExpression[] = [startLatLng, endLatLng]; 
          
          // if (leafletCoords.length === 2) { // Check is less critical now
                const polyline = L.polyline(leafletCoords, {
                    color: segment.color,
                    weight: 3,
                    opacity: 0.8
                }).addTo(mapRef.current!);

                polyline.bindPopup(`Speed: ${segment.speed.toFixed(2)} km/h`);
                routeElementsRef.current.push(polyline);
          // } else {
          //      console.warn("Skipping segment with invalid coordinates:", segment.coordinates);
          // }
        });

        // Add start and end markers based on pointsToDisplay
        const startMarker = L.marker([pointsToDisplay[0].lat, pointsToDisplay[0].lng], {
          icon: L.divIcon({
            className: 'custom-div-icon',
            html: '<div style="background-color: #22c55e; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>',
            iconSize: [12, 12],
          })
        }).addTo(mapRef.current);
        startMarker.bindPopup('Start Point');
        routeElementsRef.current.push(startMarker);

        if (pointsToDisplay.length > 1) {
            const endMarker = L.marker([pointsToDisplay[pointsToDisplay.length - 1].lat, pointsToDisplay[pointsToDisplay.length - 1].lng], {
              icon: L.divIcon({
                className: 'custom-div-icon',
                html: '<div style="background-color: #ef4444; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>',
                iconSize: [12, 12],
              })
            }).addTo(mapRef.current);
            endMarker.bindPopup('End Point');
            routeElementsRef.current.push(endMarker);
        }
      }
    }

    // Fit map bounds based on pointsToDisplay
    if (pointsToDisplay.length > 0 && mapRef.current) {
        try {
            const bounds = L.latLngBounds(pointsToDisplay.map(p => [p.lat, p.lng]));
            if (bounds.isValid()) {
                mapRef.current.fitBounds(bounds, { padding: [50, 50] });
            }
        } catch (e) {
            console.error("Error fitting bounds:", e, pointsToDisplay);
        }
    }
  }, [points, viewMode, distanceFilter, speedFilter, selectedObjectInfo, distanceTolerance, speedTolerance]);

  // Function to add distance circles around debug point
  const addDistanceCircles = useCallback(() => {
    // Check for reference marker instead of debug marker
    if (!mapRef.current || !selectedObjectInfo.marker) return; 
    
    // Clear existing circles
    distanceCirclesRef.current.forEach(circle => {
      if (mapRef.current) mapRef.current.removeLayer(circle);
    });
    distanceCirclesRef.current = [];
    
    // Add new circles for each distance using reference marker position
    const center = selectedObjectInfo.marker.getLatLng(); 
    const distances = [10, 20, 30, 50, 100];
    const colors = ['#3388ff', '#33cc33', '#ffcc00', '#ff3333'];
    
    distances.forEach((distance, index) => {
      const circle = L.circle(center, {
        radius: distance,
        color: colors[index],
        fillColor: colors[index],
        fillOpacity: 0.1,
        weight: 2
      }).addTo(mapRef.current!);
      
      circle.bindTooltip(`${distance}m`);
      distanceCirclesRef.current.push(circle);
    });
  }, [selectedObjectInfo.marker]);

  // Function to remove distance circles
  const removeDistanceCircles = useCallback(() => {
    distanceCirclesRef.current.forEach(circle => {
      if (mapRef.current) mapRef.current.removeLayer(circle);
    });
    distanceCirclesRef.current = [];
  }, []);

  // Toggle distance circles
  const toggleDistanceCircles = useCallback(() => {
    // Check for reference marker instead of debug marker
    if (!selectedObjectInfo.marker) return; 
    const willShow = !showDistanceCircles;
    setShowDistanceCircles(willShow);
    if (willShow) { addDistanceCircles(); }
    else { removeDistanceCircles(); }
  }, [showDistanceCircles, addDistanceCircles, removeDistanceCircles, selectedObjectInfo.marker]);

  // Sample points for route visualization
  const samplePointsForRoute = (points: DrivePoint[], sampleSize: number = 1000) => {
    if (points.length <= sampleSize) return points;
    
    const step = Math.max(1, Math.floor(points.length / sampleSize));
    return points.filter((_, index) => index % step === 0);
  };

  // CSV Export - Wrap in useCallback
  const exportToCsv = useCallback((data: any[], filename: string) => {
    if (!data || data.length === 0) return;

    // Ensure data is an array of objects
    if (!Array.isArray(data) || typeof data[0] !== 'object' || data[0] === null) {
        console.error("Invalid data format for CSV export:", data);
        alert("Cannot export CSV: Invalid data format.");
        return;
    }

    // Get headers safely
    const headers = Object.keys(data[0]);
    if (headers.length === 0) {
         console.error("No headers found for CSV export:", data[0]);
         alert("Cannot export CSV: No data headers found.");
        return;
    }

    const csvRows = [headers.join(',')];

    for (const row of data) {
      // Ensure row is an object
      if (typeof row !== 'object' || row === null) continue;

      const values = headers.map(header => {
        // Handle drivePoint object specifically if present
        if (header === 'drivePoint' && typeof row[header] === 'object' && row[header] !== null) {
             // Decide what to export from drivePoint - maybe just its ID or sourceFile?
             // return `"${JSON.stringify(row[header])}"`; // Avoid exporting complex objects directly
             return row[header]?.sourceFile || ''; // Example: export source file
        }

        let val = row[header];

        // Handle nested speed object specifically
        if (header === 'speed' && typeof val === 'object' && val !== null && 'kmh' in val) {
          val = val.kmh?.toFixed(2); // Export kmh speed
        } else if (typeof val === 'object' && val !== null) {
           // For other objects, maybe stringify or take a specific property
           val = JSON.stringify(val);
        }


        const escaped = typeof val === 'string' ? `"${val.replace(/"/g, '""')}"` : (val ?? ''); // Handle null/undefined
        return escaped;
      });
      csvRows.push(values.join(','));
    }

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, []);

  // Prepare Marker Data for Export - Update distance calculation
  const prepareMarkerDataForExport = useCallback((cluster: L.MarkerCluster) => {
    const markers = cluster.getAllChildMarkers() as L.Marker[];
    const extractedData = markers.map(marker => {
      const point = (marker as any)._drivePointData as DrivePoint | undefined;
      if (!point) return null;

      // Use reference point coordinates if available
      const distance = (selectedObjectInfo.lat !== null && selectedObjectInfo.lng !== null) ?
        calculateDistance(point.lat, point.lng, selectedObjectInfo.lat, selectedObjectInfo.lng) :
        null;
      
      // Format timestamp into date and time if available
      let formattedDate = '';
      let formattedTime = '';
      if (point.timestamp) {
        const date = new Date(point.timestamp);
        formattedDate = date.toLocaleDateString();
        formattedTime = date.toLocaleTimeString();
      }
      
      // Return object including the original point for jump export
      return {
        drivePoint: point, // Keep the original point data
        frameId: point.frameId,
        lat: point.lat,
        lng: point.lng,
        date: formattedDate,
        time: formattedTime,
        altitude: point.altitude || '',
        // Provide defaults if speed is undefined
        speed_ms: point.speed?.ms ?? 0,
        speed_kmh: point.speed?.kmh ?? 0,
        distance_from_reference: distance ? distance.toFixed(2) : '',
        sourceFile: point.sourceFile, // Make sure source file is included
      };
    }).filter(Boolean);
    
    // Sort by timestamp if available
    if (extractedData.length > 0 && extractedData[0]?.time) { // Check time field presence
        extractedData.sort((a, b) => {
            // Attempt to reconstruct date objects for sorting
            try {
                // Assuming 'date' and 'time' are in standard formats parsable by Date
                const dateA = a && a.date && a.time ? new Date(`${a.date} ${a.time}`).getTime() : 0;
                const dateB = b && b.date && b.time ? new Date(`${b.date} ${b.time}`).getTime() : 0;
                if (isNaN(dateA) || isNaN(dateB)) return 0; // Fallback if dates are invalid
                 return dateA - dateB;
            } catch (e) {
                 console.error("Error parsing date/time for sorting:", e);
                 return 0; // Fallback on error
            }
        });
    } else if (extractedData.length > 0 && extractedData[0]?.frameId) {
        // Fallback to sorting by frameId if timestamp is unreliable/missing
         extractedData.sort((a, b) => (a?.frameId ?? 0) - (b?.frameId ?? 0));
    }
    
    return extractedData;
  // Dependency: selectedObjectInfo for distance calculation
  }, [selectedObjectInfo]);

  // Function to clear all route elements
  const clearRouteElements = useCallback(() => {
    if (!mapRef.current) return;
    
    // Clear all stored route elements (polylines and markers)
    routeElementsRef.current.forEach(element => {
      mapRef.current?.removeLayer(element);
    });
    routeElementsRef.current = [];
    
    // Also clear the old polyline reference for backward compatibility
    if (polylineRef.current) {
      mapRef.current.removeLayer(polylineRef.current);
      polylineRef.current = null;
    }
  }, []);

  // Toggle view mode
  const toggleViewMode = useCallback(() => {
    setViewMode(prev => prev === 'markers' ? 'route' : 'markers');
  }, []);

  // RENAME handler: handleSetReference -> handleSelectObject
  const handleSelectObject = useCallback((lat: number, lng: number, marker: L.Marker) => {
      console.log("Setting selected object:", lat, lng);
      const markerId = L.Util.stamp(marker);
      
      // Update objectMarkers state
      setObjectMarkers(prev => prev.map(m => ({
         ...m,
         isSelected: m.id === markerId, 
      })));

      setSelectedObjectInfo({ marker, lat, lng });
      marker.closePopup();
      // Keep distance circles behavior (optional)
      //setShowDistanceCircles(false); 
      //removeDistanceCircles();

  // Update dependencies
  }, [selectedObjectInfo.marker, removeDistanceCircles, setObjectMarkers]); 

  // RENAME handler: clearReference -> clearSelectedObject
  const clearSelectedObject = useCallback(() => {
       console.log("Clearing selected object");
       setObjectMarkers(prev => prev.map(m => ({ ...m, isSelected: false })));
       setSelectedObjectInfo({ marker: null, lat: null, lng: null });
       setDistanceFilter(null);
       setShowDistanceCircles(false);
       removeDistanceCircles();
  // Update dependencies
  }, [selectedObjectInfo.marker, removeDistanceCircles, setObjectMarkers]); 

  // --- Managed Marker Removal (Update dependencies) ---
  const removeManagedMarker = useCallback((idToRemove: number) => {
     setObjectMarkers(prev => {
       const markerToRemove = prev.find(m => m.id === idToRemove);
       if (markerToRemove) {
         if (mapRef.current) {
           mapRef.current.removeLayer(markerToRemove.marker);
         }
         // Check if it was the selected object and clear it
         if (markerToRemove.isSelected) {
           clearSelectedObject(); // Use renamed clear function
         }
       }
       return prev.filter(m => m.id !== idToRemove);
     });
  // Update dependencies
  }, [clearSelectedObject]); 

  // --- Marker Creation --- 
  const addMarker = useCallback((lat: number, lng: number, options: { title?: string; description?: string; isDebug?: boolean /* isDebug used only for default object button */ } = {}) => {
    if (!mapRef.current) return null;

    const marker = L.marker([lat, lng]);
    const markerTitle = options.title || `Object @ ${lat.toFixed(4)}, ${lng.toFixed(4)}`; // Update default title

    // Popup Creation
    const popupContainer = document.createElement('div');
    popupContainer.className = "text-xs space-y-1 p-2 font-sans min-w-[150px]";
    popupContainer.innerHTML = `
      ${`<div class="font-semibold mb-1">${markerTitle}</div>`}
      ${options.description ? `<div><small>${options.description}</small></div>` : ''}
      <div class="mt-1"><strong>Lat:</strong> ${lat.toFixed(6)}</div>
      <div><strong>Lng:</strong> ${lng.toFixed(6)}</div>
    `;

    // Button container - Only has Select button now
    const buttonDiv = document.createElement('div');
    buttonDiv.className = "flex gap-1 mt-2 pt-1 border-t border-stone-200 dark:border-stone-700";

    // "Select Object" Button 
    const selectObjButton = document.createElement('button');
    selectObjButton.innerText = 'Select Object';
    selectObjButton.className = 'px-2 py-0.5 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 flex-1'; 
    selectObjButton.style.cursor = 'pointer';
    selectObjButton.onclick = (e) => {
        e.stopPropagation(); 
        handleSelectObject(lat, lng, marker); // Use renamed handler
    }
    buttonDiv.appendChild(selectObjButton);
    
    popupContainer.appendChild(buttonDiv);
    marker.bindPopup(popupContainer, { minWidth: 150 });
    marker.addTo(mapRef.current);

    const markerId = L.Util.stamp(marker);

    // REMOVE condition: Always add the marker to the state 
    // if (!options.isDebug) { 
    setObjectMarkers(prev => [
      ...prev,
      {
        id: markerId,
        marker: marker,
        lat: lat,
        lng: lng,
        title: markerTitle,
        isSelected: false, // Always add as not selected initially
      }
    ]);
    // }

    // Call external handler if provided (for drive points?)
    if (onMarkerAdd) {
      onMarkerAdd(marker);
    }
    
    return marker;
  // Update dependencies
  }, [selectedObjectInfo.marker, handleSelectObject, onMarkerAdd, setObjectMarkers]);

  // --- Debug Point Handling -> Add Default Object ---
  const addDefaultObject = useCallback(() => { // Rename handler
      if (selectedObjectInfo.marker) {
         alert("An object is already selected. Clear it first to add the default object.");
         return;
      }
      // Use isDebug flag only to prevent adding the default object to the managed list initially - NO LONGER TRUE
      // The flag might still be useful for default title/description if needed.
      const marker = addMarker(DEBUG_POINT_LAT, DEBUG_POINT_LNG, {
        title: 'Default Object', // Rename title
        description: 'Default calculation reference',
        isDebug: true // Keep flag for potential differentiation if needed elsewhere, but doesn't prevent adding to list
      });

      if (marker) {
        // Select this marker as the active object
        // We need to update the state correctly after addMarker adds it
        const markerId = L.Util.stamp(marker);
        setObjectMarkers(prev => prev.map(m => ({
            ...m,
            isSelected: m.id === markerId // Set the newly added one as selected
        })));
        setSelectedObjectInfo({ marker, lat: DEBUG_POINT_LAT, lng: DEBUG_POINT_LNG });
        // No need to call handleSelectObject here, as we directly updated the state
      }
  // Update dependencies - Removed handleSelectObject, addMarker dependency remains
  }, [selectedObjectInfo.marker, addMarker, setObjectMarkers]); 

  // --- Manual Marker Placement Logic REFACTORED START ---
  // Stable map click handler (depends on the stable addMarker)
  const handleMapClick = useCallback((e: L.LeafletMouseEvent) => {
    addMarker(e.latlng.lat, e.latlng.lng, { title: 'Manual Marker' });
    setIsAddingMarker(false); 
  }, [addMarker]); 

  // Effect to add/remove map click listener based on isAddingMarker state
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (isAddingMarker) {
      map.getContainer().style.cursor = 'crosshair';
      map.on('click', handleMapClick);
    } else {
      map.getContainer().style.cursor = '';
      map.off('click', handleMapClick);
    }

    // Cleanup function to remove listener and reset cursor
    return () => {
      map.getContainer().style.cursor = '';
      map.off('click', handleMapClick);
    };
  }, [isAddingMarker, handleMapClick]);

  // Simplified functions to toggle the state
  const enableMarkerPlacement = useCallback(() => {
    setIsAddingMarker(true);
  }, []);
  const disableMarkerPlacement = useCallback(() => {
        setIsAddingMarker(false);
  }, []);
  // --- Manual Marker Placement Logic REFACTORED END ---

  // --- Distance Filter Handlers START ---
  const handleSetPresetFilter = useCallback((dist: number | null) => {
      setDistanceFilter(dist);
      setManualDistanceInput("");
  }, []);

  const handleManualInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      setManualDistanceInput(e.target.value);
  }, []);

  const handleApplyManualFilter = useCallback(() => {
      const manualDist = parseFloat(manualDistanceInput);
      if (!isNaN(manualDist) && manualDist >= 0) {
          setDistanceFilter(manualDist);
      } else {
          console.warn("Invalid manual distance input:", manualDistanceInput);
          setDistanceFilter(null);
          setManualDistanceInput("");
      }
  }, [manualDistanceInput]);

  // --- Distance Filter Handlers END ---

  // --- Tolerance Handler ---
  const handleDistanceToleranceChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val) && val >= 0) {
      setDistanceTolerance(val);
    } else if (e.target.value === '') {
      setDistanceTolerance(0);
    }
  }, []);

  // --- Speed Filter Handlers START ---
  const handleSetPresetSpeedFilter = useCallback((speed: number | null) => {
    setSpeedFilter(speed);
    setManualSpeedInput("");
  }, []);

  const handleManualSpeedInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setManualSpeedInput(e.target.value);
  }, []);

  const handleApplyManualSpeedFilter = useCallback(() => {
    const manualSpeed = parseFloat(manualSpeedInput);
    if (!isNaN(manualSpeed) && manualSpeed >= 0) {
      setSpeedFilter(manualSpeed);
    } else {
      console.warn("Invalid manual speed input:", manualSpeedInput);
       setSpeedFilter(null);
       setManualSpeedInput("");
    }
  }, [manualSpeedInput]);

  const handleSpeedToleranceChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val) && val >= 0) {
      setSpeedTolerance(val);
    } else if (e.target.value === '') {
      setSpeedTolerance(0);
    }
  }, []);
  // --- Speed Filter Handlers END ---

  // --- Export to Jump File Logic (UPDATED for multi-file) ---
  const exportToJump = useCallback((settingsPerFile: Record<string, { 
    sessionName: string;
    view: string;
    camera: string;
    fps: number;
  }>, 
  pointsToExport: DrivePoint[] 
  ) => {
    if (!pointsToExport || pointsToExport.length === 0) {
        console.warn("No points provided for jump export.");
        alert("No points were selected for the jump export."); 
        return;
    }

    // Group points by sourceFile
    const pointsBySourceFile = pointsToExport.reduce((acc, point) => {
       if (!acc[point.sourceFile]) {
         acc[point.sourceFile] = [];
       }
       acc[point.sourceFile].push(point);
       return acc;
    }, {} as Record<string, DrivePoint[]>);

    console.log(`Exporting jump data for ${Object.keys(pointsBySourceFile).length} source files.`);

    // Process each source file individually
    for (const sourceFile in pointsBySourceFile) {
       if (!settingsPerFile[sourceFile]) {
          console.warn(`Settings not found for ${sourceFile}, skipping export.`);
          continue;
       }

       const settings = settingsPerFile[sourceFile];
       const filePoints = pointsBySourceFile[sourceFile];

       console.log(`Processing ${sourceFile}: ${filePoints.length} points, FPS: ${settings.fps}`);

       if (filePoints.length === 0) continue; // Skip if no points for this file

       // Calculate firstFrameId *based on this file's points*
       const firstFrameId = Math.min(...filePoints.map(p => p.frameId));
       console.log(`Using first frame ID for ${sourceFile}:`, firstFrameId);

       // --- START: Filtering Logic (applied per file) ---
       const pointsByClip = new Map<number, DrivePoint[]>();

       // 1. Calculate clip and group points for this file
       filePoints.forEach(point => {
           const frameDifference = point.frameId - firstFrameId;
           const nonNegativeFrameDiff = Math.max(0, frameDifference);
           const clipRaw = nonNegativeFrameDiff / 60 / settings.fps;
           // Ensure clipNumber is at least 1
           const clipNumber = Math.max(1, Math.ceil(clipRaw)); 

           if (!pointsByClip.has(clipNumber)) {
               pointsByClip.set(clipNumber, []);
           }
           pointsByClip.get(clipNumber)!.push(point);
       });

       // 2. Select representative from each clip group based on time separation
       const finalExportPoints: DrivePoint[] = [];
       const sortedClipNumbers = Array.from(pointsByClip.keys()).sort((a, b) => a - b);
       const MIN_TIME_DIFF_MS = 5000; // 5 seconds minimum separation

       sortedClipNumbers.forEach(clipNumber => {
           const group = pointsByClip.get(clipNumber)!;
           group.sort((a, b) => a.frameId - b.frameId);
           let lastKeptPoint: DrivePoint | null = null;

           group.forEach(currentPoint => {
               if (!lastKeptPoint) {
                   finalExportPoints.push(currentPoint);
                   lastKeptPoint = currentPoint;
               } else {
                   if (currentPoint.timestamp && lastKeptPoint.timestamp) {
                       try {
                           const timeCurrent = new Date(currentPoint.timestamp).getTime();
                           const timeLastKept = new Date(lastKeptPoint.timestamp).getTime();
                           if (!isNaN(timeCurrent) && !isNaN(timeLastKept)) {
                               if (Math.abs(timeCurrent - timeLastKept) > MIN_TIME_DIFF_MS) {
                                   finalExportPoints.push(currentPoint);
                                   lastKeptPoint = currentPoint;
                               }
                           }
                       } catch (e) {
                           console.error("Error parsing timestamp during export filtering:", e);
                       }
                   } 
               }
           });
       });
       // --- END: Filtering Logic ---

       console.log(`Selected ${finalExportPoints.length} points for export from ${sourceFile} after time filtering.`);

       if (finalExportPoints.length === 0) {
           console.warn(`No representative points found for ${sourceFile} after filtering.`);
           continue; // Skip to the next file
       }

       // 3. Generate jump file lines using this file's points and settings
       const jumpFileLines = finalExportPoints.map(point => {
           const frameDifference = point.frameId - firstFrameId;
           const nonNegativeFrameDiff = Math.max(0, frameDifference);
           const clipRaw = nonNegativeFrameDiff / 60 / settings.fps;
           // Ensure clipNumber is at least 1
           const clipNumber = Math.max(1, Math.ceil(clipRaw)); 
           const clipFormatted = String(clipNumber).padStart(4, '0');

           // Distance Label Logic - Use reference point state
           let distanceLabel = 'NoRef'; // Changed default label
           // Use selectedObjectInfo state instead of isDebugPointVisible or targetObjectPosition
           if (selectedObjectInfo.lat !== null && selectedObjectInfo.lng !== null) { 
               const distance = calculateDistance(point.lat, point.lng, selectedObjectInfo.lat, selectedObjectInfo.lng);
               distanceLabel = `${Math.round(distance)}m`;
               const speedKmh = Math.round(point.speed?.kmh ?? 0);
               distanceLabel += `_${speedKmh}kmh`;
           }

           // Use the session name, view, camera from this file's settings
           return `${settings.sessionName}_s001_${settings.view}_s60_${clipFormatted} ${settings.camera} ${point.frameId} ${distanceLabel}`;
       });

       const jumpFileContent = jumpFileLines.join('\n') + '\n#format: trackfile camera frameIDStartFrame tag';

       // Create Blob and Trigger Download for THIS file
       const blob = new Blob([jumpFileContent], { type: 'text/plain;charset=utf-8;' });
       const url = URL.createObjectURL(blob);
       const link = document.createElement('a');
       link.setAttribute('href', url);
       const safeFilename = settings.sessionName.replace(/[^a-z0-9_.-]/gi, '');
       link.setAttribute('download', `${safeFilename || sourceFile.replace(/\.csv$/i, '') || 'export'}.jump`);
       document.body.appendChild(link);
       link.click();
       document.body.removeChild(link);
       URL.revokeObjectURL(url);
       console.log(`Jump file export triggered for ${sourceFile} as ${link.getAttribute('download')}.`);
    }
    // End of loop through source files

  }, [selectedObjectInfo, calculateDistance]); // Dependency updated

  // --- NEW: Zoom Handler ---
  const handleZoomTo = useCallback((lat: number, lng: number) => {
    if (mapRef.current) {
      mapRef.current.flyTo([lat, lng], 18); // Use flyTo for smooth zoom, adjust zoom level (18) as needed
    }
  }, []); // No dependencies needed as mapRef is stable

  // New effect to handle highlighted points from the AI
  useEffect(() => {
    if (!mapRef.current || !points || points.length === 0) return;
    
    // Clear previous highlights
    highlightedMarkersRef.current.forEach(marker => {
      if (mapRef.current) mapRef.current.removeLayer(marker);
    });
    highlightedMarkersRef.current = [];
    
    // If there are no highlights, just return
    if (!highlightedPoints || highlightedPoints.length === 0) return;
    
    // Create highlights for the specified points
    highlightedPoints.forEach(index => {
      if (index >= 0 && index < points.length) {
        const point = points[index];
        if (point && point.lat && point.lng) {
          // Create a highlighted marker
          const highlightMarker = L.circleMarker([point.lat, point.lng], {
            radius: 15,
            color: '#ff3b30',
            weight: 3,
            opacity: 0.8,
            fillColor: '#ff9500',
            fillOpacity: 0.3,
            className: 'pulse-marker'
          }).addTo(mapRef.current!);
          
          // Attach a popup with information
          highlightMarker.bindPopup(`
            <div class="p-2">
              <div class="font-bold mb-1">Point #${index}</div>
              <div>Lat: ${point.lat.toFixed(6)}</div>
              <div>Lng: ${point.lng.toFixed(6)}</div>
              ${point.speedKmh ? `<div>Speed: ${point.speedKmh.toFixed(1)} km/h</div>` : ''}
              ${point.timestamp ? `<div>Time: ${new Date(point.timestamp).toLocaleTimeString()}</div>` : ''}
            </div>
          `);
          
          // Store the marker for later cleanup
          highlightedMarkersRef.current.push(highlightMarker);
        }
      }
    });
    
    // If there are highlights, try to pan to the first one
    if (highlightedMarkersRef.current.length > 0) {
      const bounds = L.latLngBounds(
        highlightedMarkersRef.current.map(marker => marker.getLatLng())
      );
      mapRef.current.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [highlightedPoints, points]);

  // --- UI Rendering ---
  return (
    <div className="space-y-4 h-full flex flex-col"> {/* Ensure parent div takes height */}
       {/* --- Render MapControls Component --- */}
       <MapControls
         viewMode={viewMode}
         isAddingMarker={isAddingMarker}
         selectedObjectInfo={selectedObjectInfo}
         distanceFilter={distanceFilter}
         speedFilter={speedFilter}
         distanceTolerance={distanceTolerance}
         speedTolerance={speedTolerance}
         manualDistanceInput={manualDistanceInput}
         manualSpeedInput={manualSpeedInput}
         showDistanceCircles={showDistanceCircles}
         isFilterPopoverOpen={isFilterPopoverOpen}
         toggleViewMode={toggleViewMode}
         enableMarkerPlacement={enableMarkerPlacement}
         disableMarkerPlacement={disableMarkerPlacement}
         setIsCoordinateDialogOpen={setIsCoordinateDialogOpen}
         addDefaultObject={addDefaultObject}
         clearSelectedObject={clearSelectedObject}
         toggleDistanceCircles={toggleDistanceCircles}
         handleSetPresetFilter={handleSetPresetFilter}
         handleManualInputChange={handleManualInputChange}
         handleApplyManualFilter={handleApplyManualFilter}
         handleDistanceToleranceChange={handleDistanceToleranceChange}
         handleSetPresetSpeedFilter={handleSetPresetSpeedFilter}
         handleManualSpeedInputChange={handleManualSpeedInputChange}
         handleApplyManualSpeedFilter={handleApplyManualSpeedFilter}
         handleSpeedToleranceChange={handleSpeedToleranceChange}
         setIsFilterPopoverOpen={setIsFilterPopoverOpen}
       />

       {/* --- Map Container (Takes remaining space) --- */}
       <div className="flex-grow w-full rounded-lg shadow-md overflow-hidden relative z-0"> 
         <div ref={mapContainerRef} className="h-full w-full" /> {/* Map needs defined size */}
       </div>

       {/* Dialogs */}
       <CoordinateDialog
         isOpen={isCoordinateDialogOpen}
         onClose={() => setIsCoordinateDialogOpen(false)}
        onSave={(coords) => { addMarker(coords.lat, coords.lng, coords); }}
      />
      <JumpExportDialog
        isOpen={isJumpExportDialogOpen}
        sourceFiles={sourceFilesForJumpExport}
        onClose={() => {
            setIsJumpExportDialogOpen(false);
            setPointsForJumpExport(null);
            setSourceFilesForJumpExport([]);
        }}
        onSubmit={(settingsPerFile) => {
          if (pointsForJumpExport) {
              exportToJump(settingsPerFile, pointsForJumpExport);
          }
          setIsJumpExportDialogOpen(false);
          setPointsForJumpExport(null);
          setSourceFilesForJumpExport([]);
        }}
      />

    </div>
  );
} 