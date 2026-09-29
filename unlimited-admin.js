(function () {
  "use strict";

  const U = window.DrinkRelayUnlimited;
  if (!U) return;

  let gateway;
  let menu = [];
  let cards = [];
  let refreshTimer = null;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    const form = $("#unlimitedActivationForm");
    if (!form) return;
    const input = $("#unlimitedActivationCode");
    input.addEventListener("input", () => {
      input.value = input.value.replace(/\D/g, "").slice(0, 4);
    });
    form.addEventListener("submit", activateByCode);
    $("#unlimitedSessionList")?.addEventListener("click", handleSessionAction);
    $("#unlimitedCardForm")?.addEventListener("submit", createFixedCard);
    $("#unlimitedCardList")?.addEventListener("click", handleCardAction);

    try {
      gateway = await new U.Gateway().init();
      menu = await gateway.loadMenu();
      cards = await gateway.loadCards();
      renderCardPlanOptions();
      renderCards();
      updateCardOriginNote();
      gateway.onChange(() => {
        scheduleRefresh();
        scheduleCardRefresh();
      });
      await renderSessions();
      refreshTimer = window.setInterval(renderSessions, 10000);
      window.addEventListener("pagehide", () => window.clearInterval(refreshTimer), { once: true });
    } catch (error) {
      setStatus(error.message || "飲み放題カードの状態を読み込めません", "error");
      renderEmpty("通信エラー。接続を確認してください。");
    }
  }

  function scheduleRefresh() {
    window.clearTimeout(scheduleRefresh.timer);
    scheduleRefresh.timer = window.setTimeout(renderSessions, 250);
  }

  function scheduleCardRefresh() {
    window.clearTimeout(scheduleCardRefresh.timer);
    scheduleCardRefresh.timer = window.setTimeout(async () => {
      try {
        cards = await gateway.loadCards();
        renderCards();
      } catch {
      }
    }, 300);
  }

  function renderCardPlanOptions() {
    const select = $("#unlimitedCardPlan");
    if (!select) return;
    const plans = menu.find((category) => category?.id === "all-you-can-drink")?.items || [];
    select.innerHTML = plans
      .filter((plan) => U.CONFIG.planRules?.[plan.id])
      .map((plan) => `<option value="${escapeHtml(plan.id)}">${escapeHtml(plan.name)}</option>`)
      .join("");
  }

  function updateCardOriginNote() {
    const node = $("#unlimitedCardOriginNote");
    if (!node) return;
    const isLocal = ["127.0.0.1", "localhost"].includes(location.hostname);
    node.textContent = isLocal
      ? "現在はローカルURLです。公開環境で受付画面を開くと、その公開ドメインのURLになります。"
      : `発行先: ${location.origin}`;
    node.classList.toggle("is-warning", isLocal);
  }

  async function createFixedCard(event) {
    event.preventDefault();
    if (!gateway) return;
    const planId = $("#unlimitedCardPlan").value;
    const labelInput = $("#unlimitedCardLabel");
    const label = labelInput.value.trim();
    const plan = U.findPlan(menu, planId);
    if (!plan || !label) return;
    const button = $("#unlimitedCreateCard");
    button.disabled = true;
    try {
      cards = await gateway.saveCards([
        ...cards,
        {
          id: U.makeId(),
          label,
          planId,
          token: U.makeCardToken(),
          createdAt: new Date(gateway.now()).toISOString(),
        },
      ]);
      labelInput.value = "";
      renderCards();
      setStatus(`${label} の固定QRカードを発行しました`, "success");
    } catch (error) {
      setStatus(error.message || "固定QRカードを発行できませんでした", "error");
    } finally {
      button.disabled = false;
    }
  }

  function fixedCardUrl(card) {
    const url = new URL("./unlimited-customer.html", location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("card", card.token);
    url.searchParams.set("plan", card.planId);
    return url.href;
  }

  function renderCards() {
    const list = $("#unlimitedCardList");
    if (!list) return;
    if (!cards.length) {
      list.innerHTML = '<p class="unlimited-session-empty">発行済みの固定QRカードはありません</p>';
      return;
    }
    list.innerHTML = cards.map((card) => {
      const plan = U.findPlan(menu, card.planId);
      const url = fixedCardUrl(card);
      return `
        <article class="unlimited-fixed-card">
          <div class="unlimited-card-qr" data-card-qr="${escapeHtml(card.id)}" aria-label="${escapeHtml(card.label)}のQRコード"></div>
          <div class="unlimited-card-info">
            <span>${escapeHtml(plan?.name || card.planId)}</span>
            <strong>${escapeHtml(card.label)}</strong>
            <code>${escapeHtml(url)}</code>
            <div class="unlimited-card-actions">
              <button class="button button-quiet" type="button" data-card-action="copy" data-card-url="${escapeHtml(url)}">URLをコピー</button>
              <a class="button button-quiet" href="${escapeHtml(url)}" target="_blank" rel="noopener">画面を開く</a>
            </div>
          </div>
        </article>`;
    }).join("");

    if (!window.QRCode) {
      $$("[data-card-qr]", list).forEach((node) => { node.textContent = "QR読込待ち"; });
      return;
    }
    cards.forEach((card) => {
      const node = $(`[data-card-qr="${cssEscape(card.id)}"]`, list);
      if (!node) return;
      new window.QRCode(node, {
        text: fixedCardUrl(card), width: 144, height: 144,
        colorDark: "#292524", colorLight: "#ffffff",
        correctLevel: window.QRCode.CorrectLevel.M,
      });
    });
  }

  async function handleCardAction(event) {
    const button = event.target.closest('[data-card-action="copy"]');
    if (!button) return;
    try {
      await copyText(button.dataset.cardUrl);
      setStatus("固定QRカードのURLをコピーしました", "success");
    } catch {
      setStatus("URLをコピーできませんでした。表示されたURLを選択してください", "error");
    }
  }

  async function copyText(value) {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
    const input = document.createElement("textarea");
    input.value = value;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.append(input);
    input.select();
    const copied = document.execCommand("copy");
    input.remove();
    if (!copied) throw new Error("copy failed");
  }

  async function activateByCode(event) {
    event.preventDefault();
    if (!gateway) return;
    const input = $("#unlimitedActivationCode");
    const button = $("#unlimitedActivateButton");
    const code = input.value.trim();
    if (!/^\d{4}$/.test(code)) {
      setStatus("4桁の数字を入力してください", "error");
      input.focus();
      return;
    }

    button.disabled = true;
    setStatus("コードを確認中...", "loading");
    try {
      const sessions = await gateway.listSessions();
      const now = gateway.now();
      const matches = sessions.filter((session) => session.status === "pending" && session.activationCode === code);
      const valid = matches.filter((session) => Date.parse(session.requestExpiresAt) > now);
      if (!valid.length) throw new Error(matches.length ? "このコードは期限切れです" : "有効な待機中コードが見つかりません");
      if (valid.length > 1) throw new Error("同じコードが複数あります。お客様画面でコードを再発行してください");

      const session = valid[0];
      const plan = U.findPlan(menu, session.planId);
      if (!plan || !U.CONFIG.planRules?.[session.planId]) throw new Error("このカードのプラン設定が無効です");
      const startedAt = now;
      const expiresAt = U.calculateExpiry(startedAt, session.planId);
      if (expiresAt <= startedAt) throw new Error("終日プランの受付は22:30で終了しています");
      const active = await gateway.saveSession({
        ...session,
        status: "active",
        planName: plan.name,
        startedAt: new Date(startedAt).toISOString(),
        expiresAt: new Date(expiresAt).toISOString(),
        activatedAt: new Date(startedAt).toISOString(),
        activationRevision: U.makeId(),
      });
      input.value = "";
      setStatus(`${active.planName} をアクティベートしました`, "success");
      await renderSessions();
    } catch (error) {
      setStatus(error.message || "アクティベートできませんでした", "error");
    } finally {
      button.disabled = false;
    }
  }

  async function handleSessionAction(event) {
    const button = event.target.closest("[data-unlimited-session-action]");
    if (!button || !gateway) return;
    button.disabled = true;
    try {
      const sessions = await gateway.listSessions();
      const session = sessions.find((item) => item.sessionId === button.dataset.sessionId);
      if (!session) throw new Error("カード情報が見つかりません");
      await gateway.saveSession({ ...session, status: "revoked", revokedAt: new Date(gateway.now()).toISOString() });
      setStatus(`${session.planName || "飲み放題"} の利用を停止しました`, "success");
      await renderSessions();
    } catch (error) {
      setStatus(error.message || "利用を停止できませんでした", "error");
      button.disabled = false;
    }
  }

  async function renderSessions() {
    if (!gateway) return;
    try {
      const now = gateway.now();
      const sessions = (await gateway.listSessions())
        .filter((session) => {
          if (session.status === "pending") return Date.parse(session.requestExpiresAt) > now;
          if (session.status === "active") return Date.parse(session.expiresAt) > now;
          return false;
        })
        .sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0));
      if (!sessions.length) {
        renderEmpty("待機中・利用中のカードはありません");
        return;
      }
      $("#unlimitedSessionList").innerHTML = sessions.map((session) => {
        const plan = U.findPlan(menu, session.planId);
        const name = session.planName || plan?.name || session.planId;
        const pending = session.status === "pending";
        const limit = pending ? session.requestExpiresAt : session.expiresAt;
        return `
          <article class="unlimited-session-card ${pending ? "is-pending" : "is-active"}">
            <div>
              <span class="unlimited-session-state">${pending ? `待機中 · ${escapeHtml(session.activationCode)}` : "利用中"}</span>
              <strong>${escapeHtml(name)}</strong>
              <small>${pending ? "コード期限" : "残り"} ${escapeHtml(U.formatRemaining(Date.parse(limit) - now))}</small>
            </div>
            ${pending ? "" : `<button type="button" class="button button-quiet" data-unlimited-session-action="revoke" data-session-id="${escapeHtml(session.sessionId)}">利用停止</button>`}
          </article>`;
      }).join("");
    } catch (error) {
      renderEmpty(error.message || "カード情報を読み込めません");
    }
  }

  function renderEmpty(message) {
    const list = $("#unlimitedSessionList");
    if (list) list.innerHTML = `<p class="unlimited-session-empty">${escapeHtml(message)}</p>`;
  }

  function setStatus(message, state) {
    const node = $("#unlimitedActivationStatus");
    if (!node) return;
    node.textContent = message;
    node.dataset.state = state || "";
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
    })[character]);
  }

  function cssEscape(value) {
    return window.CSS?.escape ? window.CSS.escape(value) : String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }
})();
