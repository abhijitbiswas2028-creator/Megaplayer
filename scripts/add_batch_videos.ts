import 'dotenv/config';
import { File as MegaFile, API } from 'megajs';
import fs from 'node:fs';
import path from 'node:path';
import { db, initDatabase } from '../src/server/db.ts';
import { parseMegaUrl } from '../src/server/utils/mega-url.ts';
import { extractThumbnail } from '../src/server/thumbnail.ts';
import { withMegaThumbnailSource } from '../src/server/thumbnail-source.ts';

initDatabase();

const THUMBNAIL_DIR = path.resolve(process.cwd(), 'public/thumbnails');
if (!fs.existsSync(THUMBNAIL_DIR)) {
  fs.mkdirSync(THUMBNAIL_DIR, { recursive: true });
}

const NEW_MEGA_LINKS = [
  'https://mega.nz/file/fUEHAJaK#wpXjGQwgSGcVMSvb95rPJM5-njNJQfkgtjXEyGQdGC8',
  'https://mega.nz/file/fEcU0ASR#G_JSYn1qQ86idcI_OaJ8V_8Gx6lviJQyimHfVIBYTEs',
  'https://mega.nz/file/WdMghZBI#NhE1r9e4YzDuHKvX2HWzM-yhmbWCRA2HVpd5gPUvItU',
  'https://mega.nz/file/PN9hHIyY#HM-KpHfBfXdawqP4S4muKdP1opy1_SF0sY_98A-StpQ',
  'https://mega.nz/file/rc1D1SIa#xpvZZVNJSEabz9Mu8LrAK97HyhgnY83mSJMqGRG-IuY',
  'https://mega.nz/file/6QVHCA6Y#0nxPrFvwi1fQOcE3n-bxWiXRgppDMPlhWMTSkML_n9E',
  'https://mega.nz/file/HNsQTbgC#em2jyJsV9xec1Iatx2zLqcvHZynVxSg5o_FzkHjHbDA',
  'https://mega.nz/file/LcEjWbLJ#A7_dun8RQqzxXiB7hS0yrBxZFgizygcGlFjJWHkPH6A',
  'https://mega.nz/file/qQdC1a6A#EMAU-xh6lrZeJEgyAJjwhzYO0bOTFUKsM1B0KWxnvjg',
  'https://mega.nz/file/GB9CEDKK#6oOOVQTzrMu3TguvEhMJhvX3d_8KdGzM2uO-YJtEWlQ',
  'https://mega.nz/file/bVNACLyY#ZGXfyKpxZY-Y2YjhCtetDyLVya8X3qNnxf1ZDlb_QEk',
  'https://mega.nz/file/7c1XHDzA#R5x59N-wTveGHQgNTvtUlatnUjr4JyPD5SoZs7Te-5M',
  'https://mega.nz/file/WINywLoZ#boHZE-xAo6PVDQ_U1h_ozAPAzIQuUv0oViC4G8djEfA',
  'https://mega.nz/file/uEU0ULBJ#qCNMLM69fs4m94WjxKGQ62vsnlWK7Q7agmP-FJEF4Nk',
  'https://mega.nz/file/fVFxySpZ#l9pIMoKdbEmyF4P7QLB8FqGl73aVKQbAmxEIIT18UkI',
  'https://mega.nz/file/DIlw1CpB#tchPKMvycRy_-GVhwgTc6ya0jarEeR9ei6kmxdo4MLY',
  'https://mega.nz/file/bBs3DIiL#e8RBQTwmzYwW74VeLCGruh_Fn85hM3gWYcGJmUnVwpg',
  'https://mega.nz/file/HN9TkJIa#JIOqF--dIoN_EnYWM6ndYAgpgXROqkogpQhQV6r_2UY',
  'https://mega.nz/file/2c0lXT4I#mkwMHc9UC0rzavQ9rNBnAifRBEqa1JexlZaBRYQU-sU',
  'https://mega.nz/file/eREDBa4D#_3J3khXhtNSLzXCX66EFNwR73k0GjUXXkpynSiUxAXo',
  'https://mega.nz/file/CI0HXIwQ#-O-g2BEqKfoPWuQ4dq4nxacITbJ_wpXMw0k_OAUHcR8',
  'https://mega.nz/file/GVsyVQaK#IV11pHnbq51Dgr5SP_oKkF-2rDrUQFwbcfdn01OVNX0',
  'https://mega.nz/file/eVNG0b6Q#9Un-rKPuv2uySf-p_Psi0ExElYOWcZTvkvsvYxot3qQ',
  'https://mega.nz/file/HVd13AaD#Qg1TyAS_fGG6uPEjJKMZ_8MMC3xXRhq_LI4Mq1hS9yk',
  'https://mega.nz/file/aB1xGA5I#-PLcnOTvmoZq8SQBFo6ZpB7tgaPyR0MbgE0jxDYOlVo',
  'https://mega.nz/file/CA00TYBa#5FSyGAo00OZ2oefbucnPFEA7YpReaN2JMYO7xDj8peo',
  'https://mega.nz/file/jQN03KoS#aUngJKQO402r-0GJCqkC2F2p1HWaiVRi0m-FieqgYiY',
  'https://mega.nz/file/iRV1BYLA#PQK-x3GrXQwa4EqgL7VhC2IU2dK4wuvWVyH1QbaHcrE',
  'https://mega.nz/file/iRlWgCbI#X_-XT87Jg4j1lcX3z2X4EXwwnAMtbt9HRuFPjYeB3iY',
  'https://mega.nz/file/bFtBCDYQ#DlBXsuWUNbBuziOQ5oRwduQ1hvGKPn5FsH_iSA-Awkc',
  'https://mega.nz/file/TM13QBJC#SnWKMFepuKPcu3UL5saHw81ntlsPqzc_EtwsoRoj6eA',
  'https://mega.nz/file/eFU0mL6K#FO6l4n3eO4bpwvaSqzqvrhPUSod3UlNMEGnB6AddCKA',
  'https://mega.nz/file/6d9DSDoZ#_HHAMnUcPedQWWpXmkppQP2jQqcUlAPbZcSTdjPoDgc',
  'https://mega.nz/file/HQdymYJT#5phUrgENpOMRhIMHhv7LwnaUFyylz19FxuqNoFzSpoc',
  'https://mega.nz/file/vM02HCRA#8UBNKp58qSIp32qYjBfhtR9aNF_Y00N7MD0yLLZDRyw',
  'https://mega.nz/file/eIt22SSS#K4QFxIgtKmUG2ScUslRvHwGc7YtxavbKbCUJPWHzoJI',
  'https://mega.nz/file/2VtG2ZgQ#mdzAzZAutczatwm11DRYe6lcTrdpi04NdJD0Jlkt_Gc',
  'https://mega.nz/file/mN9zCabS#g5TYjrptixXY0kMxQKKWZQBIZlEpgu9MtcjQOInM6vc',
  'https://mega.nz/file/DYMlyAqa#WOelsUyqTqWH9GAGmthtUnCxxB8uGeCp1gV4rCLX1dM',
  'https://mega.nz/file/rJcz0LxI#n3wsRyz3mrZmJG1_Ujfndr7WBjZK0DtqzhWKrlzZ09s',
  'https://mega.nz/file/PRd1iARD#pS9v9dcKzeMkgwUR2qbGzwW1RNnjw0HFg0ayltp_Wg4',
  'https://mega.nz/file/WVVGDKZb#lEsIVjMdlZUu89deXTKjoij7Sf7DfT-ODsaqHYXwY-4',
  'https://mega.nz/file/KQsDlL5Q#jPEYBlc-rslF1_wkz__h9p0vvc000Qh7xgWiX-pWtFk',
  'https://mega.nz/file/aBEkxAAA#W_5YG_auBbKvpmLIfVtvrJb6xu1bELk1A3YUMXukYYI',
  'https://mega.nz/file/WF8wyTJD#IT5jM1kWW5Mp-UyewKrldiyZ4dvTLslDu0UEYKc2scA',
  'https://mega.nz/file/eEcjzI5a#6Cd5Dhn2SEIOgmJj-L5Seap9jT29HPv-mEGFy6ukukU',
  'https://mega.nz/file/GV0VRCzB#-A-FCXR3KdRioj3jdqurtpQMEhhIOzGuG6kfoY6eMSY',
  'https://mega.nz/file/rAt21SCA#vKC1IIBf5lHACDIuVgHGpxxfNn3A6IH4qELgWItF9oc',
];

const sharedMegaApi = new API(true);

function cleanVideoTitle(rawName: string, fileId: string, index: number): string {
  let name = rawName
    .replace(/\.(mp4|mkv|webm|avi|mov|ts|m4v)$/i, '')
    .replace(/^(xvideos\.com_|spankbang\.com_|pornhub\.com_|xnxx\.com_)/i, '')
    .replace(/[-_.]+/g, ' ')
    .replace(/\b(720p|1080p|4k|2160p|hd|hq|fix|rip)\b/gi, '')
    .trim();

  // If the name is just a 32-char hex string or meaningless hash
  if (/^[a-f0-9]{16,}$/i.test(name.replace(/\s+/g, '')) || name.length < 3) {
    name = `Cinema Feature ${fileId.toUpperCase()}`;
  } else {
    // Capitalize words
    name = name
      .split(' ')
      .filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  return name;
}

const CATEGORY_IDS = ['cat_movies', 'cat_series', 'cat_animation', 'cat_tutorials', 'cat_docu'];

function assignCategory(title: string, rawName: string, index: number): string {
  const lower = (title + ' ' + rawName).toLowerCase();
  if (lower.includes('episode') || lower.includes('ep') || lower.includes('season') || lower.includes('series')) {
    return 'cat_series';
  }
  if (lower.includes('anime') || lower.includes('cgi') || lower.includes('3d') || lower.includes('motion')) {
    return 'cat_animation';
  }
  if (lower.includes('masterclass') || lower.includes('tutorial') || lower.includes('tech') || lower.includes('learn')) {
    return 'cat_tutorials';
  }
  if (lower.includes('chronicle') || lower.includes('docu') || lower.includes('expedition') || lower.includes('nature')) {
    return 'cat_docu';
  }
  return CATEGORY_IDS[index % CATEGORY_IDS.length];
}

async function extractVideoThumbnail(
  fileId: string,
  sourceUrl: string,
  totalSize: number
): Promise<{ thumbUrl: string; duration: number }> {
  const name = `vid_mega_${fileId.toLowerCase()}.jpg`;
  const destination = path.join(THUMBNAIL_DIR, name);
  try {
    const { duration } = await withMegaThumbnailSource(sourceUrl, totalSize,
      source => extractThumbnail(source, destination));
    return { thumbUrl: `/thumbnails/${name}?v=${Date.now()}`, duration };
  } catch {
    console.warn(`    ${fileId}: thumbnail unavailable; automatic repair will retry on server startup`);
    return { thumbUrl: fs.existsSync(destination) ? `/thumbnails/${name}` : '', duration: 0 };
  }
}

async function processSingleLink(rawUrl: string, index: number, total: number) {
  const parsed = parseMegaUrl(rawUrl);
  if (!parsed.isValid || !parsed.id || !parsed.fileUrl) {
    console.error(`❌ [${index}/${total}] Invalid URL: ${rawUrl}`);
    return null;
  }

  const fileId = parsed.id;
  console.log(`\n⏳ [${index}/${total}] Fetching MEGA attributes for ID: ${fileId}...`);

  try {
    const megaFile = MegaFile.fromURL(parsed.fileUrl, { api: sharedMegaApi });
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('MEGA attributes timeout (15s)')), 15000);
      megaFile.loadAttributes((err: any) => {
        clearTimeout(timeout);
        if (err) reject(err); else resolve();
      });
    });

    const rawFileName = megaFile.name || `mega_video_${fileId}.mp4`;
    const fileSize = typeof megaFile.size === 'number' ? megaFile.size : 0;
    const cleanTitle = cleanVideoTitle(rawFileName, fileId, index);
    const categoryId = assignCategory(cleanTitle, rawFileName, index);

    console.log(`  🎬 Title: "${cleanTitle}"`);
    console.log(`  📦 File: ${rawFileName} (${(fileSize / (1024 * 1024)).toFixed(1)} MB)`);

    // Extract a validated frame from the original video timeline.
    const { thumbUrl, duration } = await extractVideoThumbnail(
      fileId,
      parsed.fileUrl,
      fileSize
    );
    console.log(`  🖼️ Thumbnail: ${thumbUrl} | Duration: ${duration}s`);

    const now = new Date().toISOString();
    const megaSourceId = `megasrc_${fileId.toLowerCase()}`;
    const videoId = `vid_mega_${fileId.toLowerCase()}`;
    const slug = `${cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '')}-${fileId.toLowerCase()}`;

    // Store in mega_sources
    db.prepare(`
      INSERT OR REPLACE INTO mega_sources (
        id, encrypted_ref, iv, auth_tag, file_id, file_name, file_size, mime_type, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      megaSourceId,
      parsed.fileUrl,
      'direct',
      'direct',
      fileId,
      rawFileName,
      fileSize,
      'video/mp4',
      now
    );

    // Store in videos
    (db.prepare(`
      INSERT OR REPLACE INTO videos (
        id, title, description, slug, duration_seconds, thumbnail_url,
        embed_url, mega_source_id, local_sample_path, status, view_count, is_featured,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `) as any).run(
      videoId,
      cleanTitle,
      `High-definition progressive stream sourced directly from MEGA cloud storage. Original HD Quality.`,
      slug,
      duration,
      thumbUrl,
      parsed.embedUrl,
      megaSourceId,
      null,
      'PUBLISHED',
      Math.floor(Math.random() * 35) + 12,
      index % 6 === 0 ? 1 : 0,
      now,
      now
    );

    // Store in video_categories
    db.prepare('DELETE FROM video_categories WHERE video_id = ?').run(videoId);
    db.prepare('INSERT OR IGNORE INTO video_categories (video_id, category_id) VALUES (?, ?)').run(videoId, categoryId);

    console.log(`  ✅ Added video successfully: [${videoId}]`);
    return videoId;
  } catch (err: any) {
    console.error(`  ⚠️ Attribute loading failed for ${fileId}:`, err?.message);

    // Even if loadAttributes fails (e.g. rate limit), still register the video using parsed info!
    const cleanTitle = `Cinema Feature ${fileId.toUpperCase()}`;
    const now = new Date().toISOString();
    const megaSourceId = `megasrc_${fileId.toLowerCase()}`;
    const videoId = `vid_mega_${fileId.toLowerCase()}`;
    const slug = `cinema-feature-${fileId.toLowerCase()}`;
    const thumbUrl = `/thumbnails/vid_mega_${fileId.toLowerCase()}.jpg`;
    const categoryId = assignCategory(cleanTitle, fileId, index);

    db.prepare(`
      INSERT OR REPLACE INTO mega_sources (
        id, encrypted_ref, iv, auth_tag, file_id, file_name, file_size, mime_type, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      megaSourceId,
      parsed.fileUrl,
      'direct',
      'direct',
      fileId,
      `mega_video_${fileId}.mp4`,
      0,
      'video/mp4',
      now
    );

    (db.prepare(`
      INSERT OR REPLACE INTO videos (
        id, title, description, slug, duration_seconds, thumbnail_url,
        embed_url, mega_source_id, local_sample_path, status, view_count, is_featured,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `) as any).run(
      videoId,
      cleanTitle,
      `High-definition progressive stream sourced directly from MEGA cloud storage. Original HD Quality.`,
      slug,
      0,
      thumbUrl,
      parsed.embedUrl,
      megaSourceId,
      null,
      'PUBLISHED',
      15,
      0,
      now,
      now
    );

    db.prepare('DELETE FROM video_categories WHERE video_id = ?').run(videoId);
    db.prepare('INSERT OR IGNORE INTO video_categories (video_id, category_id) VALUES (?, ?)').run(videoId, categoryId);

    console.log(`  ✅ Registered fallback entry for [${videoId}]`);
    return videoId;
  }
}

async function main() {
  console.log(`🚀 Starting batch import of ${NEW_MEGA_LINKS.length} MEGA videos...`);
  
  // Deduplicate incoming links
  const seen = new Set<string>();
  const uniqueLinks: string[] = [];
  for (const l of NEW_MEGA_LINKS) {
    const parsed = parseMegaUrl(l);
    const key = parsed.id || l;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueLinks.push(l);
    }
  }

  console.log(`📋 Unique links to process: ${uniqueLinks.length}`);

  let addedCount = 0;
  for (let i = 0; i < uniqueLinks.length; i++) {
    const res = await processSingleLink(uniqueLinks[i], i + 1, uniqueLinks.length);
    if (res) addedCount++;
  }

  const totalInDb = (db.prepare('SELECT COUNT(*) as c FROM videos').get() as any).c;
  console.log(`\n🎉 Finished batch processing! Added/Updated: ${addedCount}. Total videos in catalog: ${totalInDb}`);
}

main().catch(console.error);
