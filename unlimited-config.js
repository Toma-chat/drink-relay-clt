(function () {
  "use strict";

  // 商品名や価格はここへ複製せず、既存メニューを参照します。
  // SP商品の確定後は includeItemIds / excludeItemIds の商品IDだけを更新してください。
  window.DRINK_RELAY_UNLIMITED_CONFIG = Object.freeze({
    activationRequestMinutes: 15,
    allDayEndHour: 22,
    allDayEndMinute: 30,
    planRules: Object.freeze({
      "unlimited-soft-2h": { durationMinutes: 120, categories: ["soft"], includeItemIds: [], excludeItemIds: [] },
      "unlimited-soft-sp-2h": { durationMinutes: 120, categories: ["soft"], includeItemIds: [], excludeItemIds: [] },
      "unlimited-alcohol-2h": { durationMinutes: 120, categories: ["soft", "alcohol"], includeItemIds: [], excludeItemIds: [] },
      "unlimited-alcohol-sp-2h": { durationMinutes: 120, categories: ["soft", "alcohol"], includeItemIds: [], excludeItemIds: [] },
      "unlimited-soft-all-day": { durationMinutes: null, categories: ["soft"], includeItemIds: [], excludeItemIds: [] },
      "unlimited-soft-sp-all-day": { durationMinutes: null, categories: ["soft"], includeItemIds: [], excludeItemIds: [] },
      "unlimited-alcohol-all-day": { durationMinutes: null, categories: ["soft", "alcohol"], includeItemIds: [], excludeItemIds: [] },
      "unlimited-alcohol-sp-all-day": { durationMinutes: null, categories: ["soft", "alcohol"], includeItemIds: [], excludeItemIds: [] },
    }),
  });
})();
