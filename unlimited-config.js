(function () {
  "use strict";

  // 2026-10-13確認版 FREE DRINK MENU の対象商品。
  // 商品名・価格・オプション本体は既存メニューを参照します。
  const SOFT_STANDARD = [
    "oolong-tea",
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
  ];
  const SOFT_SP_EXTRA = ["item-1783049580653", "orange-juice", "ginger-ale", "item-1783049570152"];

  const ALCOHOL_STANDARD = [
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
  ];
  const ALCOHOL_SP_EXTRA = [
    "beer",
    "item-1783052901930",
    "item-1783052950604",
    "item-1783052961537",
    "tiffin",
    "dita",
  ];

  // 空配列は、そのプランでは該当オプショングループを表示しない指定です。
  const SOFT_STANDARD_OPTIONS = {};
  const SOFT_SP_OPTIONS = {
    "item-1783049570152": { "calpis-mix": ["炭酸", "水", "牛乳", "マンゴー", "オレンジ"], hot: [] },
    "item-1783049580653": { "mango-mix": [] },
  };
  const ALCOHOL_OPTIONS = {
    "item-1783053519044": { "spirit-mix": ["炭酸"] },
    "item-1783053335099": {
      "cassis-mix": ["炭酸", "オレンジジュース", "烏龍茶", "グレープフルーツジュース"],
    },
    "item-1783053343148": { "peach-mix": ["炭酸", "オレンジジュース", "烏龍茶"] },
    "item-1783053351523": { "malibu-mix": ["コーラ", "炭酸", "マンゴージュース", "牛乳"] },
    "item-1783053374220": { "kahlua-mix": ["牛乳", "コーヒー"] },
    dita: { "dita-mix": ["炭酸", "グレープフルーツジュース"] },
  };

  const mergeOptions = (...rules) => Object.assign({}, ...rules);
  const makeRule = (durationMinutes, includeItemIds, optionChoiceRules) => Object.freeze({
    durationMinutes,
    categories: [],
    includeItemIds: [...includeItemIds],
    excludeItemIds: [],
    optionChoiceRules,
  });
  const softStandardRule = (duration) => makeRule(duration, SOFT_STANDARD, SOFT_STANDARD_OPTIONS);
  const softSpRule = (duration) => makeRule(
    duration,
    [...SOFT_STANDARD, ...SOFT_SP_EXTRA],
    mergeOptions(SOFT_SP_OPTIONS)
  );
  const alcoholStandardRule = (duration) => makeRule(
    duration,
    [...SOFT_STANDARD, ...ALCOHOL_STANDARD],
    mergeOptions(SOFT_STANDARD_OPTIONS, ALCOHOL_OPTIONS)
  );
  const alcoholSpRule = (duration) => makeRule(
    duration,
    [...SOFT_STANDARD, ...SOFT_SP_EXTRA, ...ALCOHOL_STANDARD, ...ALCOHOL_SP_EXTRA],
    mergeOptions(SOFT_SP_OPTIONS, ALCOHOL_OPTIONS)
  );

  window.DRINK_RELAY_UNLIMITED_CONFIG = Object.freeze({
    // QR専用プランは販売価格を持たず、通常注文の商品には追加しません。
    planCatalog: [
      { id: "unlimited-warmup-sp", name: "Warm Up 飛ぶまで飲み放題 SP版", profile: "アルコールSP", endMode: "staff" },
      { id: "unlimited-weekend-std", name: "Weekend Championship 飛ぶまで飲み放題 アルコール版", profile: "アルコールSTD", endMode: "staff" },
      { id: "unlimited-super-weekend-sp", name: "超Weekend Championship 飛ぶまで飲み放題 SP版", profile: "アルコールSP", endMode: "staff" },
      { id: "unlimited-happy-hour-sp", name: "超ハッピーアワー18:00まで飲み放題", permanentCardCount: 5, profile: "アルコールSP", endMode: "18:00" },
      { id: "unlimited-soft-2h", name: "2時間ソフトドリンク飲み放題", profile: "ソフトドリンクSTD" },
      { id: "unlimited-soft-sp-2h", name: "2時間ソフトドリンクSP飲み放題", profile: "ソフトドリンクSP" },
      { id: "unlimited-alcohol-2h", name: "2時間アルコール飲み放題", profile: "アルコールSTD" },
      { id: "unlimited-alcohol-sp-2h", name: "2時間 アルコールSP飲み放題", profile: "アルコールSP" },
      { id: "unlimited-soft-all-day", name: "終日ソフトドリンク飲み放題", profile: "ソフトドリンクSTD" },
      { id: "unlimited-soft-sp-all-day", name: "終日ソフトドリンクSP飲み放題", profile: "ソフトドリンクSP" },
      { id: "unlimited-alcohol-all-day", name: "終日 アルコール飲み放題", profile: "アルコールSTD" },
      { id: "unlimited-alcohol-sp-all-day", name: "終日 アルコールSP飲み放題", profile: "アルコールSP" },
      { id: "unlimited-ring-sp", name: "リングゲームプレイ中飲み放題", profile: "アルコールSP", endMode: "staff" },
    ],
    activationRequestMinutes: 15,
    allDayEndHour: 22,
    allDayEndMinute: 30,
    lastOrderEndHour: 22,
    lastOrderEndMinute: 30,
    planRules: Object.freeze({
      "unlimited-warmup-sp": alcoholSpRule(null),
      "unlimited-weekend-std": alcoholStandardRule(null),
      "unlimited-super-weekend-sp": alcoholSpRule(null),
      "unlimited-happy-hour-sp": { ...alcoholSpRule(null), endHour: 18, endMinute: 0 },
      "unlimited-ring-sp": alcoholSpRule(null),
      "unlimited-soft-2h": softStandardRule(120),
      "unlimited-soft-sp-2h": softSpRule(120),
      "unlimited-alcohol-2h": alcoholStandardRule(120),
      "unlimited-alcohol-sp-2h": alcoholSpRule(120),
      "unlimited-soft-all-day": softStandardRule(null),
      "unlimited-soft-sp-all-day": softSpRule(null),
      "unlimited-alcohol-all-day": alcoholStandardRule(null),
      "unlimited-alcohol-sp-all-day": alcoholSpRule(null),
    }),
  });
})();
