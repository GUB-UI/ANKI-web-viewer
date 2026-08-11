# Kioku

iPhone向けローカル暗記PWA。既存のAnkiデッキ（`.apkg`）を取り込み、同期なし・オフラインで間隔反復学習できます。

## コンセプト

**開く → 覚える → 閉じる**

- Anki完全互換クライアントではない
- データはすべて端末内（IndexedDB）
- アカウント / 同期 / 外部APIなし

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

静的ホスト（GitHub Pages 等）に `dist/` を配置すれば利用できます。`base` は相対パス（`./`）です。

## 技術

Vite · React · TypeScript · Dexie · ts-fsrs · sql.js · JSZip · vite-plugin-pwa
