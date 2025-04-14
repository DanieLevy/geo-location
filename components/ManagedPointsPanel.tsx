'use client';

import React from 'react';
import L from 'leaflet'; // Needed for marker type in props
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Trash2 as TrashIcon, LocateFixed, CheckCircle } from 'lucide-react';

// Define the ManagedMarker type (can also be imported if moved to types.ts)
interface ObjectMarker {
  id: number;
  marker: L.Marker;
  lat: number;
  lng: number;
  title: string;
  isSelected: boolean;
}

interface ObjectPointsPanelProps {
  objects: ObjectMarker[];
  onRemove: (id: number) => void;
  onSelectObject: (lat: number, lng: number, marker: L.Marker) => void;
  onZoomTo: (lat: number, lng: number) => void;
  currentSelectedId?: number | null;
}

export function ObjectPointsPanel({
  objects,
  onRemove,
  onSelectObject,
  onZoomTo,
  currentSelectedId,
}: ObjectPointsPanelProps) {

  if (objects.length === 0) {
    return (
      <Card className="h-[70vh]">
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-lg">Managed Objects</CardTitle>
        </CardHeader>
        <CardContent className="h-[calc(70vh-80px)] p-0">
          <div className="flex flex-col items-center justify-center h-full text-center text-stone-500 dark:text-stone-400 px-4">
            <MapPin className="w-10 h-10 mb-3 text-stone-400 dark:text-stone-500" />
            <p className="text-sm font-medium mb-1">No objects added yet.</p>
            <p className="text-xs">
              Use controls like "Add Marker", "Coords", or "Set Default Object" to add points.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-[70vh]">
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="text-lg">Managed Objects</CardTitle>
      </CardHeader>
      <CardContent className="h-[calc(70vh-80px)] p-0">
        <ScrollArea className="h-full p-4">
          <div className="space-y-2">
            {objects.map((obj) => (
              <div
                key={obj.id}
                className="flex items-center justify-between gap-2 p-2 border rounded bg-stone-50 dark:bg-stone-700/50 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors cursor-pointer"
                onClick={() => onZoomTo(obj.lat, obj.lng)}
                title={`Click to zoom to: ${obj.title}`}
              >
                {/* Left side: Info */}
                <div className="flex items-center gap-2 overflow-hidden flex-1">
                  <MapPin className={`h-5 w-5 shrink-0 ${obj.isSelected ? 'text-blue-500' : 'text-stone-500'}`} />
                  <div className="flex-1 text-sm overflow-hidden">
                    <p className="font-medium truncate" title={obj.title}>{obj.title}</p>
                    <p className="text-xs text-stone-500 dark:text-stone-400">
                      {obj.lat.toFixed(5)}, {obj.lng.toFixed(5)}
                    </p>
                  </div>
                </div>
                {/* Right side: Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                     variant="ghost" size="icon" className="h-7 w-7"
                     onClick={(e) => { e.stopPropagation(); onSelectObject(obj.lat, obj.lng, obj.marker); }}
                     title="Select as active object for calculations"
                     disabled={obj.isSelected}
                  >
                    {obj.isSelected ? 
                      <CheckCircle className="h-4 w-4 text-blue-500" /> : 
                      <CheckCircle className="h-4 w-4 text-stone-400 hover:text-blue-600" />
                    }
                  </Button>
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700"
                    onClick={(e) => { e.stopPropagation(); onRemove(obj.id); }}
                    title="Remove Object"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
} 