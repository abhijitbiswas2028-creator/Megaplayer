import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { collection } from './store.ts';
import { wrap, audit } from './auth.ts';
import { requireOwner } from '../auth.ts';
import { generateSecureToken } from '../utils/crypto.ts';
export const mongoAdminRouter=Router();
mongoAdminRouter.use(requireOwner);
async function sums(name:string, group:object) {return (await collection(name).aggregate([{$group:{_id:null,...group}},{$project:{_id:0}}]).toArray())[0]||Object.fromEntries(Object.keys(group).map(k=>[k,0]));}
mongoAdminRouter.get('/stats',wrap(async(req,res)=>{
 const [videos,users,storage,streaming,activeSessions]=await Promise.all([
  sums('videos',{total_videos:{$sum:1},published_videos:{$sum:{$cond:[{$eq:['$status','PUBLISHED']},1,0]}},total_views:{$sum:'$view_count'},mega_sources_count:{$sum:{$cond:['$mega_source_id',1,0]}}}),
  sums('users',{total_users:{$sum:1},friend_users:{$sum:{$cond:[{$eq:['$role','FRIEND']},1,0]}},active_users:{$sum:{$cond:[{$eq:['$status','ACTIVE']},1,0]}}}),
  sums('mega_sources',{source_count:{$sum:1},total_bytes:{$sum:'$file_size'}}),
  sums('stream_metrics',{total_stream_requests:{$sum:1},total_bytes_served:{$sum:'$bytes_streamed'}}),
  collection('sessions').countDocuments({expires_at:{$gt:new Date().toISOString()}}),
 ]);res.json({videos,users,storage,streaming:{...streaming,activeSessions}});
}));
mongoAdminRouter.get('/users',wrap(async(req,res)=>{
 const users=await collection('users').find({},{projection:{_id:0,password_hash:0,salt:0}}).sort({created_at:-1}).toArray();
 res.json({users:await Promise.all(users.map(async u=>({...u,active_sessions:await collection('sessions').countDocuments({user_id:u.id,expires_at:{$gt:new Date().toISOString()}}),watched_videos_count:await collection('watch_progress').countDocuments({user_id:u.id})})))});
}));
mongoAdminRouter.patch('/users/:id/status',wrap(async(req,res)=>{
 const status=req.body?.status;
 if(req.params.id===req.user!.id||!['ACTIVE','DISABLED'].includes(status)){res.status(400).json({error:'Invalid status or attempt to deactivate your own account.'});return;}
 const r=await collection('users').updateOne({id:req.params.id},{$set:{status,updated_at:new Date().toISOString()}});
 if(!r.matchedCount){res.status(404).json({error:'User not found'});return;}
 if(status==='DISABLED')await collection('sessions').deleteMany({user_id:req.params.id});
 await audit(req,'USER_STATUS_UPDATED','USER',req.params.id,{status});res.json({success:true,status});
}));
mongoAdminRouter.get('/invitations',wrap(async(req,res)=>{
 const invitations=await collection('invitations').aggregate([{$sort:{created_at:-1}},{$lookup:{from:'users',localField:'created_by_user_id',foreignField:'id',as:'creator'}},{$set:{created_by_name:{$arrayElemAt:['$creator.display_name',0]}}},{$project:{_id:0,creator:0}}]).toArray();res.json({invitations});
}));
mongoAdminRouter.post('/invitations',wrap(async(req,res)=>{
 const b=req.body||{},id=randomUUID(),token='MSX-VIP-'+generateSecureToken(8).toUpperCase();
 const role=b.role==='OWNER'?'OWNER':'FRIEND',maxUses=Math.max(1,Math.min(1000,Math.trunc(Number(b.maxUses)||1))),expiresAt=new Date(Date.now()+Math.max(1,Math.min(365,Number(b.validDays)||14))*86400000).toISOString();
 await collection('invitations').insertOne({id,token,role,created_by_user_id:req.user!.id,invited_email:typeof b.invitedEmail==='string'?b.invitedEmail.trim():null,max_uses:maxUses,uses_count:0,expires_at:expiresAt,status:'PENDING',created_at:new Date().toISOString()});
 await audit(req,'INVITATION_CREATED','INVITATION',id);res.status(201).json({success:true,invitation:{id,token,role,maxUses,expiresAt,status:'PENDING',invitedEmail:b.invitedEmail}});
}));
mongoAdminRouter.delete('/invitations/:id',wrap(async(req,res)=>{
 await collection('invitations').updateOne({id:req.params.id},{$set:{status:'REVOKED'}});res.json({success:true});
}));
mongoAdminRouter.get('/audit-logs',wrap(async(req,res)=>{
 const logs=await collection('audit_logs').aggregate([{$sort:{created_at:-1}},{$limit:100},{$lookup:{from:'users',localField:'user_id',foreignField:'id',as:'user'}},{$set:{display_name:{$arrayElemAt:['$user.display_name',0]},email:{$arrayElemAt:['$user.email',0]}}},{$project:{_id:0,user:0}}]).toArray();res.json({logs});
}));
