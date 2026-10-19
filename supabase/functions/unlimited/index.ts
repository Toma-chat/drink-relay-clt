import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const EXPECTED_STORE = normalizeStore(Deno.env.get("DRINK_RELAY_STORE_ID") || "");
const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const SESSION_PREFIX = "aycd-session-";
const CARD_CATALOG_ID = "aycd-card-catalog";
const OPEN_STATUSES = ["ordered", "making", "made"];
const LOCATION_TARGETS = new Set(["bar", "ring", "tournament"]);
const LOCATION_TABLES = new Set(["A", "B", "C", "D", "E", "F", "G", "H"]);
const LOCATION_SEATS = new Set(["1", "2", "3", "4", "5", "6", "7", "8", "9"]);

// BEGIN GENERATED PLANS (scripts/build-unlimited-catalog.cjs)
type JsonObject = Record<string, any>;
const COMPILED_PROFILES = {
  "アルコールSP": {
    "itemIds": [
      "sparkling-water",
      "iced-coffee",
      "item-1783049531455",
      "melon-soda",
      "item-1783049599311",
      "item-1783049610093",
      "green-tea",
      "item-1783049181927",
      "item-1783049172799",
      "item-1783049320701",
      "cola",
      "item-1783049326313",
      "item-1783049580653",
      "orange-juice",
      "ginger-ale",
      "item-1783049570152",
      "nikka-highball",
      "nikka-cola-high",
      "nikka-ginger-high",
      "item-1783053231839",
      "item-1783053242905",
      "calpis-sour",
      "item-1783053258647",
      "item-1783053270509",
      "item-1783053301898",
      "item-1783053313814",
      "item-1783053519044",
      "item-1783053527395",
      "item-1783053542344",
      "item-1783053634194",
      "item-1783053600099",
      "item-1783053614958",
      "item-1783053717209",
      "rum-tonic",
      "item-1783053335099",
      "item-1783053343148",
      "item-1783053351523",
      "item-1783053374220",
      "mistia-cola",
      "mistia-ginger",
      "mistia-soda",
      "ichiryuno-mugi",
      "tomino-hozan",
      "jasmine-jj",
      "jasmine-jr",
      "jasmine-jk",
      "plum-wine",
      "beer",
      "item-1783052901930",
      "item-1783052950604",
      "item-1783052961537",
      "tiffin",
      "dita"
    ],
    "options": {
      "item-1783049570152": {
        "calpis-mix": [
          "炭酸",
          "水",
          "牛乳",
          "マンゴー",
          "オレンジ"
        ],
        "hot": []
      },
      "item-1783049580653": {
        "mango-mix": []
      },
      "item-1783053519044": {
        "spirit-mix": [
          "炭酸"
        ]
      },
      "item-1783053335099": {
        "cassis-mix": [
          "炭酸",
          "オレンジジュース",
          "烏龍茶",
          "グレープフルーツジュース"
        ]
      },
      "item-1783053343148": {
        "peach-mix": [
          "炭酸",
          "オレンジジュース",
          "烏龍茶"
        ]
      },
      "item-1783053351523": {
        "malibu-mix": [
          "コーラ",
          "炭酸",
          "マンゴージュース",
          "牛乳"
        ]
      },
      "item-1783053374220": {
        "kahlua-mix": [
          "牛乳",
          "コーヒー"
        ]
      },
      "dita": {
        "dita-mix": [
          "炭酸",
          "グレープフルーツジュース"
        ]
      }
    }
  },
  "アルコールSTD": {
    "itemIds": [
      "sparkling-water",
      "iced-coffee",
      "item-1783049531455",
      "melon-soda",
      "item-1783049599311",
      "item-1783049610093",
      "green-tea",
      "item-1783049181927",
      "item-1783049172799",
      "item-1783049320701",
      "cola",
      "item-1783049326313",
      "nikka-highball",
      "nikka-cola-high",
      "nikka-ginger-high",
      "item-1783053231839",
      "item-1783053242905",
      "calpis-sour",
      "item-1783053258647",
      "item-1783053270509",
      "item-1783053301898",
      "item-1783053313814",
      "item-1783053519044",
      "item-1783053527395",
      "item-1783053542344",
      "item-1783053634194",
      "item-1783053600099",
      "item-1783053614958",
      "item-1783053717209",
      "rum-tonic",
      "item-1783053335099",
      "item-1783053343148",
      "item-1783053351523",
      "item-1783053374220",
      "mistia-cola",
      "mistia-ginger",
      "mistia-soda",
      "ichiryuno-mugi",
      "tomino-hozan",
      "jasmine-jj",
      "jasmine-jr",
      "jasmine-jk",
      "plum-wine"
    ],
    "options": {
      "item-1783053519044": {
        "spirit-mix": [
          "炭酸"
        ]
      },
      "item-1783053335099": {
        "cassis-mix": [
          "炭酸",
          "オレンジジュース",
          "烏龍茶",
          "グレープフルーツジュース"
        ]
      },
      "item-1783053343148": {
        "peach-mix": [
          "炭酸",
          "オレンジジュース",
          "烏龍茶"
        ]
      },
      "item-1783053351523": {
        "malibu-mix": [
          "コーラ",
          "炭酸",
          "マンゴージュース",
          "牛乳"
        ]
      },
      "item-1783053374220": {
        "kahlua-mix": [
          "牛乳",
          "コーヒー"
        ]
      },
      "dita": {
        "dita-mix": [
          "炭酸",
          "グレープフルーツジュース"
        ]
      }
    }
  },
  "ソフトドリンクSTD": {
    "itemIds": [
      "sparkling-water",
      "iced-coffee",
      "item-1783049531455",
      "melon-soda",
      "item-1783049599311",
      "item-1783049610093",
      "green-tea",
      "item-1783049181927",
      "item-1783049172799",
      "item-1783049320701",
      "cola",
      "item-1783049326313"
    ],
    "options": {}
  },
  "ソフトドリンクSP": {
    "itemIds": [
      "sparkling-water",
      "iced-coffee",
      "item-1783049531455",
      "melon-soda",
      "item-1783049599311",
      "item-1783049610093",
      "green-tea",
      "item-1783049181927",
      "item-1783049172799",
      "item-1783049320701",
      "cola",
      "item-1783049326313",
      "item-1783049580653",
      "orange-juice",
      "ginger-ale",
      "item-1783049570152"
    ],
    "options": {
      "item-1783049570152": {
        "calpis-mix": [
          "炭酸",
          "水",
          "牛乳",
          "マンゴー",
          "オレンジ"
        ],
        "hot": []
      },
      "item-1783049580653": {
        "mango-mix": []
      }
    }
  }
};
const SHARED_PROFILES = Object.fromEntries(Object.entries(COMPILED_PROFILES).map(([id, profile]) => [id, { items: new Set(profile.itemIds), options: profile.options }]));
const COMPILED_PLANS = {
  "unlimited-warmup-sp": {
    "name": "Warm Up 飛ぶまで飲み放題 SP版",
    "duration": null,
    "endHour": 22,
    "endMinute": 30,
    "profile": "アルコールSP"
  },
  "unlimited-weekend-std": {
    "name": "Weekend Championship 飛ぶまで飲み放題 アルコール版",
    "duration": null,
    "endHour": 22,
    "endMinute": 30,
    "profile": "アルコールSTD"
  },
  "unlimited-super-weekend-sp": {
    "name": "超Weekend Championship 飛ぶまで飲み放題 SP版",
    "duration": null,
    "endHour": 22,
    "endMinute": 30,
    "profile": "アルコールSP"
  },
  "unlimited-happy-hour-sp": {
    "name": "超ハッピーアワー18:00まで飲み放題",
    "duration": null,
    "endHour": 18,
    "endMinute": 0,
    "profile": "アルコールSP"
  },
  "unlimited-soft-2h": {
    "name": "2時間ソフトドリンク飲み放題",
    "duration": 120,
    "endHour": 22,
    "endMinute": 30,
    "profile": "ソフトドリンクSTD"
  },
  "unlimited-soft-sp-2h": {
    "name": "2時間ソフトドリンクSP飲み放題",
    "duration": 120,
    "endHour": 22,
    "endMinute": 30,
    "profile": "ソフトドリンクSP"
  },
  "unlimited-alcohol-2h": {
    "name": "2時間アルコール飲み放題",
    "duration": 120,
    "endHour": 22,
    "endMinute": 30,
    "profile": "アルコールSTD"
  },
  "unlimited-alcohol-sp-2h": {
    "name": "2時間 アルコールSP飲み放題",
    "duration": 120,
    "endHour": 22,
    "endMinute": 30,
    "profile": "アルコールSP"
  },
  "unlimited-soft-all-day": {
    "name": "終日ソフトドリンク飲み放題",
    "duration": null,
    "endHour": 22,
    "endMinute": 30,
    "profile": "ソフトドリンクSTD"
  },
  "unlimited-soft-sp-all-day": {
    "name": "終日ソフトドリンクSP飲み放題",
    "duration": null,
    "endHour": 22,
    "endMinute": 30,
    "profile": "ソフトドリンクSP"
  },
  "unlimited-alcohol-all-day": {
    "name": "終日 アルコール飲み放題",
    "duration": null,
    "endHour": 22,
    "endMinute": 30,
    "profile": "アルコールSTD"
  },
  "unlimited-alcohol-sp-all-day": {
    "name": "終日 アルコールSP飲み放題",
    "duration": null,
    "endHour": 22,
    "endMinute": 30,
    "profile": "アルコールSP"
  },
  "unlimited-ring-sp": {
    "name": "リングゲームプレイ中飲み放題",
    "duration": null,
    "endHour": 22,
    "endMinute": 30,
    "profile": "アルコールSP"
  }
};
const PLAN_RULES: Record<string, { name: string; duration: number | null; endHour: number; endMinute: number; items: Set<string>; options: Record<string, Record<string, string[]>> }> = Object.fromEntries(
  Object.entries(COMPILED_PLANS).map(([id, rule]) => [id, { ...rule, ...SHARED_PROFILES[rule.profile] }])
);
// END GENERATED PLANS

class ApiError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 400, code = "") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function normalizeStore(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
}

function corsHeaders(req: Request) {
  const configured = String(Deno.env.get("DRINK_RELAY_ALLOWED_ORIGINS") || "")
    .split(",").map((value) => value.trim()).filter(Boolean);
  const origin = req.headers.get("origin") || "";
  const allowed = configured.length ? (configured.includes(origin) ? origin : configured[0]) : "*";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
}

function json(req: Request, value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: corsHeaders(req) });
}

function assertStore(body: JsonObject) {
  const store = normalizeStore(body.store);
  if (!store || (EXPECTED_STORE && store !== EXPECTED_STORE)) throw new ApiError("店舗情報が一致しません", 403);
  return store;
}

async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomCode() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(values[0] % 10000).padStart(4, "0");
}

function sessionRowId(cardHash: string) {
  return `${SESSION_PREFIX}${cardHash.slice(0, 40)}`;
}

async function setting(id: string) {
  const { data, error } = await admin.from("drink_app_settings").select("id,updated_at,menu").eq("id", id).maybeSingle();
  if (error) throw new ApiError("共有データを確認できません", 500);
  return data || null;
}

async function saveSetting(id: string, menu: unknown) {
  const updatedAt = new Date().toISOString();
  const { error } = await admin.from("drink_app_settings").upsert({ id, updated_at: updatedAt, menu }, { onConflict: "id" });
  if (error) throw new ApiError("共有データを保存できません", 500);
  return menu;
}

async function menu() {
  const row = await setting("main");
  return Array.isArray(row?.menu) ? row.menu : [];
}

async function cards() {
  const row = await setting(CARD_CATALOG_ID);
  return Array.isArray(row?.menu) ? row.menu : [];
}

async function cardContext(body: JsonObject) {
  const store = assertStore(body);
  const token = String(body.card || "").trim();
  const plan = String(body.plan || "").trim();
  const device = String(body.device || "").trim();
  if (token.length < 16 || device.length < 16 || !PLAN_RULES[plan]) throw new ApiError("無効なQRコードです", 403);
  const catalog = await cards();
  const card = catalog.find((entry: JsonObject) => entry?.token === token);
  if (!card || card.status !== "active" || card.planId !== plan) throw new ApiError("このQRカードは利用できません", 403);
  const cardHash = await digest(`${store}:${token}`);
  return { store, token, plan, device, card, cardHash };
}

async function currentSession(cardHash: string) {
  const row = await setting(sessionRowId(cardHash));
  const value = row?.menu;
  return value && !Array.isArray(value) && typeof value === "object" ? value as JsonObject : null;
}

async function saveSessionValue(value: JsonObject) {
  const next = { ...value, updatedAt: new Date().toISOString() };
  await saveSetting(sessionRowId(String(next.cardHash || "")), next);
  return next;
}

function safeSession(session: JsonObject | null, device: string) {
  if (!session) return null;
  const sameDevice = session.deviceBinding === device;
  const reconnect = session.reconnectRequest?.deviceBinding === device ? session.reconnectRequest : null;
  return {
    ...session,
    deviceBinding: sameDevice ? device : "different-device",
    activationCode: session.status === "pending" && sameDevice ? session.activationCode : undefined,
    reconnectRequest: reconnect || null,
  };
}

async function uniqueActivationCode() {
  const { data, error } = await admin.from("drink_app_settings").select("menu").like("id", `${SESSION_PREFIX}%`);
  if (error) throw new ApiError("コードを発行できません", 500);
  const used = new Set<string>();
  for (const row of data || []) {
    const value = row.menu as JsonObject;
    if (value?.activationCode) used.add(String(value.activationCode));
    if (value?.reconnectRequest?.code) used.add(String(value.reconnectRequest.code));
  }
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const code = randomCode();
    if (!used.has(code)) return code;
  }
  throw new ApiError("コードを発行できません。少し待ってから再度お試しください", 503);
}

function pendingSession(context: JsonObject) {
  const now = Date.now();
  return {
    sessionId: crypto.randomUUID(),
    cardHash: context.cardHash,
    deviceBinding: context.device,
    planId: context.plan,
    planName: String(context.plan),
    status: "pending",
    requestedAt: new Date(now).toISOString(),
    requestExpiresAt: new Date(now + 15 * 60 * 1000).toISOString(),
    currentLocation: { target: "bar", tableNo: "", seatNo: "" },
    protocolVersion: 2,
  };
}

async function planDisplayName(planId: string) {
  if (PLAN_RULES[planId]) return PLAN_RULES[planId].name;
  const source = await menu();
  const category = source.find((entry: JsonObject) => entry?.id === "all-you-can-drink");
  const plan = (category?.items || []).find((entry: JsonObject) => entry?.id === planId);
  return String(plan?.name || planId);
}

function normalizeLocation(value: JsonObject) {
  const target = String(value?.target || "");
  return {
    target,
    tableNo: target === "bar" ? "" : String(value?.tableNo || ""),
    seatNo: target === "bar" ? "" : String(value?.seatNo || ""),
  };
}

function validLocation(value: JsonObject) {
  return LOCATION_TARGETS.has(value.target)
    && (value.target === "bar" || (LOCATION_TABLES.has(value.tableNo) && LOCATION_SEATS.has(value.seatNo)));
}

function assertActiveSession(session: JsonObject | null, context: JsonObject) {
  if (!session || session.status !== "active" || session.cardHash !== context.cardHash
    || session.planId !== context.plan || session.deviceBinding !== context.device
    || Date.parse(session.expiresAt || "") <= Date.now()) {
    throw new ApiError("この飲み放題セッションは利用できません", 403, "SESSION_ENDED");
  }
  return session;
}

async function sessionOrders(sessionId: string) {
  const { data, error } = await admin.from("drink_orders")
    .select("id,created_at,updated_at,status,quantity,drink_name,target,table_no,seat_no,events")
    .filter("events", "cs", JSON.stringify([{ source: "unlimited", sessionId }]))
    .order("created_at", { ascending: true });
  if (error) throw new ApiError("注文状況を確認できません", 500);
  return data || [];
}

async function requireStaff(req: Request) {
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) throw new ApiError("スタッフログインが必要です", 401);
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data.user) throw new ApiError("スタッフログインが必要です", 401);
  const allowed = await admin.rpc("drink_staff_allowed", { p_user_id: data.user.id });
  if (allowed.error || allowed.data !== true) throw new ApiError("このアカウントには操作権限がありません", 403);
  return data.user;
}

function expiryFor(planId: string, startedAt = Date.now()) {
  const rule = PLAN_RULES[planId];
  if (!rule) throw new ApiError("飲み放題プランが無効です");
  const jst = new Date(startedAt + 9 * 60 * 60 * 1000);
  const closing = Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate(), rule.endHour, rule.endMinute) - 9 * 60 * 60 * 1000;
  return rule.duration === null ? closing : Math.min(closing, startedAt + rule.duration * 60 * 1000);
}

function findItem(source: any[], itemId: string) {
  for (const category of source || []) {
    const found = (category?.items || []).find((item: JsonObject) => String(item?.id || "") === itemId);
    if (found) return found;
  }
  return null;
}

function validateOptions(item: JsonObject, planId: string, requested: unknown) {
  const choices = Array.isArray(requested) ? requested.map(String) : [];
  if (choices.length > 12 || choices.some((choice) => choice.length > 80)) throw new ApiError("カスタム内容が無効です");
  const itemRules = PLAN_RULES[planId].options[item.id] || null;
  const groups = (Array.isArray(item.optionGroups) ? item.optionGroups : []).flatMap((group: JsonObject) => {
    if (!itemRules || !Object.prototype.hasOwnProperty.call(itemRules, group.id)) return [group];
    const allowed = new Set(itemRules[group.id] || []);
    const filtered = (group.choices || []).filter((choice: string) => allowed.has(choice));
    return filtered.length ? [{ ...group, choices: filtered }] : [];
  });
  const allAllowed = new Set(groups.flatMap((group: JsonObject) => (group.choices || []).map(String)));
  if (choices.some((choice) => !allAllowed.has(choice))) throw new ApiError("選択できないカスタムが含まれています");
  for (const group of groups) {
    if (group.required && !(group.choices || []).some((choice: string) => choices.includes(String(choice)))) {
      throw new ApiError("必須のカスタムを選択してください");
    }
  }
  return choices;
}

async function orderId(sessionId: string, sequence: number, store: string) {
  const hex = await digest(`${store}:unlimited-order:${sessionId}:${sequence}`);
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

async function customerAction(action: string, body: JsonObject) {
  const context = await cardContext(body);
  const session = await currentSession(context.cardHash);

  if (action === "card") return { card: {
    id: context.card.id,
    label: context.card.label,
    planId: context.card.planId,
    token: context.token,
    status: context.card.status,
    kind: context.card.kind,
    immutable: context.card.immutable === true,
  } };
  if (action === "status") return { session: safeSession(session, context.device), serverNow: new Date().toISOString() };

  if (action === "save-session") {
    const desired = body.session || {};
    const now = Date.now();
    const expiredPending = session?.status === "pending" && Date.parse(session.requestExpiresAt || "") <= now;
    const expiredActive = session?.status === "active" && Date.parse(session.expiresAt || "") <= now;
    if (!session || session.status === "revoked" || expiredPending || expiredActive) {
      const next = {
        ...pendingSession(context),
        planName: await planDisplayName(context.plan),
        activationCode: await uniqueActivationCode(),
      };
      return { session: safeSession(await saveSessionValue(next), context.device) };
    }
    if (session.status === "pending") {
      if (session.deviceBinding !== context.device) return { session: safeSession(session, context.device) };
      return { session: safeSession(session, context.device) };
    }
    if (session.status === "active" && desired.reconnectRequest && session.deviceBinding !== context.device) {
      const reconnectRequest = {
        code: await uniqueActivationCode(), deviceBinding: context.device,
        requestedAt: new Date(now).toISOString(), expiresAt: new Date(now + 15 * 60 * 1000).toISOString(),
      };
      const next = await saveSessionValue({ ...session, reconnectRequest });
      return { session: safeSession(next, context.device) };
    }
    return { session: safeSession(session, context.device) };
  }

  const active = assertActiveSession(session, context);
  if (action === "order-state") {
    const orders = await sessionOrders(active.sessionId);
    return { orders, pendingOrder: orders.find((order) => OPEN_STATUSES.includes(order.status)) || null, nextSequence: orders.length + 1 };
  }

  if (action === "location") {
    const location = normalizeLocation(body.location || {});
    if (!validLocation(location)) throw new ApiError("届け先を確認してください");
    const at = new Date().toISOString();
    const previous = normalizeLocation(active.currentLocation || {});
    const saved = await saveSessionValue({
      ...active, currentLocation: location, locationConfirmed: true, locationUpdatedAt: at,
      locationSource: "customer", locationRevision: crypto.randomUUID(),
    });
    const orders = await sessionOrders(active.sessionId);
    const pending = orders.find((order) => OPEN_STATUSES.includes(order.status));
    let updatedOrder = null;
    if (pending) {
      const events = [...(Array.isArray(pending.events) ? pending.events : []), {
        type: "location-changed", at, source: "customer", sessionId: active.sessionId,
        previousDeliveryLocation: previous, sessionCurrentLocation: location,
      }];
      const result = await admin.from("drink_orders").update({
        target: location.target, table_no: location.tableNo, seat_no: location.seatNo, updated_at: at, events,
      }).eq("id", pending.id).in("status", OPEN_STATUSES)
        .select("id,status,target,table_no,seat_no,events").maybeSingle();
      if (result.error) throw new ApiError("未提供注文の届け先を更新できません", 500);
      updatedOrder = result.data;
    }
    return { session: safeSession(saved, context.device), pendingOrder: updatedOrder };
  }

  if (action === "order") {
    if (active.locationConfirmed === false) throw new ApiError("最初の届け先を設定してください", 409);
    const existing = await sessionOrders(active.sessionId);
    if (existing.some((order) => OPEN_STATUSES.includes(order.status))) {
      throw new ApiError("前のドリンクが提供済みになるまで次の注文はできません", 409, "UNLIMITED_ORDER_PENDING");
    }
    const requested = body.item || {};
    const itemId = String(requested.itemId || "");
    if (!PLAN_RULES[active.planId]?.items.has(itemId)) throw new ApiError("このプランでは注文できない商品です", 403);
    const menuData = await menu();
    const item = findItem(menuData, itemId);
    if (!item) throw new ApiError("商品が見つかりません");
    const options = validateOptions(item, active.planId, requested.options);
    const location = normalizeLocation(active.currentLocation || {});
    if (!validLocation(location)) throw new ApiError("現在の届け先を設定してください");
    const sequence = existing.length + 1;
    const at = new Date().toISOString();
    const row = {
      id: await orderId(active.sessionId, sequence, context.store),
      created_at: at, updated_at: at, source: "table", drink_name: String(item.name || ""), quantity: 1,
      target: location.target, table_no: location.tableNo, seat_no: location.seatNo,
      payment_status: "paid", payment_method: "cash",
      notes: [`飲み放題: ${active.planName || active.planId}`, ...options].join(" / "),
      status: "ordered", made_at: null, served_at: null, paid_at: null,
      events: [{ type: "ordered", at, source: "unlimited", itemId, sessionId: active.sessionId, sequence, orderLocation: location, sessionCurrentLocation: location }],
    };
    const result = await admin.from("drink_orders").insert(row).select("*").single();
    if (result.error?.code === "23505") throw new ApiError("前のドリンクが提供済みになるまで次の注文はできません", 409, "UNLIMITED_ORDER_PENDING");
    if (result.error) throw new ApiError("注文を送信できません", 500);
    return { order: result.data };
  }

  throw new ApiError("操作を確認できません", 404);
}

async function staffAction(req: Request, action: string, body: JsonObject) {
  await requireStaff(req);
  assertStore(body);

  if (action === "staff-list-cards") return { cards: await cards() };
  if (action === "staff-save-cards") {
    const value = Array.isArray(body.cards) ? body.cards : null;
    if (!value || value.length > 1000) throw new ApiError("QRカード情報が無効です");
    await saveSetting(CARD_CATALOG_ID, value);
    return { cards: value };
  }
  if (action === "staff-list-sessions") {
    const result = await admin.from("drink_app_settings").select("menu").like("id", `${SESSION_PREFIX}%`);
    if (result.error) throw new ApiError("飲み放題カードの状態を読み込めません", 500);
    return { sessions: (result.data || []).map((row) => row.menu).filter((value) => value && !Array.isArray(value)) };
  }
  if (action === "staff-save-session") {
    const desired = body.session || {};
    if (!desired.cardHash || !desired.sessionId) throw new ApiError("セッション情報が無効です");
    const current = await currentSession(String(desired.cardHash));
    if (!current || current.sessionId !== desired.sessionId) throw new ApiError("セッションが見つかりません", 404);
    const now = Date.now();
    let next: JsonObject;
    if (desired.status === "revoked") {
      next = { ...current, status: "revoked", revokedAt: new Date(now).toISOString(), reconnectRequest: null };
    } else if (current.status === "pending" && desired.status === "active") {
      const expiresAt = expiryFor(current.planId, now);
      if (expiresAt <= now) throw new ApiError("本日のラストオーダー時刻を過ぎています");
      next = {
        ...current, status: "active", startedAt: new Date(now).toISOString(),
        expiresAt: new Date(expiresAt).toISOString(), activatedAt: new Date(now).toISOString(),
        activationRevision: crypto.randomUUID(), currentLocation: normalizeLocation(current.currentLocation || {}),
        locationConfirmed: false,
      };
    } else if (current.status === "active" && current.reconnectRequest
      && desired.deviceBinding === current.reconnectRequest.deviceBinding) {
      next = {
        ...current, deviceBinding: current.reconnectRequest.deviceBinding, reconnectRequest: null,
        reconnectedAt: new Date(now).toISOString(), activationRevision: crypto.randomUUID(),
      };
    } else {
      throw new ApiError("許可されていないセッション変更です", 403);
    }
    return { session: await saveSessionValue(next) };
  }
  if (action === "staff-location") {
    const id = String(body.sessionId || "");
    const location = normalizeLocation(body.location || {});
    if (!id || !validLocation(location)) throw new ApiError("届け先を確認してください");
    const sessionsResult = await admin.from("drink_app_settings").select("menu").like("id", `${SESSION_PREFIX}%`);
    const current = (sessionsResult.data || []).map((row) => row.menu as JsonObject).find((value) => value?.sessionId === id);
    if (!current || current.status !== "active" || Date.parse(current.expiresAt || "") <= Date.now()) throw new ApiError("利用中のセッションが見つかりません");
    const at = new Date().toISOString();
    const previous = normalizeLocation(current.currentLocation || {});
    const saved = await saveSessionValue({ ...current, currentLocation: location, locationConfirmed: true, locationUpdatedAt: at, locationSource: "staff", locationRevision: crypto.randomUUID() });
    const orders = await sessionOrders(id);
    const pending = orders.find((order) => OPEN_STATUSES.includes(order.status));
    let updatedOrder = null;
    if (pending) {
      const events = [...(Array.isArray(pending.events) ? pending.events : []), {
        type: "location-changed", at, source: "staff", sessionId: id,
        previousDeliveryLocation: previous, sessionCurrentLocation: location,
      }];
      const result = await admin.from("drink_orders").update({ target: location.target, table_no: location.tableNo, seat_no: location.seatNo, updated_at: at, events })
        .eq("id", pending.id).in("status", OPEN_STATUSES).select("id,status,target,table_no,seat_no,events").maybeSingle();
      if (result.error) throw new ApiError("未提供注文の届け先を更新できません", 500);
      updatedOrder = result.data;
    }
    return { session: saved, pendingOrder: updatedOrder };
  }
  throw new ApiError("操作を確認できません", 404);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "POST required" }, 405);
  try {
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > 2_000_000) throw new ApiError("リクエストが大きすぎます", 413);
    const body = await req.json() as JsonObject;
    const action = String(body.action || "");
    if (action === "menu") {
      assertStore(body);
      return json(req, { menu: await menu(), serverNow: new Date().toISOString() });
    }
    const result = action.startsWith("staff-")
      ? await staffAction(req, action, body)
      : await customerAction(action, body);
    return json(req, result);
  } catch (error) {
    const value = error instanceof ApiError ? error : new ApiError("通信処理に失敗しました", 500);
    if (!(error instanceof ApiError)) console.error(error);
    return json(req, { error: value.message, code: value.code }, value.status);
  }
});

