# 担当 D: worker 側のブラウザ内の助け（設計書 §6）

ブランチ: `feat/worker-assist`。worktree: `~/proofmarket-d`。サーバーも DB も API 契約も触らない。全部ブラウザの中。

## 作るもの

1. `apps/web/lib/client/speech.ts`
   - `speak(text, lang)`: `speechSynthesis` で読む。進行中なら止めてから。`ja` は `ja-JP`、`en` は `en-US` の声を `getVoices()` から選ぶ（無ければ既定）。対応していないブラウザでは何もしない `supported` を返す
   - `useSpeechInput(lang)`: `SpeechRecognition`（`webkitSpeechRecognition` も）で 1 回分の書き起こしを返すフック。`supported: false` のときは呼び出し側がボタンを出さない
2. `apps/web/lib/client/sound.ts`: `cue("ok" | "back" | "result")`。Web Audio（`OscillatorNode`）で 2 音の短い合図を合成。ファイルは置かない。`navigator.vibrate` も一緒に。設定 `pm.sound`（localStorage）が `"off"` なら鳴らさない
3. `apps/web/components/ui.tsx` に `ListenButton({ text })`（スピーカーの線画アイコン、読み上げ中は停止表示）と `SoundToggle()`（音のオン・オフ、`/payouts` の下か `Shell` の見出し横）
4. 画面
   - 依頼詳細 `tasks/[id]`: 質問文の右に `ListenButton`（質問文＋受け取りの条件を読む）
   - 撮影画面 `claims/[id]/capture`: 質問文の右に `ListenButton`。文章の答えの欄と form の text 項目に「話す」ボタン（`useSpeechInput`。書き起こしは欄に追記し、送る前に見られる）。カメラ映像の上に半透明の帯で**撮影の案内**: `acceptance_criteria` を「。」で区切った最初の 4 行（無ければ種類の `howTo`）。撮影するたびに 1 行目を消す、はしない（常に表示）
   - 送信できたとき `cue("ok")`。クレーム詳細 `claims/[id]` で差し戻し（INVALID）が出たとき `cue("back")`、結果（task_result）が出たとき `cue("result")`（初回表示だけ。`useRef` で 1 回）
5. 日英の文言は `pick(lang, …)`。アイコンは SVG の線画（24×24、stroke のみ）

## 確かめ方
`pnpm dev:local` で http://localhost:3917 を開き、`/login` → 依頼 → 撮影画面まで。iPhone Safari と Android Chrome では `speechSynthesis` の声が出るか、`SpeechRecognition` が無いときボタンが隠れるかを、手元の端末かブラウザの開発者ツールのデバイスモードで確かめる。PR の説明に確かめた環境を書く。

## できたの判定
読み上げ・声で答える・撮影の案内・音が、対応するブラウザで動き、対応しないブラウザでは出ない。
