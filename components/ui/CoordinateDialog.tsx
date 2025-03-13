import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CoordinateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (coordinates: { lat: number; lng: number; title?: string; description?: string }) => void;
}

export function CoordinateDialog({ isOpen, onClose, onSave }: CoordinateDialogProps) {
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  const handleSave = () => {
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);

    if (isNaN(latNum) || isNaN(lngNum)) {
      setError('Please enter valid numbers for coordinates');
      return;
    }

    if (latNum < -90 || latNum > 90) {
      setError('Latitude must be between -90 and 90');
      return;
    }

    if (lngNum < -180 || lngNum > 180) {
      setError('Longitude must be between -180 and 180');
      return;
    }

    onSave({
      lat: latNum,
      lng: lngNum,
      title: title.trim() || undefined,
      description: description.trim() || undefined
    });

    // Reset form
    setLat('');
    setLng('');
    setTitle('');
    setDescription('');
    setError('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Marker by Coordinates</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="lat">Latitude</Label>
            <Input
              id="lat"
              type="number"
              step="any"
              placeholder="Enter latitude (-90 to 90)"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lng">Longitude</Label>
            <Input
              id="lng"
              type="number"
              step="any"
              placeholder="Enter longitude (-180 to 180)"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="title">Title (Optional)</Label>
            <Input
              id="title"
              placeholder="Enter marker title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Input
              id="description"
              placeholder="Enter marker description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {error && (
            <div className="text-sm text-red-500">{error}</div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Add Marker</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 