'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from "@/components/ui/button";
import dynamic from 'next/dynamic';

const DriveMap = dynamic(
  () => import('@/components/DriveMap'),
  { 
    ssr: false,
    loading: () => <div className="w-full h-[600px] bg-gray-100 dark:bg-stone-800 rounded-lg flex items-center justify-center">
      <p className="text-gray-500 dark:text-stone-400">Loading map...</p>
    </div>
  }
);

interface DrivePoint {
  frameId: number;
  lat: number;
  lng: number;
  altitude?: number;
  speed?: number;
  timestamp?: string;
}

interface DataMetadata {
  totalPoints: number;
  currentPage: number;
  totalPages: number;
  pointsPerPage: number;
  isSampled: boolean;
  debug?: {
    fileExists: boolean;
    totalLinesRead: number;
    selectedLinesCount: number;
    validPointsCount: number;
    invalidPointsCount: number;
    firstValidPoint: DrivePoint;
    lastValidPoint: DrivePoint;
    validationErrors?: Array<{
      line: number;
      errors: string[];
    }>;
  };
}

export default function ProcessPage() {
  const searchParams = useSearchParams();
  const filename = searchParams.get('file');
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [points, setPoints] = useState<DrivePoint[]>([]);
  const [metadata, setMetadata] = useState<DataMetadata | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [isSampledView, setIsSampledView] = useState(true);
  const [showDebug, setShowDebug] = useState(false);

  const fetchData = async (page: number, sample: boolean = false) => {
    try {
      console.log('Debug - Fetching data:', { page, sample, filename });
      
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/csv-data/${filename}?page=${page}&sample=${sample}`
      );
      
      if (!response.ok) throw new Error('Failed to fetch file');
      
      const data = await response.json();
      console.log('Debug - Received data:', data);
      
      if (sample || page === 1) {
        setPoints(data.points);
      } else {
        setPoints(prev => [...prev, ...data.points]);
      }
      
      setMetadata(data.metadata);
      setLoading(false);
    } catch (err) {
      console.error('Debug - Error:', err);
      setError('Failed to load or parse the file');
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!filename) {
      setError('No file selected');
      setLoading(false);
      return;
    }

    // Initial load with sampling
    fetchData(1, true);
  }, [filename]);

  const handleLoadMore = async () => {
    if (!metadata || currentPage >= metadata.totalPages) return;
    
    const nextPage = currentPage + 1;
    await fetchData(nextPage, false);
    setCurrentPage(nextPage);
  };

  const toggleViewMode = async () => {
    setLoading(true);
    setIsSampledView(!isSampledView);
    
    if (isSampledView) {
      // Switching to full view - load first page
      setCurrentPage(1);
      await fetchData(1, false);
    } else {
      // Switching to sampled view
      await fetchData(1, true);
    }
  };

  const handleBackToHome = () => {
    window.location.href = '/';
  };

  const renderDebugInfo = () => {
    if (!metadata?.debug) return null;

    return (
      <div className="mt-4 p-4 bg-gray-100 dark:bg-stone-700 rounded-lg overflow-x-auto">
        <h3 className="text-lg font-semibold mb-2">Debug Information</h3>
        <div className="space-y-4 font-mono text-sm">
          <div className="space-y-2">
            <div>File Status: {metadata.debug.fileExists ? '✅ Found' : '❌ Not Found'}</div>
            <div>Total Lines Read: {metadata.debug.totalLinesRead}</div>
            <div>Selected Lines: {metadata.debug.selectedLinesCount}</div>
            <div>Valid Points: {metadata.debug.validPointsCount}</div>
            <div>Invalid Points: {metadata.debug.invalidPointsCount || 0}</div>
          </div>

          {metadata.debug.validationErrors && metadata.debug.validationErrors.length > 0 && (
            <div className="mt-4">
              <h4 className="font-semibold mb-2">Validation Errors (Sample)</h4>
              <div className="space-y-2">
                {metadata.debug.validationErrors.map((error, index) => (
                  <div key={index} className="p-2 bg-red-100 dark:bg-red-900/20 rounded">
                    <div className="font-semibold">Line {error.line + 1}:</div>
                    <ul className="list-disc list-inside">
                      {error.errors.map((err, errIndex) => (
                        <li key={errIndex} className="text-red-600 dark:text-red-400">
                          {err}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {metadata.debug.firstValidPoint && (
            <div>
              <div>First Valid Point:</div>
              <pre className="p-2 bg-gray-200 dark:bg-stone-800 rounded">
                {JSON.stringify(metadata.debug.firstValidPoint, null, 2)}
              </pre>
            </div>
          )}
          {metadata.debug.lastValidPoint && (
            <div>
              <div>Last Valid Point:</div>
              <pre className="p-2 bg-gray-200 dark:bg-stone-800 rounded">
                {JSON.stringify(metadata.debug.lastValidPoint, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (error) {
    return (
      <div className="min-h-screen p-8 bg-stone-50 dark:bg-stone-900">
        <main className="max-w-4xl mx-auto">
          <div className="bg-white dark:bg-stone-800 p-6 rounded-lg shadow-md">
            <h1 className="text-2xl font-bold text-red-600 mb-4">Error</h1>
            <p className="text-stone-600 dark:text-stone-300 mb-4">{error}</p>
            <Button onClick={handleBackToHome}>Back to Home</Button>
          </div>
        </main>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen p-8 bg-stone-50 dark:bg-stone-900">
        <main className="max-w-4xl mx-auto">
          <div className="bg-white dark:bg-stone-800 p-6 rounded-lg shadow-md">
            <h2 className="text-lg font-semibold mb-4">Loading...</h2>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8 bg-stone-50 dark:bg-stone-900">
      <main className="max-w-6xl mx-auto">
        <div className="bg-white dark:bg-stone-800 p-6 rounded-lg shadow-md">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-bold">Processing: {filename}</h1>
              {metadata && (
                <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
                  Total points: {metadata.totalPoints.toLocaleString()}
                </p>
              )}
            </div>
            <div className="flex gap-4">
              <Button
                variant="secondary"
                onClick={() => setShowDebug(!showDebug)}
              >
                {showDebug ? 'Hide Debug' : 'Show Debug'}
              </Button>
              <Button
                variant="secondary"
                onClick={toggleViewMode}
                disabled={loading}
              >
                {isSampledView ? 'Switch to Full View' : 'Switch to Sampled View'}
              </Button>
              <Button variant="outline" onClick={handleBackToHome}>
                Back to Home
              </Button>
            </div>
          </div>
          
          <div className="space-y-4">
            <DriveMap 
              points={points} 
              metadata={metadata || undefined}
              onLoadMore={!isSampledView ? handleLoadMore : undefined}
            />
            {showDebug && renderDebugInfo()}
          </div>
        </div>
      </main>
    </div>
  );
} 