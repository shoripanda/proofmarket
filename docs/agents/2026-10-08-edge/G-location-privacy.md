# 担当 G: 公開面の位置の丸め（設計書 §9 の PR 7）

ブランチ: `feat/location-privacy`。worktree: `~/proofmarket-g`。DB は触らない（丸めは出力時に計算する）。

## 作るもの

1. `CreateVerificationRequestSchema` に `location_privacy: z.enum(["exact", "coarse"])`（任意、既定 `exact`）を足す。保存先は移行 0023 で足してある `verification_requests.location_privacy`（`schema.ts` の `locationPrivacy`）。`requester-service` で保存し、`GET` に返す（スキーマ追加）。`publish: true` は従来どおり公開の可否、`location_privacy` は公開面での位置の精度、と役割を分ける
2. 丸め: `packages/core/src/domain/areas.ts` の隣に `coarseLocation(lat, lng)` → geohash 6 桁の中心（約 1.2 km × 0.6 km）と `precision_m: 1200`。geohash は依存を足さず 30 行で書く
3. 公開面の 3 か所で、`location_privacy = coarse` の依頼は `location` を丸めた中心にし `location_precision_m: 1200` を添える: `public-service.ts`（`GET /v1/public/verifications/{id}` と `publishedView`）、`map-service.ts`（地図。ピンは半透明の円で描く。`components/public-map.tsx`）、データセット（`/v1/public/dataset`）。依頼者の `GET` は正確なまま
4. 証拠バンドル（`packages/core/src/evidence/bundle.ts`）に `location_commitment: sha256(lat,lng,salt)`（`sha256:` 付き 16 進）を足す。salt は依頼ごとの乱数を `verification_requests` には置けないので `task_id_hash` を salt に使う（公開値だが、緯度経度は小数 6 桁で総当たりが現実的でないことを 07 章の注記に書く）。`evidence_root` に含まれる。`normalizeBundle` の順序を守る
5. 証明ページ `/r/[id]` と地図の説明に「おおよその場所（約 1 km）」の表記と、虫めがねの線画
6. 文書: 01 §4.22 に 1 段落、07 章に `location_commitment`

## テスト
`apps/web/test/map.test.ts`・`public result` のテストに `coarse` の 1 件: 公開面の `location` が丸められ、依頼者の `GET` は正確。`packages/core/test` に geohash の既知の値（例: 35.6595,139.7005 → `xn76ur`）と `coarseLocation` の中心。

## できたの判定
公開面に丸めた位置だけが出て、依頼者の GET には正確な位置が出る。
