export interface FileSystemItem {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
}

export interface FileSystemResponse {
  currentPath: string;
  items: FileSystemItem[];
  error?: string;
}

export type FileExplorerMode = "file" | "directory";

export interface FileExplorerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
  mode: FileExplorerMode;
  initialPath?: string;
}
