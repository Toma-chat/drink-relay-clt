(function () {
  "use strict";

  // 2026-09-29版 FREE DRINK MENU の対象商品。
  // 商品名・価格・オプション本体は既存メニューを参照します。
  const SOFT_STANDARD = [
    "iced-coffee",
    "item-1783049531455",
    "melon-soda",
    "item-1783049599311",
    "item-1783049610093",
    "apple-juice",
    "item-1783049570152",
    "green-tea",
    "item-1783049181927",
    "item-1783049172799",
    "item-1783049320701",
    "cola",
    "ginger-ale",
  ];
  const SOFT_SP_EXTRA = ["item-1783049580653", "orange-juice", "item-1783049326313"];

  const ALCOHOL_STANDARD = [
    "item-1783052940322",
    "item-1783053231839",
    "item-1783053242905",
    "calpis-sour",
    "item-1783053519044",
    "item-1783053527395",
    "item-1783053542344",
    "item-1783053634194",
    "item-1783053600099",
    "item-1783053717209",
    "rum-tonic",
    "item-1783053335099",
    "item-1783053343148",
    "item-1783053351523",
    "amaretto",
    "item-1783053374220",
    "ichiryuno-mugi",
    "tomino-hozan",
    "jasmine-jj",
    "jasmine-jr",
    "jasmine-jk",
    "glass-wine-red",
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
  const SOFT_STANDARD_OPTIONS = {
    "green-tea": { hot: [] },
    "item-1783049181927": { hot: [] },
    "item-1783049172799": { hot: [] },
    "item-1783049320701": { hot: [] },
    cola: { hot: [] },
    "item-1783049570152": { "calpis-mix": [], hot: [] },
  };
  const SOFT_SP_OPTIONS = {
    "item-1783049570152": { "calpis-mix": [], hot: [] },
    "item-1783049580653": { "mango-mix": [] },
  };
  const ALCOHOL_OPTIONS = {
    "item-1783052940322": { "whiskey-mix": ["炭酸", "コーラ", "ジンジャーエール"] },
    "item-1783053519044": { "spirit-mix": ["炭酸"] },
    "item-1783053335099": {
      "cassis-mix": ["炭酸", "オレンジジュース", "烏龍茶", "グレープフルーツジュース"],
    },
    "item-1783053343148": { "peach-mix": ["炭酸", "オレンジジュース", "烏龍茶"] },
    "item-1783053351523": { "malibu-mix": ["コーラ", "炭酸", "マンゴージュース", "牛乳"] },
    amaretto: { "amaretto-mix": ["コーラ", "牛乳", "ジンジャーエール"] },
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
    activationRequestMinutes: 15,
    allDayEndHour: 22,
    allDayEndMinute: 30,
    lastOrderEndHour: 22,
    lastOrderEndMinute: 30,
    planRules: Object.freeze({
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
