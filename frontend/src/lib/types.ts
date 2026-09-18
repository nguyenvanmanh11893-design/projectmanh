export interface User {
  id: string;
  username: string;
  email: string;
  full_name: string;
  role?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface StorageUsage {
  used_bytes: number;
  reserved_bytes: number;
  quota_bytes: number;
}

export interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
  subfolders?: Folder[];
  files?: FileItem[];
}

export type FileStatus =
  | 'READY'
  | 'LEGACY_UNVERIFIED'
  | 'TRASHED'
  | 'PURGE_PENDING'
  | 'PURGED';

export interface FileItem {
  id: string;
  user_id: string;
  folder_id: string | null;
  file_name: string;
  original_name: string;
  mime_type: string;
  file_size: number;
  extension: string;
  status: FileStatus;
  s3_key?: string;
  s3_version_id?: string;
  created_at: string;
  updated_at: string;
  trashed_at?: string | null;
  purge_requested_at?: string | null;
}

export interface AuditEvent {
  id: number;
  action: string;
  resource_type: string;
  resource_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  error?: {
    code?: string;
    details?: unknown;
  };
}

export interface FileListResponse {
  items: FileItem[];
  next_cursor: string | null;
}

export interface ActivityListResponse {
  items: AuditEvent[];
  next_cursor: string | null;
}

export interface UploadSession {
  id: string;
  status: 'PENDING' | 'VALIDATING' | 'COMPLETED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';
  requested_size: string;
  declared_mime_type: string;
  folder_id: string | null;
  expires_at: string;
  source_version_id?: string | null;
}

export interface PresignedPost {
  url: string;
  fields: Record<string, string>;
}

export interface UploadSessionResponse {
  upload_session: UploadSession;
  presigned_post: PresignedPost;
}

export interface DownloadResponse {
  file_id: string;
  file_name: string;
  download_url: string;
  expires_in: string;
}

export interface BreadcrumbItem {
  id: string | null;
  name: string;
}

export interface ActiveUpload {
  key: string;
  file: File;
  folderId: string | null;
  label: string;
  progress: number;
  status: 'preparing' | 'uploading' | 'validating' | 'completed' | 'rejected' | 'failed';
  error?: string;
  retryable?: boolean;
  sessionId?: string;
}
