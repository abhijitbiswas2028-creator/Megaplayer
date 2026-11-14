import React, { useState, useEffect } from 'react';
import { Video, Category, Invitation, AdminStats, AuditLog } from '../../types/index.ts';
import { api, resolveBackendUrl } from '../../lib/api.ts';
import { formatDuration } from '../video/VideoCard.tsx';
import {
  ShieldAlert,
  PlusCircle,
  Video as VideoIcon,
  Ticket,
  Users,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Edit3,
  Eye,
  EyeOff,
  Link as LinkIcon,
  HardDrive,
  Copy,
  Clock,
  Sparkles,
  Loader2,
  RefreshCw,
} from 'lucide-react';

interface AdminDashboardProps {
  initialTab?: 'overview' | 'add-video' | 'manage-videos' | 'invitations' | 'friends';
  categories: Category[];
  onVideoCreated?: () => void;
  onPreviewVideo?: (video: Video) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  initialTab = 'overview',
  categories,
  onVideoCreated,
  onPreviewVideo,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'add-video' | 'manage-videos' | 'invitations' | 'friends'>(
    initialTab
  );

  // Stats
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  // Video Management
  const [videoList, setVideoList] = useState<Video[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(false);

  // Invitations
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(false);

  // Users
  const [userList, setUserList] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Audit Logs
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Add Video Form State
  const [addForm, setAddForm] = useState({
    megaUrl: '',
    sampleStreamUrl: '',
    title: '',
    description: '',
    categoryIds: [] as string[],
    thumbnailUrl: '',
    durationSeconds: 0,
    isFeatured: false,
    status: 'PUBLISHED' as 'PUBLISHED' | 'UNPUBLISHED',
  });
  const [validatingMega, setValidatingMega] = useState(false);
  const [megaValidationResult, setMegaValidationResult] = useState<{
    valid: boolean;
    metadata?: any;
    error?: string;
  } | null>(null);
  const [submittingVideo, setSubmittingVideo] = useState(false);
  const [videoSuccessMsg, setVideoSuccessMsg] = useState<string | null>(null);
  const [videoErrorMsg, setVideoErrorMsg] = useState<string | null>(null);

  // Invitation Form State
  const [inviteForm, setInviteForm] = useState({
    invitedEmail: '',
    role: 'FRIEND' as 'FRIEND' | 'OWNER',
    maxUses: 1,
    validDays: 14,
  });
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Refresh functions
  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const data = await api.getAdminStats();
      setStats(data);
    } catch (err) {
      console.error('Error fetching admin stats:', err);
    } finally {
      setLoadingStats(false);
    }
  };

  const loadVideos = async () => {
    setLoadingVideos(true);
    try {
      const res = await api.getVideos({ limit: 100 });
      setVideoList(res.videos);
    } catch (err) {
      console.error('Error fetching video list:', err);
    } finally {
      setLoadingVideos(false);
    }
  };

  const loadInvites = async () => {
    setLoadingInvites(true);
    try {
      const res = await api.getInvitations();
      setInvitations(res.invitations);
    } catch (err) {
      console.error('Error fetching invitations:', err);
    } finally {
      setLoadingInvites(false);
    }
  };

  const loadUsers = async () => {
    setLoadingUsers(true);
    try {
      const res = await api.getAdminUsers();
      setUserList(res.users);
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadAuditLogs = async () => {
    try {
      const res = await api.getAuditLogs();
      setAuditLogs(res.logs);
    } catch (err) {
      console.error('Error fetching audit logs:', err);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    if (activeTab === 'overview') loadAuditLogs();
    if (activeTab === 'manage-videos') loadVideos();
    if (activeTab === 'invitations') loadInvites();
    if (activeTab === 'friends') loadUsers();
  }, [activeTab]);

  // Validate MEGA link with live API
  const handleValidateMega = async () => {
    if (!addForm.megaUrl.trim()) return;
    setValidatingMega(true);
    setMegaValidationResult(null);
    setVideoErrorMsg(null);

    try {
      const res = await api.validateMegaLink(addForm.megaUrl.trim());
      setMegaValidationResult(res);
      if (res.valid && res.metadata) {
        // Auto-fill title from filename if empty
        if (!addForm.title) {
          const cleanTitle = res.metadata.fileName.replace(/\.[^/.]+$/, '').replace(/[-_.]/g, ' ');
          setAddForm((prev) => ({ ...prev, title: cleanTitle }));
        }
      }
    } catch (err: any) {
      setMegaValidationResult({
        valid: false,
        error: err?.message || 'Link validation failed. Ensure the MEGA URL contains the decryption key.',
      });
    } finally {
      setValidatingMega(false);
    }
  };

  // Submit Video
  const handleCreateVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.title.trim()) {
      setVideoErrorMsg('Please provide a title for the video.');
      return;
    }
    if (!addForm.megaUrl && !addForm.sampleStreamUrl) {
      setVideoErrorMsg('Please provide either a MEGA share link or sample stream source.');
      return;
    }

    setSubmittingVideo(true);
    setVideoSuccessMsg(null);
    setVideoErrorMsg(null);

    try {
      await api.createVideo({
        title: addForm.title,
        description: addForm.description,
        megaUrl: addForm.megaUrl || undefined,
        sampleStreamUrl: addForm.sampleStreamUrl || undefined,
        categoryIds: addForm.categoryIds,
        thumbnailUrl: addForm.thumbnailUrl || undefined,
        durationSeconds: addForm.durationSeconds,
        isFeatured: addForm.isFeatured,
        status: addForm.status,
      });

      setVideoSuccessMsg('Video added successfully to private catalog!');
      setAddForm({
        megaUrl: '',
        sampleStreamUrl: '',
        title: '',
        description: '',
        categoryIds: [],
        thumbnailUrl: '',
        durationSeconds: 0,
        isFeatured: false,
        status: 'PUBLISHED',
      });
      setMegaValidationResult(null);
      loadVideos();
      loadStats();
      if (onVideoCreated) onVideoCreated();
    } catch (err: any) {
      setVideoErrorMsg(err?.message || 'Failed to add video.');
    } finally {
      setSubmittingVideo(false);
    }
  };

  // Toggle Video Publish Status
  const handleTogglePublish = async (video: Video) => {
    const nextStatus = video.status === 'PUBLISHED' ? 'UNPUBLISHED' : 'PUBLISHED';
    try {
      await api.updateVideo(video.id, { status: nextStatus });
      setVideoList((prev) =>
        prev.map((v) => (v.id === video.id ? { ...v, status: nextStatus } : v))
      );
      loadStats();
    } catch (err: any) {
      alert('Failed to update status: ' + err.message);
    }
  };

  // Delete Video
  const handleDeleteVideo = async (videoId: string, title: string) => {
    if (!confirm(`Are you sure you want to delete "${title}"? This cannot be undone.`)) return;
    try {
      await api.deleteVideo(videoId);
      setVideoList((prev) => prev.filter((v) => v.id !== videoId));
      loadStats();
    } catch (err: any) {
      alert('Delete failed: ' + err.message);
    }
  };

  // Create Invitation
  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingInvite(true);
    try {
      const res = await api.createInvitation({
        invitedEmail: inviteForm.invitedEmail || undefined,
        role: inviteForm.role,
        maxUses: inviteForm.maxUses,
        validDays: inviteForm.validDays,
      });
      setInvitations((prev) => [res.invitation, ...prev]);
      setInviteForm({
        invitedEmail: '',
        role: 'FRIEND',
        maxUses: 1,
        validDays: 14,
      });
    } catch (err: any) {
      alert('Failed to create invitation: ' + err.message);
    } finally {
      setCreatingInvite(false);
    }
  };

  // Revoke Invitation
  const handleRevokeInvite = async (id: string) => {
    if (!confirm('Are you sure you want to revoke this invitation token?')) return;
    try {
      await api.revokeInvitation(id);
      setInvitations((prev) =>
        prev.map((inv) => (inv.id === id ? { ...inv, status: 'REVOKED' } : inv))
      );
    } catch (err: any) {
      alert('Failed to revoke: ' + err.message);
    }
  };

  // Toggle User Active Status
  const handleToggleUserStatus = async (userId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    try {
      await api.updateUserStatus(userId, newStatus);
      setUserList((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, status: newStatus } : u))
      );
      loadStats();
    } catch (err: any) {
      alert('Failed to update user status: ' + err.message);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(text);
    setTimeout(() => setCopiedToken(null), 2500);
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-3xl bg-gradient-to-r from-violet-950/40 via-[#141722] to-cyan-950/30 border border-violet-500/20 shadow-xl">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 rounded-lg bg-violet-600/30 text-violet-300 border border-violet-500/40">
              <ShieldAlert className="w-4 h-4" />
            </span>
            <span className="text-xs font-black uppercase tracking-wider text-violet-400">
              Platform Master Console
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            MEGA STREAM X Control Center
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            Manage encrypted cloud video sources, issue single-use invitation codes, configure friend access, and monitor authenticated stream performance.
          </p>
        </div>

        <button
          onClick={() => {
            loadStats();
            loadVideos();
            loadInvites();
            loadUsers();
            loadAuditLogs();
          }}
          className="self-start sm:self-center px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 text-xs font-semibold transition-all cursor-pointer flex items-center gap-2"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh Telemetry
        </button>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-white/10 overflow-x-auto pb-2">
        {[
          { id: 'overview', label: 'Overview & Stats', icon: Activity },
          { id: 'add-video', label: 'Add Video (MEGA)', icon: PlusCircle },
          { id: 'manage-videos', label: `Manage Catalog (${videoList.length})`, icon: VideoIcon },
          { id: 'invitations', label: `Invitations (${invitations.length})`, icon: Ticket },
          { id: 'friends', label: `Friends & Users (${userList.length})`, icon: Users },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: OVERVIEW & STATS */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Key Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl bg-[#12151e] border border-white/5 space-y-1">
              <p className="text-xs font-semibold text-slate-400">Total Catalog Videos</p>
              <p className="text-2xl font-black text-white">
                {stats?.videos.total_videos || videoList.length}
              </p>
              <p className="text-[11px] text-emerald-400 font-medium">
                {stats?.videos.published_videos || 0} published & streamable
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-[#12151e] border border-white/5 space-y-1">
              <p className="text-xs font-semibold text-slate-400">Stream Requests Served</p>
              <p className="text-2xl font-black text-violet-400">
                {stats?.streaming.total_stream_requests || stats?.videos.total_views || 0}
              </p>
              <p className="text-[11px] text-slate-400">
                {stats?.streaming.activeSessions || 1} active session(s)
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-[#12151e] border border-white/5 space-y-1">
              <p className="text-xs font-semibold text-slate-400">Registered Accounts</p>
              <p className="text-2xl font-black text-cyan-400">
                {stats?.users.total_users || userList.length}
              </p>
              <p className="text-[11px] text-slate-400">
                {stats?.users.friend_users || 0} invited friends
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-[#12151e] border border-white/5 space-y-1">
              <p className="text-xs font-semibold text-slate-400">Encrypted Cloud Storage</p>
              <p className="text-2xl font-black text-emerald-400">
                {stats?.storage.source_count || 0} References
              </p>
              <p className="text-[11px] text-slate-400">
                {stats?.storage.total_bytes
                  ? `${(stats.storage.total_bytes / (1024 * 1024 * 1024)).toFixed(2)} GB referenced`
                  : 'AES-256-GCM secured'}
              </p>
            </div>
          </div>

          {/* Quick Action Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 rounded-3xl bg-[#12151e] border border-white/5 space-y-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-violet-400" /> Fast MEGA Importer
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Add an authorized MEGA share link with encryption at rest. The system fetches file attributes instantly without downloading the video to disk.
              </p>
              <button
                onClick={() => setActiveTab('add-video')}
                className="px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs cursor-pointer shadow-lg shadow-violet-600/30 flex items-center gap-2"
              >
                Launch Link Importer
              </button>
            </div>

            <div className="p-6 rounded-3xl bg-[#12151e] border border-white/5 space-y-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Ticket className="w-5 h-5 text-cyan-400" /> Issue Friend Invite
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Generate a single-use token to invite a close friend. They can choose their credentials and browse your authorized collection.
              </p>
              <button
                onClick={() => setActiveTab('invitations')}
                className="px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs cursor-pointer shadow-lg shadow-cyan-600/30 flex items-center gap-2"
              >
                Create Invitation Token
              </button>
            </div>
          </div>

          {/* System Audit Log Table */}
          <div className="p-6 rounded-3xl bg-[#12151e] border border-white/5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-violet-400" /> Security & Platform Audit Trail
              </h3>
              <span className="text-[11px] text-slate-400">Recent 10 events</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-slate-400 text-[10px] uppercase font-bold">
                    <th className="py-2.5 px-3">Timestamp</th>
                    <th className="py-2.5 px-3">Action</th>
                    <th className="py-2.5 px-3">Target</th>
                    <th className="py-2.5 px-3">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {auditLogs.slice(0, 10).map((log) => (
                    <tr key={log.id} className="hover:bg-white/[0.02]">
                      <td className="py-2.5 px-3 text-slate-400 font-mono text-[11px]">
                        {new Date(log.created_at).toLocaleTimeString()}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-200">
                        <span className="px-2 py-0.5 rounded bg-white/5 text-violet-300 font-mono text-[10px]">
                          {log.action}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">{log.target_type}</td>
                      <td className="py-2.5 px-3 text-slate-400 truncate max-w-xs font-mono text-[11px]">
                        {log.details_json}
                      </td>
                    </tr>
                  ))}
                  {auditLogs.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-slate-400">
                        No audit events recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ADD VIDEO (MEGA INTEGRATION) */}
      {activeTab === 'add-video' && (
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="p-6 rounded-3xl bg-[#12151e] border border-white/5 space-y-6">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <LinkIcon className="w-5 h-5 text-violet-400" /> Add Video via MEGA Share Link
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Enter your authorized MEGA link (e.g.{' '}
                <code className="text-cyan-300 font-mono">https://mega.nz/file/xyz#key</code>). Direct streaming works immediately without requiring any environment variables or manual encryption keys.
              </p>
            </div>

            {videoSuccessMsg && (
              <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{videoSuccessMsg}</span>
              </div>
            )}

            {videoErrorMsg && (
              <div className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{videoErrorMsg}</span>
              </div>
            )}

            <form onSubmit={handleCreateVideo} className="space-y-5">
              {/* MEGA Link with Live Validator Button */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                  <span>MEGA Share URL</span>
                  <span className="text-[10px] text-slate-400 font-normal">Requires decryption key fragment (#...)</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    placeholder="https://mega.nz/file/ABC123xyz#SecurityKey456"
                    value={addForm.megaUrl}
                    onChange={(e) => setAddForm({ ...addForm, megaUrl: e.target.value })}
                    className="flex-1 bg-[#181c28] text-xs text-white placeholder-slate-500 px-3.5 py-2.5 rounded-xl border border-white/10 focus:outline-none focus:border-violet-500"
                  />
                  <button
                    type="button"
                    onClick={handleValidateMega}
                    disabled={validatingMega || !addForm.megaUrl.trim()}
                    className="px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:bg-violet-900/50 text-white font-semibold text-xs transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
                  >
                    {validatingMega ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" /> Validate
                      </>
                    )}
                  </button>
                </div>
              </div>


              {/* Validation Feedback Box */}
              {megaValidationResult && (
                <div
                  className={`p-4 rounded-2xl border text-xs space-y-2 ${
                    megaValidationResult.valid
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold">
                    {megaValidationResult.valid ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-rose-400" />
                    )}
                    <span>
                      {megaValidationResult.valid
                        ? 'MEGA Link Verified & Attributes Resolved'
                        : 'Validation Error'}
                    </span>
                  </div>

                  {megaValidationResult.valid && megaValidationResult.metadata && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] pt-1">
                      <div>
                        <span className="text-slate-400">File Name:</span>{' '}
                        <span className="font-semibold">{megaValidationResult.metadata.fileName}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">File Size:</span>{' '}
                        <span className="font-semibold">
                          {(megaValidationResult.metadata.fileSize / (1024 * 1024)).toFixed(1)} MB
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400">Format:</span>{' '}
                        <span className="font-semibold">{megaValidationResult.metadata.mimeType}</span>
                      </div>
                    </div>
                  )}

                  {!megaValidationResult.valid && (
                    <p className="text-[11px] text-rose-300 leading-relaxed">
                      {megaValidationResult.error}
                    </p>
                  )}
                </div>
              )}

              {/* Title & Duration */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">Video Title *</label>
                  <input
                    type="text"
                    required
                    placeholder="Enter descriptive title"
                    value={addForm.title}
                    onChange={(e) => setAddForm({ ...addForm, title: e.target.value })}
                    className="w-full bg-[#181c28] text-xs text-white px-3.5 py-2.5 rounded-xl border border-white/10 focus:outline-none focus:border-violet-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">Duration (seconds)</label>
                  <input
                    type="number"
                    min={0}
                    placeholder="e.g. 640"
                    value={addForm.durationSeconds || ''}
                    onChange={(e) => setAddForm({ ...addForm, durationSeconds: Number(e.target.value) || 0 })}
                    className="w-full bg-[#181c28] text-xs text-white px-3.5 py-2.5 rounded-xl border border-white/10 focus:outline-none focus:border-violet-500"
                  />
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">Synopsis / Description</label>
                <textarea
                  rows={3}
                  placeholder="Overview of the video storyline, director notes, or educational curriculum..."
                  value={addForm.description}
                  onChange={(e) => setAddForm({ ...addForm, description: e.target.value })}
                  className="w-full bg-[#181c28] text-xs text-white px-3.5 py-2.5 rounded-xl border border-white/10 focus:outline-none focus:border-violet-500"
                />
              </div>

              {/* Thumbnail URL */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">Thumbnail Image URL</label>
                <input
                  type="url"
                  placeholder="https://images.unsplash.com/..."
                  value={addForm.thumbnailUrl}
                  onChange={(e) => setAddForm({ ...addForm, thumbnailUrl: e.target.value })}
                  className="w-full bg-[#181c28] text-xs text-white px-3.5 py-2.5 rounded-xl border border-white/10 focus:outline-none focus:border-violet-500"
                />
              </div>

              {/* Categories Checklist */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300">Assign Categories</label>
                <div className="flex flex-wrap gap-2">
                  {categories.map((c) => {
                    const isSelected = addForm.categoryIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setAddForm({
                              ...addForm,
                              categoryIds: addForm.categoryIds.filter((id) => id !== c.id),
                            });
                          } else {
                            setAddForm({
                              ...addForm,
                              categoryIds: [...addForm.categoryIds, c.id],
                            });
                          }
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-violet-600 text-white shadow-sm'
                            : 'bg-[#181c28] text-slate-400 hover:text-white border border-white/5'
                        }`}
                      >
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Feature and Status Toggles */}
              <div className="flex items-center gap-6 pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={addForm.isFeatured}
                    onChange={(e) => setAddForm({ ...addForm, isFeatured: e.target.checked })}
                    className="rounded bg-[#181c28] border-white/20 accent-violet-600"
                  />
                  <span>Featured Hero banner</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={addForm.status === 'PUBLISHED'}
                    onChange={(e) =>
                      setAddForm({
                        ...addForm,
                        status: e.target.checked ? 'PUBLISHED' : 'UNPUBLISHED',
                      })
                    }
                    className="rounded bg-[#181c28] border-white/20 accent-violet-600"
                  />
                  <span>Publish to friends immediately</span>
                </label>
              </div>

              {/* Submit Button */}
              <div className="pt-4 border-t border-white/10 flex justify-end">
                <button
                  type="submit"
                  disabled={submittingVideo}
                  className="px-6 py-3 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-xs transition-all shadow-xl shadow-violet-600/30 flex items-center gap-2 cursor-pointer"
                >
                  {submittingVideo ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Storing & Encrypting...
                    </>
                  ) : (
                    <>
                      <PlusCircle className="w-4 h-4" /> Save & Encrypt Video
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TAB 3: MANAGE VIDEOS */}
      {activeTab === 'manage-videos' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white">Catalog Management</h2>
            <button
              onClick={() => setActiveTab('add-video')}
              className="px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs flex items-center gap-1.5 cursor-pointer shadow-md shadow-violet-600/30"
            >
              <PlusCircle className="w-3.5 h-3.5" /> Add New Video
            </button>
          </div>

          <div className="rounded-2xl bg-[#12151e] border border-white/5 overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-slate-400 text-[10px] uppercase font-bold bg-[#141722]">
                  <th className="py-3 px-4">Video</th>
                  <th className="py-3 px-4">Duration</th>
                  <th className="py-3 px-4">Streams</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {videoList.map((v) => (
                  <tr key={v.id} className="hover:bg-white/[0.02]">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={resolveBackendUrl(v.thumbnail_url)}
                          alt=""
                          className="w-12 h-8 rounded-lg object-cover bg-slate-800"
                        />
                        <div>
                          <p className="font-bold text-slate-100 truncate max-w-xs">{v.title}</p>
                          <span className="text-[10px] text-slate-400">
                            {v.categories?.map((c) => c.name).join(', ') || 'Uncategorized'}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-400">
                      {formatDuration(v.duration_seconds)}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-300">{v.view_count || 0}</td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => handleTogglePublish(v)}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold cursor-pointer transition-colors ${
                          v.status === 'PUBLISHED'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        {v.status}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {onPreviewVideo && (
                          <button
                            onClick={() => onPreviewVideo(v)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
                            title="Preview Video Stream"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteVideo(v.id, v.title)}
                          className="p-1.5 rounded-lg text-rose-400 hover:text-rose-200 hover:bg-rose-500/10"
                          title="Delete Video"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: INVITATIONS */}
      {activeTab === 'invitations' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Create Invite Form */}
          <div className="p-6 rounded-3xl bg-[#12151e] border border-white/5 space-y-4 h-fit">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Ticket className="w-4 h-4 text-cyan-400" /> Generate Invitation
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Create an exclusive invite code for a trusted friend. Tokens cannot be guessed and expire automatically.
            </p>

            <form onSubmit={handleCreateInvite} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Invited Email (Optional)</label>
                <input
                  type="email"
                  placeholder="friend@example.com"
                  value={inviteForm.invitedEmail}
                  onChange={(e) => setInviteForm({ ...inviteForm, invitedEmail: e.target.value })}
                  className="w-full bg-[#181c28] text-xs text-white px-3 py-2 rounded-xl border border-white/10"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Max Uses</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={inviteForm.maxUses}
                    onChange={(e) => setInviteForm({ ...inviteForm, maxUses: Number(e.target.value) || 1 })}
                    className="w-full bg-[#181c28] text-xs text-white px-3 py-2 rounded-xl border border-white/10"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Valid Days</label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={inviteForm.validDays}
                    onChange={(e) => setInviteForm({ ...inviteForm, validDays: Number(e.target.value) || 14 })}
                    className="w-full bg-[#181c28] text-xs text-white px-3 py-2 rounded-xl border border-white/10"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={creatingInvite}
                className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-cyan-600/30"
              >
                {creatingInvite ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ticket className="w-4 h-4" />}
                Generate Secure Token
              </button>
            </form>
          </div>

          {/* Invitations List */}
          <div className="lg:col-span-2 space-y-4">
            <h3 className="text-base font-bold text-white">Active & Past Invitations</h3>
            <div className="rounded-2xl bg-[#12151e] border border-white/5 overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-slate-400 text-[10px] uppercase font-bold bg-[#141722]">
                    <th className="py-3 px-4">Token Code</th>
                    <th className="py-3 px-4">Uses</th>
                    <th className="py-3 px-4">Expires</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {invitations.map((inv) => (
                    <tr key={inv.id} className="hover:bg-white/[0.02]">
                      <td className="py-3 px-4 font-mono font-bold text-cyan-300">
                        <div className="flex items-center gap-2">
                          <span>{inv.token}</span>
                          <button
                            onClick={() => copyToClipboard(inv.token)}
                            className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white"
                            title="Copy code"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          {copiedToken === inv.token && (
                            <span className="text-[10px] text-emerald-400">Copied!</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-300">
                        {inv.uses_count} / {inv.max_uses}
                      </td>
                      <td className="py-3 px-4 text-slate-400">
                        {new Date(inv.expires_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            inv.status === 'PENDING'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : inv.status === 'ACCEPTED'
                              ? 'bg-violet-500/20 text-violet-300'
                              : 'bg-rose-500/20 text-rose-300'
                          }`}
                        >
                          {inv.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {inv.status === 'PENDING' && (
                          <button
                            onClick={() => handleRevokeInvite(inv.id)}
                            className="text-rose-400 hover:text-rose-300 font-semibold text-[11px]"
                          >
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {invitations.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-400">
                        No invitations issued yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: FRIENDS & USERS */}
      {activeTab === 'friends' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white">Friends & Authorized Users</h2>
            <span className="text-xs text-slate-400">{userList.length} total members</span>
          </div>

          <div className="rounded-2xl bg-[#12151e] border border-white/5 overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-slate-400 text-[10px] uppercase font-bold bg-[#141722]">
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Sessions</th>
                  <th className="py-3 px-4">Watch Count</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Access Control</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {userList.map((u) => (
                  <tr key={u.id} className="hover:bg-white/[0.02]">
                    <td className="py-3 px-4">
                      <div>
                        <p className="font-bold text-slate-100">{u.display_name}</p>
                        <p className="text-[11px] text-slate-400">{u.email}</p>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          u.role === 'OWNER'
                            ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                            : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                        }`}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-300 font-semibold">
                      {u.active_sessions || 0} active
                    </td>
                    <td className="py-3 px-4 text-slate-400">{u.watched_videos_count || 0} titles</td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          u.status === 'ACTIVE'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-rose-500/20 text-rose-300'
                        }`}
                      >
                        {u.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {u.role !== 'OWNER' && (
                        <button
                          onClick={() => handleToggleUserStatus(u.id, u.status)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                            u.status === 'ACTIVE'
                              ? 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300'
                              : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300'
                          }`}
                        >
                          {u.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
