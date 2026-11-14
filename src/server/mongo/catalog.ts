import type { Request } from 'express';
import type { Document } from 'mongodb';
import { collection } from './store.ts';

// Never return MEGA references, local file paths, or source encryption fields.
const fields=['id','title','description','slug','duration_seconds','thumbnail_url','embed_url','status','view_count','is_featured','created_at','updated_at'];

// In-memory categories cache (5 static categories, avoids repeated Atlas round trips)
let cachedCategories: Document[] | null = null;
let categoriesCachedAt = 0;
const CAT_CACHE_TTL = 300_000; // 5 minutes

export async function getCachedCategories(): Promise<Document[]> {
  const now = Date.now();
  if (cachedCategories && now - categoriesCachedAt < CAT_CACHE_TTL) {
    return cachedCategories;
  }
  const cats = await collection('categories').find({}, { projection: { _id: 0 } }).sort({ sort_order: 1 }).toArray();
  cachedCategories = cats;
  categoriesCachedAt = now;
  return cats;
}

export function invalidateCategoriesCache() {
  cachedCategories = null;
  categoriesCachedAt = 0;
}

export async function enrich(videos: Document[], userId: string) {
  if(!videos.length)return [];
  const ids=videos.map(v=>v.id);
  const [allCats, progress, favorites] = await Promise.all([
    getCachedCategories(),
    collection('watch_progress').find(
      { user_id: userId, video_id: { $in: ids } },
      { projection: { _id: 0, video_id: 1, position_seconds: 1, duration_seconds: 1, completed: 1 } }
    ).toArray(),
    collection('favorites').find(
      { user_id: userId, video_id: { $in: ids } },
      { projection: { _id: 0, video_id: 1 } }
    ).toArray(),
  ]);
  const catMap = new Map(allCats.map(c => [c.id, c]));
  const p=new Map(progress.map(v=>[v.video_id,v]));
  const f=new Set(favorites.map(v=>v.video_id));
  return videos.map(v=>({
    id:v.id,
    ...Object.fromEntries(fields.map(k=>[k,v[k]])),
    is_featured:Boolean(v.is_featured),
    categories:(v.category_ids||[]).map((cid: string) => catMap.get(cid)).filter(Boolean),
    watch_position:p.get(v.id)?.position_seconds||0,
    watch_duration:p.get(v.id)?.duration_seconds||0,
    is_completed:Boolean(p.get(v.id)?.completed),
    is_favorite:f.has(v.id)
  }));
}
export const visible = (req: Request): Document => req.user?.role==='OWNER'?{}:{status:'PUBLISHED'};
export async function findVideo(req: Request, id: string) { return collection('videos').findOne({...visible(req),$or:[{id},{slug:id}]}); }
export function escapeRegex(s: string){return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
export async function categoryIds(input: unknown) {
  if(!Array.isArray(input)||input.some(v=>typeof v!=='string'))throw Object.assign(new Error('Invalid categories'),{status:400});
  const ids=[...new Set(input)];
  const cats = await getCachedCategories();
  const known = new Set(cats.map(c => c.id));
  if(ids.some(id => !known.has(id))) throw Object.assign(new Error('Unknown category'),{status:400});
  return ids;
}
