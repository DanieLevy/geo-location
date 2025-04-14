'use client';

import React from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MapIcon, PlusIcon, FilterIcon, XIcon, CheckIcon, GaugeIcon,
  PlusCircle, MapPin, PinOff, CircleIcon
} from 'lucide-react';
import { Separator } from "@/components/ui/separator";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import L from 'leaflet'; // Import Leaflet type for Marker

// Import the new popover content component
import { MapFilterPopoverContent } from './MapFilterPopoverContent';

// --- Props Interface --- 
interface MapControlsProps {
  viewMode: 'markers' | 'route';
  isAddingMarker: boolean;
  selectedObjectInfo: { marker: L.Marker | null; lat: number | null; lng: number | null };
  distanceFilter: number | null;
  speedFilter: number | null;
  distanceTolerance: number;
  speedTolerance: number;
  manualDistanceInput: string;
  manualSpeedInput: string;
  showDistanceCircles: boolean;
  isFilterPopoverOpen: boolean;
  toggleViewMode: () => void;
  enableMarkerPlacement: () => void;
  disableMarkerPlacement: () => void;
  setIsCoordinateDialogOpen: (isOpen: boolean) => void;
  addDefaultObject: () => void;
  clearSelectedObject: () => void;
  toggleDistanceCircles: () => void;
  handleSetPresetFilter: (dist: number | null) => void;
  handleManualInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleApplyManualFilter: () => void;
  handleDistanceToleranceChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSetPresetSpeedFilter: (speed: number | null) => void;
  handleManualSpeedInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleApplyManualSpeedFilter: () => void;
  handleSpeedToleranceChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  setIsFilterPopoverOpen: (isOpen: boolean) => void;
}

export function MapControls({
  viewMode, isAddingMarker, selectedObjectInfo, distanceFilter, speedFilter,
  distanceTolerance, speedTolerance, manualDistanceInput, manualSpeedInput,
  showDistanceCircles, isFilterPopoverOpen, toggleViewMode, enableMarkerPlacement,
  disableMarkerPlacement, setIsCoordinateDialogOpen, addDefaultObject, clearSelectedObject,
  toggleDistanceCircles, handleSetPresetFilter, handleManualInputChange, handleApplyManualFilter,
  handleDistanceToleranceChange, handleSetPresetSpeedFilter, handleManualSpeedInputChange,
  handleApplyManualSpeedFilter, handleSpeedToleranceChange, setIsFilterPopoverOpen
}: MapControlsProps) {
  return (
    <div className="flex-shrink-0 flex flex-wrap items-center gap-2 p-2 bg-stone-100 dark:bg-stone-800 rounded-lg shadow">
      {/* View Mode Button */}
      <Button onClick={toggleViewMode} size="icon" variant="outline" title={viewMode === 'markers' ? 'Switch to Route View' : 'Switch to Marker View'}>
        <MapIcon className="h-5 w-5" />
      </Button>

      {/* Add Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" title="Add Marker/Object" className={isAddingMarker ? 'ring-2 ring-blue-500' : ''}>
            <PlusIcon className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onClick={enableMarkerPlacement} disabled={isAddingMarker}>
            <PlusCircle className="mr-2 h-4 w-4" /> Place Manually {isAddingMarker ? '(Active)' : ''}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setIsCoordinateDialogOpen(true)}>
            <MapPin className="mr-2 h-4 w-4" /> Add by Coords
          </DropdownMenuItem>
          {isAddingMarker && (
            <DropdownMenuItem onClick={disableMarkerPlacement} className="text-red-600 focus:text-red-700 focus:bg-red-50 dark:focus:bg-red-900/20"><XIcon className="mr-2 h-4 w-4" /> Cancel Placement</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Separator */}
      <Separator orientation="vertical" className="h-6" />

      {/* Default Object / Clear Selection Button */}
      {!selectedObjectInfo.marker ? (
        <Button variant="outline" onClick={addDefaultObject} size="sm" className="bg-yellow-100 hover:bg-yellow-200 dark:bg-yellow-800/50 dark:hover:bg-yellow-700/60" title="Set Default Calculation Object">
          <MapPin className="mr-2 h-4 w-4" /> Set Default
        </Button>
      ) : (
        <Button variant="outline" onClick={clearSelectedObject} size="sm" className="bg-yellow-100 hover:bg-yellow-200 dark:bg-yellow-800/50 dark:hover:bg-yellow-700/60" title={`Clear Selected Object (${selectedObjectInfo.lat?.toFixed(4)}, ${selectedObjectInfo.lng?.toFixed(4)})`}>
          <PinOff className="mr-2 h-4 w-4" /> Clear Selection
        </Button>
      )}

      {/* Distance Rings Button */}
      <Button variant={showDistanceCircles ? "secondary" : "outline"} size="icon" onClick={toggleDistanceCircles} disabled={!selectedObjectInfo.marker} title={!selectedObjectInfo.marker ? "Select an object first" : (showDistanceCircles ? "Hide Distance Rings" : "Show Distance Rings")}>
        <CircleIcon className="h-5 w-5" />
      </Button>

      {/* Separator */}
      <Separator orientation="vertical" className="h-6" />

      {/* Filter Section (Popover Trigger + Active Filter Display) */}
      <div className="flex items-center gap-2">
        {/* Filter Popover Trigger */}
        <Popover open={isFilterPopoverOpen} onOpenChange={setIsFilterPopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon" title="Filter Data Points" className={cn((distanceFilter !== null || speedFilter !== null) && 'ring-2 ring-blue-500')}>
              <FilterIcon className={cn("h-5 w-5", (distanceFilter !== null || speedFilter !== null) && 'text-blue-600 dark:text-blue-400')} />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80">
            {/* --- Render the extracted Popover Content --- */}
            <MapFilterPopoverContent 
              selectedObjectInfo={selectedObjectInfo}
              distanceFilter={distanceFilter}
              speedFilter={speedFilter}
              distanceTolerance={distanceTolerance}
              speedTolerance={speedTolerance}
              manualDistanceInput={manualDistanceInput}
              manualSpeedInput={manualSpeedInput}
              handleSetPresetFilter={handleSetPresetFilter}
              handleManualInputChange={handleManualInputChange}
              handleApplyManualFilter={handleApplyManualFilter}
              handleDistanceToleranceChange={handleDistanceToleranceChange}
              handleSetPresetSpeedFilter={handleSetPresetSpeedFilter}
              handleManualSpeedInputChange={handleManualSpeedInputChange}
              handleApplyManualSpeedFilter={handleApplyManualSpeedFilter}
              handleSpeedToleranceChange={handleSpeedToleranceChange}
            />
          </PopoverContent>
        </Popover>

        {/* Active Filters Display */}
        <div className="flex items-center gap-1">
          {distanceFilter !== null && (
            <Badge variant="secondary" className="text-xs px-1.5 py-0.5 font-normal" title={`Distance Filter: ~${distanceFilter}m (±${distanceTolerance}m)`}>
              Dist: ~{distanceFilter}m
            </Badge>
          )}
          {speedFilter !== null && (
            <Badge variant="secondary" className="text-xs px-1.5 py-0.5 font-normal" title={`Speed Filter: ~${speedFilter}km/h (±${speedTolerance}km/h)`}>
              Spd: ~{speedFilter}km/h
            </Badge>
          )}
        </div>
      </div>
      {/* --- End Filter Section --- */}
    </div>
  );
} 