# セキュリティ更新の適用手順

この更新は既存のSupabase URL、公開キー、店舗ID、固定QRトークン、注文データを変更しません。
管理画面だけを隠すのではなく、未ログイン利用者によるテーブル直接操作をRLSと権限設定で遮断します。

## 変更後の権限

- 受付・バー・メニュー設定・QR管理: Supabase Authでログインし、`drink_private.staff` に登録されたスタッフのみ
- 通常飲み放題のお客様: `unlimited` Edge Functionだけを利用
- Warmupのお客様: 既存の`warmup` Edge Functionを利用
- `drink_orders` / `drink_app_settings`: 未ログイン利用者からの直接SELECT・INSERT・UPDATE・DELETEは禁止
- Service Roleキー: Edge Function内だけで利用し、ブラウザへは配置しない

## 無停止に近い適用順序

順序を入れ替えると、一時的に注文または管理画面が利用できなくなる可能性があります。

1. Supabase SQL Editorで `supabase/security-foundation.sql` を実行します。
2. `drink_private.staff` にスタッフが存在することを確認します。Warmupのスタッフ設定済み環境では自動コピーされます。
3. コピーされなかった場合は、Authenticationの対象ユーザーUUIDを使って次を実行します。

```sql
insert into drink_private.staff (user_id, label)
values ('対象スタッフのAuthユーザーUUID', 'CLT staff')
on conflict (user_id) do nothing;
```

4. Edge Functionの環境変数を設定します。

```text
DRINK_RELAY_STORE_ID=casinolivetokyo
DRINK_RELAY_ALLOWED_ORIGINS=https://toma-chat.github.io
```

`SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` はSupabaseがEdge Functionへ提供する値を利用します。Service RoleキーをHTML、JavaScript、Gitへ保存しないでください。

5. `supabase/functions/unlimited` を `verify_jwt = false` でデプロイします。公開操作はカード・現在のセッションをFunction内で検証し、スタッフ操作はJWTと許可リストの両方を検証します。
6. 更新したHTML、CSS、JavaScriptを公開します。
7. 遮断前に次を確認します。
   - 許可スタッフが管理画面へログインできる
   - 未許可アカウントでは管理画面を開けない
   - 既存の固定QRで4桁コードが表示される
   - 受付でアクティベートできる
   - 1杯注文、提供済み、次の1杯が動作する
   - 場所変更QRが動作する
8. 最後に `supabase/security-lockdown.sql` を実行します。
9. ログアウト状態のブラウザで管理URLを開き、ログイン画面以外が表示されないことを確認します。

## 適用後の確認

Supabaseの公開キーだけを使った次の直接アクセスは、権限エラーになる必要があります。

- `rest/v1/drink_orders`
- `rest/v1/drink_app_settings`

一方、許可スタッフのログイン後は受付・バー画面が従来どおり同期されます。飲み放題のお客様画面はテーブルへ直接接続せず、Edge Function経由で3秒ごとに状態を更新します。

## サーバー側で強制される項目

- QRカードが有効で、URLのプランと一致すること
- アクティベート済みの現在のカードセッションとリクエストのセッションIDが一致すること
- 利用期限内であること
- 届け先が許可されたエリア・卓・席であること
- 商品が選択プランの対象であること
- カスタム内容が商品とプランの許可範囲内であること
- 数量が1杯であること
- 未提供注文がある間は次の注文を受け付けないこと
- 注文名・料金状態・時刻・セッションIDをブラウザ値ではなくサーバーで決定すること

## 既存データ

固定QRカタログとセッションは現在の `drink_app_settings` 内の行をそのまま利用します。遮断後はService RoleのEdge Functionと許可スタッフだけが読み書きするため、QRの印刷し直しや既存注文の移行は不要です。


## 通常飲み放題のカード単位利用への更新（2026-10-19）

公開時は、先に `supabase/unlimited-card-sessions.sql`、次に `supabase/functions/unlimited`、最後にフロントエンドを適用してください。SQLはService Role専用RPCを追加し、既存データを変更しません。既存のスタッフ認証・RLSは維持してください。旧フロントエンドは更新後に再読み込みが必要です。

通常飲み放題はQRを知っているブラウザ・端末から現在の利用セッションを共有します。端末再接続コード・受付承認はありません。開始・終了時刻は再アクセスで変更しません。注文・届け先変更・利用終了・新セッション作成はDBロックと比較更新で競合を防ぎます。Warmupの共通コード・端末認証は対象外です。

検証は本番接続なしで実行できます。`@electric-sql/pglite` を隔離環境へインストールし、`PGLITE_MODULE` にパッケージの絶対パスを指定して `node tests/unlimited-card-sessions.cjs` を実行してください。画面検証は `node tests/unlimited-card-ui.cjs`（既存UIテストと同じ一時フォルダ内のjsdomを利用）です。PGliteは単一接続のため、複数リクエストの競合は検証しますが、独立したPostgreSQL接続間のロック待ちは検証しません。
