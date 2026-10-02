(function () {
  "use strict";

  const STORE_CONFIG = window.DRINK_RELAY_STORE_CONFIG || {};
  const INITIAL_SETTINGS = window.DRINK_RELAY_INITIAL_SETTINGS || {};
  const STORE_INSTANCE_ID = String(STORE_CONFIG.instanceId || "standalone-store")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-") || "standalone-store";
  const STORAGE_PREFIX = `drink-relay-${STORE_INSTANCE_ID}`;
  const ORDER_KEY = `${STORAGE_PREFIX}-orders-v1`;
  const CONFIG_KEY = `${STORAGE_PREFIX}-supabase-v1`;
  const SOUND_KEY = `${STORAGE_PREFIX}-sound-enabled-v1`;
  const SOUND_CHOICE_KEY = `${STORAGE_PREFIX}-sound-choice-v1`;
  const SOUND_CHOICES_KEY = `${STORAGE_PREFIX}-sound-choices-v2`;
  const SOUND_PREVIEWED_KEY = `${STORAGE_PREFIX}-sound-previewed-v1`;
  const MENU_KEY = `${STORAGE_PREFIX}-menu-v2`;
  const OPTION_TEMPLATES_KEY = `${STORAGE_PREFIX}-option-templates-v1`;
  const RECEPTION_MENU_MODE_KEY = `${STORAGE_PREFIX}-reception-menu-mode-v1`;
  const LEGACY_DRINKS_KEY = `${STORAGE_PREFIX}-drinks-v1`;
  const CHANNEL_NAME = `${STORAGE_PREFIX}-local`;
  const SETTINGS_ROW_ID = "main";
  const SOUND_SETTINGS_ROW_ID = "notification-sounds";
  const OPTION_TEMPLATE_SETTINGS_ROW_ID = "option-templates";
  const REQUIRED_MENU_CATEGORY_IDS = ["all-you-can-drink"];
  const CAST_STORAGE_TARGET = "tournament";
  const CAST_STORAGE_SEAT = "__cast__";
  const DEFAULT_SUPABASE_URL = String(STORE_CONFIG.supabaseUrl || "").trim();
  const DEFAULT_SUPABASE_ANON_KEY = String(STORE_CONFIG.supabaseAnonKey || "").trim();
  const MAX_LOCAL_HISTORY = 200;
  const COMPLETED_HISTORY_MS = 60 * 60 * 1000;
  const SOUND_OPTIONS = [
    { id: "news-title", label: "ニュースタイトル表示", url: "./sounds/news-title.mp3" },
    { id: "decision-button", label: "決定ボタン", url: "./sounds/decision-button.mp3" },
    { id: "level-up", label: "レベルアップ", url: "./sounds/level-up.mp3" },
    { id: "bell", label: "ベル（高音）", url: "./sounds/bell-accent16-high.mp3", gain: 1.8 },
    { id: "ramen-stall", label: "ラーメン屋台登場", url: "./sounds/ramen-stall-entrance.mp3" },
    { id: "nurse-call", label: "ナースコール", url: "./sounds/nurse-call.mp3" },
  ];
  const SOUND_CATEGORIES = [
    { id: "soft", label: "ソフドリ" },
    { id: "alcohol", label: "アルコール" },
    { id: "food", label: "フード" },
    { id: "cast", label: "キャスドリ" },
    { id: "unmade10", label: "未作成10分", defaultChoice: "nurse-call" },
  ];
  const TABLES = ["A", "B", "C", "D", "E", "F", "G", "H"];
  const CAST_BAR_TABLE = "バーカウンター";
  const SEATS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
  const DEFAULT_PRICE_SUGGESTIONS = [600, 700, 800, 1000];
  const DEFAULT_SUBCATEGORY_ID = "default";
  const DEFAULT_SUBCATEGORY_LABEL = "未分類";
  const ALCOHOL_SUBCATEGORY_ORDER = [
    "ビール",
    "ウィスキー",
    "サワー",
    "ジン",
    "カクテル",
    "ディタ",
    "ショット",
    "レッドブル割",
    "ラム",
    "焼酎",
    "ウォッカ",
    "サウザテキーラ",
    "オリジナルカクテル",
  ];
  const DEFAULT_OPTION_TEMPLATES = [
    { id: "hot", label: "hot", choices: ["hot"], required: false },
    { id: "ice", label: "氷", choices: ["氷少なめ", "氷なし"], required: false },
    { id: "bottle", label: "瓶", choices: ["瓶のまま"], required: false },
    {
      id: "mix",
      label: "割り方",
      choices: [
        "ソーダ",
        "牛乳",
        "ロック",
        "ストレート",
        "炭酸",
        "水",
        "お湯",
        "コーラ",
        "ジンジャーエール",
        "オレンジジュース",
        "紅茶",
        "烏龍茶",
      ],
      required: false,
    },
    { id: "strength", label: "濃さ", choices: ["濃いめ"], required: false },
    { id: "lemon-lime", label: "レモンライム", choices: ["レモン", "ライム", "なし"], required: false },
    { id: "straw", label: "ストロー", choices: ["ストローあり"], required: false },
  ];
  const DEFAULT_MENU = [
    {
      id: "soft",
      label: "ソフドリ",
      subcategories: [
        { id: "water-tea", label: "水、お茶" },
        { id: "juice", label: "ジュース" },
      ],
      items: [
        { id: "oolong-tea", name: "ウーロン茶", price: 0, subcategory_id: "water-tea", optionGroups: [] },
        { id: "green-tea", name: "緑茶", price: 0, subcategory_id: "water-tea", optionGroups: [] },
        { id: "cola", name: "コーラ", price: 0, subcategory_id: "juice", optionGroups: [{ id: "ice", label: "氷", choices: ["氷なし", "氷少なめ", "氷1個"] }] },
        { id: "ginger-ale", name: "ジンジャーエール", price: 0, subcategory_id: "juice", optionGroups: [{ id: "ice", label: "氷", choices: ["氷なし", "氷少なめ", "氷1個"] }] },
        { id: "orange-juice", name: "オレンジジュース", price: 600, subcategory_id: "juice", optionGroups: [{ id: "ice", label: "氷", choices: ["氷なし", "氷少なめ", "氷1個"] }] },
        {
          id: "iced-coffee",
          name: "アイスコーヒー",
          price: 0,
          subcategory_id: "juice",
          optionGroups: [
            { id: "temperature", label: "Hot/Cold", choices: ["Hot", "ぬるめ", "Cold"] },
            { id: "milk", label: "ミルク", choices: ["ミルクあり", "ミルクなし"] },
            { id: "ice", label: "氷", choices: ["氷なし", "氷少なめ", "氷1個"] },
          ],
        },
      ],
    },
    {
      id: "alcohol",
      label: "アルコール",
      subcategories: [{ id: DEFAULT_SUBCATEGORY_ID, label: DEFAULT_SUBCATEGORY_LABEL }],
      items: [
        { id: "beer", name: "ビール", price: 0, subcategory_id: DEFAULT_SUBCATEGORY_ID, optionGroups: [] },
        { id: "highball", name: "ハイボール", price: 0, subcategory_id: DEFAULT_SUBCATEGORY_ID, optionGroups: [{ id: "strength", label: "濃さ", choices: ["濃いめ", "薄め"] }] },
        { id: "lemon-sour", name: "レモンサワー", price: 0, subcategory_id: DEFAULT_SUBCATEGORY_ID, optionGroups: [{ id: "strength", label: "濃さ", choices: ["濃いめ", "薄め"] }] },
        { id: "cocktail", name: "カクテル", price: 0, subcategory_id: DEFAULT_SUBCATEGORY_ID, optionGroups: [] },
      ],
    },
    {
      id: "food",
      label: "フード",
      subcategories: [{ id: DEFAULT_SUBCATEGORY_ID, label: DEFAULT_SUBCATEGORY_LABEL }],
      items: [
        { id: "potato", name: "ポテト", price: 0, subcategory_id: DEFAULT_SUBCATEGORY_ID, optionGroups: [{ id: "ketchup", label: "ケチャップ", choices: ["ケチャップあり", "ケチャップなし"] }] },
        { id: "karaage", name: "からあげ", price: 0, subcategory_id: DEFAULT_SUBCATEGORY_ID, optionGroups: [] },
        { id: "edamame", name: "枝豆", price: 0, subcategory_id: DEFAULT_SUBCATEGORY_ID, optionGroups: [] },
      ],
    },
    {
      id: "other",
      label: "その他",
      subcategories: [{ id: DEFAULT_SUBCATEGORY_ID, label: DEFAULT_SUBCATEGORY_LABEL }],
      items: [{ id: "other-item", name: "その他", price: 0, subcategory_id: DEFAULT_SUBCATEGORY_ID, optionGroups: [] }],
    },
  ];

  const statusLabels = {
    ordered: "新規",
    making: "作成中",
    made: "作成済み",
    served: "提供済み",
    canceled: "取消",
  };

  const sourceLabels = {
    reception: "受付",
    table: "テーブル",
  };

  const targetLabels = {
    tournament: "トーナメント",
    ring: "リング",
    cast: "キャスドリ",
    bar: "バーカウンター",
  };

  const paymentStatusLabels = {
    paid: "徴収済み",
    uncollected: "未徴収",
  };

  const paymentMethodLabels = {
    cash: "現金",
    card: "カード端末",
    paypay: "PayPay",
    coin: "コイン",
    unknown: "不明",
  };

  const paymentMethodIndicatorLabels = {
    cash: "現金払い",
    card: "カード払い",
    paypay: "PayPay",
    coin: "コイン払い",
    unknown: "不明",
  };

  const paymentMethodVisuals = {
    cash: { type: "emoji", value: "💴" },
    card: {
      type: "group",
      values: [
        { type: "emoji", value: "💳" },
        { type: "image", value: "./assets/payment-id.png" },
        { type: "image", value: "./assets/payment-transit.png" },
      ],
    },
    paypay: { type: "image", value: "./assets/payment-paypay.png" },
    coin: { type: "image", value: "./assets/payment-coin.png" },
    unknown: { type: "icon", value: "circle-help" },
  };

  const state = {
    view: "reception",
    filter: "open",
    orders: [],
    knownIds: new Set(),
    overdueUnmadeNotifiedIds: new Set(),
    supabase: null,
    realtimeChannel: null,
    broadcast: null,
    syncMode: "local",
    sharedSettingsLoaded: false,
    soundEnabled: readSoundSetting(),
    soundChoices: readSoundChoices(),
    soundPreviewed: false,
    soundCategory: SOUND_CATEGORIES[0].id,
    menu: readMenuSettings(),
    optionTemplates: readOptionTemplates(),
    receptionMenuMode: readReceptionMenuMode(),
    carts: {
      reception: [],
      table: [],
    },
    pendingConfirmation: null,
    editingOrderId: "",
    activeSheet: null,
    audioContext: null,
    notificationAudios: new Map(),
    notificationAudioUnavailable: new Set(),
    notificationBuffers: new Map(),
    notificationBufferPromises: new Map(),
    notificationWarmTimer: null,
    sendStatusTimer: null,
    audioUnlockPromise: null,
    soundSavePromise: Promise.resolve(false),
    iconRefreshTimer: null,
    pendingServeTimers: new Map(),
    configSnapshot: "",
    configSection: "drinks",
    configActiveCategoryId: "",
    configDraftMenu: null,
    configDraftOptionTemplates: null,
    booted: false,
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    const storeName = String(STORE_CONFIG.storeName || "").trim();
    if (storeName) document.title = `${storeName} | Drink Relay`;
    localStorage.removeItem(SOUND_PREVIEWED_KEY);
    setupTabs();
    setupChoiceButtons();
    setupNestedScrollChaining();
    renderMenuPickers();
    setupForms();
    setupControls();
    setupReceptionModeMenu();
    updateHeaderViewLabel();
    window.addEventListener("resize", () => {
      $$('[data-drink-picker].custom-menu-picker').forEach(scheduleCustomMenuNameFit);
    });
    setupLocalChannel();
    setupAudioUnlock();
    await configureSupabaseFromStorage();
    await loadSharedSettings();
    await loadOrders();
    state.orders.forEach((order) => state.knownIds.add(order.id));
    state.booted = true;
    render();
    setInterval(render, 15000);
    if (window.lucide) window.lucide.createIcons();
  }

  function setupTabs() {
    $("#headerReceptionButton")?.addEventListener("click", () => {
      switchView("reception");
    });
    $("#headerBarButton")?.addEventListener("click", () => {
      switchView("bar");
    });
    $$(".tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        switchView(tab.dataset.view);
      });
    });
  }

  function switchView(viewName) {
    state.view = viewName;
    if (viewName === "bar" && state.soundEnabled) {
      unlockAudio();
    }
    $$("#headerReceptionButton, #headerBarButton").forEach((button) => {
      const isReceptionButton = button.id === "headerReceptionButton";
      const active = (isReceptionButton && viewName === "reception") || (!isReceptionButton && viewName === "bar");
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    $$(".tab").forEach((item) => {
      const active = item.dataset.view === viewName;
      item.classList.toggle("active", active);
      if (active) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    });
    $$(".view").forEach((view) => {
      view.classList.toggle("active", view.id === `view-${state.view}`);
    });
    updateHeaderViewLabel();
    render();
  }

  function updateHeaderViewLabel() {
    const modeButton = $("#receptionModeButton");
    const modeMenu = $("#receptionModeMenu");
    $("#currentViewLabel").textContent = receptionModeLabel();
    if (modeButton) modeButton.hidden = false;
    $$("#receptionModeMenu [data-reception-mode]").forEach((button) => {
      button.classList.toggle("active", button.dataset.receptionMode === state.receptionMenuMode);
    });
    if (state.view !== "reception" && modeMenu) {
      modeMenu.hidden = true;
      modeButton?.setAttribute("aria-expanded", "false");
    }
  }

  function receptionModeLabel() {
    return state.receptionMenuMode === "custom" ? "受付（カスタム）" : "受付（通常）";
  }

  function setupForms() {
    $$(".order-form").forEach((form) => {
      form.addEventListener("change", () => {
        updateCustomDrinkField(form);
        updateConfirmButtonState(form);
      });
      updateCustomDrinkField(form);
      updateConfirmButtonState(form);
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const draft = readCartDraft(form);
        if (!draft) return;
        openConfirm(form, draft);
      });
    });
  }

  function setupChoiceButtons() {
    $$(".order-form").forEach((form) => {
      form.addEventListener("click", (event) => {
        const subcategoryButton = event.target.closest("[data-menu-subcategory]");
        if (subcategoryButton && form.contains(subcategoryButton)) {
          const picker = subcategoryButton.closest("[data-drink-picker]");
          const categoryId = subcategoryButton.dataset.menuSubcategoryCategory;
          picker.dataset.activeCategory = categoryId;
          updateMenuCategoryActive(picker, categoryId);
          scheduleCustomMenuNameFit(picker);
          updateMenuSubcategoryActive(picker, subcategoryButton.dataset.menuSubcategory);
          scrollToMenuSubcategory(picker, subcategoryButton.dataset.menuSubcategory);
          return;
        }

        const categoryButton = event.target.closest("[data-menu-category]");
        if (categoryButton && form.contains(categoryButton)) {
          const picker = categoryButton.closest("[data-drink-picker]");
          const categoryId = categoryButton.dataset.menuCategory;
          picker.dataset.activeCategory = categoryId;
          updateMenuCategoryActive(picker, categoryId);
          const firstSubcategory = $$("[data-menu-subcategory]", picker)
            .find((button) => button.dataset.menuSubcategoryCategory === categoryId);
          if (firstSubcategory) {
            updateMenuSubcategoryActive(picker, firstSubcategory.dataset.menuSubcategory);
            scrollToMenuSubcategory(picker, firstSubcategory.dataset.menuSubcategory);
          } else {
            scrollToMenuSection(picker, categoryId);
          }
          return;
        }

        const button = event.target.closest("[data-choice-value]");
        if (!button || !form.contains(button) || button.disabled) return;
        const drinkPicker = button.closest("[data-drink-picker]");

        if (drinkPicker) {
          const categoryId = button.dataset.menuCategoryId;
          const item = findMenuItem(categoryId, button.dataset.menuItemId);
          if (item) setDrinkSelection(form, categoryId, item);
          return;
        }
      });
    });
  }

  function setupNestedScrollChaining() {
    const mainScroller = $("main");
    if (!mainScroller) return;

    mainScroller.addEventListener("wheel", (event) => {
      const menuScroller = event.target.closest(".menu-item-grid");
      if (!menuScroller || !mainScroller.contains(menuScroller) || event.ctrlKey || !event.deltaY) return;

      const atTop = menuScroller.scrollTop <= 1;
      const atBottom = menuScroller.scrollTop + menuScroller.clientHeight >= menuScroller.scrollHeight - 1;
      if ((event.deltaY < 0 && !atTop) || (event.deltaY > 0 && !atBottom)) return;

      const multiplier = event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? mainScroller.clientHeight
          : 1;
      event.preventDefault();
      mainScroller.scrollTop += event.deltaY * multiplier;
    }, { passive: false });
  }

  function setupControls() {
    renderPaymentMethodPickers();
    $("#soundToggle").addEventListener("click", async () => {
      state.soundEnabled = !state.soundEnabled;
      saveSoundSetting();
      updateSoundButton();
      if (state.soundEnabled) {
        await unlockAudio();
        playChime();
        toast("通知音を有効にしました");
      } else {
        toast("通知音を無効にしました");
      }
    });
    $(".sound-category-list").addEventListener("change", async (event) => {
      const choice = event.target.closest("[data-sound-choice]");
      if (!choice) return;
      const categoryId = choice.dataset.soundChoice;
      state.soundChoices[categoryId] = normalizeSoundChoice(choice.value);
      saveSoundChoices();
      if (state.soundEnabled) {
        unlockAudio().then(() => warmNotificationBuffer(state.soundChoices[categoryId]));
      }
      if (state.syncMode === "supabase" && state.supabase) {
        const saved = await queueSharedSoundSettingsSave();
        if (saved) toast("通知音を全端末に反映しました");
      } else {
        toast("効果音を変更しました");
      }
    });
    $(".sound-category-list").addEventListener("click", (event) => {
      const button = event.target.closest("[data-sound-preview]");
      if (button) previewNotificationSound(state.soundChoices[button.dataset.soundPreview]);
    });
    $("#headerSoundPreviewButton").addEventListener("click", handleHeaderSoundPreview);
    updateHeaderSoundPreviewButton();

    $("#configButton")?.addEventListener("click", () => {
      openConfig();
    });
    $("#headerConfigButton").addEventListener("click", () => {
      openConfig();
    });
    $("#configDialog form").addEventListener("submit", (event) => event.preventDefault());
    $(".config-section-tabs").addEventListener("click", (event) => {
      const button = event.target.closest("[data-config-section]");
      if (button) selectConfigSection(button.dataset.configSection);
    });
    $("#configDialog").addEventListener("keydown", handleConfigKeydown);
    $("#configCloseButton").addEventListener("click", requestCloseConfig);
    $("#configPromptCancel").addEventListener("click", hideConfigUnsavedPrompt);
    $("#configPromptSave").addEventListener("click", saveConfig);
    $("#configDialog").addEventListener("cancel", (event) => {
      if (!configHasUnsavedChanges()) return;
      event.preventDefault();
      showConfigUnsavedPrompt();
    });
    $("#saveConfig").addEventListener("click", saveConfig);
    $("#clearConfig").addEventListener("click", clearConfig);
    $("#addMenuCategory").addEventListener("click", addMenuEditorCategory);
    $("#menuEditor").addEventListener("click", (event) => {
      const removeCategory = event.target.closest("[data-remove-menu-category]");
      const addItem = event.target.closest("[data-add-menu-item]");
      const editItem = event.target.closest("[data-edit-menu-item]");
      const removeItem = event.target.closest("[data-remove-menu-item]");
      const addSubcategory = event.target.closest("[data-add-menu-subcategory]");
      const removeSubcategory = event.target.closest("[data-remove-menu-subcategory]");
      const addOptionGroup = event.target.closest("[data-add-menu-option-group]");
      const addOptionTemplate = event.target.closest("[data-add-option-template]");
      const createOptionTemplate = event.target.closest("[data-create-option-template]");
      const editOptionTemplate = event.target.closest("[data-edit-option-template]");
      const saveOptionTemplate = event.target.closest("[data-save-option-template]");
      const deleteOptionTemplate = event.target.closest("[data-delete-option-template]");
      const cancelOptionTemplateEditor = event.target.closest("[data-cancel-option-template-editor]");
      const addOptionTemplateChoice = event.target.closest("[data-add-option-template-choice]");
      const removeOptionTemplateChoice = event.target.closest("[data-remove-option-template-choice]");
      const editOptionGroup = event.target.closest("[data-edit-menu-option-group]");
      const applyOptionTemplate = event.target.closest("[data-apply-option-template]");
      const cancelOptionTemplate = event.target.closest("[data-cancel-option-template]");
      const selectAllTemplateChoices = event.target.closest("[data-template-select-all]");
      const clearTemplateChoices = event.target.closest("[data-template-clear]");
      const removeOptionGroup = event.target.closest("[data-remove-menu-option-group]");
      const addOptionChoice = event.target.closest("[data-add-menu-option-choice]");
      const removeOptionChoice = event.target.closest("[data-remove-menu-option-choice]");
      const categoryTab = event.target.closest("[data-config-category-tab]");

      if (categoryTab) {
        selectMenuEditorCategory(categoryTab.dataset.configCategoryTab);
        return;
      }

      let refreshCategoryTabs = false;

      if (removeCategory) {
        const category = removeCategory.closest("[data-menu-editor-category]");
        const categoryId = menuEditorCategoryIdFromBlock(category);
        state.configDraftMenu = configEditorMenu().filter((item) => item.id !== categoryId);
        category?.remove();
        refreshCategoryTabs = true;
      }

      if (addSubcategory) {
        addMenuEditorSubcategory(addSubcategory.closest("[data-menu-editor-category]"));
      }

      if (removeSubcategory) {
        removeMenuEditorSubcategory(removeSubcategory.closest("[data-menu-editor-subcategory]"));
      }

      if (addItem) {
        const category = addItem.closest("[data-menu-editor-category]");
        const subcategory = addItem.closest("[data-menu-editor-subcategory]") || $("[data-menu-editor-subcategory]", category);
        const subcategoryId = subcategoryIdFromEditorRow(subcategory) || DEFAULT_SUBCATEGORY_ID;
        closeOtherMenuEditorItems(null);
        $("[data-menu-editor-items]", subcategory || category).insertAdjacentHTML(
          "beforeend",
          menuEditorItemBlock(
            {
              id: `item-${Date.now()}`,
              name: "",
              subcategory_id: subcategoryId,
              optionGroups: [],
            },
            { open: true, subcategoryId }
          )
        );
        refreshCategoryTabs = true;
      }

      if (editItem) {
        const item = editItem.closest("[data-menu-editor-item]");
        const isOpen = !item.classList.contains("open");
        if (isOpen) closeOtherMenuEditorItems(item);
        setMenuEditorItemOpen(item, isOpen);
      }

      if (removeItem) {
        removeItem.closest("[data-menu-editor-item]")?.remove();
        refreshCategoryTabs = true;
      }

      if (addOptionGroup) {
        const item = addOptionGroup.closest("[data-menu-editor-item]");
        showOptionTemplateEditor(item);
      }

      if (addOptionTemplate) {
        const item = addOptionTemplate.closest("[data-menu-editor-item]");
        closeOtherMenuEditorItems(item);
        setMenuEditorItemOpen(item, true);
        const template = configEditorOptionTemplates().find(
          (option) => option.id === addOptionTemplate.dataset.addOptionTemplate
        );
        addOptionTemplateToEditorItem(item, template?.id, template?.choices || []);
      }

      if (createOptionTemplate) {
        showOptionTemplateEditor(createOptionTemplate.closest("[data-menu-editor-item]"));
      }

      if (editOptionTemplate) {
        showOptionTemplateEditor(
          editOptionTemplate.closest("[data-menu-editor-item]"),
          editOptionTemplate.dataset.editOptionTemplate
        );
      }

      if (addOptionTemplateChoice) {
        const editor = addOptionTemplateChoice.closest("[data-option-template-editor]");
        $("[data-option-template-editor-choices]", editor).insertAdjacentHTML(
          "beforeend",
          optionTemplateEditorChoiceBlock("")
        );
      }

      if (removeOptionTemplateChoice) {
        removeOptionTemplateChoice.closest("[data-option-template-editor-choice]")?.remove();
      }

      if (saveOptionTemplate) {
        saveOptionTemplateEditor(saveOptionTemplate.closest("[data-menu-editor-item]"));
      }

      if (deleteOptionTemplate) {
        deleteOptionTemplateFromEditor(
          deleteOptionTemplate.closest("[data-menu-editor-item]"),
          deleteOptionTemplate.dataset.deleteOptionTemplate
        );
      }

      if (cancelOptionTemplateEditor) {
        closeOptionTemplateEditor(cancelOptionTemplateEditor.closest("[data-menu-editor-item]"));
      }

      if (selectAllTemplateChoices) {
        $$("[data-option-template-choice]", selectAllTemplateChoices.closest("[data-option-template-picker]")).forEach(
          (input) => {
            input.checked = true;
          }
        );
      }

      if (clearTemplateChoices) {
        $$("[data-option-template-choice]", clearTemplateChoices.closest("[data-option-template-picker]")).forEach(
          (input) => {
            input.checked = false;
          }
        );
      }

      if (cancelOptionTemplate) {
        closeOptionTemplatePicker(cancelOptionTemplate.closest("[data-menu-editor-item]"));
      }

      if (applyOptionTemplate) {
        const picker = applyOptionTemplate.closest("[data-option-template-picker]");
        const choices = $$("[data-option-template-choice]:checked", picker).map((input) => input.value);
        addOptionTemplateToEditorItem(
          applyOptionTemplate.closest("[data-menu-editor-item]"),
          applyOptionTemplate.dataset.applyOptionTemplate,
          choices
        );
      }

      if (removeOptionGroup) {
        removeOptionGroup.closest("[data-menu-editor-option-group]")?.remove();
      }

      if (editOptionGroup) {
        const group = editOptionGroup.closest("[data-menu-editor-option-group]");
        const open = !group.classList.contains("open");
        $$('[data-menu-editor-option-group].open', group.parentElement).forEach((row) => {
          if (row !== group) setMenuEditorOptionGroupOpen(row, false);
        });
        setMenuEditorOptionGroupOpen(group, open);
      }

      if (addOptionChoice) {
        const group = addOptionChoice.closest("[data-menu-editor-option-group]");
        $("[data-menu-editor-option-choices]", group).insertAdjacentHTML("beforeend", menuEditorOptionChoiceBlock(""));
      }

      if (removeOptionChoice) {
        removeOptionChoice.closest("[data-menu-editor-option-choice]")?.remove();
      }

      if (!configEditorMenu().length) {
        addMenuEditorCategory();
        return;
      }

      if (refreshCategoryTabs) {
        refreshMenuEditorCategoryTabs();
      }

      scheduleIconRefresh();
    });
    $("#menuEditor").addEventListener("input", (event) => {
      const input = event.target.closest?.("[data-menu-item-price]");
      if (event.target.closest?.("[data-menu-label]")) refreshMenuEditorCategoryTabs();
      const subcategoryInput = event.target.closest?.("[data-menu-subcategory-label]");
      if (subcategoryInput) {
        refreshItemSubcategoryOptions(subcategoryInput.closest("[data-menu-editor-category]"));
      }
    });
    $("#menuEditor").addEventListener("focusin", (event) => {
      const categoryInput = event.target.closest?.("[data-menu-label], [data-menu-subcategory-label]");
      if (categoryInput) {
        closeOtherMenuEditorItems(null);
        closeOtherOptionTemplatePickers(null);
        return;
      }

      const input = event.target.closest?.("[data-menu-item-name]");
      if (input) {
        const item = input.closest("[data-menu-editor-item]");
        closeOtherMenuEditorItems(item);
        closeOtherOptionTemplatePickers(item);
        moveCaretToEnd(input);
      }
    });
    $("#menuEditor").addEventListener("pointerup", (event) => {
      const input = event.target.closest?.("[data-menu-item-name]");
      if (input) moveCaretToEnd(input);
    });
    $("#menuEditor").addEventListener("pointerdown", handleMenuEditorPointerDown);
    $("#menuEditor").addEventListener("keydown", handleMenuEditorKeydown);
    $("#menuEditor").addEventListener("wheel", handleMenuEditorWheel, { passive: false });
    $("#alcoholManualEditor").addEventListener("input", handleAlcoholManualInput);
    $("#backToOrder").addEventListener("click", closeConfirm);
    $("#sendConfirmedOrder").addEventListener("click", sendConfirmedOrders);
    $("#confirmLocation").addEventListener("click", handleConfirmChoice);
    $("#confirmItems").addEventListener("click", handleConfirmChoice);
    $("#confirmDialog").addEventListener("close", () => {
      const shouldRefreshMenu = Boolean(state.pendingConfirmation);
      persistConfirmSelections();
      state.pendingConfirmation = null;
      if (shouldRefreshMenu) renderMenuPickers();
    });
    $$("input[name='confirmPaymentStatus']").forEach((input) => {
      input.addEventListener("change", () => {
        if (input.checked) clearPaymentMethodValue("confirmPaymentMethod");
      });
    });
    $("#orderEditClose").addEventListener("click", closeOrderEdit);
    $("#orderEditCancel").addEventListener("click", closeOrderEdit);
    $("#deleteOrderEdit").addEventListener("click", deleteOrderEdit);
    $("#saveOrderEdit").addEventListener("click", saveOrderEdit);
    $("#orderEditLocation").addEventListener("click", handleOrderEditChoice);
    $$("input[name='editTarget']").forEach((input) => {
      input.addEventListener("change", updateOrderEditTargetVisibility);
    });
    $$("input[name='editPaymentStatus']").forEach((input) => {
      input.addEventListener("change", () => {
        if (input.checked) clearPaymentMethodValue("orderEditPaymentMethod");
      });
    });
    $("#orderEditDialog").addEventListener("close", () => {
      state.editingOrderId = "";
    });
    $("#itemSheetLayer").addEventListener("click", (event) => {
      if (event.target.closest("[data-sheet-close]")) closeItemSheet();
    });
    $("#itemSheetClose").addEventListener("click", closeItemSheet);
    $("#quantityMinus").addEventListener("click", () => setSheetQuantity(sheetQuantity() - 1));
    $("#quantityPlus").addEventListener("click", () => setSheetQuantity(sheetQuantity() + 1));
    $("#itemSheetOptions").addEventListener("change", () => {
      syncSheetToForm();
      updateSheetConfirmState();
    });
    $("#itemSheetConfirm").addEventListener("click", () => {
      const form = state.activeSheet?.form;
      if (!form) return;
      if (!updateSheetConfirmState()) return;
      addActiveSheetToCart(form);
    });

    $$(".filter").forEach((button) => {
      button.addEventListener("click", () => {
        state.filter = button.dataset.filter;
        $$(".filter").forEach((item) => item.classList.toggle("active", item === button));
        renderBar();
      });
    });

    $$("[data-action='refresh']").forEach((button) => {
      button.addEventListener("click", async () => {
        await loadOrders();
        render();
        toast("更新しました");
      });
    });

    $("#barOrders").addEventListener("click", handleOrderAction);
    $("#barOrders").addEventListener("keydown", handleOrderKeydown);
    $("#alcoholManualClose").addEventListener("click", closeAlcoholManual);
    document.addEventListener("pointerdown", (event) => {
      const dialog = $("#alcoholManualDialog");
      if (!dialog.open || dialog.contains(event.target) || event.target.closest?.("[data-order-manual]")) return;
      closeAlcoholManual();
    }, true);
  }

  async function previewNotificationSound(choiceId = state.soundChoices[state.soundCategory]) {
    const normalizedChoice = normalizeSoundChoice(choiceId);
    const playback = playNotificationAudioFromGesture(normalizedChoice);
    const audioUnlock = unlockAudio(normalizedChoice);
    const played = await playback;
    if (played) {
      audioUnlock.then(() => warmNotificationBuffer(normalizedChoice));
      scheduleNotificationWarmup(1400);
      return true;
    }
    await audioUnlock;
    if (state.audioContext?.state === "running") {
      playFallbackBell();
      return true;
    }
    return false;
  }

  async function enableNotificationSoundAndPreview() {
    if (!state.soundEnabled) {
      state.soundEnabled = true;
      saveSoundSetting();
      updateSoundButton();
    }
    return previewNotificationSound();
  }

  async function handleHeaderSoundPreview(event) {
    const button = event.currentTarget;
    if (button.classList.contains("is-previewing")) return;
    button.classList.add("is-previewing");
    button.setAttribute("aria-busy", "true");

    try {
      const played = await enableNotificationSoundAndPreview();
      state.soundPreviewed = played;
      localStorage.removeItem(SOUND_PREVIEWED_KEY);
      if (!played) {
        toast("通知音を再生できませんでした。もう一度押してください");
      }
    } finally {
      button.classList.remove("is-previewing");
      button.removeAttribute("aria-busy");
      updateHeaderSoundPreviewButton();
    }
  }

  function updateHeaderSoundPreviewButton() {
    const button = $("#headerSoundPreviewButton");
    if (!button) return;
    button.classList.toggle("is-previewed", state.soundPreviewed);
    button.classList.toggle("is-unpreviewed", !state.soundPreviewed);
    const label = state.soundPreviewed ? "通知音を試聴済み" : "通知音が未試聴です。一度押してください";
    button.setAttribute("aria-label", label);
    button.title = label;
  }

  function setupReceptionModeMenu() {
    const button = $("#receptionModeButton");
    const menu = $("#receptionModeMenu");
    if (!button || !menu) return;

    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const nextOpen = menu.hidden;
      menu.hidden = !nextOpen;
      button.setAttribute("aria-expanded", String(nextOpen));
    });

    menu.addEventListener("click", (event) => {
      const modeButton = event.target.closest("[data-reception-mode]");
      if (!modeButton) return;
      state.receptionMenuMode = modeButton.dataset.receptionMode === "custom" ? "custom" : "normal";
      localStorage.setItem(RECEPTION_MENU_MODE_KEY, state.receptionMenuMode);
      menu.hidden = true;
      button.setAttribute("aria-expanded", "false");
      if (state.view !== "reception") switchView("reception");
      else updateHeaderViewLabel();
      renderMenuPickers();
    });

    document.addEventListener("click", (event) => {
      if (menu.hidden || event.target.closest(".view-title-wrap")) return;
      menu.hidden = true;
      button.setAttribute("aria-expanded", "false");
    });
  }

  function handleConfigKeydown(event) {
    if (event.key !== "Enter") return;
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (["button", "checkbox", "radio", "reset", "submit"].includes(target.type)) return;
    event.preventDefault();
  }

  function handleMenuEditorPointerDown(event) {
    const input = event.target.closest?.("[data-menu-item-price]");
    if (!input) return;
    const rect = input.getBoundingClientRect();
    const spinZoneWidth = 30;
    if (event.clientX < rect.right - spinZoneWidth) return;
    event.preventDefault();
    input.focus();
    const direction = event.clientY < rect.top + rect.height / 2 ? 1 : -1;
    stepPriceSuggestion(input, direction);
  }

  function handleMenuEditorKeydown(event) {
    const input = event.target.closest?.("[data-menu-item-price]");
    if (!input || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    stepPriceSuggestion(input, event.key === "ArrowUp" ? 1 : -1);
  }

  function handleMenuEditorWheel(event) {
    const input = event.target.closest?.("[data-menu-item-price]");
    if (!input || document.activeElement !== input) return;
    event.preventDefault();
    stepPriceSuggestion(input, event.deltaY < 0 ? 1 : -1);
  }

  function moveCaretToEnd(input) {
    requestAnimationFrame(() => {
      const end = input.value.length;
      input.setSelectionRange(end, end);
    });
  }

  function setupLocalChannel() {
    if ("BroadcastChannel" in window) {
      state.broadcast = new BroadcastChannel(CHANNEL_NAME);
      state.broadcast.addEventListener("message", (event) => {
        if (event.data?.type === "orders-changed" && state.syncMode === "local") {
          loadLocalOrders();
          detectNewOrders();
          render();
        }
      });
    }

    window.addEventListener("storage", (event) => {
      if (event.key === ORDER_KEY && state.syncMode === "local") {
        loadLocalOrders();
        detectNewOrders();
        render();
      }
    });
  }

  function readCurrentDrinkDraft(form) {
    const data = new FormData(form);
    const selectedDrink = String(data.get("drinkName") || "").trim();
    const drinkName = selectedDrink;
    const selectedCategoryId = String(data.get("drinkCategoryId") || "");
    const selectedItemId = String(data.get("drinkItemId") || "");
    const selectedMenuItem = findMenuItem(selectedCategoryId, selectedItemId);
    const target = String(data.get("target") || "ring");
    const quantity = Math.max(1, Math.min(20, Number(data.get("quantity") || 1)));
    const selectedOptions = $$("input[name='drinkOptions']", form)
      .filter((input) => input.type === "hidden" || input.checked)
      .map((input) => input.value);

    if (!selectedDrink) {
      toast("商品を選択してください");
      return null;
    }

    return {
      id: crypto.randomUUID(),
      source: form.dataset.source,
      target,
      drink_name: drinkName,
      price: selectedMenuItem?.price || 0,
      selected_options: selectedOptions,
      quantity,
      locations: [],
      menu_category_id: selectedCategoryId,
      menu_item_id: selectedItemId,
    };
  }

  function readCartDraft(form) {
    const source = form.dataset.source;
    const cart = state.carts[source] || [];
    if (!cart.length) {
      toast("商品を選択してください");
      return null;
    }

    return {
      source,
      items: cart.map(cloneCartItem),
    };
  }

  function addActiveSheetToCart(form) {
    syncSheetToForm();
    const item = readCurrentDrinkDraft(form);
    if (!item) return;
    const source = form.dataset.source;
    if (!state.carts[source]) state.carts[source] = [];
    state.carts[source].push(item);
    closeItemSheet();
    clearDrinkSelection(form);
    renderMenuPickers();
    updateConfirmButtonState(form);
  }

  function cloneCartItem(item) {
    return {
      ...item,
      selected_options: [...(item.selected_options || [])],
      locations: (item.locations || []).map(normalizeLocation),
    };
  }

  function cartItemCount(source) {
    return (state.carts[source] || []).reduce((sum, item) => sum + Number(item.quantity || 1), 0);
  }

  function cartQuantityForMenuItem(source, categoryId, menuItem) {
    return (state.carts[source] || []).reduce((sum, item) => {
      const sameItemId = item.menu_item_id && item.menu_item_id === menuItem.id;
      const categoryMatches = !item.menu_category_id || item.menu_category_id === categoryId;
      const legacyNameMatch = !item.menu_item_id && item.drink_name === menuItem.name;
      if ((sameItemId && categoryMatches) || legacyNameMatch) {
        return sum + Number(item.quantity || 1);
      }
      return sum;
    }, 0);
  }

  function openConfirm(form, draft) {
    state.pendingConfirmation = { form, draft };
    renderConfirm(draft);
    $("#sendConfirmedOrder").disabled = false;
    $("#confirmDialog").showModal();
    scheduleIconRefresh();
  }

  function closeConfirm() {
    persistConfirmSelections();
    if ($("#confirmDialog").open) {
      $("#confirmDialog").close();
    } else {
      const shouldRefreshMenu = Boolean(state.pendingConfirmation);
      state.pendingConfirmation = null;
      if (shouldRefreshMenu) renderMenuPickers();
    }
  }

  function renderConfirm(draft) {
    renderConfirmContents(draft, {}, false);
  }

  function renderConfirmContents(draft, preservedSelections = {}, preservePayment = true) {
    $("#confirmSummary").innerHTML = "";
    $("#confirmSummary").hidden = true;

    if (!preservePayment) setConfirmPaymentDefaults(draft);
    const deliveryItem = draft.items.find((item) => targetNeedsLocation(item.target));
    const hasDelivery = Boolean(deliveryItem);
    const hasSeatSelection = draft.items.some((item) => targetAllowsSeat(item.target));
    const location = confirmOrderLocation(draft, preservedSelections);
    const locationBlock = hasDelivery
      ? confirmOrderLocationBlock(location, hasSeatSelection, deliveryItem.target)
      : "";
    const itemBlocks = draft.items
      .map((item, index) => confirmItemBlock(item, index, draft.items.length))
      .join("");
    $("#confirmLocation").innerHTML = locationBlock;
    $("#confirmItems").innerHTML = itemBlocks;
    scheduleIconRefresh();
  }

  function setConfirmPaymentDefaults(draft) {
    const defaultStatus = draft.source === "reception" ? "paid" : "uncollected";
    const paidInput = $("input[name='confirmPaymentStatus'][value='paid']");
    if (paidInput) paidInput.checked = defaultStatus === "paid";
    if (defaultStatus === "uncollected") setPaymentMethodValue("confirmPaymentMethod", "cash");
    else clearPaymentMethodValue("confirmPaymentMethod");
  }

  function confirmPaymentStatus() {
    return $("input[name='confirmPaymentStatus'][value='paid']")?.checked ? "paid" : "uncollected";
  }

  function expandCartItems(items) {
    return items.flatMap((item) =>
      Array.from({ length: Number(item.quantity || 1) }, (_, index) => ({
        ...item,
        row_id: `${item.id}-${index}`,
        selected_options: [...(item.selected_options || [])],
      }))
    );
  }

  function confirmOrderLocation(draft, preservedSelections = {}) {
    if (preservedSelections.order) return normalizeLocation(preservedSelections.order);
    const deliveryItem = draft.items.find((item) => targetNeedsLocation(item.target));
    return normalizeLocation(deliveryItem?.locations?.[0]);
  }

  function confirmOrderLocationBlock(location, hasSeatSelection, target = "ring") {
    return `
      <section class="confirm-order-location" data-confirm-order-location>
        <h3>お届け先</h3>
        <div class="confirm-location-grid">
          ${confirmChoiceGroup("order", "tableNo", "テーブル", tablesForTarget(target), location.tableNo)}
          ${hasSeatSelection ? confirmChoiceGroup("order", "seatNo", "席番号", SEATS, location.seatNo, !location.tableNo) : ""}
        </div>
      </section>
    `;
  }

  function confirmItemBlock(item, index, total) {
    const label = total > 1 ? `${index + 1}件目` : "1件目";
    const target = item.target || "ring";
    const quantity = Math.max(1, Math.min(20, Number(item.quantity || 1)));
    const options = item.selected_options.length
      ? `<div class="confirm-options">${escapeHtml(item.selected_options.join(" / "))}</div>`
      : "";
    return `
      <section class="confirm-item" data-confirm-cart-id="${escapeHtml(item.id)}">
        <div class="confirm-item-head">
          <div class="confirm-item-title">
            <div class="confirm-title-row">
              <h3>${escapeHtml(label)} ${escapeHtml(item.drink_name)}</h3>
              <span class="confirm-target-label">${escapeHtml(barTargetLabel(item))}</span>
            </div>
            ${options}
          </div>
          <div class="confirm-item-tools">
            <div class="confirm-quantity-stepper" aria-label="杯数">
              <button class="confirm-qty-button" type="button" data-confirm-qty-action="decrease" data-confirm-cart-id="${escapeHtml(item.id)}" aria-label="${quantity <= 1 ? "商品を削除" : "杯数を減らす"}">
                <i data-lucide="minus" aria-hidden="true"></i>
              </button>
              <span>${escapeHtml(String(quantity))}杯</span>
              <button class="confirm-qty-button" type="button" data-confirm-qty-action="increase" data-confirm-cart-id="${escapeHtml(item.id)}" aria-label="杯数を増やす" ${quantity >= 20 ? "disabled" : ""}>
                <i data-lucide="plus" aria-hidden="true"></i>
              </button>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function confirmChoiceGroup(rowId, type, label, values, selectedValue = "", hiddenGroup = false) {
    const hidden = hiddenGroup ? " hidden" : "";
    return `
      <fieldset class="control-group choice-panel confirm-choice-panel" data-confirm-choice-group="${type}"${hidden}>
        <legend>${escapeHtml(label)}</legend>
        <div class="choice-grid ${type === "tableNo" ? "table-choice-grid" : "seat-choice-grid"}">
          ${values.map((value) => `
            <button class="choice-button ${value === CAST_BAR_TABLE ? "choice-button-wide" : ""} ${value === selectedValue ? "active" : ""}" type="button" data-confirm-row-id="${escapeHtml(rowId)}" data-confirm-choice="${type}" data-choice-value="${escapeHtml(value)}">
              ${escapeHtml(value)}
            </button>
          `).join("")}
        </div>
      </fieldset>
    `;
  }

  function handleConfirmChoice(event) {
    const quantityButton = event.target.closest("[data-confirm-qty-action]");
    if (quantityButton) {
      handleConfirmQuantityChange(quantityButton);
      return;
    }

    const button = event.target.closest("[data-confirm-choice]");
    if (!button) return;
    const group = button.closest("[data-confirm-choice-group]");
    const wasActive = button.classList.contains("active");
    $$(".choice-button", group).forEach((item) => item.classList.remove("active"));
    if (!wasActive) button.classList.add("active");
    if (button.dataset.confirmChoice === "tableNo") updateConfirmSeatChoices(button);
    persistConfirmOrderLocation(button.closest("[data-confirm-order-location]"));
  }

  function updateConfirmSeatChoices(tableButton) {
    const block = tableButton.closest("[data-confirm-order-location]");
    const seatGroup = $("[data-confirm-choice-group='seatNo']", block);
    if (!seatGroup) return;
    const hasTable = Boolean($("[data-confirm-choice='tableNo'].active", block));
    seatGroup.hidden = !hasTable;
    if (!hasTable) {
      $$("[data-confirm-choice='seatNo']", seatGroup).forEach((button) => button.classList.remove("active"));
    }
  }

  function handleConfirmQuantityChange(button) {
    if (button.disabled) return;
    const pending = state.pendingConfirmation;
    if (!pending) return;
    const cartId = button.dataset.confirmCartId;
    const item = pending.draft.items.find((entry) => entry.id === cartId);
    if (!item) return;
    const current = Number(item.quantity || 1);
    const delta = button.dataset.confirmQtyAction === "increase" ? 1 : -1;
    if (delta < 0 && current <= 1) {
      removeConfirmCartItem(cartId);
      return;
    }
    const nextQuantity = Math.max(1, Math.min(20, current + delta));
    if (nextQuantity === current) return;
    const selections = persistConfirmSelections();
    item.quantity = nextQuantity;
    item.locations = locationsForItem(item, nextQuantity, selections);
    syncLiveCartItem(pending.draft.source, cartId, { quantity: nextQuantity, locations: item.locations });
    updateConfirmButtonState(pending.form);
    renderConfirmContents(pending.draft, selections, true);
  }

  function removeConfirmCartItem(cartId) {
    const pending = state.pendingConfirmation;
    if (!pending) return;
    const selections = persistConfirmSelections();
    pending.draft.items = pending.draft.items.filter((item) => item.id !== cartId);
    state.carts[pending.draft.source] = (state.carts[pending.draft.source] || []).filter((item) => item.id !== cartId);
    updateConfirmButtonState(pending.form);
    if (!pending.draft.items.length) {
      closeConfirm();
      return;
    }
    renderConfirmContents(pending.draft, selections, true);
  }

  function syncLiveCartItem(source, cartId, patch) {
    const item = (state.carts[source] || []).find((entry) => entry.id === cartId);
    if (item) Object.assign(item, patch);
  }

  function normalizeLocation(location = {}) {
    const value = location || {};
    return {
      tableNo: value.tableNo || "",
      seatNo: value.seatNo || "",
    };
  }

  function locationsForItem(item, quantity, selections = {}) {
    if (selections.order) {
      const location = locationForTarget(item.target, selections.order);
      return Array.from({ length: quantity }, () => ({ ...location }));
    }
    return Array.from({ length: quantity }, (_, index) =>
      locationForTarget(item.target, selections[`${item.id}-${index}`] || item.locations?.[index])
    );
  }

  function targetNeedsLocation(target) {
    return (target || "ring") !== "bar";
  }

  function targetAllowsSeat(target) {
    return !["bar", "cast"].includes(target || "ring");
  }

  function tablesForTarget(target) {
    return target === "cast" ? [...TABLES, CAST_BAR_TABLE] : TABLES;
  }

  function locationForTarget(target, location = {}) {
    const normalized = normalizeLocation(location);
    return {
      tableNo: targetNeedsLocation(target) ? normalized.tableNo : "",
      seatNo: targetAllowsSeat(target) ? normalized.seatNo : "",
    };
  }

  function captureConfirmSelections() {
    const block = $("#confirmLocation [data-confirm-order-location]");
    if (!block) return {};
    return {
      order: {
        tableNo: activeConfirmValue(block, "tableNo"),
        seatNo: activeConfirmValue(block, "seatNo"),
      },
    };
  }

  function persistConfirmOrderLocation(block) {
    const pending = state.pendingConfirmation;
    if (!pending || !block) return;
    const location = {
      tableNo: activeConfirmValue(block, "tableNo"),
      seatNo: activeConfirmValue(block, "seatNo"),
    };
    pending.draft.items.forEach((item) => {
      if (!targetNeedsLocation(item.target)) return;
      const quantity = Math.max(1, Math.min(20, Number(item.quantity || 1)));
      const itemLocation = locationForTarget(item.target, location);
      const locations = Array.from({ length: quantity }, () => ({ ...itemLocation }));
      item.locations = locations;
      syncLiveCartItem(pending.draft.source, item.id, { locations });
    });
  }

  function persistConfirmSelections() {
    const pending = state.pendingConfirmation;
    const selections = captureConfirmSelections();
    if (!pending) return selections;

    pending.draft.items.forEach((item) => {
      if (!targetNeedsLocation(item.target)) {
        item.locations = [];
        syncLiveCartItem(pending.draft.source, item.id, { locations: [] });
        return;
      }
      const quantity = Math.max(1, Math.min(20, Number(item.quantity || 1)));
      const locations = locationsForItem(item, quantity, selections);
      item.locations = locations;
      syncLiveCartItem(pending.draft.source, item.id, { locations });
    });

    return selections;
  }

  async function sendConfirmedOrders() {
    const pending = state.pendingConfirmation;
    if (!pending) return;

    const { form, draft } = pending;
    const button = $("#sendConfirmedOrder");
    button.disabled = true;
    setOrderSendStatus("sending");

    try {
      const items = collectConfirmItems();
      const paymentStatus = confirmPaymentStatus();
      const paymentMethod = paymentStatus === "uncollected" ? paymentMethodValue("confirmPaymentMethod") : "cash";
      const savePromise = createOrders(items.map((item) => ({
          source: draft.source,
          drink_name: item.drink_name,
          quantity: 1,
          target: item.target,
          table_no: targetNeedsLocation(item.target) ? item.tableNo : "",
          seat_no: targetAllowsSeat(item.target) ? item.seatNo : "",
          payment_status: paymentStatus,
          payment_method: paymentMethod,
          notes: combinedOrderNote(item.selected_options),
          status: "ordered",
          events: [eventEntry("ordered")],
        })));
      state.carts[draft.source] = [];
      resetForm(form);
      closeConfirm();
      const saved = await savePromise;
      setOrderSendStatus(saved ? "complete" : "failed");
    } catch (error) {
      console.error(error);
      setOrderSendStatus("failed");
      toast("送信に失敗しました。通信状態を確認してください", { long: true });
    } finally {
      button.disabled = false;
    }
  }

  function collectConfirmItems() {
    const draft = state.pendingConfirmation?.draft;
    if (!draft) return [];
    const locationBlock = $("#confirmLocation [data-confirm-order-location]");
    const tableNo = activeConfirmValue(locationBlock, "tableNo");
    const seatNo = activeConfirmValue(locationBlock, "seatNo");
    return expandCartItems(draft.items).map((item) => {
      const target = item.target || "ring";
      return {
        drink_name: item.drink_name || "",
        selected_options: [...(item.selected_options || [])],
        target,
        tableNo: targetNeedsLocation(target) ? tableNo : "",
        seatNo: targetAllowsSeat(target) ? seatNo : "",
      };
    });
  }

  function activeConfirmValue(block, type) {
    if (!block) return "";
    return $(`[data-confirm-choice="${type}"].active`, block)?.dataset.choiceValue || "";
  }

  function combinedOrderNote(options) {
    const parts = [];
    if (options.length) parts.push(`オプション: ${options.join(" / ")}`);
    return parts.join(" / ");
  }

  function resetForm(form) {
    const source = form.dataset.source;
    const selectedTarget = form.elements.target?.value || "";
    form.reset();
    if (source === "reception" && selectedTarget) {
      form.elements.target.value = selectedTarget;
    }
    if (source === "table") {
      form.elements.target.value = "ring";
    }
    form.elements.quantity.value = 1;
    clearDrinkSelection(form);
    updateCustomDrinkField(form);
    updateConfirmButtonState(form);
  }

  function updateCustomDrinkField(form) {
    const selectedDrink = form.elements.drinkName?.value || "";
    const customInput = form.elements.customDrink;
    if (!customInput) return;
    const label = customInput.closest("label");
    const enabled = selectedDrink === "その他";
    customInput.disabled = !enabled;
    if (!enabled) customInput.value = "";
    if (label) label.style.opacity = enabled ? "1" : "0.44";
  }

  function updateConfirmButtonState(form) {
    const button = $("[data-confirm-button]", form);
    if (!button) return;
    const count = cartItemCount(form.dataset.source);
    button.disabled = count === 0;
    const label = $("[data-confirm-label]", button);
    if (label) label.textContent = count ? `合計${count}杯` : "商品を選択してください";
  }

  function setDrinkSelection(form, categoryId, item) {
    form.elements.drinkName.value = item.name;
    form.elements.drinkCategoryId.value = categoryId;
    form.elements.drinkItemId.value = item.id;
    form.elements.quantity.value = 1;
    form.elements.customDrink.value = "";
    clearHiddenOptions(form);

    const picker = $("[data-drink-picker]", form);
    $$(".choice-button", picker).forEach((button) => {
      button.classList.toggle("active", button.dataset.menuItemId === item.id);
    });

    updateCustomDrinkField(form);
    updateConfirmButtonState(form);
    openItemSheet(form, item);
  }

  function clearDrinkSelection(form) {
    if (form.elements.drinkName) form.elements.drinkName.value = "";
    if (form.elements.drinkCategoryId) form.elements.drinkCategoryId.value = "";
    if (form.elements.drinkItemId) form.elements.drinkItemId.value = "";
    if (form.elements.quantity) form.elements.quantity.value = 1;
    if (form.elements.customDrink) form.elements.customDrink.value = "";
    clearHiddenOptions(form);

    const picker = $("[data-drink-picker]", form);
    if (picker) {
      $$(".choice-button", picker).forEach((button) => button.classList.remove("active"));
    }

    updateCustomDrinkField(form);
    updateConfirmButtonState(form);
  }

  function clearHiddenOptions(form) {
    $$("[data-hidden-option]", form).forEach((input) => input.remove());
  }

  function openItemSheet(form, item) {
    state.activeSheet = { form, item };
    renderItemSheet(form, item);
    const layer = $("#itemSheetLayer");
    layer.hidden = false;
    requestAnimationFrame(() => layer.classList.add("open"));
    scheduleIconRefresh();
  }

  function closeItemSheet() {
    const layer = $("#itemSheetLayer");
    layer.classList.remove("open");
    state.activeSheet = null;
    setTimeout(() => {
      if (!layer.classList.contains("open")) layer.hidden = true;
    }, 220);
  }

  function renderItemSheet(form, item) {
    $("#itemSheetTitle").textContent = item.name;
    const optionGroups = item.optionGroups.filter((group) => group.choices.length);

    $("#itemSheetOptions").innerHTML = optionGroups.length
      ? optionGroups.map((group) => sheetOptionGroupBlock(group)).join("")
      : "";

    setSheetQuantity(Number(form.elements.quantity?.value || 1), { skipSync: true });
    syncSheetToForm();
    updateSheetConfirmState();
  }

  function sheetOptionGroupBlock(group) {
    return `
      <fieldset class="sheet-option-group" data-option-group-id="${escapeHtml(group.id)}" data-required="${group.required ? "true" : "false"}">
        <legend>
          <span>${escapeHtml(group.label)}</span>
          ${group.required ? `<span class="required-badge">必須</span>` : ""}
        </legend>
        <div class="option-grid sheet-option-grid">
          ${group.choices.map((choice) => `
            <label class="option-pill">
              <input type="radio" name="sheet-option-${escapeHtml(group.id)}" value="${escapeHtml(choice)}" data-option-group-label="${escapeHtml(group.label)}">
              <span>${escapeHtml(choice)}</span>
            </label>
          `).join("")}
        </div>
      </fieldset>
    `;
  }

  function updateSheetConfirmState() {
    const button = $("#itemSheetConfirm");
    const requiredGroups = $$("#itemSheetOptions [data-required='true']");
    const missingGroups = requiredGroups.filter((group) => !$("input:checked", group));
    requiredGroups.forEach((group) => group.classList.toggle("missing-required", missingGroups.includes(group)));
    button.disabled = missingGroups.length > 0;
    return missingGroups.length === 0;
  }

  function sheetQuantity() {
    return Number($("#itemSheetQuantity").textContent || 1);
  }

  function setSheetQuantity(value, options = {}) {
    const quantity = Math.max(1, Math.min(20, Number(value || 1)));
    $("#itemSheetQuantity").textContent = String(quantity);
    $("#quantityMinus").disabled = quantity <= 1;
    $("#quantityPlus").disabled = quantity >= 20;
    if (!options.skipSync) syncSheetToForm();
  }

  function syncSheetToForm() {
    const form = state.activeSheet?.form;
    if (!form) return;

    form.elements.quantity.value = String(sheetQuantity());
    form.elements.customDrink.value = "";

    clearHiddenOptions(form);
    $$("#itemSheetOptions input:checked").forEach((input) => {
      const groupLabel = input.dataset.optionGroupLabel || "オプション";
      const hidden = document.createElement("input");
      hidden.type = "hidden";
      hidden.name = "drinkOptions";
      hidden.value = `${groupLabel}: ${input.value}`;
      hidden.dataset.hiddenOption = "true";
      form.appendChild(hidden);
    });
  }

  function renderMenuPickers() {
    $$("[data-drink-picker]").forEach((picker) => renderMenuPicker(picker));
  }

  function renderMenuPicker(picker) {
    const form = picker.closest(".order-form");
    const useCustomOrder = form.dataset.source === "reception" && state.receptionMenuMode === "custom";
    const fallbackCategory = firstCategoryId();
    const requestedCategory = picker.dataset.activeCategory || fallbackCategory;
    const activeCategory = state.menu.some((category) => category.id === requestedCategory) ? requestedCategory : fallbackCategory;
    let currentCategoryId = form.elements.drinkCategoryId?.value || "";
    let currentItemId = form.elements.drinkItemId?.value || "";
    const currentItem = findMenuItem(currentCategoryId, currentItemId);

    if (currentItemId && !currentItem) {
      clearDrinkSelection(form);
      currentCategoryId = "";
      currentItemId = "";
    }

    picker.dataset.activeCategory = activeCategory;
    picker.classList.toggle("custom-menu-picker", useCustomOrder);
    $("[data-menu-categories]", picker).innerHTML = state.menu.map(
      (category) => `
        <button class="menu-category-button ${category.id === activeCategory ? "active" : ""}" type="button" data-menu-category="${category.id}">
          ${escapeHtml(category.label)}
        </button>
      `
    ).join("");

    const itemCounts = useCustomOrder ? menuItemOrderCounts() : null;
    const categoryGroups = state.menu.map((category) => ({
      category,
      groups: useCustomOrder ? rankedMenuCategoryGroups(category, itemCounts) : menuSubcategoryGroups(category),
    }));
    const availableSubcategories = categoryGroups.flatMap(({ category, groups }) =>
      groups.map((group) => ({ category, group, key: subcategoryKey(category.id, group.id) }))
    );
    const requestedSubcategory = picker.dataset.activeSubcategory || "";
    const requestedSubcategoryEntry = availableSubcategories.find((item) => item.key === requestedSubcategory);
    const activeSubcategory = requestedSubcategoryEntry && (!useCustomOrder || requestedSubcategoryEntry.category.id === activeCategory)
      ? requestedSubcategory
      : availableSubcategories.find((item) => item.category.id === activeCategory)?.key || availableSubcategories[0]?.key || "";
    picker.dataset.activeSubcategory = activeSubcategory;

    const globalSubcategoryNav = availableSubcategories.length
      ? `
        <div class="menu-global-subcategory-row" aria-label="サブカテゴリ">
          ${availableSubcategories.map(({ category, group, key }) => `
            <button class="menu-subcategory-chip ${key === activeSubcategory ? "active" : ""}" type="button" data-menu-subcategory="${escapeHtml(key)}" data-menu-subcategory-category="${escapeHtml(category.id)}" ${useCustomOrder && category.id !== activeCategory ? "hidden" : ""}>
              ${escapeHtml(group.label)}
            </button>
          `).join("")}
        </div>
      `
      : "";
    const categorySections = categoryGroups
      .map(({ category, groups }) =>
        menuCategorySectionBlock(category, currentCategoryId, currentItemId, form.dataset.source, groups)
      )
      .join("");
    const itemGrid = $("[data-drink-buttons]", picker);
    itemGrid.classList.toggle("custom-ranking", useCustomOrder);
    itemGrid.innerHTML = categorySections
      ? `${globalSubcategoryNav}${categorySections}`
      : `<div class="menu-empty">商品未設定</div>`;
    updateMenuCategoryActive(picker, activeCategory);
    setupMenuScrollTracking(picker);
    requestAnimationFrame(() => {
      syncMenuCategoryToScroll(picker);
      fitCustomMenuItemNames(picker);
    });

    if (currentItem && state.activeSheet?.form === form) renderItemSheet(form, currentItem);
    updateConfirmButtonState(form);
    updateCustomDrinkField(form);
  }

  function scheduleCustomMenuNameFit(picker) {
    requestAnimationFrame(() => fitCustomMenuItemNames(picker));
  }

  function fitCustomMenuItemNames(picker) {
    if (!picker.classList.contains("custom-menu-picker")) return;
    const measureContext = document.createElement("canvas").getContext("2d");
    $$(".menu-item-name", picker)
      .filter((name) => name.offsetParent !== null)
      .forEach((name) => {
        name.style.fontSize = "";
        const button = name.closest(".choice-button");
        const meta = $(".menu-item-meta", button);
        const buttonStyle = getComputedStyle(button);
        const nameStyle = getComputedStyle(name);
        const availableWidth = Math.max(24,
          button.clientWidth
          - Number.parseFloat(buttonStyle.paddingLeft)
          - Number.parseFloat(buttonStyle.paddingRight)
          - (meta?.offsetWidth || 0)
          - Number.parseFloat(buttonStyle.columnGap || buttonStyle.gap || 0)
        );
        let fontSize = Number.parseFloat(nameStyle.fontSize) || 16;
        const textWidth = () => {
          measureContext.font = `${nameStyle.fontStyle} ${nameStyle.fontWeight} ${fontSize}px ${nameStyle.fontFamily}`;
          return measureContext.measureText(name.textContent.trim()).width;
        };
        while (textWidth() > availableWidth && fontSize > 8) {
          fontSize -= 0.5;
          name.style.fontSize = `${fontSize}px`;
        }
      });
  }

  function menuCategorySectionBlock(category, currentCategoryId, currentItemId, source, groups = menuSubcategoryGroups(category)) {
    const showSubcategories = shouldShowSubcategoryUi(groups);
    const groupBlocks = groups
      .map((group) => {
        const itemButtons = group.items.map((item) => {
        const selectedCount = cartQuantityForMenuItem(source, category.id, item);
        const classes = [
          "choice-button",
          category.id === currentCategoryId && item.id === currentItemId ? "active" : "",
          selectedCount ? "in-cart" : "",
        ].filter(Boolean).join(" ");

        return `
          <button class="${classes}" type="button" data-menu-category-id="${escapeHtml(category.id)}" data-menu-item-id="${escapeHtml(item.id)}" data-choice-value="${escapeHtml(item.name)}">
            <span class="menu-item-name">${escapeHtml(item.name)}</span>
            <span class="menu-item-meta">
              <span class="menu-item-price">${escapeHtml(formatPrice(item.price))}</span>
              ${selectedCount ? `<span class="menu-item-count">${escapeHtml(String(selectedCount))}杯</span>` : ""}
            </span>
          </button>
        `;
        }).join("");

        return `
          <section class="menu-subcategory-section" data-menu-subsection="${escapeHtml(subcategoryKey(category.id, group.id))}">
            ${showSubcategories ? `<h4 class="menu-subcategory-heading">${escapeHtml(group.label)}</h4>` : ""}
            ${itemButtons}
          </section>
        `;
      })
      .join("");

    return `
      <section class="menu-category-section" data-menu-section="${escapeHtml(category.id)}">
        <h3 class="menu-category-heading">${escapeHtml(category.label)}</h3>
        ${groupBlocks || `<div class="menu-empty compact">商品未設定</div>`}
      </section>
    `;
  }

  function menuSubcategoryGroups(category) {
    const items = category.items || [];
    const subcategories = category.subcategories?.length
      ? category.subcategories
      : [{ id: DEFAULT_SUBCATEGORY_ID, label: DEFAULT_SUBCATEGORY_LABEL }];
    const groups = subcategories
      .map((subcategory) => ({
        ...subcategory,
        items: items.filter((item) => item.subcategory_id === subcategory.id),
      }))
      .filter((group) => group.items.length);
    if (menuCategoryKind(category) !== "alcohol") return groups;
    return groups
      .map((group, originalIndex) => {
        const normalizedLabel = group.label === "レッドブル割り" ? "レッドブル割" : group.label;
        const requestedIndex = ALCOHOL_SUBCATEGORY_ORDER.indexOf(normalizedLabel);
        return { group, originalIndex, requestedIndex };
      })
      .sort((a, b) => {
        const aOrder = a.requestedIndex < 0 ? ALCOHOL_SUBCATEGORY_ORDER.length : a.requestedIndex;
        const bOrder = b.requestedIndex < 0 ? ALCOHOL_SUBCATEGORY_ORDER.length : b.requestedIndex;
        return aOrder - bOrder || a.originalIndex - b.originalIndex;
      })
      .map(({ group }) => group);
  }

  function rankedMenuCategoryGroups(category, itemCounts) {
    return menuSubcategoryGroups(category).map((group) => ({
      ...group,
      items: group.items
        .map((item, itemIndex) => ({
          item,
          itemIndex,
          count: itemCounts.get(item.name) || 0,
        }))
        .sort((a, b) => b.count - a.count || a.itemIndex - b.itemIndex)
        .map((entry) => entry.item),
    }));
  }

  function shouldShowSubcategoryUi(groups) {
    return groups.length > 1 || groups.some((group) => group.id !== DEFAULT_SUBCATEGORY_ID || group.label !== DEFAULT_SUBCATEGORY_LABEL);
  }

  function subcategoryKey(categoryId, subcategoryId) {
    return `${categoryId}::${subcategoryId}`;
  }

  function updateMenuCategoryActive(picker, categoryId) {
    $$("[data-menu-category]", picker).forEach((button) => {
      button.classList.toggle("active", button.dataset.menuCategory === categoryId);
    });
    $$("[data-menu-section]", picker).forEach((section) => {
      section.hidden = picker.classList.contains("custom-menu-picker")
        && section.dataset.menuSection !== categoryId;
    });
    if (picker.classList.contains("custom-menu-picker")) {
      $$("[data-menu-subcategory]", picker).forEach((button) => {
        button.hidden = button.dataset.menuSubcategoryCategory !== categoryId;
      });
    }
  }

  function setupMenuScrollTracking(picker) {
    const scroller = $("[data-drink-buttons]", picker);
    if (!scroller || scroller.dataset.categoryScrollTracking === "true") return;
    scroller.dataset.categoryScrollTracking = "true";
    scroller.addEventListener("scroll", () => {
      if (scroller._categoryScrollFrame) return;
      scroller._categoryScrollFrame = requestAnimationFrame(() => {
        scroller._categoryScrollFrame = null;
        syncMenuCategoryToScroll(picker);
      });
    }, { passive: true });
  }

  function syncMenuCategoryToScroll(picker) {
    const scroller = $("[data-drink-buttons]", picker);
    const sections = $$("[data-menu-section]", picker);
    if (!scroller || !sections.length) return;
    if (picker.classList.contains("custom-menu-picker")) {
      const activeSection = sections.find((section) => !section.hidden);
      if (!activeSection) return;
      const stickyOffset = $(".menu-global-subcategory-row", picker)?.offsetHeight || 0;
      const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
      syncMenuSubcategoryToScroll(picker, scroller, activeSection, stickyOffset, atBottom);
      return;
    }
    if (scroller._menuScrollTargetCategory && performance.now() < scroller._menuScrollLockUntil) {
      const categoryId = scroller._menuScrollTargetCategory;
      picker.dataset.activeCategory = categoryId;
      updateMenuCategoryActive(picker, categoryId);
      return;
    }
    scroller._menuScrollTargetCategory = "";
    scroller._menuScrollLockUntil = 0;
    const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
    const stickyOffset = $(".menu-global-subcategory-row", picker)?.offsetHeight || 0;
    const threshold = scroller.scrollTop + stickyOffset + 4;
    let activeSection = sections[0];
    if (atBottom) {
      activeSection = sections[sections.length - 1];
    } else {
      sections.forEach((section) => {
        if (section.offsetTop <= threshold) activeSection = section;
      });
    }
    const categoryId = activeSection.dataset.menuSection;
    if (!categoryId) return;
    if (picker.dataset.activeCategory !== categoryId) {
      picker.dataset.activeCategory = categoryId;
      updateMenuCategoryActive(picker, categoryId);
    }
    syncMenuSubcategoryToScroll(picker, scroller, activeSection, stickyOffset, atBottom);
  }

  function scrollToMenuSection(picker, categoryId) {
    const section = $$("[data-menu-section]", picker).find((item) => item.dataset.menuSection === categoryId);
    scrollMenuContentTo(picker, section);
  }

  function updateMenuSubcategoryActive(picker, subcategoryId) {
    picker.dataset.activeSubcategory = subcategoryId;
    $$("[data-menu-subcategory]", picker).forEach((button) => {
      button.classList.toggle("active", button.dataset.menuSubcategory === subcategoryId);
    });
    scrollMenuSubcategoryNavToActive(picker, subcategoryId);
  }

  function syncMenuSubcategoryToScroll(picker, scroller, categorySection, stickyOffset, atBottom) {
    if (scroller._menuScrollTargetSubcategory && performance.now() < scroller._menuScrollLockUntil) {
      updateMenuSubcategoryActive(picker, scroller._menuScrollTargetSubcategory);
      return;
    }
    scroller._menuScrollTargetSubcategory = "";
    const subsections = $$("[data-menu-subsection]", categorySection);
    if (!subsections.length) return;
    const categoryHeadingHeight = $(".menu-category-heading", categorySection)?.offsetHeight || 0;
    const threshold = scroller.getBoundingClientRect().top + stickyOffset + categoryHeadingHeight + 4;
    let activeSubsection = subsections[0];
    if (atBottom) {
      activeSubsection = subsections[subsections.length - 1];
    } else {
      subsections.forEach((subsection) => {
        if (subsection.getBoundingClientRect().top <= threshold) activeSubsection = subsection;
      });
    }
    const subcategoryId = activeSubsection.dataset.menuSubsection;
    if (subcategoryId && picker.dataset.activeSubcategory !== subcategoryId) {
      updateMenuSubcategoryActive(picker, subcategoryId);
    }
  }

  function scrollMenuSubcategoryNavToActive(picker, subcategoryId) {
    const nav = $(".menu-global-subcategory-row", picker);
    const button = $$("[data-menu-subcategory]", picker)
      .find((item) => item.dataset.menuSubcategory === subcategoryId);
    if (!nav || !button) return;
    const maxLeft = Math.max(0, nav.scrollWidth - nav.clientWidth);
    const targetLeft = Math.min(maxLeft, Math.max(0, button.offsetLeft - ((nav.clientWidth - button.offsetWidth) / 2)));
    animateMenuNavScroll(nav, targetLeft, 180);
  }

  function animateMenuNavScroll(nav, targetLeft, duration = 180) {
    if (nav._menuNavScrollFrame) cancelAnimationFrame(nav._menuNavScrollFrame);
    const startLeft = nav.scrollLeft;
    const distance = targetLeft - startLeft;
    if (Math.abs(distance) < 2) {
      nav.scrollLeft = targetLeft;
      return;
    }
    const startTime = performance.now();
    const easeOut = (progress) => 1 - Math.pow(1 - progress, 3);
    const tick = (now) => {
      const progress = Math.min(1, (now - startTime) / duration);
      nav.scrollLeft = startLeft + distance * easeOut(progress);
      if (progress < 1) nav._menuNavScrollFrame = requestAnimationFrame(tick);
    };
    nav._menuNavScrollFrame = requestAnimationFrame(tick);
  }

  function scrollToMenuSubcategory(picker, subcategoryId) {
    const section = $$("[data-menu-subsection]", picker).find((item) => item.dataset.menuSubsection === subcategoryId);
    scrollMenuContentTo(picker, section);
  }

  function scrollMenuContentTo(picker, section) {
    const scroller = $("[data-drink-buttons]", picker);
    if (!scroller || !section) return;
    const scrollerRect = scroller.getBoundingClientRect();
    const sectionRect = section.getBoundingClientRect();
    const categorySection = section.closest("[data-menu-section]");
    const stickyOffset = section.matches("[data-menu-subsection]") && categorySection
      ? ($(".menu-global-subcategory-row", picker)?.offsetHeight || 0)
        + ($(".menu-category-heading", categorySection)?.offsetHeight || 0)
      : 0;
    const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const top = Math.min(maxTop, Math.max(0, sectionRect.top - scrollerRect.top + scroller.scrollTop - stickyOffset));
    const targetCategoryId = categorySection?.dataset.menuSection || section.dataset.menuSection || "";
    const targetSubcategoryId = section.dataset.menuSubsection || "";
    scroller._menuScrollTargetCategory = targetCategoryId;
    scroller._menuScrollTargetSubcategory = targetSubcategoryId;
    scroller._menuScrollLockUntil = performance.now() + 280;
    animateMenuScroll(scroller, top, 160);
  }

  function animateMenuScroll(scroller, targetTop, duration = 160) {
    if (scroller._menuScrollFrame) cancelAnimationFrame(scroller._menuScrollFrame);
    const startTop = scroller.scrollTop;
    const distance = targetTop - startTop;
    if (Math.abs(distance) < 2) {
      scroller.scrollTop = targetTop;
      return;
    }
    const startTime = performance.now();
    const easeOut = (progress) => 1 - Math.pow(1 - progress, 3);

    const tick = (now) => {
      const progress = Math.min(1, (now - startTime) / duration);
      scroller.scrollTop = startTop + distance * easeOut(progress);
      if (progress < 1) {
        scroller._menuScrollFrame = requestAnimationFrame(tick);
      }
    };

    scroller._menuScrollFrame = requestAnimationFrame(tick);
  }

  function firstCategoryId() {
    return state.menu.find((category) => category.items.length)?.id || state.menu[0]?.id || DEFAULT_MENU[0].id;
  }

  function findMenuItem(categoryId, itemId) {
    const category = state.menu.find((item) => item.id === categoryId);
    return category?.items.find((item) => item.id === itemId) || null;
  }

  function menuCategoryKind(category) {
    const value = `${category?.id || ""} ${category?.label || ""}`.toLowerCase();
    if (value.includes("alcohol") || value.includes("アルコール") || value.includes("お酒")) return "alcohol";
    if (value.includes("food") || value.includes("フード")) return "food";
    return "soft";
  }

  function alcoholMenuCategory(menu = state.menu) {
    return (menu || []).find((category) => menuCategoryKind(category) === "alcohol") || null;
  }

  function menuCategoryForDrinkName(name) {
    return state.menu.find((category) =>
      (category.items || []).some((item) => item.name === name)
    ) || null;
  }

  function alcoholMenuItem(name) {
    return alcoholMenuCategory()?.items.find((item) => item.name === name) || null;
  }

  function soundCategoryForOrder(order) {
    if (order.target === "cast") return "cast";
    return menuCategoryKind(menuCategoryForDrinkName(order.drink_name));
  }

  async function configureSupabaseFromStorage() {
    const config = readConfig();
    if (!config.url || !config.anonKey) {
      setSyncMode("local", "デモ同期");
      return;
    }

    if (!window.supabase) {
      setSyncMode("local", "Supabase読込不可");
      toast("Supabaseライブラリを読み込めません");
      return;
    }

    try {
      state.supabase = window.supabase.createClient(config.url, config.anonKey);
      state.realtimeChannel = state.supabase
        .channel("drink_relay_changes")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "drink_orders" },
          (payload) => {
            handleRealtimePayload(payload);
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "drink_app_settings" },
          (payload) => {
            handleSharedSettingsPayload(payload);
          }
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            setSyncMode("supabase", "共有同期");
          }
          if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
            setSyncMode("supabase", "受信接続エラー");
          }
        });
      setSyncMode("supabase", "共有接続中");
    } catch (error) {
      console.error(error);
      setSyncMode("local", "接続失敗");
      toast("共有同期の接続に失敗しました");
    }
  }

  function setSyncMode(mode, label) {
    state.syncMode = mode;
    const badge = $("#syncBadge");
    if (!badge) return;
    badge.classList.toggle("is-shared", mode === "supabase");
    badge.classList.toggle("is-local", mode !== "supabase");
    if (mode === "supabase") {
      badge.textContent = label || "共有同期";
    } else {
      badge.textContent = label || "デモ同期";
    }
  }

  async function loadSharedSettings() {
    if (state.syncMode !== "supabase" || !state.supabase) {
      return;
    }

    const row = await fetchSharedSettings();
    if (row) {
      applySharedSettings(row);
    } else {
      await saveSharedSettings(state.menu, { silent: true });
    }

    await loadSharedSoundSettings();
    await loadSharedOptionTemplates();
    state.sharedSettingsLoaded = true;
  }

  async function loadSharedOptionTemplates() {
    const row = await fetchSharedOptionTemplates();
    if (row) {
      applySharedOptionTemplates(row);
      return;
    }
    await saveSharedOptionTemplates(state.optionTemplates, { silent: true });
  }

  async function loadSharedSoundSettings() {
    const row = await fetchSharedSoundSettings();
    if (row) {
      applySharedSoundSettings(row);
      return;
    }
    await saveSharedSoundSettings({ silent: true });
  }

  async function fetchSharedSettings() {
    if (state.syncMode !== "supabase" || !state.supabase) return null;
    const { data, error } = await state.supabase
      .from("drink_app_settings")
      .select("*")
      .eq("id", SETTINGS_ROW_ID)
      .maybeSingle();

    if (error) {
      console.error(error);
      toast(supabaseErrorMessage("共有設定テーブルを読み込めません", error), { long: true });
      return null;
    }

    return data || null;
  }

  async function fetchSharedSoundSettings() {
    if (state.syncMode !== "supabase" || !state.supabase) return null;
    const { data, error } = await state.supabase
      .from("drink_app_settings")
      .select("*")
      .eq("id", SOUND_SETTINGS_ROW_ID)
      .maybeSingle();

    if (error) {
      console.error(error);
      toast(supabaseErrorMessage("共有通知音を読み込めません", error), { long: true });
      return null;
    }

    return data || null;
  }

  async function fetchSharedOptionTemplates() {
    if (state.syncMode !== "supabase" || !state.supabase) return null;
    const { data, error } = await state.supabase
      .from("drink_app_settings")
      .select("*")
      .eq("id", OPTION_TEMPLATE_SETTINGS_ROW_ID)
      .maybeSingle();

    if (error) {
      console.error(error);
      toast(supabaseErrorMessage("共有オプションを読み込めません", error), { long: true });
      return null;
    }

    return data || null;
  }

  async function saveSharedSettings(menu = state.menu, options = {}) {
    if (state.syncMode !== "supabase" || !state.supabase) return false;
    const { error } = await state.supabase
      .from("drink_app_settings")
      .upsert(
        {
          id: SETTINGS_ROW_ID,
          updated_at: new Date().toISOString(),
          menu,
        },
        { onConflict: "id" }
      );

    if (error) {
      console.error(error);
      if (!options.silent) toast(supabaseErrorMessage("共有設定の保存に失敗しました", error), { long: true });
      return false;
    }

    state.sharedSettingsLoaded = true;
    return true;
  }

  async function saveSharedSoundSettings(options = {}) {
    if (state.syncMode !== "supabase" || !state.supabase) return false;
    const { error } = await state.supabase
      .from("drink_app_settings")
      .upsert(
        {
          id: SOUND_SETTINGS_ROW_ID,
          updated_at: new Date().toISOString(),
          menu: state.soundChoices,
        },
        { onConflict: "id" }
      );

    if (error) {
      console.error(error);
      if (!options.silent) toast(supabaseErrorMessage("共有通知音の保存に失敗しました", error), { long: true });
      return false;
    }

    return true;
  }

  async function saveSharedOptionTemplates(templates = state.optionTemplates, options = {}) {
    if (state.syncMode !== "supabase" || !state.supabase) return false;
    const { error } = await state.supabase
      .from("drink_app_settings")
      .upsert(
        {
          id: OPTION_TEMPLATE_SETTINGS_ROW_ID,
          updated_at: new Date().toISOString(),
          menu: normalizeOptionTemplates(templates),
        },
        { onConflict: "id" }
      );

    if (error) {
      console.error(error);
      if (!options.silent) toast(supabaseErrorMessage("共有オプションの保存に失敗しました", error), { long: true });
      return false;
    }

    return true;
  }

  function queueSharedSoundSettingsSave() {
    state.soundSavePromise = state.soundSavePromise
      .catch(() => false)
      .then(() => saveSharedSoundSettings());
    return state.soundSavePromise;
  }

  function handleSharedSettingsPayload(payload) {
    if (payload.eventType === "DELETE" || !payload.new) return;
    if (payload.new.id === OPTION_TEMPLATE_SETTINGS_ROW_ID) {
      applySharedOptionTemplates(payload.new, { fromRealtime: true });
      return;
    }
    if (payload.new.id === SOUND_SETTINGS_ROW_ID) {
      applySharedSoundSettings(payload.new, { fromRealtime: true });
      return;
    }
    if (payload.new.id !== SETTINGS_ROW_ID) return;
    if (configHasUnsavedChanges()) {
      toast("共有設定が更新されました。保存中の編集があるため反映していません");
      return;
    }
    applySharedSettings(payload.new, { fromRealtime: true });
  }

  function applySharedSettings(row, options = {}) {
    if (sharedSettingsHasMenu(row)) {
      state.menu = ensureRequiredMenuCategories(row.menu);
      localStorage.setItem(MENU_KEY, JSON.stringify(state.menu));
      renderMenuPickers();
    }

    if ($("#configDialog")?.open) {
      state.configDraftMenu = normalizeMenu(state.menu, { allowEmpty: true });
      renderMenuEditor();
      if (state.configSection === "manual") renderAlcoholManualEditor();
      state.configSnapshot = configDraftSnapshot();
    }

    if (options.fromRealtime) {
      toast("共有メニューを更新しました");
    }
  }

  function applySharedSoundSettings(row, options = {}) {
    if (!row?.menu || Array.isArray(row.menu) || typeof row.menu !== "object") return;
    const nextChoices = Object.fromEntries(
      SOUND_CATEGORIES.map(({ id }) => [id, normalizeSoundChoice(row.menu[id] || state.soundChoices[id])])
    );
    const changed = JSON.stringify(nextChoices) !== JSON.stringify(state.soundChoices);
    state.soundChoices = nextChoices;
    saveSoundChoices();
    updateSoundButton();
    if (state.soundEnabled && state.soundPreviewed) {
      configuredSoundChoiceIds().forEach((choiceId) => primeNotificationAudio(choiceId));
    }
    if (options.fromRealtime && changed) toast("共有通知音を更新しました");
  }

  function applySharedOptionTemplates(row, options = {}) {
    if (!Array.isArray(row?.menu)) return;
    state.optionTemplates = normalizeOptionTemplates(row.menu);
    localStorage.setItem(OPTION_TEMPLATES_KEY, JSON.stringify(state.optionTemplates));

    if ($("#configDialog")?.open && !configHasUnsavedChanges()) {
      state.configDraftOptionTemplates = cloneOptionGroups(state.optionTemplates);
      refreshOptionTemplateControls();
      state.configSnapshot = configDraftSnapshot();
    }

    if (options.fromRealtime) toast("共有オプションを更新しました");
  }

  function sharedSettingsHasMenu(row) {
    return Array.isArray(row?.menu) && row.menu.length > 0;
  }

  async function loadOrders() {
    if (state.syncMode === "supabase" && state.supabase) {
      const historyCutoff = new Date(Date.now() - COMPLETED_HISTORY_MS).toISOString();
      const [openResult, historyResult] = await Promise.all([
        state.supabase
          .from("drink_orders")
          .select("*")
          .in("status", ["ordered", "making", "made"])
          .order("created_at", { ascending: true }),
        state.supabase
          .from("drink_orders")
          .select("*")
          .in("status", ["served", "canceled"])
          .gte("updated_at", historyCutoff)
          .order("updated_at", { ascending: false }),
      ]);
      const error = openResult.error || historyResult.error;

      if (error) {
        console.error(error);
        toast(supabaseErrorMessage("共有データの読み込みに失敗しました", error), { long: true });
        setSyncMode("local", "共有読込失敗");
        loadLocalOrders();
        return;
      }

      const ordersById = new Map(
        [...(openResult.data || []), ...(historyResult.data || [])]
          .map(normalizeOrder)
          .map((order) => [order.id, order])
      );
      state.orders = [...ordersById.values()];
      pruneCompletedHistory();
      sortOrders();
      return;
    }

    loadLocalOrders();
  }

  function loadLocalOrders() {
    try {
      state.orders = JSON.parse(localStorage.getItem(ORDER_KEY) || "[]").map(normalizeOrder);
      pruneCompletedHistory();
      sortOrders();
    } catch {
      state.orders = [];
    }
  }

  function saveLocalOrders() {
    pruneCompletedHistory();
    localStorage.setItem(ORDER_KEY, JSON.stringify(state.orders.slice(0, MAX_LOCAL_HISTORY)));
    state.broadcast?.postMessage({ type: "orders-changed" });
  }

  async function createOrders(inputs) {
    const startedAt = Date.now();
    const orders = inputs.map((input, index) => {
      const now = new Date(startedAt + index).toISOString();
      return normalizeOrder({
        id: crypto.randomUUID(),
        created_at: now,
        updated_at: now,
        ...input,
      });
    });

    orders.forEach((order) => {
      upsertOrder(order);
      state.knownIds.add(order.id);
    });
    updateBarOrderBadge();

    if (state.view === "bar") {
      renderBar();
      scheduleIconRefresh();
    }

    if (state.syncMode === "supabase" && state.supabase) {
      const { data, error } = await state.supabase
        .from("drink_orders")
        .insert(orders.map(toDatabaseRow))
        .select();
      if (error) {
        console.error(error);
        toast(supabaseErrorMessage("共有同期に失敗したためデモ同期へ保存しました", error), { long: true });
        setSyncMode("local", "送信失敗");
      } else {
        (data || []).map(normalizeOrder).forEach(upsertOrder);
        return true;
      }
    }

    saveLocalOrders();
    return state.syncMode !== "local" || !state.supabase;
  }

  function setOrderSendStatus(status) {
    const node = $("#orderSendStatus");
    if (!node) return;
    const labels = {
      sending: "送信中...",
      complete: "送信完了",
      failed: "送信失敗",
    };

    if (state.sendStatusTimer) {
      clearTimeout(state.sendStatusTimer);
      state.sendStatusTimer = null;
    }

    node.dataset.state = status;
    node.textContent = labels[status] || "";
    node.hidden = !labels[status];

    if (status !== "sending" && labels[status]) {
      state.sendStatusTimer = window.setTimeout(() => {
        node.hidden = true;
        node.textContent = "";
        delete node.dataset.state;
        state.sendStatusTimer = null;
      }, status === "failed" ? 5000 : 2600);
    }
  }

  async function updateOrder(id, patch) {
    const order = state.orders.find((item) => item.id === id);
    if (!order) return false;

    const next = normalizeOrder({
      ...order,
      ...patch,
      updated_at: new Date().toISOString(),
      events: [...(order.events || []), eventEntry(patch.status || "updated")],
    });

    if (patch.status === "made" && !next.made_at) next.made_at = new Date().toISOString();
    if (patch.status === "served" && !next.served_at) next.served_at = new Date().toISOString();
    if (patch.payment_status === "paid" && !next.paid_at) next.paid_at = new Date().toISOString();

    upsertOrder(next);
    if (state.syncMode === "local") saveLocalOrders();
    renderBar();
    scheduleIconRefresh();

    if (state.syncMode === "supabase" && state.supabase) {
      const { error } = await state.supabase.from("drink_orders").update(toDatabaseRow(next)).eq("id", id);
      if (error) {
        console.error(error);
        upsertOrder(order);
        renderBar();
        scheduleIconRefresh();
        toast("更新に失敗しました");
        return false;
      }
    }

    return true;
  }

  function handleRealtimePayload(payload) {
    if (payload.eventType === "DELETE") {
      state.orders = state.orders.filter((order) => order.id !== payload.old.id);
      refreshCustomMenuRanking();
      render();
      return;
    }

    const order = normalizeOrder(payload.new);
    const isNew = !state.knownIds.has(order.id);
    upsertOrder(order);
    pruneCompletedHistory();

    if (state.booted && isNew) {
      state.knownIds.add(order.id);
      notifyNewOrder(order);
    }

    if (isNew || order.status === "canceled") refreshCustomMenuRanking();
    render();
  }

  function refreshCustomMenuRanking() {
    if (state.view === "reception" && state.receptionMenuMode === "custom") {
      renderMenuPickers();
    }
  }

  function detectNewOrders() {
    state.orders.forEach((order) => {
      if (state.booted && !state.knownIds.has(order.id)) {
        state.knownIds.add(order.id);
        notifyNewOrder(order);
      }
    });
  }

  function notifyNewOrder(order) {
    if (state.view === "bar") {
      if (state.soundEnabled) playChime(state.soundChoices[soundCategoryForOrder(order)]);
    }
  }

  function handleOrderAction(event) {
    const manualButton = event.target.closest("[data-order-manual]");
    if (manualButton) {
      openAlcoholManual(manualButton.closest("[data-order-id]")?.dataset.orderId, manualButton);
      return;
    }

    const card = event.target.closest("[data-order-id]");
    if (!card) return;
    toggleOrderServed(card.dataset.orderId);
  }

  function handleOrderKeydown(event) {
    if (!['Enter', ' '].includes(event.key) || event.target.closest("[data-order-manual]")) return;
    const card = event.target.closest("[data-order-id]");
    if (!card) return;
    event.preventDefault();
    toggleOrderServed(card.dataset.orderId);
  }

  function toggleOrderServed(id) {
    if (!id) return;
    const order = state.orders.find((item) => item.id === id);
    if (!order) return;

    if (state.pendingServeTimers.has(id)) {
      cancelPendingServe(id);
      return;
    }

    if (order.status === "served") {
      restoreServedOrder(id);
      return;
    }

    if (order.status === "canceled") return;
    queueOrderAsServed(id);
  }

  function queueOrderAsServed(id) {
    const timer = window.setTimeout(async () => {
      state.pendingServeTimers.delete(id);
      const order = state.orders.find((item) => item.id === id);
      if (!order || ["served", "canceled"].includes(order.status)) {
        renderBar();
        return;
      }

      await updateOrder(id, { status: "served" });
    }, 1600);

    state.pendingServeTimers.set(id, timer);
    renderBar();
    scheduleIconRefresh();
  }

  function cancelPendingServe(id) {
    const timer = state.pendingServeTimers.get(id);
    if (timer) window.clearTimeout(timer);
    state.pendingServeTimers.delete(id);
    renderBar();
    scheduleIconRefresh();
    toast("提供済みを取り消しました");
  }

  async function restoreServedOrder(id) {
    const restored = await updateOrder(id, {
      status: "ordered",
      served_at: null,
    });
    if (restored) toast("未提供に戻しました");
  }

  function render() {
    pruneCompletedHistory();
    updateBarOrderBadge();
    if (state.view !== "bar") return;
    renderBar();
    scheduleIconRefresh();
    detectOverdueUnmadeOrders();
  }

  function detectOverdueUnmadeOrders() {
    if (!state.soundEnabled) return;
    const overdueOrders = state.orders.filter((order) =>
      ["ordered", "making"].includes(order.status)
      && minutesSince(order.created_at) >= 10
      && !state.overdueUnmadeNotifiedIds.has(order.id)
    );
    if (!overdueOrders.length) return;
    overdueOrders.forEach((order) => state.overdueUnmadeNotifiedIds.add(order.id));
    playChime(state.soundChoices.unmade10);
  }

  function openOrderEdit(orderId) {
    const order = state.orders.find((item) => item.id === orderId);
    if (!order || ["served", "canceled"].includes(order.status)) {
      toast("このオーダーは編集できません");
      return;
    }

    state.editingOrderId = order.id;
    $("#orderEditSummary").innerHTML = orderEditSummaryBlock(order);
    const targetInput = $(`input[name='editTarget'][value='${order.target || "ring"}']`);
    if (targetInput) targetInput.checked = true;
    renderOrderEditLocation(order.table_no, order.seat_no, order.target);
    const paymentStatus = order.payment_status || "uncollected";
    const paymentStatusInput = $("input[name='editPaymentStatus'][value='paid']");
    if (paymentStatusInput) paymentStatusInput.checked = paymentStatus === "paid";
    if (paymentStatus === "uncollected") {
      setPaymentMethodValue("orderEditPaymentMethod", normalizePaymentMethod(order.payment_method));
    } else {
      clearPaymentMethodValue("orderEditPaymentMethod");
    }
    updateOrderEditTargetVisibility();
    $("#orderEditDialog").showModal();
    scheduleIconRefresh();
  }

  function orderEditSummaryBlock(order) {
    const locationBadges = barLocationBadges(order);
    const quantity = Math.max(1, Number(order.quantity || 1));
    return `
      <div class="order-edit-summary-title">
        <span class="order-target-label">${escapeHtml(barTargetLabel(order))}</span>
        ${locationBadges}
        <strong>${escapeHtml(order.drink_name)}</strong>
        ${quantity >= 2 ? `<span class="qty-pill">x${escapeHtml(String(quantity))}</span>` : ""}
      </div>
      <div class="order-edit-summary-meta">
        <span>${escapeHtml(formatTime(order.created_at))}</span>
      </div>
      ${order.notes ? `<div class="order-edit-summary-note">${escapeHtml(order.notes)}</div>` : ""}
    `;
  }

  function renderOrderEditLocation(tableNo = "", seatNo = "", target = "ring") {
    $("#orderEditLocation").innerHTML = `
      ${orderEditChoiceGroup("tableNo", "テーブル", tablesForTarget(target), tableNo)}
      ${orderEditChoiceGroup("seatNo", "席番号", SEATS, tableNo ? seatNo : "", !tableNo || !targetAllowsSeat(target))}
    `;
  }

  function orderEditChoiceGroup(type, label, values, selectedValue = "", hiddenGroup = false) {
    const hidden = hiddenGroup ? " hidden" : "";
    return `
      <fieldset class="control-group choice-panel confirm-choice-panel" data-order-edit-choice-group="${type}"${hidden}>
        <legend>${escapeHtml(label)}</legend>
        <div class="choice-grid ${type === "tableNo" ? "table-choice-grid" : "seat-choice-grid"}">
          ${values.map((value) => `
            <button class="choice-button ${value === CAST_BAR_TABLE ? "choice-button-wide" : ""} ${value === selectedValue ? "active" : ""}" type="button" data-order-edit-choice="${type}" data-choice-value="${escapeHtml(value)}">
              ${escapeHtml(value)}
            </button>
          `).join("")}
        </div>
      </fieldset>
    `;
  }

  function handleOrderEditChoice(event) {
    const button = event.target.closest("[data-order-edit-choice]");
    if (!button) return;
    const group = button.closest("[data-order-edit-choice-group]");
    const wasActive = button.classList.contains("active");
    $$(".choice-button", group).forEach((item) => item.classList.remove("active"));
    if (!wasActive) button.classList.add("active");
    if (button.dataset.orderEditChoice === "tableNo") updateOrderEditSeatVisibility();
  }

  function updateOrderEditTargetVisibility() {
    const target = orderEditTarget();
    const tableNo = activeOrderEditValue("tableNo");
    const seatNo = activeOrderEditValue("seatNo");
    renderOrderEditLocation(tableNo, seatNo, target);
    $("#orderEditLocation").hidden = !targetNeedsLocation(target);
    if (targetNeedsLocation(target)) updateOrderEditSeatVisibility();
  }

  function updateOrderEditSeatVisibility() {
    const location = $("#orderEditLocation");
    const seatGroup = $("[data-order-edit-choice-group='seatNo']", location);
    if (!seatGroup) return;
    const showSeat = targetAllowsSeat(orderEditTarget())
      && Boolean($("[data-order-edit-choice='tableNo'].active", location));
    seatGroup.hidden = !showSeat;
    if (!showSeat) {
      $$("[data-order-edit-choice='seatNo']", seatGroup).forEach((button) => button.classList.remove("active"));
    }
  }

  function closeOrderEdit() {
    const dialog = $("#orderEditDialog");
    if (dialog.open) dialog.close();
    state.editingOrderId = "";
  }

  async function saveOrderEdit() {
    const orderId = state.editingOrderId;
    const order = state.orders.find((item) => item.id === orderId);
    if (!order) return;

    const button = $("#saveOrderEdit");
    button.disabled = true;

    try {
      const target = orderEditTarget();
      const tableNo = targetNeedsLocation(target) ? activeOrderEditValue("tableNo") : "";
      const seatNo = targetAllowsSeat(target) && tableNo ? activeOrderEditValue("seatNo") : "";
      const paymentStatus = orderEditPaymentStatus();
      const patch = {
        target,
        table_no: tableNo,
        seat_no: seatNo,
        payment_status: paymentStatus,
        payment_method: paymentStatus === "uncollected" ? paymentMethodValue("orderEditPaymentMethod") : "cash",
        paid_at: paymentStatus === "uncollected" ? null : order.paid_at,
      };

      const saved = await updateOrder(orderId, patch);
      if (saved) {
        closeOrderEdit();
        toast("オーダー情報を上書きしました");
      }
    } finally {
      button.disabled = false;
    }
  }

  async function deleteOrderEdit() {
    const orderId = state.editingOrderId;
    const order = state.orders.find((item) => item.id === orderId);
    if (!order) return;

    const deleteButton = $("#deleteOrderEdit");
    const saveButton = $("#saveOrderEdit");
    deleteButton.disabled = true;
    saveButton.disabled = true;

    try {
      const deleted = await updateOrder(orderId, { status: "canceled" });
      if (deleted) {
        closeOrderEdit();
      }
    } finally {
      deleteButton.disabled = false;
      saveButton.disabled = false;
    }
  }

  function orderEditTarget() {
    const value = $("input[name='editTarget']:checked")?.value || "ring";
    return ["tournament", "ring", "cast", "bar"].includes(value) ? value : "ring";
  }

  function orderEditPaymentStatus() {
    return $("input[name='editPaymentStatus'][value='paid']")?.checked ? "paid" : "uncollected";
  }

  function activeOrderEditValue(type) {
    return $(`#orderEditLocation [data-order-edit-choice="${type}"].active`)?.dataset.choiceValue || "";
  }

  function renderBar() {
    const openOrders = state.orders.filter((order) => !["served", "canceled"].includes(order.status));
    updateBarOrderBadge(openOrders.length);
    const visibleOrders = state.filter === "open" ? openOrders : state.orders;
    const uncollectedCount = openOrders.filter((order) => order.payment_status === "uncollected").length;
    const oldest = openOrders.length
      ? openOrders.reduce((oldestOrder, order) =>
          new Date(order.created_at) < new Date(oldestOrder.created_at) ? order : oldestOrder
        )
      : null;

    $("#openCount").textContent = String(openOrders.length);
    $("#oldestElapsed").textContent = oldest ? elapsedLabel(oldest.created_at, { short: true }) : "-";
    $("#uncollectedCount").textContent = String(uncollectedCount);

    const container = $("#barOrders");
    if (!visibleOrders.length) {
      container.innerHTML = `<div class="empty-state">表示するオーダーはありません</div>`;
      return;
    }

    container.innerHTML = barOrderColumns(visibleOrders)
      .map((orders) => `<div class="order-column">${orders.map((order) => orderCard(order)).join("")}</div>`)
      .join("");
  }

  function updateBarOrderBadge(count = state.orders.filter((order) => !["served", "canceled"].includes(order.status)).length) {
    const badge = $("#barOrderBadge");
    if (!badge) return;
    badge.hidden = count === 0;
    badge.textContent = count > 99 ? "99+" : String(count);
    $("#headerBarButton")?.setAttribute("aria-label", count ? `バー、未提供${count}件` : "バー");
  }

  function barOrderColumns(orders) {
    const columnCount = 3;
    const perColumn = Math.max(3, Math.ceil(orders.length / columnCount));
    return Array.from({ length: columnCount }, (_, index) => {
      const start = index * perColumn;
      return orders.slice(start, start + perColumn);
    });
  }

  function menuItemOrderCounts() {
    const itemCounts = new Map();
    state.orders.forEach((order) => {
      if (order.status === "canceled") return;
      const name = String(order.drink_name || "").trim();
      if (!name) return;
      itemCounts.set(name, (itemCounts.get(name) || 0) + Number(order.quantity || 1));
    });
    return itemCounts;
  }

  function orderCard(order, options = {}) {
    const isCompleting = state.pendingServeTimers.has(order.id);
    const elapsedMinutes = minutesSince(order.created_at);
    const isWaiting = !["served", "canceled"].includes(order.status);
    const waitingClass = isWaiting && elapsedMinutes >= 10
      ? " wait-critical"
      : isWaiting && elapsedMinutes >= 5
        ? " wait-warning"
        : "";
    const statusClass = `status-${order.status}`;
    const isUncollected = order.payment_status === "uncollected";
    const paymentMethod = normalizePaymentMethod(order.payment_method);
    const paymentClass = isUncollected ? ` payment-uncollected payment-${paymentMethod}` : "";
    const paymentIndicator = isUncollected
      ? `<div class="payment-indicator-row">${paymentMethodIndicator(paymentMethod)}</div>`
      : "";
    const quantity = Math.max(1, Number(order.quantity || 1));
    const quantityPill = quantity >= 2 ? `<span class="qty-pill">x${escapeHtml(String(quantity))}</span>` : "";
    const locationCode = barLocationCode(order);
    const alcoholItem = alcoholMenuItem(order.drink_name);
    const manualButton = alcoholItem
      ? `<button class="order-manual-button" type="button" data-order-manual aria-label="${escapeHtml(order.drink_name)}の作り方" title="作り方">
          <i data-lucide="notebook-tabs" aria-hidden="true"></i>
        </button>`
      : "";
    const note = displayOrderNote(order.notes);
    const isCanceled = order.status === "canceled";
    const interactionLabel = isCompleting
      ? `${order.drink_name}を提供済みにしています。もう一度タップすると取り消します`
      : order.status === "served"
        ? `${order.drink_name}の提供済みを取り消す`
        : isCanceled
          ? `${order.drink_name}、取消済み`
          : `${order.drink_name}を提供済みにする`;

    return `
      <article class="order-card ${statusClass}${paymentClass}${waitingClass}${isCompleting ? " is-completing" : ""}${isCanceled ? " is-static" : ""}"
        data-order-id="${escapeHtml(order.id)}"
        role="button"
        tabindex="${isCanceled ? "-1" : "0"}"
        aria-label="${escapeHtml(interactionLabel)}">
        <div class="order-main">
          ${paymentIndicator}
          <div class="order-destination-row">
            <span class="order-target-label">
              <span>${escapeHtml(barTargetLabel(order))}</span>
              ${locationCode ? `<strong class="order-location-code">${escapeHtml(locationCode)}</strong>` : ""}
            </span>
            <span class="order-time">${escapeHtml(elapsedLabel(order.created_at))}</span>
          </div>
          <div class="order-product-row">
            <span class="order-title">${escapeHtml(order.drink_name)}</span>
            ${manualButton}
            ${quantityPill}
          </div>
          ${note.text ? `<p class="order-note${note.isOptions ? " order-option-note" : ""}">${escapeHtml(note.text)}</p>` : ""}
        </div>
      </article>
    `;
  }

  function displayOrderNote(notes) {
    const text = String(notes || "").trim();
    if (!/^オプション\s*[:：]/.test(text)) return { text, isOptions: false };

    const choices = text
      .replace(/^オプション\s*[:：]\s*/, "")
      .split(/\s*\/\s*/)
      .map((part) => {
        const separatorIndex = part.search(/[:：]/);
        return (separatorIndex >= 0 ? part.slice(separatorIndex + 1) : part).trim();
      })
      .filter(Boolean);

    return { text: choices.join(" / "), isOptions: true };
  }

  function openAlcoholManual(orderId, trigger) {
    const order = state.orders.find((item) => item.id === orderId);
    const item = order ? alcoholMenuItem(order.drink_name) : null;
    if (!order || !item) return;
    $("#alcoholManualTitle").textContent = `${order.drink_name}の作り方`;
    const steps = String(item.recipe || "")
      .split(/\r?\n/)
      .map((step) => step.trim().replace(/^[・●\-\s]+/, ""))
      .filter(Boolean);
    $("#alcoholManualContent").innerHTML = steps.length
      ? `<ol>${steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>`
      : `<p class="manual-empty">作成メモはまだ登録されていません</p>`;
    const dialog = $("#alcoholManualDialog");
    if (dialog.open) dialog.close();
    dialog.show();
    positionAlcoholManual(dialog, trigger);
    scheduleIconRefresh();
  }

  function positionAlcoholManual(dialog, trigger) {
    if (!dialog || !trigger) return;
    const gap = 12;
    const edge = 12;
    const cardRect = trigger.closest("[data-order-id]")?.getBoundingClientRect() || trigger.getBoundingClientRect();
    const preferredWidth = Math.min(560, window.innerWidth - (edge * 2));
    const rightSpace = window.innerWidth - edge - cardRect.right - gap;
    const leftSpace = cardRect.left - edge - gap;
    const minimumSideWidth = 280;
    let width = preferredWidth;
    let left = edge;
    let placement = "below";

    dialog.style.width = "";
    dialog.style.maxHeight = "";

    if (rightSpace >= minimumSideWidth) {
      width = Math.min(preferredWidth, rightSpace);
      left = cardRect.right + gap;
      placement = "side";
    } else if (leftSpace >= minimumSideWidth) {
      width = Math.min(preferredWidth, leftSpace);
      left = cardRect.left - gap - width;
      placement = "side";
    } else {
      left = Math.min(window.innerWidth - edge - width, Math.max(edge, cardRect.left));
      const belowSpace = window.innerHeight - edge - cardRect.bottom - gap;
      const aboveSpace = cardRect.top - edge - gap;
      placement = belowSpace >= aboveSpace ? "below" : "above";
      dialog.style.maxHeight = `${Math.max(120, placement === "below" ? belowSpace : aboveSpace)}px`;
    }

    const minimumWidth = Math.min(240, window.innerWidth - (edge * 2));
    dialog.style.width = `${Math.max(minimumWidth, width)}px`;
    dialog.style.left = `${Math.max(edge, left)}px`;
    const dialogRect = dialog.getBoundingClientRect();
    let top;
    if (placement === "below") {
      top = cardRect.bottom + gap;
    } else if (placement === "above") {
      top = cardRect.top - gap - dialogRect.height;
    } else {
      top = Math.min(window.innerHeight - edge - dialogRect.height, Math.max(edge, cardRect.top));
    }
    dialog.style.top = `${Math.max(edge, top)}px`;
  }

  function closeAlcoholManual() {
    const dialog = $("#alcoholManualDialog");
    if (dialog.open) dialog.close();
  }

  function paymentMethodIndicator(paymentMethod) {
    const visual = paymentMethodVisuals[paymentMethod] || paymentMethodVisuals.unknown;
    const label = escapeHtml(paymentMethodIndicatorLabels[paymentMethod] || paymentMethodIndicatorLabels.unknown);
    let content = `<i data-lucide="${visual.value}" aria-hidden="true"></i>`;
    if (visual.type === "emoji") content = `<span class="payment-method-emoji" aria-hidden="true">${visual.value}</span>`;
    if (visual.type === "image") content = `<img src="${visual.value}" alt="" aria-hidden="true">`;
    if (visual.type === "group") content = paymentVisualGroup(visual.values);
    return `<span class="payment-method-indicator" aria-label="${label}" title="${label}">
      <span class="payment-method-icon payment-visual-${visual.type}" aria-hidden="true">${content}</span>
      <span class="payment-method-indicator-label">${label}</span>
    </span>`;
  }

  function paymentVisualGroup(items) {
    const images = items.map((item) => item.type === "image"
      ? `<img src="${escapeHtml(item.value)}" alt="" aria-hidden="true">`
      : `<span aria-hidden="true">${item.value}</span>`).join("");
    return `<span class="payment-image-group">${images}</span>`;
  }

  function renderPaymentMethodPickers() {
    $$('[data-payment-method-picker]').forEach((picker) => {
      const groupName = picker.dataset.paymentMethodPicker;
      picker.innerHTML = Object.keys(paymentMethodLabels)
        .map((method) => paymentMethodChoiceBlock(groupName, method))
        .join("");
      $$(`input[name='${groupName}']`, picker).forEach((input) => {
        input.addEventListener("change", () => {
          const statusName = groupName === "confirmPaymentMethod" ? "confirmPaymentStatus" : "editPaymentStatus";
          const paidInput = $(`input[name='${statusName}'][value='paid']`);
          if (paidInput && input.checked) paidInput.checked = false;
        });
      });
    });
  }

  function paymentMethodChoiceBlock(groupName, method) {
    const visual = paymentMethodVisuals[method] || paymentMethodVisuals.unknown;
    const label = paymentMethodLabels[method] || paymentMethodLabels.unknown;
    let icon = `<i data-lucide="${escapeHtml(visual.value)}" aria-hidden="true"></i>`;
    if (visual.type === "emoji") icon = `<span class="payment-choice-emoji" aria-hidden="true">${visual.value}</span>`;
    if (visual.type === "image") icon = `<img src="${escapeHtml(visual.value)}" alt="" aria-hidden="true">`;
    if (visual.type === "group") icon = paymentVisualGroup(visual.values);
    return `
      <label class="payment-method-choice">
        <input type="radio" name="${escapeHtml(groupName)}" value="${escapeHtml(method)}">
        <span class="payment-method-choice-content">
          <span class="payment-choice-icon payment-visual-${escapeHtml(visual.type)}">${icon}</span>
          <span class="payment-choice-label">${escapeHtml(label)}</span>
        </span>
      </label>
    `;
  }

  function paymentMethodValue(groupName) {
    return normalizePaymentMethod($(`input[name='${groupName}']:checked`)?.value || "cash");
  }

  function setPaymentMethodValue(groupName, value) {
    const normalized = normalizePaymentMethod(value);
    const input = $(`input[name='${groupName}'][value='${normalized}']`)
      || $(`input[name='${groupName}'][value='cash']`);
    if (input) input.checked = true;
  }

  function clearPaymentMethodValue(groupName) {
    $$(`input[name='${groupName}']`).forEach((input) => {
      input.checked = false;
    });
  }

  function normalizePaymentMethod(value) {
    if (value === "id" || value === "transit") return "card";
    return Object.prototype.hasOwnProperty.call(paymentMethodLabels, value) ? value : "cash";
  }

  function barTargetLabel(order) {
    if (order.target === "tournament") return "トナメ";
    if (order.target === "ring") return "リング";
    if (order.target === "cast") return "キャスドリ";
    return targetLabels[order.target] || order.target;
  }

  function barLocationCode(order) {
    if (!order.table_no && !order.seat_no) return "";
    const table = String(order.table_no || "").trim();
    const seat = String(order.seat_no || "").trim();
    return table && seat ? `${table}-${seat}` : table || seat;
  }

  function barLocationBadges(order) {
    if (!order.table_no && !order.seat_no) return "";
    const badges = [];
    if (order.table_no) badges.push(`<span class="order-location-label">${escapeHtml(order.table_no)}卓</span>`);
    if (order.seat_no) badges.push(`<span class="order-location-label">${escapeHtml(order.seat_no)}番席</span>`);
    return badges.join("");
  }

  function locationLabel(order) {
    if (order.target === "bar") return "バーカウンター";
    const table = order.table_no ? `T${order.table_no}` : "テーブル未指定";
    if (order.target === "cast") return table;
    const seat = order.seat_no ? `席${order.seat_no}` : "席未指定";
    return `${table} / ${seat}`;
  }

  function elapsedLabel(dateString, options = {}) {
    const minutes = minutesSince(dateString);
    if (minutes < 1) return options.short ? "1分未満" : "経過 1分未満";
    if (minutes < 60) return options.short ? `${minutes}分` : `経過 ${minutes}分`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return options.short ? `${hours}時間${rest}分` : `経過 ${hours}時間${rest}分`;
  }

  function minutesSince(dateString) {
    return Math.max(0, Math.floor((Date.now() - new Date(dateString).getTime()) / 60000));
  }

  function formatTime(dateString) {
    return new Intl.DateTimeFormat("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(dateString));
  }

  function upsertOrder(order) {
    const index = state.orders.findIndex((item) => item.id === order.id);
    if (index >= 0) state.orders[index] = order;
    else state.orders.unshift(order);
    sortOrders();
  }

  function pruneCompletedHistory(now = Date.now()) {
    state.orders = state.orders.filter((order) => {
      if (!isCompletedOrder(order)) return true;
      return now - completedOrderTime(order) < COMPLETED_HISTORY_MS;
    });
  }

  function isCompletedOrder(order) {
    return ["served", "canceled"].includes(order.status);
  }

  function completedOrderTime(order) {
    const value = order.served_at || order.updated_at || order.created_at;
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  function sortOrders() {
    state.orders.sort((a, b) => {
      const aDone = isCompletedOrder(a);
      const bDone = isCompletedOrder(b);
      if (aDone !== bDone) return aDone ? 1 : -1;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }

  function normalizeOrder(order) {
    const isStoredCast = order.target === CAST_STORAGE_TARGET && order.seat_no === CAST_STORAGE_SEAT;
    return {
      id: order.id,
      created_at: order.created_at,
      updated_at: order.updated_at || order.created_at,
      source: order.source || "reception",
      drink_name: order.drink_name || "",
      quantity: Number(order.quantity || 1),
      target: isStoredCast ? "cast" : order.target || "ring",
      table_no: order.table_no || "",
      seat_no: isStoredCast ? "" : order.seat_no || "",
      payment_status: order.payment_status || "uncollected",
      payment_method: normalizePaymentMethod(order.payment_method || "cash"),
      notes: order.notes || "",
      status: order.status || "ordered",
      made_at: order.made_at || null,
      served_at: order.served_at || null,
      paid_at: order.paid_at || null,
      events: Array.isArray(order.events) ? order.events : [],
    };
  }

  function toDatabaseRow(order) {
    const isCast = order.target === "cast";
    return {
      id: order.id,
      created_at: order.created_at,
      updated_at: order.updated_at,
      source: order.source,
      drink_name: order.drink_name,
      quantity: order.quantity,
      target: isCast ? CAST_STORAGE_TARGET : order.target,
      table_no: order.table_no,
      seat_no: isCast ? CAST_STORAGE_SEAT : order.seat_no,
      payment_status: order.payment_status,
      payment_method: order.payment_method,
      notes: order.notes,
      status: order.status,
      made_at: order.made_at,
      served_at: order.served_at,
      paid_at: order.paid_at,
      events: order.events,
    };
  }

  function eventEntry(type) {
    return { type, at: new Date().toISOString() };
  }

  function openConfig() {
    const config = readConfig();
    $("#supabaseUrl").value = config.url || "";
    $("#supabaseAnonKey").value = config.anonKey || "";
    state.configDraftMenu = normalizeMenu(state.menu, { allowEmpty: true });
    state.configDraftOptionTemplates = cloneOptionGroups(state.optionTemplates);
    state.configSection = "drinks";
    renderMenuEditor();
    updateConfigSectionUi();
    updateSoundButton();
    hideConfigUnsavedPrompt();
    state.configSnapshot = configDraftSnapshot();
    $("#configDialog").showModal();
  }

  function selectConfigSection(sectionId) {
    if (!["drinks", "bell", "manual"].includes(sectionId)) return;
    if (state.configSection === "drinks") syncActiveMenuEditorCategory();
    state.configSection = sectionId;
    if (sectionId === "drinks") renderMenuEditor();
    if (sectionId === "manual") renderAlcoholManualEditor();
    updateConfigSectionUi();
  }

  function updateConfigSectionUi() {
    $$("[data-config-section]").forEach((button) => {
      const active = button.dataset.configSection === state.configSection;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    $$("[data-config-section-panel]").forEach((panel) => {
      const active = panel.dataset.configSectionPanel === state.configSection;
      panel.hidden = !active;
      panel.classList.toggle("active", active);
    });
    scheduleIconRefresh();
  }

  function renderAlcoholManualEditor() {
    const container = $("#alcoholManualEditor");
    if (!container) return;
    const category = alcoholMenuCategory(configEditorMenu());
    if (!category?.items.length) {
      container.innerHTML = `<div class="menu-editor-empty">アルコール商品がありません</div>`;
      return;
    }
    container.innerHTML = category.items.map((item) => `
      <label class="alcohol-manual-editor-item">
        <strong>${escapeHtml(item.name)}</strong>
        <textarea data-alcohol-recipe-item="${escapeHtml(item.id)}" placeholder="例:\nグラスに氷を入れる\n材料を注いで混ぜる">${escapeHtml(item.recipe || "")}</textarea>
      </label>
    `).join("");
  }

  function handleAlcoholManualInput(event) {
    const input = event.target.closest("[data-alcohol-recipe-item]");
    if (!input) return;
    const category = alcoholMenuCategory(configEditorMenu());
    const item = category?.items.find((entry) => entry.id === input.dataset.alcoholRecipeItem);
    if (item) item.recipe = input.value.trim();
  }

  async function saveConfig(event) {
    event?.preventDefault();
    const url = $("#supabaseUrl").value.trim();
    const anonKey = $("#supabaseAnonKey").value.trim();
    const nextMenu = readMenuSettingsFromForm();
    const nextOptionTemplates = cloneOptionGroups(configEditorOptionTemplates());
    state.menu = nextMenu;
    state.optionTemplates = nextOptionTemplates;
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ url, anonKey }));
    localStorage.setItem(MENU_KEY, JSON.stringify(nextMenu));
    localStorage.setItem(OPTION_TEMPLATES_KEY, JSON.stringify(nextOptionTemplates));
    state.configSnapshot = configDraftSnapshot();
    renderMenuPickers();
    hideConfigUnsavedPrompt();
    $("#configDialog").close();
    teardownSupabase();
    await configureSupabaseFromStorage();
    if (state.syncMode === "supabase" && state.supabase) {
      const existingSettings = await fetchSharedSettings();
      if (!state.sharedSettingsLoaded && sharedSettingsHasMenu(existingSettings)) {
        applySharedSettings(existingSettings);
      } else {
        await saveSharedSettings(nextMenu);
      }
      await saveSharedOptionTemplates(nextOptionTemplates);
    }
    await loadOrders();
    state.orders.forEach((order) => state.knownIds.add(order.id));
    render();
    toast("設定を保存しました");
  }

  function requestCloseConfig() {
    if (configHasUnsavedChanges()) {
      showConfigUnsavedPrompt();
      return;
    }
    hideConfigUnsavedPrompt();
    $("#configDialog").close();
  }

  function configDraftSnapshot() {
    return JSON.stringify({
      config: {
        url: $("#supabaseUrl").value.trim(),
        anonKey: $("#supabaseAnonKey").value.trim(),
      },
      menu: readMenuSettingsFromForm(),
      optionTemplates: configEditorOptionTemplates(),
    });
  }

  function configHasUnsavedChanges() {
    return $("#configDialog").open && configDraftSnapshot() !== state.configSnapshot;
  }

  function showConfigUnsavedPrompt() {
    $("#configUnsavedPrompt").hidden = false;
    scheduleIconRefresh();
  }

  function hideConfigUnsavedPrompt() {
    $("#configUnsavedPrompt").hidden = true;
  }

  async function clearConfig() {
    localStorage.removeItem(CONFIG_KEY);
    $("#supabaseUrl").value = DEFAULT_SUPABASE_URL;
    $("#supabaseAnonKey").value = DEFAULT_SUPABASE_ANON_KEY;
    state.sharedSettingsLoaded = false;
    $("#configDialog").close();
    teardownSupabase();
    await configureSupabaseFromStorage();
    await loadSharedSettings();
    await loadOrders();
    render();
    toast("共有同期に戻しました");
  }

  function readConfig() {
    try {
      const saved = JSON.parse(localStorage.getItem(CONFIG_KEY) || "null");
      return {
        url: saved?.url || DEFAULT_SUPABASE_URL,
        anonKey: saved?.anonKey || DEFAULT_SUPABASE_ANON_KEY,
      };
    } catch {
      return {
        url: DEFAULT_SUPABASE_URL,
        anonKey: DEFAULT_SUPABASE_ANON_KEY,
      };
    }
  }

  function readMenuSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(MENU_KEY) || "null");
      if (saved) {
        return ensureRequiredMenuCategories(saved);
      }

      const legacyDrinks = JSON.parse(localStorage.getItem(LEGACY_DRINKS_KEY) || "null");
      if (Array.isArray(legacyDrinks)) {
        return ensureRequiredMenuCategories([
          {
            id: "soft",
            label: "ソフドリ",
            subcategories: [{ id: DEFAULT_SUBCATEGORY_ID, label: DEFAULT_SUBCATEGORY_LABEL }],
            items: parseMenuItems(legacyDrinks),
          },
          ...DEFAULT_MENU.slice(1),
        ]);
      }

      if (Array.isArray(INITIAL_SETTINGS.menu) && INITIAL_SETTINGS.menu.length) {
        return ensureRequiredMenuCategories(INITIAL_SETTINGS.menu);
      }
    } catch {
    }

    if (Array.isArray(INITIAL_SETTINGS.menu) && INITIAL_SETTINGS.menu.length) {
      return ensureRequiredMenuCategories(INITIAL_SETTINGS.menu);
    }
    return ensureRequiredMenuCategories(DEFAULT_MENU);
  }

  function readOptionTemplates() {
    try {
      const saved = JSON.parse(localStorage.getItem(OPTION_TEMPLATES_KEY) || "null");
      if (Array.isArray(saved)) return normalizeOptionTemplates(saved);
    } catch {
    }
    if (Array.isArray(INITIAL_SETTINGS.optionTemplates)) {
      return normalizeOptionTemplates(INITIAL_SETTINGS.optionTemplates);
    }
    return normalizeOptionTemplates(DEFAULT_OPTION_TEMPLATES);
  }

  function normalizeOptionTemplates(templates) {
    return cloneOptionGroups(normalizeOptionGroups({ optionGroups: Array.isArray(templates) ? templates : [] }));
  }

  function readMenuSettingsFromForm() {
    if (state.configSection === "drinks") syncActiveMenuEditorCategory();
    return normalizeMenu(configEditorMenu(), { allowEmpty: true });
  }

  function menuEditorCategoryFromBlock(block, index = 0) {
    if (!block) return null;
    const label = $("[data-menu-label]", block)?.value.trim();
    if (!label) return null;
    const subcategories = subcategoriesFromEditorBlock(block);
    const items = $$("[data-menu-editor-item]", block)
      .map((row, itemIndex) => {
        const name = $("[data-menu-item-name]", row)?.value.trim();
        if (!name) return null;
        return {
          id: $("[data-menu-item-id]", row)?.value || makeMenuId(name, itemIndex),
          name,
          price: normalizePrice($("[data-menu-item-price]", row)?.value),
          subcategory_id:
            subcategoryIdFromEditorRow(row.closest("[data-menu-editor-subcategory]")) ||
            $("[data-menu-item-subcategory]", row)?.value ||
            subcategories[0]?.id ||
            DEFAULT_SUBCATEGORY_ID,
          recipe: $("[data-menu-item-recipe]", row)?.value.trim() || "",
          optionGroups: readMenuEditorItemOptionGroups(row),
        };
      })
      .filter(Boolean);
    return {
      id: $("[data-menu-id]", block)?.value || makeMenuId(label, index),
      label,
      subcategories,
      items,
    };
  }

  function configEditorMenu() {
    return Array.isArray(state.configDraftMenu) ? state.configDraftMenu : state.menu;
  }

  function configEditorOptionTemplates() {
    return Array.isArray(state.configDraftOptionTemplates)
      ? state.configDraftOptionTemplates
      : state.optionTemplates;
  }

  function syncActiveMenuEditorCategory() {
    const block = $("#menuEditor [data-menu-editor-category]");
    if (!block) return;
    const currentId = menuEditorCategoryIdFromBlock(block);
    const category = menuEditorCategoryFromBlock(block);
    if (!category) return;
    const menu = [...configEditorMenu()];
    const index = menu.findIndex((item) => item.id === currentId);
    if (index >= 0) menu[index] = category;
    else menu.push(category);
    state.configDraftMenu = menu;
  }

  function normalizeMenu(menu, options = {}) {
    const source = Array.isArray(menu)
      ? menu
      : DEFAULT_MENU.map((category) => ({
          ...category,
          items: parseMenuItems(menu?.[category.id] || []).map((name) => ({ name, price: 0, optionGroups: [] })),
        }));
    const usedIds = new Set();
    const normalized = source
      .map((category, index) => {
        const label = String(category.label || "").trim();
        if (!label) return null;
        const id = uniqueMenuId(makeMenuId(category.id || label, index), usedIds);
        const fallback = normalizeMenuItems(DEFAULT_MENU[index]?.items || []);
        const parsed = normalizeMenuItems(category.items || []);
        const rawItems = parsed.length || options.allowEmpty ? parsed : [...fallback];
        const subcategories = normalizeSubcategories(category, rawItems);
        return {
          id,
          label,
          subcategories,
          items: rawItems.map((item) => assignItemSubcategory(item, subcategories)),
        };
      })
      .filter(Boolean);

    return normalized.length ? normalized : cloneDefaultMenu();
  }

  function ensureRequiredMenuCategories(menu) {
    const normalized = normalizeMenu(menu, { allowEmpty: true });
    const initialCategories = Array.isArray(INITIAL_SETTINGS.menu) ? INITIAL_SETTINGS.menu : [];
    const missingCategories = initialCategories.filter((initialCategory) =>
      REQUIRED_MENU_CATEGORY_IDS.includes(initialCategory?.id)
      && !normalized.some((category) =>
        category.id === initialCategory.id || category.label === initialCategory.label
      )
    );

    if (!missingCategories.length) return normalized;
    return normalizeMenu([...normalized, ...missingCategories], { allowEmpty: true });
  }

  function cloneDefaultMenu() {
    return DEFAULT_MENU.map((category) => ({
      ...category,
      subcategories: (category.subcategories || []).map((subcategory) => ({ ...subcategory })),
      items: category.items.map((item) => ({
        ...item,
        optionGroups: cloneOptionGroups(item.optionGroups || []),
      })),
    }));
  }

  function normalizeMenuItems(items) {
    const source = Array.isArray(items) ? items : parseMenuItems(items);
    const usedIds = new Set();
    return source
      .map((item, index) => normalizeMenuItem(item, index, usedIds))
      .filter(Boolean);
  }

  function normalizeMenuItem(item, index, usedIds) {
    if (typeof item === "string") {
      const name = item.trim();
      if (!name) return null;
      return {
        id: uniqueMenuId(makeMenuId(name, index), usedIds),
        name,
        price: 0,
        subcategory_id: "",
        recipe: "",
        optionGroups: [],
      };
    }

    const name = String(item?.name || item?.label || item?.title || item?.value || "").trim();
    if (!name) return null;
    const subcategoryId = String(item?.subcategory_id || item?.subcategoryId || item?.subCategoryId || "").trim();
    const subcategoryLabel = String(item?.subcategory_label || item?.subcategoryLabel || item?.subcategory || item?.subCategory || "").trim();
    return {
      id: uniqueMenuId(makeMenuId(item?.id || name, index), usedIds),
      name,
      price: normalizePrice(item?.price || item?.amount || item?.yen || 0),
      subcategory_id: subcategoryId,
      subcategory_label: subcategoryLabel,
      recipe: String(item?.recipe || item?.manual || item?.instructions || "").trim(),
      optionGroups: normalizeOptionGroups(item),
    };
  }

  function normalizeSubcategories(category, items) {
    const rawSubcategories =
      category?.subcategories || category?.sub_categories || category?.subCategories || category?.groups || [];
    const usedIds = new Set();
    let subcategories = Array.isArray(rawSubcategories)
      ? rawSubcategories
          .map((subcategory, index) => normalizeSubcategory(subcategory, index, usedIds))
          .filter(Boolean)
      : [];

    if (!subcategories.length) {
      const labels = uniqueList(items.map((item) => item.subcategory_label).filter(Boolean));
      subcategories = labels.map((label, index) => normalizeSubcategory({ label }, index, usedIds)).filter(Boolean);
    }

    if (!subcategories.length) {
      subcategories = [{ id: DEFAULT_SUBCATEGORY_ID, label: DEFAULT_SUBCATEGORY_LABEL }];
    }

    return subcategories;
  }

  function normalizeSubcategory(subcategory, index, usedIds) {
    if (typeof subcategory === "string") {
      const label = subcategory.trim();
      if (!label) return null;
      return {
        id: uniqueMenuId(makeMenuId(label, index), usedIds),
        label,
      };
    }

    const label = String(subcategory?.label || subcategory?.name || subcategory?.title || "").trim();
    if (!label) return null;
    return {
      id: uniqueMenuId(makeMenuId(subcategory?.id || label, index), usedIds),
      label,
    };
  }

  function assignItemSubcategory(item, subcategories) {
    const matchedById = subcategories.find((subcategory) => subcategory.id === item.subcategory_id);
    const matchedByLabel = subcategories.find((subcategory) => subcategory.label === item.subcategory_label);
    const subcategory = matchedById || matchedByLabel || subcategories[0];
    const { subcategory_label: _subcategoryLabel, ...nextItem } = item;
    return {
      ...nextItem,
      subcategory_id: subcategory?.id || DEFAULT_SUBCATEGORY_ID,
    };
  }

  function normalizePrice(value) {
    const numeric = Number(String(value ?? 0).replace(/[^\d.-]/g, ""));
    if (!Number.isFinite(numeric) || numeric < 0) return 0;
    return Math.round(numeric);
  }

  function formatPrice(value) {
    return `¥${normalizePrice(value).toLocaleString("ja-JP")}`;
  }

  function priceSuggestionValues() {
    return DEFAULT_PRICE_SUGGESTIONS;
  }

  function priceStepValues(currentPrice) {
    return uniqueList([...priceSuggestionValues(), normalizePrice(currentPrice)])
      .map(normalizePrice)
      .sort((a, b) => a - b);
  }

  function stepPriceSuggestion(input, direction) {
    const current = normalizePrice(input.value);
    const prices = priceStepValues(current);
    if (!prices.length) return;
    const next = direction > 0
      ? prices.find((price) => price > current) ?? prices[prices.length - 1]
      : [...prices].reverse().find((price) => price < current) ?? prices[0];
    input.value = String(next);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function normalizeOptionGroups(item) {
    const rawGroups = item?.optionGroups || item?.option_groups || item?.optionCategories || item?.option_categories;
    if (Array.isArray(rawGroups)) {
      const usedIds = new Set();
      return rawGroups
        .map((group, index) => normalizeOptionGroup(group, index, usedIds))
        .filter(Boolean);
    }

    const legacyOptions = parseMenuItems(item?.options || []);
    if (!legacyOptions.length) return [];
    return [
      {
        id: "options",
        label: "オプション",
        required: false,
        choices: legacyOptions,
      },
    ];
  }

  function normalizeOptionGroup(group, index, usedIds) {
    const label = String(group?.label || group?.name || group?.title || "").trim();
    if (!label) return null;
    const choices = parseMenuItems(group?.choices || group?.options || group?.items || []);
    return {
      id: uniqueMenuId(makeMenuId(group?.id || label, index), usedIds),
      label,
      required: Boolean(group?.required || group?.isRequired || group?.requiredChoice),
      choices,
    };
  }

  function cloneOptionGroups(groups) {
    return groups.map((group) => ({
      ...group,
      choices: [...(group.choices || [])],
    }));
  }

  function parseMenuItems(value) {
    const rawItems = Array.isArray(value) ? value : String(value || "").split(/\r?\n/);
    const cleaned = rawItems
      .map((item) => String(item).trim())
      .filter(Boolean);
    return uniqueList(cleaned);
  }

  function uniqueList(items) {
    return items.filter((item, index) => items.indexOf(item) === index);
  }

  function makeMenuId(value, index) {
    const normalized = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return normalized || `category-${index + 1}`;
  }

  function uniqueMenuId(id, usedIds) {
    let nextId = id;
    let suffix = 2;
    while (usedIds.has(nextId)) {
      nextId = `${id}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(nextId);
    return nextId;
  }

  function renderMenuEditor() {
    const menu = configEditorMenu();
    const activeId = activeMenuEditorCategoryId(menu);
    const activeCategory = menu.find((category) => category.id === activeId);
    $("#menuEditor").innerHTML = `
      ${menuEditorCategoryTabs(menu, activeId)}
      <div class="menu-editor-panels" data-menu-editor-panels>
        ${activeCategory ? menuEditorBlock(activeCategory, activeId) : ""}
      </div>
    `;
    scheduleIconRefresh();
  }

  function activeMenuEditorCategoryId(menu) {
    const ids = menu.map((category) => category.id);
    const activeId = ids.includes(state.configActiveCategoryId) ? state.configActiveCategoryId : ids[0] || "";
    state.configActiveCategoryId = activeId;
    return activeId;
  }

  function menuEditorCategoryTabs(menu, activeId) {
    return `
      <div class="menu-editor-category-tabs" data-menu-editor-category-tabs aria-label="編集するカテゴリ">
        ${menu.map((category) => menuEditorCategoryTabBlock(category.id, category.label, category.items.length, activeId)).join("")}
      </div>
    `;
  }

  function menuEditorCategoryTabBlock(id, label, itemCount, activeId) {
    const isActive = id === activeId;
    return `
      <button class="menu-editor-category-tab ${isActive ? "active" : ""}" type="button" data-config-category-tab="${escapeHtml(id)}" aria-pressed="${isActive}">
        <span>${escapeHtml(label)}</span>
        <small>${escapeHtml(String(itemCount))}</small>
      </button>
    `;
  }

  function menuEditorCategoryIdFromBlock(block, index = 0) {
    return $("[data-menu-id]", block)?.value || `category-${index + 1}`;
  }

  function refreshMenuEditorCategoryTabs(preferredId = state.configActiveCategoryId) {
    syncActiveMenuEditorCategory();
    const tabs = $("[data-menu-editor-category-tabs]");
    if (!tabs) return;
    const menu = configEditorMenu();
    if (!menu.length) return;
    const ids = menu.map((category) => category.id);
    const activeId = ids.includes(preferredId) ? preferredId : ids[0];
    tabs.innerHTML = menu
      .map((category) => menuEditorCategoryTabBlock(category.id, category.label, category.items.length, activeId))
      .join("");
    const currentBlock = $("#menuEditor [data-menu-editor-category]");
    if (!currentBlock || menuEditorCategoryIdFromBlock(currentBlock) !== activeId) {
      renderActiveMenuEditorCategory(activeId);
    } else {
      state.configActiveCategoryId = activeId;
    }
  }

  function selectMenuEditorCategory(categoryId) {
    if (!configEditorMenu().some((category) => category.id === categoryId)) return;
    syncActiveMenuEditorCategory();
    state.configActiveCategoryId = categoryId;
    $$("[data-config-category-tab]").forEach((button) => {
      const active = button.dataset.configCategoryTab === categoryId;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    renderActiveMenuEditorCategory(categoryId);
  }

  function renderActiveMenuEditorCategory(categoryId) {
    const panels = $("[data-menu-editor-panels]");
    const category = configEditorMenu().find((item) => item.id === categoryId);
    if (!panels || !category) return;
    state.configActiveCategoryId = categoryId;
    panels.innerHTML = menuEditorBlock(category, categoryId);
    scheduleIconRefresh();
  }

  function menuEditorBlock(category, activeId) {
    const isActive = category.id === activeId;
    const subcategories = category.subcategories || [];
    return `
      <section class="menu-editor-row ${isActive ? "active" : ""}" data-menu-editor-category ${isActive ? "" : "hidden"}>
        <input data-menu-id type="hidden" value="${escapeHtml(category.id)}">
        <div class="menu-editor-category-head">
          <label>
            <span>カテゴリ</span>
            <input data-menu-label type="text" value="${escapeHtml(category.label)}">
          </label>
          <button class="icon-button danger-button" type="button" data-remove-menu-category aria-label="カテゴリ削除" title="カテゴリ削除">
            <i data-lucide="trash-2" aria-hidden="true"></i>
          </button>
        </div>
        <div class="menu-editor-subcategories">
          <div class="menu-editor-subcategory-head">
            <span class="menu-editor-subtitle">サブカテゴリと商品</span>
          </div>
          <div class="menu-editor-subcategory-list" data-menu-editor-subcategories>
            ${subcategories.map((subcategory) => menuEditorSubcategoryBlock(subcategory, itemsForEditorSubcategory(category.items, subcategory.id))).join("")}
          </div>
          <button class="button button-quiet menu-add-subcategory" type="button" data-add-menu-subcategory>
            <i data-lucide="plus" aria-hidden="true"></i>
            <span>サブカテゴリ追加</span>
          </button>
        </div>
      </section>
    `;
  }

  function itemsForEditorSubcategory(items = [], subcategoryId) {
    return items.filter((item) => item.subcategory_id === subcategoryId);
  }

  function menuEditorSubcategoryBlock(subcategory, items = []) {
    const itemBlocks = items.length
      ? items.map((item) => menuEditorItemBlock(item, { subcategoryId: subcategory.id })).join("")
      : `<div class="menu-editor-empty">この中にドリンクを追加できます</div>`;
    return `
      <section class="menu-editor-subcategory" data-menu-editor-subcategory>
        <div class="menu-editor-subcategory-bar">
          <input data-menu-subcategory-id type="hidden" value="${escapeHtml(subcategory.id || "")}">
          <input data-menu-subcategory-label type="text" value="${escapeHtml(subcategory.label || "")}" placeholder="例: 水、お茶">
          <button class="icon-button danger-button" type="button" data-remove-menu-subcategory aria-label="サブカテゴリ削除" title="サブカテゴリ削除">
            <i data-lucide="trash-2" aria-hidden="true"></i>
          </button>
        </div>
        <div class="menu-editor-items" data-menu-editor-items>
          ${itemBlocks}
        </div>
        <button class="button button-quiet menu-add-item" type="button" data-add-menu-item>
          <i data-lucide="plus" aria-hidden="true"></i>
          <span>この中にドリンク追加</span>
        </button>
      </section>
    `;
  }

  function subcategoriesFromEditorBlock(categoryBlock) {
    const usedIds = new Set();
    const subcategories = $$("[data-menu-editor-subcategory]", categoryBlock)
      .map((row, index) => {
        const label = $("[data-menu-subcategory-label]", row)?.value.trim() || "";
        if (!label) return null;
        return {
          id: uniqueMenuId(subcategoryIdFromEditorRow(row, index) || makeMenuId(label, index), usedIds),
          label,
        };
      })
      .filter(Boolean);

    return subcategories.length
      ? subcategories
      : [{ id: DEFAULT_SUBCATEGORY_ID, label: DEFAULT_SUBCATEGORY_LABEL }];
  }

  function subcategoryIdFromEditorRow(row, index = 0) {
    if (!row) return "";
    return $("[data-menu-subcategory-id]", row)?.value || makeMenuId($("[data-menu-subcategory-label]", row)?.value || DEFAULT_SUBCATEGORY_LABEL, index);
  }

  function refreshItemSubcategoryOptions(categoryBlock) {
    if (!categoryBlock) return;
    $$("[data-menu-editor-subcategory]", categoryBlock).forEach((subcategory, index) => {
      const subcategoryId = subcategoryIdFromEditorRow(subcategory, index) || DEFAULT_SUBCATEGORY_ID;
      $$("[data-menu-item-subcategory]", subcategory).forEach((input) => {
        input.value = subcategoryId;
      });
    });
  }

  function addMenuEditorSubcategory(categoryBlock) {
    if (!categoryBlock) return;
    const index = $$("[data-menu-editor-subcategory]", categoryBlock).length;
    const id = `subcategory-${Date.now()}-${index}`;
    $("[data-menu-editor-subcategories]", categoryBlock).insertAdjacentHTML(
      "beforeend",
      menuEditorSubcategoryBlock({ id, label: `サブカテゴリ${index + 1}` }, [])
    );
    refreshItemSubcategoryOptions(categoryBlock);
  }

  function removeMenuEditorSubcategory(row) {
    const categoryBlock = row?.closest("[data-menu-editor-category]");
    if (!row || !categoryBlock) return;
    row.remove();
    if (!$$("[data-menu-editor-subcategory]", categoryBlock).length) {
      $("[data-menu-editor-subcategories]", categoryBlock).insertAdjacentHTML(
        "beforeend",
        menuEditorSubcategoryBlock({ id: DEFAULT_SUBCATEGORY_ID, label: DEFAULT_SUBCATEGORY_LABEL }, [])
      );
    }
    refreshItemSubcategoryOptions(categoryBlock);
  }

  function menuEditorItemBlock(item, options = {}) {
    const isOpen = Boolean(options.open);
    const price = normalizePrice(item.price);
    const subcategoryId = options.subcategoryId || item.subcategory_id || DEFAULT_SUBCATEGORY_ID;
    const optionGroups = cloneOptionGroups(item.optionGroups || []);
    return `
      <div class="menu-editor-item ${isOpen ? "open" : ""}" data-menu-editor-item>
        <input data-menu-item-id type="hidden" value="${escapeHtml(item.id || "")}">
        <input data-menu-item-subcategory type="hidden" value="${escapeHtml(subcategoryId)}">
        <input data-menu-item-options type="hidden" value="${escapeHtml(JSON.stringify(optionGroups))}">
        <textarea data-menu-item-recipe hidden>${escapeHtml(item.recipe || "")}</textarea>
        <div class="menu-editor-item-main">
          <div class="menu-editor-product-fields">
            <label>
              <span>商品名</span>
              <input data-menu-item-name type="text" value="${escapeHtml(item.name || "")}">
            </label>
            <label>
              <span>価格</span>
              <input data-menu-item-price type="number" min="0" step="10" value="${escapeHtml(String(price))}">
            </label>
          </div>
          <div class="menu-editor-item-detail" data-menu-editor-item-detail ${isOpen ? 'data-hydrated="true"' : ""}>
            ${isOpen ? menuEditorItemDetailBlock(optionGroups) : ""}
          </div>
        </div>
        <div class="menu-editor-item-actions">
          <button class="button button-quiet menu-edit-item" type="button" data-edit-menu-item aria-expanded="${isOpen}" aria-label="${isOpen ? "閉じる" : "編集"}" title="${isOpen ? "閉じる" : "編集"}">
            <i data-lucide="pencil" aria-hidden="true"></i>
          </button>
          <button class="icon-button danger-button" type="button" data-remove-menu-item aria-label="商品削除" title="商品削除">
            <i data-lucide="trash-2" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    `;
  }

  function setMenuEditorItemOpen(item, isOpen) {
    if (!item) return;
    if (isOpen) hydrateMenuEditorItemDetail(item);
    else releaseMenuEditorItemDetail(item);
    item.classList.toggle("open", isOpen);
    const editButton = $("[data-edit-menu-item]", item);
    if (!editButton) return;
    editButton.setAttribute("aria-expanded", String(isOpen));
    editButton.setAttribute("aria-label", isOpen ? "閉じる" : "編集");
    editButton.setAttribute("title", isOpen ? "閉じる" : "編集");
    if (!isOpen) {
      closeOptionTemplatePicker(item);
      closeOptionTemplateEditor(item);
    }
  }

  function menuEditorItemDetailBlock(optionGroups = []) {
    return `
      <div class="menu-editor-options-block">
        <span class="menu-editor-subtitle">オプションカテゴリ</span>
        ${menuEditorOptionTemplateButtons()}
        <div class="menu-editor-template-picker" data-option-template-picker hidden></div>
        <div class="menu-editor-template-editor" data-option-template-editor hidden></div>
        <div class="menu-editor-option-groups" data-menu-editor-option-groups>
          ${optionGroups.map((group) => menuEditorOptionGroupBlock(group)).join("")}
        </div>
        <button class="button button-quiet menu-add-option" type="button" data-add-menu-option-group>
          <i data-lucide="plus" aria-hidden="true"></i>
          <span>オプションカテゴリ作成</span>
        </button>
      </div>
    `;
  }

  function hydrateMenuEditorItemDetail(item) {
    const detail = $("[data-menu-editor-item-detail]", item);
    if (!detail || detail.dataset.hydrated === "true") return;
    delete detail.dataset.releaseToken;
    detail.innerHTML = menuEditorItemDetailBlock(readStoredMenuEditorItemOptionGroups(item));
    detail.dataset.hydrated = "true";
  }

  function releaseMenuEditorItemDetail(item) {
    const detail = $("[data-menu-editor-item-detail]", item);
    if (!detail || detail.dataset.hydrated !== "true") return;
    storeMenuEditorItemOptionGroups(item);
    const releaseToken = `${Date.now()}-${Math.random()}`;
    detail.dataset.releaseToken = releaseToken;
    window.setTimeout(() => {
      if (
        item.classList.contains("open") ||
        detail.dataset.hydrated !== "true" ||
        detail.dataset.releaseToken !== releaseToken
      ) return;
      detail.innerHTML = "";
      delete detail.dataset.hydrated;
      delete detail.dataset.releaseToken;
    }, 210);
  }

  function readStoredMenuEditorItemOptionGroups(item) {
    try {
      const stored = JSON.parse($("[data-menu-item-options]", item)?.value || "[]");
      return cloneOptionGroups(normalizeOptionGroups({ optionGroups: stored }));
    } catch {
      return [];
    }
  }

  function readHydratedMenuEditorItemOptionGroups(item) {
    return $$("[data-menu-editor-option-group]", item)
      .map((group, groupIndex) => {
        const label = $("[data-menu-option-group-label]", group)?.value.trim();
        if (!label) return null;
        const choices = $$("[data-menu-option-choice]", group)
          .map((choiceRow) => $("[data-menu-option-choice-input]", choiceRow)?.value.trim())
          .filter(Boolean);
        return {
          id: $("[data-menu-option-group-id]", group)?.value || makeMenuId(label, groupIndex),
          label,
          required: Boolean($("[data-menu-option-group-required]", group)?.checked),
          choices: uniqueList(choices),
        };
      })
      .filter(Boolean);
  }

  function readMenuEditorItemOptionGroups(item) {
    const detail = $("[data-menu-editor-item-detail]", item);
    return detail?.dataset.hydrated === "true"
      ? readHydratedMenuEditorItemOptionGroups(item)
      : readStoredMenuEditorItemOptionGroups(item);
  }

  function storeMenuEditorItemOptionGroups(item) {
    const input = $("[data-menu-item-options]", item);
    if (input) input.value = JSON.stringify(readHydratedMenuEditorItemOptionGroups(item));
  }

  function closeOtherMenuEditorItems(activeItem) {
    $$("#menuEditor [data-menu-editor-item].open").forEach((item) => {
      if (item === activeItem) return;
      setMenuEditorItemOpen(item, false);
    });
  }

  function closeOtherOptionTemplatePickers(activeItem) {
    $$("#menuEditor [data-menu-editor-item]").forEach((item) => {
      if (item === activeItem) return;
      closeOptionTemplatePicker(item);
    });
  }

  function showOptionTemplatePicker(item, templateId) {
    if (!item) return;
    const template = configEditorOptionTemplates().find((option) => option.id === templateId);
    const picker = $("[data-option-template-picker]", item);
    if (!template || !picker) return;

    const singleChoice = template.choices.length === 1;
    closeOtherOptionTemplatePickers(item);
    picker.hidden = false;
    picker.classList.remove("is-closing");
    picker.innerHTML = `
      <section class="menu-editor-template-panel">
        <div class="menu-editor-template-panel-head">
          <strong>${escapeHtml(template.label)}</strong>
          <button class="icon-button" type="button" data-cancel-option-template aria-label="閉じる" title="閉じる">
            <i data-lucide="x" aria-hidden="true"></i>
          </button>
        </div>
        <div class="menu-editor-template-choice-grid">
          ${template.choices.map((choice) => `
            <label class="menu-editor-template-check">
              <input data-option-template-choice type="checkbox" value="${escapeHtml(choice)}" ${singleChoice ? "checked" : ""}>
              <span>${escapeHtml(choice)}</span>
            </label>
          `).join("")}
        </div>
        <div class="menu-editor-template-actions">
          <button class="button button-quiet" type="button" data-template-select-all>全選択</button>
          <button class="button button-quiet" type="button" data-template-clear>解除</button>
          <button class="button button-primary" type="button" data-apply-option-template="${escapeHtml(template.id)}">
            選択した内容を追加
          </button>
        </div>
      </section>
    `;
    requestAnimationFrame(() => picker.classList.add("is-open"));

    scheduleIconRefresh();
  }

  function closeOptionTemplatePicker(item) {
    const picker = item ? $("[data-option-template-picker]", item) : null;
    if (!picker || picker.hidden) return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const finishClose = () => {
      if (!picker.classList.contains("is-closing") && !reduceMotion) return;
      picker.hidden = true;
      picker.innerHTML = "";
      picker.classList.remove("is-open", "is-closing");
    };
    picker.classList.remove("is-open");
    if (reduceMotion) {
      picker.classList.add("is-closing");
      finishClose();
      return;
    }
    picker.classList.add("is-closing");
    window.setTimeout(finishClose, 170);
  }

  function showOptionTemplateEditor(item, templateId = "") {
    if (!item) return;
    const template = configEditorOptionTemplates().find((option) => option.id === templateId) || {
      id: "",
      label: "",
      required: false,
      choices: [""],
    };
    const editor = $("[data-option-template-editor]", item);
    if (!editor) return;
    closeOptionTemplatePicker(item);
    editor.hidden = false;
    editor.innerHTML = `
      <section class="menu-editor-template-panel">
        <input data-option-template-editor-id type="hidden" value="${escapeHtml(template.id)}">
        <div class="menu-editor-template-panel-head">
          <strong>${template.id ? "オプションカテゴリ編集" : "オプションカテゴリ作成"}</strong>
          <button class="icon-button" type="button" data-cancel-option-template-editor aria-label="閉じる" title="閉じる">
            <i data-lucide="x" aria-hidden="true"></i>
          </button>
        </div>
        <label>
          <span>カテゴリ名</span>
          <input data-option-template-editor-label type="text" value="${escapeHtml(template.label)}" placeholder="例: 氷">
        </label>
        <label class="menu-editor-check">
          <input data-option-template-editor-required type="checkbox" ${template.required ? "checked" : ""}>
          <span>選択必須</span>
        </label>
        <div class="menu-editor-option-choices" data-option-template-editor-choices>
          ${(template.choices.length ? template.choices : [""]).map(optionTemplateEditorChoiceBlock).join("")}
        </div>
        <button class="button button-quiet menu-add-choice" type="button" data-add-option-template-choice>
          <i data-lucide="plus" aria-hidden="true"></i>
          <span>選択肢追加</span>
        </button>
        <div class="menu-editor-template-actions">
          ${template.id ? `
            <button class="button button-quiet danger-button" type="button" data-delete-option-template="${escapeHtml(template.id)}">削除</button>
          ` : ""}
          <button class="button button-primary" type="button" data-save-option-template>保存</button>
        </div>
      </section>
    `;
    scheduleIconRefresh();
  }

  function optionTemplateEditorChoiceBlock(choice) {
    return `
      <div class="menu-editor-option-choice" data-option-template-editor-choice>
        <input data-option-template-editor-choice-input type="text" value="${escapeHtml(choice)}" placeholder="例: 氷なし">
        <button class="icon-button danger-button" type="button" data-remove-option-template-choice aria-label="選択肢削除" title="選択肢削除">
          <i data-lucide="trash-2" aria-hidden="true"></i>
        </button>
      </div>
    `;
  }

  function closeOptionTemplateEditor(item) {
    const editor = item ? $("[data-option-template-editor]", item) : null;
    if (!editor) return;
    editor.hidden = true;
    editor.innerHTML = "";
  }

  function saveOptionTemplateEditor(item) {
    const editor = item ? $("[data-option-template-editor]", item) : null;
    if (!editor) return;
    const label = $("[data-option-template-editor-label]", editor)?.value.trim() || "";
    const choices = uniqueList(
      $$('[data-option-template-editor-choice-input]', editor).map((input) => input.value.trim()).filter(Boolean)
    );
    if (!label) {
      toast("カテゴリ名を入力してください");
      return;
    }
    if (!choices.length) {
      toast("選択肢を1つ以上入力してください");
      return;
    }

    const currentId = $("[data-option-template-editor-id]", editor)?.value || "";
    const templates = cloneOptionGroups(configEditorOptionTemplates());
    const currentIndex = templates.findIndex((template) => template.id === currentId);
    const usedIds = new Set(templates.filter((template) => template.id !== currentId).map((template) => template.id));
    const template = {
      id: currentId || uniqueMenuId(makeMenuId(label, templates.length), usedIds),
      label,
      required: Boolean($("[data-option-template-editor-required]", editor)?.checked),
      choices,
    };
    if (currentIndex >= 0) templates[currentIndex] = template;
    else templates.push(template);
    state.configDraftOptionTemplates = normalizeOptionTemplates(templates);
    closeOptionTemplateEditor(item);
    refreshOptionTemplateControls();
    toast(currentIndex >= 0 ? `${label}を更新しました` : `${label}を作成しました`);
  }

  function deleteOptionTemplateFromEditor(item, templateId) {
    const template = configEditorOptionTemplates().find((option) => option.id === templateId);
    if (!template) return;
    state.configDraftOptionTemplates = configEditorOptionTemplates().filter((option) => option.id !== templateId);
    closeOptionTemplateEditor(item);
    refreshOptionTemplateControls();
    toast(`${template.label}を削除しました`);
  }

  function refreshOptionTemplateControls() {
    $$("#menuEditor [data-menu-editor-item-detail][data-hydrated='true']").forEach((detail) => {
      const row = $(".menu-editor-template-row", detail);
      if (row) row.outerHTML = menuEditorOptionTemplateButtons();
    });
    scheduleIconRefresh();
  }

  function menuEditorOptionTemplateButtons() {
    return `
      <div class="menu-editor-template-row" aria-label="よく使うオプション">
        <span>よく使う</span>
        <div class="menu-editor-template-buttons">
          ${configEditorOptionTemplates().map((template) => `
            <span class="menu-editor-template-entry">
              <button class="menu-editor-template-button" type="button" data-add-option-template="${escapeHtml(template.id)}">
                + ${escapeHtml(template.label)}
              </button>
              <button class="menu-editor-template-edit" type="button" data-edit-option-template="${escapeHtml(template.id)}" aria-label="${escapeHtml(template.label)}を編集" title="${escapeHtml(template.label)}を編集">
                <i data-lucide="pencil" aria-hidden="true"></i>
              </button>
            </span>
          `).join("")}
        </div>
      </div>
    `;
  }

  function addOptionTemplateToEditorItem(item, templateId, selectedChoices = []) {
    if (!item) return;
    const template = configEditorOptionTemplates().find((option) => option.id === templateId);
    if (!template) return;
    const templateChoices = uniqueList(selectedChoices).filter(Boolean);
    if (!templateChoices.length) {
      toast("追加する内容を選択してください");
      return;
    }

    const existingGroup = $$("[data-menu-editor-option-group]", item).find((group) =>
      $("[data-menu-option-group-label]", group)?.value.trim() === template.label
    );

    if (existingGroup) {
      const choicesWrap = $("[data-menu-editor-option-choices]", existingGroup);
      const existingChoices = new Set(
        $$("[data-menu-option-choice-input]", existingGroup).map((input) => input.value.trim()).filter(Boolean)
      );
      let addedCount = 0;
      templateChoices.forEach((choice) => {
        if (existingChoices.has(choice)) return;
        choicesWrap.insertAdjacentHTML("beforeend", menuEditorOptionChoiceBlock(choice));
        addedCount += 1;
      });
      if (template.required) {
        const requiredInput = $("[data-menu-option-group-required]", existingGroup);
        if (requiredInput) requiredInput.checked = true;
      }
      setMenuEditorOptionGroupOpen(existingGroup, false);
      toast(addedCount ? `${template.label}の不足分を追加しました` : `${template.label}は追加済みです`);
    } else {
      const groupsWrap = $("[data-menu-editor-option-groups]", item);
      groupsWrap.insertAdjacentHTML(
        "beforeend",
        menuEditorOptionGroupBlock({
          id: `${template.id}-${Date.now()}`,
          label: template.label,
          required: template.required,
          choices: templateChoices,
        })
      );
      toast(`${template.label}を追加しました`);
    }

    closeOptionTemplatePicker(item);
    scheduleIconRefresh();
  }

  function menuEditorOptionGroupBlock(group) {
    return `
      <section class="menu-editor-option-group" data-menu-editor-option-group>
        <input data-menu-option-group-id type="hidden" value="${escapeHtml(group.id || "")}">
        <div class="menu-editor-option-group-summary">
          <strong>${escapeHtml(group.label || "オプション")}</strong>
          <span>${escapeHtml(`${(group.choices || []).length}件${group.required ? "・必須" : ""}`)}</span>
          <button class="icon-button" type="button" data-edit-menu-option-group aria-expanded="false" aria-label="${escapeHtml(group.label || "オプション")}を編集" title="編集">
            <i data-lucide="pencil" aria-hidden="true"></i>
          </button>
          <button class="icon-button danger-button" type="button" data-remove-menu-option-group aria-label="オプションカテゴリ削除" title="オプションカテゴリ削除">
            <i data-lucide="trash-2" aria-hidden="true"></i>
          </button>
        </div>
        <div class="menu-editor-option-group-editor" data-menu-option-group-editor>
          <div class="menu-editor-option-group-head">
            <label>
              <span>カテゴリ名</span>
              <input data-menu-option-group-label type="text" value="${escapeHtml(group.label || "")}" placeholder="例: 氷">
            </label>
          </div>
          <label class="menu-editor-check">
            <input data-menu-option-group-required type="checkbox" ${group.required ? "checked" : ""}>
            <span>選択必須</span>
          </label>
          <div class="menu-editor-option-choices" data-menu-editor-option-choices>
            ${(group.choices || []).map((choice) => menuEditorOptionChoiceBlock(choice)).join("")}
          </div>
          <button class="button button-quiet menu-add-choice" type="button" data-add-menu-option-choice>
            <i data-lucide="plus" aria-hidden="true"></i>
            <span>選択肢追加</span>
          </button>
        </div>
      </section>
    `;
  }

  function setMenuEditorOptionGroupOpen(group, isOpen) {
    if (!group) return;
    group.classList.toggle("open", isOpen);
    $("[data-edit-menu-option-group]", group)?.setAttribute("aria-expanded", String(isOpen));
    if (isOpen) return;
    const label = $("[data-menu-option-group-label]", group)?.value.trim() || "オプション";
    const choices = $$('[data-menu-option-choice-input]', group).filter((input) => input.value.trim()).length;
    $(".menu-editor-option-group-summary strong", group).textContent = label;
    $(".menu-editor-option-group-summary span", group).textContent = `${choices}件${$("[data-menu-option-group-required]", group)?.checked ? "・必須" : ""}`;
  }

  function menuEditorOptionChoiceBlock(choice) {
    return `
      <div class="menu-editor-option-choice" data-menu-option-choice>
        <input data-menu-option-choice-input type="text" value="${escapeHtml(choice)}" placeholder="例: 氷なし">
        <button class="icon-button danger-button" type="button" data-remove-menu-option-choice aria-label="選択肢削除" title="選択肢削除">
          <i data-lucide="trash-2" aria-hidden="true"></i>
        </button>
      </div>
    `;
  }

  function addMenuEditorCategory() {
    syncActiveMenuEditorCategory();
    const menu = [...configEditorMenu()];
    const index = menu.length;
    const id = `custom-${Date.now()}-${index}`;
    const subcategories = [{ id: DEFAULT_SUBCATEGORY_ID, label: DEFAULT_SUBCATEGORY_LABEL }];
    menu.push({ id, label: `カテゴリ${index + 1}`, subcategories, items: [] });
    state.configDraftMenu = menu;
    state.configActiveCategoryId = id;
    renderMenuEditor();
    scheduleIconRefresh();
  }

  function readSoundSetting() {
    const saved = localStorage.getItem(SOUND_KEY);
    return saved === null ? true : saved === "true";
  }

  function readSoundChoices() {
    const legacyChoice = normalizeSoundChoice(localStorage.getItem(SOUND_CHOICE_KEY) || SOUND_OPTIONS[0].id);
    const initialChoices = INITIAL_SETTINGS.soundChoices && typeof INITIAL_SETTINGS.soundChoices === "object"
      ? INITIAL_SETTINGS.soundChoices
      : {};
    try {
      const saved = JSON.parse(localStorage.getItem(SOUND_CHOICES_KEY) || "null");
      return Object.fromEntries(SOUND_CATEGORIES.map(({ id, defaultChoice }) => [
        id,
        normalizeSoundChoice(saved?.[id] || initialChoices[id] || defaultChoice || legacyChoice),
      ]));
    } catch {
      return Object.fromEntries(SOUND_CATEGORIES.map(({ id, defaultChoice }) => [
        id,
        normalizeSoundChoice(initialChoices[id] || defaultChoice || legacyChoice),
      ]));
    }
  }

  function readReceptionMenuMode() {
    return localStorage.getItem(RECEPTION_MENU_MODE_KEY) === "custom" ? "custom" : "normal";
  }

  function normalizeSoundChoice(value) {
    return SOUND_OPTIONS.some((option) => option.id === value) ? value : SOUND_OPTIONS[0].id;
  }

  function selectedSoundOption(choiceId = state.soundChoices[state.soundCategory]) {
    return SOUND_OPTIONS.find((option) => option.id === normalizeSoundChoice(choiceId)) || SOUND_OPTIONS[0];
  }

  function saveSoundSetting() {
    localStorage.setItem(SOUND_KEY, String(state.soundEnabled));
  }

  function saveSoundChoices() {
    localStorage.setItem(SOUND_CHOICES_KEY, JSON.stringify(state.soundChoices));
  }

  function updateSoundButton() {
    const button = $("#soundToggle");
    const status = $("#soundStatus");
    if (!button || !status) return;
    button.setAttribute("aria-pressed", String(state.soundEnabled));
    status.textContent = state.soundEnabled ? "オン" : "オフ";
    $$("[data-sound-choice]").forEach((choice) => {
      choice.value = state.soundChoices[choice.dataset.soundChoice];
    });
  }

  function setupAudioUnlock() {
    const unlock = () => {
      if (state.view === "bar" && state.soundEnabled) unlockAudio();
    };
    document.addEventListener("pointerdown", unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });
    document.addEventListener("touchstart", unlock, { once: true });
  }

  function teardownSupabase() {
    if (state.realtimeChannel && state.supabase) {
      state.supabase.removeChannel(state.realtimeChannel);
    }
    state.supabase = null;
    state.realtimeChannel = null;
  }

  function supabaseErrorMessage(prefix, error) {
    const detail = [error?.message, error?.details, error?.hint, error?.code]
      .filter(Boolean)
      .join(" / ");
    return detail ? `${prefix}: ${detail}` : prefix;
  }

  async function unlockAudio(choiceId) {
    if (state.audioUnlockPromise) return state.audioUnlockPromise;
    state.audioUnlockPromise = (async () => {
      if (!state.audioContext) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        state.audioContext = new AudioContextClass();
      }
      if (state.audioContext.state === "suspended") {
        await state.audioContext.resume();
      }

      if (choiceId) primeNotificationAudio(choiceId);
    })().finally(() => {
      state.audioUnlockPromise = null;
    });
    return state.audioUnlockPromise;
  }

  async function playChime(choiceId = state.soundChoices[state.soundCategory]) {
    const normalizedChoice = normalizeSoundChoice(choiceId);
    if (playBufferedNotificationAudio(normalizedChoice)) return true;
    scheduleNotificationWarmup(0);
    if (await playPrimedNotificationAudio(normalizedChoice)) return true;

    try {
      await unlockAudio(normalizedChoice);
      await warmNotificationBuffer(normalizedChoice);
      if (playBufferedNotificationAudio(normalizedChoice)) return true;
    } catch (error) {
      console.warn(error);
    }

    if (state.audioContext?.state === "running") {
      playFallbackBell();
      return true;
    }
    return false;
  }

  function scheduleNotificationWarmup(delay = 220) {
    if (state.notificationWarmTimer) return;
    state.notificationWarmTimer = window.setTimeout(() => {
      state.notificationWarmTimer = null;
      warmNotificationBuffers();
    }, delay);
  }

  function configuredSoundChoiceIds() {
    return uniqueList(Object.values(state.soundChoices).map(normalizeSoundChoice));
  }

  function primeNotificationAudio(choiceId) {
    const choiceIds = choiceId ? [normalizeSoundChoice(choiceId)] : configuredSoundChoiceIds();
    choiceIds.forEach((id) => {
      const option = selectedSoundOption(id);
      if (!option.url || state.notificationAudios.has(option.id)) return;
      const audio = new Audio(option.url);
      audio.preload = "auto";
      audio.playsInline = true;
      audio.volume = 1;
      audio.addEventListener("error", () => {
        state.notificationAudioUnavailable.add(option.id);
      }, { once: true });
      state.notificationAudios.set(option.id, audio);
      audio.load();
    });
  }

  function playNotificationAudioFromGesture(choiceId) {
    const option = selectedSoundOption(choiceId);
    if (!option.url) return Promise.resolve(false);
    state.notificationAudioUnavailable.delete(option.id);
    primeNotificationAudio(option.id);
    const audio = state.notificationAudios.get(option.id);
    if (!audio) return Promise.resolve(false);
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = 1;
      const playback = audio.play();
      if (!playback?.then) return Promise.resolve(true);
      return Promise.race([
        playback.then(() => true).catch(() => false),
        new Promise((resolve) => window.setTimeout(() => resolve(false), 3000)),
      ]).then((played) => {
        if (!played) audio.pause();
        return played;
      });
    } catch {
      return Promise.resolve(false);
    }
  }

  async function warmNotificationBuffers() {
    return Promise.all(configuredSoundChoiceIds().map((choiceId) => warmNotificationBuffer(choiceId)));
  }

  async function warmNotificationBuffer(choiceId = state.soundChoices[state.soundCategory]) {
    const option = selectedSoundOption(choiceId);
    if (!option.url || !state.audioContext) return null;
    if (state.notificationBuffers.has(option.id)) return state.notificationBuffers.get(option.id);
    if (state.notificationBufferPromises.has(option.id)) return state.notificationBufferPromises.get(option.id);

    state.notificationAudioUnavailable.delete(option.id);
    const promise = fetch(option.url)
      .then((response) => {
        if (!response.ok) throw new Error(`sound fetch failed: ${response.status}`);
        return response.arrayBuffer();
      })
      .then((arrayBuffer) => state.audioContext.decodeAudioData(arrayBuffer))
      .then((buffer) => {
        state.notificationBuffers.set(option.id, buffer);
        return buffer;
      })
      .catch((error) => {
        console.warn(error);
        return null;
      })
      .finally(() => {
        state.notificationBufferPromises.delete(option.id);
      });
    state.notificationBufferPromises.set(option.id, promise);
    return promise;
  }

  function playBufferedNotificationAudio(choiceId) {
    const option = selectedSoundOption(choiceId);
    if (!option.url) return false;
    const buffer = state.notificationBuffers.get(option.id);
    if (!state.audioContext || !buffer) return false;
    if (state.audioContext.state === "suspended") {
      state.audioContext.resume();
      return false;
    }

    const source = state.audioContext.createBufferSource();
    const gain = state.audioContext.createGain();
    const volumeGain = Math.max(0, Number(option.gain || 1));
    source.buffer = buffer;
    gain.gain.setValueAtTime(volumeGain, state.audioContext.currentTime);
    if (volumeGain > 1 && state.audioContext.createDynamicsCompressor) {
      const limiter = state.audioContext.createDynamicsCompressor();
      limiter.threshold.setValueAtTime(-6, state.audioContext.currentTime);
      limiter.knee.setValueAtTime(6, state.audioContext.currentTime);
      limiter.ratio.setValueAtTime(12, state.audioContext.currentTime);
      limiter.attack.setValueAtTime(0.003, state.audioContext.currentTime);
      limiter.release.setValueAtTime(0.18, state.audioContext.currentTime);
      source.connect(gain).connect(limiter).connect(state.audioContext.destination);
    } else {
      source.connect(gain).connect(state.audioContext.destination);
    }
    source.start();
    return true;
  }

  async function playPrimedNotificationAudio(choiceId) {
    const option = selectedSoundOption(choiceId);
    if (!option.url || state.notificationAudioUnavailable.has(option.id)) return false;
    primeNotificationAudio(option.id);
    const audio = state.notificationAudios.get(option.id);
    if (!audio) return false;
    if (audio.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return false;
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = 1;
      const playback = audio.play();
      if (playback?.then) await playback;
      return true;
    } catch {
      return false;
    }
  }

  function scheduleIconRefresh() {
    if (!window.lucide || state.iconRefreshTimer) return;
    const refresh = () => {
      state.iconRefreshTimer = null;
      if (window.lucide) window.lucide.createIcons();
    };
    if ("requestIdleCallback" in window) {
      state.iconRefreshTimer = window.requestIdleCallback(refresh, { timeout: 300 });
    } else {
      state.iconRefreshTimer = window.setTimeout(refresh, 16);
    }
  }

  function playFallbackBell() {
    if (!state.audioContext) return;
    const now = state.audioContext.currentTime;
    [1568, 1976, 1568, 1976].forEach((frequency, index) => {
      const oscillator = state.audioContext.createOscillator();
      const gain = state.audioContext.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(frequency, now + index * 0.12);
      gain.gain.setValueAtTime(0.0001, now + index * 0.11);
      gain.gain.exponentialRampToValueAtTime(0.65, now + index * 0.11 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.11 + 0.18);
      oscillator.connect(gain).connect(state.audioContext.destination);
      oscillator.start(now + index * 0.11);
      oscillator.stop(now + index * 0.11 + 0.22);
    });
  }

  function toast(message, options = {}) {
    const region = $("#toastRegion");
    const node = document.createElement("div");
    node.className = `toast${options.long ? " long" : ""}`;
    node.textContent = message;
    region.appendChild(node);
    setTimeout(() => {
      node.remove();
    }, options.long ? 9000 : 2800);
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
