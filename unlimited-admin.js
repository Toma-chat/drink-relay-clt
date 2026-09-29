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
    $("#unlimitedCreateAllCards")?.addEventListener("click", createAllFixedCards);
    $("#unlimitedPrintCards")?.addEventListener("click", printFixedCards);
    $("#unlimitedPrintUrls")?.addEventListener("click", printFixedCardUrls);
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
    const quantity = normalizeCardQuantity($("#unlimitedCardQuantity").value);
    const plan = U.findPlan(menu, planId);
    if (!plan) return;
    const baseLabel = labelInput.value.trim() || plan.name;
    const button = $("#unlimitedCreateCard");
    button.disabled = true;
    try {
      cards = await appendCards([{ planId, planName: plan.name, baseLabel }], quantity);
      labelInput.value = "";
      renderCards();
      setStatus(`${plan.name} の固定QRカードを${quantity}枚発行しました`, "success");
    } catch (error) {
      setStatus(error.message || "固定QRカードを発行できませんでした", "error");
    } finally {
      button.disabled = false;
    }
  }

  async function createAllFixedCards() {
    if (!gateway) return;
    const button = $("#unlimitedCreateAllCards");
    const targetQuantity = 20;
    const plans = (menu.find((category) => category?.id === "all-you-can-drink")?.items || [])
      .filter((plan) => U.CONFIG.planRules?.[plan.id])
      .map((plan) => ({ planId: plan.id, planName: plan.name, baseLabel: plan.name }));
    if (!plans.length) return;
    button.disabled = true;
    try {
      const result = await ensureCardsPerPlan(plans, targetQuantity);
      cards = result.cards;
      renderCards();
      setStatus(
        result.addedCount
          ? `既存QRを維持し、不足分${result.addedCount}枚を追加しました（各${targetQuantity}枚）`
          : `全${plans.length}プランとも固定QRカードは各${targetQuantity}枚用意済みです`,
        "success"
      );
    } catch (error) {
      setStatus(error.message || "固定QRカードを一括発行できませんでした", "error");
    } finally {
      button.disabled = false;
    }
  }

  async function ensureCardsPerPlan(planInputs, targetQuantity) {
    const loaded = await gateway.loadCards();
    const current = loaded.map((card) => ({ ...card, url: card.url || customerUrlFor(card.token, card.planId), immutable: true }));
    const migratedExistingCards = current.some((card, index) => card.url !== loaded[index]?.url || loaded[index]?.immutable !== true);
    const createdAt = new Date(gateway.now()).toISOString();
    const additions = planInputs.flatMap(({ planId, planName, baseLabel }) => {
      const existingCount = current.filter((card) => card.planId === planId).length;
      const missingCount = Math.max(0, targetQuantity - existingCount);
      return Array.from({ length: missingCount }, (_, index) =>
        createCardRecord(`${baseLabel || planName} ${existingCount + index + 1}番`, planId, createdAt)
      );
    });
    if (!additions.length && !migratedExistingCards) return { cards: current, addedCount: 0 };
    const saved = await gateway.saveCards([...current, ...additions]);
    return { cards: saved, addedCount: additions.length };
  }

  async function appendCards(planInputs, quantity) {
    const loaded = await gateway.loadCards();
    const current = loaded.map((card) => ({ ...card, url: card.url || customerUrlFor(card.token, card.planId), immutable: true }));
    const createdAt = new Date(gateway.now()).toISOString();
    const additions = planInputs.flatMap(({ planId, planName, baseLabel }) => {
      const existingCount = current.filter((card) => card.planId === planId).length;
      return Array.from({ length: quantity }, (_, index) =>
        createCardRecord(`${baseLabel || planName} ${existingCount + index + 1}番`, planId, createdAt)
      );
    });
    return gateway.saveCards([...current, ...additions]);
  }

  function createCardRecord(label, planId, createdAt) {
    const token = U.makeCardToken();
    return {
      id: U.makeId(),
      label,
      planId,
      token,
      url: customerUrlFor(token, planId),
      createdAt,
      immutable: true,
    };
  }

  function normalizeCardQuantity(value) {
    return Math.max(1, Math.min(20, Number.parseInt(value, 10) || 20));
  }

  function printFixedCards() {
    const details = $(".unlimited-card-manager");
    if (!cards.length) {
      setStatus("印刷する固定QRカードがありません", "error");
      return;
    }
    if (details) details.open = true;
    window.print();
  }

  function printFixedCardUrls() {
    if (!cards.length) {
      setStatus("印刷する固定QRカードがありません", "error");
      return;
    }
    const sorted = sortCardsForOutput(cards);
    const rows = $("#unlimitedUrlPrintRows");
    const summary = $("#unlimitedUrlPrintSummary");
    rows.innerHTML = sorted.map((card, index) => {
      const plan = U.findPlan(menu, card.planId);
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(plan?.name || card.planId)}</td>
          <td>${escapeHtml(card.label)}</td>
          <td class="unlimited-print-url">${escapeHtml(fixedCardUrl(card))}</td>
        </tr>`;
    }).join("");
    summary.textContent = `${sorted.length}枚 · ${location.origin}`;
    document.body.classList.add("print-unlimited-urls");
    window.addEventListener("afterprint", () => document.body.classList.remove("print-unlimited-urls"), { once: true });
    window.print();
  }

  function sortCardsForOutput(values) {
    const planOrder = new Map(
      (menu.find((category) => category?.id === "all-you-can-drink")?.items || [])
        .map((plan, index) => [plan.id, index])
    );
    return [...values].sort((a, b) => {
      const planDifference = (planOrder.get(a.planId) ?? 999) - (planOrder.get(b.planId) ?? 999);
      if (planDifference) return planDifference;
      return String(a.label).localeCompare(String(b.label), "ja", { numeric: true });
    });
  }

  function fixedCardUrl(card) {
    return card.url || customerUrlFor(card.token, card.planId);
  }

  function customerUrlFor(token, planId) {
    const url = new URL("./unlimited-customer.html", location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("card", token);
    url.searchParams.set("plan", planId);
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
            ${pending ? "" : `<button type="button" class="button unlimited-revoke-button" data-unlimited-session-action="revoke" data-session-id="${escapeHtml(session.sessionId)}">利用停止</button>`}
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
