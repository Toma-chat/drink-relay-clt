(function () {
  "use strict";

  const U = window.DrinkRelayUnlimited;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const state = {
    gateway: null, menu: [], plan: null, rule: null, session: null,
    cardHash: "", deviceBinding: "", cart: [], activeItem: null,
    quantity: 1, submitting: false, pollTimer: null, clockTimer: null, toastTimer: null,
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    wireControls();
    if (!U) {
      showError("画面を読み込めませんでした", "再読み込みしても直らない場合は受付スタッフへお声がけください。", true);
      return;
    }
    try {
      const params = new URLSearchParams(location.search);
      const cardToken = String(params.get("card") || "").trim();
      const planId = String(params.get("plan") || "").trim();
      if (cardToken.length < 8 || !U.CONFIG.planRules?.[planId]) {
        showError("無効なQRコードです", "受付スタッフへカードをご提示ください。");
        return;
      }

      state.gateway = await new U.Gateway().init();
      state.menu = await state.gateway.loadMenu();
      state.plan = U.findPlan(state.menu, planId);
      state.rule = U.CONFIG.planRules[planId];
      if (!state.plan) {
        showError("プラン設定が見つかりません", "このQRカードは現在利用できません。受付スタッフへお声がけください。");
        return;
      }

      state.cardHash = await U.digest(`${U.STORE_ID}:${cardToken}`);
      state.deviceBinding = await U.digest(getDeviceId());
      state.gateway.onChange(() => scheduleSessionCheck());
      await checkSession(true);
      state.pollTimer = window.setInterval(() => checkSession(false), 3000);
      window.addEventListener("pagehide", cleanup, { once: true });
    } catch (error) {
      console.error(error);
      showError("通信エラーが発生しました", error.message || "通信状態を確認してもう一度お試しください。", true);
    }
  }

  function wireControls() {
    $("#retryActivation")?.addEventListener("click", retryActivation);
    $("#retryMenu")?.addEventListener("click", reloadMenu);
    $("#categoryNav")?.addEventListener("click", handleCategoryClick);
    $("#menuSections")?.addEventListener("click", handleMenuClick);
    window.addEventListener("scroll", scheduleActiveCategory, { passive: true });
    $("#itemMinus")?.addEventListener("click", () => changeItemQuantity(-1));
    $("#itemPlus")?.addEventListener("click", () => changeItemQuantity(1));
    $("#addToCart")?.addEventListener("click", addItemToCart);
    $("#openCart")?.addEventListener("click", openCart);
    $("#closeCart")?.addEventListener("click", () => $("#cartDialog")?.close());
    $("#cartItems")?.addEventListener("click", handleCartAction);
    $("#submitOrder")?.addEventListener("click", submitOrder);
    $$('input[name="customerTarget"]').forEach((input) => input.addEventListener("change", updateLocationFields));
  }

  function getDeviceId() {
    const key = `drink-relay-${U.STORE_ID}-unlimited-device-v1`;
    let id = localStorage.getItem(key);
    if (!id) {
      id = U.makeId();
      localStorage.setItem(key, id);
    }
    return id;
  }

  function scheduleSessionCheck() {
    window.clearTimeout(scheduleSessionCheck.timer);
    scheduleSessionCheck.timer = window.setTimeout(() => checkSession(false), 200);
  }

  async function checkSession(createIfMissing) {
    if (!state.gateway || !state.cardHash) return;
    try {
      let session = await state.gateway.getSession(state.cardHash);
      if (!session && createIfMissing) session = await createActivationRequest();
      if (!session) return;
      state.session = session;
      const now = state.gateway.now();
      const sameDevice = session.deviceBinding === state.deviceBinding;

      if (session.planId !== state.plan.id) {
        showError("カードのプランが一致しません", "受付スタッフへカードをご提示ください。");
        return;
      }
      if (session.status === "pending") {
        if (Date.parse(session.requestExpiresAt) <= now) {
          if (createIfMissing) {
            const renewed = await createActivationRequest();
            state.session = renewed;
            showActivation(renewed);
            return;
          }
          showError("アクティベーションコードの期限が切れました", "新しい4桁コードを発行して、受付スタッフへお伝えください。", true);
          return;
        }
        if (!sameDevice) {
          showError("このQRカードは別の端末で使用中です", "同時に利用できる端末は1台です。受付スタッフへお声がけください。");
          return;
        }
        showActivation(session);
        return;
      }
      if (session.status === "active") {
        if (Date.parse(session.expiresAt) <= now) {
          if (!sameDevice && createIfMissing) {
            const renewed = await createActivationRequest();
            state.session = renewed;
            showActivation(renewed);
            return;
          }
          showEnded();
          return;
        }
        if (!sameDevice) {
          showError("このQRカードは使用済みです", "同時に利用できる端末は1台です。受付スタッフへお声がけください。");
          return;
        }
        showOrder(session);
        return;
      }
      if (session.status === "revoked") {
        if (createIfMissing) {
          const renewed = await createActivationRequest();
          state.session = renewed;
          showActivation(renewed);
          return;
        }
        showError("このQRカードは無効です", "利用が停止されています。受付スタッフへカードをご提示ください。");
        return;
      }
      showError("このQRカードは利用できません", "受付スタッフへカードをご提示ください。");
    } catch (error) {
      console.error(error);
      if (!$("#orderState").hidden) return;
      showError("通信状態を確認できません", "注文画面を開くには通信が必要です。接続を確認してください。", true);
    }
  }

  async function createActivationRequest() {
    const now = state.gateway.now();
    const minutes = Number(U.CONFIG.activationRequestMinutes || 15);
    return state.gateway.saveSession({
      sessionId: U.makeId(),
      cardHash: state.cardHash,
      deviceBinding: state.deviceBinding,
      planId: state.plan.id,
      planName: state.plan.name,
      status: "pending",
      activationCode: U.makeActivationCode(),
      requestedAt: new Date(now).toISOString(),
      requestExpiresAt: new Date(now + minutes * 60000).toISOString(),
      protocolVersion: 1,
    });
  }

  async function retryActivation() {
    showOnly("loadingState");
    try {
      const current = await state.gateway.getSession(state.cardHash);
      if (current?.status === "active") {
        await checkSession(false);
        return;
      }
      state.session = await createActivationRequest();
      showActivation(state.session);
    } catch (error) {
      showError("再確認できませんでした", error.message || "通信状態を確認してください。", true);
    }
  }

  function showActivation(session) {
    closeDialogs();
    showOnly("activationState");
    $("#activationCode").textContent = session.activationCode;
    $("#activationPlanName").textContent = state.plan.name;
  }

  function showOrder(session) {
    showOnly("orderState");
    $("#activePlanName").textContent = state.plan.name;
    if (!state.clockTimer) state.clockTimer = window.setInterval(updateClock, 1000);
    updateClock();
    if (!$("#menuSections").children.length) renderMenu();
  }

  function showEnded() {
    closeDialogs();
    state.cart = [];
    renderCartBadge();
    showOnly("endedState");
    window.clearInterval(state.clockTimer);
    state.clockTimer = null;
  }

  function showError(title, message, retryable = false) {
    closeDialogs();
    showOnly("errorState");
    $("#errorTitle").textContent = title;
    $("#errorMessage").textContent = message;
    $("#retryActivation").hidden = !retryable;
  }

  function showOnly(id) {
    $$(".customer-state").forEach((section) => { section.hidden = section.id !== id; });
  }

  function updateClock() {
    if (!state.session?.expiresAt || !state.gateway) return;
    const remaining = Date.parse(state.session.expiresAt) - state.gateway.now();
    if (remaining <= 0) {
      showEnded();
      return;
    }
    const node = $("#remainingTime");
    $("strong", node).textContent = U.formatRemaining(remaining);
    node.classList.toggle("is-warning", remaining <= 10 * 60000);
  }

  function eligibleCategories() {
    const allowed = new Set(state.rule.categories || []);
    const include = new Set(state.rule.includeItemIds || []);
    const exclude = new Set(state.rule.excludeItemIds || []);
    return U.normalizeMenu(state.menu).map((category) => ({
      ...category,
      items: (category.items || [])
        .filter((item) => !exclude.has(item.id) && (allowed.has(category.id) || include.has(item.id)))
        .map(applyPlanOptionRules),
    })).filter((category) => category.items.length);
  }

  function applyPlanOptionRules(item) {
    const itemRules = state.rule.optionChoiceRules?.[item.id];
    if (!itemRules || typeof itemRules !== "object") return item;

    const optionGroups = (item.optionGroups || []).flatMap((group) => {
      if (!Object.prototype.hasOwnProperty.call(itemRules, group.id)) return [group];
      const allowedChoices = new Set(Array.isArray(itemRules[group.id]) ? itemRules[group.id] : []);
      const choices = (group.choices || []).filter((choice) => allowedChoices.has(choice));
      return choices.length ? [{ ...group, choices }] : [];
    });
    return { ...item, optionGroups };
  }

  function renderMenu() {
    try {
      const categories = eligibleCategories();
      const groups = menuGroups(categories);
      $("#menuLoading").hidden = true;
      $("#menuError").hidden = true;
      $("#menuEmpty").hidden = Boolean(groups.length);
      $("#categoryNav").innerHTML = groups.map((group, index) => `
        <button type="button" data-menu-group-id="${escapeHtml(group.id)}" class="${index === 0 ? "active" : ""}" aria-current="${index === 0 ? "true" : "false"}">
          <span class="category-nav-icon" aria-hidden="true">${menuGroupIcon(group)}</span>
          <span class="category-nav-label">${escapeHtml(group.label)}</span>
          <span class="category-nav-count">${group.items.length}品</span>
        </button>
      `).join("");
      $("#menuSections").innerHTML = groups.map((group) => `
        <section id="customer-group-${escapeHtml(group.id)}" class="menu-category-section" data-menu-group-section="${escapeHtml(group.id)}">
          <div class="menu-category-heading">
            <span aria-hidden="true">${menuGroupIcon(group)}</span>
            <div><h2>${escapeHtml(group.label)}</h2><p>${escapeHtml(group.parentLabel)} · ${group.items.length}品</p></div>
          </div>
          <div class="menu-grid">
            ${group.items.map((item) => menuCard(group.category, item)).join("")}
          </div>
        </section>
      `).join("");
      renderCartBadge();
      scheduleActiveCategory();
    } catch (error) {
      console.error(error);
      $("#menuLoading").hidden = true;
      $("#menuError").hidden = false;
    }
  }

  function menuGroups(categories) {
    return categories.flatMap((category) => {
      const subcategories = Array.isArray(category.subcategories) ? category.subcategories : [];
      if (!subcategories.length) {
        return [{
          id: category.id,
          label: category.label,
          parentLabel: category.label,
          category,
          items: category.items,
        }];
      }

      const knownIds = new Set(subcategories.map((subcategory) => subcategory.id));
      const groups = subcategories.map((subcategory) => ({
        id: `${category.id}-${subcategory.id}`,
        label: subcategory.label,
        parentLabel: category.label,
        category,
        items: category.items.filter((item) => item.subcategory_id === subcategory.id),
      })).filter((group) => group.items.length);
      const ungrouped = category.items.filter((item) => !knownIds.has(item.subcategory_id));
      if (ungrouped.length) {
        groups.push({
          id: `${category.id}-other`,
          label: "その他",
          parentLabel: category.label,
          category,
          items: ungrouped,
        });
      }
      return groups;
    });
  }

  function menuCard(category, item) {
    const quantity = state.cart.filter((entry) => entry.categoryId === category.id && entry.itemId === item.id)
      .reduce((sum, entry) => sum + entry.quantity, 0);
    const hasOptions = Array.isArray(item.optionGroups) && item.optionGroups.length;
    return `
      <button class="menu-card" type="button" data-category-id="${escapeHtml(category.id)}" data-item-id="${escapeHtml(item.id)}">
        ${quantity ? `<span class="in-cart" aria-label="カート内${quantity}点">${quantity}</span>` : ""}
        <strong>${escapeHtml(item.name)}</strong>
        <span class="zero-price">¥0</span>
        ${hasOptions ? '<span class="option-hint">カスタムできます</span>' : ""}
      </button>`;
  }

  async function reloadMenu() {
    $("#menuError").hidden = true;
    $("#menuLoading").hidden = false;
    try {
      state.menu = await state.gateway.loadMenu();
      state.plan = U.findPlan(state.menu, state.plan.id) || state.plan;
      renderMenu();
    } catch {
      $("#menuLoading").hidden = true;
      $("#menuError").hidden = false;
    }
  }

  function handleCategoryClick(event) {
    const button = event.target.closest("[data-menu-group-id]");
    if (!button) return;
    setActiveCategory(button.dataset.menuGroupId);
    $(`#customer-group-${cssEscape(button.dataset.menuGroupId)}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function menuGroupIcon(group) {
    const value = `${group.id} ${group.label} ${group.parentLabel}`.toLowerCase();
    if (/beer|ビール/.test(value)) return "🍺";
    if (/wine|ワイン/.test(value)) return "🍷";
    if (/juice|ジュース/.test(value)) return "🧃";
    if (/energy|redbull|エナジー|レッドブル/.test(value)) return "⚡";
    if (/water|tea|水|お茶|紅茶/.test(value)) return "🍵";
    if (/whisky|whiskey|ウィスキー|ウイスキー/.test(value)) return "🥃";
    if (/焼酎|日本酒/.test(value)) return "🍶";
    if (/coffee|tea|コーヒー|珈琲|紅茶|お茶/.test(value)) return "☕";
    if (/alcohol|cocktail|sour|whisky|アルコール|カクテル|サワー|焼酎|ウイスキー/.test(value)) return "🍸";
    return "🥤";
  }

  function scheduleActiveCategory() {
    window.cancelAnimationFrame(scheduleActiveCategory.frame);
    scheduleActiveCategory.frame = window.requestAnimationFrame(syncActiveCategory);
  }

  function syncActiveCategory() {
    const sections = $$("[data-menu-group-section]");
    if (!sections.length || $("#orderState")?.hidden) return;
    const marker = ($(".order-header")?.getBoundingClientRect().height || 76) + 20;
    let current = sections[0];
    sections.forEach((section) => {
      if (section.getBoundingClientRect().top <= marker) current = section;
    });
    setActiveCategory(current.dataset.menuGroupSection, false);
  }

  function setActiveCategory(groupId, reveal = true) {
    $$("#categoryNav button").forEach((entry) => {
      const active = entry.dataset.menuGroupId === groupId;
      entry.classList.toggle("active", active);
      entry.setAttribute("aria-current", active ? "true" : "false");
      if (active && reveal) entry.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  }

  function handleMenuClick(event) {
    const button = event.target.closest("[data-item-id]");
    if (!button) return;
    const category = eligibleCategories().find((entry) => entry.id === button.dataset.categoryId);
    const item = category?.items.find((entry) => entry.id === button.dataset.itemId);
    if (item) openItem(category, item);
  }

  function openItem(category, item) {
    state.activeItem = { category, item };
    state.quantity = 1;
    $("#itemDialogTitle").textContent = item.name;
    $("#itemQuantity").textContent = "1";
    $("#itemOptions").innerHTML = (item.optionGroups || []).map((group, index) => optionGroup(group, index)).join("");
    $("#itemDialog").showModal();
  }

  function optionGroup(group, index) {
    const choices = Array.isArray(group.choices) ? group.choices : [];
    const name = `item-option-${index}`;
    return `
      <fieldset class="option-group" data-required="${group.required ? "true" : "false"}">
        <legend>${escapeHtml(group.label)}${group.required ? "（必須）" : ""}</legend>
        <div class="option-choices">
          ${!group.required ? `<label><input type="radio" name="${name}" value=""><span>指定なし</span></label>` : ""}
          ${choices.map((choice) => `<label><input type="radio" name="${name}" value="${escapeHtml(choice)}"><span>${escapeHtml(choice)}</span></label>`).join("")}
        </div>
      </fieldset>`;
  }

  function changeItemQuantity(delta) {
    state.quantity = Math.max(1, Math.min(20, state.quantity + delta));
    $("#itemQuantity").textContent = String(state.quantity);
  }

  function addItemToCart() {
    if (!state.activeItem || !sessionCanOrder()) return;
    const options = [];
    for (const group of $$("#itemOptions .option-group")) {
      const selected = $("input:checked", group)?.value || "";
      if (group.dataset.required === "true" && !selected) {
        toast("必須のカスタムを選択してください");
        return;
      }
      if (selected) options.push(selected);
    }
    state.cart.push({
      cartId: U.makeId(), categoryId: state.activeItem.category.id, itemId: state.activeItem.item.id,
      name: state.activeItem.item.name, options, quantity: state.quantity,
    });
    $("#itemDialog").close();
    renderMenu();
    toast(`${state.activeItem.item.name}をカートに追加しました`);
    state.activeItem = null;
  }

  function renderCartBadge() {
    const count = state.cart.reduce((sum, item) => sum + item.quantity, 0);
    $("#cartCount").textContent = String(count);
    $("#openCart").disabled = count === 0;
  }

  function openCart() {
    if (!state.cart.length || !sessionCanOrder()) return;
    renderCart();
    $("#cartDialog").showModal();
  }

  function renderCart() {
    $("#cartItems").innerHTML = state.cart.map((item) => `
      <article class="cart-item" data-cart-id="${escapeHtml(item.cartId)}">
        <div class="cart-item-head">
          <div><strong>${escapeHtml(item.name)}</strong>${item.options.length ? `<p class="cart-item-options">${escapeHtml(item.options.join(" / "))}</p>` : ""}</div>
          <div class="cart-item-actions">
            <button type="button" data-cart-action="minus" aria-label="${escapeHtml(item.name)}を減らす">−</button>
            <output>${item.quantity}</output>
            <button type="button" data-cart-action="plus" aria-label="${escapeHtml(item.name)}を増やす">＋</button>
          </div>
        </div>
      </article>`).join("");
    $("#sendStatus").textContent = "";
    delete $("#sendStatus").dataset.state;
    $("#submitOrder").disabled = state.submitting || !state.cart.length;
  }

  function handleCartAction(event) {
    if (state.submitting) return;
    const button = event.target.closest("[data-cart-action]");
    const row = button?.closest("[data-cart-id]");
    if (!button || !row) return;
    const index = state.cart.findIndex((item) => item.cartId === row.dataset.cartId);
    if (index < 0) return;
    if (button.dataset.cartAction === "plus") state.cart[index].quantity = Math.min(20, state.cart[index].quantity + 1);
    else if (state.cart[index].quantity > 1) state.cart[index].quantity -= 1;
    else state.cart.splice(index, 1);
    renderMenu();
    if (!state.cart.length) $("#cartDialog").close();
    else renderCart();
  }

  function updateLocationFields() {
    const target = $('input[name="customerTarget"]:checked')?.value || "bar";
    $("#locationFields").hidden = target === "bar";
  }

  async function submitOrder() {
    if (state.submitting || !state.cart.length) return;
    state.submitting = true;
    const button = $("#submitOrder");
    button.disabled = true;
    setSendStatus("送信中...", "loading");
    try {
      const current = await state.gateway.getSession(state.cardHash);
      const now = state.gateway.now();
      if (!current || current.status !== "active" || current.deviceBinding !== state.deviceBinding || Date.parse(current.expiresAt) <= now) {
        throw new SessionEndedError();
      }
      const target = $('input[name="customerTarget"]:checked')?.value || "bar";
      const tableNo = target === "bar" ? "" : $("#customerTable").value.trim();
      const seatNo = target === "bar" ? "" : $("#customerSeat").value.trim();
      const rows = state.cart.map((item) => ({
        drinkName: item.name,
        quantity: item.quantity,
        target,
        tableNo,
        seatNo,
        sessionId: current.sessionId,
        notes: [`飲み放題: ${state.plan.name}`, ...item.options].join(" / "),
      }));
      await state.gateway.createOrders(rows);
      state.cart = [];
      renderMenu();
      setSendStatus("送信完了しました", "success");
      toast("ご注文をバーへ送信しました");
      window.setTimeout(() => {
        if ($("#cartDialog").open) $("#cartDialog").close();
      }, 850);
    } catch (error) {
      console.error(error);
      if (error instanceof SessionEndedError) {
        showEnded();
      } else {
        setSendStatus(error.message || "送信に失敗しました。もう一度お試しください。", "error");
      }
    } finally {
      state.submitting = false;
      button.disabled = !state.cart.length;
    }
  }

  function sessionCanOrder() {
    const session = state.session;
    return Boolean(session && session.status === "active" && session.deviceBinding === state.deviceBinding && Date.parse(session.expiresAt) > state.gateway.now());
  }

  function setSendStatus(message, status) {
    const node = $("#sendStatus");
    node.textContent = message;
    node.dataset.state = status;
  }

  function closeDialogs() {
    [$("#itemDialog"), $("#cartDialog")].forEach((dialog) => { if (dialog?.open) dialog.close(); });
  }

  function toast(message) {
    const node = $("#customerToast");
    node.textContent = message;
    node.hidden = false;
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => { node.hidden = true; }, 2600);
  }

  function cleanup() {
    window.clearInterval(state.pollTimer);
    window.clearInterval(state.clockTimer);
  }

  function cssEscape(value) {
    return window.CSS?.escape ? window.CSS.escape(value) : String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
    })[character]);
  }

  class SessionEndedError extends Error {
    constructor() { super("飲み放題は終了しました"); }
  }
})();
