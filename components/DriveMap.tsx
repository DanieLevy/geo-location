'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';
import { Button } from "@/components/ui/button";
import { CoordinateDialog } from "@/components/ui/CoordinateDialog";
import { DrivePoint } from '@/lib/types'; // Assuming DrivePoint type is defined here
import { JumpExportDialog } from '@/components/JumpExportDialog';

// Constants for the debug point
const DEBUG_POINT_LAT = 31.327642333333333;
const DEBUG_POINT_LNG = 35.38836366666666;
const DISTANCE_FILTER_TOLERANCE = 3; // Tolerance in meters (±)

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
}

export default function DriveMap({ points, onMarkerAdd }: DriveMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markerClusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const routeElementsRef = useRef<(L.Polyline | L.Marker)[]>([]);
  const debugMarkerRef = useRef<L.Marker | null>(null);
  const [isDebugPointVisible, setIsDebugPointVisible] = useState(false); // State to track debug point
  const [viewMode, setViewMode] = useState<'markers' | 'route'>('markers');
  const [isAddingMarker, setIsAddingMarker] = useState(false);
  const [isCoordinateDialogOpen, setIsCoordinateDialogOpen] = useState(false);
  const [distanceFilter, setDistanceFilter] = useState<number | null>(null); // Currently active filter distance
  const [manualDistanceInput, setManualDistanceInput] = useState<string>(""); // Value in the manual input field
  const [showDistanceCircles, setShowDistanceCircles] = useState(false);
  const distanceCirclesRef = useRef<L.Circle[]>([]);
  const [targetObjectPosition, setTargetObjectPosition] = useState<L.LatLng | null>(null);
  const [targetObjectMarkerRef, setTargetObjectMarkerRef] = useState<L.Marker | null>(null);
  const [isJumpExportDialogOpen, setIsJumpExportDialogOpen] = useState(false);
  const [pointsForJumpExport, setPointsForJumpExport] = useState<DrivePoint[] | null>(null);

  // Function to reset style of a marker (example using opacity)
  const resetMarkerStyle = (marker: L.Marker | null) => {
    if (marker) {
        // Replace with your actual reset logic (e.g., setIcon, setOpacity)
        try { marker.setOpacity(1.0); } catch (e) { console.warn("Error resetting marker style:", e)}
    }
  };

  // Function to apply target style to a marker (example using opacity)
  const applyTargetStyle = (marker: L.Marker | null) => {
    if (marker) {
        // Replace with your actual target style logic
         try { marker.setOpacity(0.6); } catch (e) { console.warn("Error applying target style:", e)}
    }
  };

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
    markerClusterRef.current.on('clustercontextmenu', (e: L.LeafletMouseEvent) => {
      const cluster = e.layer as L.MarkerCluster;
      const markerCount = cluster.getChildCount();
      
      // Create DOM element for the popup content
      const popupEl = document.createElement('div');
      popupEl.className = 'p-2';
      popupEl.innerHTML = `
          <p class="mb-2 font-semibold">Cluster contains ${markerCount} markers</p>
          <div class="mb-2">
            <label for="csv-filename-${cluster._leaflet_id}" class="block text-sm mb-1">CSV Filename:</label>
            <input 
              type="text" 
              id="csv-filename-${cluster._leaflet_id}" 
              value="map-data" 
              class="px-2 py-1 border rounded w-full text-sm"
            />
          </div>
      `; // Use unique IDs for inputs

      // Create CSV Export Button
      const csvExportButton = document.createElement('button');
      csvExportButton.id = `export-csv-btn-${cluster._leaflet_id}`;
      csvExportButton.className = "px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm";
      csvExportButton.innerText = 'Export to CSV';
      csvExportButton.onclick = () => {
          const filenameInput = document.getElementById(`csv-filename-${cluster._leaflet_id}`) as HTMLInputElement;
          const data = prepareMarkerDataForExport(cluster);
          if (data && data.length > 0) {
            let filename = filenameInput.value.trim() || 'map-data';
            if (!filename.endsWith('.csv')) filename += '.csv';
            exportToCsv(data, filename);
            contextMenu.close();
          }
      };
      popupEl.appendChild(csvExportButton);

      // Create Jump Export Button
      const jumpExportButton = document.createElement('button');
      jumpExportButton.id = `export-jump-btn-${cluster._leaflet_id}`;
      jumpExportButton.className = "ml-2 px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 text-sm"; // Style differently
      jumpExportButton.innerText = 'Export as .jump';
      jumpExportButton.onclick = () => {
          const data = prepareMarkerDataForExport(cluster);
          if (data && data.length > 0) {
              // Extract DrivePoints needed for jump export
              const drivePointsToExport = data.map(d => d.drivePoint).filter(Boolean) as DrivePoint[];
              setPointsForJumpExport(drivePointsToExport); // Store points for dialog
              setIsJumpExportDialogOpen(true); // Open the dialog
              contextMenu.close(); // Close the popup
          } else {
              alert("No valid data points found in this cluster to export.");
          }
      };
      popupEl.appendChild(jumpExportButton);
      
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

    // Apply distance filter ONLY if filter is set AND debug point exists
    const filteredPoints = (distanceFilter !== null && debugMarkerRef.current)
      ? points.filter(point => {
          const distance = calculateDistance(point.lat, point.lng, DEBUG_POINT_LAT, DEBUG_POINT_LNG);
          // --- Apply BAND filtering logic --- 
          return Math.abs(distance - distanceFilter) <= DISTANCE_FILTER_TOLERANCE;
        })
      : points;

    // Add markers for the current points
    if (viewMode === 'markers') {
      const markers = filteredPoints.map(point => {
        const marker = L.marker([point.lat, point.lng]);
        (marker as any)._drivePointData = point;
        let distanceInfo = '';
        if (debugMarkerRef.current) {
          const distance = calculateDistance(point.lat, point.lng, DEBUG_POINT_LAT, DEBUG_POINT_LNG);
          // Show distance only if debug point is visible
          distanceInfo = `<div><strong>Dist:</strong> ${distance.toFixed(1)}m</div>`; 
        }
        
        // Improved Popup Content
        const popupContent = `
          <div class="text-xs space-y-0.5 p-1 font-sans">
            <div><strong>ID:</strong> ${point.frameId}</div>
            <div><strong>Lat:</strong> ${point.lat.toFixed(6)}</div>
            <div><strong>Lng:</strong> ${point.lng.toFixed(6)}</div>
            ${point.altitude ? `<div><strong>Alt:</strong> ${point.altitude.toFixed(1)}m</div>` : ''}
            <div><strong>Speed:</strong> ${point.speed.kmh.toFixed(1)} km/h (${point.speed.ms.toFixed(1)} m/s)</div>
            ${distanceInfo}
            ${point.timestamp ? `<div><strong>Time:</strong> ${new Date(point.timestamp).toLocaleTimeString()}</div>` : ''}
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
      const routeCoordinates = filteredPoints.map(p => [p.lat, p.lng] as [number, number]);
      
      if (routeCoordinates.length > 0) {
        // Create gradient polyline based on speed
        const segments = routeCoordinates.slice(1).map((coord, i) => {
          const speed = filteredPoints[i + 1].speed.kmh;
          const color = getSpeedColor(speed);
          return {
            coordinates: [routeCoordinates[i], coord],
            speed,
            color
          };
        });

        segments.forEach(segment => {
          const polyline = L.polyline(segment.coordinates, {
            color: segment.color,
            weight: 3,
            opacity: 0.8
          }).addTo(mapRef.current!);

          polyline.bindPopup(`Speed: ${segment.speed.toFixed(2)} km/h`);
          routeElementsRef.current.push(polyline);
        });

        // Add start and end markers
        const startMarker = L.marker(routeCoordinates[0], {
          icon: L.divIcon({
            className: 'custom-div-icon',
            html: '<div style="background-color: #22c55e; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>',
            iconSize: [12, 12],
          })
        }).addTo(mapRef.current);
        startMarker.bindPopup('Start Point');
        routeElementsRef.current.push(startMarker);

        const endMarker = L.marker(routeCoordinates[routeCoordinates.length - 1], {
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

    // Fit map bounds
    if (filteredPoints.length > 0 && mapRef.current) {
        try {
            const bounds = L.latLngBounds(filteredPoints.map(p => [p.lat, p.lng]));
            if (bounds.isValid()) {
                mapRef.current.fitBounds(bounds, { padding: [50, 50] });
            }
        } catch (e) {
            console.error("Error fitting bounds:", e, filteredPoints);
        }
    }
  }, [points, viewMode, distanceFilter, isDebugPointVisible]); // Re-run when points, viewMode, filter, or debug point visibility changes

  // Calculate distance in meters between two points using Haversine formula
  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI/180; // φ, λ in radians
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lng2-lng1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // in metres
  };

  // Function to add distance circles around debug point
  const addDistanceCircles = useCallback(() => {
    if (!mapRef.current || !debugMarkerRef.current) return;
    
    // Clear existing circles
    distanceCirclesRef.current.forEach(circle => {
      if (mapRef.current) mapRef.current.removeLayer(circle);
    });
    distanceCirclesRef.current = [];
    
    // Add new circles for each distance
    const center = debugMarkerRef.current.getLatLng();
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
  }, []);

  // Function to remove distance circles
  const removeDistanceCircles = useCallback(() => {
    distanceCirclesRef.current.forEach(circle => {
      if (mapRef.current) mapRef.current.removeLayer(circle);
    });
    distanceCirclesRef.current = [];
  }, []);

  // Toggle distance circles
  const toggleDistanceCircles = useCallback(() => {
    if (!debugMarkerRef.current) return;
    const willShow = !showDistanceCircles;
    setShowDistanceCircles(willShow);
    if (willShow) { addDistanceCircles(); }
    else { removeDistanceCircles(); }
  }, [showDistanceCircles, addDistanceCircles, removeDistanceCircles]);

  // Sample points for route visualization
  const samplePointsForRoute = (points: DrivePoint[], sampleSize: number = 1000) => {
    if (points.length <= sampleSize) return points;
    
    const step = Math.max(1, Math.floor(points.length / sampleSize));
    return points.filter((_, index) => index % step === 0);
  };

  // Function to convert data to CSV and download
  const exportToCsv = (data: any[], filename: string) => {
    if (!data.length) return;

    // Get all object keys from the first item to use as headers
    const headers = Object.keys(data[0]);
    
    // Create CSV header row
    const csvRows = [headers.join(',')];
    
    // Add data rows
    for (const row of data) {
      const values = headers.map(header => {
        // Handle special cases for nested objects or formatting
        if (header === 'speed') {
          return `${row[header].kmh.toFixed(2)}`;
        }
        
        const val = row[header];
        // Quote strings with commas, wrap in quotes
        const escaped = typeof val === 'string' ? `"${val.replace(/"/g, '""')}"` : val;
        return escaped;
      });
      
      csvRows.push(values.join(','));
    }
    
    // Combine all rows into a single string
    const csvString = csvRows.join('\n');
    
    // Create a download link
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Extract data from markers and prepare for CSV export
  const prepareMarkerDataForExport = (cluster: L.MarkerCluster) => {
    const markers = cluster.getAllChildMarkers() as L.Marker[];
    const extractedData = markers.map(marker => {
      // Get the original DrivePoint data AND KEEP IT for jump export
      const point = (marker as any)._drivePointData as DrivePoint | undefined;
      if (!point) return null;

      // Calculate distance from debug point
      const distance = debugMarkerRef.current ? 
        calculateDistance(point.lat, point.lng, DEBUG_POINT_LAT, DEBUG_POINT_LNG) : 
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
        speed_ms: point.speed.ms,
        speed_kmh: point.speed.kmh,
        distance_from_reference: distance ? distance.toFixed(2) : '',
      };
    }).filter(Boolean);
    
    // Sort by timestamp if available
    if (extractedData.length > 0 && extractedData[0]?.date) {
        extractedData.sort((a, b) => {
            if (!a?.drivePoint?.timestamp || !b?.drivePoint?.timestamp) return 0;
            return new Date(a.drivePoint.timestamp).getTime() - new Date(b.drivePoint.timestamp).getTime();
        });
    }
    
    return extractedData;
  };

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

  // --- Target Handling ---
  const handleSetTarget = useCallback((lat: number, lng: number, marker: L.Marker) => {
      console.log("Setting target:", lat, lng);
      const newTargetPos = L.latLng(lat, lng);
      setTargetObjectPosition(newTargetPos);
      if (targetObjectMarkerRef && targetObjectMarkerRef !== marker) {
          resetMarkerStyle(targetObjectMarkerRef);
      }
      applyTargetStyle(marker);
      setTargetObjectMarkerRef(marker);
      marker.closePopup();
  }, [targetObjectMarkerRef]);

  const clearTarget = useCallback(() => {
      console.log("Clearing target");
      setTargetObjectPosition(null);
      if (targetObjectMarkerRef) {
         resetMarkerStyle(targetObjectMarkerRef);
      }
      setTargetObjectMarkerRef(null);
  }, [targetObjectMarkerRef]);

  // --- Marker Creation --- (Wrapped in useCallback)
  const addMarker = useCallback((lat: number, lng: number, options: { title?: string; description?: string; isDebug?: boolean } = {}) => {
    if (!mapRef.current) return null;

    const marker = L.marker([lat, lng]);
    
    const popupContainer = document.createElement('div');
    popupContainer.className = "text-xs space-y-0.5 p-1 font-sans";
    popupContainer.innerHTML = `
      ${options.title ? `<div><strong>${options.title}</strong></div>` : ''}
      ${options.description ? `<div><small>${options.description}</small></div>` : ''}
      <div><strong>Lat:</strong> ${lat.toFixed(6)}</div>
      <div><strong>Lng:</strong> ${lng.toFixed(6)}</div>
    `;

    // Add "Set as Target" button only for non-debug markers
    if (!options.isDebug) {
        const setTargetButton = document.createElement('button');
        setTargetButton.innerText = 'Set as Target';
        setTargetButton.className = 'mt-1 px-2 py-0.5 text-xs bg-blue-500 text-white rounded hover:bg-blue-600';
        setTargetButton.onclick = (e) => {
            e.stopPropagation(); // Prevent map click event if any
            handleSetTarget(lat, lng, marker);
        }
        popupContainer.appendChild(setTargetButton);
    }

    marker.bindPopup(popupContainer, { minWidth: 120 });
    marker.addTo(mapRef.current);

    // Call onMarkerAdd only if it exists and is not a debug marker
    if (!options.isDebug && onMarkerAdd) {
      onMarkerAdd(marker);
    }
    
    return marker;
  }, [onMarkerAdd, handleSetTarget]);

  // --- Debug Point Handling --- (Wrapped in useCallback)
  const addDebugPoint = useCallback(() => {
      if (debugMarkerRef.current && mapRef.current) return; // Already added
    const marker = addMarker(DEBUG_POINT_LAT, DEBUG_POINT_LNG, {
      title: 'Debug Point',
          description: 'Reference for distance calculations',
          isDebug: true
    });
    if (marker) {
      debugMarkerRef.current = marker;
          setIsDebugPointVisible(true);
          if (showDistanceCircles) { addDistanceCircles(); }
      }
  }, [addMarker, showDistanceCircles]);

  const removeDebugPoint = useCallback(() => {
      if (debugMarkerRef.current && mapRef.current) {
          mapRef.current.removeLayer(debugMarkerRef.current);
          debugMarkerRef.current = null;
          setIsDebugPointVisible(false);
          removeDistanceCircles();
          setShowDistanceCircles(false);
      }
  }, []);

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
  const enableMarkerPlacement = () => {
    setIsAddingMarker(true);
  };
  const disableMarkerPlacement = () => {
    setIsAddingMarker(false);
  };
  // --- Manual Marker Placement Logic REFACTORED END ---

  // --- Distance Filter Handlers START ---
  const handleSetPresetFilter = (dist: number | null) => {
      setDistanceFilter(dist);
      setManualDistanceInput(""); // Clear manual input when preset is used (or Show All)
  };

  const handleManualInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setManualDistanceInput(e.target.value);
  };

  const handleApplyManualFilter = () => {
      const manualDist = parseFloat(manualDistanceInput);
      if (!isNaN(manualDist) && manualDist > 0) {
          setDistanceFilter(manualDist); // Apply the manual distance
      } else {
          // Optional: Show an error or reset if input is invalid
          console.warn("Invalid manual distance input");
          // setDistanceFilter(null); // Or keep the previous filter?
      }
  };
  // --- Distance Filter Handlers END ---

  // --- Export to Jump File Logic ---
  const exportToJump = useCallback((settings: {
    sessionName: string;
    view: string;
    camera: string;
    fps: number;
  }, 
  pointsToExport: DrivePoint[] 
  ) => {
    console.log(`Exporting ${pointsToExport.length} points to .jump with settings:`, settings);

    if (!points || points.length === 0) { // Check the original points array for first frame ID
        console.warn("Original points array is empty, cannot determine first frame ID.");
        alert("Cannot export: Original data is missing.");
        return;
    }
    if (!pointsToExport || pointsToExport.length === 0) {
        console.warn("No points provided for jump export.");
        alert("No points were selected for the jump export."); 
        return;
    }

    // Find the very first frame ID from the original, unfiltered data
    const firstFrameId = Math.min(...points.map(p => p.frameId));
    console.log("Using first frame ID for clip calculation:", firstFrameId);

    const jumpFileLines = pointsToExport.map(point => {
        // --- START: Updated Clip Calculation using Math.ceil ---
        const frameDifference = point.frameId - firstFrameId;
        const nonNegativeFrameDiff = Math.max(0, frameDifference); 
        
        const clipRaw = nonNegativeFrameDiff / 60 / settings.fps;
        // Use Math.ceil as requested
        const clipNumber = Math.ceil(clipRaw); 
        const clipFormatted = String(clipNumber).padStart(4, '0');
        // --- END: Updated Clip Calculation ---

        // --- Distance Label Logic (remains the same) ---
        let distanceLabel = 'NoTarget'; 
        let refLat: number | null = null;
        let refLng: number | null = null;
        if (targetObjectPosition) { refLat = targetObjectPosition.lat; refLng = targetObjectPosition.lng; }
        else if (isDebugPointVisible) { refLat = DEBUG_POINT_LAT; refLng = DEBUG_POINT_LNG; }
        if (refLat !== null && refLng !== null) { const distance = calculateDistance(point.lat, point.lng, refLat, refLng); distanceLabel = `${Math.round(distance)}m`; }
        
        // Construct the line
        return `${settings.sessionName}_s001_${settings.view}_s60_${clipFormatted} ${settings.camera} ${point.frameId} ${distanceLabel}`;
    });

    // --- Add Footer Line --- 
    const jumpFileContent = jumpFileLines.join('\n') + '\n#format: trackfile camera frameIDStartFrame tag';

    // Create Blob and Trigger Download
    const blob = new Blob([jumpFileContent], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const safeFilename = settings.sessionName.replace(/[^a-z0-9_.-]/gi, '');
    link.setAttribute('download', `${safeFilename || 'export'}.jump`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    console.log("Jump file export triggered.");

  }, [points, isDebugPointVisible, targetObjectPosition]); // Added original 'points' to dependencies

  // --- UI Rendering ---
  return (
    <div className="space-y-4">
       {/* Controls moved above the map */}
       <div className="flex flex-wrap items-center gap-2 p-2 bg-stone-100 dark:bg-stone-800 rounded shadow">
          {/* View Mode */}
          <Button onClick={toggleViewMode} size="sm">
            {viewMode === 'markers' ? 'Show Route View' : 'Show Marker View'}
          </Button>
          {/* Manual Marker */}
          <Button
            variant={isAddingMarker ? 'destructive' : 'outline'}
            onClick={isAddingMarker ? disableMarkerPlacement : enableMarkerPlacement}
            size="sm"
          >
            {isAddingMarker ? 'Cancel Add Marker' : 'Add Manual Marker'}
          </Button>
          {/* Coord Dialog */}
          <Button variant="outline" onClick={() => setIsCoordinateDialogOpen(true)} size="sm">
            Add Marker by Coords
          </Button>
          {/* Debug Point */}
          {!isDebugPointVisible ? (
             <Button variant="outline" onClick={addDebugPoint} size="sm" className="bg-yellow-100 hover:bg-yellow-200">Add Debug Point</Button>
          ) : (
             <Button variant="outline" onClick={removeDebugPoint} size="sm" className="bg-yellow-100 hover:bg-yellow-200">Remove Debug Point</Button>
          )}
          {/* Clear Target Button */}
          {targetObjectPosition && (
            <Button
              variant="destructive"
              size="sm"
              onClick={clearTarget}
              title={`Target: ${targetObjectPosition.lat.toFixed(4)}, ${targetObjectPosition.lng.toFixed(4)}`}
              className="ml-auto" // Push to right if space allows
            >
              Clear Target Obj
            </Button>
          )}
          {/* Distance Circles */}
          <Button
            variant={showDistanceCircles ? "default" : "outline"}
            size="sm"
            onClick={toggleDistanceCircles}
            disabled={!isDebugPointVisible}
            title={!isDebugPointVisible ? "Add debug point first" : ""}
          >
            {showDistanceCircles ? "Hide Dist Rings" : "Show Dist Rings"}
          </Button>
          {/* Distance Filter Controls */}
          <span className="text-sm font-medium ml-4 border-l pl-2">Filter dist (±{DISTANCE_FILTER_TOLERANCE}m):</span>
          {[10, 20, 30, 50, 100, 200].map(dist => (
            <Button key={dist} variant={distanceFilter === dist ? 'default' : 'outline'} size="sm"
              onClick={() => handleSetPresetFilter(dist)}
              disabled={!isDebugPointVisible} title={!isDebugPointVisible ? "Add debug point first" : `Filter ~${dist}m`} >
              ~{dist}m
            </Button>
          ))}
          <input type="number" value={manualDistanceInput} onChange={handleManualInputChange}
             placeholder="Manual (m)" disabled={!isDebugPointVisible} min="0"
             className="px-2 py-1 border rounded w-24 text-sm h-9 disabled:opacity-50 dark:bg-stone-700 dark:border-stone-600"
             title={!isDebugPointVisible ? "Add debug point first" : ""} />
          <Button variant="secondary" size="sm" onClick={handleApplyManualFilter}
             disabled={!isDebugPointVisible || !manualDistanceInput} title={!isDebugPointVisible ? "Add debug point first" : ""} >
             Filter
          </Button>
          <Button variant={distanceFilter === null ? 'default' : 'outline'} size="sm"
            onClick={() => handleSetPresetFilter(null)} >
            Show All
          </Button>
       </div>

       {/* Map Container */}
       <div ref={mapContainerRef} style={{ height: '70vh', width: '100%' }} className="rounded-lg shadow-md relative z-0" />
      
       {/* Coordinate Dialog (keep it outside the flow) */}
        <CoordinateDialog
          isOpen={isCoordinateDialogOpen}
          onClose={() => setIsCoordinateDialogOpen(false)}
         onSave={(coords) => { addMarker(coords.lat, coords.lng, coords); }}
       />

       {/* Jump Export Dialog */}
       <JumpExportDialog
         isOpen={isJumpExportDialogOpen}
         onClose={() => {
             setIsJumpExportDialogOpen(false);
             setPointsForJumpExport(null); // Clear stored points when closing
         }}
         onSubmit={(settings) => {
           if (pointsForJumpExport) { // Check if points are stored
               exportToJump(settings, pointsForJumpExport); // Pass stored points
           }
           setIsJumpExportDialogOpen(false); // Close dialog on submit
           setPointsForJumpExport(null); // Clear stored points
         }}
       />

       {/* Optional: Speed Legend for Route View */}
      {viewMode === 'route' && (
        <div className="px-4 py-2 bg-stone-100 dark:bg-stone-700 rounded-lg">
           <div className="text-sm font-medium mb-2">Speed Legend (km/h):</div>
           <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
             {[ { color: '#22c55e', label: '< 20' }, { color: '#eab308', label: '20-50' }, { color: '#f97316', label: '50-80' }, { color: '#ef4444', label: '> 80' } ].map(item => (
                <div key={item.label} className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: item.color }}></div>
                  <span className="text-sm">{item.label}</span>
            </div>
             ))}
          </div>
        </div>
      )}
    </div>
  );
} 