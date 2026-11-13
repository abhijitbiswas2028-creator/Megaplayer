import { Router } from 'express';
import { collection } from './store.ts';
import { wrap } from './auth.ts';

// Bounded LRU avoids repeatedly fetching image bytes from MongoDB.
const cache=new Map<string,{bytes:Buffer;type:string}>();
let cacheBytes=0;
const budget=32*1024*1024;
export const thumbnailRouter=Router();
thumbnailRouter.get('/:hash',wrap(async(req,res)=>{
 const hash=req.params.hash;
 if(!/^[a-f0-9]{64}$/.test(hash)){res.sendStatus(404);return;}
 let value=cache.get(hash);
 if(value){cache.delete(hash);cache.set(hash,value);}
 else {
  const row=await collection('thumbnails').findOne({hash});
  if(!row){res.sendStatus(404);return;}
  value={bytes:Buffer.from(row.bytes.buffer),type:row.content_type};
  while(cacheBytes+value.bytes.length>budget&&cache.size){const key=cache.keys().next().value!;cacheBytes-=cache.get(key)!.bytes.length;cache.delete(key);}
  if(value.bytes.length<=budget){cache.set(hash,value);cacheBytes+=value.bytes.length;}
 }
 res.set({'Cache-Control':'public, max-age=31536000, immutable','ETag':`"${hash}"`,'Content-Type':value.type,'X-Content-Type-Options':'nosniff'});
 if(req.fresh){res.status(304).end();return;}
 res.send(value.bytes);
}));
