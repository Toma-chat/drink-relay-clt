# Warmup平日飲み放題

Warmupは共通の固定QRと、JSTの当日だけ有効な共通4桁コードを使います。商品本体は既存 `drink_app_settings` の `main` を参照し、対象ルールの唯一の編集元は `unlimited-config.js` の `unlimited-alcohol-all-day`（アルコールスタンダード）です。お客様画面・1杯カート・届け先ダイアログは既存飲み放題画面を再利用しています。Warmupの終了は22:30ではなく翌日0時です。

## Supabaseへの適用（本リポジトリでは未適用）

1. 既存DBをバックアップし、ステージングで先に検証してください。`supabase-schema.sql` 導入済みを前提に、SQL Editorで **一度だけ** `supabase/warmup.sql` を実行します。pgcryptoとpg_cronが必要です。
2. `node scripts/warmup-bootstrap.cjs` で共有プロフィールと内閣府の祝日CSVをSQL化し、`supabase/warmup-bootstrap.sql` を実行します。既存QRはupsert時に維持されます。生成済みファイルは2027年末まで収録しています。
3. Supabase Authでスタッフユーザーを作り、SQL Editorから許可します（値を実際の店舗ID・AuthユーザーUUIDへ置換）。

```sql
insert into warmup_private.staff(store,user_id)
values ('store-config.jsのinstanceIdを正規化した値', 'AuthユーザーUUID');
```

4. Supabase CLIで対象プロジェクトへリンク後、`supabase functions deploy warmup --no-verify-jwt`。Edge内でスタッフJWTを `auth.getUser` で検証し、DBでも店舗別の許可リストを検証します。service-roleキーはEdgeの環境変数だけに保持します。ブラウザへの配置は禁止です。
5. 受付のWarmup管理でスタッフログインし、固定QRを表示・印刷します。バー端末も同じURLの受付タブからスタッフログインしてからバーへ切り替えてください。スタッフ認証は既存Supabaseクライアントと共有され、Warmupの提供済み操作に必要です。通常注文の操作には追加認証を要求しません。
6. HTTPS配信後、複数の実端末でコード入力、注文、バーの全面タップ、席変更を確認してください。Edgeの実環境で `x-forwarded-for` がゲートウェイによって上書きされ、利用者が偽装できないことを確認してください。IPヘッダーがない認証リクエストは拒否します。

`store-config.js` は一切変更していません。本番DB・Edgeへのデプロイ、スタッフ作成、実端末接続は未実施です。追加SQLを適用しない場合、Warmupは通信エラーとして停止し、ローカルデモによる認証・注文へフォールバックしません。

## 運用と合理的な仮定

- 数量1・未提供1件の制限は端末セッション単位です。同じ端末の再認証はセッションを再利用します。端末の保存領域を消す／別端末へ切り替える利用者を同一人物と判定する本人確認はありません。
- 共通QRは公開される前提です。秘密は日替わりコード・端末トークン・スタッフ認証です。端末トークンは256bit乱数のハッシュだけをDBへ保存し、端末にはlocalStorageへ保存します。
- 端末・IPは15分の窓で失敗5回、店舗QR全体は100回でロックします。成功しても窓内の失敗カウンターは消しません。共有Wi-FiのIP制限は複数人に影響する場合があります。
- 毎日JST 0時（UTC 15時）のcronでコードを生成します。cronが遅延してもAPIが当日行を生成し、以前の日付の認証・停止状態を使いません。前日と同じコード、再生成前と同じコードは避けます。日付からの決定的なコード生成はありません。
- 停止・再開は当日行だけを更新し、未提供注文を消しません。再生成時のチェック未選択なら既存端末は継続、選択時は再認証が必要です。失敗・成功・ロック・停止・再開・コード再生成は `warmup_private.audit` へ記録します。
- 席変更QRは既存 `unlimited-location.html` を利用します。QRには権限を含めず、そのブラウザに保存した有効なWarmupトークンでAPIを呼びます。同端末に通常飲み放題もある場合、有効なWarmupを優先します。
- メニュー画面の名称・選択肢・削除は既存メニュー変更から自動反映します。対象商品IDや標準プロフィールの選択ルールを変更した場合は、共有設定からbootstrap SQLを再生成・適用します。Warmup固有の商品コピーはありません。
- 祝日は[内閣府の公式CSV](https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html)から取り込みます。毎年2月以降に生成スクリプトを実行・適用してください。収録期限を過ぎると利用を拒否するため、未収録年を平日扱いしません。祝日一覧は毎回upsertです。過去の公式データ訂正で日付が削除された場合はSQL Editorで該当行を修正してください。
- 店舗独自休業日は `warmup_private.closures(store,day,name)` にSQL Editorから追加できます。

## 影響範囲

非公開の8テーブル、service-role専用RPC、JSTの日次cronを追加します。既存注文にnullableの `warmup_session_id` と未提供1件の部分ユニーク索引、Warmupに限定した更新ガード・削除防止を追加します。通常注文・既存飲み放題の公開キー経由の読み書きは維持します。Warmup行の直接insert・匿名での提供済み更新・別セッションへの変更を拒否します。既存の全面タップ、全面グレー、1.6秒で消える処理は変更せず、小さなWarmup識別表示のみ追加しています。

既存の通常注文・既存メニュー設定は元の公開RLSを維持します。全アプリをスタッフ権限へ移行するセキュリティ変更は含めていません。共有メニュー設定の編集権限も既存仕様のままです。

## 検証

`tests/warmup-db.cjs` はPGliteで本SQLをコンパイル・実行し、認証、試行制限、当日再利用、土日祝、停止・再開、0時失効、再生成、提供待ち制限、届け先変更、メニュー反映、直接RPCと匿名更新拒否、スタッフ提供済み、通常数量注文を検証します。テスト内だけで時刻を注入し、pgcrypto・pg_cronをスタブに置換しています。本番SQLは実際の暗号乱数・サーバー時計を使用します。本番拡張、実際のcron発火、Edgeゲートウェイ、ネットワーク越しの複数端末は別途実環境で確認してください。

```powershell
npm install --prefix "$env:TEMP/warmup-validation" @electric-sql/pglite typescript jsdom
node tests/warmup-db.cjs
node tests/warmup-ui.cjs
node tests/regression-ui.cjs
node scripts/serve.cjs
```

追加ファイルは `warmup-client.js`（専用Gateway）、`warmup-admin.js`（管理UI）、`supabase/warmup.sql`、`supabase/warmup-bootstrap.sql`、`supabase/functions/warmup/index.ts`、`supabase/config.toml`、生成・ローカル配信スクリプト、DB/UIテスト、この文書です。

今回の検証結果: DB 38項目、DOM画面操作・JS/Edge構文16項目、既存受付・通常メニュー・バー・設定・提供済み処理・飲み放題の回帰6項目が通過。DOMテストのAPI通信はモック、DBテストは実SQL実行です。ローカルHTTPの受付、お客様、場所変更、追加JSは200応答。`git diff --check` にエラーなし、`store-config.js` に差分なし。実ブラウザの描画・実Supabaseへの通信は未検証です。
