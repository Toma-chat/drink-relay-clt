# Drink Relay 店舗別独立版

系列店へ渡すための、1店舗ごとに独立して導入するパッケージです。

このパッケージには現在店舗のSupabase接続情報と注文履歴は含まれていません。ブラウザ内の保存領域と端末間同期チャンネルも `store-config.js` の店舗IDごとに分離されます。

## 同梱される初期データ

`initial-settings.js` に、作成時点の以下の設定だけを収録しています。

- ドリンク、フード、その他の商品メニュー
- 商品価格、選択オプション、作り方メモ
- よく使うオプションカテゴリ
- 通知音の割り当て

現在店舗の注文、未提供件数、会計状況、端末設定、Supabase URL・キーは収録していません。空のメニューから始める場合は `initial-settings.js` の各値を空配列・空オブジェクトに変更してください。

## 導入手順

1. 導入店舗専用の新しいSupabaseプロジェクトを作成します。
2. そのプロジェクトのSQL Editorで `supabase-schema.sql` を実行します。
3. `store-config.js` を編集します。
4. 導入店舗専用のURLへ、このフォルダ内のファイル一式を公開します。
5. 受付・バー・各端末で同じURLを開き、バー端末では開店時にベルの試聴ボタンを1回押します。

`store-config.js` の設定例:

```js
window.DRINK_RELAY_STORE_CONFIG = Object.freeze({
  instanceId: "shinjuku-store",
  storeName: "新宿店",
  supabaseUrl: "https://xxxxxxxx.supabase.co",
  supabaseAnonKey: "導入店舗専用のpublishableまたはanon key",
});
```

- `instanceId`: 店舗ごとに重複しない半角英数字・ハイフンのID
- `storeName`: ブラウザのタイトルに表示する店舗名
- `supabaseUrl`: 導入店舗専用SupabaseのProject URL
- `supabaseAnonKey`: 導入店舗専用Supabaseのpublishable keyまたはanon public key

現在店舗と同じSupabase URL・キーは絶対に設定しないでください。同じURLへ複数店舗を接続すると注文が混ざります。

## 独立確認チェック

- 店舗ごとに別のSupabaseプロジェクトを使っている
- 店舗ごとに異なる `instanceId` を設定している
- 店舗ごとに異なる公開URLまたはサブドメインを使っている
- 受付からテスト注文を送り、その店舗のバー端末だけに届く
- 別店舗の画面にテスト注文が出ない

## 公開先

有償提供する場合は、商用利用できるホスティングサービスまたは店舗管理サーバーを利用してください。Cloudflare Pages、Netlify、Vercelなどが候補です。GitHub Pagesは商用SaaSのホスティング用途には適しません。

## セキュリティ上の注意

同梱の `supabase-schema.sql` は導入を簡単にするため、URLと公開キーを持つ端末から広く読み書きできる構成です。店舗ごとにプロジェクトを分離することで店舗間の混在は防げますが、一般販売前にはスタッフ認証、店舗ID、端末権限、管理画面の保護、監査ログ、バックアップを追加してください。

`service_role` キーはブラウザに設定しないでください。ブラウザへ設定するのはpublishable keyまたはanon public keyだけです。

## 主なファイル

- `index.html`: アプリ画面
- `app.js`: 注文・受信・設定処理
- `styles.css`: 画面デザイン
- `store-config.js`: 店舗固有の接続設定
- `initial-settings.js`: 初回用メニュー・通知音・作り方設定
- `supabase-schema.sql`: 店舗専用データベースの作成SQL
- `DISTRIBUTION-NOTES.md`: 1店舗向け提供条件のひな形

Supabase未設定の間はローカルデモモードで動きますが、別端末への注文共有は行われません。
