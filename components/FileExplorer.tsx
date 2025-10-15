'use client';

import { useState, useEffect } from 'react';
import { FolderIcon, FileIcon, ChevronRight, ArrowLeft, Home, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileSystemItem, FileSystemResponse, FileExplorerProps } from '@/lib/types/file-system';

export default function FileExplorer({ 
  isOpen, 
  onClose, 
  onSelect, 
  mode, 
  initialPath 
}: FileExplorerProps) {
  const [currentPath, setCurrentPath] = useState(initialPath || '~');
  const [items, setItems] = useState<FileSystemItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  // Load directory contents when path changes
  useEffect(() => {
    if (isOpen) {
      loadDirectory(currentPath);
    }
  }, [currentPath, isOpen]);

  const loadDirectory = async (path: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/file-system?path=${encodeURIComponent(path)}`);
      const data: FileSystemResponse = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load directory');
      }
      
      setItems(data.items);
      setCurrentPath(data.currentPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load directory');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const handleItemClick = (item: FileSystemItem) => {
    if (item.isDirectory) {
      setCurrentPath(item.path);
    } else if (mode === 'file') {
      setSelectedPath(item.path);
    }
  };

  const handleItemDoubleClick = (item: FileSystemItem) => {
    if (item.isDirectory) {
      setCurrentPath(item.path);
    } else if (mode === 'file') {
      setSelectedPath(item.path);
    }
  };

  const handleSelect = () => {
    if (selectedPath) {
      onSelect(selectedPath);
    } else if (mode === 'directory') {
      onSelect(currentPath);
    }
    onClose();
  };

  const handleUp = () => {
    const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
    setCurrentPath(parentPath);
  };

  const handleHome = () => {
    setCurrentPath('~');
  };

  const getBreadcrumbs = () => {
    const parts = currentPath.split('/').filter(Boolean);
    const breadcrumbs = [];
    
    for (let i = 0; i < parts.length; i++) {
      const path = '/' + parts.slice(0, i + 1).join('/');
      breadcrumbs.push({
        name: parts[i],
        path: path
      });
    }
    
    return breadcrumbs;
  };

  const handleBreadcrumbClick = (path: string) => {
    setCurrentPath(path);
  };

  const canSelect = () => {
    if (mode === 'file') {
      return selectedPath !== null;
    } else {
      return true; // For directory mode, current path is always selectable
    }
  };

  const getDisplayPath = (path: string) => {
    // Simple home directory detection for display
    const homePattern = /^\/home\/[^\/]+/;
    if (homePattern.test(path)) {
      return '~' + path.replace(homePattern, '');
    }
    return path;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            Select {mode === 'file' ? 'File' : 'Directory'}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex flex-col min-h-0">
          {/* Navigation Bar */}
          <div className="flex items-center gap-2 p-2 border-b">
            <Button
              variant="outline"
              size="sm"
              onClick={handleHome}
              className="flex items-center gap-1"
            >
              <Home className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleUp}
              className="flex items-center gap-1"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            
            {/* Breadcrumb */}
            <div className="flex items-center gap-1 flex-1 min-w-0">
              <span className="text-sm text-gray-500">/</span>
              {getBreadcrumbs().map((crumb, index) => (
                <div key={index} className="flex items-center gap-1">
                  <button
                    onClick={() => handleBreadcrumbClick(crumb.path)}
                    className="text-sm text-blue-600 hover:text-blue-800 hover:underline truncate"
                  >
                    {crumb.name}
                  </button>
                  {index < getBreadcrumbs().length - 1 && (
                    <ChevronRight className="h-3 w-3 text-gray-400" />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Current Path Display */}
          <div className="p-2 bg-gray-50 border-b">
            <p className="text-sm text-gray-600">
              Current: {getDisplayPath(currentPath)}
            </p>
            {selectedPath && (
              <p className="text-sm text-blue-600">
                Selected: {getDisplayPath(selectedPath)}
              </p>
            )}
          </div>

          {/* File List */}
          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="ml-2">Loading...</span>
              </div>
            ) : error ? (
              <div className="flex items-center justify-center h-32 text-red-600">
                <p>{error}</p>
              </div>
            ) : items.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-gray-500">
                <p>This directory is empty</p>
              </div>
            ) : (
              <div className="divide-y">
                {items.map((item) => (
                  <div
                    key={item.path}
                    onClick={() => handleItemClick(item)}
                    onDoubleClick={() => handleItemDoubleClick(item)}
                    className={`p-3 hover:bg-gray-50 cursor-pointer flex items-center gap-3 ${
                      selectedPath === item.path ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                    }`}
                  >
                    {item.isDirectory ? (
                      <FolderIcon className="h-5 w-5 text-blue-500" />
                    ) : (
                      <FileIcon className="h-5 w-5 text-gray-500" />
                    )}
                    <span className="flex-1 truncate">{item.name}</span>
                    {item.isDirectory && (
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleSelect} 
            disabled={!canSelect()}
          >
            Select {mode === 'file' ? 'File' : 'Directory'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
