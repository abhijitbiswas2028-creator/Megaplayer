import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { collection } from './store.ts';
import { wrap, audit } from './auth.ts';
import { requireAuth, requireOwner } from '../auth.ts';
import { enrich, visible, findVideo, escapeRegex, categoryIds } from './catalog.ts';
import { megaAdapter } from '../mega-adapter.ts';
import { parseMegaUrl } from '../utils/mega-url.ts';
import { encryptSensitiveRef } from '../utils/crypto.ts';
import { queueThumbnailRepair } from '../video-cache.ts';
import { handleVideoStream } from '../routes/video-routes.ts';

export const mongoRouter=Router();
mongoRouter.use(requireAuth);
const categories=wrap(async(req,res)=>{
  const cats=await collection('categories').find({},{projection:{_id:0}}).sort({sort_order:1}).toArray();
  const counts=await collection('videos').aggregate([{$match:visible(req)},{$unwind:'$category_ids'},{$group:{_id:'$category_ids',count:{$sum:1}}}]).toArray();
  res.json({categories:cats.map(c=>({...c,video_count:counts.find(v=>v._id===c.id)?.count||0}))});
});
mongoRouter.get(['/categories','/videos/categories','/videos/categories/list'],categories);
mongoRouter.get('/videos',wrap(async(req,res)=>{
  const filter=visible(req);
  if(typeof req.query.category==='string'&&req.query.category!=='all'){
    const cat=await collection('categories').findOne({$or:[{id:req.query.category},{slug:req.query.category}]});
    if(!cat){res.json({videos:[]});return;}
    filter.category_ids=cat.id;
  }
  if(typeof req.query.search==='string'&&req.query.search.trim()){
    const regex={$regex:escapeRegex(req.query.search.trim().slice(0,200)),$options:'i'};
    filter.$or=[{title:regex},{description:regex}];
  }
  const sort:Record<string,1|-1>=req.query.sort==='title'?{title:1}:req.query.sort==='views'?{view_count:-1,created_at:-1}:req.query.sort==='duration'?{duration_seconds:-1}:{is_featured:-1,created_at:-1};
  const limit=Math.min(200,Math.max(1,parseInt(String(req.query.limit),10)||100));
  const offset=Math.max(0,parseInt(String(req.query.offset),10)||0);
  const videos=await collection('videos').find(filter).sort(sort).skip(offset).limit(limit).toArray();
  res.json({videos:await enrich(videos,req.user!.id)});
}));
mongoRouter.get('/videos/:id/resolutions',wrap(async(req,res)=>{
  const v=await findVideo(req,req.params.id);if(!v){res.status(404).json({error:'Video not found'});return;}
  res.json({videoId:v.id,quality:'original',resolutions:[]});
}));
mongoRouter.get('/videos/:id/stream',wrap(async(req,res)=>handleVideoStream(req,res,req.method==='HEAD')));
mongoRouter.head('/videos/:id/stream',wrap(async(req,res)=>handleVideoStream(req,res,true)));
mongoRouter.get('/videos/:id',wrap(async(req,res)=>{
  const v=await findVideo(req,req.params.id);if(!v){res.status(404).json({error:'Video not found'});return;}
  const [video]=await enrich([v],req.user!.id);
  const megaInfo=req.user!.role==='OWNER'&&v.mega_source_id?await collection('mega_sources').findOne({id:v.mega_source_id},{projection:{_id:0,id:1,file_id:1,file_name:1,file_size:1,mime_type:1,created_at:1}}):null;
  res.json({video:{...video,megaInfo}});
}));
mongoRouter.post('/videos/validate-mega',requireOwner,wrap(async(req,res)=>{
  const url=req.body?.url;
  if(typeof url!=='string'||!parseMegaUrl(url).isValid){res.status(400).json({valid:false,error:'Invalid MEGA URL'});return;}
  try{res.json({valid:true,metadata:await megaAdapter.resolveLink(url)});}catch{res.status(400).json({valid:false,error:'Could not resolve the MEGA video.'});}
}));
mongoRouter.post('/videos',requireOwner,wrap(async(req,res)=>{
  const b=req.body||{};
  if(typeof b.title!=='string'||!b.title.trim()){res.status(400).json({error:'Video title is required.'});return;}
  const cats=await categoryIds(b.categoryIds||[]);
  const now=new Date().toISOString();
  let sourceId:string|null=null;
  let embedUrl=b.embedUrl||null;
  if(b.megaUrl){
    if(typeof b.megaUrl!=='string'||!parseMegaUrl(b.megaUrl).isValid){res.status(400).json({error:'Invalid MEGA URL'});return;}
    let meta;
    try{meta=await megaAdapter.resolveLink(b.megaUrl);}catch{res.status(400).json({error:'Could not resolve the MEGA video.'});return;}
    const encrypted=encryptSensitiveRef(b.megaUrl.trim());sourceId=randomUUID();
    await collection('mega_sources').insertOne({id:sourceId,encrypted_ref:encrypted.ciphertext,iv:encrypted.iv,auth_tag:encrypted.authTag,file_id:meta.id,file_name:meta.name,file_size:meta.size,mime_type:meta.mimeType,created_at:now});
    embedUrl=embedUrl||parseMegaUrl(b.megaUrl).embedUrl;
  }
  const id='vid_'+randomUUID();
  const slug=b.title.toLowerCase().replace(/[^a-z0-9]+/g,'-')+'-'+id;
  try{await collection('videos').insertOne({id,title:b.title.trim(),description:typeof b.description==='string'?b.description:'',slug,duration_seconds:Math.max(0,Number(b.durationSeconds)||0),thumbnail_url:typeof b.thumbnailUrl==='string'?b.thumbnailUrl:'',embed_url:embedUrl,mega_source_id:sourceId,local_sample_path:b.sampleStreamUrl||null,status:b.status==='UNPUBLISHED'?'UNPUBLISHED':'PUBLISHED',view_count:0,is_featured:b.isFeatured?1:0,category_ids:cats,created_at:now,updated_at:now});}
  catch(e){if(sourceId)await collection('mega_sources').deleteOne({id:sourceId});throw e;}
  await audit(req,'VIDEO_CREATED','VIDEO',id);
  queueThumbnailRepair(id);
  res.status(201).json({success:true,videoId:id,slug});
}));
mongoRouter.patch('/videos/:id',requireOwner,wrap(async(req,res)=>{
  const v=await findVideo(req,req.params.id);if(!v){res.status(404).json({error:'Video not found'});return;}
  const b=req.body||{}, update:Record<string,unknown>={updated_at:new Date().toISOString()};
  for(const [input,key] of [['title','title'],['description','description'],['thumbnailUrl','thumbnail_url']])if(b[input]!==undefined)update[key]=String(b[input]).trim();
  if(update.title===''){res.status(400).json({error:'Title is required'});return;}
  if(b.durationSeconds!==undefined)update.duration_seconds=Math.max(0,Number(b.durationSeconds)||0);
  if(b.isFeatured!==undefined)update.is_featured=b.isFeatured?1:0;
  if(b.status!==undefined)update.status=b.status==='UNPUBLISHED'?'UNPUBLISHED':'PUBLISHED';
  if(b.categoryIds!==undefined)update.category_ids=await categoryIds(b.categoryIds);
  await collection('videos').updateOne({id:v.id},{$set:update});
  res.json({success:true});
}));
mongoRouter.delete('/videos/:id',requireOwner,wrap(async(req,res)=>{
  const v=await findVideo(req,req.params.id);if(!v){res.status(404).json({error:'Video not found'});return;}
  await collection('videos').deleteOne({id:v.id});
  await Promise.all(['favorites','watch_progress','playlist_items'].map(n=>collection(n).deleteMany({video_id:v.id})));
  if(v.mega_source_id)await collection('mega_sources').deleteOne({id:v.mega_source_id});
  await audit(req,'VIDEO_DELETED','VIDEO',v.id);res.json({success:true});
}));
for(const [route,name,key] of [['history','watch_progress','history'],['continue-watching','watch_progress','continueWatching'],['favorites','favorites','favorites']]){
  mongoRouter.get('/'+route,wrap(async(req,res)=>{
    const filter:Record<string,unknown>={user_id:req.user!.id};
    if(route==='continue-watching'){filter.completed=0;filter.position_seconds={$gte:5};}
    const rows=await collection(name).find(filter).sort(name==='favorites'?{created_at:-1}:{updated_at:-1}).limit(route==='continue-watching'?20:100).toArray();
    const vs=await collection('videos').find({...visible(req),id:{$in:rows.map(r=>r.video_id)}}).toArray();
    const enriched=await enrich(vs,req.user!.id);
    res.json({[key]:rows.flatMap(r=>enriched.filter(v=>v.id===r.video_id).map(v=>({...v,last_watched_at:r.updated_at,favorited_at:r.created_at})))});
  }));
}
const progress=wrap(async(req,res)=>{
  const v=await findVideo(req,req.params.videoId);if(!v){res.status(404).json({error:'Video not found'});return;}
  const p=Number(req.body?.positionSeconds),d=Number(req.body?.durationSeconds);
  if(!Number.isFinite(p)||p<0||!Number.isFinite(d)||d<=0){res.status(400).json({error:'Progress requires a finite position and positive duration.'});return;}
  const pos=Math.min(p,d), completed=pos/d>=.92?1:0;
  await collection('watch_progress').updateOne({user_id:req.user!.id,video_id:v.id},{$set:{position_seconds:pos,duration_seconds:d,completed,updated_at:new Date().toISOString()},$setOnInsert:{id:randomUUID()}},{upsert:true});
  res.json({success:true,positionSeconds:pos,isCompleted:Boolean(completed)});
});
mongoRouter.put('/progress/:videoId',progress);mongoRouter.post('/progress/:videoId',progress);
mongoRouter.post('/favorites/:videoId',wrap(async(req,res)=>{
  const v=await findVideo(req,req.params.videoId);if(!v){res.status(404).json({error:'Video not found'});return;}
  const filter={user_id:req.user!.id,video_id:v.id};
  const deleted=await collection('favorites').findOneAndDelete(filter);
  if(!deleted)await collection('favorites').updateOne(filter,{$setOnInsert:{...filter,id:randomUUID(),created_at:new Date().toISOString()}},{upsert:true});
  res.json({isFavorite:!deleted});
}));
