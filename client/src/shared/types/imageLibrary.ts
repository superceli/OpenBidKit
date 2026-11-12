export interface ImageLibraryItem {
  id: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  size: number;
  description: string;
  folderId: string;
  assetUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImageLibraryMutationResult {
  success: boolean;
  message?: string;
  images: ImageLibraryItem[];
}
