import type {
  ApiResponse,
  User,
  StorageUsage,
  Folder,
  FileItem,
  FileListResponse,
  ActivityListResponse,
  UploadSessionResponse,
  UploadSession,
  DownloadResponse
} from './types';

let currentCsrfToken: string | null = null;
let onUnauthorizedHandler: (() => void) | null = null;

export function setCsrfToken(token: string | null) {
  currentCsrfToken = token;
}

export function getCsrfToken(): string | null {
  return currentCsrfToken;
}

export function setOnUnauthorized(handler: () => void) {
  onUnauthorizedHandler = handler;
}

export class ApiError extends Error {
  statusCode: number;
  code?: string;
  details?: unknown;

  constructor(message: string, statusCode: number, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {})
  };

  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && currentCsrfToken) {
    headers['X-CSRF-Token'] = currentCsrfToken;
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
    credentials: 'same-origin'
  });

  let result: ApiResponse<T> | null = null;
  try {
    result = await response.json();
  } catch {
    // Response body is not JSON
  }

  if (!response.ok) {
    if (response.status === 401 && onUnauthorizedHandler) {
      onUnauthorizedHandler();
    }
    const message = result?.message || `Yêu cầu thất bại (HTTP ${response.status})`;
    const code = result?.error?.code;
    const details = result?.error?.details;
    throw new ApiError(message, response.status, code, details);
  }

  return (result ? result.data : undefined) as T;
}

function buildQuery(params: Record<string, unknown>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      query.append(key, String(value));
    }
  }
  const queryString = query.toString();
  return queryString ? `?${queryString}` : '';
}

export const api = {
  auth: {
    async login(payload: { username?: string; email?: string; password: string }) {
      const data = await request<{ user: User; csrf_token: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      if (data.csrf_token) {
        setCsrfToken(data.csrf_token);
      }
      return data;
    },

    async register(payload: {
      username: string;
      email: string;
      password: string;
      full_name?: string;
      invitation_token?: string;
    }) {
      return request<User>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },

    async me() {
      return request<User>('/api/auth/me');
    },

    async csrf() {
      const data = await request<{ csrf_token: string }>('/api/auth/csrf');
      if (data.csrf_token) {
        setCsrfToken(data.csrf_token);
      }
      return data;
    },

    async logout() {
      try {
        await request<null>('/api/auth/logout', {
          method: 'POST'
        });
      } finally {
        setCsrfToken(null);
      }
    }
  },

  user: {
    async getProfile() {
      return request<User>('/api/users/me');
    },

    async updateProfile(payload: { full_name?: string; avatar_url?: string }) {
      return request<User>('/api/users/me', {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
    },

    async changePassword(payload: { current_password: string; new_password: string }) {
      return request<null>('/api/users/me/password', {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
    }
  },

  storage: {
    async getUsage() {
      return request<StorageUsage>('/api/storage/usage');
    }
  },

  folders: {
    async getRoot() {
      return request<Folder[]>('/api/folders');
    },

    async getById(id: string) {
      return request<Folder>(`/api/folders/${id}`);
    },

    async create(payload: { name: string; parent_id?: string | null }) {
      return request<Folder>('/api/folders', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },

    async rename(id: string, name: string) {
      return request<Folder>(`/api/folders/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name })
      });
    },

    async delete(id: string) {
      return request<null>(`/api/folders/${id}`, {
        method: 'DELETE'
      });
    }
  },

  files: {
    async list(params: {
      folder_id?: string | null;
      search?: string;
      sort?: string;
      direction?: 'ASC' | 'DESC';
      limit?: number;
      cursor?: string | null;
    } = {}) {
      const qs = buildQuery(params);
      return request<FileListResponse>(`/api/files${qs}`);
    },

    async listTrash(params: {
      folder_id?: string | null;
      search?: string;
      status?: 'ALL' | 'TRASHED' | 'PURGE_PENDING';
      sort?: 'trashed_at' | 'file_name' | 'file_size';
      direction?: 'ASC' | 'DESC';
      limit?: number;
      cursor?: string | null;
    } = {}) {
      const qs = buildQuery(params);
      return request<FileListResponse>(`/api/files/trash${qs}`);
    },

    async download(id: string) {
      return request<DownloadResponse>(`/api/files/${id}/download`);
    },

    async rename(id: string, fileName: string) {
      return request<FileItem>(`/api/files/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ file_name: fileName })
      });
    },

    async move(id: string, folderId: string | null) {
      return request<FileItem>(`/api/files/${id}/move`, {
        method: 'PUT',
        body: JSON.stringify({ folder_id: folderId })
      });
    },

    async trash(id: string) {
      return request<{ file_id: string; status: string; trashed_at: string }>(`/api/files/${id}`, {
        method: 'DELETE'
      });
    },

    async restore(id: string) {
      return request<{ file_id: string; status: string }>(`/api/files/${id}/restore`, {
        method: 'POST'
      });
    },

    async permanentDelete(id: string) {
      return request<{ file_id: string; status: string }>(`/api/files/${id}/permanent`, {
        method: 'DELETE'
      });
    }
  },

  uploads: {
    async createSession(payload: {
      requested_size: number;
      declared_mime_type: string;
      folder_id?: string | null;
    }) {
      const idempotencyKey = crypto.randomUUID();
      return request<UploadSessionResponse>('/api/uploads', {
        method: 'POST',
        headers: {
          'Idempotency-Key': idempotencyKey
        },
        body: JSON.stringify(payload)
      });
    },

    async complete(id: string, versionId: string) {
      return request<UploadSession>(`/api/uploads/${id}/complete`, {
        method: 'POST',
        body: JSON.stringify({ versionId })
      });
    },

    async getSession(id: string) {
      return request<UploadSession>(`/api/uploads/${id}`);
    },

    postToS3(
      url: string,
      fields: Record<string, string>,
      file: File,
      onProgress: (percent: number) => void
    ): Promise<string> {
      return new Promise((resolve, reject) => {
        const formData = new FormData();
        for (const [key, value] of Object.entries(fields)) {
          formData.append(key, value);
        }
        formData.append('file', file);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', url);

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            onProgress(percent);
          }
        };

        xhr.onerror = () => {
          reject(new Error('Tải tệp trực tiếp lên S3 thất bại. Kiểm tra kết nối mạng hoặc CORS của bucket S3.'));
        };

        xhr.onload = () => {
          if (xhr.status === 201 || xhr.status === 204) {
            const versionId = xhr.getResponseHeader('x-amz-version-id');
            if (!versionId) {
              reject(new Error('S3 không trả về versionId. Cần kiểm tra cấu hình CORS ExposeHeaders trên bucket S3.'));
              return;
            }
            resolve(versionId);
          } else {
            reject(new Error(`Tải lên S3 thất bại với mã lỗi HTTP ${xhr.status}.`));
          }
        };

        xhr.send(formData);
      });
    }
  },

  activity: {
    async list(params: { limit?: number; cursor?: string | null } = {}) {
      const qs = buildQuery(params);
      return request<ActivityListResponse>(`/api/activity${qs}`);
    }
  }
};
