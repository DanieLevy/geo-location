'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from "@/components/ui/button";
import dynamic from 'next/dynamic';
import { DrivePoint } from '@/lib/types';

const DriveMap = dynamic(
  () => import('@/components/DriveMap'),
  { 
    ssr: false,
    loading: () => <div className="w-full h-[600px] bg-gray-100 dark:bg-stone-800 rounded-lg flex items-center justify-center">
      <p className="text-gray-500 dark:text-stone-400">Loading map...</p>
    </div>
  }
);

interface DataMetadata {
  totalPointsInFile: number;
  invalidPointsDetected: number;
  validationErrors?: Array<{ line: number; errors: string[]; rawData: any }>;
}

export default function ProcessPage() {
  const searchParams = useSearchParams();
  const filename = searchParams.get('file');
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [points, setPoints] = useState<DrivePoint[]>([]);
  const [metadata, setMetadata] = useState<{ totalPointsInFile: number; invalidPointsDetected: number; validationErrors?: any[] } | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  const fetchData = async () => {
    if (!filename) {
      setError('No file selected');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      console.log('Debug - Fetching data for:', filename);
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/csv-data/${filename}`
      );
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to fetch file data' }));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Debug - Received data:', data);
      
      setPoints(data.points || []);
      
      setMetadata({
        totalPointsInFile: data.totalPointsInFile || 0,
        invalidPointsDetected: data.invalidPointsDetected || 0,
        validationErrors: data.validationErrors 
      });
      setLoading(false);
    } catch (err: any) {
      console.error('Debug - Error fetching data:', err);
      setError(err.message || 'Failed to load or parse the file');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [filename]);

  const handleBackToHome = () => {
    window.location.href = '/';
  };

  const renderDebugInfo = () => {
    if (!metadata?.validationErrors || metadata.validationErrors.length === 0) {
        return (
            <div className="mt-4 p-4 bg-gray-100 dark:bg-stone-700 rounded-lg">
                <h3 className="text-lg font-semibold mb-2">Debug Information</h3>
                <p>No validation errors detected, or debug info not available.</p>
            </div>
        );
    }

    return (
      <div className="mt-4 p-4 bg-gray-100 dark:bg-stone-700 rounded-lg overflow-x-auto">
        <h3 className="text-lg font-semibold mb-2">Validation Errors</h3>
        <p className="text-sm mb-2">Showing {metadata.validationErrors.length} lines that failed validation:</p>
        <div className="space-y-2 font-mono text-sm">
          {metadata.validationErrors.map((error, index) => (
            <div key={index} className="p-2 bg-red-100 dark:bg-red-900/20 rounded">
              <div className="font-semibold">Original Line ~{error.line}:</div>
              <pre className="text-xs mt-1 p-1 bg-gray-200 dark:bg-stone-600 rounded overflow-x-auto">
                {JSON.stringify(error.rawData)}
              </pre>
              <ul className="list-disc list-inside mt-1">
                {error.errors.map((err: string, errIndex: number) => (
                  <li key={errIndex} className="text-red-600 dark:text-red-400">
                    {err}
                  </li>
                ))}
              </ul>
            </div>
          ))}
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
                  Total valid points found: {points.length.toLocaleString()} / {metadata.totalPointsInFile.toLocaleString()} (Invalid: {metadata.invalidPointsDetected})
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
              <Button variant="outline" onClick={handleBackToHome}>
                Back to Home
              </Button>
            </div>
          </div>
          
          {loading && <div className="text-center py-8">Loading all data...</div>}
          {error && <div className="text-red-500 text-center py-8">Error: {error}</div>}
          
          {!loading && !error && (
            <div className="space-y-4">
              <DriveMap 
                points={points} 
              />
              {showDebug && renderDebugInfo()}
            </div>
          )}
        </div>
      </main>
    </div>
  );
} 