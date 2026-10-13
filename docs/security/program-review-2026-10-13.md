# プログラム v1.2 の点検（2026-10-13、運営者による）

メインネットで実際の資金を扱う前に、Anchor プログラム `programs/proofmarket`（v1.2、`e74ebd5` まで）を運営者が読み直した記録。**第三者の監査ではない。** 読んだ範囲、確かめたこと、見つけた注意点、メインネットで守る運用を書く。

## 読んだもの

- `src/lib.rs`・`state.rs`・`constants.rs`・`error.rs`・`events.rs`・`instructions.rs`
- 命令 7 つ: `initialize_config`・`update_config`・`add_mint`／`remove_mint`・`initialize_task`・`finalize_verification`・`settle`・`refund`
- LiteSVM のテスト `tests/program_tests.rs`（25 本。P-INIT-01〜03、P-FIN-01〜04、P-SET-01〜05、P-REF-01〜03、P-OVF-01、P-CFG-01、P-MINT-01〜05 ほか）。`cargo test -p proofmarket` は 2026-10-11 に 23/23、v1.2 の追加後に全件通過

## 資金が動く経路と、守られていること

| 経路 | 署名する鍵 | 確かめたこと |
|---|---|---|
| treasury → vault（`initialize_task`） | operator | `paused` なら拒否。額 > 0、1 ≤ quorum ≤ required ≤ max_witnesses、締切は未来、`amount × required` は checked_mul。Task PDA は `init` なので同じ task_id_hash を 2 度は作れない（二重入金なし）。mint は `Config.bounty_mint` か、admin が `add_mint` した mint だけ。treasury は bounty_mint なら `Config.treasury` に固定、それ以外は operator 所有の口座に限る |
| vault → 証人（`settle`） | operator | 状態が `Finalized` のときだけ。受け取り口座は `recipient_count` と同数、各口座は `get_associated_token_address(recipient, mint)` と一致し、token program 所有・書込可・mint と owner が一致。**全口座を確かめてから**送金する。払う額は `amount_per_witness × recipient_count` で vault の残高以下、余りは treasury へ、vault は閉じて rent は operator へ。wSOL のときは受け取り先が財布そのもの（system 所有）で、空の財布には rent 以上の額しか払わない（`PayoutBelowRent`）。vault を task 口座へ閉じ、プログラムが lamports を財布へ移す。移した合計は vault の lamports と一致する（task 口座の残高は変わらない） |
| vault → treasury（`refund`） | operator | 状態が `Funded` のときだけ。理由 `None` は拒否。`Expired` は締切を過ぎてから。全額を treasury へ、vault を閉じる |
| 判定の記録（`finalize_verification`） | verifier | 状態が `Funded` のときだけ。root と hash は非ゼロ、受取人は重複なし・既定値なし・required 以下・MAX_RECIPIENTS（5）以下。Verified／NoConsensus は quorum 以上、InsufficientWitnesses は 1 以上 quorum 未満、None は拒否。額の引き下げは可、引き上げは不可（`AmountIncrease`） |

二度払いの防止: `settle` と `refund` は vault を `UncheckedAccount` で受け、**状態を確かめてから**読む。閉じた vault を読んで落ちる前に `InvalidStatus` で止まる（D8〜D10）。`Settled`・`Refunded` からは何にも遷移しない。

鍵の分離: `initialize_config` と `update_config` は operator ≠ verifier を要求する。受取人を決める鍵（verifier）と vault を動かす鍵（operator）が別なので、サーバーの鍵 1 本が漏れただけでは、自分を受取人にして払えない。

## 注意点（コードの欠陥ではないが、メインネットで効いてくるもの）

1. **operator は `Funded` の task をいつでも `Cancelled` で返金できる。** 証人が作業中でも、オンチェーンは止めない。歯止めはサーバー側（T15: 向かっている証人がいれば取り消さない）だけ。operator 鍵が漏れた場合、進行中の報酬が treasury に戻る（証人が損をする）。→ 運用: operator 鍵は Vercel の環境変数にだけ置き、漏えいを疑ったら `update_config` で鍵を替える（admin が署名）。
2. **`finalize_verification` に時間の制限がない（D-11）。** verifier 鍵が漏れると、`Funded` のまま残っている task の受取人を好きに決められる。ただし払うのは operator なので、両方が漏れないと資金は動かない。→ 運用: verifier の鍵も operator と別の場所で管理する。
3. **`refund` は `Funded` のまま締切を過ぎた task しか `Expired` にできない。** 証人が提出したのに verifier が finalize しないと、資金は vault に残り続ける。サーバーの tick が止まると起きる。→ 運用: 08 §5 の tick の警告を必ず受け取る。
4. **`update_config` の `bounty_mint` の変更は treasury と同時にしか変えられない。** 正しい。ただし変更後も、古い mint で `Funded` の task は `is_treasury_for` が「operator 所有の同じ mint の口座」も許すので settle／refund できる。
5. **プログラムの更新権限。** `solana program deploy` した鍵（admin）がそのまま upgrade authority になる。これが漏れるとプログラムを差し替えられる。→ 運用: admin はサーバーに置かない。配置のあと `solana program set-upgrade-authority` でマルチシグかハードウェア財布に移すか、監査を受けるまでは少なくとも別の鍵にする。
6. **`settle` の wSOL 経路で、受取人の財布が「空ではないが rent 未満」のとき。** 存在する財布は常に rent 以上の残高を持つので、この状態は起きない。0 のときだけ検査すれば足りる。
7. **イベントは出すが、サーバーはイベントではなく口座を読む。** 監視を足すなら、`TaskSettled` の `paid_total` と DB の `payment_records` を日次で突き合わせる。

## 見つからなかったもの

- 整数のあふれ（checked_mul／checked_sub を使っている箇所を全部確かめた）
- 口座の取り違え（seeds と `address =` 制約で全部固定されている）
- 署名者の取り違え（各命令の signer は `Config` の鍵と `address =` で一致を要求）

## メインネットで守ること（決定文書の歯止めと合わせて）

- treasury には 1 日の支払い見込みの 2 倍までしか置かない。超えた分は admin へ
- admin はサーバーに置かない。upgrade authority も admin
- operator と verifier の鍵は別の場所で管理し、漏えいを疑ったら `update_config` で替える
- tick の警告（DEAD・決済 10 分超・SOL 残高）を必ず受け取る
- 第三者の監査は、資金の量が増える前に受ける。それまで treasury の上限を上げない
