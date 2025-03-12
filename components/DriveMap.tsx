'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';
import { Button } from "@/components/ui/button";

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
}

export default function DriveMap({ points, metadata, onLoadMore }: DriveMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markerClusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'markers' | 'route'>('markers');

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

  // Update map based on view mode
  useEffect(() => {
    if (!mapRef.current || !markerClusterRef.current) return;

    // Clear existing markers and polyline
    markerClusterRef.current.clearLayers();
    if (polylineRef.current) {
      mapRef.current.removeLayer(polylineRef.current);
      polylineRef.current = null;
    }

    if (viewMode === 'markers') {
      // Add markers for each point
      const markers = points.map(point => {
        const marker = L.marker([point.lat, point.lng]);
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
  }, [points, viewMode]);

  // Helper function to get color based on speed
  const getSpeedColor = (speedKmh: number) => {
    // Define speed thresholds and corresponding colors
    if (speedKmh < 20) return '#22c55e';      // Green for slow
    if (speedKmh < 50) return '#eab308';      // Yellow for medium
    if (speedKmh < 80) return '#f97316';      // Orange for fast
    return '#ef4444';                         // Red for very fast
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2 mb-2">
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

      <div 
        ref={mapContainerRef} 
        className="w-full h-[600px] rounded-lg overflow-hidden"
      />
      
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