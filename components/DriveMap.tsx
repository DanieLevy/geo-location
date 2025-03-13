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
  const debugMarkerRef = useRef<L.Marker | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'markers' | 'route'>('markers');
  const [isAddingMarker, setIsAddingMarker] = useState(false);
  const [isCoordinateDialogOpen, setIsCoordinateDialogOpen] = useState(false);
  const [distanceFilter, setDistanceFilter] = useState<number | null>(null);
  const [showDistanceCircles, setShowDistanceCircles] = useState(false);
  const distanceCirclesRef = useRef<L.Circle[]>([]);

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

    mapRef.current.addLayer(markerClusterRef.current);

    // Clean up on unmount
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update map based on view mode and distance filter
  useEffect(() => {
    if (!mapRef.current || !markerClusterRef.current) return;

    // Clear existing markers and polyline
    markerClusterRef.current.clearLayers();
    if (polylineRef.current) {
      mapRef.current.removeLayer(polylineRef.current);
      polylineRef.current = null;
    }

    if (viewMode === 'markers') {
      // Filter points based on distance if a filter is applied
      let filteredPoints = points;
      
      if (distanceFilter !== null && debugMarkerRef.current) {
        // Apply band filtering (±3m from the target distance)
        const tolerance = 3; // 3 meters tolerance
        filteredPoints = points.filter(point => {
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
      // Create route visualization
      const sampledPoints = samplePointsForRoute(points);
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

        const endMarker = L.marker(routeCoordinates[routeCoordinates.length - 1], {
          icon: L.divIcon({
            className: 'custom-div-icon',
            html: '<div style="background-color: #ef4444; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>',
            iconSize: [12, 12],
          })
        }).addTo(mapRef.current);
        endMarker.bindPopup('End Point');
      }
    }

    // Fit bounds if we have points
    if (points.length > 0) {
      const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng]));
      mapRef.current.fitBounds(bounds);
    }
  }, [points, viewMode, distanceFilter]);

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
              <span>
                Showing page {metadata.currentPage} of {metadata.totalPages}
              </span>
            )}
          </div>
          
          {!metadata.isSampled && metadata.currentPage < metadata.totalPages && (
            <button
              onClick={() => {
                if (!isLoading && onLoadMore) {
                  setIsLoading(true);
                  onLoadMore();
                }
              }}
              disabled={isLoading}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
            >
              {isLoading ? 'Loading...' : 'Load More Points'}
            </button>
          )}
        </div>
      )}

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