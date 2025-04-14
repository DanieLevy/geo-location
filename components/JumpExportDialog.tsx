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

interface JumpExportSettings {
  sessionName: string;
  view: string;
  camera: string;
  fps: number;
}

interface JumpExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (settings: JumpExportSettings) => void;
  suggestedSessionName?: string; // Optional suggestion
}

export function JumpExportDialog({
  isOpen,
  onClose,
  onSubmit,
  suggestedSessionName = '',
}: JumpExportDialogProps) {
  const [sessionName, setSessionName] = useState(suggestedSessionName);
  const [view, setView] = useState('s_AllSensors');
  const [camera, setCamera] = useState('main');
  const [fps, setFps] = useState(30);
  const [error, setError] = useState<string | null>(null);

  // Update session name if suggestion changes while open
  useEffect(() => {
      setSessionName(suggestedSessionName);
  }, [suggestedSessionName]);

  const handleSubmit = () => {
    setError(null);
    const fpsNum = Number(fps);
    if (!sessionName.trim()) {
      setError('Session Name is required.');
      return;
    }
    if (isNaN(fpsNum) || fpsNum <= 0) {
      setError('FPS must be a positive number.');
      return;
    }
    if (!view.trim()) {
        setError('View is required.');
        return;
    }
     if (!camera.trim()) {
        setError('Camera is required.');
        return;
    }

    onSubmit({
      sessionName: sessionName.trim(),
      view: view.trim(),
      camera: camera.trim(),
      fps: fpsNum,
    });
  };

  // Use controlled Dialog open state
  if (!isOpen) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Export as .jump File</DialogTitle>
          <DialogDescription>
            Enter the settings for your jump file export.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="sessionName" className="text-right">
              Session Name
            </Label>
            <Input
              id="sessionName"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              className="col-span-3"
              placeholder="e.g., DC3_Cay8_..."
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="view" className="text-right">
              View
            </Label>
            <Input
              id="view"
              value={view}
              onChange={(e) => setView(e.target.value)}
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="camera" className="text-right">
              Camera
            </Label>
            <Input
              id="camera"
              value={camera}
              onChange={(e) => setCamera(e.target.value)}
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="fps" className="text-right">
              FPS
            </Label>
            <Input
              id="fps"
              type="number"
              value={fps}
              onChange={(e) => setFps(Number(e.target.value))}
              min="1"
              className="col-span-3"
            />
          </div>
          {error && (
             <p className="text-sm text-red-500 col-span-4 text-center">{error}</p>
          )}
        </div>
        <DialogFooter>
          {/* Use DialogClose for the Cancel button */}
          <DialogClose asChild>
             <Button type="button" variant="outline">Cancel</Button>
          </DialogClose>
          <Button type="button" onClick={handleSubmit}>Export</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 