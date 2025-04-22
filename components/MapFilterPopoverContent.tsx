'use client';

import React from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  XIcon, CheckIcon, GaugeIcon
} from 'lucide-react';
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import L from 'leaflet'; // For selectedObjectInfo type

// --- Props Interface --- 
interface MapFilterPopoverContentProps {
  selectedObjectInfo: { marker: L.Marker | null; lat: number | null; lng: number | null };
  distanceFilter: number | null;
  speedFilter: number | null;
  distanceTolerance: number;
  speedTolerance: number;
  manualDistanceInput: string;
  manualSpeedInput: string;
  handleSetPresetFilter: (dist: number | null) => void;
  handleManualInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleApplyManualFilter: () => void;
  handleDistanceToleranceChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSetPresetSpeedFilter: (speed: number | null) => void;
  handleManualSpeedInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleApplyManualSpeedFilter: () => void;
  handleSpeedToleranceChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function MapFilterPopoverContent({ /* Destructure all props */
  selectedObjectInfo, distanceFilter, speedFilter, distanceTolerance,
  speedTolerance, manualDistanceInput, manualSpeedInput, handleSetPresetFilter,
  handleManualInputChange, handleApplyManualFilter, handleDistanceToleranceChange,
  handleSetPresetSpeedFilter, handleManualSpeedInputChange, handleApplyManualSpeedFilter,
  handleSpeedToleranceChange
}: MapFilterPopoverContentProps) {
  return (
    <div className="grid gap-4">
      <div className="space-y-2">
        <h4 className="font-medium leading-none">Filters</h4>
        <p className="text-sm text-muted-foreground">
          Filter points by distance or speed.
        </p>
      </div>
      <Separator />
      {/* Distance Filter Section */}
      <div className="space-y-3 p-1 rounded-md border border-dashed border-stone-300 dark:border-stone-700">
        <Label htmlFor="dist-tolerance" className="text-sm font-medium flex items-center text-stone-700 dark:text-stone-300">Distance Filter (±m)</Label>
        <p className="text-xs text-muted-foreground -mt-2">Requires a selected object.</p>
        <div className="flex items-center gap-2">
          <Input id="dist-tolerance" type="number" value={distanceTolerance} onChange={handleDistanceToleranceChange} min="0" step="0.1" className="flex-1 h-8 text-xs" title="Distance filter tolerance (meters)" disabled={!selectedObjectInfo.marker} />
          <Button variant={distanceFilter === null ? 'secondary' : 'outline'} size="sm" onClick={() => handleSetPresetFilter(null)} disabled={!selectedObjectInfo.marker} title={!selectedObjectInfo.marker ? "Select object first" : "Clear distance filter"} className="h-8 px-2 text-xs"><XIcon className="mr-1 h-3 w-3" /> All</Button>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {[10, 20, 30, 50, 100].map(dist => (<Button key={`dist-pop-${dist}`} variant={distanceFilter === dist ? 'default' : 'outline'} size="sm" onClick={() => handleSetPresetFilter(dist)} disabled={!selectedObjectInfo.marker} title={!selectedObjectInfo.marker ? "Select object first" : `Filter ~${dist}m`} className="text-xs h-7 px-2">~{dist}m</Button>))}
        </div>
        <div className="flex items-center gap-2">
          <Input type="number" value={manualDistanceInput} onChange={handleManualInputChange} placeholder="Manual (m)" disabled={!selectedObjectInfo.marker} min="0" className="flex-1 h-8 text-xs" title={!selectedObjectInfo.marker ? "Select object first" : "Enter distance to filter around"} />
          <Button variant="secondary" size="icon" className="h-8 w-8" onClick={handleApplyManualFilter} disabled={!selectedObjectInfo.marker || !manualDistanceInput} title={!selectedObjectInfo.marker ? "Select object first" : "Apply manual distance filter"} ><CheckIcon className="h-4 w-4" /></Button>
        </div>
      </div>
      {/* Speed Filter Section */}
      <div className="space-y-3 p-1 rounded-md border border-dashed border-stone-300 dark:border-stone-700">
        <Label htmlFor="speed-tolerance" className="text-sm font-medium flex items-center text-stone-700 dark:text-stone-300">Speed Filter (±km/h)</Label>
        <div className="flex items-center gap-2">
          <Input id="speed-tolerance" type="number" value={speedTolerance} onChange={handleSpeedToleranceChange} min="0" step="1" className="flex-1 h-8 text-xs" title="Speed filter tolerance (km/h)" />
          <Button variant={speedFilter === null ? 'secondary' : 'outline'} size="sm" onClick={() => handleSetPresetSpeedFilter(null)} title="Clear speed filter" className="h-8 px-2 text-xs"><XIcon className="mr-1 h-3 w-3" /> All</Button>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {[20, 50, 80, 100].map(speed => (<Button key={`speed-pop-${speed}`} variant={speedFilter === speed ? 'default' : 'outline'} size="sm" onClick={() => handleSetPresetSpeedFilter(speed)} title={`Filter ~${speed} km/h`} className="text-xs h-7 px-2">~{speed}</Button>))}
        </div>
        <div className="flex items-center gap-2">
          <Input type="number" value={manualSpeedInput} onChange={handleManualSpeedInputChange} placeholder="Manual (km/h)" min="0" className="flex-1 h-8 text-xs" title="Enter speed to filter around" />
          <Button variant="secondary" size="icon" className="h-8 w-8" onClick={handleApplyManualSpeedFilter} disabled={!manualSpeedInput} title="Apply manual speed filter" ><CheckIcon className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
  );
} 