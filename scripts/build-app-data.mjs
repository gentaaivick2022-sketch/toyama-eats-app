#!/usr/bin/env node
// build-app-data.mjs
// 店舗CSV ＋ ジオコーディングキャッシュ → アプリ用 app/data/shops.json を生成。
//
// 使い方:
//   node scripts/build-app-data.mjs
//
// 入力:
//   shared/toyama-eats-core-10.csv      (店舗名,住所)
//   shared/toyama-eats-committee-13.csv (店舗名,住所)
//   scripts/map-data/geocode-cache.json (render-shop-map.mjs が生成したキャッシュ)
//
// 出力スキーマは将来拡張（メニュー・栄養・IGリンク・掲載許可）を見込んで列を確保している。
// consent（掲載許可）は既定 "未確認"。一般公開時は consent==="許可済み" の店だけに絞ること。

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function parseCsv(path) {
  const text = readFileSync(path, 'utf8').replace(/^﻿/, '');
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const rows = lines.slice(1).map((l) => l.split(','));
  return rows.map(([name, address]) => ({ name: name.trim(), address: (address || '').trim() }));
}

function extractArea(address) {
  // 「富山県富山市開ヶ丘43-1」→「富山市」
  const m = address.match(/富山県(.+?[市町村郡])/);
  return m ? m[1] : '富山県';
}

function slugify(name, index) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || `shop-${String(index + 1).padStart(2, '0')}`
  );
}

const cache = JSON.parse(readFileSync(join(root, 'scripts/map-data/geocode-cache.json'), 'utf8'));
const core = parseCsv(join(root, 'shared/toyama-eats-core-10.csv')).map((s) => ({ ...s, group: 'core' }));
const committee = parseCsv(join(root, 'shared/toyama-eats-committee-13.csv')).map((s) => ({ ...s, group: 'committee' }));

const missing = [];
const shops = [...core, ...committee].map((s, i) => {
  const geo = cache[s.address];
  if (!geo) missing.push(`${s.name}（${s.address}）`);
  return {
    id: slugify(s.name, i),
    name: s.name,
    address: s.address,
    area: extractArea(s.address),
    lat: geo ? geo.lat : null,
    lon: geo ? geo.lon : null,
    group: s.group, // core=コア候補 / committee=委員会リスト（アプリUIでは区別を出さない）
    genre: null, // 後で人が補完
    instagram: null, // 店舗の公式IG（後で補完）
    postUrl: null, // toyama_eats+ のこの店の投稿URL（アプリ→SNSのリンク・後で補完）
    note: null, // 一言（toyama_eats+ のトーンで・後で補完）
    consent: '未確認', // 掲載許可。一般公開時は「許可済み」のみ表示する
  };
});

// 既存の shops.json があれば、人が手で補完した列（genre/instagram/postUrl/note/consent）を引き継ぐ
try {
  const prev = JSON.parse(readFileSync(join(root, 'app/data/shops.json'), 'utf8'));
  const byId = Object.fromEntries(prev.shops.map((p) => [p.id, p]));
  for (const s of shops) {
    const p = byId[s.id];
    if (!p) continue;
    for (const k of ['genre', 'instagram', 'postUrl', 'note', 'consent']) {
      if (p[k] != null && p[k] !== '未確認') s[k] = p[k];
    }
  }
} catch { /* 初回は前データなし */ }

if (missing.length) {
  console.warn(`⚠️ ジオコーディング未取得: ${missing.join(', ')}`);
  console.warn('   → node scripts/render-shop-map.mjs を一度実行するとキャッシュが埋まります');
}

const out = { source: 'aivick-ops shared/*.csv', shopCount: shops.length, shops };
mkdirSync(join(root, 'app/data'), { recursive: true });
writeFileSync(join(root, 'app/data/shops.json'), JSON.stringify(out, null, 2), 'utf8');
console.log(`✅ app/data/shops.json を生成（${shops.length}店舗・座標欠け ${missing.length}件）`);
