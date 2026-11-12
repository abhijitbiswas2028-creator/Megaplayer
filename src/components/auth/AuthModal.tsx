import React, { useState } from 'react';
import { api } from '../../lib/api.ts';
import { User } from '../../types/index.ts';
import {
  Key,
  Ticket,
  X,
  AlertCircle,
  Loader2,
  Sparkles,
  ShieldCheck,
  UserCheck
} from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (user: User, token: string) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onAuthSuccess }) => {
  const [mode, setMode] = useState<'login' | 'invite'>('login');

  // Login form
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Invite registration form
  const [inviteToken, setInviteToken] = useState('MSX-VIP-INVITE-2026');
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePassword, setInvitePassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await api.login(loginEmail, loginPassword);
      onAuthSuccess(res.user, res.token);
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Login failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await api.acceptInvite({
        token: inviteToken.trim(),
        displayName: inviteName.trim(),
        email: inviteEmail.trim(),
        password: invitePassword,
      });
      onAuthSuccess(res.user, res.token);
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to redeem invitation code.');
    } finally {
      setLoading(false);
    }
  };

  const prefillOwnerDemo = () => {
    setMode('login');
    setLoginEmail('owner@megastreamx.com');
    setLoginPassword('Owner12345!');
    setErrorMessage(null);
  };

  const prefillFriendDemo = () => {
    setMode('login');
    setLoginEmail('friend@megastreamx.com');
    setLoginPassword('Friend12345!');
    setErrorMessage(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-3xl bg-[#12151e] border border-white/10 p-6 sm:p-8 space-y-6 shadow-2xl shadow-violet-950/40"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-white shadow-md">
              <Key className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white">MEGA STREAM X</h2>
              <p className="text-[10px] text-slate-400 font-semibold tracking-wider uppercase">
                Private Cloud Access
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Demo Credentials Fill Helpers */}
        <div className="p-3 rounded-2xl bg-[#181c28] border border-white/5 space-y-2">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-400">
            <span className="flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" /> Instant Demo Tester:
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <button
              type="button"
              onClick={prefillOwnerDemo}
              className="p-2 rounded-xl bg-violet-600/20 hover:bg-violet-600/30 text-violet-300 border border-violet-500/30 font-semibold text-center transition-colors cursor-pointer"
            >
              Fill Owner Login
            </button>
            <button
              type="button"
              onClick={prefillFriendDemo}
              className="p-2 rounded-xl bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/30 font-semibold text-center transition-colors cursor-pointer"
            >
              Fill Friend Login
            </button>
          </div>
        </div>

        {/* Tabs: Login vs Redeem Invite */}
        <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-[#090b10] border border-white/5 text-xs font-bold">
          <button
            onClick={() => {
              setMode('login');
              setErrorMessage(null);
            }}
            className={`py-2 rounded-xl transition-all cursor-pointer ${
              mode === 'login'
                ? 'bg-violet-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => {
              setMode('invite');
              setErrorMessage(null);
            }}
            className={`py-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 ${
              mode === 'invite'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Ticket className="w-3.5 h-3.5" /> Redeem Invite
          </button>
        </div>

        {/* Error message banner */}
        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* FORM 1: LOGIN */}
        {mode === 'login' ? (
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Email Address</label>
              <input
                type="email"
                required
                placeholder="owner@megastreamx.com"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="w-full bg-[#181c28] text-xs text-white px-3.5 py-2.5 rounded-xl border border-white/10 focus:outline-none focus:border-violet-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Password</label>
              <input
                type="password"
                required
                placeholder="••••••••••••"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full bg-[#181c28] text-xs text-white px-3.5 py-2.5 rounded-xl border border-white/10 focus:outline-none focus:border-violet-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 text-white font-bold text-xs transition-all shadow-xl shadow-violet-600/30 flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              Enter Cinema Platform
            </button>
          </form>
        ) : (
          /* FORM 2: REDEEM INVITATION */
          <form onSubmit={handleInviteSubmit} className="space-y-3.5">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span>Invitation Token Code</span>
                <span className="text-[10px] text-cyan-400 font-mono">Single-use token</span>
              </label>
              <input
                type="text"
                required
                placeholder="MSX-VIP-INVITE-2026"
                value={inviteToken}
                onChange={(e) => setInviteToken(e.target.value)}
                className="w-full bg-[#181c28] text-xs text-cyan-300 font-mono font-bold px-3.5 py-2.5 rounded-xl border border-white/10 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Your Display Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Jordan Miller"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                className="w-full bg-[#181c28] text-xs text-white px-3.5 py-2 rounded-xl border border-white/10 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Email Address</label>
              <input
                type="email"
                required
                placeholder="jordan@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="w-full bg-[#181c28] text-xs text-white px-3.5 py-2 rounded-xl border border-white/10 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Create Password (min 8 chars)</label>
              <input
                type="password"
                required
                minLength={8}
                placeholder="••••••••••••"
                value={invitePassword}
                onChange={(e) => setInvitePassword(e.target.value)}
                className="w-full bg-[#181c28] text-xs text-white px-3.5 py-2 rounded-xl border border-white/10 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 text-white font-bold text-xs transition-all shadow-xl shadow-cyan-600/30 flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
              Accept Invitation & Join
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
