export interface User {
  id: string;
  email: string;
  displayName: string;
  role: 'OWNER' | 'FRIEND';
  status: 'ACTIVE' | 'DISABLED';
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  icon?: string;
  description?: string;
  video_count?: number;
}

export interface VideoCategory {
  id: string;
  name: string;
  slug: string;
  icon?: string;
}

export interface Video {
  id: string;
  title: string;
  description: string;
  slug: string;
  duration_seconds: number;
  thumbnail_url: string;
  embed_url?: string;
  status: 'PUBLISHED' | 'UNPUBLISHED';
  view_count: number;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
  categories: VideoCategory[];
  watch_position?: number;
  watch_duration?: number;
  is_completed?: boolean;
  is_favorite?: boolean;
  megaInfo?: {
    file_id: string;
    file_name: string;
    file_size: number;
    mime_type: string;
  } | null;
}

export interface Invitation {
  id: string;
  token: string;
  invited_email?: string;
  role: 'OWNER' | 'FRIEND';
  max_uses: number;
  uses_count: number;
  expires_at: string;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
  created_at: string;
  created_by_name?: string;
}

export interface AdminStats {
  videos: {
    total_videos: number;
    published_videos: number;
    total_views: number;
    mega_sources_count: number;
  };
  users: {
    total_users: number;
    friend_users: number;
    active_users: number;
  };
  storage: {
    source_count: number;
    total_bytes: number;
  };
  streaming: {
    total_stream_requests: number;
    total_bytes_served: number;
    activeSessions: number;
  };
}

export interface AuditLog {
  id: string;
  user_id?: string;
  action: string;
  target_type?: string;
  target_id?: string;
  ip_address?: string;
  details_json?: string;
  created_at: string;
  display_name?: string;
  email?: string;
}

export interface VideoResolution {
  id: string;
  label: string;
  badge: string;
  height: number;
  available: boolean;
}

export type AppView =
  | 'home'
  | 'explore'
  | 'movies'
  | 'series'
  | 'tutorials'
  | 'continue-watching'
  | 'history'
  | 'favorites'
  | 'admin-dashboard'
  | 'admin-add-video'
  | 'admin-manage-videos'
  | 'admin-invitations'
  | 'admin-friends'
  | 'settings'
  | 'profile';
