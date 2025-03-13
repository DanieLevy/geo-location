'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';
import { Button } from "@/components/ui/button";
import { CoordinateDialog } from "@/components/ui/CoordinateDialog";

// Constants for debug point
const DEBUG_POINT_LAT = 31.327642333333333;
const DEBUG_POINT_LNG = 35.38836366666666;

interface DrivePoint {
  frameId: number;
  lat: number;
  lng: number;
  altitude?: number;
  speed: {
    ms: number;  // Speed in meters per second
    kmh: number; // Speed in kilometers per hour
  };
  timestamp?: string;
}

interface DriveMapProps {
  points: DrivePoint[];
  metadata?: {
    totalPoints: number;
    currentPage: number;
    totalPages: number;
    isSampled: boolean;
  };
  onLoadMore?: () => void;
  onMarkerAdd?: (marker: L.Marker) => void;
}

export default function DriveMap({ points, metadata, onLoadMore, onMarkerAdd }: DriveMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markerClusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const routeElementsRef = useRef<(L.Polyline | L.Marker)[]>([]);
  const debugMarkerRef = useRef<L.Marker | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingAll, setIsLoadingAll] = useState(false);
  const [viewMode, setViewMode] = useState<'markers' | 'route'>('markers');
  const [isAddingMarker, setIsAddingMarker] = useState(false);
  const [isCoordinateDialogOpen, setIsCoordinateDialogOpen] = useState(false);
  const [distanceFilter, setDistanceFilter] = useState<number | null>(null);
  const [showDistanceCircles, setShowDistanceCircles] = useState(false);
  const distanceCirclesRef = useRef<L.Circle[]>([]);
  const [accumulatedPoints, setAccumulatedPoints] = useState<DrivePoint[]>([]);
  const [showAccumulatedPoints, setShowAccumulatedPoints] = useState(true);
  const loadingAllPagesRef = useRef<boolean>(false);
  const lastPageLoadedRef = useRef<number>(0);
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadedFrameIds, setLoadedFrameIds] = useState<number>(0);
  const [totalFrameIds, setTotalFrameIds] = useState<number>(0);

  // Accumulate points when they change
  useEffect(() => {
    if (metadata?.currentPage === 1 || !showAccumulatedPoints) {
      // Reset accumulated points when on first page or when not showing accumulated points
      setAccumulatedPoints(points);
      lastPageLoadedRef.current = metadata?.currentPage || 1;
      
      // Update frame ID counts
      setLoadedFrameIds(points.length);
    } else {
      // Add new points to existing ones, avoiding duplicates by frameId
      const existingFrameIds = new Set(accumulatedPoints.map(p => p.frameId));
      const newPoints = points.filter(point => !existingFrameIds.has(point.frameId));
      setAccumulatedPoints(prev => [...prev, ...newPoints]);
      
      // Update loaded frame ID count with unique frames
      setLoadedFrameIds(prev => prev + newPoints.length);
      
      // Update the last page loaded reference
      if (metadata?.currentPage) {
        lastPageLoadedRef.current = metadata.currentPage;
        
        // Update loading progress
        if (loadingAllPagesRef.current && metadata.totalPages > 0) {
          const progress = Math.round((metadata.currentPage / metadata.totalPages) * 100);
          setLoadingProgress(progress);
        }
        
        // Continue loading all pages if we're in that mode
        if (loadingAllPagesRef.current && metadata.currentPage < metadata.totalPages) {
          // Clear any existing timeout
          if (loadingTimeoutRef.current) {
            clearTimeout(loadingTimeoutRef.current);
          }
          
          // Use setTimeout to avoid blocking the UI and give time for rendering and data processing
          loadingTimeoutRef.current = setTimeout(() => {
            console.log('Loading next page:', metadata.currentPage + 1);
            handleLoadMore();
          }, 1000); // Increased timeout to 1 second to ensure proper loading
        } else if (loadingAllPagesRef.current && metadata.currentPage >= metadata.totalPages) {
          // We've loaded all pages, stop the loading all mode
          loadingAllPagesRef.current = false;
          setIsLoadingAll(false);
          console.log('Finished loading all pages');
        }
      }
    }

    // Reset loading state when new points are received
    setIsLoading(false);
  }, [points, metadata?.currentPage, showAccumulatedPoints]);

  // Update total frame IDs count when metadata changes
  useEffect(() => {
    if (metadata?.totalPoints) {
      setTotalFrameIds(metadata.totalPoints);
    }
  }, [metadata?.totalPoints]);

  // Clean up timeouts on unmount
  useEffect(() => {
    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, []);

  // Calculate distance in meters between two points using Haversine formula
  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    if (!mapRef.current) return 0;
    const point1 = L.latLng(lat1, lng1);
    const point2 = L.latLng(lat2, lng2);
    return point1.distanceTo(point2);
  };

  // Function to add distance circles around debug point
  const addDistanceCircles = () => {
    if (!mapRef.current || !debugMarkerRef.current) return;
    
    // Clear existing circles
    distanceCirclesRef.current.forEach(circle => {
      if (mapRef.current) mapRef.current.removeLayer(circle);
    });
    distanceCirclesRef.current = [];
    
    // Add new circles for each distance
    const distances = [50, 100, 150, 200];
    const colors = ['#3388ff', '#33cc33', '#ffcc00', '#ff3333'];
    
    distances.forEach((distance, index) => {
      const circle = L.circle([DEBUG_POINT_LAT, DEBUG_POINT_LNG], {
        radius: distance,
        color: colors[index],
        fillColor: colors[index],
        fillOpacity: 0.1,
        weight: 2
      }).addTo(mapRef.current!);
      
      circle.bindTooltip(`${distance}m`);
      distanceCirclesRef.current.push(circle);
    });
  };

  // Function to remove distance circles
  const removeDistanceCircles = () => {
    distanceCirclesRef.current.forEach(circle => {
      if (mapRef.current) mapRef.current.removeLayer(circle);
    });
    distanceCirclesRef.current = [];
  };

  // Toggle distance circles
  const toggleDistanceCircles = () => {
    if (showDistanceCircles) {
      removeDistanceCircles();
      setShowDistanceCircles(false);
    } else {
      addDistanceCircles();
      setShowDistanceCircles(true);
    }
  };

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
    
    // Get boundaries of the cluster for naming
    const bounds = cluster.getBounds();
    const center = bounds.getCenter();
    
    // Extract DrivePoint data from each marker
    const extractedData = markers.map(marker => {
      // Get the original DrivePoint data
      const point = (marker as any)._drivePointData as DrivePoint;
      
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
      
      return {
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
    if (extractedData.length > 0 && extractedData[0].date) {
      extractedData.sort((a, b) => {
        if (!a.date || !a.time) return 1;
        if (!b.date || !b.time) return -1;
        const dateA = new Date(`${a.date} ${a.time}`);
        const dateB = new Date(`${b.date} ${b.time}`);
        return dateA.getTime() - dateB.getTime();
      });
    }
    
    return extractedData;
  };

  // Initialize map with cluster right-click handler
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
      
      // Create context menu with filename input
      const contextMenu = L.popup({
        closeButton: true,
        className: 'cluster-context-menu'
      })
        .setLatLng(e.latlng)
        .setContent(`
          <div class="p-2">
            <p class="mb-2 font-semibold">Cluster contains ${markerCount} markers</p>
            <div class="mb-2">
              <label for="csv-filename" class="block text-sm mb-1">Filename:</label>
              <input 
                type="text" 
                id="csv-filename" 
                value="map-data" 
                class="px-2 py-1 border rounded w-full text-sm"
              />
            </div>
            <button id="export-csv-btn" class="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600">
              Export to CSV
            </button>
          </div>
        `)
        .openOn(mapRef.current!);
      
      // Add event listener to the export button
      setTimeout(() => {
        const exportBtn = document.getElementById('export-csv-btn');
        const filenameInput = document.getElementById('csv-filename') as HTMLInputElement;
        
        if (exportBtn && filenameInput) {
          exportBtn.addEventListener('click', () => {
            const data = prepareMarkerDataForExport(cluster);
            if (data && data.length > 0) {
              // Get filename from input, with fallback
              let filename = filenameInput.value.trim();
              
              // Validate filename
              if (!filename) {
                filename = 'map-data';
              }
              
              // Ensure it has .csv extension
              if (!filename.endsWith('.csv')) {
                filename += '.csv';
              }
              
              exportToCsv(data, filename);
              contextMenu.close();
            }
          });
        }
      }, 100);
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

  // Function to clear all route elements
  const clearRouteElements = () => {
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
  };

  // Update map based on view mode and distance filter
  useEffect(() => {
    if (!mapRef.current || !markerClusterRef.current) return;

    // Clear existing markers and polyline
    markerClusterRef.current.clearLayers();
    clearRouteElements();

    // Use accumulated points if showing accumulated points, otherwise use current page points
    const displayPoints = showAccumulatedPoints ? accumulatedPoints : points;

    if (viewMode === 'markers') {
      // Filter points based on distance if a filter is applied
      let filteredPoints = displayPoints;
      
      if (distanceFilter !== null && debugMarkerRef.current) {
        // Apply band filtering (±3m from the target distance)
        const tolerance = 3; // 3 meters tolerance
        filteredPoints = displayPoints.filter(point => {
          const distance = calculateDistance(
            point.lat, 
            point.lng, 
            DEBUG_POINT_LAT, 
            DEBUG_POINT_LNG
          );
          return Math.abs(distance - distanceFilter) <= tolerance;
        });
      }

      // Add markers for each filtered point
      const markers = filteredPoints.map(point => {
        const marker = L.marker([point.lat, point.lng]);
        
        // Attach the original data to the marker for later export
        (marker as any)._drivePointData = point;
        
        // Calculate distance from debug point if it exists
        let distanceInfo = '';
        if (debugMarkerRef.current) {
          const distance = calculateDistance(
            point.lat, 
            point.lng, 
            DEBUG_POINT_LAT, 
            DEBUG_POINT_LNG
          );
          distanceInfo = `<div><strong>Distance from marker:</strong> ${distance.toFixed(2)}m</div>`;
        }
        
        const popupContent = `
          <div class="p-2">
            <div><strong>Frame ID:</strong> ${point.frameId}</div>
            ${point.altitude ? `<div><strong>Altitude:</strong> ${point.altitude.toFixed(2)}m</div>` : ''}
            <div><strong>Speed:</strong>
              <div class="pl-2 text-sm">
                ${point.speed.ms.toFixed(2)} m/s<br>
                ${point.speed.kmh.toFixed(2)} km/h
              </div>
            </div>
            ${distanceInfo}
            ${point.timestamp ? `<div><strong>Time:</strong> ${new Date(point.timestamp).toLocaleString()}</div>` : ''}
          </div>
        `;
        marker.bindPopup(popupContent);
        return marker;
      });

      markerClusterRef.current.addLayers(markers);
    } else {
      // Create route visualization with accumulated points for better continuity
      const pointsToUse = showAccumulatedPoints ? accumulatedPoints : points;
      const sampledPoints = samplePointsForRoute(pointsToUse);
      const routeCoordinates = sampledPoints.map(p => [p.lat, p.lng] as [number, number]);
      
      if (routeCoordinates.length > 0) {
        // Create gradient polyline based on speed
        const segments = routeCoordinates.slice(1).map((coord, i) => {
          const speed = sampledPoints[i + 1].speed.kmh;
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

    // Fit bounds if we have points
    if (displayPoints.length > 0) {
      const bounds = L.latLngBounds(displayPoints.map(p => [p.lat, p.lng]));
      mapRef.current.fitBounds(bounds);
    }
  }, [accumulatedPoints, points, viewMode, distanceFilter, showAccumulatedPoints]);

  // Helper function to get color based on speed
  const getSpeedColor = (speedKmh: number) => {
    // Define speed thresholds and corresponding colors
    if (speedKmh < 20) return '#22c55e';      // Green for slow
    if (speedKmh < 50) return '#eab308';      // Yellow for medium
    if (speedKmh < 80) return '#f97316';      // Orange for fast
    return '#ef4444';                         // Red for very fast
  };

  // Function to add a marker at specific coordinates
  const addMarker = (lat: number, lng: number, options: { title?: string; description?: string } = {}) => {
    if (!mapRef.current) return null;

    const marker = L.marker([lat, lng]);
    
    // Create popup content
    const popupContent = `
      <div class="p-2">
        ${options.title ? `<div><strong>Title:</strong> ${options.title}</div>` : ''}
        ${options.description ? `<div><strong>Description:</strong> ${options.description}</div>` : ''}
        <div><strong>Coordinates:</strong> ${lat.toFixed(6)}, ${lng.toFixed(6)}</div>
      </div>
    `;
    
    marker.bindPopup(popupContent);
    marker.addTo(mapRef.current);
    
    // Notify parent component about the new marker
    if (onMarkerAdd) {
      onMarkerAdd(marker);
    }
    
    return marker;
  };

  // Function to enable marker placement mode
  const enableMarkerPlacement = () => {
    if (!mapRef.current) return;
    
    setIsAddingMarker(true);
    
    const clickHandler = (e: L.LeafletMouseEvent) => {
      if (isAddingMarker) {
        addMarker(e.latlng.lat, e.latlng.lng);
        setIsAddingMarker(false);
        mapRef.current?.off('click', clickHandler);
      }
    };
    
    mapRef.current.on('click', clickHandler);
  };

  // Function to handle coordinate dialog save
  const handleCoordinateSave = ({ lat, lng, title, description }: { lat: number; lng: number; title?: string; description?: string }) => {
    addMarker(lat, lng, { title, description });
  };

  // Function to add debug point
  const addDebugPoint = () => {
    if (debugMarkerRef.current && mapRef.current) {
      mapRef.current.removeLayer(debugMarkerRef.current);
    }

    const marker = addMarker(DEBUG_POINT_LAT, DEBUG_POINT_LNG, {
      title: 'Debug Point',
      description: 'Central reference point for distance calculations'
    });

    if (marker) {
      debugMarkerRef.current = marker;
      
      // If circles were visible, redraw them
      if (showDistanceCircles) {
        addDistanceCircles();
      }
    }
  };

  // Reset distance filter
  const resetFilter = () => {
    setDistanceFilter(null);
  };

  // Function to handle loading more points with improved page handling
  const handleLoadMore = () => {
    if (!isLoading && onLoadMore) {
      setIsLoading(true);
      
      // Capture current page for logging
      const currentPage = metadata?.currentPage || 0;
      console.log('Starting to load page:', currentPage + 1);
      
      // Call the actual load more function
      onLoadMore();
      
      // Add a safety timeout to reset loading state if it gets stuck
      setTimeout(() => {
        if (isLoading) {
          console.log('Timeout reached for page load, resetting loading state');
          setIsLoading(false);
          
          // If we're loading all pages, we need to retry or stop
          if (loadingAllPagesRef.current) {
            // Try again once more
            handleLoadAllPages();
          }
        }
      }, 5000); // 5 second timeout
    }
  };

  // Function to start loading all pages sequentially
  const handleLoadAllPages = () => {
    if (!metadata || isLoadingAll) return;
    
    // Cancel any existing loading
    if (isLoading) {
      setIsLoading(false);
    }
    
    console.log('Starting to load all pages');
    setIsLoadingAll(true);
    loadingAllPagesRef.current = true;
    
    // Make sure we're showing accumulated points
    setShowAccumulatedPoints(true);
    
    // Initialize progress
    setLoadingProgress(
      metadata.totalPages > 0 
        ? Math.round((metadata.currentPage / metadata.totalPages) * 100) 
        : 0
    );
    
    // Start loading if we're not on the last page already
    if (metadata.currentPage < metadata.totalPages) {
      // Small delay before starting to ensure state is updated
      setTimeout(() => {
        handleLoadMore();
      }, 50);
    } else {
      // Already on the last page
      console.log('Already on the last page');
      setIsLoadingAll(false);
      loadingAllPagesRef.current = false;
    }
  };

  // Update the Load All At Once function to ensure it overrides any existing loading processes
  const handleLoadAllAtOnce = () => {
    if (!metadata || !onLoadMore) return;
    
    console.log('Loading all data at once');
    
    // Cancel any existing loading operations
    if (isLoading) {
      setIsLoading(false);
    }
    
    if (isLoadingAll) {
      setIsLoadingAll(false);
      loadingAllPagesRef.current = false;
    }
    
    // Clear any existing timeouts
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }
    
    // Show loading indicator
    setIsLoading(true);
    
    // Make sure we're showing accumulated points
    setShowAccumulatedPoints(true);
    
    // Create a special flag for the parent component
    // This uses a custom event to signal that we want all pages at once
    const loadAllEvent = new CustomEvent('loadAllFrameIdsAtOnce', {
      detail: { 
        totalPages: metadata.totalPages 
      }
    });
    document.dispatchEvent(loadAllEvent);
    
    // Call onLoadMore with a special flag
    // The parent component needs to check for this flag and load all pages at once
    try {
      // We're reusing onLoadMore but the parent component needs to 
      // handle this special case differently (loading all pages at once)
      (window as any).loadAllPagesAtOnce = true;
      onLoadMore();
    } catch (error) {
      console.error('Error loading all data at once:', error);
      setIsLoading(false);
    }
    
    // Safety timeout - reset loading state after 10 seconds if still loading
    setTimeout(() => {
      if (isLoading) {
        console.log('Timeout reached for loading all data, resetting loading state');
        setIsLoading(false);
      }
    }, 10000);
  };

  // Function to toggle between showing accumulated points and current page only
  const toggleAccumulatedPoints = () => {
    setShowAccumulatedPoints(prev => !prev);
  };

  // Reset accumulated points to current page only
  const resetAccumulatedPoints = () => {
    setAccumulatedPoints(points);
  };

  return (
    <div className="space-y-4 relative">
      <div className="flex justify-between flex-wrap gap-2 mb-2">
        <div className="flex gap-2">
          <Button
            variant={viewMode === 'markers' ? 'default' : 'outline'}
            onClick={() => setViewMode('markers')}
            size="sm"
          >
            Show Markers
          </Button>
          <Button
            variant={viewMode === 'route' ? 'default' : 'outline'}
            onClick={() => setViewMode('route')}
            size="sm"
          >
            Show Route
          </Button>
        </div>
        
        <div className="flex gap-2">
          <Button
            variant={isAddingMarker ? 'default' : 'outline'}
            onClick={enableMarkerPlacement}
            size="sm"
          >
            {isAddingMarker ? 'Click on map to place marker' : 'Add Marker'}
          </Button>
          <Button
            variant="outline"
            onClick={() => setIsCoordinateDialogOpen(true)}
            size="sm"
          >
            Add by Coordinates
          </Button>
          <Button
            variant="outline"
            onClick={addDebugPoint}
            size="sm"
            className="bg-yellow-100 hover:bg-yellow-200"
          >
            Add Debug Point
          </Button>
        </div>
      </div>
      
      {/* Distance filtering controls */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="text-sm font-medium">Filter frame IDs at distance (±3m):</span>
        <Button 
          variant={distanceFilter === 50 ? "default" : "outline"} 
          size="sm" 
          onClick={() => setDistanceFilter(50)}
        >
          50m (47-53m)
        </Button>
        <Button 
          variant={distanceFilter === 100 ? "default" : "outline"} 
          size="sm" 
          onClick={() => setDistanceFilter(100)}
        >
          100m (97-103m)
        </Button>
        <Button 
          variant={distanceFilter === 150 ? "default" : "outline"} 
          size="sm" 
          onClick={() => setDistanceFilter(150)}
        >
          150m (147-153m)
        </Button>
        <Button 
          variant={distanceFilter === 200 ? "default" : "outline"} 
          size="sm" 
          onClick={() => setDistanceFilter(200)}
        >
          200m (197-203m)
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={resetFilter}
        >
          Show All
        </Button>
        <Button 
          variant={showDistanceCircles ? "default" : "outline"} 
          size="sm" 
          onClick={toggleDistanceCircles}
        >
          {showDistanceCircles ? "Hide Distance Rings" : "Show Distance Rings"}
        </Button>

        <Button 
          variant={showAccumulatedPoints ? "default" : "outline"} 
          size="sm" 
          onClick={toggleAccumulatedPoints}
          className="ml-4 bg-blue-100 hover:bg-blue-200"
        >
          {showAccumulatedPoints ? "Showing All Pages" : "Show Current Page Only"}
        </Button>

        {showAccumulatedPoints && metadata?.currentPage && metadata.currentPage > 1 && (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={resetAccumulatedPoints}
            className="bg-gray-100 hover:bg-gray-200"
          >
            Reset to Current Page
          </Button>
        )}
      </div>

      <div 
        ref={mapContainerRef} 
        className="w-full h-[600px] rounded-lg overflow-hidden relative z-0"
      />
      
      <div className="relative z-50">
        <CoordinateDialog
          isOpen={isCoordinateDialogOpen}
          onClose={() => setIsCoordinateDialogOpen(false)}
          onSave={handleCoordinateSave}
        />
      </div>
      
      {metadata && viewMode === 'markers' && (
        <div className="flex justify-between items-center px-4 py-2 bg-stone-100 dark:bg-stone-700 rounded-lg">
          <div className="text-sm text-stone-600 dark:text-stone-300">
            {metadata.isSampled ? (
              <span>Showing sampled data points for better performance</span>
            ) : (
              <div className="flex flex-col gap-1">
                <span>
                  Page {metadata.currentPage} of {metadata.totalPages}
                </span>
                <span className="font-medium text-blue-600 dark:text-blue-400">
                  Loaded {loadedFrameIds.toLocaleString()} of {totalFrameIds.toLocaleString()} frame IDs ({Math.round((loadedFrameIds / totalFrameIds) * 100) || 0}%)
                </span>
                {showAccumulatedPoints && metadata.currentPage > 1 && (
                  <span className="text-xs text-green-600 dark:text-green-400">
                    Showing accumulated points from pages 1-{metadata.currentPage}
                  </span>
                )}
                {isLoadingAll && (
                  <span className="text-xs text-blue-600 dark:text-blue-400 animate-pulse">
                    Loading all pages... ({loadingProgress}%)
                  </span>
                )}
              </div>
            )}
          </div>
          
          <div className="flex gap-2">
            {!metadata.isSampled && metadata.currentPage < metadata.totalPages && (
              <>
                <button
                  onClick={handleLoadMore}
                  disabled={isLoading || isLoadingAll}
                  className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
                >
                  {isLoading && !isLoadingAll ? 'Loading...' : 'Load More Points'}
                </button>
                
                <button
                  onClick={handleLoadAllPages}
                  disabled={isLoading || isLoadingAll || metadata.currentPage === metadata.totalPages}
                  className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:opacity-50"
                >
                  {isLoadingAll 
                    ? `Loading ${metadata.currentPage}/${metadata.totalPages} (${loadingProgress}%)` 
                    : 'Load All Pages'}
                </button>
                
                <button
                  onClick={handleLoadAllAtOnce}
                  disabled={isLoading || isLoadingAll}
                  className="px-4 py-2 bg-purple-500 text-white rounded-md hover:bg-purple-600 disabled:opacity-50"
                >
                  Load All At Once
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Add a floating indicator that's always visible */}
      <div className="fixed bottom-4 right-4 bg-white dark:bg-gray-800 p-2 rounded-lg shadow-lg z-50 text-sm border border-gray-200 dark:border-gray-700">
        <div className="font-semibold">Frame IDs Loaded</div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-full bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-500 dark:bg-blue-400 transition-all duration-300" 
              style={{ width: `${Math.min(100, Math.round((loadedFrameIds / totalFrameIds) * 100) || 0)}%` }}
            />
          </div>
          <span className="whitespace-nowrap">
            {loadedFrameIds.toLocaleString()} / {totalFrameIds.toLocaleString()}
          </span>
        </div>
      </div>

      {viewMode === 'route' && (
        <div className="px-4 py-2 bg-stone-100 dark:bg-stone-700 rounded-lg">
          <div className="text-sm font-medium mb-2">Speed Legend:</div>
          <div className="grid grid-cols-4 gap-4">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#22c55e' }}></div>
              <span className="text-sm">&lt; 20 km/h</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#eab308' }}></div>
              <span className="text-sm">20-50 km/h</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#f97316' }}></div>
              <span className="text-sm">50-80 km/h</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#ef4444' }}></div>
              <span className="text-sm">&gt; 80 km/h</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 