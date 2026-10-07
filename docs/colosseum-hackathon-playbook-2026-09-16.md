# Colosseum Hackathon Playbook 精読メモ / 実行ルール

調査日: 2026-09-16

Primary source: Superteam Japan, **Colosseum Hackathon Playbook**
https://superteam-japan.gitbook.io/hackathon-playbook

この文書は、2026年秋のColosseum Hackathon（Crypto World's Fair）での入賞を目的として、Superteam Japanが過去winner、judge、多数のteamへのinterview / analysisを基に作成したPlaybookを、このリポジトリの実行ルールへ変換したもの。

> 注意: Playbookを「これを守れば自動的に入賞する保証」とは扱わない。競争相手、judge、product quality、execution等で結果は変わる。ただし、応募プロセス上の重要な実践知として原則すべて反映する。

---

# 0. Playbookの推奨順序

Playbookは以下の順で進めることを推奨している。

1. Hackathon Canvas
2. Pitch Deck
3. Iteration
4. Hype Video
5. Pitch Video
6. Technical Demo Video

さらにChecklistとしてTasks / Build in Public / Strategy for X / Red Flag Word List等を並行運用する。

---

# 1. Hackathon Canvas

Hackathon Canvasは、短期間でstartupをlaunchしColosseumで勝つためのframework。

二つのphaseに分かれる。

## Planning Phase — Lean Section

Lean Canvasを用いてproblem、solution、customer segment等を一枚で整理・検証する。

重要なのは「最初にcodeを書く」のではなく、problem / user / value propositionを先に固定すること。

## Execution Phase — Momentum Section

hackathon終了時点までに結果を出すためのKey Success Factorsを管理する。

このリポジトリでは各候補案に最低限以下を用意する。

- Problem
- Initial target user
- Existing alternative
- Unique value proposition
- Why now
- Why crypto
- Why Solana
- Distribution wedge
- MVP
- Measurable momentum during hackathon

Source: https://superteam-japan.gitbook.io/hackathon-playbook/1.-hackathon-canvas

---

# 2. Pitch Deck

Playbookが強調する最重要点は「なぜこのprojectを作るのか」とfounder story。

単にmarket opportunityを説明するのではなく、founder/teamがproblemに遭遇した経緯、経験、なぜ自分たちが解決するのかをstoryとして構造化する。

推奨story pattern:

1. founderが特定industry/problemで課題を発見
2. そのproblemを解くためproductを作った
3. 最初は狭いuser segmentから始める
4. feedbackを受けてfeatureを開発
5. 小さなwedgeから大きなvisionへ拡張

## Pitch DeckのBad Practices

- problemとtarget userがabstract / vague / broad
- textが多すぎる
- structureがなく理解しにくい
- key informationが欠ける
- 意味のないdesign / visualization

### このリポジトリへのルール

「日本人」「企業」「学生」「自治体」などの広すぎるtargetは禁止。最初のuserを具体的に狭める。

Source:
- https://superteam-japan.gitbook.io/hackathon-playbook/2.-pitch-deck
- https://superteam-japan.gitbook.io/hackathon-playbook/2.-pitch-deck/best-and-bad-practices

---

# 3. Pitch Agenda

Playbookの例:

1. Hook
2. Problem
3. Solution
4. Product
5. Demo
6. Business Model
7. Traction
8. Market — 必要なら
9. Roadmap — 必要なら
10. Team
11. Call to Action

3分未満で説明する。

Colosseum Hackathonはpre-seed近辺のprojectを対象とするため、初期pitchで以下は原則不要。

- Financials
- Long-term sales forecast
- Tokenomics

Market slideを入れる場合は、新しいmarketを作るのかを説明し、必要に応じTAM/SAM/SOMを示す。

最初のtargetは意図的にnarrowにする。これは最終marketを小さくする意味ではなく、customerを深く理解するためのbeachhead。

Source: https://superteam-japan.gitbook.io/hackathon-playbook/2.-pitch-deck/agenda-example

---

# 4. Iteration

Playbookが最も重視するbehaviorの一つ。

focus:

- judgeが主に触れるpitchを最高品質にする
- feedbackを得て高速iteration
- venture-scalableなものを作る

基本cycle:

1. Pitchを作る
2. 2–3人程度のuser / friend / mentorからfeedback
3. すぐ修正
4. 修正版を別の人に見せる
5. productも修正
6. repeat

100人に同じv0を見せるより、2–3人 → revise → 新しい2–3人の方が価値が高い。

iteration cycleは可能な限り高速にし、目安1–7日。毎cycleにhypothesisを置く。

例:
- このslideでproblem理解率が上がるか
- このfeatureはuserをdelightさせるか
- onboarding frictionが下がるか
- Solana transactionまで到達するuserが増えるか

Consumerは高速、DeFi等は検証に時間がかかる場合がある。

Source: https://superteam-japan.gitbook.io/hackathon-playbook/3.-iteration

---

# 5. Hype Video

Videoはattention獲得に非常に有効。

Playbookは大きくNarrative Type / Teaser Typeを例示している。

このリポジトリではHype Videoを単なる広告にせず、projectのone-line narrativeを視覚的に伝えるassetとして作る。

目的:
- projectを一度で記憶させる
- Build in Publicでshareしやすくする
- pitchを見てもらう入口を作る

Source: https://superteam-japan.gitbook.io/hackathon-playbook/4.-hype-video

---

# 6. Pitch Video

Playbookは **Pitch Video is the most important part of the hackathon** と明記。

Rule: **3分未満**。

過去winnerとしてTokamai、The Arena、FXSwap、Windfall、UNKOMON等のpitch videoをreferenceとしている。

このリポジトリではsubmission直前に作るのではなく、pitch deck iterationと同時にscriptを更新する。

Pitch Videoでjudgeが短時間に理解できる状態:

- 誰の何のproblemか
- なぜ今か
- productが何をするか
- 実際に動くか
- Solanaが本質的に必要か
- traction / validationはあるか
- founder/teamがなぜ勝てるか
- どこまで大きくなるか

Source: https://superteam-japan.gitbook.io/hackathon-playbook/5.-pitch-video

---

# 7. Technical Demo Video

Rule: **3分未満**。

productがbehind the scenesでどう動くかを説明する。ただしcodeを逐行説明する必要はない。

参考例としてLootGO、Crypto Fantasy League、Daikoが掲載されている。

このリポジトリではtechnical demoに以下を必ず含める。

1. working product
2. user action
3. wallet / transaction / program interaction
4. on-chainとoff-chainの境界
5. Solanaを使う部分
6. transaction result / explorer等のproof
7. failure / fallbackが重要ならその設計

Source: https://superteam-japan.gitbook.io/hackathon-playbook/6.-technical-demo-video

---

# 8. Preparation / Daily / Weekly Tasks

## Preparation

- Colosseum official/member accountsをfollow
- judgesを把握
- Superteam core members / mentorsと接点を作る
- Build in Public groupへ参加
- project X accountでproject introductionを投稿

## Daily

X:
- project / idea / requestをpublicにshare
- 関係を築きたい人のpostに早くreaction
- 相手が価値を感じるcomment付きquote
- 可能なら実際に会う

Colosseum:
- show-and-tellでprojectをshare

## Weekly

- Colosseum DashboardへWeekly Video Updateを提出
- event / acceleration programでSolana ecosystem foundersへpitch
- judges / KOLがいる場合はpitchを見せfeedbackを得る

Source: https://superteam-japan.gitbook.io/hackathon-playbook/checklist/tasks

---

# 9. Matty Taylor checklist

Playbookが引用するColosseum co-founder Matty Taylorのproject checklist:

1. Founderはdeep lived experienceまたはobsessive curiosityからproduct opportunityを発見したか。
2. Founderはelite levelでship / iterate / prioritizeできるか。
3. 今がそのproduct / marketを作る適切な時期か。
4. credibleなdistribution path / user flywheelがあるか。
5. massive potentialを持つcrypto-native marketを作っているか。
6. Founderに最後までやり切る執念があるか。

### Repo rule

今後新しいideaを追加する際、上記6問への回答をidea fileに必須sectionとして入れる。

---

# 10. Build in Public / X Strategy

PlaybookはXを単なるmarketingではなくuser feedback loopとして扱う。

## Account separation

Project X:
- release
- feature announcement
- progress
- reply / like

Personal X:
- founder自身のopinion
- insight
- reply / like

## Do

- X Premium
- image / videoを付ける
- linkはfirst postではなくreplyへ置く

## Don't

- followerを買わない — red flag
- influencer依存
- hashtag乱用
- mention / link等のblue textを多用
- first postにlinkを置く

### このリポジトリのルール

Build in Publicはvanity metrics目的ではなく、以下を記録する。

- user interviews
- waitlist / signup
- active users
- transactions
- retention
- feedback count
- iteration history
- partner / issuer / merchant / institution LOI等

Source: https://superteam-japan.gitbook.io/hackathon-playbook/checklist/strategy-for-x

---

# 11. Red Flag Word List

目的はkeyword禁止ではなく、trend wordを寄せ集めただけのprojectを避け、Value Propositionを先に考えること。

Playbookがred flagとして挙げる例:

Proper / trend names:
- pump.fun
- AI
- DeFAI
- DeSci
- Fiverr
- Farcaster
- NFT Marketplace
- to Earn

Generic claims:
- cutting-edge
- decentralize for data control
- decentralize for data ownership
- decentralized social media
- democratize
- democratizing money
- disruptive
- game changer
- groundbreaking
- innovative
- paradigm shift
- revolutionary
- synergy

### Repo rule

Idea descriptionで上記wordを使う場合、word自体を価値として扱わない。必ず具体的problem、user behavior、measurable benefitへ置換する。

悪い例:
> AI × DePINで革新的に民主化する。

良い例:
> 道路管理者が年1回しか取得できない路面データを、市民車載cameraから毎日取得し、AI判定結果のhashとcontributor reward settlementをSolanaで検証可能にする。

Source: https://superteam-japan.gitbook.io/hackathon-playbook/checklist/red-flag-word-list

---

# 12. Colosseum Interview

interview emailを受け取った場合:

1. callをASAPで予約する。slotが埋まる可能性がある。
2. hackathon後の最新progressを示す1分videoを送る。
3. file添付ではなくvideo URLをemail返信でshare。
4. pitch reviewで指摘されたproblem / challengeを中心にinterview準備。

重要な意味: submission deadlineで開発を止めない。judge/interview時点までprogressを続ける。

Source: https://superteam-japan.gitbook.io/hackathon-playbook/to-those-close-to-winning/colosseum-interview

---

# 13. Winner発表後

Playbookはwinnerに対し、X上で短いOscar-style speechを推奨。

構造:

1. 最初に率直な感情
2. Solana developer/communityへのrespect
3. 重要なcontributor 1–3名を優先して感謝
4. 一つだけshort storyまたはnumberを入れる

長文にせず、before/afterやusage number等の具体的dataを一つ示す。

これはhackathon終了後のdistribution / reputation buildingまで含めてstartup processと捉える考え方。

Source: https://superteam-japan.gitbook.io/hackathon-playbook/to-those-close-to-winning/oscar-style-speech

---

# 14. 2026秋用 Mandatory Gate

今後このリポジトリからColosseum候補を選ぶ際、以下をすべて確認する。

## Problem / Founder
- [ ] initial userが狭く具体的
- [ ] problemが一次資料またはuser interviewで確認済み
- [ ] founder-market fit / lived experience / obsessive curiosityを説明可能
- [ ] existing alternativeの欠点を説明可能

## Crypto / Solana
- [ ] blockchainなしでは何が失われるか説明可能
- [ ] Solanaである理由をtransaction pattern / latency / cost / composability等で説明可能
- [ ] trend keywordだけで価値を説明していない
- [ ] crypto-native market / network effectの可能性がある

## Product
- [ ] hackathon期間中にworking MVPをship可能
- [ ] judgeが数十秒でproductを理解可能
- [ ] demo可能なon-chain actionがある
- [ ] user feedback cycleを1–7日で回せる

## Business / Distribution
- [ ] distribution wedgeがある
- [ ] first 10 usersの獲得方法が具体的
- [ ] venture-scaleへ拡張するpathがある
- [ ] tractionを数字で示せる

## Pitch
- [ ] Hook → Problem → Solution → Product → Demo → Business Model → Traction → Team → CTA
- [ ] 3分未満
- [ ] financial forecast/tokenomicsを初期pitchの中心にしない
- [ ] text過多でない
- [ ] founder storyがある

## Execution
- [ ] project Xを運用
- [ ] personal Xでinsightを発信
- [ ] Build in Public
- [ ] Colosseum show-and-tell
- [ ] Weekly Video Update
- [ ] 2–3人 feedback → revise → 新しい2–3人、を反復
- [ ] submission後も開発継続

## Submission assets
- [ ] Hype Video
- [ ] Pitch Video < 3 min
- [ ] Technical Demo Video < 3 min
- [ ] working product URL
- [ ] GitHub repository
- [ ] clear project description

---

# 15. AI Agent Instructions

ChatGPT / Codex / Claude Code / OpenClaw等がhackathon案を評価・実装するときは、この文書と `docs/colosseum-hackathon-winners-2024-2026.md` を先に読む。

AIは「AI」「RWA」「DePIN」「x402」等のtrendに合わせること自体を推奨してはならない。

各提案で必ず:

1. Problem
2. Narrow initial user
3. Existing alternative
4. Why now
5. Founder-market fit
6. Why blockchain
7. Why Solana
8. Distribution
9. Hackathon MVP
10. Measurable traction
11. Past Colosseum winner overlap
12. Differentiation

を出す。

過去winnerと類似している場合は即rejectせず、「何が既に解決済みで、どの未解決wedgeを取るか」を明示する。

---

# Primary URLs

- https://superteam-japan.gitbook.io/hackathon-playbook
- https://superteam-japan.gitbook.io/hackathon-playbook/1.-hackathon-canvas
- https://superteam-japan.gitbook.io/hackathon-playbook/2.-pitch-deck
- https://superteam-japan.gitbook.io/hackathon-playbook/2.-pitch-deck/best-and-bad-practices
- https://superteam-japan.gitbook.io/hackathon-playbook/2.-pitch-deck/agenda-example
- https://superteam-japan.gitbook.io/hackathon-playbook/3.-iteration
- https://superteam-japan.gitbook.io/hackathon-playbook/4.-hype-video
- https://superteam-japan.gitbook.io/hackathon-playbook/5.-pitch-video
- https://superteam-japan.gitbook.io/hackathon-playbook/6.-technical-demo-video
- https://superteam-japan.gitbook.io/hackathon-playbook/checklist/tasks
- https://superteam-japan.gitbook.io/hackathon-playbook/checklist/build-in-public
- https://superteam-japan.gitbook.io/hackathon-playbook/checklist/strategy-for-x
- https://superteam-japan.gitbook.io/hackathon-playbook/checklist/red-flag-word-list
- https://superteam-japan.gitbook.io/hackathon-playbook/to-those-close-to-winning/colosseum-interview
- https://superteam-japan.gitbook.io/hackathon-playbook/to-those-close-to-winning/oscar-style-speech
