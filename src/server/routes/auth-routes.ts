import { Router, Request, Response } from 'express';
import { db } from '../db.ts';
import { verifyPassword, hashPassword } from '../utils/crypto.ts';
import { createSession, requireAuth } from '../auth.ts';

export const authRouter = Router();

// POST /api/v1/auth/login
authRouter.post('/login', (req: Request, res: Response) => {
  const { email, password } = req.body || {};

  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const user = db.prepare(`
    SELECT id, email, password_hash, salt, display_name, role, status
    FROM users
    WHERE LOWER(email) = LOWER(?)
  `).get(email.trim()) as any;

  if (!user || !verifyPassword(password, user.password_hash, user.salt)) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  if (user.status === 'DISABLED') {
    res.status(403).json({ error: 'Your account is deactivated. Contact the owner.' });
    return;
  }

  const token = createSession(user.id, req, res);

  // Record audit log
  db.prepare(`
    INSERT INTO audit_logs (id, user_id, action, target_type, target_id, ip_address, details_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    user.id,
    'USER_LOGIN',
    'USER',
    user.id,
    req.ip || 'unknown',
    JSON.stringify({ email: user.email, role: user.role }),
    new Date().toISOString()
  );

  res.json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      role: user.role,
      status: user.status,
    },
    token,
  });
});

// POST /api/v1/auth/logout
authRouter.post('/logout', (req: Request, res: Response) => {
  const token = req.cookies?.msx_session || req.sessionToken;
  if (token) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }
  res.clearCookie('msx_session', { path: '/' });
  res.json({ success: true, message: 'Logged out successfully.' });
});

// GET /api/v1/auth/me
authRouter.get('/me', (req: Request, res: Response) => {
  if (!req.user) {
    res.json({ user: null });
    return;
  }

  res.json({
    user: req.user,
    token: req.sessionToken,
  });
});

// POST /api/v1/auth/accept-invite
authRouter.post('/accept-invite', (req: Request, res: Response) => {
  const { token, email, displayName, password } = req.body || {};

  if (!token || !email || !password || !displayName) {
    res.status(400).json({ error: 'Invitation token, email, display name, and password are required.' });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    return;
  }

  const invite = db.prepare(`
    SELECT id, token, role, max_uses, uses_count, expires_at, status
    FROM invitations
    WHERE token = ?
  `).get(token.trim()) as any;

  if (!invite) {
    res.status(404).json({ error: 'Invitation code not found or invalid.' });
    return;
  }

  if (invite.status === 'REVOKED') {
    res.status(400).json({ error: 'This invitation code has been revoked by the owner.' });
    return;
  }

  if (new Date(invite.expires_at) < new Date() || invite.status === 'EXPIRED') {
    res.status(400).json({ error: 'This invitation code has expired.' });
    return;
  }

  if (invite.uses_count >= invite.max_uses) {
    res.status(400).json({ error: 'This invitation code has reached its maximum allowed uses.' });
    return;
  }

  // Check if email already registered
  const existingUser = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(email.trim()) as any;
  if (existingUser) {
    res.status(409).json({ error: 'An account with this email address already exists. Please log in instead.' });
    return;
  }

  const now = new Date().toISOString();
  const userId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const { hash, salt } = hashPassword(password);

  // Insert user
  db.prepare(`
    INSERT INTO users (id, email, password_hash, salt, display_name, role, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(userId, email.trim(), hash, salt, displayName.trim(), invite.role, 'ACTIVE', now, now);

  // Update invite uses
  const newUses = invite.uses_count + 1;
  const newStatus = newUses >= invite.max_uses ? 'ACCEPTED' : 'PENDING';
  db.prepare(`
    UPDATE invitations
    SET uses_count = ?, status = ?
    WHERE id = ?
  `).run(newUses, newStatus, invite.id);

  // Record audit log
  db.prepare(`
    INSERT INTO audit_logs (id, user_id, action, target_type, target_id, ip_address, details_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    userId,
    'INVITATION_ACCEPTED',
    'INVITATION',
    invite.id,
    req.ip || 'unknown',
    JSON.stringify({ email, inviteToken: token, role: invite.role }),
    now
  );

  const sessionToken = createSession(userId, req, res);

  res.status(201).json({
    user: {
      id: userId,
      email: email.trim(),
      displayName: displayName.trim(),
      role: invite.role,
      status: 'ACTIVE',
    },
    token: sessionToken,
    message: 'Account created successfully through invitation!',
  });
});

// POST /api/v1/auth/quick-demo-login: Switch seamlessly between seeded Owner and Friend for instant test & review
authRouter.post('/quick-demo-login', (req: Request, res: Response) => {
  const { role } = req.body || {};
  const targetRole = role === 'OWNER' ? 'OWNER' : 'FRIEND';

  const user = db.prepare('SELECT id, email, display_name, role, status FROM users WHERE role = ? AND status = ? LIMIT 1')
    .get(targetRole, 'ACTIVE') as any;

  if (!user) {
    res.status(404).json({ error: `No active ${targetRole} user found in database.` });
    return;
  }

  const token = createSession(user.id, req, res);

  res.json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      role: user.role,
      status: user.status,
    },
    token,
  });
});
