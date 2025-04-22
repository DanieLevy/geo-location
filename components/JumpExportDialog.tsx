import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose, // Import DialogClose
} from '@/components/ui/dialog'; // Assuming Dialog is here
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"; // Import Accordion
import { ScrollArea } from "@/components/ui/scroll-area"; // Import ScrollArea for potentially long lists

// Type for settings for a single file
interface SingleFileJumpSettings {
  sessionName: string;
  view: string;
  camera: string;
  fps: number;
  secondsPerClip?: number; // New: Allow configuration of seconds per clip
  startingClipNumber?: number; // New: Allow configuration of starting clip number
  customFilename?: string; // New: Allow a custom filename for the .jump file
}

// Type for settings per file
type SettingsPerFile = Record<string, SingleFileJumpSettings>;

interface JumpExportDialogProps {
  isOpen: boolean;
  sourceFiles: string[]; // List of source files involved
  onClose: () => void;
  // Updated onSubmit signature
  onSubmit: (settings: SettingsPerFile) => void;
  distanceFilter: number | null; // Add distance filter information
}

const DEFAULT_VIEW = 's_AllSensors';
const DEFAULT_CAMERA = 'main';
const DEFAULT_FPS = 30;
const DEFAULT_SECONDS_PER_CLIP = 60; // Default is 60 seconds per clip
const DEFAULT_STARTING_CLIP = 1; // Default starting clip number

export function JumpExportDialog({
  isOpen,
  sourceFiles,
  onClose,
  onSubmit,
  distanceFilter = null, // Default to null if not provided
}: JumpExportDialogProps) {
  
  // State to hold settings for each file
  const [settingsPerFile, setSettingsPerFile] = useState<SettingsPerFile>({});
  const [error, setError] = useState<string | null>(null);

  // Initialize or update state when sourceFiles or isOpen changes
  useEffect(() => {
    if (isOpen && sourceFiles.length > 0) {
       const initialSettings: SettingsPerFile = {};
       sourceFiles.forEach(filename => {
         // Pre-fill sessionName based on filename (removing extension)
         let suggestedSessionName = filename.replace(/\.csv$/i, '');
         
         // Remove _s_AllSensors from the session name if present
         suggestedSessionName = suggestedSessionName.replace(/_s_AllSensors$/i, '');
         
         // Add distance filter suffix to the filename if a filter is applied
         const distanceFilterSuffix = distanceFilter ? `_${distanceFilter}m` : '';
         const suggestedFilename = `${suggestedSessionName}${distanceFilterSuffix}`;
         
         initialSettings[filename] = settingsPerFile[filename] || { // Keep existing if already set
            sessionName: suggestedSessionName,
            view: DEFAULT_VIEW,
            camera: DEFAULT_CAMERA,
            fps: DEFAULT_FPS,
            secondsPerClip: DEFAULT_SECONDS_PER_CLIP,
            startingClipNumber: DEFAULT_STARTING_CLIP,
            customFilename: suggestedFilename, // Include distance filter in filename
         };
       });
       setSettingsPerFile(initialSettings);
    } else {
       // Reset when closing or if no files
       setSettingsPerFile({}); 
    }
  }, [isOpen, sourceFiles, distanceFilter]); // Add distanceFilter as dependency

  // Handler to update state for a specific file and field
  const handleSettingChange = (
    filename: string,
    field: keyof SingleFileJumpSettings,
    value: string | number
  ) => {
    setSettingsPerFile(prev => ({
      ...prev,
      [filename]: {
        ...prev[filename],
        [field]: 
          // Ensure numeric fields are numbers
          field === 'fps' || field === 'secondsPerClip' || field === 'startingClipNumber' 
            ? Number(value) || 0 
            : value,
      },
    }));
  };

  const handleSubmit = () => {
    setError(null);
    let validationError = null;

    // Validate all settings
    for (const filename of sourceFiles) {
       const settings = settingsPerFile[filename];
       if (!settings) continue; // Should not happen if initialized correctly

       if (!settings.sessionName?.trim()) {
         validationError = `Session Name is required for ${filename}.`;
         break;
       }
       if (isNaN(settings.fps) || settings.fps <= 0) {
         validationError = `FPS must be a positive number for ${filename}.`;
         break;
       }
       if (!settings.view?.trim()) {
         validationError = `View is required for ${filename}.`;
         break;
       }
       if (!settings.camera?.trim()) {
         validationError = `Camera is required for ${filename}.`;
         break;
       }
       if (isNaN(settings.secondsPerClip!) || settings.secondsPerClip! <= 0) {
         validationError = `Seconds per clip must be a positive number for ${filename}.`;
         break;
       }
       if (isNaN(settings.startingClipNumber!) || settings.startingClipNumber! < 0) {
         validationError = `Starting clip number must be a non-negative number for ${filename}.`;
         break;
       }
     }

    if (validationError) {
      setError(validationError);
      return;
    }

    onSubmit(settingsPerFile);
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
       {/* Increase max width for multi-file view */}
      <DialogContent className="sm:max-w-xl md:max-w-2xl lg:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Export as .jump Files</DialogTitle>
          <DialogDescription>
             Enter settings for each source file. A separate .jump file will be generated for each.
          </DialogDescription>
        </DialogHeader>
        
        {/* Use ScrollArea in case of many files */}
        <ScrollArea className="max-h-[60vh] pr-6">
          {/* Use Accordion for collapsible sections per file */} 
          <Accordion type="single" collapsible className="w-full" defaultValue={sourceFiles[0]}> 
            {sourceFiles.map((filename) => (
              <AccordionItem value={filename} key={filename}>
                 <AccordionTrigger>{filename}</AccordionTrigger>
                 <AccordionContent>
                   <div className="grid gap-4 py-4 px-2">
                    {/* Session Name */}
                     <div className="grid grid-cols-4 items-center gap-4">
                       <Label htmlFor={`sessionName-${filename}`} className="text-right">
                         Session Name
                       </Label>
                       <Input
                         id={`sessionName-${filename}`}
                         value={settingsPerFile[filename]?.sessionName || ''}
                         onChange={(e) => handleSettingChange(filename, 'sessionName', e.target.value)}
                         className="col-span-3"
                         placeholder="Enter session name..."
                       />
                     </div>
                     {/* Custom Filename for .jump file */}
                     <div className="grid grid-cols-4 items-center gap-4">
                       <Label htmlFor={`customFilename-${filename}`} className="text-right">
                         Jump Filename
                       </Label>
                       <div className="col-span-3 flex items-center gap-2">
                         <Input
                           id={`customFilename-${filename}`}
                           value={settingsPerFile[filename]?.customFilename || ''}
                           onChange={(e) => handleSettingChange(filename, 'customFilename', e.target.value)}
                           className="flex-1"
                           placeholder="Enter filename for .jump file..."
                         />
                         <span className="text-sm text-muted-foreground whitespace-nowrap">.jump</span>
                       </div>
                     </div>
                     {/* View */}
                      <div className="grid grid-cols-4 items-center gap-4">
                       <Label htmlFor={`view-${filename}`} className="text-right">
                         View
                       </Label>
                       <Input
                         id={`view-${filename}`}
                         value={settingsPerFile[filename]?.view || ''}
                         onChange={(e) => handleSettingChange(filename, 'view', e.target.value)}
                         className="col-span-3"
                       />
                     </div>
                      {/* Camera */}
                      <div className="grid grid-cols-4 items-center gap-4">
                       <Label htmlFor={`camera-${filename}`} className="text-right">
                         Camera
                       </Label>
                       <Input
                         id={`camera-${filename}`}
                         value={settingsPerFile[filename]?.camera || ''}
                         onChange={(e) => handleSettingChange(filename, 'camera', e.target.value)}
                         className="col-span-3"
                       />
                     </div>
                      {/* FPS */}
                      <div className="grid grid-cols-4 items-center gap-4">
                       <Label htmlFor={`fps-${filename}`} className="text-right">
                         FPS
                       </Label>
                       <Input
                         id={`fps-${filename}`}
                         type="number"
                         value={settingsPerFile[filename]?.fps || 0}
                         onChange={(e) => handleSettingChange(filename, 'fps', e.target.value)}
                         min="1"
                         className="col-span-3"
                       />
                     </div>
                     {/* Seconds Per Clip */}
                     <div className="grid grid-cols-4 items-center gap-4">
                       <Label htmlFor={`secondsPerClip-${filename}`} className="text-right">
                         Seconds Per Clip
                       </Label>
                       <div className="col-span-3 flex items-center gap-2">
                         <Input
                           id={`secondsPerClip-${filename}`}
                           type="number"
                           value={settingsPerFile[filename]?.secondsPerClip || 60}
                           onChange={(e) => handleSettingChange(filename, 'secondsPerClip', e.target.value)}
                           min="1"
                           className="flex-1"
                         />
                         <span className="text-sm text-muted-foreground whitespace-nowrap">seconds</span>
                       </div>
                     </div>
                     {/* Starting Clip Number */}
                     <div className="grid grid-cols-4 items-center gap-4">
                       <Label htmlFor={`startingClipNumber-${filename}`} className="text-right">
                         Starting Clip Number
                       </Label>
                       <Input
                         id={`startingClipNumber-${filename}`}
                         type="number"
                         value={settingsPerFile[filename]?.startingClipNumber || 1}
                         onChange={(e) => handleSettingChange(filename, 'startingClipNumber', e.target.value)}
                         min="1"
                         className="col-span-3"
                       />
                     </div>
                   </div>
                 </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </ScrollArea>

        {error && (
          <p className="text-sm text-red-500 text-center py-2">{error}</p>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">Cancel</Button>
          </DialogClose>
          <Button type="button" onClick={handleSubmit} disabled={sourceFiles.length === 0}>
            Export {sourceFiles.length} File(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}