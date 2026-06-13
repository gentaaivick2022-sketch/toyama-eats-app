# デプロイ手順 ─ toyama_eats+ お店帳（Render・無料）

このフォルダ（`deploy/toyama-eats-app/`）は**自己完結**しています。社内の戦略情報（knowledge / shops / posts など）は一切含みません。
このフォルダだけを公開すれば、固定URLで・PCを閉じても動く・個人登録と同期つきのアプリになります。

> ⚠️ 公開前のひとこと: 掲載23店舗のうち、各店舗への**SNS掲載・アプリ掲載の許可確認は別途必要**です（プロトタイプ／社内デモの位置づけ）。一般に広く告知する前に、訪問済み・許可済みの店だけに絞るのが安全です。`app/data/shops.json` を編集すれば掲載店は調整できます。

---

## 方法A: GitHub 連携でデプロイ（おすすめ・更新が楽）

1. **GitHubに新規リポジトリを作る**（例 `toyama-eats-app`）。**Private で構わない**（Renderは無料プランでもPrivate連携可）。
2. このフォルダの中身だけを push する:
   ```bash
   cd deploy/toyama-eats-app
   git init
   git add .
   git commit -m "init: toyama_eats+ お店帳 v0.2"
   git branch -M main
   git remote add origin https://github.com/<あなたのID>/toyama-eats-app.git
   git push -u origin main
   ```
3. **Render（https://render.com）にGitHubでサインアップ** → 「New +」→「**Blueprint**」→ 上記リポジトリを選択。
   `render.yaml` を自動で読み、Web Service ＋ 永続ディスクを作ってくれる。
4. 数分でビルド完了 → `https://toyama-eats-app.onrender.com` のような**固定URL**が発行される。これを携帯で開く・人に渡す。

## 方法B: Blueprint を使わず手動で作る場合

Render「New +」→「**Web Service**」→ リポジトリ選択 → 以下を入力:
- **Runtime**: Node
- **Build Command**: （空でOK。依存ゼロ）
- **Start Command**: `node scripts/serve-app.mjs`
- **Instance Type**: Free
- **Environment Variable**: `DATA_DIR` = `/var/data`
- **Disk**（Advanced）: Name=`user-data` / Mount Path=`/var/data` / 1GB
  ※ ディスクを付けないと、再起動のたびに登録ユーザーが消えます（デモなら無くても可）。

---

## 無料プランの注意点（デモには十分）

- **スリープ**: 15分アクセスが無いとスリープし、次のアクセスで起動に十数秒かかる（無料枠の仕様）。商談直前に一度開いて起こしておくとよい。
- **永続ディスク**: `render.yaml` の通り `/var/data` にマウントすれば、登録ユーザー（`users.json`）は再デプロイでも消えない。ディスク無しだと消える。
- **独自ドメイン**: 後から無料で `onrender.com` サブドメイン名を変えられる（サービス名＝URL）。覚えやすい名前にしておくとSNSのリンクに載せやすい。

## SNS（toyama_eats+）への設置

発行されたURLを **IGプロフィールのリンク欄**に貼る。プロフィール文かハイライトで
「気になったお店を保存できる『お店帳』をはじめました」と一言。タップ→ようこそ画面→登録、の導線になる。

## 更新のしかた

- 掲載店や一言（note）を変えたい → 社内リポジトリで `app/data/shops.json` を整え、このフォルダにコピーして push（GitHub連携なら push で自動再デプロイ）。
- アプリ本体（index.html）を直したとき → 同様にコピーして push。

---

## ⚠️ 本番（一般公開を本格化）する前に

現在の認証は「ニックネーム＋あいことば（数字PIN）」の**プロトタイプ簡易方式**。広く公開するなら:
- メール確認 or SNSログイン（OAuth）への置き換え
- パスワードリセット手段
- レート制限・総当たり対策（Renderは自動HTTPSなので通信暗号化は満たす）
これらは v1.0 の作業（`knowledge/food-db-design.md` F5）。
