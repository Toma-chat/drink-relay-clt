# 売上・注文集計

管理画面の「売上・集計」から、今日・昨日・今週（月曜開始）・今月・期間指定を選べます。日付境界はDBと画面の両方でAsia/Tokyoを使用し、最大366日です。注文・提供状態のRealtime通知で更新し、30秒の再取得、画面復帰、通信復帰、手動更新でも同期します。失敗時は前回の値とその対象期間を保持し、再試行を表示します。

## 集計と価格

- 杯数は注文数量。提供済みはserved、未提供はordered/making/made。キャンセルとcorrection/corrected/replaced/voided/canceledイベントを除外します。既存の会計・届け先編集のupdatedイベントは注文を取り消す操作ではないため除外しません。
- 商品IDを優先します。IDのない過去注文は、現在メニューで同名が1件だけの場合に照合し、複数候補は独立した過去名称行として残します。異なるIDは別行にし、一覧・CSVに内部IDも表示します。分類できないカテゴリは「カテゴリ不明」です。
- ソフトドリンクはメインカテゴリ、アルコールは現在メニューのサブカテゴリ（ビール、サワー等）を使用します。新規注文時にカテゴリも保存します。
- 通常飲み放題とWarmupは注文イベントのsource/sessionId、Warmup専用セッションIDで判定します。
- 通常飲み放題の人数は、期間中にアクティベートされたセッションの一意件数です。再接続で変更されるactivationRevisionは人数キーに使いません。固定QRが別の利用者に再利用されても前のセッションは履歴に残ります。
- プラン別杯数は期間中の注文が対象。人数・利用状態は期間中のアクティベートが対象です。平均は、期間中のアクティベートまたは注文があるセッションの一意件数で割り、注文なしの新規利用者も含めます。ワンドリンクには利用者IDがないため、その人数・平均は推測しません。
- ワンドリンクの単価は、DBトリガーで新規注文時に実メニューから取得して非公開履歴へ保存します。提供状態更新時には価格を変更しません。過去データと古い時刻での再送注文には現価格を補完しません。
- 通常飲み放題は初回アクティベート時のプラン価格を1件だけ保存します。受付の飲み放題商品注文を杯数・売上に重複加算しません。Warmupは0円です。支払い方法・店舗徴収は変更していません。
- 金額不明注文またはプランがある期間は、総売上を確定値として表示せず「金額判明分」と不明件数を表示します。

## セキュリティと履歴

Supabase Auth/PostgRESTがJWTを検証し、RPC内でauth.uid()とdrink_private.staffを確認します。店舗は非公開analytics_storeの既存店舗IDと照合します。匿名ロールにはRPC実行権限を付けません。SQLはパラメーター化され、動的SQLを集計に使用せず、実行時間を15秒に制限します。ブラウザは集計結果だけを受信し、元注文を全件取得しません。CSV操作時にもセッションとスタッフ許可を再確認します。セルの式実行対策とUTF-8 BOMを実装しています。

注文は非公開drink_private.analytics_ordersへ保存し、注文テーブルの24時間削除ジョブは変更しません。既存の注文・メニュー・セッション・QRは上書きしません。価格履歴のない過去注文や、導入前に削除済みの注文・上書き済みの利用履歴は復元できません。履歴保存開始日時と過去期間の欠落の可能性を画面に表示します。履歴が不明な飲み放題注文は杯数に残し、人数・平均の推測から除外します。

## 変更ファイル

- index.html: 集計画面、サイドバーボタン、JS/CSS読込。
- app.js: 既存画面切替との接続、受付注文にメニューIDを保存。
- sales-analytics.js / sales-analytics.css: レスポンシブ画面、期間指定、取得・更新・エラー保持・CSV。
- supabase/functions/unlimited/index.ts: 注文イベントにitemIdを追加（その他の注文・QR・認証ロジックは維持）。
- supabase/sales-analytics.sql: 非公開履歴、価格スナップショット、セッション一意保存、スタッフ専用drink_sales_summary RPC。
- tests/sales-analytics.cjs / sales-analytics.sql / sales-http.cjs / unlimited-regression.cjs: 自動・再現可能なテスト。

security-foundation.sql、security-lockdown.sql、time-sync.sql、Warmup SQL/Functionのファイルは変更していません。

## Supabase適用手順

今回の接続先 nngizmvyzujxrkaevliu では、現状調査とロールバック検証後にsales-analytics.sqlを適用し、unlimited Functionを再デプロイしました。本番に旧匿名RLSが残っていたため、既存のsecurity-lockdown.sqlも適用しています。追加の手動SQL実行は不要です。

別環境で導入する場合は、既存のWarmupとsecurity-foundationの導入、および許可スタッフを確認したうえで、以下を順番に行ってください。

1. supabase/sales-analytics.sqlをSQL Editorで実行（この店舗テンプレートの既存店舗IDを検証）。
2. unlimited Functionを現在の認証対応ソースでデプロイ。
3. HTML/JS/CSSを公開し、スタッフ・顧客画面を確認。
4. 未適用の場合だけ、既存security-lockdown.sqlを実行。旧匿名RLSへ戻さないでください。
5. 下記テストと実画面を確認。

SQLはトランザクション内で適用され、再実行時に既存履歴や価格を上書きしません。ブラウザ用の設定値を変更したりservice_roleキーを配置する必要はありません。

## テストの実行

```powershell
node tests/sales-analytics.cjs
node tests/unlimited-time.cjs
node tests/unlimited-regression.cjs
node tests/sales-http.cjs
npx --yes supabase db query --linked --project-ref nngizmvyzujxrkaevliu --file tests/sales-analytics.sql
```

SQLテストは既存の許可スタッフ1名を使用し、テスト用注文・セッション・Warmup認証をトランザクション内に作成して最後にROLLBACKします。実際の厨房にはテスト注文を残さず、Realtime通知もコミットされません。Edgeの注文・再接続テストは実ソースをメモリ上のSupabaseアダプターで実行し、実QRをアクティベートしません。

適用前後で99件の既存注文の全内容、メニュー、固定QRカタログ、飲み放題セッション、Warmup固定QRのハッシュが一致しました。99件を集計用履歴へ保存しました。導入時の2026-10-12の実データは33杯・提供済み33杯・未提供0杯で、過去の33注文は価格不明として扱いました。
