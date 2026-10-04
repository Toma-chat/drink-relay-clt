(function () {
  "use strict";

  const U = window.DrinkRelayUnlimited;
  const warmup = new URLSearchParams(location.search).get("warmup") === "1";
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const state = {
    gateway: null, menu: [], plan: null, rule: null, session: null,
    cardHash: "", deviceBinding: "", cart: [], activeItem: null,
    submitting: false, pendingOrder: null, orderStatusLoading: true, orderStatusError: false,
    orderAvailabilityInitialized: false, locationSaving: false,
    pollTimer: null, clockTimer: null, toastTimer: null,
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
      const planId = warmup ? "unlimited-alcohol-all-day" : String(params.get("plan") || "").trim();
      if (cardToken.length < 8 || !U.CONFIG.planRules?.[planId]) {
        showError("無効なQRコードです", "受付スタッフへカードをご提示ください。");
        return;
      }
      rememberCustomerUrl();

      state.gateway = await new (warmup ? window.DrinkRelayWarmup.Gateway : U.Gateway)().init();
      state.menu = await state.gateway.loadMenu();
      state.plan = U.findPlan(state.menu, planId);
      if (warmup && state.plan) state.plan = { ...state.plan, name: "Warmup飲み放題" };
      state.rule = U.CONFIG.planRules[planId];
      if (!state.plan) {
        showError("プラン設定が見つかりません", "このQRカードは現在利用できません。受付スタッフへお声がけください。");
        return;
      }

      state.cardHash = await U.digest(`${U.STORE_ID}:${cardToken}`);
      state.deviceBinding = warmup ? window.DrinkRelayWarmup.device : await U.digest(getDeviceId());
      state.gateway.onChange(() => scheduleSessionCheck());
      await checkSession(true);
      state.pollTimer = window.setInterval(() => checkSession(false), 3000);
      window.addEventListener("pagehide", cleanup, { once: true });
    } catch (error) {
      console.error(error);
      showError("通信エラーが発生しました", error.message || "通信状態を確認してもう一度お試しください。", true);
    }
  }


  async function checkWarmup() {
    const data = await state.gateway.status();
    state.session = data.session;
    state.rule = data.profile;
    const freshMenu = await state.gateway.loadMenu();
    if (JSON.stringify(freshMenu) !== JSON.stringify(state.menu)) { state.menu = freshMenu; $('#menuSections').replaceChildren(); state.cart = []; }
    if (data.reason !== 'weekday' || data.stopped || !data.session) {
      closeDialogs(true); state.cart = []; renderCartBadge();
      showOnly('warmupActivation');
      const available = data.reason === 'weekday' && !data.stopped;
      $('#warmupMessage').textContent = data.stopped ? '現在Warmup飲み放題は停止中です' : data.reason === 'calendar_missing' ? '祝日カレンダー未設定です。スタッフへお声がけください' : available ? 'スタッフから本日の4桁コードをお受け取りください' : 'Warmup飲み放題は平日のみ利用できます';
      $('#warmupForm').hidden = !available;
      return;
    }
    await refreshOrderAvailability(data.session);
    showOrder(data.session);
  }

  function wireControls() {
    $("#warmupForm")?.addEventListener("submit", async (event) => {
      event.preventDefault(); const button = $("#warmupAuthenticate"); button.disabled = true;
      try { await state.gateway.activate($("#warmupCode").value); $("#warmupAuthError").textContent = ""; await checkWarmup(); }
      catch (error) { $("#warmupAuthError").textContent = error.message; }
      finally { button.disabled = false; }
    });
    $("#retryActivation")?.addEventListener("click", retryActivation);
    $("#requestReconnect")?.addEventListener("click", requestReconnect);
    $("#retryMenu")?.addEventListener("click", reloadMenu);
    $("#categoryNav")?.addEventListener("click", handleCategoryClick);
    $("#menuSections")?.addEventListener("click", handleMenuClick);
    window.addEventListener("scroll", scheduleActiveCategory, { passive: true });
    $("#addToCart")?.addEventListener("click", addItemToCart);
    $("#openCart")?.addEventListener("click", openCart);
    $("#closeCart")?.addEventListener("click", () => $("#cartDialog")?.close());
    $("#cartItems")?.addEventListener("click", handleCartAction);
    $("#submitOrder")?.addEventListener("click", submitOrder);
    $("#currentLocationButton")?.addEventListener("click", openLocationDialog);
    $("#closeLocationDialog")?.addEventListener("click", closeLocationDialog);
    $("#locationDialog")?.addEventListener("click", handleLocationChoice);
    $("#saveCurrentLocation")?.addEventListener("click", saveCurrentLocation);
  }

  function getDeviceId() {
    const key = `drink-relay-${U.STORE_ID}-unlimited-device-v1`;
    const cookieKey = `${key}-cookie`;
    let id = "";
    try {
      id = localStorage.getItem(key) || "";
    } catch {
    }
    if (!id) {
      const cookie = document.cookie.split("; ").find((entry) => entry.startsWith(`${encodeURIComponent(cookieKey)}=`));
      if (cookie) id = decodeURIComponent(cookie.slice(cookie.indexOf("=") + 1));
    }
    if (!id) {
      id = U.makeId();
    }
    try {
      localStorage.setItem(key, id);
    } catch {
    }
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${encodeURIComponent(cookieKey)}=${encodeURIComponent(id)}; Max-Age=31536000; Path=/; SameSite=Lax${secure}`;
    return id;
  }

  function rememberCustomerUrl() {
    try {
      localStorage.setItem(`drink-relay-${U.STORE_ID}-unlimited-customer-url-v1`, location.href);
    } catch {
    }
  }

  function scheduleSessionCheck() {
    window.clearTimeout(scheduleSessionCheck.timer);
    scheduleSessionCheck.timer = window.setTimeout(() => checkSession(false), 200);
  }

  async function checkSession(createIfMissing) {
    if (!state.gateway || !state.cardHash) return;
    try {
      if (warmup) { await checkWarmup(); return; }
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
          showError("別のブラウザで受付待ちです", "同じ端末でも開き方が変わると別端末として認識されます。新しいコードを発行してください。", true);
          $("#retryActivation").textContent = "新しい4桁コードを発行する";
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
          const reconnect = validReconnectRequest(session, now);
          if (reconnect?.deviceBinding === state.deviceBinding) {
            showActivation(session, true);
            return;
          }
          showDeviceConflict();
          return;
        }
        await refreshOrderAvailability(session);
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
      if (!warmup && !$("#orderState").hidden) return;
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
      currentLocation: { target: "bar", tableNo: "", seatNo: "" },
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

  async function requestReconnect() {
    const button = $("#requestReconnect");
    if (!button || !state.gateway) return;
    button.disabled = true;
    showOnly("loadingState");
    try {
      const current = await state.gateway.getSession(state.cardHash);
      const now = state.gateway.now();
      if (!current || current.status !== "active" || Date.parse(current.expiresAt) <= now) {
        throw new Error("このカードの利用時間は終了しています");
      }
      const minutes = Number(U.CONFIG.activationRequestMinutes || 15);
      const reconnectRequest = {
        code: U.makeActivationCode(),
        deviceBinding: state.deviceBinding,
        requestedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + minutes * 60000).toISOString(),
      };
      state.session = await state.gateway.saveSession({ ...current, reconnectRequest });
      showActivation(state.session, true);
    } catch (error) {
      showError("再接続を申請できませんでした", error.message || "通信状態を確認してください。");
    } finally {
      button.disabled = false;
    }
  }

  function validReconnectRequest(session, now = state.gateway?.now() || Date.now()) {
    const request = session?.reconnectRequest;
    return request?.code && Date.parse(request.expiresAt) > now ? request : null;
  }

  function showDeviceConflict() {
    showError(
      "このQRカードは別のブラウザで利用中です",
      "同じ端末でもブラウザやQRの開き方が変わると再接続が必要です。受付スタッフの承認後、残り時間を引き継いで利用できます。"
    );
    $("#requestReconnect").hidden = false;
  }

  function showActivation(session, reconnecting = false) {
    closeDialogs(true);
    showOnly("activationState");
    $("#activationEyebrow").textContent = reconnecting ? "端末の再接続が必要です" : "受付での操作が必要です";
    $("#activationTitle").textContent = reconnecting ? "再接続待ち" : "アクティベーション待ち";
    $("#activationMessage").textContent = "このコードを受付スタッフへお伝えください";
    $("#activationWaitingLabel").textContent = reconnecting ? "再接続の承認を待っています" : "アクティベートを待っています";
    $("#activationCode").textContent = reconnecting ? session.reconnectRequest.code : session.activationCode;
    $("#activationPlanName").textContent = state.plan.name;
  }

  function showOrder(session) {
    showOnly("orderState");
    $("#activePlanName").textContent = state.plan.name;
    if (!state.clockTimer) state.clockTimer = window.setInterval(updateClock, 1000);
    updateClock();
    if (!$("#menuSections").children.length) renderMenu();
    renderCurrentLocation();
    renderOrderAvailability();
  }

  function showEnded() {
    closeDialogs(true);
    state.cart = [];
    state.pendingOrder = null;
    renderCartBadge();
    showOnly("endedState");
    window.clearInterval(state.clockTimer);
    state.clockTimer = null;
  }

  function showError(title, message, retryable = false) {
    closeDialogs(true);
    showOnly("errorState");
    $("#errorTitle").textContent = title;
    $("#errorMessage").textContent = message;
    $("#requestReconnect").hidden = true;
    $("#retryActivation").textContent = "もう一度確認する";
    $("#retryActivation").hidden = !retryable;
  }

  function showOnly(id) {
    $$(".customer-state").forEach((section) => { section.hidden = section.id !== id; });
  }

  function updateClock() {
    if (!state.session?.expiresAt || !state.gateway) return;
    if (warmup) { $("strong", $("#remainingTime")).textContent = "本日23:59まで"; return; }
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
      <button class="menu-card" type="button" data-category-id="${escapeHtml(category.id)}" data-item-id="${escapeHtml(item.id)}" ${sessionCanOrder() ? "" : "disabled"}>
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
    const atPageEnd = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
    if (atPageEnd) {
      current = sections[sections.length - 1];
    } else {
      sections.forEach((section) => {
        if (section.getBoundingClientRect().top <= marker) current = section;
      });
    }
    setActiveCategory(current.dataset.menuGroupSection, false);
  }

  function setActiveCategory(groupId, smooth = true) {
    const nav = $("#categoryNav");
    let activeButton = null;
    $$("#categoryNav button").forEach((entry) => {
      const active = entry.dataset.menuGroupId === groupId;
      entry.classList.toggle("active", active);
      entry.setAttribute("aria-current", active ? "true" : "false");
      if (active) activeButton = entry;
    });
    if (!nav || !activeButton) return;
    const buttonTop = activeButton.offsetTop;
    const buttonBottom = buttonTop + activeButton.offsetHeight;
    const visibleTop = nav.scrollTop;
    const visibleBottom = visibleTop + nav.clientHeight;
    if (buttonTop >= visibleTop && buttonBottom <= visibleBottom) return;
    nav.scrollTo({
      top: Math.max(0, buttonTop - (nav.clientHeight - activeButton.offsetHeight) / 2),
      behavior: smooth ? "smooth" : "auto",
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
    if (!sessionCanOrder()) {
      toast(orderLockedMessage());
      return;
    }
    state.activeItem = { category, item };
    $("#itemDialogTitle").textContent = item.name;
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

  function addItemToCart() {
    if (!state.activeItem || !sessionCanOrder()) {
      toast(orderLockedMessage());
      return;
    }
    if (state.cart.length) {
      toast("カートへ入れられるドリンクは1杯までです");
      return;
    }
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
      name: state.activeItem.item.name, options, quantity: 1,
    });
    $("#itemDialog").close();
    renderMenu();
    toast(`${state.activeItem.item.name}をカートに追加しました`);
    state.activeItem = null;
  }

  function renderCartBadge() {
    const count = state.cart.reduce((sum, item) => sum + item.quantity, 0);
    $("#cartCount").textContent = String(count);
    $("#cartDockLabel").textContent = state.pendingOrder
      ? "提供済みになるまでお待ちください"
      : state.orderStatusError
        ? "注文状況を確認できません"
        : "カートを確認";
    $("#openCart").disabled = count !== 1 || !sessionCanOrder();
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
            <span class="cart-item-quantity">1杯</span>
            <button type="button" data-cart-action="remove" aria-label="${escapeHtml(item.name)}をカートから削除">削除</button>
          </div>
        </div>
      </article>`).join("");
    $("#sendStatus").textContent = "";
    delete $("#sendStatus").dataset.state;
    $("#cartLocationLabel").textContent = U.formatUnlimitedLocation(state.session?.currentLocation);
    $("#submitOrder").disabled = state.submitting || state.cart.length !== 1 || !sessionCanOrder();
  }

  function handleCartAction(event) {
    if (state.submitting) return;
    const button = event.target.closest("[data-cart-action]");
    const row = button?.closest("[data-cart-id]");
    if (!button || !row) return;
    const index = state.cart.findIndex((item) => item.cartId === row.dataset.cartId);
    if (index < 0) return;
    state.cart.splice(index, 1);
    renderMenu();
    if (!state.cart.length) $("#cartDialog").close();
    else renderCart();
  }

  function renderCurrentLocation() {
    const label = U.formatUnlimitedLocation(state.session?.currentLocation);
    $("#currentLocationLabel").textContent = label;
    if ($("#cartLocationLabel")) $("#cartLocationLabel").textContent = label;
  }

  function openLocationDialog() {
    if (!state.session || state.session.status !== "active") return;
    renderLocationChoices(U.normalizeUnlimitedLocation(state.session.currentLocation));
    setLocationDialogStatus("");
    $("#locationDialog").showModal();
  }

  function closeLocationDialog() {
    const dialog = $("#locationDialog");
    if (dialog?.open && !state.locationSaving) dialog.close();
  }

  function renderLocationChoices(location) {
    const normalized = U.normalizeUnlimitedLocation(location);
    const targets = [
      { id: "bar", label: "バーカウンター" },
      { id: "ring", label: "リング" },
      { id: "tournament", label: "トーナメント" },
    ];
    $("#locationTargetChoices").innerHTML = targets.map((target) => `
      <button class="location-choice-button ${target.id === normalized.target ? "active" : ""}" type="button" data-location-choice="target" data-location-value="${target.id}">${target.label}</button>
    `).join("");
    $("#locationTableChoices").innerHTML = U.LOCATION_TABLES.map((value) => `
      <button class="location-choice-button ${value === normalized.tableNo ? "active" : ""}" type="button" data-location-choice="tableNo" data-location-value="${value}">${value}卓</button>
    `).join("");
    $("#locationSeatChoices").innerHTML = U.LOCATION_SEATS.map((value) => `
      <button class="location-choice-button ${value === normalized.seatNo ? "active" : ""}" type="button" data-location-choice="seatNo" data-location-value="${value}">${value}番</button>
    `).join("");
    const isBar = normalized.target === "bar";
    $("#locationTableGroup").hidden = isBar;
    $("#locationSeatGroup").hidden = isBar;
  }

  function handleLocationChoice(event) {
    const button = event.target.closest("[data-location-choice]");
    if (!button || state.locationSaving) return;
    const group = button.parentElement;
    $$('[data-location-choice]', group).forEach((choice) => choice.classList.toggle("active", choice === button));
    if (button.dataset.locationChoice === "target") {
      const isBar = button.dataset.locationValue === "bar";
      $("#locationTableGroup").hidden = isBar;
      $("#locationSeatGroup").hidden = isBar;
    }
    setLocationDialogStatus("");
  }

  function selectedLocation() {
    const value = (type) => $(`[data-location-choice="${type}"].active`)?.dataset.locationValue || "";
    return U.normalizeUnlimitedLocation({ target: value("target"), tableNo: value("tableNo"), seatNo: value("seatNo") });
  }

  async function saveCurrentLocation() {
    if (state.locationSaving || !state.gateway) return;
    const location = selectedLocation();
    if (!U.unlimitedLocationIsComplete(location)) {
      setLocationDialogStatus("テーブルと席番号を選択してください", "error");
      return;
    }

    state.locationSaving = true;
    const button = $("#saveCurrentLocation");
    button.disabled = true;
    setLocationDialogStatus("届け先を更新しています...", "loading");
    try {
      const current = await state.gateway.getSession(state.cardHash);
      const now = state.gateway.now();
      if (!current || current.status !== "active" || current.deviceBinding !== state.deviceBinding || Date.parse(current.expiresAt) <= now) {
        throw new SessionEndedError();
      }
      const result = await state.gateway.updateSessionLocation(current, location, "customer-manual");
      state.session = result.session;
      await refreshOrderAvailability(state.session);
      renderCurrentLocation();
      if ($("#locationDialog").open) $("#locationDialog").close();
      toast(result.pendingOrder ? "届け先と未提供注文を変更しました" : "現在の届け先を変更しました");
    } catch (error) {
      console.error(error);
      if (error instanceof SessionEndedError) showEnded();
      else setLocationDialogStatus(error.message || "届け先を変更できませんでした", "error");
    } finally {
      state.locationSaving = false;
      button.disabled = false;
    }
  }

  function setLocationDialogStatus(message, status = "") {
    const node = $("#locationDialogStatus");
    node.textContent = message;
    if (status) node.dataset.state = status;
    else delete node.dataset.state;
  }

  async function submitOrder() {
    if (state.submitting || state.cart.length !== 1 || !sessionCanOrder()) return;
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
      const orderLocation = U.normalizeUnlimitedLocation(current.currentLocation);
      if (!U.unlimitedLocationIsComplete(orderLocation)) throw new Error("現在の届け先を設定してください");
      const item = state.cart[0];
      const row = {
        drinkName: item.name, itemId: item.itemId, options: item.options,
        quantity: 1,
        location: orderLocation,
        sessionId: current.sessionId,
        notes: [`飲み放題: ${state.plan.name}`, ...item.options].join(" / "),
      };
      const createdOrder = await state.gateway.createUnlimitedOrder(row);
      state.pendingOrder = createdOrder;
      state.orderStatusError = false;
      state.orderStatusLoading = false;
      state.cart = [];
      renderMenu();
      renderOrderAvailability();
      setSendStatus("送信完了しました", "success");
      toast("ご注文をバーへ送信しました");
      window.setTimeout(() => {
        if ($("#cartDialog").open) $("#cartDialog").close();
      }, 850);
    } catch (error) {
      console.error(error);
      if (error instanceof SessionEndedError) {
        showEnded();
      } else if (error?.code === "UNLIMITED_ORDER_PENDING") {
        state.cart = [];
        await refreshOrderAvailability(state.session);
        renderMenu();
        setSendStatus("前のドリンクが提供済みになるまで次の注文はできません", "error");
        toast("前のドリンクは現在提供待ちです");
      } else {
        setSendStatus(error.message || "送信に失敗しました。もう一度お試しください。", "error");
      }
    } finally {
      state.submitting = false;
      button.disabled = state.cart.length !== 1 || !sessionCanOrder();
    }
  }

  function sessionCanOrder() {
    const session = state.session;
    return Boolean(
      session
      && session.status === "active"
      && session.deviceBinding === state.deviceBinding
      && Date.parse(session.expiresAt) > state.gateway.now()
      && !state.pendingOrder
      && !state.orderStatusLoading
      && !state.orderStatusError
      && U.unlimitedLocationIsComplete(session.currentLocation)
    );
  }

  async function refreshOrderAvailability(session) {
    if (!state.gateway || !session?.sessionId) return;
    const previousPendingId = state.pendingOrder?.id || "";
    const wasInitialized = state.orderAvailabilityInitialized;
    try {
      const result = await state.gateway.getUnlimitedOrderState(session.sessionId);
      state.pendingOrder = result.pendingOrder;
      state.orderStatusLoading = false;
      state.orderStatusError = false;
      state.orderAvailabilityInitialized = true;
      if (state.pendingOrder) {
        state.cart = [];
        closeDialogs();
      }
      if (wasInitialized && previousPendingId && !state.pendingOrder) {
        toast("提供済みになりました。次の1杯をご注文いただけます");
      }
    } catch (error) {
      console.error(error);
      state.orderStatusLoading = false;
      state.orderStatusError = true;
    }

    if ($("#menuSections")?.children.length) renderMenu();
    renderOrderAvailability();
  }

  function renderOrderAvailability() {
    const notice = $("#orderLimitNotice");
    if (!notice) return;
    let stateName = "available";
    let title = "次の1杯を注文できます";
    let message = "一度に注文できるドリンクは1杯です。";
    if (state.orderStatusLoading) {
      stateName = "loading";
      title = "注文状況を確認しています";
      message = "少々お待ちください。";
    } else if (state.orderStatusError) {
      stateName = "error";
      title = "注文状況を確認できません";
      message = "通信が戻るまで新しい注文は送信できません。";
    } else if (state.pendingOrder) {
      stateName = "pending";
      title = "ドリンクを提供待ちです";
      message = "提供済みになると、次の1杯を注文できます。";
    }
    notice.dataset.state = stateName;
    $("#orderLimitTitle").textContent = title;
    $("#orderLimitMessage").textContent = message;
    renderCartBadge();
  }

  function orderLockedMessage() {
    if (state.pendingOrder) return "前のドリンクが提供済みになるまでお待ちください";
    if (state.orderStatusError) return "注文状況を確認できません。通信状態をご確認ください";
    return "注文状況を確認しています";
  }

  function setSendStatus(message, status) {
    const node = $("#sendStatus");
    node.textContent = message;
    node.dataset.state = status;
  }

  function closeDialogs(includeLocation = false) {
    const dialogs = [$("#itemDialog"), $("#cartDialog")];
    if (includeLocation) dialogs.push($("#locationDialog"));
    dialogs.forEach((dialog) => { if (dialog?.open) dialog.close(); });
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
