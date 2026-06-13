#!/usr/bin/env node
// serve-app.mjs ─ 「お店帳」アプリサーバー（静的配信＋個人登録/同期API・依存ゼロ）
//
// 使い方: node scripts/serve-app.mjs  → http://localhost:8787
//
// API（プロトタイプ仕様）:
//   POST /api/register {name, pin}   ニックネーム＋あいことば(4〜8桁の数字)で登録 → {token, name, shops}
//   POST /api/login    {name, pin}   ログイン → {token, name, shops}
//   GET  /api/me/shops               (Authorization: Bearer <token>) → {shops}
//   PUT  /api/me/shops {shops}       保存リストをサーバーに同期
//
// 利用者データは app/server-data/users.json に保存（gitignore対象・個人データ）。
// ⚠️ プロトタイプの認証（PIN+トークン）。一般公開・本番ではメール認証/OAuth等に置き換えること。

import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'app');
// データ保存先: 環境変数 DATA_DIR があればそこ（Renderの永続ディスク用）、なければ app/server-data
const dataDir = process.env.DATA_DIR || join(root, 'server-data');
const usersPath = join(dataDir, 'users.json');
const PORT = process.env.PORT || 8787;

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.css': 'text/css; charset=utf-8',
};

// ---- 利用者ストア（JSONファイル永続化） ----
let users = [];
async function loadUsers() {
  try { users = JSON.parse(await readFile(usersPath, 'utf8')); } catch { users = []; }
}
async function saveUsers() {
  await mkdir(dataDir, { recursive: true });
  await writeFile(usersPath, JSON.stringify(users, null, 2), 'utf8');
}
const hashPin = (pin, salt) => createHash('sha256').update(salt + ':' + pin).digest('hex');
const findByName = (name) => users.find((u) => u.name.toLowerCase() === name.toLowerCase());
const findByToken = (token) => token && users.find((u) => u.token === token);

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 1e6) reject(new Error('too large')); });
    req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch (e) { reject(e); } });
  });
}
function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

async function handleApi(req, res, path) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');

  if (req.method === 'POST' && (path === '/api/register' || path === '/api/login')) {
    const { name, pin, shops } = await readBody(req);
    const cleanName = String(name || '').trim();
    const cleanPin = String(pin || '').trim();
    if (!cleanName || cleanName.length > 20) return send(res, 400, { error: 'ニックネームは1〜20文字で入力してください' });
    if (!/^\d{4,8}$/.test(cleanPin)) return send(res, 400, { error: 'あいことばは4〜8桁の数字にしてください' });

    if (path === '/api/register') {
      if (findByName(cleanName)) return send(res, 409, { error: 'そのニックネームは使われています。ログインをお試しください' });
      const salt = randomBytes(8).toString('hex');
      const user = {
        id: randomBytes(6).toString('hex'),
        name: cleanName,
        salt,
        pinHash: hashPin(cleanPin, salt),
        token: randomBytes(24).toString('hex'),
        shops: shops && typeof shops === 'object' ? shops : {}, // 登録時にゲスト期間の保存を引き継ぐ
        createdAt: new Date().toISOString(),
      };
      users.push(user);
      await saveUsers();
      return send(res, 200, { token: user.token, name: user.name, shops: user.shops });
    }

    // login
    const user = findByName(cleanName);
    if (!user || user.pinHash !== hashPin(cleanPin, user.salt)) {
      return send(res, 401, { error: 'ニックネームか、あいことばが違うようです' });
    }
    user.token = randomBytes(24).toString('hex'); // ログインごとにトークン更新
    await saveUsers();
    return send(res, 200, { token: user.token, name: user.name, shops: user.shops });
  }

  if (path === '/api/me/shops') {
    const user = findByToken(token);
    if (!user) return send(res, 401, { error: 'ログインしなおしてください' });
    if (req.method === 'GET') return send(res, 200, { name: user.name, shops: user.shops });
    if (req.method === 'PUT') {
      const { shops } = await readBody(req);
      if (!shops || typeof shops !== 'object') return send(res, 400, { error: 'shops がありません' });
      user.shops = shops;
      user.updatedAt = new Date().toISOString();
      await saveUsers();
      return send(res, 200, { ok: true });
    }
  }
  return send(res, 404, { error: 'not found' });
}

await loadUsers();
createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  try {
    if (path.startsWith('/api/')) return await handleApi(req, res, path);
    let file = path === '/' || path === '' ? '/index.html' : path;
    const body = await readFile(join(root, file));
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch (e) {
    if (path.startsWith('/api/')) return send(res, 500, { error: 'server error' });
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('not found');
  }
}).listen(PORT, () =>
  console.log(`▶ http://localhost:${PORT} （利用者データ: ${usersPath}）`)
);
