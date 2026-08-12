# Kioku

iPhone向けローカル暗記PWA。既存のAnkiデッキ（`.apkg`）を取り込み、同期なし・オフラインで間隔反復学習できます。

## コンセプト

**開く → 覚える → 閉じる**

- Anki完全互換クライアントではない
- データはすべて端末内（IndexedDB）
- アカウント / 同期 / 外部APIなし

## 使い方（iPhone・オフライン）

公開URL（GitHub Pages 有効化後）:

**https://gub-ui.github.io/ANKI-web-viewer/**

1. iPhone の **Safari** で上記 URL を開く（初回だけネット接続が必要）
2. 共有 → **ホーム画面に追加**
3. ホーム画面の **Kioku** から起動
4. `.apkg` を Import（AirDrop / ファイル App）
5. 以降は **機内モードでも** 学習・バックアップ可能

> 静的ファイルは端末にキャッシュされ、学習データは IndexedDB に残ります。PC のローカルサーバーは不要です。

### GitHub Pages をまだ有効にしていない場合

1. [Pages 設定](https://github.com/GUB-UI/ANKI-web-viewer/settings/pages) を開く
2. Source: **Deploy from a branch**
3. Branch: **gh-pages** / **/ (root)** → Save
4. 1〜2分待って上記 URL を開く

## 機能（MVP）

- `.apkg` インポート（デッキ階層・ノート・カード・画像/音声・学習状態）
- FSRS（`ts-fsrs`）による Again / Hard / Good / Easy
- 階層デッキ表示と親デッキ学習
- カスタム学習（今日だけ新規枚数 / 過去N日のAgain補強復習）
- バックアップ & 完全復元
- PWA（ホーム画面追加・オフライン）

## 開発

```bash
npm install
npm run dev
```

```bash
npm run build
npm run preview
```

```bash
npm test
npm run test:e2e
```

`base` は相対パス（`./`）です。`main` への push で GitHub Actions からも Pages へデプロイできます。

## 技術

Vite · React · TypeScript · Dexie · ts-fsrs · sql.js · JSZip · vite-plugin-pwa
