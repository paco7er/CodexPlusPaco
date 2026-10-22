  async function loadBackendSettings() {
    const loaded = await loadBackendSettingsState();
    if (globalThis.window?.__CODEX_PLUS_MARKETPLACE_ONLY__ === true) return loaded;
    if (loaded && codexRemoteSessionProviderOverrideEnabled()) {
      void loadCodexModelCatalog();
    }
    refreshCodexPlusBackendToggles();
    if (loaded) syncOfficialUsagePolicy();
    if (loaded) runScanStep(syncCodexPlusTypingEffects);
    if (loaded && typeof syncCodexPlusWhaleWidget === "function") runScanStep(syncCodexPlusWhaleWidget);
    // typeof 守卫：这两个函数会被 session-share-runtime / typing-effects-settings
    // 之类的用例切片到不带其它分片的沙箱里执行，缺函数时不能直接 ReferenceError。
    if (loaded && typeof syncCodexPlusCapacityAutoRetry === "function") runScanStep(syncCodexPlusCapacityAutoRetry);
    globalThis.__CODEX_PLUS_ACTIVITY_OVERLAY_SYNC__?.();
    return loaded;
  }

  function loadBackendSettingsForStartup(attempt = 0) {
    loadBackendSettings().then((loaded) => {
      if (loaded) {
        scan();
        return;
      }
      if (attempt < 60) {
        setTimeout(() => loadBackendSettingsForStartup(attempt + 1), 250);
      }
    });
  }

  let syncBackendSettingsInFlight = false;
  async function syncBackendSettingsFromHeartbeat() {
    if (syncBackendSettingsInFlight) return;
    syncBackendSettingsInFlight = true;
    try {
      const previousConversationView = !!codexPlusSettings().conversationView;
      const loaded = await loadBackendSettingsState();
      if (globalThis.window?.__CODEX_PLUS_MARKETPLACE_ONLY__ === true) {
        if (loaded) scan();
        return;
      }
      if (loaded) {
        syncOfficialUsagePolicy();
        runScanStep(syncCodexPlusTypingEffects);
        if (typeof syncCodexPlusWhaleWidget === "function") runScanStep(syncCodexPlusWhaleWidget);
        if (typeof syncCodexPlusCapacityAutoRetry === "function") runScanStep(syncCodexPlusCapacityAutoRetry);
        globalThis.__CODEX_PLUS_ACTIVITY_OVERLAY_SYNC__?.();
        renderCodexPlusMenu();
        if (previousConversationView !== !!codexPlusSettings().conversationView) {
          refreshConversationView();
        }
      }
    } finally {
      syncBackendSettingsInFlight = false;
    }
  }

  async function setBackendSetting(key, value) {
    if (globalThis.window?.__CODEX_PLUS_MARKETPLACE_ONLY__ === true
        && !["enhancementsEnabled", "codexAppPluginMarketplaceUnlock"].includes(key)) return;
    const seq = ++codexPlusBackendSettingsSeq;
    codexPlusBackendSettings = { ...codexPlusBackendSettings, [key]: value };
    codexPlusBackendSettingsLoaded = true;
    globalThis.__CODEX_PLUS_ACTIVITY_OVERLAY_SYNC__?.();
    refreshCodexPlusBackendToggles();
    try {
      const settings = await postJson("/settings/set", { [key]: value });
      if (seq === codexPlusBackendSettingsSeq) {
        codexPlusBackendSettings = { ...codexPlusBackendSettings, ...settings };
        if (globalThis.window?.__CODEX_PLUS_MARKETPLACE_ONLY__ !== true) globalThis.window?.__codexPlusNativeFastUnlock?.runtime?.update?.({
          enhancementsEnabled: codexPlusBackendSettings.enhancementsEnabled !== false,
          codexAppNativeFastUnlock: codexPlusBackendSettings.codexAppNativeFastUnlock === true,
        });
        globalThis.__CODEX_PLUS_ACTIVITY_OVERLAY_SYNC__?.();
      }
    } finally {
      refreshCodexPlusBackendToggles();
    }
  }

  function refreshCodexPlusBackendToggles() {
    if (globalThis.window?.__CODEX_PLUS_MARKETPLACE_ONLY__ === true) { scan(); return; }
    globalThis.__CODEX_PLUS_ACTIVITY_OVERLAY_SYNC__?.();
    globalThis.__CODEX_PLUS_USAGE_STATUSLINE_SYNC__?.();
    document.querySelectorAll(".codex-plus-toggle[data-codex-backend-setting]").forEach((button) => {
      const key = button.getAttribute("data-codex-backend-setting");
      button.dataset.enabled = String(!!codexPlusBackendSettings[key]);
      button.setAttribute("aria-checked", button.dataset.enabled);
    });
    syncStepwisePanel();
    runScanStep(syncCodexPlusTypingEffects);
    if (typeof syncCodexPlusWhaleWidget === "function") runScanStep(syncCodexPlusWhaleWidget);
    renderCodexPlusMenu();
    scan();
  }
  let codexPlusBackendStatus = window.__codexPlusBackendStatus || { status: "checking", message: "正在检查后端…" };
  let codexPlusBackendCheckSeq = 0;
  let codexPlusBackendCheckInFlight = false;
  let codexPlusBackendFailureCount = 0;
  const CODEX_PLUS_BACKEND_FAILURE_THRESHOLD = 3;
  // 桥接通道（binding）与后端可用性分开统计：HTTP 回落成功会让后端状态保持绿色，
  // 但桥接持续失败时必须把降级呈现出来，否则启动器侧的重注入修复循环对用户完全不可见（issue #2169）。
  let codexPlusBridgeFailureCount = 0;
  const CODEX_PLUS_BRIDGE_FAILURE_THRESHOLD = 3;
  const codexPlusBackendGeneration = (Number(window.__codexPlusBackendGeneration) || 0) + 1;
  window.__codexPlusBackendGeneration = codexPlusBackendGeneration;

  function recordCodexPlusBridgeHealth(field) {
    if (codexPlusBackendGeneration !== window.__codexPlusBackendGeneration) return;
    const health = window.__codexPlusBridgeHealth || (window.__codexPlusBridgeHealth = {});
    health[field] = Date.now();
  }

  function recordCodexPlusBridgeSuccess() {
    recordCodexPlusBridgeHealth("lastSuccessAt");
    if (codexPlusBackendGeneration === window.__codexPlusBackendGeneration) {
      const health = window.__codexPlusBridgeHealth || (window.__codexPlusBridgeHealth = {});
      health.failures = 0;
    }
    codexPlusBridgeFailureCount = 0;
  }

  function recordCodexPlusBridgeAttempt() {
    recordCodexPlusBridgeHealth("lastAttemptAt");
  }

  function recordCodexPlusBridgeFailure() {
    codexPlusBridgeFailureCount += 1;
    if (codexPlusBackendGeneration !== window.__codexPlusBackendGeneration) return;
    // 看门狗只能读到 window 上的 health 快照：不落 failures/lastFailureAt，
    // CDP 连接断掉后它会一直把“还在尝试”当成桥接存活，永久不重注入。
    const health = window.__codexPlusBridgeHealth || (window.__codexPlusBridgeHealth = {});
    health.lastFailureAt = Date.now();
    health.failures = codexPlusBridgeFailureCount;
  }

  function renderBackendStatus() {
    const bridgeDegraded = codexPlusBridgeFailureCount >= CODEX_PLUS_BRIDGE_FAILURE_THRESHOLD;
    const rawStatus = codexPlusBackendStatus.status || "failed";
    const status = bridgeDegraded && rawStatus === "ok" ? "degraded" : rawStatus;
    if (codexPlusBackendStatus.version) {
      codexPlusVersion = codexPlusBackendStatus.version;
      document.querySelectorAll("[data-codex-plus-version]").forEach((node) => {
        node.textContent = `Codex++ ${codexPlusVersion}`;
      });
    }
    const labelFallback = status === "ok" ? "后端已连接" : status === "degraded" ? "桥接降级，自动修复中" : status === "checking" ? "正在检查后端…" : "未连接";
    const label = document.querySelector("[data-codex-backend-status]");
    if (label) {
      label.dataset.status = status;
      label.textContent = status === "degraded" ? labelFallback : (codexPlusBackendStatus.message || labelFallback);
    }
    document.querySelectorAll("[data-codex-backend-indicator]").forEach((indicator) => {
      indicator.dataset.status = status;
      indicator.title = status === "ok" ? "后端已连接" : status === "degraded" ? "后端可达，桥接降级，正在自动修复" : status === "checking" ? "正在检查后端" : "未连接";
    });
    const sidebarStatus = document.querySelector(`#${codexPlusSidebarNavId} .codex-plus-sidebar-nav-status`);
    if (sidebarStatus) {
      sidebarStatus.dataset.status = status;
      sidebarStatus.title = status === "ok" ? "后端已连接" : status === "degraded" ? "后端可达，桥接降级，正在自动修复" : status === "checking" ? "正在检查后端" : "未连接";
    }
  }

  function withBackendTimeout(request) {
    return Promise.race([
      request,
      new Promise((resolve) => setTimeout(() => resolve({ status: "failed", message: "后端检查超时", timeout: true }), 2000)),
    ]);
  }

  async function checkBackendStatus() {
    if (codexPlusBackendCheckInFlight) return;
    codexPlusBackendCheckInFlight = true;
    const seq = ++codexPlusBackendCheckSeq;
    try {
      const nextStatus = await postJson("/backend/status", {});
      if (seq !== codexPlusBackendCheckSeq || codexPlusBackendGeneration !== window.__codexPlusBackendGeneration) return;
      if (nextStatus?.status === "ok") {
        codexPlusBackendFailureCount = 0;
        codexPlusBackendStatus = window.__codexPlusBackendStatus = nextStatus;
        if (window.__CODEX_PLUS_MARKETPLACE_ONLY__ !== true && typeof nextStatus.hideOfficialUsageAlert === "boolean") {
          window.__CODEX_PLUS_HIDE_OFFICIAL_USAGE_ALERT__ = nextStatus.hideOfficialUsageAlert;
          syncOfficialUsagePolicy();
        }
        void syncBackendSettingsFromHeartbeat();
      } else {
        codexPlusBackendFailureCount += 1;
        sendCodexPlusDiagnostic("backend_check_failed", {
          status: nextStatus?.status || "unknown",
          message: nextStatus?.message || "",
          timeout: !!nextStatus?.timeout,
          consecutiveFailures: codexPlusBackendFailureCount,
        });
        if (codexPlusBackendFailureCount >= CODEX_PLUS_BACKEND_FAILURE_THRESHOLD) {
          codexPlusBackendStatus = window.__codexPlusBackendStatus = nextStatus;
        }
      }
      renderBackendStatus();
    } finally {
      codexPlusBackendCheckInFlight = false;
    }
  }

  async function openManagerFromCodex() {
    const result = await postJson("/manager/open", {});
    if (result.status === "ok") {
      showToast("管理工具已打开", null);
    } else {
      showToast(result.message || "打开管理工具失败", null);
    }
  }

  function scheduleBackendHeartbeat() {
    if (codexPlusBackendGeneration !== window.__codexPlusBackendGeneration) return;
    if (window.__codexPlusBackendHeartbeat &&
        window.__codexPlusBackendHeartbeatGeneration === codexPlusBackendGeneration) return;
    if (window.__codexPlusBackendHeartbeat) clearInterval(window.__codexPlusBackendHeartbeat);
    window.__codexPlusBackendHeartbeatGeneration = codexPlusBackendGeneration;
    window.__codexPlusBackendHeartbeat = setInterval(checkBackendStatus, 5000);
    checkBackendStatus();
  }

  /**
   * 页面模式复用已有内容节点，保留设置控件与事件绑定。
   */
  function installCodexPlusPageLayout(overlay, tab) {
    if (!overlay || overlay.querySelector(".codex-plus-page-layout")) return;
    const content = overlay.querySelector(".codex-plus-modal-content");
    const body = content?.querySelector(".codex-plus-modal-body");
    if (!content || !body) return;
    const layout = document.createElement("div");
    layout.className = "codex-plus-page-layout";
    const main = document.createElement("div");
    main.className = "codex-plus-page-main";
    content.appendChild(layout);
    layout.appendChild(main);
    main.appendChild(body);
    if (tab === "home") {
      // 设置标题和卡片共用居中栏，并随内容滚动，保持原生设置页的阅读节奏。
      const header = content.querySelector(".codex-plus-modal-header");
      if (header) body.querySelector(".codex-plus-settings")?.prepend(header);
    }
  }

  /** 保留页面标题函数，旧 tab 请求统一回到增强设置。 */
  function codexPlusPageTitle(tab) {
    return "Codex++";
  }

  function selectCodexPlusTab(tab) {
    closeCodexPlusTypingEffectDropdown();
    const normalized = codexPlusModalTab(tab);
    document.querySelectorAll(".codex-plus-modal-content").forEach((modal) => {
      modal.dataset.codexPlusActiveTab = normalized;
    });
    document.querySelectorAll("[data-codex-plus-panel]").forEach((panel) => {
      panel.hidden = codexPlusModalTab(panel.getAttribute("data-codex-plus-panel")) !== normalized;
    });
  }

  /** 读取当前增强页面的激活状态。 */
  function codexPlusActiveEntry() {
    const overlay = document.querySelector(`.${codexPlusPageClass}`);
    if (!overlay) return null;
    const tab = overlay.querySelector(".codex-plus-modal-content")?.dataset?.codexPlusActiveTab;
    if (tab === codexPlusPluginMarketTab) return "plugin-market";
    return "home";
  }

  function setCodexPlusSidebarNavActive(active, entry = "home") {
    const nav = document.getElementById(codexPlusSidebarNavId);
    const button = nav?.querySelector("button");
    if (button) {
      const on = Boolean(active) && entry === "home";
      button.dataset.active = String(on);
      if (on) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    }
    [
      [codexPlusRailNavId, "home"],
    ].forEach(([id, name]) => {
      const railButton = document.querySelector(`#${id} > button`);
      if (!railButton) return;
      const on = Boolean(active) && entry === name;
      railButton.dataset.active = String(on);
      if (on) railButton.setAttribute("aria-current", "page");
      else railButton.removeAttribute("aria-current");
      // 原生 rail 按钮的选中色由 data-selected 驱动（且需无 data-suppress-active-style）。
      if (on) railButton.setAttribute("data-selected", "");
      else railButton.removeAttribute("data-selected");
    });
    syncCodexPlusRailNativeSelection();
  }

  /**
   * 我们的页面是叠加在 Codex 上的，Codex 不知道，所以它自己那个 destination
   * 的选中态会一直留着，表现为 rail 上同时亮两个。页面打开时给根节点打标记，
   * 由 CSS 把原生选中项压成未选中；关掉即移除标记，原生状态自动恢复。
   *
   * 未选中的颜色取自当前主题下真实的未选中项，避免把深浅色写死。
   */
  function syncCodexPlusRailNativeSelection() {
    const root = document.documentElement;
    if (!root) return;
    if (!document.querySelector(`.${codexPlusPageClass}`)) {
      root.removeAttribute("data-codex-plus-page-open");
      root.style.removeProperty("--codex-plus-rail-dim");
      return;
    }
    const rail = document.querySelector(codexPlusRailSelector);
    const unselected = rail?.querySelector(`${codexPlusRailDestinationSelector}:not([aria-current="page"])`);
    const dim = unselected ? getComputedStyle(unselected).color : "";
    if (dim) root.style.setProperty("--codex-plus-rail-dim", dim);
    root.setAttribute("data-codex-plus-page-open", "");
  }

  function positionCodexPlusPage(overlay) {
    if (!overlay?.classList?.contains(codexPlusPageClass)) return;
    const sidebar = document.querySelector("aside.app-shell-left-panel");
    const rect = sidebar?.getBoundingClientRect?.();
    const main = document.querySelector("main");
    const rail = document.querySelector(codexPlusRailSelector);
    const railRect = rail?.getBoundingClientRect?.();
    // 新版：页面要顶替原生侧边栏——从图标栏右边界起铺满，把宽面板整个盖住，
    // 而不是并排在其右侧多出一列（那样会变成「图标栏 + 会话列表 + 我们的面板」三段）。
    // 旧版没有图标栏，我们的入口就在 aside 内部，此时退回 aside 右边界。
    const left = railRect && railRect.width > 0
      ? Math.max(0, railRect.right)
      : (rect && rect.width > 0 ? Math.max(0, rect.right) : 0);
    // 量出来的是视觉坐标，而 overlay 在缩放空间里布局，所以统一折算成布局坐标。
    // CSS 的 calc(100vw / zoom - left) 用的也是这个空间的量，两边才配得上。
    const zoom = codexPlusWindowZoom();
    const layoutLeft = zoom === 1 ? left : left / zoom;
    overlay.style.setProperty("--codex-plus-page-left", `${layoutLeft}px`);
    overlay.style.left = `${layoutLeft}px`;
    // 官方顶部有一条 header（返回/前进/隐藏侧边栏），图标栏与侧边栏都从它的下沿开始。
    // 我们的 overlay 若从 y=0 铺满就会把整条 header 盖住——用户反馈「比官方少了一条顶部栏」
    // 就是这个原因。这里同样量图标栏的顶边（而非硬编码高度），让 overlay 从 header 下沿开始。
    const top = railRect && railRect.height > 0
      ? Math.max(0, railRect.top)
      : (rect && rect.height > 0 ? Math.max(0, rect.top) : 0);
    const layoutTop = zoom === 1 ? top : top / zoom;
    overlay.style.setProperty("--codex-plus-page-top", `${layoutTop}px`);
    overlay.style.top = `${layoutTop}px`;
    // 右侧与下方官方各留了一圈槽：整行的 [data-app-shell-workspace-row] 比视口小
    // （真机 1715x984 / 视口 1719x988，即右、下各 4px），官方内容面板正好收在行的右下角。
    // 我们原先 right/bottom 都贴 0，于是比官方多占这 4px。这里量取而不是硬编码 4。
    const row = document.querySelector("[data-app-shell-workspace-row]");
    const rowRect = row?.getBoundingClientRect?.();
    const rightGutter = rowRect && rowRect.width > 0 ? Math.max(0, window.innerWidth - rowRect.right) : 0;
    const bottomGutter = rowRect && rowRect.height > 0 ? Math.max(0, window.innerHeight - rowRect.bottom) : 0;
    const layoutRight = zoom === 1 ? rightGutter : rightGutter / zoom;
    const layoutBottom = zoom === 1 ? bottomGutter : bottomGutter / zoom;
    overlay.style.setProperty("--codex-plus-page-right", `${layoutRight}px`);
    overlay.style.setProperty("--codex-plus-page-bottom", `${layoutBottom}px`);
    overlay.style.right = `${layoutRight}px`;
    overlay.style.bottom = `${layoutBottom}px`;
    // 圆角同样量取官方面板自身的值，不写死 12px。
    // 这里量的是 _PageSurface_：官方那个与我们 overlay 同格子的页面面板（rect 都是
    // [52, 44, 1663, 940]），它四角同为 12px，左侧那一角也真实可见——真机像素扫描确认
    // 官方左边缘从 y=44 的 x=62 收到 y=54 的 x=52，是一条完整的弧。
    // 别改用 main[data-app-shell-main-surface] 的 --app-shell-main-surface-clip-start-radius：
    // 那个元素左边缘在 362（缩在侧边栏后面），左侧还用 inset 负内缩把圆角裁掉，start 恒为 0，
    // 会让人误判左侧不该圆——第一版就是这么写错的，用户反馈「少一个圆角」正是缺了左边两个角。
    // 类名是 CSS Modules 的哈希名，但 _PageSurface_ 这个片段稳定，且不会命中 _PageSurfaceLayout_
    //（其后紧跟 L 而非 _）。量到的是视觉值，同样折算成布局坐标。读不到就保持 0，不做猜测。
    const pageSurface = document.querySelector('[class*="_PageSurface_"]');
    const pageSurfaceStyle = pageSurface ? getComputedStyle(pageSurface) : null;
    const mainSurfaceStyle = (() => {
      const main = document.querySelector("main[data-app-shell-main-surface]");
      return main ? getComputedStyle(main) : null;
    })();
    const radius =
      parseFloat(pageSurfaceStyle?.borderTopLeftRadius || "") ||
      parseFloat(mainSurfaceStyle?.getPropertyValue("--app-shell-main-surface-clip-end-radius") || "") ||
      0;
    const layoutRadius = zoom === 1 ? radius : radius / zoom;
    overlay.style.setProperty("--codex-plus-page-radius", `${layoutRadius}px`);
    if (window.__codexPlusPageLayoutObserver &&
        (window.__codexPlusPageLayoutTargets?.main !== main ||
         window.__codexPlusPageLayoutTargets?.sidebar !== sidebar ||
         window.__codexPlusPageLayoutTargets?.rail !== rail)) {
      window.__codexPlusPageLayoutObserver.disconnect();
      for (const target of new Set([main, sidebar, rail])) {
        if (target) window.__codexPlusPageLayoutObserver.observe(target);
      }
      window.__codexPlusPageLayoutTargets = { main, sidebar, rail };
    }
  }

  function observeCodexPlusPageLayout(overlay) {
    window.__codexPlusPageLayoutObserver?.disconnect();
    window.removeEventListener("resize", window.__codexPlusPageResizeHandler);
    const reposition = () => {
      if (overlay.isConnected) positionCodexPlusPage(overlay);
    };
    window.__codexPlusPageLayoutObserver = new ResizeObserver(reposition);
    window.__codexPlusPageLayoutTargets = {};
    window.__codexPlusPageResizeHandler = reposition;
    window.addEventListener("resize", reposition);
    positionCodexPlusPage(overlay);
    syncCodexPlusPageBackButton();
  }

  function codexPlusHostUsesLightTheme() {
    const root = document.documentElement;
    const body = document.body;
    const explicitTheme = [
      root?.getAttribute("data-theme"),
      body?.getAttribute("data-theme"),
      root?.getAttribute("data-color-scheme"),
      body?.getAttribute("data-color-scheme"),
    ].filter(Boolean).join(" ").toLowerCase();
    if (/\b(light|light-mode|theme-light)\b/.test(explicitTheme)) return true;
    if (/\b(dark|dark-mode|theme-dark)\b/.test(explicitTheme)) return false;

    const themeClasses = [root?.className, body?.className]
      .filter((value) => typeof value === "string")
      .join(" ")
      .toLowerCase();
    if (/(^|\s)(light|light-mode|theme-light)(\s|$)/.test(themeClasses)) return true;
    if (/(^|\s)(dark|dark-mode|theme-dark)(\s|$)/.test(themeClasses)) return false;

    return !window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
  }

  /**
   * 取 Codex 当前的界面缩放系数。
   *
   * Codex 的界面缩放的实现是给内层布局节点设 CSS `zoom`（例如 1.2），而不是改
   * documentElement，所以固定在 body 下的 overlay 不会自动跟随。这里把它读出来，
   * 由 applyCodexPlusZoom 自己套上。
   */
  function codexPlusWindowZoom() {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(codexPlusWindowZoomVar);
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) && value > 0 ? value : 1;
  }

  /**
   * 让 overlay 跟随 Codex 的界面缩放，并保持满屏。
   *
   * 直接给 fixed 元素设 zoom 的话，它自身的 `inset: 0` / `100vw` 都还是按未缩放的
   * 视口算，再乘 zoom 就溢出（实测 zoom=1.2 时 100vw 得到 2072px，视口只有 1727）。
   * 所以 overlay 自身的尺寸改用 `calc(100vw / var(--codex-plus-zoom))` 抵消，
   * 内部子元素则用百分比——它们在缩放空间里，百分比本来就对。
   *
   * 字号不在这里动：由 CSS 跟随 zoom 自然放大，与原生行为一致。
   */
  function applyCodexPlusZoom(overlay) {
    if (!overlay?.style) return 1;
    const zoom = codexPlusWindowZoom();
    overlay.style.setProperty("--codex-plus-zoom", String(zoom));
    if (zoom === 1) {
      overlay.style.removeProperty("zoom");
      return 1;
    }
    overlay.style.setProperty("zoom", String(zoom));
    return zoom;
  }

  /**
   * 用 Codex 自己的语义令牌刷新 overlay 的变量。
   *
   * 早先这里内联写死了一套 zinc 调色板（深色正文 #f3f4f6、次要 #a1a1aa），
   * 内联优先级最高，把样式表里本来正确的令牌链整个盖掉了，表现为我们的文字
   * 比原生偏白偏冷。现在改成读宿主算好的值——取不到才回落到兜底色，
   * 这样浅色/深色主题都跟原生同源，也不会在 Codex 调色板变动后失配。
   */
  function applyCodexPlusTheme(overlay) {
    if (!overlay?.style) return;
    const light = codexPlusHostUsesLightTheme();
    const host = getComputedStyle(document.documentElement);
    const read = (names, fallback) => {
      for (const name of names) {
        const value = host.getPropertyValue(name).trim();
        if (value) return value;
      }
      return fallback;
    };
    const variables = {
      "--codex-plus-bg-primary": read(
        ["--color-token-bg-primary", "--token-bg-primary", "--app-color-background-surface"],
        light ? "#ffffff" : "#141414",
      ),
      "--codex-plus-bg-secondary": read(
        ["--color-token-bg-secondary", "--token-bg-secondary", "--color-surface-secondary"],
        light ? "#f7f7f7" : "#2f2f2f",
      ),
      "--codex-plus-bg-elevated": read(
        ["--color-token-dropdown-background", "--color-surface-elevated-secondary", "--color-token-bg-elevated-secondary"],
        light ? "#ffffff" : "#2f2f2f",
      ),
      // 设置页使用独立 surface，正文背景令牌在部分版本中比原生设置页更深。
      "--codex-plus-settings-page-bg": read(
        ["--color-background-surface", "--app-color-background-surface"],
        light ? "#ffffff" : "#181818",
      ),
      "--codex-plus-nav-bg": read(
        ["--color-token-sidebar-background", "--color-background-sidebar"],
        light ? "#f7f7f7" : "#1e1e1e",
      ),
      "--codex-plus-nav-selected-bg": read(
        ["--color-token-interactive-bg-secondary-selected", "--color-background-primary-soft-active"],
        light ? "#e9e9e9" : "#2f2f2f",
      ),
      "--codex-plus-settings-card-bg": read(
        ["--color-background-surface-secondary", "--color-background-surface-raised"],
        light ? "#f7f7f7" : "#232323",
      ),
      "--codex-plus-switch-on": read(
        ["--color-background-accent-solid", "--color-token-bg-accent"],
        "#3485ff",
      ),
      "--codex-plus-switch-off": read(
        ["--color-background-switch-off", "--color-background-secondary-solid"],
        light ? "#dedede" : "#3a3a3a",
      ),
      "--codex-plus-switch-thumb": read(
        ["--color-background-switch-thumb"],
        "#ffffff",
      ),
      "--codex-plus-bg-hover": read(
        ["--color-token-interactive-bg-secondary-hover", "--color-background-primary-soft-hover", "--token-list-hover-background"],
        light ? "rgba(0,0,0,.06)" : "rgba(255,255,255,.08)",
      ),
      "--codex-plus-bg-selected": read(
        ["--color-token-interactive-bg-secondary-selected", "--color-background-primary-soft-active"],
        light ? "rgba(0,0,0,.08)" : "rgba(255,255,255,.12)",
      ),
      "--codex-plus-text": read(
        ["--color-token-text-primary", "--color-text-primary", "--token-text-primary"],
        light ? "#171717" : "#dfdfdf",
      ),
      "--codex-plus-text-secondary": read(
        ["--color-token-text-secondary", "--color-text-secondary-solid", "--color-text-secondary"],
        light ? "#5d5d5d" : "rgba(255,255,255,.71)",
      ),
      "--codex-plus-text-tertiary": read(
        ["--color-token-text-tertiary", "--color-text-tertiary"],
        light ? "#8a8a8a" : "rgba(255,255,255,.498)",
      ),
      "--codex-plus-border": read(
        ["--color-token-border-default", "--color-token-border", "--color-border-primary-outline"],
        light ? "rgba(0,0,0,.12)" : "rgba(255,255,255,.084)",
      ),
      "--codex-plus-border-subtle": read(
        ["--color-token-border-subtle", "--color-border-disabled"],
        light ? "rgba(0,0,0,.08)" : "rgba(255,255,255,.06)",
      ),
      "--codex-plus-danger": read(
        ["--color-text-danger", "--color-token-text-error"],
        light ? "#dc2626" : "#ff6764",
      ),
      "--codex-plus-success": read(
        ["--color-text-success", "--app-color-text-success"],
        light ? "#15803d" : "#40c977",
      ),
      "--codex-plus-warning": read(
        ["--color-text-warning", "--color-text-caution-surface"],
        light ? "#a16207" : "#ffc300",
      ),
    };
    Object.entries(variables).forEach(([name, value]) => overlay.style.setProperty(name, value));
    overlay.dataset.codexPlusTheme = light ? "light" : "dark";
  }

  /** 已移除页面的旧 tab 请求统一回到增强设置。 */
  function codexPlusModalTab(tab) {

    return "home";
  }

  let codexPlusTypingEffectDropdownCleanup = null;

  /** 保留 select 的值与 change 契约，只替换原生系统菜单的呈现。 */
  function syncCodexPlusTypingEffectDropdown(select) {
    const overlay = select.closest(".codex-plus-modal-overlay, .codex-plus-page-overlay");
    const trigger = overlay?.querySelector("[data-codex-plus-typing-effect-trigger]");
    if (!trigger) return;
    trigger.disabled = select.disabled;
    const label = trigger.querySelector("[data-codex-plus-dropdown-label]");
    if (label) label.textContent = select.selectedOptions[0]?.textContent || "关闭";
    overlay.querySelectorAll("[data-codex-plus-typing-effect-option]").forEach((option) => {
      const selected = option.dataset.codexPlusTypingEffectOption === select.value;
      option.setAttribute("aria-selected", String(selected));
      option.tabIndex = selected ? 0 : -1;
    });
    if (select.disabled) closeCodexPlusTypingEffectDropdown();
  }

  function closeCodexPlusTypingEffectDropdown(restoreFocus = false) {
    const menu = document.querySelector("[data-codex-plus-typing-effect-menu]");
    const trigger = menu?.parentElement?.querySelector("[data-codex-plus-typing-effect-trigger]");
    if (menu) menu.hidden = true;
    trigger?.setAttribute("aria-expanded", "false");
    codexPlusTypingEffectDropdownCleanup?.();
    codexPlusTypingEffectDropdownCleanup = null;
    if (restoreFocus && trigger?.isConnected && !trigger.disabled) trigger.focus();
  }

  function openCodexPlusTypingEffectDropdown(overlay, last = false) {
    const select = overlay.querySelector("[data-codex-plus-typing-effect]");
    const trigger = overlay.querySelector("[data-codex-plus-typing-effect-trigger]");
    const menu = overlay.querySelector("[data-codex-plus-typing-effect-menu]");
    if (!select || select.disabled || !trigger || !menu) return;
    closeCodexPlusTypingEffectDropdown();
    syncCodexPlusTypingEffectDropdown(select);
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    // 菜单直接挂 overlay，避开滚动内容的裁剪；坐标换算与页面缩放保持同源。
    const frame = overlay.getBoundingClientRect();
    const anchor = trigger.getBoundingClientRect();
    const zoom = codexPlusWindowZoom();
    const width = frame.width / zoom;
    const height = frame.height / zoom;
    menu.style.maxHeight = `${Math.max(0, height - 16)}px`;
    const left = (anchor.right - frame.left) / zoom - menu.offsetWidth;
    const below = (anchor.bottom - frame.top) / zoom + 4;
    const above = (anchor.top - frame.top) / zoom - menu.offsetHeight - 4;
    const top = below + menu.offsetHeight > height - 8 && above >= 8 ? above : below;
    menu.style.left = `${Math.max(8, Math.min(left, width - menu.offsetWidth - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(top, height - menu.offsetHeight - 8))}px`;
    const options = Array.from(menu.querySelectorAll("[role=option]"));
    const focused = last ? options[options.length - 1] : options.find((option) => option.getAttribute("aria-selected") === "true") || options[0];
    focused?.focus({ preventScroll: true });
    const controller = new AbortController();
    const close = () => closeCodexPlusTypingEffectDropdown();
    document.addEventListener("pointerdown", (event) => {
      if (!menu.contains(event.target) && !trigger.contains(event.target)) close();
    }, { capture: true, signal: controller.signal });
    overlay.addEventListener("scroll", (event) => {
      if (!menu.contains(event.target)) close();
    }, { capture: true, signal: controller.signal });
    window.addEventListener("resize", close, { signal: controller.signal });
    window.addEventListener("blur", close, { signal: controller.signal });
    const observer = new MutationObserver(() => {
      if (!overlay.isConnected) close();
    });
    observer.observe(document.body, { childList: true });
    codexPlusTypingEffectDropdownCleanup = () => {
      controller.abort();
      observer.disconnect();
    };
  }

  function openCodexPlusModal(options = {}) {
    const pageMode = options.page === true;
    const initialTab = codexPlusModalTab(options.tab);
    closeCodexPlusPage();
    document.querySelectorAll(".codex-plus-modal-overlay").forEach((node) => node.remove());
    document.querySelectorAll(`.${codexPlusPageClass}, [data-codex-plus-dialog="true"]`).forEach((node) => node.remove());
    const overlay = document.createElement("div");
    overlay.className = pageMode ? codexPlusPageClass : "codex-plus-modal-overlay";
    overlay.dataset.codexPlusPage = String(pageMode);
    applyCodexPlusTheme(overlay);
    // 跟随 Codex 的界面缩放。必须在写 innerHTML 之前设好，否则内部那些
    // calc(100% / var(--codex-plus-zoom-inverse)) 会先按 1 算一遍再被 zoom 放大。
    applyCodexPlusZoom(overlay);
    // 下拉箭头与勾选图标使用已安装的 Lucide ChevronDown / Check（ISC）路径。
    overlay.innerHTML = `
      <div class="codex-plus-modal-content" role="dialog" aria-modal="true" aria-label="Codex++">
        <div class="codex-plus-modal-header">
          <div class="codex-plus-modal-title"><span class="codex-plus-backend-indicator" data-codex-backend-indicator="true" data-status="checking"></span><span data-codex-plus-version="true">Codex++ ${codexPlusVersion}</span></div>
          ${pageMode ? "" : `<button type="button" class="codex-plus-modal-close" aria-label="关闭">×</button>`}
        </div>
        <div class="codex-plus-modal-body">
          <div class="codex-plus-panel codex-plus-settings" data-codex-plus-panel="home">
            <section class="codex-plus-settings-section" aria-label="常规">
              <h2 class="codex-plus-settings-section-title">常规</h2>
              <div class="codex-plus-settings-card">
                <div class="codex-plus-row">
                  <div><div class="codex-plus-row-title">后端连接</div><div class="codex-plus-row-description">每 5 秒检查一次 launcher 后端状态。</div></div>
                  <div class="codex-plus-backend-status">
                    <div class="codex-plus-backend-label" data-codex-backend-status="true" data-status="checking">正在检查后端…</div>
                  </div>
                </div>
                <div class="codex-plus-row">
                  <div><div class="codex-plus-row-title">Codex增强</div><div class="codex-plus-row-description">关闭后停用删除、导出、插件相关和菜单位置增强。</div></div>
                  <button type="button" class="codex-plus-toggle" data-codex-backend-setting="enhancementsEnabled"><span></span></button>
                </div>
                <div class="codex-plus-row">
                  <div><div class="codex-plus-row-title">插件市场解锁</div><div class="codex-plus-row-description">扩展插件市场请求，尽量显示完整插件列表。</div></div>
                  <button type="button" class="codex-plus-toggle" data-codex-plus-setting="pluginMarketplaceUnlock"><span></span></button>
                </div>
                <div class="codex-plus-row">
                  <div><div class="codex-plus-row-title">模型白名单解锁</div><div class="codex-plus-row-description">从环境变量和 Codex config.toml 中的中转站 /v1/models 拉取模型，并补进模型选择列表。</div></div>
                  <button type="button" class="codex-plus-toggle" data-codex-plus-setting="modelWhitelistUnlock"><span></span></button>
                </div>
              </div>
            </section>
            <section class="codex-plus-settings-section" aria-label="模型与服务">
              <h2 class="codex-plus-settings-section-title">模型与服务</h2>
              <div class="codex-plus-settings-card">
                <div class="codex-plus-row">
                  <div><div class="codex-plus-row-title">原生 Fast 强制解锁</div><div class="codex-plus-row-description">纯 API Key 模式恢复原生 Fast 开关；保存后重新启动 Codex 生效，实际支持与计费由供应商决定。</div></div>
                  <button type="button" class="codex-plus-toggle" data-codex-plus-setting="nativeFastUnlock"><span></span></button>
                </div>
              </div>
            </section>
            <section class="codex-plus-settings-section" aria-label="对话与输入">
              <h2 class="codex-plus-settings-section-title">对话与输入</h2>
              <div class="codex-plus-settings-card">
                <div class="codex-plus-row">
                  <div><div class="codex-plus-row-title">悬浮球 · 下一步建议</div><div class="codex-plus-row-description">生成下一步建议。</div></div>
                  <button type="button" class="codex-plus-toggle" data-codex-plus-setting="stepwise"><span></span></button>
                </div>
                <div class="codex-plus-row">
                  <div><div class="codex-plus-row-title">悬浮球 · 回答大纲</div><div class="codex-plus-row-description">整理回答结构。</div></div>
                  <button type="button" class="codex-plus-toggle" data-codex-plus-setting="answerOutline"><span></span></button>
                </div>
                <div class="codex-plus-row">
                  <div><div class="codex-plus-row-title">容量错误自动重试</div><div class="codex-plus-row-description">模型容量不足时（横幅文案如 “Selected model is at capacity”），自动点「重试」。Codex 原生只会自动重试 4 次，之后只剩手动按钮；开启后由 Codex++ 立刻接管（原生倒计时也一并接管，前 4 次同样不等它），直到成功或达到次数上限。间隔 0 秒表示失败后立刻重试（内部最小 1 秒，避免连发）。</div></div>
                  <div class="codex-plus-width-control">
                    <input class="codex-plus-width-input" data-codex-plus-capacity-retry-interval="true" min="0" max="${capacityAutoRetryIntervalCeilingSeconds}" step="1" type="number" value="${capacityAutoRetryIntervalSeconds()}" title="重试间隔（秒），0 表示立刻重试" aria-label="重试间隔（秒）">
                    <input class="codex-plus-width-input" data-codex-plus-capacity-retry-max-attempts="true" min="1" max="${capacityAutoRetryMaxAttemptsCeiling}" step="1" type="number" value="${capacityAutoRetryMaxAttempts()}" title="最大自动重试次数" aria-label="最大自动重试次数">
                    <button type="button" class="codex-plus-toggle" data-codex-plus-setting="capacityAutoRetry"><span></span></button>
                  </div>
                </div>
                <div class="codex-plus-row">
                  <div><div class="codex-plus-row-title">会话删除</div><div class="codex-plus-row-description">在会话列表悬停显示删除按钮，并支持撤销。</div></div>
                  <button type="button" class="codex-plus-toggle" data-codex-plus-setting="sessionDelete"><span></span></button>
                </div>
                <div class="codex-plus-row">
                  <div><div class="codex-plus-row-title">Markdown 导出</div><div class="codex-plus-row-description">在会话列表显示导出按钮，按本地 rollout 导出带时间戳的 Markdown。</div></div>
                  <button type="button" class="codex-plus-toggle" data-codex-plus-setting="markdownExport"><span></span></button>
                </div>
                <div class="codex-plus-row">
                  <div><div class="codex-plus-row-title">分享会话按钮</div><div class="codex-plus-row-description">在当前会话工具栏显示分享按钮，关闭后立即隐藏。</div></div>
                  <button type="button" class="codex-plus-toggle" data-codex-plus-setting="sessionShare"><span></span></button>
                </div>
                <div class="codex-plus-row">
                  <div><div class="codex-plus-row-title">粘贴修复</div><div class="codex-plus-row-description">从 Word 等富文本来源粘贴到 Codex composer 时只保留纯文本，避免被识别为图片/文件附件。需重启 Codex 才生效。</div></div>
                  <button type="button" class="codex-plus-toggle" data-codex-plus-setting="pasteFix"><span></span></button>
                </div>
              </div>
            </section>
            <section class="codex-plus-settings-section" aria-label="外观与布局">
              <h2 class="codex-plus-settings-section-title">外观与布局</h2>
              <div class="codex-plus-settings-card">
                ${codexPlusSupportsPetRealMouseLook ? `<div class="codex-plus-row">
                  <div><div class="codex-plus-row-title">桌宠跟随真实鼠标</div><div class="codex-plus-row-description">仅支持 V2 桌宠；不会修改宠物文件。将 V2 的 Computer Use 光标朝向动作映射到真实鼠标，V1 开启后安全不生效；拖拽、原生悬停或 Computer Use 活跃时自动让步。</div></div>
                  <button type="button" class="codex-plus-toggle" data-codex-plus-setting="petRealMouseLook"><span></span></button>
                </div>` : ""}
                <div class="codex-plus-row">
                  <div><div class="codex-plus-row-title">打字特效（彩虹 P）</div><div class="codex-plus-row-description">在输入框的光标附近显示彩虹粒子、烟花或星光。系统减少动态效果时暂停。</div></div>
                  <select class="codex-plus-typing-effect-select" data-codex-plus-typing-effect="true" aria-label="打字特效（彩虹 P）" hidden aria-hidden="true" tabindex="-1">
                    <option value="off">关闭</option>
                    <option value="rainbow">彩虹粒子</option>
                    <option value="fireworks">烟花</option>
                    <option value="stars">星光</option>
                  </select>
                  <button type="button" class="codex-plus-dropdown-trigger" data-codex-plus-typing-effect-trigger="true" aria-label="打字特效（彩虹 P）" aria-haspopup="listbox" aria-expanded="false" aria-controls="codex-plus-typing-effect-menu">
                    <span data-codex-plus-dropdown-label="true">关闭</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
                  </button>
                </div>
                <div class="codex-plus-row">
                  <div><div class="codex-plus-row-title">会话 ID 标识</div><div class="codex-plus-row-description">在侧边栏会话标题前显示短 ID 和 UUIDv7 创建时间，方便定位历史会话。</div></div>
                  <button type="button" class="codex-plus-toggle" data-codex-plus-setting="threadIdBadge"><span></span></button>
                </div>
                <div class="codex-plus-row">
                  <div><div class="codex-plus-row-title">对话居中宽度</div><div class="codex-plus-row-description">开启后把主对话和输入框限制到固定最大宽度，适合大屏阅读。</div></div>
                  <div class="codex-plus-width-control">
                    <input class="codex-plus-width-input" data-codex-plus-conversation-view-width="true" min="${conversationViewMinWidth}" max="${conversationViewMaxAllowedWidth}" step="10" type="number" value="${conversationViewWidth()}">
                    <button type="button" class="codex-plus-toggle" data-codex-plus-setting="conversationView"><span></span></button>
                  </div>
                </div>
                <div class="codex-plus-row">
                  <div><div class="codex-plus-row-title">切换对话保留位置</div><div class="codex-plus-row-description">开启后在不同 thread 之间切换时恢复到上一次浏览位置，不再自动跳到底部。</div></div>
                  <button type="button" class="codex-plus-toggle" data-codex-plus-setting="threadScrollRestore"><span></span></button>
                </div>
                <div class="codex-plus-row">
                  <div><div class="codex-plus-row-title">Codex 用量挂件</div><div class="codex-plus-row-description">显示当前 Codex 会话用量、任务状态与可用的供应商余额。可拖动、上传角色图片和设置提醒；默认静音。</div></div>
                  <button type="button" class="codex-plus-toggle" data-codex-plus-setting="whaleWidget"><span></span></button>
                </div>
              </div>
            </section>
            <section class="codex-plus-settings-section" aria-label="工具与关于">
              <h2 class="codex-plus-settings-section-title">工具与关于</h2>
              <div class="codex-plus-settings-card">
                <div class="codex-plus-row">
                  <div><div class="codex-plus-row-title">历史会话修复</div><div class="codex-plus-row-description">切换官方登录、混合 API 或纯 API 后，让旧对话重新显示在当前模式下。</div></div>
                  <button type="button" class="codex-plus-toggle" data-codex-backend-setting="providerSyncEnabled"><span></span></button>
                </div>
                <div class="codex-plus-row">
                  <div><div class="codex-plus-row-title">管理工具</div><div class="codex-plus-row-description">配置增强功能、模型和语音服务。</div></div>
                  <button type="button" class="codex-plus-action-button" data-codex-open-manager="true">打开管理工具</button>
                </div>
                <div class="codex-plus-row">
                  <div><div class="codex-plus-row-title">刷新 UI 配置</div><div class="codex-plus-row-description">手动请求当前 Statsig 客户端重新评估远程配置，并显示 enable_i18n 的结果。</div></div>
                  <button type="button" class="codex-plus-action-button" data-codex-refresh-statsig="true">刷新 UI 配置</button>
                </div>
                <div class="codex-plus-row">
                  <div><div class="codex-plus-row-title">打开 DevTools</div><div class="codex-plus-row-description">打开当前 Codex 页面开发者工具，方便查看用户拓展报错。</div></div>
                  <button type="button" class="codex-plus-action-button" data-codex-open-devtools="true">打开 DevTools</button>
                </div>
                <div class="codex-plus-row">
                  <div><div class="codex-plus-row-title">关于 Codex++</div><div class="codex-plus-about">Codex++ 是通过外部 launcher 注入的增强菜单，不修改 Codex App 原始安装文件。<br>Build: <span data-codex-plus-build="true">${codexPlusBuild}</span><br>GitHub: <a href="https://github.com/BigPizzaV3/CodexPlusPlus" target="_blank" rel="noreferrer">https://github.com/BigPizzaV3/CodexPlusPlus</a><br>Discord: <a href="https://discord.gg/y96kX7A76v" target="_blank" rel="noreferrer">https://discord.gg/y96kX7A76v</a><br>Telegram: <a href="https://t.me/CodexPlusPlus" target="_blank" rel="noreferrer">https://t.me/CodexPlusPlus</a></div></div>
                </div>
                <div class="codex-plus-row">
                  <div><div class="codex-plus-row-title">Discord 社区</div><div class="codex-plus-row-description">加入 Discord 获取更新消息、反馈问题或交流使用体验。</div></div>
                  <button type="button" class="codex-plus-action-button" data-codex-plus-discord="true">打开 Discord</button>
                </div>
                <div class="codex-plus-row">
                  <div><div class="codex-plus-row-title">Telegram 频道</div><div class="codex-plus-row-description">加入 Telegram 获取更新消息和交流使用体验。</div></div>
                  <button type="button" class="codex-plus-action-button" data-codex-plus-telegram="true">打开 Telegram</button>
                </div>
                <div class="codex-plus-row">
                  <div><div class="codex-plus-row-title">提出问题</div><div class="codex-plus-row-description">打开 GitHub Issues 反馈问题或建议。</div></div>
                  <button type="button" class="codex-plus-issue-button" data-codex-plus-issue="true">提出问题</button>
                </div>
              </div>
            </section>
            ${renderCodexPlusExtensionMenuRows()}
          </div>
        </div>
      </div>
      <div id="codex-plus-typing-effect-menu" class="codex-plus-dropdown-menu" data-codex-plus-typing-effect-menu="true" role="listbox" aria-label="打字特效（彩虹 P）" hidden>
        ${[["off", "关闭"], ["rainbow", "彩虹粒子"], ["fireworks", "烟花"], ["stars", "星光"]].map(([value, label]) => `
          <button type="button" class="codex-plus-dropdown-option" data-codex-plus-typing-effect-option="${value}" role="option" aria-selected="false" tabindex="-1">
            <span>${label}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>
          </button>
        `).join("")}
      </div>
    `;
    overlay.querySelectorAll(".codex-plus-toggle[data-codex-plus-setting], .codex-plus-toggle[data-codex-backend-setting]").forEach((button) => {
      button.setAttribute("role", "switch");
      button.setAttribute("aria-checked", "false");
      button.setAttribute("aria-label", button.closest(".codex-plus-row")?.querySelector(".codex-plus-row-title")?.textContent || "设置");
    });
    const closeButton = overlay.querySelector(".codex-plus-modal-close");
    closeButton?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      overlay.remove();
      if (pageMode) setCodexPlusSidebarNavActive(false);
    }, true);
    overlay.addEventListener("input", (event) => {
      const target = event.target instanceof Element ? event.target : event.target?.parentElement;
      const widthInput = target?.closest("[data-codex-plus-conversation-view-width]");
      if (widthInput) setConversationViewWidth(widthInput.value);
    }, true);
    overlay.addEventListener("change", (event) => {
      const target = event.target instanceof Element ? event.target : event.target?.parentElement;
      const typingEffectSelect = target?.closest("[data-codex-plus-typing-effect]");
      if (typingEffectSelect) {
        if (!typingEffectSelect.disabled && ["off", "rainbow", "fireworks", "stars"].includes(typingEffectSelect.value)) {
          setCodexPlusSetting("typingEffect", typingEffectSelect.value);
        }
        return;
      }
      const widthInput = target?.closest("[data-codex-plus-conversation-view-width]");
      if (widthInput) {
        const width = normalizeConversationViewWidth(widthInput.value);
        widthInput.value = String(width || conversationViewWidth());
        setConversationViewWidth(widthInput.value);
      }
      // 次数/间隔输入只在 change（失焦/回车）时提交：input 事件逐字符提交会把
      // 用户输入 "15" 的过程保存成 1。
      const attemptsInput = target?.closest("[data-codex-plus-capacity-retry-max-attempts]");
      if (attemptsInput) {
        attemptsInput.value = String(setCapacityAutoRetryMaxAttempts(attemptsInput.value));
      }
      const intervalInput = target?.closest("[data-codex-plus-capacity-retry-interval]");
      if (intervalInput) {
        intervalInput.value = String(setCapacityAutoRetryIntervalSeconds(intervalInput.value));
      }
    }, true);
    overlay.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : event.target?.parentElement;
      // 拓展注册的菜单项。放在最前面是因为它的判定完全基于自己的 data 属性，
      // 与下面那些内置分支不会重叠；万一将来重叠，也应当由拓展优先拿到。
      if (handleCodexPlusExtensionMenuClick(target)) return;
      const typingEffectTrigger = target?.closest("[data-codex-plus-typing-effect-trigger]");
      if (typingEffectTrigger) {
        const menu = overlay.querySelector("[data-codex-plus-typing-effect-menu]");
        if (menu?.hidden) openCodexPlusTypingEffectDropdown(overlay);
        else closeCodexPlusTypingEffectDropdown();
        return;
      }
      const typingEffectOption = target?.closest("[data-codex-plus-typing-effect-option]");
      if (typingEffectOption) {
        const select = overlay.querySelector("[data-codex-plus-typing-effect]");
        if (select && !select.disabled) {
          const value = typingEffectOption.dataset.codexPlusTypingEffectOption;
          if (select.value !== value) {
            select.value = value;
            select.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }
        closeCodexPlusTypingEffectDropdown(true);
        return;
      }
      if (target?.closest("[data-codex-open-devtools]")) {
        postJson("/devtools/open", {});
        return;
      }
      if (target?.closest("[data-codex-open-manager]")) {
        openManagerFromCodex();
        return;
      }
      const refreshStatsigButton = target?.closest("[data-codex-refresh-statsig]");
      if (refreshStatsigButton) {
        const button = refreshStatsigButton;
        if (button.dataset.pending === "true") return;
        button.dataset.pending = "true";
        const originalLabel = button.textContent;
        button.textContent = "刷新中…";
        Promise.resolve(window.__codexPlusRefreshStatsigUiConfig?.())
          .then((result) => {
            if (!result || result.status === "unsupported") {
              showToast("当前 Codex 构建没有可用的 Statsig 刷新接口", null);
            } else if (result.status === "ok" && result.enable_i18n === true) {
              showToast("UI 配置已刷新，enable_i18n=true", null);
              // 只有用户主动点击且远端明确返回 true 时刷新页面，让 Codex
              // 重新走语言包加载 gate；不在启动/网络恢复路径自动触发。
              window.setTimeout(() => window.location.reload(), 150);
            } else if (result.status === "ok" && result.enable_i18n === false) {
              showToast("UI 配置已刷新，enable_i18n=false", null);
            } else {
              // showToast 的第二个参数若是字符串会被当成撤销 token（旧签名），
              // 错误详情必须拼进正文并以对象参数标明类型。
              const detail = result.errors?.join("；");
              showToast(`UI 配置刷新${result.status === "partial" ? "部分完成" : "失败"}${detail ? `：${detail}` : ""}`, { type: result.status === "partial" ? "warn" : "error" });
            }
          })
          .catch((error) => showToast(`UI 配置刷新失败：${error?.message || String(error)}`, { type: "error" }))
          .finally(() => {
            button.dataset.pending = "false";
            button.textContent = originalLabel || "刷新 UI 配置";
          });
        return;
      }
      // 推荐卡片用 window.open 而非原生 <a target="_blank">：Codex 是 Electron
      // 应用，原生新窗口跳转在它的 webview 里不会交给系统浏览器（同页的
      // Discord / Telegram / Issues 按钮也一律走 window.open）。
      const adCard = target?.closest("[data-codex-plus-ad-url]");
      if (adCard) {
        const adUrl = adCard.getAttribute("data-codex-plus-ad-url") || "";
        if (/^https?:\/\//i.test(adUrl)) {
          event.preventDefault();
          window.open(adUrl, "_blank", "noopener,noreferrer");
        }
        return;
      }
      if (target?.closest("[data-codex-plus-discord]")) {
        window.open("https://discord.gg/y96kX7A76v", "_blank");
        return;
      }
      if (target?.closest("[data-codex-plus-telegram]")) {
        window.open("https://t.me/CodexPlusPlus", "_blank");
        return;
      }
      const issueButton = target?.closest("[data-codex-plus-issue]");
      if (issueButton) {
        const issueUrl = "https://github.com/BigPizzaV3/CodexPlusPlus/issues";
        window.open(issueUrl, "_blank");
        return;
      }
      const toggle = target?.closest("[data-codex-plus-setting]");
      if (toggle) {
        if (toggle.disabled || toggle.dataset.pending === "true") return;
        const key = toggle.getAttribute("data-codex-plus-setting");
        setCodexPlusSetting(key, !codexPlusSettings()[key]);
        return;
      }
      const backendToggle = target?.closest("[data-codex-backend-setting]");
      if (backendToggle) {
        const key = backendToggle.getAttribute("data-codex-backend-setting");
        setBackendSetting(key, !codexPlusBackendSettings[key]);
        return;
      }
    }, true);
    overlay.addEventListener("keydown", (event) => {
      const target = event.target instanceof Element ? event.target : event.target?.parentElement;
      if (target?.closest("[data-codex-plus-typing-effect-trigger]") && ["ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        openCodexPlusTypingEffectDropdown(overlay, event.key === "ArrowUp");
        return;
      }
      const menu = target?.closest("[data-codex-plus-typing-effect-menu]");
      if (!menu || menu.hidden) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeCodexPlusTypingEffectDropdown(true);
      } else if (event.key === "Tab") {
        // 回到触发器后让浏览器处理 Tab，焦点会自然进入下一项而不会停在隐藏菜单里。
        closeCodexPlusTypingEffectDropdown(true);
      } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const options = Array.from(menu.querySelectorAll("[role=option]"));
        const current = options.indexOf(document.activeElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1
          : (current + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
        options.forEach((option, index) => { option.tabIndex = index === next ? 0 : -1; });
        options[next]?.focus({ preventScroll: true });
      }
    }, true);
    document.body.appendChild(overlay);
    if (pageMode) {
      observeCodexPlusPageLayout(overlay);
      // 先挂载内容，再同步设置页状态。
      installCodexPlusPageLayout(overlay, initialTab);
    }
    selectCodexPlusTab(initialTab);
    // 设置页状态同步完成后再更新导航激活态。
    if (pageMode) setCodexPlusSidebarNavActive(true, codexPlusActiveEntry() || "home");
    renderCodexPlusMenu();
    refreshCodexPlusBackendToggles();
    renderBackendStatus();
  }

  function openCodexPlusPage() {
    openCodexPlusModal({ page: true });
  }

  function closeCodexPlusPage() {
    clearTimeout(window.__codexPlusPageNavigationCloseTimer);
    window.__codexPlusPageNavigationCloseTimer = null;
    closeCodexPlusTypingEffectDropdown();
    window.removeEventListener("resize", window.__codexPlusPageResizeHandler);
    window.__codexPlusPageResizeHandler = null;
    window.__codexPlusPageLayoutObserver?.disconnect();
    window.__codexPlusPageLayoutObserver = null;
    window.__codexPlusPageLayoutTargets = null;
    document.querySelectorAll(`.${codexPlusPageClass}`).forEach((node) => node.remove());
    setCodexPlusSidebarNavActive(false);
    restoreCodexPlusPageBackButton();
  }

  function codexPlusNativeBackButton() {
    const labels = new Set(["back", "go back", "返回", "后退"]);
    const selector = selectors.appHeader.split(",").map((header) => `${header.trim()} button`).join(", ");
    const buttons = Array.from(document.querySelectorAll(selector))
      .filter((button) => !button.closest(`.${codexPlusPageClass}, [data-codex-plus-ext]`));
    // 宿主的前进按钮复用返回箭头并水平翻转；路径识别不依赖界面语言。
    const backIcon = 'svg:not([class~="-scale-x-100"]) path[d^="M6.96231 2.96214C7.16727 2.7574"]';
    return buttons.find((button) => button.querySelector(backIcon)) || buttons.find((button) =>
      labels.has(String(button.getAttribute("aria-label") || button.title || "").trim().toLowerCase())) || null;
  }

  function restoreCodexPlusPageBackButton() {
    const state = window.__codexPlusPageBackButtonState;
    window.__codexPlusPageBackButtonState = null;
    if (!state) return;
    for (const [name, value] of state.attributes) {
      if (value === null) state.button.removeAttribute(name);
      else state.button.setAttribute(name, value);
    }
  }

  function syncCodexPlusPageBackButton() {
    if (window.__codexPlusPageNavigationCloseTimer != null) return;
    if (!document.querySelector(`.${codexPlusPageClass}`)) {
      restoreCodexPlusPageBackButton();
      return;
    }
    const button = codexPlusNativeBackButton();
    if (!button) return;
    if (window.__codexPlusPageBackButtonState?.button !== button) {
      restoreCodexPlusPageBackButton();
      window.__codexPlusPageBackButtonState = {
        button,
        attributes: ["disabled", "aria-disabled", "tabindex", "data-disabled"]
          .map((name) => [name, button.getAttribute(name)]),
      };
    }
    // 覆盖页自身可返回，即使原生历史尚无上一页也必须能点击。
    button.removeAttribute("disabled");
    button.removeAttribute("aria-disabled");
    button.removeAttribute("data-disabled");
    if (button.getAttribute("tabindex") === "-1") button.removeAttribute("tabindex");
  }

  function closeCodexPlusPageAfterNativeNavigation() {
    const page = document.querySelector(`.${codexPlusPageClass}`);
    if (!page) return;
    clearTimeout(window.__codexPlusPageNavigationCloseTimer);
    // 原生导航前撤销临时属性，避免延迟关闭覆盖导航提交后的返回状态。
    restoreCodexPlusPageBackButton();
    const timer = setTimeout(() => {
      if (window.__codexPlusPageNavigationCloseTimer !== timer) return;
      window.__codexPlusPageNavigationCloseTimer = null;
      if (document.querySelector(`.${codexPlusPageClass}`) === page) closeCodexPlusPage();
    }, 0);
    window.__codexPlusPageNavigationCloseTimer = timer;
  }

  function installCodexPlusPageNavigationCloseHandler() {
    syncCodexPlusPageBackButton();
    document.removeEventListener("click", window.__codexPlusPageNavigationCloseHandler, true);
    window.removeEventListener("click", window.__codexPlusPageNavigationCloseHandler, true);
    window.__codexPlusPageNavigationCloseHandler = (event) => {
      if (!document.querySelector(`.${codexPlusPageClass}`)) return;
      const target = event.target instanceof Element ? event.target : event.target?.parentElement;
      const backButton = codexPlusNativeBackButton();
      if (backButton && target?.closest("button") === backButton) {
        // 原生界面仍在覆盖页下方，关闭即可；继续后退会跳过进入前的界面。
        event.preventDefault();
        event.stopImmediatePropagation();
        closeCodexPlusPage();
        return;
      }
      if (!target?.closest(selectors.sidebarThread)) return;
      // Let Codex's own click handler update its route before removing our page.
      closeCodexPlusPageAfterNativeNavigation();
    };
    window.addEventListener("click", window.__codexPlusPageNavigationCloseHandler, true);
  }

  function installCodexPlusSidebarNavigation() {
    if (window.__CODEX_PLUS_MARKETPLACE_ONLY__ === true) return;
    document.querySelectorAll(`#${codexPlusMenuId}, [data-codex-plus-menu="true"]`).forEach((node) => node.remove());
    // 旧版的侧边栏会话列表在 aside 里带 role="navigation"。新版把这个 role 挪去了
    // 缩略图面板/演示目录，所以留一条限定在 aside 内的兜底。
    // 注意：新版图标栏也是 aside 里的 <nav>，且文档顺序在前，而 querySelector 的选择器
    // 列表是按文档顺序取首个命中项的——必须显式排除图标栏，否则会挂到它上面。
    const navigation = document.querySelector('aside.app-shell-left-panel nav[role="navigation"]')
      || Array.from(document.querySelectorAll("aside.app-shell-left-panel nav"))
        .find((nav) => !nav.hasAttribute("data-app-navigation-rail"))
      || null;
    if (!navigation) return;
    const navButtons = Array.from(navigation.querySelectorAll("button"));
    const pluginButton = navButtons.find((button) => {
      if (button.querySelector(selectors.pluginSvgPath)) return true;
      const label = (button.getAttribute("aria-label") || button.textContent || "").trim();
      return /^(插件|Plugins)$/i.test(label);
    });
    const insertionButton = pluginButton || navButtons.find((button) => {
      const label = (button.getAttribute("aria-label") || button.textContent || "").replace(/\s+/g, " ").trim();
      return /^(已安排|Scheduled|拉取请求|Pull requests|新对话|New chat)$/i.test(label);
    });
    if (navigation.dataset.codexPlusSidebarNavigationListener !== "true") {
      navigation.dataset.codexPlusSidebarNavigationListener = "true";
      navigation.addEventListener("click", (event) => {
        const target = event.target instanceof Element ? event.target : event.target?.parentElement;
        if (target?.closest(`#${codexPlusSidebarNavId}`)) return;
        if (target?.closest("button, a")) closeCodexPlusPageAfterNativeNavigation();
      }, true);
    }
    let wrapper = document.getElementById(codexPlusSidebarNavId);
    const parent = insertionButton?.parentElement || navigation;
    if (!wrapper || wrapper.parentElement !== parent) {
      wrapper?.remove();
      wrapper = document.createElement("div");
      wrapper.id = codexPlusSidebarNavId;
      wrapper.dataset.codexPlusSidebarNav = "true";
      const button = (insertionButton || document.createElement("button")).cloneNode(true);
      if (!(button instanceof HTMLElement)) return;
      if (!button.className) button.className = "h-token-nav-row w-full flex items-center gap-2 px-3 py-2 text-sm";
      button.type = "button";
      button.removeAttribute("data-state");
      button.removeAttribute("aria-current");
      button.removeAttribute("disabled");
      button.removeAttribute("aria-disabled");
      button.setAttribute("aria-label", "Codex++");
      button.textContent = "";
      button.innerHTML = `<span class="codex-plus-sidebar-nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M3 12h18M5.5 5.5l13 13M18.5 5.5l-13 13"/></svg></span><span class="truncate">Codex++</span><span class="codex-plus-sidebar-nav-status" data-status="${codexPlusBackendStatus.status || "checking"}" aria-hidden="true"></span>`;
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openCodexPlusPage();
      }, true);
      wrapper.appendChild(button);
      if (insertionButton?.nextSibling) {
        parent.insertBefore(wrapper, insertionButton.nextSibling);
      } else {
        parent.appendChild(wrapper);
      }
    }
    const status = wrapper.querySelector(".codex-plus-sidebar-nav-status");
    if (status) status.dataset.status = codexPlusBackendStatus.status || "checking";
    const active = !!document.querySelector(`.${codexPlusPageClass}`);
    setCodexPlusSidebarNavActive(active, codexPlusActiveEntry() || "home");
  }

  function removeCodexPlusRailNavigation() {
    [codexPlusRailNavId, codexPlusRailExtensionsId, codexPlusRailSponsorId, codexPlusRailPluginMarketId].forEach((id) => document.getElementById(id)?.remove());
  }

  function detachCodexPlusSidebarNavigation() {
    document.getElementById(codexPlusSidebarNavId)?.remove();
    document.getElementById(codexPlusSidebarPluginMarketId)?.remove();
  }

  /**
   * 挑一个原生 rail 按钮当模板。
   *
   * 优先 builtin:projects——它在 primary 区，且不像 builtin:library 那样会走
   * tooltip/triggerRef 的特殊分支。找不到就退回第一个可见 destination。
   */
  function codexPlusRailTemplateButton(rail) {
    const preferred = rail.querySelector(`${codexPlusRailDestinationSelector}[data-sidebar-destination="builtin:projects"]`);
    if (preferred) return preferred;
    const candidates = Array.from(rail.querySelectorAll(codexPlusRailDestinationSelector))
      .filter((node) => node.closest("nav") === rail);
    // 优先挑未选中的：clone 会把选中态的属性和配色一起带过来，
    // 表现为入口在没有任何页面打开时也显示成选中。
    const isSelected = (node) => node.getAttribute("aria-current") === "page" || node.hasAttribute("data-selected");
    return candidates.find((node) => !isSelected(node)) || candidates[0] || null;
  }

  function codexPlusRailPrimaryAnchor(rail) {
    const fixedIds = [
      'builtin:home',
      'builtin:customize',
    ];
    const buttons = Array.from(rail.querySelectorAll(codexPlusRailDestinationSelector));
    return buttons.find((node) => {
      const id = node.getAttribute("data-sidebar-destination") || "";
      return id && !fixedIds.includes(id);
    }) || null;
  }

  function createCodexPlusRailButton({ id, template, label, iconMarkup, withStatus, onActivate }) {
    const wrapper = document.createElement("div");
    wrapper.id = id;
    wrapper.dataset.codexPlusRail = "home";
    // 模板拿不到时不回退到旧模式，而是自建一个按钮：rail 上 destination 可能在
    // 登录态/接口就绪前还是空的，那只是暂时状态，不该让入口整个消失。
    const button = template
      ? template.cloneNode(true)
      : document.createElement("button");
    if (!(button instanceof HTMLElement)) return null;
    button.type = "button";
    // 留着 data-sidebar-destination 会被 Codex 的自定义/排序逻辑当成真的 destination。
    button.removeAttribute("data-sidebar-destination");
    button.removeAttribute("data-state");
    button.removeAttribute("disabled");
    button.removeAttribute("aria-disabled");
    // 选中态由 data-selected 驱动，但它只在没有 data-suppress-active-style 时生效。
    // 模板若是未选中的按钮，会带着 suppress 过来，压制掉我们的选中样式——
    // 必须移除，否则按钮永远停在未选中的暗色。
    button.removeAttribute("data-suppress-active-style");
    // 起始为未选中；激活态由 setCodexPlusSidebarNavActive 切换 data-selected。
    button.removeAttribute("data-selected");
    button.removeAttribute("aria-current");
    button.setAttribute("aria-label", label);
    button.setAttribute("title", label);
    button.textContent = "";
    // 原生 rail 按钮是纯图标，没有文字标签，所以只放图标 + 状态点。
    button.innerHTML = `<span class="codex-plus-rail-icon" aria-hidden="true">${iconMarkup}</span>`
      + (withStatus
        ? `<span class="codex-plus-sidebar-nav-status" data-status="${codexPlusBackendStatus.status || "checking"}" aria-hidden="true"></span>`
        : "");
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onActivate();
    }, true);
    wrapper.appendChild(button);
    return wrapper;
  }

  /**
   * 把 Codex++ / 拓展两个入口挂到新版图标栏。
   *
   * Codex 的 rail 渲染晚于注入，所以这里每次 scan 都会被调用；靠 id 判存避免重复插入。
   */
  function installCodexPlusRailNavigation() {
    if (window.__CODEX_PLUS_MARKETPLACE_ONLY__ === true) return false;
    document.getElementById(codexPlusRailExtensionsId)?.remove();
    document.querySelectorAll(`#${codexPlusMenuId}, [data-codex-plus-menu="true"]`).forEach((node) => node.remove());
    const rail = document.querySelector(codexPlusRailSelector);
    if (!rail) return false;
    // 注意：模板按钮可能在 rail 还没渲染出 destination 时拿不到（登录态/接口未就绪）。
    // 那只是暂时状态，不能因此判定"没有 rail"而回退旧模式，否则入口会整个消失。
    const template = codexPlusRailTemplateButton(rail);

    // 旧逻辑把"点原生导航就关掉 Codex++ 页面"的监听挂在侧边栏的 navigation 上，
    // 但 rail 模式下那个函数会提前 return，监听压根装不上，所以这里补一份。
    if (rail.dataset.codexPlusRailNavigationListener !== "true") {
      rail.dataset.codexPlusRailNavigationListener = "true";
      rail.addEventListener("click", (event) => {
        const target = event.target instanceof Element ? event.target : event.target?.parentElement;
        if (target?.closest(`#${codexPlusRailNavId}, #${codexPlusRailExtensionsId}, #${codexPlusRailSponsorId}`)) return;
        // 拓展入口的 id 是动态生成的，不在上面三个之内。不排除它，点拓展入口会被
        // 当成「点了原生导航按钮」，刚打开的拓展页面立刻被关掉。
        if (target?.closest(`[${codexPlusExtensionConstants.extensionAttribute}]`)) return;
        if (target?.closest("button, a")) closeCodexPlusPageAfterNativeNavigation();
      }, true);
    }

    const icons = {
      home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M3 12h18M5.5 5.5l13 13M18.5 5.5l-13 13"/></svg>',
    };

    const specs = [
      { id: codexPlusRailNavId, label: "Codex++", iconMarkup: icons.home, withStatus: true, onActivate: openCodexPlusPage },
    ];

    const anchor = codexPlusRailPrimaryAnchor(rail);
    // 插到锚点所在的父容器里，而不是 nav 顶层：原生按钮可能嵌在 nav 内部的分组 div 中，
    // 直接插顶层会破坏它的 flex 布局。
    const host = anchor?.parentElement || rail;
    let cursor = anchor;
    specs.forEach((spec) => {
      let wrapper = document.getElementById(spec.id);
      if (!wrapper || wrapper.parentElement !== host) {
        wrapper?.remove();
        wrapper = createCodexPlusRailButton({ ...spec, template });
        if (!wrapper) return;
      }
      // 顺序：Codex++ 在前，「拓展」在后；紧跟在 primary 区锚点后面。
      if (cursor?.nextSibling) {
        host.insertBefore(wrapper, cursor.nextSibling);
      } else if (cursor) {
        host.appendChild(wrapper);
      } else {
        host.insertBefore(wrapper, host.firstElementChild);
      }
      cursor = wrapper;
    });

    const status = document.getElementById(codexPlusRailNavId)?.querySelector(".codex-plus-sidebar-nav-status");
    if (status) status.dataset.status = codexPlusBackendStatus.status || "checking";
    return true;
  }

  /** 图标栏存在时走它，否则回退到旧版宽面板侧边栏入口。两条路径互斥，不会重复出现。 */
