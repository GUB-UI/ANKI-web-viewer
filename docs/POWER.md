# Kioku 省電力化 調査・改善計画

改訂日: 2026-09-18 ／ 対象: GUB-UI/ANKI-web-viewer（Kioku）

調査基準: `main` = `8ebc4f9`（最終コミット 2026-09-15 UTC）。対象はこのソース。端末の Service Worker が保持する配信版との一致は未確認。

検証方法: ソース読解に加え、Node 22.14 の型ストリッピングで `src/utils/audio.ts` を依存無しで直接読み込み、`AudioContext` / `setInterval` をモックして呼び出し回数を計測した。本番ビルドのチャンクサイズは同コミットで `npm run build` を実行して記録した。iPhone 実機の電力測定は未実施。したがって削減率は示せない。

## 1. 結論

最優先は、音声の自動再生を支える無音 keep-alive の寿命管理。次にメディア検索・音声デコードの重複と、自動めくりの過剰なタイマーを削減する。外観を変える必要はない。

## 2. 段階 0 基準測定（`8ebc4f9`）

呼び出し経路（モック実行）:

| 指標 | 条件 | 値 |
|---|---|---|
| keep-alive 間隔 | `unlockAudio()` 後 | 2000ms |
| 無音 `start()` | 60 秒相当（30 ticks） | 30 |
| `ctx.resume()` | 同じ 30 ticks、`state === 'running'` | 0（unlock 時の 1 回のみ） |
| `ctx.resume()` | 同じ 30 ticks、`state === 'suspended'` | 30 |
| `clearInterval` | `stopAudioPlayback()` 後 | 呼ばれない |
| `AudioContext.suspend()` | `stopAudioKeepAlive()` 後 | 0（`src/` に当該呼び出しなし） |
| 遅延 resume 競合 | 未完了 `resume` 中に stop | タイマーが復活（interval 0 → 1） |
| `decodeAudioData` | 同一 Blob を 3 回再生 | 3 |
| `visibilitychange` 購読 | `src/` 全体 | なし |

本番ビルド（Vite 8.2.1）:

| 成果物 | サイズ |
|---|---|
| `dist/assets/index-*.js`（初期チャンク） | 621.52 kB（gzip 198.67 kB） |
| `dist/assets/index.browser-*.js` | 513.04 kB（gzip 248.83 kB） |
| `dist/assets/sql-wasm-*.wasm` | 659.73 kB（gzip 326.10 kB） |
| `dist/index.html` が読むスクリプト | 初期チャンクのみ。sql.js は静的 import 経由で初期グラフに入る |
| PWA `registerType` | `autoUpdate`。`registerSW({ immediate: true })`。生成 SW に定期 `setInterval` は見当たらない |

比較用のアプリ指標（実装後も同一条件で取る）:

- タイマー回数と AudioContext 状態（unit: keep-alive / 自動めくり）
- decode 回数（同一 Blob の再再生）
- DB 取得件数（デッキ別統計、欠損メディア検索、ホーム当日履歴）
- 描画更新回数（秒表示は原則 1 回/秒、スワイプは 1 フレームに集約）

iPhone Safari / ホーム画面 PWA の CPU 時間と電池は、温度・明るさ・通信・音量・操作頻度を揃えた 30〜60 分の複数回測定が必要で、この環境では未実施。

## 3. 実行して確認できた事実

keep-alive の寿命は、デッキ一覧の再マウントだけで決まる。

- `stopAudioKeepAlive()` の呼び出し元は `src/pages/DecksPage.tsx` のみ。
- `src/` の `AudioContext.suspend()` / `close()` は無い（`.close()` は取り込みの sql.js / ZIP）。
- 学習完了画面・非表示・画面ロックではタイマーが残る。
- 未完了 `resume()` 中の停止は、解決後にタイマーを復活させる。

同一音声は再デコードされ、回答のたびに `StudyCardView` が `key={cardId:answered}` で作り直されるため、メディア URL もカード単位より高頻度で作り直される。

## 4. 発見と対応

P0＝最初に対処、P1＝通常学習の効率化、P2＝利用頻度と実測結果に応じて対処。順位は処理の継続性に基づく仮順位で、測定済み電力量の順位ではない。

### P0 無音 keep-alive

学習セッションが寿命を持つ。完了・アンマウント・非表示で keep-alive を解除し、必要な再生が終わって無音なら `suspend()`。遅延 resume は世代トークンで無効化。前景の keep-alive 完全撤去は、iOS 実機で表面自動再生が維持できるまで行わない。

### P1 デコードとメディア URL

メディア ID をキーにデコード済み `AudioBuffer` を PCM 容量上限の LRU で共有し、同時デコードは一本化。Blob / object URL も共有し、使用中は破棄しない。インポート・復元・削除で無効化する。

### P1 自動めくり

秒の境界に合わせて次の表示更新を予約する（原則毎秒 1 回）。めくり期限タイマーは独立。非表示中は表示更新を止め、復帰時に元の期限から再計算する。対象コールバックの約 80% 削減は電力 80% 削減を意味しない。

### P1 メディア名検索

通常経路は `filename` の `anyOf`。大小文字違い・欠損時だけ `media.filter` 全表走査に落ちていた。`filenameLower` 索引を追加し、見つからない名前は短期記憶する。衝突時は完全一致を優先し、大小文字違いだけなら `id` の辞書順で安定選択する。

### P2 統計クエリ

デッキ別でも期間内の全履歴を読んでから絞っていた。期間「すべて」は `toArray()`。既存の `[deckId+reviewedAt]` で対象デッキだけ取る。

### P2 ホームの当日履歴

`snapshotHomeState` と `loadTodayFronts` が同じ当日ログを別 `liveQuery` で読んでいた。共通スナップショットから派生し、表面テキストは cardId とノート内容の世代でメモ化する。

### P2 スワイプと初期バンドル

`pointermove` ごとに state 更新していたので 1 描画フレームに集約し、静的本文を分離する。ぼかしや FPS は変えない。`ImportPage` と `StatsPage` は `React.lazy` で分割する。

## 5. 主因として扱わないもの

通常学習に同期ポーリングや常時 `requestAnimationFrame` は無い。CSS の `infinite` / `will-change` は 0 件。ホームの `liveQuery` は変更通知。取り込み負荷は操作中に限定。

## 6. 維持すべき契約

Sumiwatari の配色・ガラス・文字・余白・アニメーション、表面の音声自動再生、裏面追加音声、Apple Music との同時再生、音量と 2.5 倍ゲイン、500ms 評価ロック、自動めくり期限、左右スワイプ、FSRS と Again 再挿入順、統計・学習記録、オフライン・インポート・復元。

音声復帰のために追加の再生ボタンやタップを要求しない。自動再生が失敗する場合は前景の必要区間に限った keep-alive を残す。隠れている間の経過時間・学習時間の算定は変えない。
