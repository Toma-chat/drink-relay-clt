(function () {
  "use strict";

  const STORE_CONFIG = window.DRINK_RELAY_STORE_CONFIG || {};
  const INITIAL_SETTINGS = window.DRINK_RELAY_INITIAL_SETTINGS || {};
  const STORE_ID = String(STORE_CONFIG.instanceId || "standalone-store")
    .trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-") || "standalone-store";
  const PREFIX = `drink-relay-${STORE_ID}`;
  const ORDER_KEY = `${PREFIX}-orders-v1`;
  const MENU_KEY = `${PREFIX}-menu-v2`;
  const SESSION_KEY = `${PREFIX}-unlimited-sessions-v1`;
  const CARD_KEY = `${PREFIX}-unlimited-cards-v1`;
  const CHANNEL_NAME = `${PREFIX}-local`;
  const SESSION_ROW_PREFIX = "aycd-session-";
  const CARD_CATALOG_ROW_ID = "aycd-card-catalog";
  const UNLIMITED_OPEN_ORDER_STATUSES = new Set(["ordered", "making", "made"]);
  const CONFIG = window.DRINK_RELAY_UNLIMITED_CONFIG || {};

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function readJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value ?? fallback;
    } catch {
      return fallback;
    }
  }

  function normalizeMenu(menu) {
    return Array.isArray(menu) ? menu.filter((category) => category && category.id !== "all-you-can-drink") : [];
  }

  function findPlan(menu, planId) {
    const source = Array.isArray(menu) ? menu : [];
    const category = source.find((entry) => entry?.id === "all-you-can-drink");
    return category?.items?.find((item) => item?.id === planId) || null;
  }

  async function digest(value) {
    const bytes = new TextEncoder().encode(String(value));
    const result = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(result)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function makeActivationCode() {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return String(values[0] % 10000).padStart(4, "0");
  }

  function makeId() {
    return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function unlimitedOrderSessionId(order) {
    const events = Array.isArray(order?.events) ? order.events : [];
    return String(events.find((event) => event?.source === "unlimited" && event?.sessionId)?.sessionId || "");
  }

  async function makeUnlimitedOrderId(sessionId, sequence) {
    const hex = await digest(`${STORE_ID}:unlimited-order:${sessionId}:${sequence}`);
    const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  }

  function unlimitedOrderPendingError() {
    const error = new Error("前のドリンクが提供済みになるまで次の注文はできません");
    error.code = "UNLIMITED_ORDER_PENDING";
    return error;
  }

  function makeCardToken() {
    const values = new Uint8Array(24);
    crypto.getRandomValues(values);
    return Array.from(values).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function formatRemaining(milliseconds) {
    const totalMinutes = Math.max(0, Math.ceil(milliseconds / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours ? `${hours}時間${String(minutes).padStart(2, "0")}分` : `${minutes}分`;
  }

  function calculateExpiry(startedAtMs, planId) {
    const rule = CONFIG.planRules?.[planId];
    if (!rule) return startedAtMs;

    const endHour = Number.isFinite(CONFIG.lastOrderEndHour)
      ? CONFIG.lastOrderEndHour
      : Number.isFinite(CONFIG.allDayEndHour) ? CONFIG.allDayEndHour : 22;
    const endMinute = Number.isFinite(CONFIG.lastOrderEndMinute)
      ? CONFIG.lastOrderEndMinute
      : Number.isFinite(CONFIG.allDayEndMinute) ? CONFIG.allDayEndMinute : 30;
    const now = new Date(startedAtMs);
    const end = new Date(now);
    end.setHours(endHour, endMinute, 0, 0);
    if (Number.isFinite(rule.durationMinutes)) {
      return Math.min(startedAtMs + rule.durationMinutes * 60000, end.getTime());
    }
    return end.getTime();
  }

  class Gateway {
    constructor() {
      this.supabase = null;
      this.mode = "local";
      this.serverOffsetMs = 0;
      this.channel = null;
      this.listeners = new Set();
      this.broadcast = "BroadcastChannel" in window ? new BroadcastChannel(CHANNEL_NAME) : null;
      this.broadcast?.addEventListener("message", (event) => {
        if (["unlimited-session-changed", "orders-changed"].includes(event.data?.type)) this.emit(event.data.type);
      });
      window.addEventListener("storage", (event) => {
        if ([SESSION_KEY, ORDER_KEY, MENU_KEY].includes(event.key)) this.emit("storage-changed");
      });
    }

    async init() {
      const url = String(STORE_CONFIG.supabaseUrl || "").trim();
      const key = String(STORE_CONFIG.supabaseAnonKey || "").trim();
      if (url && key && !window.supabase) {
        throw new Error("共有接続ライブラリを読み込めません");
      }
      if (url && key && window.supabase) {
        this.supabase = window.supabase.createClient(url, key);
        this.mode = "supabase";
        this.channel = this.supabase
          .channel(`drink_relay_unlimited_${makeId()}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "drink_app_settings" }, (payload) => {
            if (String(payload.new?.id || payload.old?.id || "").startsWith(SESSION_ROW_PREFIX)) this.emit("session-changed");
          })
          .on("postgres_changes", { event: "*", schema: "public", table: "drink_orders" }, () => {
            this.emit("orders-changed");
          })
          .subscribe();
        await this.syncServerClock(url, key);
      }
      return this;
    }

    onChange(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    emit(type) {
      this.listeners.forEach((listener) => listener(type));
    }

    now() {
      return Date.now() + this.serverOffsetMs;
    }

    async syncServerClock(url, key) {
      try {
        const started = Date.now();
        const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/`, {
          method: "HEAD",
          headers: { apikey: key, Authorization: `Bearer ${key}` },
          cache: "no-store",
        });
        const serverDate = Date.parse(response.headers.get("date") || "");
        if (Number.isFinite(serverDate)) this.serverOffsetMs = serverDate + (Date.now() - started) / 2 - Date.now();
      } catch {
        this.serverOffsetMs = 0;
      }
    }

    async loadMenu() {
      let menu = readJson(MENU_KEY, null);
      if (!Array.isArray(menu) || !menu.length) menu = clone(INITIAL_SETTINGS.menu || []);
      if (this.mode === "supabase") {
        const { data, error } = await this.supabase.from("drink_app_settings").select("menu").eq("id", "main").maybeSingle();
        if (error) throw new Error("共有メニューを読み込めません");
        if (Array.isArray(data?.menu) && data.menu.length) menu = data.menu;
      }
      return menu;
    }

    sessionRowId(cardHash) {
      return `${SESSION_ROW_PREFIX}${cardHash.slice(0, 40)}`;
    }

    async getSession(cardHash) {
      const id = this.sessionRowId(cardHash);
      if (this.mode === "supabase") {
        const { data, error } = await this.supabase.from("drink_app_settings").select("*").eq("id", id).maybeSingle();
        if (error) throw new Error("アクティベーション情報を確認できません");
        return data?.menu && !Array.isArray(data.menu) ? data.menu : null;
      }
      return readJson(SESSION_KEY, {})[id] || null;
    }

    async listSessions() {
      if (this.mode === "supabase") {
        const { data, error } = await this.supabase.from("drink_app_settings").select("id,updated_at,menu").like("id", `${SESSION_ROW_PREFIX}%`);
        if (error) throw new Error("飲み放題カードの状態を読み込めません");
        return (data || []).map((row) => row.menu).filter((value) => value && !Array.isArray(value));
      }
      return Object.values(readJson(SESSION_KEY, {}));
    }

    async saveSession(session) {
      const id = this.sessionRowId(session.cardHash);
      const value = { ...session, updatedAt: new Date(this.now()).toISOString() };
      if (this.mode === "supabase") {
        const { error } = await this.supabase.from("drink_app_settings").upsert({ id, updated_at: value.updatedAt, menu: value }, { onConflict: "id" });
        if (error) throw new Error("アクティベーション情報を保存できません");
      } else {
        const sessions = readJson(SESSION_KEY, {});
        sessions[id] = value;
        localStorage.setItem(SESSION_KEY, JSON.stringify(sessions));
        this.broadcast?.postMessage({ type: "unlimited-session-changed", id });
      }
      return value;
    }

    async loadCards() {
      if (this.mode === "supabase") {
        const { data, error } = await this.supabase.from("drink_app_settings").select("menu").eq("id", CARD_CATALOG_ROW_ID).maybeSingle();
        if (error) throw new Error("固定QRカードを読み込めません");
        return Array.isArray(data?.menu) ? data.menu : [];
      }
      return readJson(CARD_KEY, []);
    }

    async saveCards(cards) {
      const value = Array.isArray(cards) ? cards : [];
      if (this.mode === "supabase") {
        const updatedAt = new Date(this.now()).toISOString();
        const { error } = await this.supabase.from("drink_app_settings").upsert(
          { id: CARD_CATALOG_ROW_ID, updated_at: updatedAt, menu: value },
          { onConflict: "id" }
        );
        if (error) throw new Error("固定QRカードを保存できません");
      } else {
        localStorage.setItem(CARD_KEY, JSON.stringify(value));
        this.broadcast?.postMessage({ type: "unlimited-session-changed" });
      }
      return value;
    }

    async getUnlimitedOrderState(sessionId) {
      const normalizedSessionId = String(sessionId || "").trim();
      if (!normalizedSessionId) return { orders: [], pendingOrder: null, nextSequence: 1 };

      let orders;
      if (this.mode === "supabase") {
        const { data, error } = await this.supabase
          .from("drink_orders")
          .select("id,created_at,status,quantity,drink_name,events")
          .filter("events", "cs", JSON.stringify([{ source: "unlimited", sessionId: normalizedSessionId }]))
          .order("created_at", { ascending: true });
        if (error) throw new Error("注文状況を確認できませんでした");
        orders = data || [];
      } else {
        orders = readJson(ORDER_KEY, []).filter((order) => unlimitedOrderSessionId(order) === normalizedSessionId);
        orders.sort((left, right) => Date.parse(left.created_at || 0) - Date.parse(right.created_at || 0));
      }

      const pendingOrder = orders.find((order) => UNLIMITED_OPEN_ORDER_STATUSES.has(order.status)) || null;
      return { orders, pendingOrder, nextSequence: orders.length + 1 };
    }

    async createUnlimitedOrder(item) {
      const sessionId = String(item?.sessionId || "").trim();
      if (!sessionId) throw new Error("飲み放題セッションを確認できませんでした");

      const orderState = await this.getUnlimitedOrderState(sessionId);
      if (orderState.pendingOrder) throw unlimitedOrderPendingError();

      const at = new Date(this.now()).toISOString();
      const id = await makeUnlimitedOrderId(sessionId, orderState.nextSequence);
      const row = {
        id, created_at: at, updated_at: at, source: "table",
        drink_name: item.drinkName, quantity: 1, target: item.target || "bar",
        table_no: item.tableNo || "", seat_no: item.seatNo || "",
        payment_status: "paid", payment_method: "cash", notes: item.notes || "",
        status: "ordered", made_at: null, served_at: null, paid_at: null,
        events: [{ type: "ordered", at, source: "unlimited", sessionId, sequence: orderState.nextSequence }],
      };

      if (this.mode === "supabase") {
        const { error } = await this.supabase.from("drink_orders").insert(row);
        if (error?.code === "23505") throw unlimitedOrderPendingError();
        if (error) throw new Error("注文を送信できませんでした");
      } else {
        const orders = readJson(ORDER_KEY, []);
        const hasPending = orders.some((order) =>
          unlimitedOrderSessionId(order) === sessionId && UNLIMITED_OPEN_ORDER_STATUSES.has(order.status)
        );
        if (hasPending || orders.some((order) => order.id === id)) throw unlimitedOrderPendingError();
        localStorage.setItem(ORDER_KEY, JSON.stringify([row, ...orders].slice(0, 200)));
        this.broadcast?.postMessage({ type: "orders-changed" });
      }
      return row;
    }

    async createOrders(items) {
      const startedAt = this.now();
      const rows = items.map((item, index) => {
        const at = new Date(startedAt + index).toISOString();
        return {
          id: makeId(), created_at: at, updated_at: at, source: "table",
          drink_name: item.drinkName, quantity: item.quantity, target: item.target || "bar",
          table_no: item.tableNo || "", seat_no: item.seatNo || "",
          payment_status: "paid", payment_method: "cash", notes: item.notes || "",
          status: "ordered", made_at: null, served_at: null, paid_at: null,
          events: [{ type: "ordered", at, source: "unlimited", sessionId: item.sessionId }],
        };
      });
      if (this.mode === "supabase") {
        const { error } = await this.supabase.from("drink_orders").insert(rows);
        if (error) throw new Error("注文を送信できませんでした");
      } else {
        const orders = readJson(ORDER_KEY, []);
        localStorage.setItem(ORDER_KEY, JSON.stringify([...rows, ...orders].slice(0, 200)));
        this.broadcast?.postMessage({ type: "orders-changed" });
      }
      return rows;
    }
  }

  window.DrinkRelayUnlimited = Object.freeze({
    Gateway, CONFIG, STORE_ID, digest, makeActivationCode, makeId, makeCardToken, normalizeMenu, findPlan,
    calculateExpiry, formatRemaining,
  });
})();
