'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';

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
  const [isLoading, setIsLoading] = useState(false);

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

  useEffect(() => {
    if (!mapRef.current || !markerClusterRef.current) return;

    // Clear existing markers
    markerClusterRef.current.clearLayers();

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

    // Fit bounds if we have points
    if (points.length > 0) {
      const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng]));
      mapRef.current.fitBounds(bounds);
    }
  }, [points]);

  return (
    <div className="space-y-4">
      <div 
        ref={mapContainerRef} 
        className="w-full h-[600px] rounded-lg overflow-hidden"
      />
      
      {metadata && (
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
    </div>
  );
} 