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

  async function isAllowedStaff() {
    const { data, error } = await client.rpc("is_drink_staff");
    if (error) {
      const missing = error.code === "PGRST202" || /is_drink_staff/i.test(error.message || "");
      throw new Error(missing
        ? "セキュリティ更新がSupabaseへ未適用です。管理者へ連絡してください。"
        : "スタッフ権限を確認できませんでした。");
    }
    return data === true;
  }

  async function acceptSession(session) {
    if (!session?.user) return false;
    if (!await isAllowedStaff()) {
      await client.auth.signOut();
      throw new Error("このアカウントには店舗管理画面の利用権限がありません。");
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
        if (error) throw new Error("メールアドレスまたはパスワードを確認してください。");
        await acceptSession(data.session);
      } catch (error) {
        setStatus(error.message || "ログインできませんでした。", "error");
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
      setStatus(error.message || "ログイン状態を確認できませんでした。", "error");
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
