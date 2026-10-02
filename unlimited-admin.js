(function () {
  "use strict";

  const U = window.DrinkRelayUnlimited;
  if (!U) return;

  let gateway;
  let menu = [];
  let cards = [];
  let cardLookupSource = null;
  let cardLookupPromise = null;
  let refreshTimer = null;
  let editingSessionId = "";
  let locationPreview = { target: "bar", tableNo: "", seatNo: "" };
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
    $("#unlimitedLocationTarget")?.addEventListener("change", updateLocationPreviewFromFields);
    $("#unlimitedLocationTable")?.addEventListener("change", updateLocationPreviewFromFields);
    $("#unlimitedLocationSeat")?.addEventListener("change", updateLocationPreviewFromFields);
    $("#unlimitedCopyLocationUrl")?.addEventListener("click", copyLocationUrl);
    $("#unlimitedPrintLocationQr")?.addEventListener("click", printCurrentLocationQr);
    $("#unlimitedPrintAllLocations")?.addEventListener("click", printAllLocationQrs);
    $("#unlimitedSessionLocationDialog")?.addEventListener("click", handleSessionLocationChoice);
    $("#unlimitedSessionLocationClose")?.addEventListener("click", closeSessionLocationDialog);
    $("#unlimitedSessionLocationCancel")?.addEventListener("click", closeSessionLocationDialog);
    $("#unlimitedSessionLocationSave")?.addEventListener("click", saveSessionLocation);

    try {
      gateway = await new U.Gateway().init();
      menu = await gateway.loadMenu();
      cards = await gateway.loadCards();
      renderCardPlanOptions();
      renderCards();
      initializeLocationManager();
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

  function locationUrlFor(location) {
    const normalized = U.normalizeUnlimitedLocation(location);
    const url = new URL("./unlimited-location.html", window.location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("target", normalized.target);
    if (normalized.target !== "bar") {
      url.searchParams.set("table", normalized.tableNo);
      url.searchParams.set("seat", normalized.seatNo);
    }
    return url.href;
  }

  function initializeLocationManager() {
    const target = $("#unlimitedLocationTarget");
    const table = $("#unlimitedLocationTable");
    const seat = $("#unlimitedLocationSeat");
    if (!target || !table || !seat) return;
    target.innerHTML = [
      ["bar", "バーカウンター"],
      ["ring", "リング"],
      ["tournament", "トーナメント"],
    ].map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
    table.innerHTML = U.LOCATION_TABLES.map((value) => `<option value="${value}">${value}卓</option>`).join("");
    seat.innerHTML = U.LOCATION_SEATS.map((value) => `<option value="${value}">${value}番席</option>`).join("");
    updateLocationPreviewFromFields();
  }

  function updateLocationPreviewFromFields() {
    const target = $("#unlimitedLocationTarget")?.value || "bar";
    locationPreview = U.normalizeUnlimitedLocation({
      target,
      tableNo: $("#unlimitedLocationTable")?.value,
      seatNo: $("#unlimitedLocationSeat")?.value,
    });
    const isBar = target === "bar";
    $("#unlimitedLocationTableWrap").hidden = isBar;
    $("#unlimitedLocationSeatWrap").hidden = isBar;
    const url = locationUrlFor(locationPreview);
    $("#unlimitedLocationLabel").textContent = U.formatUnlimitedLocation(locationPreview);
    $("#unlimitedLocationUrl").textContent = url;
    $("#unlimitedOpenLocationUrl").href = url;
    renderQr($("#unlimitedLocationQr"), url, 144);
  }

  function renderQr(node, url, size = 144) {
    if (!node) return;
    node.replaceChildren();
    if (!window.QRCode) {
      node.textContent = "QRコードを読み込めません";
      return;
    }
    new window.QRCode(node, {
      text: url, width: size, height: size,
      colorDark: "#292524", colorLight: "#ffffff",
      correctLevel: window.QRCode.CorrectLevel.M,
    });
  }

  async function copyLocationUrl() {
    try {
      await copyText(locationUrlFor(locationPreview));
      setStatus("場所変更QRのURLをコピーしました", "success");
    } catch {
      setStatus("URLをコピーできませんでした", "error");
    }
  }

  function allLocations() {
    const seated = ["ring", "tournament"].flatMap((target) =>
      U.LOCATION_TABLES.flatMap((tableNo) =>
        U.LOCATION_SEATS.map((seatNo) => ({ target, tableNo, seatNo }))
      )
    );
    return [{ target: "bar", tableNo: "", seatNo: "" }, ...seated];
  }

  function prepareLocationPrint(locations) {
    const grid = $("#unlimitedLocationPrintGrid");
    grid.innerHTML = locations.map((location, index) => `
      <article class="unlimited-location-print-card">
        <div class="unlimited-location-print-qr" data-location-print-qr="${index}"></div>
        <strong>${escapeHtml(U.formatUnlimitedLocation(location))}</strong>
        <span>このQRで現在の届け先を変更</span>
      </article>`).join("");
    locations.forEach((location, index) => {
      renderQr($(`[data-location-print-qr="${index}"]`, grid), locationUrlFor(location), 150);
    });
  }

  function printCurrentLocationQr() {
    prepareLocationPrint([locationPreview]);
    printLocationSheet();
  }

  function printAllLocationQrs() {
    prepareLocationPrint(allLocations());
    printLocationSheet();
  }

  function printLocationSheet() {
    document.body.classList.add("print-unlimited-locations");
    window.addEventListener("afterprint", () => document.body.classList.remove("print-unlimited-locations"), { once: true });
    window.print();
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
      const matches = sessions.flatMap((session) => {
        if (session.status === "pending" && session.activationCode === code) {
          return [{ type: "activation", session, expiresAt: session.requestExpiresAt }];
        }
        if (session.status === "active" && session.reconnectRequest?.code === code) {
          return [{ type: "reconnect", session, expiresAt: session.reconnectRequest.expiresAt }];
        }
        return [];
      });
      const valid = matches.filter((match) => Date.parse(match.expiresAt) > now);
      if (!valid.length) throw new Error(matches.length ? "このコードは期限切れです" : "有効な4桁コードが見つかりません");
      if (valid.length > 1) throw new Error("同じコードが複数あります。お客様画面でコードを再発行してください");

      const { type, session } = valid[0];
      const plan = U.findPlan(menu, session.planId);
      if (!plan || !U.CONFIG.planRules?.[session.planId]) throw new Error("このカードのプラン設定が無効です");
      if (type === "reconnect") {
        if (Date.parse(session.expiresAt) <= now) throw new Error("このカードの利用時間は終了しています");
        const reconnected = await gateway.saveSession({
          ...session,
          deviceBinding: session.reconnectRequest.deviceBinding,
          reconnectRequest: null,
          reconnectedAt: new Date(now).toISOString(),
          activationRevision: U.makeId(),
        });
        input.value = "";
        setStatus(`${reconnected.planName || plan.name} をこの端末へ再接続しました`, "success");
        await renderSessions();
        return;
      }
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
        currentLocation: U.normalizeUnlimitedLocation(session.currentLocation),
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
    const action = button.dataset.unlimitedSessionAction;
    if (action === "location") {
      openSessionLocationDialog(button.dataset.sessionId);
      return;
    }
    if (action !== "revoke") return;
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

  async function openSessionLocationDialog(sessionId) {
    if (!gateway) return;
    try {
      const session = (await gateway.listSessions()).find((item) => item.sessionId === sessionId);
      if (!session || session.status !== "active") throw new Error("利用中のセッションが見つかりません");
      editingSessionId = sessionId;
      renderSessionLocationChoices(U.normalizeUnlimitedLocation(session.currentLocation));
      setSessionLocationStatus("");
      $("#unlimitedSessionLocationDialog").showModal();
    } catch (error) {
      setStatus(error.message || "届け先を確認できませんでした", "error");
    }
  }

  function closeSessionLocationDialog() {
    const dialog = $("#unlimitedSessionLocationDialog");
    if (dialog?.open && !$("#unlimitedSessionLocationSave").disabled) dialog.close();
    editingSessionId = "";
  }

  function renderSessionLocationChoices(location) {
    const normalized = U.normalizeUnlimitedLocation(location);
    const targets = [
      ["bar", "バーカウンター"],
      ["ring", "リング"],
      ["tournament", "トーナメント"],
    ];
    $("#unlimitedSessionTargetChoices").innerHTML = targets.map(([value, label]) => `
      <button type="button" class="unlimited-location-choice ${value === normalized.target ? "active" : ""}" data-session-location-choice="target" data-location-value="${value}">${label}</button>`).join("");
    $("#unlimitedSessionTableChoices").innerHTML = U.LOCATION_TABLES.map((value) => `
      <button type="button" class="unlimited-location-choice ${value === normalized.tableNo ? "active" : ""}" data-session-location-choice="tableNo" data-location-value="${value}">${value}卓</button>`).join("");
    $("#unlimitedSessionSeatChoices").innerHTML = U.LOCATION_SEATS.map((value) => `
      <button type="button" class="unlimited-location-choice ${value === normalized.seatNo ? "active" : ""}" data-session-location-choice="seatNo" data-location-value="${value}">${value}番</button>`).join("");
    $("#unlimitedSessionTableGroup").hidden = normalized.target === "bar";
    $("#unlimitedSessionSeatGroup").hidden = normalized.target === "bar";
  }

  function handleSessionLocationChoice(event) {
    const button = event.target.closest("[data-session-location-choice]");
    if (!button || $("#unlimitedSessionLocationSave").disabled) return;
    $$(`[data-session-location-choice="${button.dataset.sessionLocationChoice}"]`, $("#unlimitedSessionLocationDialog"))
      .forEach((choice) => choice.classList.toggle("active", choice === button));
    if (button.dataset.sessionLocationChoice === "target") {
      const isBar = button.dataset.locationValue === "bar";
      $("#unlimitedSessionTableGroup").hidden = isBar;
      $("#unlimitedSessionSeatGroup").hidden = isBar;
    }
    setSessionLocationStatus("");
  }

  function selectedSessionLocation() {
    const dialog = $("#unlimitedSessionLocationDialog");
    const value = (type) => $(`[data-session-location-choice="${type}"].active`, dialog)?.dataset.locationValue || "";
    return U.normalizeUnlimitedLocation({ target: value("target"), tableNo: value("tableNo"), seatNo: value("seatNo") });
  }

  async function saveSessionLocation() {
    if (!editingSessionId || !gateway) return;
    const location = selectedSessionLocation();
    if (!U.unlimitedLocationIsComplete(location)) {
      setSessionLocationStatus("テーブルと席番号を選択してください", "error");
      return;
    }
    const button = $("#unlimitedSessionLocationSave");
    button.disabled = true;
    setSessionLocationStatus("届け先を更新しています...", "loading");
    try {
      const session = (await gateway.listSessions()).find((item) => item.sessionId === editingSessionId);
      const now = gateway.now();
      if (!session || session.status !== "active" || Date.parse(session.expiresAt) <= now) throw new Error("利用時間が終了しています");
      const result = await gateway.updateSessionLocation(session, location, "staff");
      $("#unlimitedSessionLocationDialog").close();
      editingSessionId = "";
      setStatus(
        result.pendingOrder ? "届け先と未提供注文の届け先を変更しました" : "現在の届け先を変更しました",
        "success"
      );
      await renderSessions();
    } catch (error) {
      setSessionLocationStatus(error.message || "届け先を変更できませんでした", "error");
    } finally {
      button.disabled = false;
    }
  }

  function setSessionLocationStatus(message, state = "") {
    const node = $("#unlimitedSessionLocationStatus");
    node.textContent = message;
    if (state) node.dataset.state = state;
    else delete node.dataset.state;
  }

  async function renderSessions() {
    if (!gateway) return;
    try {
      const now = gateway.now();
      const cardByHash = await buildCardLookup();
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
        const card = cardByHash.get(session.cardHash);
        const cardNumber = formatCardNumber(card);
        const pending = session.status === "pending";
        const reconnect = !pending && session.reconnectRequest?.code && Date.parse(session.reconnectRequest.expiresAt) > now
          ? session.reconnectRequest
          : null;
        const limit = pending ? session.requestExpiresAt : session.expiresAt;
        const location = U.formatUnlimitedLocation(session.currentLocation);
        return `
          <article class="unlimited-session-card ${pending ? "is-pending" : "is-active"} ${reconnect ? "has-reconnect" : ""}">
            <div>
              <div class="unlimited-session-heading">
                <span class="unlimited-session-state">${pending ? `待機中 · ${escapeHtml(session.activationCode)}` : reconnect ? `再接続待ち · ${escapeHtml(reconnect.code)}` : "利用中"}</span>
                <span class="unlimited-session-card-number">${escapeHtml(cardNumber)}</span>
              </div>
              <strong>${escapeHtml(name)}</strong>
              <small>${reconnect ? `再接続コード期限 ${escapeHtml(U.formatRemaining(Date.parse(reconnect.expiresAt) - now))} · ` : ""}${pending ? "コード期限" : "残り"} ${escapeHtml(U.formatRemaining(Date.parse(limit) - now))}</small>
              ${pending ? "" : `<span class="unlimited-session-location">届け先: ${escapeHtml(location)}</span>`}
            </div>
            ${pending ? "" : `<div class="unlimited-session-actions">
              <button type="button" class="button unlimited-location-button" data-unlimited-session-action="location" data-session-id="${escapeHtml(session.sessionId)}">届け先変更</button>
              <button type="button" class="button unlimited-revoke-button" data-unlimited-session-action="revoke" data-session-id="${escapeHtml(session.sessionId)}">利用停止</button>
            </div>`}
          </article>`;
      }).join("");
    } catch (error) {
      renderEmpty(error.message || "カード情報を読み込めません");
    }
  }

  async function buildCardLookup() {
    if (cardLookupSource !== cards || !cardLookupPromise) {
      cardLookupSource = cards;
      cardLookupPromise = Promise.all(cards.map(async (card) => [
        await U.digest(`${U.STORE_ID}:${card.token}`),
        card,
      ])).then((entries) => new Map(entries));
    }
    return cardLookupPromise;
  }

  function formatCardNumber(card) {
    if (!card) return "カード番号不明";
    const label = String(card.label || "").trim();
    const match = label.match(/(?:no\.?|番号?|番)\s*(\d+)/i) || label.match(/(\d+)\s*番/i);
    return match ? `カード No.${match[1]}` : `カード ${label || "番号不明"}`;
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
