(function () {
  "use strict";

  const config = window.DRINK_RELAY_STORE_CONFIG || {};
  let client = null;
  let resolveReady;
  let ready = false;
  const readyPromise = new Promise((resolve) => { resolveReady = resolve; });

  const $ = (selector, root = document) => root.querySelector(selector);

  function setStatus(message, state = "") {
    const node = $("#staffAuthStatus");
    if (!node) return;
    node.textContent = message;
    if (state) node.dataset.state = state;
    else delete node.dataset.state;
  }

  function revealApplication(user) {
    if (ready) return;
    ready = true;
    $("#staffAuthGate")?.setAttribute("hidden", "");
    $("#staffApplication")?.removeAttribute("hidden");
    const account = $("#staffAccountLabel");
    if (account) account.textContent = user?.email || "スタッフ";
    resolveReady(true);
  }

  function publicError(message) {
    const error = new Error(message);
    error.userMessage = message;
    return error;
  }

  function loginErrorMessage(error, fallback = "ログインできませんでした。時間をおいて再試行し、続く場合は管理者へ連絡してください。") {
    if (error?.userMessage) return error.userMessage;
    const status = Number(error?.status || error?.originalError?.status || 0);
    const code = String(error?.code || "");
    const message = String(error?.message || "");
    if (status === 402 || /exceed_.*quota|project.*restricted|payment required/i.test(message)) {
      return "認証サービスが利用枠・課金設定の制限により停止しています。管理者がSupabaseの利用量・契約状況を確認してください。";
    }
    if (status === 429 || /rate_limit/.test(code)) return "ログインの試行回数が制限されています。少し時間をおいてから再試行してください。";
    if (status >= 500) return "認証サーバーで障害が発生しています。時間をおいて再試行してください。";
    if (code === "invalid_credentials" || /^invalid login credentials$/i.test(message)) return "メールアドレスまたはパスワードを確認してください。";
    if (code === "email_not_confirmed") return "メールアドレスの確認が完了していません。確認メールのリンクを開いてからログインしてください。";
    if (code === "user_banned") return "このアカウントは利用停止中です。管理者へ連絡してください。";
    if (["session_not_found", "session_expired", "refresh_token_not_found", "refresh_token_already_used", "bad_jwt"].includes(code)) return "ログインの有効期限が切れています。もう一度ログインしてください。";
    if (error?.name === "AbortError" || /timeout|timed out/i.test(message)) return "認証サーバーの応答が時間内に届きませんでした。通信状態を確認して再試行してください。";
    if (navigator.onLine === false || ["TypeError", "AuthRetryableFetchError"].includes(error?.name) || /failed to fetch|fetch failed|load failed|network/i.test(message)) return "認証サーバーと通信できません。インターネット接続を確認して再試行してください。";
    return fallback;
  }

  async function isAllowedStaff() {
    const { data, error } = await client.rpc("is_drink_staff");
    if (error) {
      const missing = error.code === "PGRST202" || error.code === "42883";
      throw publicError(missing
        ? "セキュリティ更新がSupabaseへ未適用です。管理者へ連絡してください。"
        : loginErrorMessage(error, "スタッフ権限を確認できませんでした。管理者へ連絡してください。"));
    }
    return data === true;
  }

  async function acceptSession(session) {
    if (!session?.user) return false;
    if (!await isAllowedStaff()) {
      await client.auth.signOut();
      throw publicError("このアカウントには店舗管理画面の利用権限がありません。");
    }
    revealApplication(session.user);
    return true;
  }

  async function initialize() {
    const form = $("#staffLoginForm");
    const button = $("#staffLoginButton");
    const logout = $("#staffLogoutButton");

    if (!window.supabase || !config.supabaseUrl || !config.supabaseAnonKey) {
      setStatus("Supabase接続設定を確認できないため、管理画面を開けません。", "error");
      return;
    }

    client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    window.DrinkRelayStaffAuth.client = client;
    client.auth.onAuthStateChange((event, session) => {
      if (ready && (event === "SIGNED_OUT" || !session)) location.reload();
    });

    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (button?.disabled) return;
      if (button) button.disabled = true;
      setStatus("ログインを確認しています…", "loading");
      try {
        const values = new FormData(form);
        const { data, error } = await client.auth.signInWithPassword({
          email: String(values.get("email") || "").trim(),
          password: String(values.get("password") || ""),
        });
        if (error) throw error;
        if (!await acceptSession(data?.session)) throw publicError("ログイン情報を取得できませんでした。もう一度ログインしてください。");
      } catch (error) {
        setStatus(loginErrorMessage(error), "error");
      } finally {
        if (button && !ready) button.disabled = false;
      }
    });

    logout?.addEventListener("click", async () => {
      logout.disabled = true;
      try {
        await client.auth.signOut();
      } finally {
        location.reload();
      }
    });

    try {
      setStatus("ログイン状態を確認しています…", "loading");
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      if (data.session) {
        await acceptSession(data.session);
      } else {
        setStatus("スタッフアカウントでログインしてください。");
      }
    } catch (error) {
      setStatus(loginErrorMessage(error, "ログイン状態を確認できませんでした。再試行し、続く場合は管理者へ連絡してください。"), "error");
    }
  }

  window.DrinkRelayStaffAuth = {
    client,
    requireStaff() {
      return readyPromise;
    },
    async accessToken() {
      if (!client) return "";
      const { data } = await client.auth.getSession();
      return data.session?.access_token || "";
    },
  };

  document.addEventListener("DOMContentLoaded", initialize);
})();
