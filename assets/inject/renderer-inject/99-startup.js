  // 热重注入时清理旧版本留下的多开身份提示。
  document.getElementById("codex-plus-instance-identity")?.remove();
  delete window.__CODEX_PLUS_INSTANCE_LABEL__;
  delete window.__CODEX_PLUS_INSTANCE_ID__;
  if (window.__CODEX_PLUS_MARKETPLACE_ONLY__ !== true) {
    installCodexConfigReadDeadline();
    installCodexPlusForceChineseLocale();
    runScanStep(installCodexPlusTypingEffects);
    runScanStep(syncCodexPlusWhaleWidget);
    let codexPlusResizeRafId = 0;
    window.__codexPlusResizeHandler = () => {
      cancelAnimationFrame(codexPlusResizeRafId);
      codexPlusResizeRafId = requestAnimationFrame(() => {
        syncActionGroupsLayout(true);
        runScanStep(refreshConversationView);
      });
    };
    window.addEventListener("resize", window.__codexPlusResizeHandler);
  }
  window.__codexSessionDeleteObserver?.disconnect();
  window.__codexSessionDeleteObserver = new MutationObserver(scheduleScan);
  window.__codexSessionDeleteObserver.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: window.__CODEX_PLUS_MARKETPLACE_ONLY__ === true
      ? ["disabled", "aria-disabled", "data-disabled"]
      : ["data-app-action-sidebar-thread-id", "href"],
  });
  document.removeEventListener("pointerdown", window.__codexSessionActionTriggerHandler, true);
  document.removeEventListener("click", window.__codexSessionActionTriggerClickHandler, true);
  if (window.__CODEX_PLUS_MARKETPLACE_ONLY__ !== true) {
    window.__codexSessionActionTriggerHandler = rememberSessionActionTrigger;
    document.addEventListener("pointerdown", window.__codexSessionActionTriggerHandler, true);
    window.__codexSessionActionTriggerClickHandler = rememberSessionActionTrigger;
    document.addEventListener("click", window.__codexSessionActionTriggerClickHandler, true);
  }
  // 对外接口层在此刻挂载：此时所有分片都已执行完毕，闭包里的函数全部就绪。
  // 放在 99-tail 收尾之前，确保 IIFE 结束前 window.codexPlus 已经可用——
  // 用户脚本的注入晚于本脚本，不会撞上这个时间点。
  window.__codexPlusPluginMarketplaceEnabled = () => codexPlusBackendSettingsLoaded
    && !!codexPlusSettings().pluginMarketplaceUnlock;
  window.codexPlus = buildCodexPlusExtensionApi();
