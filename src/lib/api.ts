import { User, Video, Category, Invitation, AdminStats, AuditLog } from '../types/index.ts';

const BASE_URL = '/api/v1';

let currentAuthToken: string | null = null;

export function setAuthToken(token: string | null) {
  currentAuthToken = token;
  if (token) {
    try {
      localStorage.setItem('msx_auth_token', token);
    } catch {}
  } else {
    try {
      localStorage.removeItem('msx_auth_token');
    } catch {}
  }
}

export function getAuthToken(): string | null {
  if (!currentAuthToken) {
    try {
      currentAuthToken = localStorage.getItem('msx_auth_token');
    } catch {}
  }
  return currentAuthToken;
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers || {}),
    },
    credentials: 'include',
  });

  if (!res.ok) {
    let errMsg = `Request failed with status ${res.status}`;
    try {
      const errorData = await res.json();
      if (errorData?.error) errMsg = errorData.error;
    } catch {
      // ignore
    }
    throw new Error(errMsg);
  }

  return res.json();
}

export const api = {
  // Auth
  async getMe(): Promise<{ user: User | null; token?: string }> {
    const res = await fetchJson<{ user: User | null; token?: string }>(`${BASE_URL}/auth/me`);
    if (res.token) setAuthToken(res.token);
    return res;
  },

  async login(email: string, password: string): Promise<{ user: User; token: string }> {
    const res = await fetchJson<{ user: User; token: string }>(`${BASE_URL}/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (res.token) setAuthToken(res.token);
    return res;
  },

  async logout(): Promise<{ success: boolean }> {
    setAuthToken(null);
    return fetchJson(`${BASE_URL}/auth/logout`, { method: 'POST' });
  },

  async acceptInvite(data: { token: string; email: string; displayName: string; password: string }): Promise<{ user: User; token: string }> {
    const res = await fetchJson<{ user: User; token: string }>(`${BASE_URL}/auth/accept-invite`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (res.token) setAuthToken(res.token);
    return res;
  },

  async quickDemoLogin(role: 'OWNER' | 'FRIEND'): Promise<{ user: User; token: string }> {
    const res = await fetchJson<{ user: User; token: string }>(`${BASE_URL}/auth/quick-demo-login`, {
      method: 'POST',
      body: JSON.stringify({ role }),
    });
    if (res.token) setAuthToken(res.token);
    return res;
  },

  // Videos
  async getVideos(params?: { category?: string; search?: string; sort?: string; limit?: number; offset?: number }): Promise<{ videos: Video[] }> {
    const q = new URLSearchParams();
    if (params?.category) q.set('category', params.category);
    if (params?.search) q.set('search', params.search);
    if (params?.sort) q.set('sort', params.sort);
    if (params?.limit) q.set('limit', String(params.limit));
    if (params?.offset) q.set('offset', String(params.offset));
    return fetchJson(`${BASE_URL}/videos?${q.toString()}`);
  },

  async getVideo(id: string): Promise<{ video: Video }> {
    return fetchJson(`${BASE_URL}/videos/${id}`);
  },

  async getVideoResolutions(id: string): Promise<{ videoId: string; resolutions: import('../types/index.ts').VideoResolution[] }> {
    return fetchJson(`${BASE_URL}/videos/${id}/resolutions`);
  },

  async getCategories(): Promise<{ categories: Category[] }> {
    return fetchJson(`${BASE_URL}/videos/categories/list`);
  },

  async validateMegaLink(url: string): Promise<{
    valid: boolean;
    metadata?: {
      fileId: string;
      fileName: string;
      fileSize: number;
      mimeType: string;
      isVideo: boolean;
      sanitizedUrl: string;
    };
    error?: string;
  }> {
    return fetchJson(`${BASE_URL}/videos/validate-mega`, {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
  },

  async createVideo(data: {
    title: string;
    description?: string;
    megaUrl?: string;
    sampleStreamUrl?: string;
    categoryIds?: string[];
    durationSeconds?: number;
    thumbnailUrl?: string;
    isFeatured?: boolean;
    status?: 'PUBLISHED' | 'UNPUBLISHED';
  }): Promise<{ success: boolean; videoId: string }> {
    return fetchJson(`${BASE_URL}/videos`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateVideo(id: string, data: Partial<Video> & { categoryIds?: string[] }): Promise<{ success: boolean }> {
    return fetchJson(`${BASE_URL}/videos/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async deleteVideo(id: string): Promise<{ success: boolean }> {
    return fetchJson(`${BASE_URL}/videos/${id}`, {
      method: 'DELETE',
    });
  },

  // Personalization
  async getContinueWatching(): Promise<{ continueWatching: Video[] }> {
    return fetchJson(`${BASE_URL}/continue-watching`);
  },

  async getWatchHistory(): Promise<{ history: Video[] }> {
    return fetchJson(`${BASE_URL}/history`);
  },

  async updateWatchProgress(videoId: string, positionSeconds: number, durationSeconds: number): Promise<{ success: boolean; isCompleted: boolean }> {
    return fetchJson(`${BASE_URL}/progress/${videoId}`, {
      method: 'PUT',
      body: JSON.stringify({ positionSeconds, durationSeconds }),
    });
  },

  async getFavorites(): Promise<{ favorites: Video[] }> {
    return fetchJson(`${BASE_URL}/favorites`);
  },

  async toggleFavorite(videoId: string): Promise<{ isFavorite: boolean }> {
    return fetchJson(`${BASE_URL}/favorites/${videoId}`, {
      method: 'POST',
    });
  },

  // Admin
  async getAdminStats(): Promise<AdminStats> {
    return fetchJson(`${BASE_URL}/admin/stats`);
  },

  async getAdminUsers(): Promise<{ users: any[] }> {
    return fetchJson(`${BASE_URL}/admin/users`);
  },

  async updateUserStatus(userId: string, status: 'ACTIVE' | 'DISABLED'): Promise<{ success: boolean }> {
    return fetchJson(`${BASE_URL}/admin/users/${userId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  async getInvitations(): Promise<{ invitations: Invitation[] }> {
    return fetchJson(`${BASE_URL}/admin/invitations`);
  },

  async createInvitation(data: { invitedEmail?: string; role?: 'OWNER' | 'FRIEND'; maxUses?: number; validDays?: number }): Promise<{ success: boolean; invitation: Invitation }> {
    return fetchJson(`${BASE_URL}/admin/invitations`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async revokeInvitation(id: string): Promise<{ success: boolean }> {
    return fetchJson(`${BASE_URL}/admin/invitations/${id}`, {
      method: 'DELETE',
    });
  },

  async getAuditLogs(): Promise<{ logs: AuditLog[] }> {
    return fetchJson(`${BASE_URL}/admin/audit-logs`);
  },
};
