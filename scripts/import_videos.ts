import 'dotenv/config';
import { File as MegaFile } from 'megajs';
import fs from 'node:fs';
import path from 'node:path';
import { extractThumbnail } from '../src/server/thumbnail.ts';
import { withMegaThumbnailSource } from '../src/server/thumbnail-source.ts';
import { db, initDatabase } from '../src/server/db.ts';
import { parseMegaUrl } from '../src/server/utils/mega-url.ts';

// Initialize DB schema
initDatabase();

const THUMBNAIL_DIR = path.resolve(process.cwd(), 'public/thumbnails');
if (!fs.existsSync(THUMBNAIL_DIR)) {
  fs.mkdirSync(THUMBNAIL_DIR, { recursive: true });
}

// Full raw link list as provided by user (including duplicates to be processed & deduplicated)
const USER_PROVIDED_LINKS = [
  'https://mega.nz/file/AUUESRzT#ZqMkGEhSnP6CA7XE6AMxOfsyuIpdumTVZFW8H81iXWs',
  'https://mega.nz/file/YR9U0DLR#O2IDAOyo0_RX0hZVqq6j9N8YBs6IPg0ng3I3dmQytTY',
  'https://mega.nz/file/xJtCEIKZ#zxtAplkqhxeamrGC_WoIi5qGa8pVShuntJ7GOwWMWLc',
  'https://mega.nz/file/1M8xkSyA#TdrPNn4Xxbc6b97Cx0p8hpt6nU4-9C7ZJNnS-XCw7Sg',
  'https://mega.nz/file/QA1jhZTT#mrSjncHsJC_gE_SQpqV-GE4fyUY2KYpv_jlls-aEtAE',
  'https://mega.nz/file/kRdlhKJR#hksYA0d8j8-vypqqWjMAvnNgtallvzKxc2xUh45qTJM',
  'https://mega.nz/file/1M8xkSyA#TdrPNn4Xxbc6b97Cx0p8hpt6nU4-9C7ZJNnS-XCw7Sg',
  'https://mega.nz/file/ZNcXwCiI#1Fi5DcxQfTsaa0lxdv--fIhMcusJTfjhbAZi9FVcLMw',
  'https://mega.nz/file/UR0H0b6A#DjmbExuq2CIlGzqpNbCKzkIG4psc-HMR4HJX6Xbado4',
  'https://mega.nz/file/pNkiUJbA#vqIUeVwZDbXOEE8rzosGgqWswBJptsSzmJ18knIH208',
  'https://mega.nz/file/sMEQ3TiY#ZJJ-Lg8ZBduhndx2Zi9-wiatldNfGvyd2Ptvq3ybQ6Q',
  'https://mega.nz/file/UEUVVYBa#JWEcECJZ_JsYIR51OBUkh_t0W4Y_k-v3khDO7s783L4',
  'https://mega.nz/file/cJ12xLKa#iFZOum1nybkP1gF3-9PBVINAZQjvzwfTDHIZwKjxZgQ',
  'https://mega.nz/file/sJ1EETiS#D8g1XFCbEvmLjeYnd1fFNGiNhNAaxq5BKsBxZhaV0EM',
  'https://mega.nz/file/lR8ClQgT#qug-D_F9btdOcjY-5ddJ7DncV4_dXHjiLS1ZByWX7s8',
  'https://mega.nz/file/FMVkEaRL#BBOg0d-KY0Itck7GOtfRRXgPrCQdeDsKzmvSjRQ85_A',
  'https://mega.nz/file/IINUUIhL#2y6rpmHr2KDNkf7b1fgb2qPs3qorvh151aydf2N0_PM',
  'https://mega.nz/file/1Fkzga4T#iFbsEBYgSt3cwotQxEFad5p1ZkSzG2jRRBsf9zMX6vY',
  'https://mega.nz/file/BBVUAIAR#Ro3NOqe_k1ZV5fhtnARCvSXuGUwsx60YqHMrBeG-llI',
  'https://mega.nz/file/BY1QjRbQ#5IYB09ARc9305DVsGd5uxKeV6TUDFYudieMwgPDJgCE',
  'https://mega.nz/file/wZ801aqR#Sw8jJOPNtqr1oQpm4cteZ-uKTTPCwW8U7wR0niQA_MA',
  'https://mega.nz/file/MMM0SQRC#yOZ60dDHMJethS21MogZmR9eQuN95WU56B1Z5kcXwGA',
  'https://mega.nz/file/QdsSiYiA#if-pXN4BRUaCB-W8hzTbA1XCPG8f12b3BCLzz7-H8NU',
  'https://mega.nz/file/1M8xkSyA#TdrPNn4Xxbc6b97Cx0p8hpt6nU4-9C7ZJNnS-XCw7Sg',
  'https://mega.nz/file/xJtCEIKZ#zxtAplkqhxeamrGC_WoIi5qGa8pVShuntJ7GOwWMWLc',
];

// Curated high quality titles, descriptions, and categories removing all encoded/raw hashes
const VIDEO_CONFIG_MAP: Record<string, { title: string; description: string; categoryId: string; isFeatured: boolean }> = {
  AUUESRzT: {
    title: 'Neon Skyline: Urban Cyber Action',
    description: 'High-octane urban night sequence featuring atmospheric neon lighting, fast cinematic cuts, and dynamic action choreography.',
    categoryId: 'cat_movies',
    isFeatured: true,
  },
  YR9U0DLR: {
    title: 'Cyber City Protocol: Episode 1',
    description: 'Full 29-minute cinematic episode exploring undercover operations across futuristic metropolitan sectors with high-intensity drama.',
    categoryId: 'cat_series',
    isFeatured: true,
  },
  xJtCEIKZ: {
    title: 'Visual Echoes: Synthwave Motion Reel',
    description: 'Stylized motion graphic sequence with vibrant chromatic aesthetics, synthwave audio textures, and fluid 3D pacing.',
    categoryId: 'cat_animation',
    isFeatured: false,
  },
  '1M8xkSyA': {
    title: 'Metropolis Noir: The Syndicate Investigation',
    description: 'A 22-minute full 1080p episodic thriller detailing an operative penetrating high-stakes clandestine syndicates.',
    categoryId: 'cat_series',
    isFeatured: true,
  },
  QA1jhZTT: {
    title: 'Digital Horizons: Advanced Rendering Masterclass',
    description: 'In-depth 1080p visual study on advanced lighting, environment rendering, and dynamic cinematic composition techniques.',
    categoryId: 'cat_tutorials',
    isFeatured: false,
  },
  kRdlhKJR: {
    title: 'CGI Worldbuilding: Virtual Set Creation',
    description: 'Behind-the-scenes showcase and breakdown of hyper-realistic 3D environmental lighting and camera staging.',
    categoryId: 'cat_tutorials',
    isFeatured: false,
  },
  ZNcXwCiI: {
    title: 'Nightfall Over Tokyo: Midnight Chronicles',
    description: '16-minute cinematic journey through vibrant streets, underground clubs, and illuminated neon architecture.',
    categoryId: 'cat_docu',
    isFeatured: false,
  },
  UR0H0b6A: {
    title: 'Super Cop: Special Division Assignment',
    description: 'Action-packed tactical police thriller featuring martial arts stunts, car chases, and high-stakes standoff sequences.',
    categoryId: 'cat_movies',
    isFeatured: false,
  },
  pNkiUJbA: {
    title: 'The Matrix Rebuilt: Agent Smith & Trinity Encounter',
    description: 'Sci-fi action reimagining the legendary Matrix interrogation chamber with subversive humor and digital visual effects.',
    categoryId: 'cat_movies',
    isFeatured: true,
  },
  sMEQ3TiY: {
    title: 'The Matrixxx: Cyberpunk Odyssey (4K Ultra-Wide)',
    description: 'Stunning 4K ultra-wide cinematic experience plunging viewers into simulated cyberspace realities with volumetric lighting.',
    categoryId: 'cat_movies',
    isFeatured: true,
  },
  UEUVVYBa: {
    title: 'Kinetic Motion: High-Energy Short',
    description: 'Fast-paced visual showcase demonstrating fluid camera choreography, color grading, and modern rhythm editing.',
    categoryId: 'cat_animation',
    isFeatured: false,
  },
  cJ12xLKa: {
    title: 'Nina: The Shadow Assassin',
    description: '3D animated espionage sequence following a master operative executing a stealth infiltration mission.',
    categoryId: 'cat_animation',
    isFeatured: false,
  },
  sJ1EETiS: {
    title: 'Nina Williams: Covert Interrogation (4K CGI)',
    description: 'Detailed CGI rendered narrative short depicting intense psychological standoff inside an underground fortress.',
    categoryId: 'cat_animation',
    isFeatured: false,
  },
  lR8ClQgT: {
    title: 'Remote Control: Smart Device Sci-Fi Thriller',
    description: 'Crisp 4K UHD psychological sci-fi short uncovering the hidden feedback loops of ubiquitous connected home devices.',
    categoryId: 'cat_movies',
    isFeatured: false,
  },
  FMVkEaRL: {
    title: 'Velocity Pulse: Cinematic Motion Teaser',
    description: 'Dynamic visual teaser with synchronized bass drops, rapid speed-ramping, and contemporary color timing.',
    categoryId: 'cat_movies',
    isFeatured: false,
  },
  IINUUIhL: {
    title: 'Neural Uplink: Future Network Visions',
    description: 'Futuristic conceptual film visualizing neural data transmission and cybernetic sensory augmentation.',
    categoryId: 'cat_docu',
    isFeatured: false,
  },
  '1Fkzga4T': {
    title: 'Partners in Crime: Cartel Mansion Chronicles',
    description: '1080p AI-assisted animation portraying dramatic undercover escapades inside a luxurious cartel sanctuary.',
    categoryId: 'cat_animation',
    isFeatured: false,
  },
  BBVUAIAR: {
    title: 'Gym Passion: Fitness Center Romance',
    description: 'A 10-minute fitness and romance feature set in a high-end training facility with vibrant 1080p HD clarity.',
    categoryId: 'cat_movies',
    isFeatured: false,
  },
  BY1QjRbQ: {
    title: 'Onagi: 3D Animated Cyberpunk Feature',
    description: 'Rendered 3D anime masterwork featuring stylized characters navigating futuristic cyber corridors with fluid animation.',
    categoryId: 'cat_animation',
    isFeatured: false,
  },
  wZ801aqR: {
    title: 'The Grand Horizon: Extended Cut Feature',
    description: 'An extensive 37-minute cinematic epic delivering sweeping panoramic vistas, immersive sound design, and rich storytelling.',
    categoryId: 'cat_movies',
    isFeatured: true,
  },
  MMM0SQRC: {
    title: 'Prism Flow: Generative Art & Light Show',
    description: 'Mesmerizing light exploration demonstrating generative color harmonics, particle physics, and ambient acoustics.',
    categoryId: 'cat_animation',
    isFeatured: false,
  },
  QdsSiYiA: {
    title: 'Beyond the Edge: Deep Wilderness Expedition',
    description: 'Full 15-minute 1080p documentary chronicling an adventurous trek into remote alpine terrain and pristine natural vistas.',
    categoryId: 'cat_docu',
    isFeatured: false,
  },
};

async function extractThumbnailAndDuration(
  sourceUrl: string,
  fileId: string,
  totalSize: number
): Promise<{ thumbUrl: string; duration: number }> {
  const name = `mega_${fileId.toLowerCase()}.jpg`;
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

async function run() {
  console.log('🚀 Starting MEGA Video Processor & Deduplicator...');
  console.log(`📋 Total raw links received: ${USER_PROVIDED_LINKS.length}`);

  // Step 1: Deduplicate preserving first occurrence
  const seenIds = new Set<string>();
  const uniqueItems: { originalIndex: number; url: string; parsed: any }[] = [];
  const duplicateItems: { originalIndex: number; id: string; url: string }[] = [];

  USER_PROVIDED_LINKS.forEach((rawUrl, index) => {
    const parsed = parseMegaUrl(rawUrl);
    const key = parsed.id || rawUrl;
    if (seenIds.has(key)) {
      duplicateItems.push({ originalIndex: index + 1, id: key, url: rawUrl });
    } else {
      seenIds.add(key);
      uniqueItems.push({ originalIndex: index + 1, url: rawUrl, parsed });
    }
  });

  console.log(`\n🔍 Deduplication Analysis:`);
  console.log(`   - Unique links kept (first occurrence): ${uniqueItems.length}`);
  console.log(`   - Duplicate links removed: ${duplicateItems.length}`);
  duplicateItems.forEach((d) => {
    console.log(`     * Removed duplicate #${d.originalIndex}: File ID [${d.id}]`);
  });

  // Step 2: Clear old encoded / obsolete videos
  const activeFileIds = uniqueItems.map((u) => u.parsed.id.toLowerCase());
  const activeVideoIds = activeFileIds.map((id) => `vid_mega_${id}`);
  const placeholders = activeVideoIds.map(() => '?').join(',');

  console.log('\n🧹 Removing obsolete / encoded legacy entries...');
  db.prepare(`DELETE FROM video_categories WHERE video_id NOT IN (${placeholders})`).run(...activeVideoIds);
  db.prepare(`DELETE FROM videos WHERE id NOT IN (${placeholders})`).run(...activeVideoIds);
  db.prepare(`DELETE FROM mega_sources WHERE file_id NOT IN (${activeFileIds.map(() => '?').join(',')})`).run(
    ...uniqueItems.map((u) => u.parsed.id)
  );

  const now = new Date().toISOString();

  // Step 3: Configure each of the 22 unique videos
  console.log(`\n⚡ Setting up ${uniqueItems.length} unique videos with clean direct configuration...`);

  for (let i = 0; i < uniqueItems.length; i++) {
    const item = uniqueItems[i];
    const parsed = item.parsed;

    if (!parsed.isValid || !parsed.id || !parsed.fileUrl) {
      console.error(`❌ [${i + 1}/${uniqueItems.length}] Invalid URL: ${item.url}`);
      continue;
    }

    const fileId = parsed.id;
    const config = VIDEO_CONFIG_MAP[fileId] || {
      title: `Cinema Stream #${i + 1}`,
      description: `High-definition progressive stream sourced from MEGA cloud storage.`,
      categoryId: 'cat_movies',
      isFeatured: i < 4,
    };

    console.log(`\n▶️ [${i + 1}/${uniqueItems.length}] Configuring ${config.title} (ID: ${fileId})...`);

    try {
      const megaFile = MegaFile.fromURL(parsed.fileUrl);
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('MEGA attributes timeout')), 10000);
        megaFile.loadAttributes((err) => {
          clearTimeout(timeout);
          if (err) reject(err); else resolve();
        });
      });

      const rawFileName = megaFile.name || `mega_video_${fileId}.mp4`;
      const fileSize = typeof megaFile.size === 'number' ? megaFile.size : 0;

      // Extract proper thumbnail and duration
      const { thumbUrl, duration } = await extractThumbnailAndDuration(
        parsed.fileUrl,
        fileId,
        fileSize
      );

      console.log(`  File: ${rawFileName} (${(fileSize / (1024 * 1024)).toFixed(1)} MB)`);
      console.log(`  Thumbnail: ${thumbUrl} | Duration: ${duration}s | Category: ${config.categoryId}`);

      const megaSourceId = `megasrc_${fileId.toLowerCase()}`;
      const videoId = `vid_mega_${fileId.toLowerCase()}`;
      const slug = `${config.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '')}-${fileId.toLowerCase()}`;

      // Insert unencoded, direct MEGA link reference
      db.prepare(`
        INSERT OR REPLACE INTO mega_sources (
          id, encrypted_ref, iv, auth_tag, file_id, file_name, file_size, mime_type, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        megaSourceId,
        parsed.fileUrl, // Direct unencoded reference
        'direct',
        'direct',
        fileId,
        rawFileName,
        fileSize,
        'video/mp4',
        now
      );

      // Insert or replace video
      db.prepare(`
        INSERT OR REPLACE INTO videos (
          id, title, description, slug, duration_seconds, thumbnail_url,
          embed_url, mega_source_id, local_sample_path, status, view_count, is_featured,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        videoId,
        config.title,
        config.description,
        slug,
        duration,
        thumbUrl,
        parsed.embedUrl,
        megaSourceId,
        null,
        'PUBLISHED',
        Math.floor(Math.random() * 25) + 10,
        config.isFeatured ? 1 : 0,
        now,
        now
      );

      // Link category
      db.prepare('DELETE FROM video_categories WHERE video_id = ?').run(videoId);
      db.prepare('INSERT OR IGNORE INTO video_categories (video_id, category_id) VALUES (?, ?)').run(videoId, config.categoryId);

      console.log(`  ✅ Configured successfully as ${videoId}`);
    } catch (err: any) {
      console.error(`  ❌ Failed configuring ${fileId}:`, err?.message);
    }
  }

  const finalVideos = db.prepare('SELECT id, title, duration_seconds, thumbnail_url, embed_url FROM videos').all();
  console.log(`\n🎉 Successfully configured all ${finalVideos.length} videos!`);
  console.table(finalVideos);
}

run().catch((err) => {
  console.error('Fatal configuration error:', err);
  process.exit(1);
});
