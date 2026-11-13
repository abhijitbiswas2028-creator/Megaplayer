import { Router, type Request, type Response, type NextFunction, type RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';
import { collection } from './store.ts';
import { generateSecureToken, hashPassword, verifyPassword } from '../utils/crypto.ts';

export const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler => (req,res,next) => { Promise.resolve(fn(req,res,next)).catch(next); };
export const publicUser = (u: any) => ({ id:u.id, email:u.email, displayName:u.display_name, role:u.role, status:u.status });
export const mongoAuth = wrap(async (req,res,next) => {
  const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7).trim() : undefined;
  const token = bearer || req.cookies?.msx_session || (typeof req.query.token === 'string' ? req.query.token : undefined);
  if (token) {
    const session = await collection('sessions').findOne({ token, expires_at: { $gt: new Date().toISOString() } });
    const user = session && await collection('users').findOne({ id:session.user_id, status:'ACTIVE' });
    if (user) { req.user = publicUser(user); req.sessionToken = token; }
  }
  next();
});
export async function session(userId: string, req: Request, res: Response) {
  const token = generateSecureToken();
  await collection('sessions').insertOne({id:randomUUID(),token,user_id:userId,ip_address:req.ip,user_agent:req.headers['user-agent'],created_at:new Date().toISOString(),expires_at:new Date(Date.now()+30*86400000).toISOString()});
  res.cookie('msx_session',token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:process.env.NODE_ENV==='production'?'none':'lax',maxAge:30*86400000,path:'/'});
  return token;
}
export async function audit(req: Request, action: string, type: string, id: string, details: object = {}) {
  await collection('audit_logs').insertOne({id:randomUUID(),user_id:req.user?.id,action,target_type:type,target_id:id,ip_address:req.ip,details_json:JSON.stringify(details),created_at:new Date().toISOString()});
}
export const mongoAuthRouter = Router();
mongoAuthRouter.get('/me',(req,res)=>res.json({user:req.user||null,token:req.sessionToken}));
mongoAuthRouter.post('/login',wrap(async(req,res)=>{
  const {email,password}=req.body||{};
  if(typeof email!=='string'||typeof password!=='string') {res.status(400).json({error:'Email and password are required.'});return;}
  const user=await collection('users').findOne({email:email.trim()},{collation:{locale:'en',strength:2}});
  if(!user||!verifyPassword(password,user.password_hash,user.salt)){res.status(401).json({error:'Invalid email or password.'});return;}
  if(user.status!=='ACTIVE'){res.status(403).json({error:'Your account is deactivated.'});return;}
  const token=await session(user.id,req,res);
  req.user=publicUser(user);
  await audit(req,'USER_LOGIN','USER',user.id);
  res.json({user:publicUser(user),token});
}));
mongoAuthRouter.post('/logout',wrap(async(req,res)=>{
  if(req.sessionToken) await collection('sessions').deleteOne({token:req.sessionToken});
  res.clearCookie('msx_session',{path:'/',secure:process.env.NODE_ENV==='production',sameSite:process.env.NODE_ENV==='production'?'none':'lax'});
  res.json({success:true});
}));
mongoAuthRouter.post('/quick-demo-login',wrap(async(req,res)=>{
  if(process.env.NODE_ENV==='production'){res.status(403).json({error:'Demo login is disabled in production.'});return;}
  const user=await collection('users').findOne({role:req.body?.role==='OWNER'?'OWNER':'FRIEND',status:'ACTIVE'});
  if(!user){res.status(404).json({error:'No active user found.'});return;}
  res.json({user:publicUser(user),token:await session(user.id,req,res)});
}));
mongoAuthRouter.post('/accept-invite',wrap(async(req,res)=>{
  const {token,email,password,displayName}=req.body||{};
  if([token,email,password,displayName].some(v=>typeof v!=='string'||!v.trim())||password.length<8){res.status(400).json({error:'Valid invitation, email, name and password (8+ characters) are required.'});return;}
  const invite=await collection('invitations').findOneAndUpdate({token:token.trim(),status:'PENDING',expires_at:{$gt:new Date().toISOString()},$expr:{$lt:['$uses_count','$max_uses']}},{$inc:{uses_count:1}},{returnDocument:'after'});
  if(!invite){res.status(400).json({error:'Invitation is invalid, expired or fully used.'});return;}
  const now=new Date().toISOString();
  const {hash,salt}=hashPassword(password);
  const user={id:randomUUID(),email:email.trim(),password_hash:hash,salt,display_name:displayName.trim(),role:invite.role,status:'ACTIVE',created_at:now,updated_at:now};
  try { await collection('users').insertOne(user); }
  catch(e){await collection('invitations').updateOne({id:invite.id},{$inc:{uses_count:-1}});throw e;}
  if(invite.uses_count>=invite.max_uses) await collection('invitations').updateOne({id:invite.id,status:'PENDING',uses_count:{$gte:invite.max_uses}},{$set:{status:'ACCEPTED'}});
  res.status(201).json({user:publicUser(user),token:await session(user.id,req,res)});
}));
