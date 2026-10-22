  function installStyle() {
    const existingStyle = document.getElementById(styleId);
    if (existingStyle?.dataset.codexDeleteStyleVersion === codexDeleteStyleVersion) return;
    existingStyle?.remove();
    const style = document.createElement("style");
    style.id = styleId;
    style.dataset.codexDeleteStyleVersion = codexDeleteStyleVersion;
    style.textContent = `
      .${actionGroupClass} {
        position: absolute;
        right: var(--codex-session-actions-right, 28px);
        top: 50%;
        transform: translateY(-50%);
        z-index: 20;
        opacity: 0;
        pointer-events: none;
        display: inline-flex;
        align-items: center;
        gap: 2px;
        background: transparent;
      }
      .${actionButtonClass} {
        width: 20px;
        height: 20px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 0;
        border-radius: 6px;
        background: transparent;
        color: var(--codex-session-action-color, var(--color-token-text-tertiary, var(--codex-plus-text-tertiary, rgba(255,255,255,.5))));
        font: 14px/1 system-ui, sans-serif;
        padding: 0;
        cursor: default;
        text-align: center;
      }
      .${actionButtonClass} svg {
        display: block;
        width: 16px;
        height: 16px;
      }
      .${actionButtonClass}:hover,
      .${actionButtonClass}:focus-visible {
        background: var(--codex-session-action-hover-background, transparent);
        color: var(--codex-session-action-hover-color, var(--codex-session-action-color, var(--color-token-text-primary, #f4f4f5)));
        outline: none;
      }
      .${moreMenuClass} {
        position: fixed;
        z-index: 2147483201;
        min-width: 104px;
        border: 1px solid var(--codex-plus-border);
        border-radius: var(--border-radius-lg, 8px);
        background: var(--codex-plus-bg-elevated);
        color: var(--codex-plus-text);
        box-shadow: var(--ui-menu-shadow, var(--shadow-300, 0 8px 24px rgba(0,0,0,.16)));
        padding: 4px;
      }
      .${moreMenuClass}[hidden] { display: none !important; }
      .${moreMenuClass}.codex-session-more-menu-open-up {
        transform: translateY(calc(-100% - 34px));
      }
      .codex-session-more-menu-item {
        width: 100%;
        border: 0;
        border-radius: var(--border-radius-sm, 6px);
        background: transparent;
        color: inherit;
        cursor: default;
        display: flex;
        align-items: center;
        gap: 8px;
        font: inherit;
        font-size: 13px;
        line-height: 18px;
        padding: 6px 8px;
        text-align: left;
      }
      .codex-session-more-menu-item:hover,
      .codex-session-more-menu-item:focus-visible {
        background: var(--codex-plus-bg-hover);
        outline: none;
      }
      .codex-session-more-menu-icon {
        width: 16px;
        text-align: center;
      }
      .${threadIdBadgeClass} {
        flex: 0 0 auto;
        display: inline-flex;
        align-items: center;
        max-width: 152px;
        margin-right: 8px;
        color: var(--text-secondary, var(--color-token-text-secondary, var(--codex-plus-text-secondary, rgba(142,142,160,.95))));
        font: 11px/1.1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
        letter-spacing: .01em;
        opacity: .9;
        white-space: nowrap;
        user-select: text;
      }
      ${selectors.sidebarThread} [data-codex-thread-id-badge-wrap="true"] {
        display: inline-flex;
        align-items: center;
        min-width: 0;
        max-width: 100%;
      }
      ${selectors.sidebarThread} [data-codex-thread-id-badge-wrap="true"] ${selectors.threadTitle},
      ${selectors.sidebarThread} [data-codex-thread-id-badge-wrap="true"] .truncate.select-none,
      ${selectors.sidebarThread} [data-codex-thread-id-badge-wrap="true"] .truncate.text-base {
        min-width: 0;
      }
      .codex-archive-row-button {
        border: 1px solid var(--color-token-border-light, var(--color-token-border-default, rgba(0,0,0,.12)));
        border-radius: var(--border-radius-sm, 6px);
        background: var(--color-token-bg-secondary, transparent);
        color: var(--color-token-text-secondary, inherit);
        font: inherit;
        font-size: 13px;
        line-height: 16px;
        padding: 3px 8px;
        cursor: pointer;
      }
      .codex-archive-row-button.${buttonClass} {
        border-color: var(--color-border-danger, #dc2626);
        background: var(--color-background-danger-soft, rgba(220,38,38,.1));
        color: var(--color-text-danger, #dc2626);
      }
      .codex-archive-row-button.${exportButtonClass} {
        border-color: var(--color-token-border-light, var(--color-token-border-default, rgba(0,0,0,.12)));
        background: var(--color-token-bg-secondary, transparent);
        color: var(--color-token-text-primary, inherit);
      }
      .${sessionCopyMenuItemClass} {
        cursor: pointer;
      }
      .${sessionShareButtonClass} {
        position: static;
        flex: 0 0 auto;
        pointer-events: auto;
        -webkit-app-region: no-drag;
        margin-left: 2px;
        z-index: 2147483001;
        min-height: var(--height-button-composer, 32px);
        border-radius: var(--border-radius-lg, 8px);
        font: inherit;
        font-size: 13px;
        line-height: 18px;
        cursor: pointer;
        box-shadow: none;
      }
      .${sessionShareButtonClass}:hover,
      .${sessionShareButtonClass}:focus-visible {
        background: var(--color-token-list-hover-background, var(--codex-plus-bg-hover));
        color: var(--color-token-text-primary, var(--codex-plus-text));
        outline: none;
      }
      .${sessionShareButtonClass}[aria-busy="true"] {
        cursor: wait;
        opacity: .65;
      }
      [data-codex-delete-row="true"]:hover .${actionGroupClass} {
        opacity: 1;
        pointer-events: auto;
      }
      [data-codex-delete-row="true"]:hover ${selectors.threadTitle},
      [data-codex-delete-row="true"]:focus-within ${selectors.threadTitle},
      [data-codex-delete-row="true"].codex-session-more-open ${selectors.threadTitle} {
        flex: 0 1 auto;
        width: var(--codex-session-title-max-width, auto);
        max-width: var(--codex-session-title-max-width, 100%);
        overflow: hidden;
      }
      [data-codex-delete-row="true"].codex-session-more-open .${actionGroupClass} {
        opacity: 1;
        pointer-events: auto;
        z-index: 2147483201;
      }
      [data-codex-delete-row="true"].codex-archive-confirm-visible .${actionGroupClass} {
        right: max(66px, var(--codex-session-actions-right, 28px));
      }
      .${actionTooltipClass} {
        position: fixed;
        z-index: 2147483201;
        max-width: min(220px, calc(100vw - 32px));
        border: 1px solid var(--codex-plus-border);
        border-radius: var(--border-radius-md, 6px);
        background: var(--codex-plus-bg-elevated);
        color: var(--codex-plus-text);
        font: inherit;
        font-size: 13px;
        line-height: 16px;
        padding: 6px 8px;
        box-shadow: var(--tooltip-box-shadow, var(--shadow-200, 0 4px 12px rgba(0,0,0,.14)));
        pointer-events: none;
        white-space: nowrap;
      }
      .codex-archive-delete-all {
        border: 1px solid var(--color-border-danger, #dc2626);
        border-radius: var(--border-radius-sm, 6px);
        background: var(--color-background-danger-soft, rgba(220,38,38,.1));
        color: var(--color-text-danger, #dc2626);
        font: inherit;
        font-size: 13px;
        line-height: 16px;
        padding: 3px 8px;
        cursor: pointer;
      }
      .codex-archive-action-bar {
        position: fixed;
        right: 28px;
        top: 86px;
        z-index: 2147482999;
        box-shadow: 0 8px 24px rgba(0,0,0,.18);
      }
      .codex-delete-toast {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 2147483000;
        padding: 10px 12px;
        border: 1px solid var(--codex-plus-border);
        border-radius: var(--border-radius-lg, 8px);
        background: var(--codex-plus-bg-elevated);
        color: var(--codex-plus-text);
        font: inherit;
        font-size: 13px;
        box-shadow: var(--ui-menu-shadow, var(--shadow-300, 0 8px 24px rgba(0,0,0,.16)));
        pointer-events: none;
      }
      .codex-delete-toast button { margin-left: 10px; pointer-events: auto; }
      /* 拓展与内置提示共用的类型配色。不传 type 时保持上面的默认外观。 */
      .codex-delete-toast[data-toast-type="success"] { border-color: var(--codex-plus-success, #2f9e63); }
      .codex-delete-toast[data-toast-type="warn"] { border-color: var(--codex-plus-warn, #b7791f); }
      .codex-delete-toast[data-toast-type="error"] { border-color: var(--codex-plus-error, #c53030); }
      .codex-delete-confirm-overlay {
        position: fixed;
        inset: 0;
        z-index: 2147483200;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--modal-backdrop-dim-shadow, rgba(0,0,0,.32));
        backdrop-filter: blur(1px);
      }
      .codex-delete-confirm-content {
        width: min(420px, calc(100vw - 48px));
        border: 1px solid var(--codex-plus-border);
        border-radius: var(--border-radius-xl, 12px);
        background: var(--codex-plus-bg-elevated);
        color: var(--codex-plus-text);
        font: inherit;
        font-size: 14px;
        box-shadow: var(--shadow-400, 0 16px 48px rgba(0,0,0,.2));
        padding: 20px;
      }
      .codex-delete-confirm-title { font-size: 16px; font-weight: 650; }
      .codex-delete-confirm-message { margin-top: 8px; color: var(--codex-plus-text-secondary); line-height: 1.45; }
      .codex-delete-confirm-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 18px;
      }
      .codex-delete-confirm-actions button {
        min-height: 32px;
        border: 1px solid var(--codex-plus-border);
        border-radius: var(--border-radius-lg, 8px);
        padding: 5px 12px;
        background: var(--codex-plus-bg-secondary);
        color: var(--codex-plus-text);
        font: inherit;
        font-size: 13px;
        cursor: pointer;
      }
      .codex-delete-confirm-actions button:hover,
      .codex-delete-confirm-actions button:focus-visible {
        background: var(--codex-plus-bg-hover);
        outline: none;
      }
      .codex-delete-confirm-actions [data-codex-delete-confirm="true"] {
        border-color: var(--color-border-danger, #dc2626);
        background: var(--color-background-danger-solid, #dc2626);
        color: var(--color-text-danger-solid, #fff);
      }
      .codex-plus-modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        /*
         * overlay 自身带 zoom（见 applyCodexPlusZoom），而它的 inset: 0 与 100vw
         * 都按未缩放的视口算，再乘 zoom 就溢出（实测 zoom=1.2 时 100vw 得到 2072px，
         * 视口只有 1727px）。用 calc(100vw / var(--codex-plus-zoom)) 抵消；zoom 缺失
         * 时分母回落到 1，行为与改造前一致。
         * 内部子元素用百分比即可——它们在缩放空间里，百分比本来就对。
         * 注意：本段在 JS 模板字符串里，注释中不能出现反引号，否则会提前闭合。
         */
        width: calc(100vw / var(--codex-plus-zoom, 1));
        height: calc(100vh / var(--codex-plus-zoom, 1));
        z-index: 2147483646;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--modal-backdrop-dim-shadow, rgba(0,0,0,.32));
        backdrop-filter: blur(1px);
        pointer-events: auto;
        -webkit-app-region: no-drag;
      }
      .codex-plus-modal-content {
        width: min(520px, calc(100% - 48px));
        max-height: min(680px, calc(100% - 40px));
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border: 1px solid var(--codex-plus-border);
        border-radius: var(--border-radius-xl, 12px);
        background: var(--codex-plus-bg-primary);
        color: var(--codex-plus-text);
        font: inherit;
        font-size: 14px;
        box-shadow: var(--shadow-400, 0 16px 48px rgba(0,0,0,.2));
        pointer-events: auto;
        -webkit-app-region: no-drag;
      }
      .codex-plus-modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px 8px;
        flex: 0 0 auto;
        -webkit-app-region: no-drag;
      }
      .codex-plus-modal-title { display: flex; align-items: center; gap: 8px; font-size: 18px; font-weight: 600; }
      .codex-plus-backend-indicator { width: 8px; height: 8px; border-radius: 999px; background: var(--codex-plus-text-tertiary); display: inline-block; }
      .codex-plus-backend-indicator[data-status="ok"] { background: var(--codex-plus-success); }
      .codex-plus-backend-indicator[data-status="failed"] { background: var(--codex-plus-danger); }
      .codex-plus-backend-indicator[data-status="checking"] { background: var(--codex-plus-warning); }
      .codex-plus-backend-indicator[data-status="degraded"] { background: var(--codex-plus-warning); }
      #${codexPlusSidebarNavId} {
        position: relative;
        flex: 0 0 auto;
      }
      #${codexPlusSidebarNavId} .codex-plus-sidebar-nav-icon {
        width: 20px;
        height: 20px;
        flex: 0 0 20px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      #${codexPlusSidebarNavId} .codex-plus-sidebar-nav-icon svg {
        width: 19px;
        height: 19px;
        display: block;
      }
      #${codexPlusSidebarNavId} .codex-plus-sidebar-nav-status {
        width: 7px;
        height: 7px;
        margin-left: auto;
        border-radius: 999px;
        background: #a1a1aa;
        opacity: .9;
      }
      #${codexPlusSidebarNavId} .codex-plus-sidebar-nav-status[data-status="ok"] {
        background: #34d399;
        box-shadow: 0 0 7px rgba(52,211,153,.7);
      }
      #${codexPlusSidebarNavId} .codex-plus-sidebar-nav-status[data-status="failed"] { background: #ef4444; }
      #${codexPlusSidebarNavId} .codex-plus-sidebar-nav-status[data-status="checking"] { background: #fbbf24; }
      #${codexPlusSidebarNavId} button[data-active="true"] {
        background: var(--codex-plus-bg-selected);
        color: var(--codex-plus-text);
      }
      .codex-plus-plugin-sidebar { position: relative; flex: 0 0 auto; }
      .codex-plus-plugin-sidebar .codex-plus-sidebar-nav-icon { width: 20px; height: 20px; flex: 0 0 20px; display: inline-flex; align-items: center; justify-content: center; }
      .codex-plus-plugin-sidebar .codex-plus-sidebar-nav-icon svg { width: 19px; height: 19px; }
      .codex-plus-plugin-sidebar-label { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; min-width: 0; }
      .codex-plus-plugin-sidebar button[data-active="true"] { background: var(--codex-plus-bg-selected); color: var(--codex-plus-text); }
      .codex-plus-plugin-market-panel { max-width: 1140px; width: 100%; margin: 0 auto; box-sizing: border-box; }
      .codex-plus-plugin-intro { margin: 0 0 18px; color: var(--codex-plus-text-secondary); font-size: 13px; line-height: 1.6; }
      .codex-plus-plugin-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 14px; }
      .codex-plus-plugin-sources { display: flex; gap: 4px; flex: 1 1 auto; }
      .codex-plus-plugin-sources button { border: 1px solid var(--codex-plus-border); border-radius: 7px; padding: 7px 12px; color: var(--codex-plus-text-secondary); background: transparent; cursor: pointer; }
      .codex-plus-plugin-sources button[data-active="true"] { background: var(--codex-plus-bg-selected); color: var(--codex-plus-text); }
      .codex-plus-plugin-search { flex: 1 1 240px; min-width: 120px; border: 1px solid var(--codex-plus-border); border-radius: 8px; background: var(--codex-plus-bg-secondary); color: var(--codex-plus-text); padding: 9px 12px; font-size: 14px; }
      .codex-plus-plugin-filter { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--codex-plus-text-secondary); }
      .codex-plus-plugin-status { font-size: 12px; color: var(--codex-plus-text-secondary); white-space: pre-wrap; margin-bottom: 14px; }
      .codex-plus-plugin-results { display: flex; flex-direction: column; gap: 10px; }
      .codex-plus-plugin-card { display: flex; align-items: flex-start; gap: 18px; padding: 16px; border: 1px solid var(--codex-plus-border); border-radius: 10px; background: var(--codex-plus-bg-secondary); }
      .codex-plus-plugin-card-info { flex: 1 1 auto; min-width: 0; }
      .codex-plus-plugin-name { font-size: 15px; font-weight: 600; overflow-wrap: anywhere; }
      .codex-plus-plugin-id, .codex-plus-plugin-meta { color: var(--codex-plus-text-tertiary); font-size: 11px; margin-top: 4px; overflow-wrap: anywhere; }
      .codex-plus-plugin-description { color: var(--codex-plus-text-secondary); font-size: 13px; line-height: 1.55; margin: 7px 0; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
      .codex-plus-plugin-tags { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px; }
      .codex-plus-plugin-tags span { border-radius: 5px; padding: 2px 6px; background: var(--codex-plus-bg-selected); color: var(--codex-plus-text-secondary); font-size: 10px; overflow-wrap: anywhere; }
      .codex-plus-plugin-install { flex: 0 0 auto; white-space: nowrap; }
      .codex-plus-plugin-market-page button:disabled { opacity: .55; cursor: default; }
      .codex-plus-plugin-job-message { font-size: 12px; color: var(--codex-plus-text-secondary); margin-top: 8px; white-space: pre-wrap; overflow-wrap: anywhere; }
      .codex-plus-plugin-job-message[data-status="failed"] { color: var(--codex-plus-danger); }
      .codex-plus-plugin-pagination { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 10px; margin-top: 20px; font-size: 12px; color: var(--codex-plus-text-secondary); }
      .codex-plus-plugin-pagination > span { margin-right: auto; }
      .codex-plus-plugin-empty { padding: 40px 16px; text-align: center; color: var(--codex-plus-text-secondary); }
      @media (max-width: 600px) { .codex-plus-plugin-card { flex-direction: column; gap: 10px; } .codex-plus-plugin-install { align-self: flex-end; } }
      /*
       * 新版导航图标栏里的 Codex++ / 拓展 / 推荐内容入口：原生按钮只放图标，
       * 这里对齐它的尺寸。
       *
       * 用 [data-codex-plus-rail] 而不是逐个列 id——早先按 id 写，加第三个入口时
       * 漏掉了对应的选择器，那个图标容器就没有 20px 约束、撑成整个按钮宽，
       * 表现为图标偏左不居中。
       */
      [data-codex-plus-rail] {
        position: relative;
        flex: 0 0 auto;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      [data-codex-plus-rail] > button {
        position: relative;
      }
      [data-codex-plus-rail] .codex-plus-rail-icon {
        width: 20px;
        height: 20px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      [data-codex-plus-rail] .codex-plus-rail-icon svg {
        width: 19px;
        height: 19px;
        display: block;
      }
      /* 图标栏是纯图标，状态点挂在按钮右上角，不占布局。 */
      #${codexPlusRailNavId} .codex-plus-sidebar-nav-status {
        position: absolute;
        top: 2px;
        right: 2px;
        margin-left: 0;
        width: 6px;
        height: 6px;
      }
      /*
       * 我们的页面是叠加在 Codex 之上的，Codex 并不知道，所以它自己那个
       * destination 的选中态会一直留着，看起来像 rail 上同时亮两个。
       * 页面打开时给根节点打标记，用 CSS 把原生选中项压成未选中；
       * 关掉页面即移除标记，原生状态自动恢复——比改它的按钮属性稳，
       * 不会和 React 的重渲染打架。
       * 颜色取自当前主题下真实未选中项（见 syncCodexPlusRailNativeSelection），
       * 主题切换时下次同步会重算。
       */
      html[data-codex-plus-page-open] nav[data-app-navigation-rail] [data-sidebar-destination][aria-current="page"] {
        color: var(--codex-plus-rail-dim, var(--codex-plus-text-tertiary, currentColor)) !important;
      }
      html[data-codex-plus-page-open] nav[data-app-navigation-rail] [data-sidebar-destination][aria-current="page"]::before {
        opacity: 0 !important;
      }
      html[data-codex-plus-page-open] nav[data-app-navigation-rail] [data-sidebar-destination][aria-current="page"] * {
        color: var(--codex-plus-rail-dim, var(--codex-plus-text-tertiary, currentColor)) !important;
      }
      /*
       * 页面 overlay 的 left 由 positionCodexPlusPage 按图标栏右边界算好写进来。
       *
       * 关键：写进来的必须是**布局坐标**（视觉值 / zoom），因为 overlay 自己在缩放
       * 空间里布局，宽度也要用同一个空间的量。width 的 calc(100vw / zoom - left - right)
       * 把右边贴到原生内容区的右边缘；三个量都除过 zoom，缩放后才正好补齐。
       * 注意：本段在 JS 模板字符串里，注释里不能出现反引号，否则会提前闭合。
       *
       * 右/下各留一圈槽（原生是 4px）并给四角加圆角，对齐官方面板的观感：
       * 官方页面面板 [_PageSurface_] 的 rect 与我们这块 overlay 完全相同（都是
       * [52, 44, 1663, 940]），四角 12px；它外面套了一个 padding: 0 4px 4px 0 的槽，
       * 右、下能看到底色。我们原先 right/bottom 贴 0 且无圆角，于是方角并且比官方
       * 多占 4px，用户反馈「少一个圆角」就是这个。
       * 圆角值由 positionCodexPlusPage 量官方面板写入，四个角一起用，不做左右区分。
       * overflow: hidden 让圆角真正裁到内容；内容都在 .codex-plus-modal-content 内，
       * 没有依赖溢出显示的全屏浮层，切掉是安全的。
       */
      .${codexPlusPageClass} {
        position: fixed;
        top: var(--codex-plus-page-top, 0px);
        right: var(--codex-plus-page-right, 0px);
        bottom: var(--codex-plus-page-bottom, 0px);
        left: var(--codex-plus-page-left, 0px);
        width: calc(100vw / var(--codex-plus-zoom, 1) - var(--codex-plus-page-left, 0px) - var(--codex-plus-page-right, 0px));
        height: calc(100vh / var(--codex-plus-zoom, 1) - var(--codex-plus-page-top, 0px) - var(--codex-plus-page-bottom, 0px));
        border-radius: var(--codex-plus-page-radius, 0px);
        overflow: hidden;
        /*
         * 功能页是覆盖在 Codex 内容区上的基础层，不能压过原生侧栏/顶部栏
         * 的 tooltip 和 menu；原生弹出层在页面打开时由下方规则提升。
         */
        z-index: 2147482000;
        display: block;
        background: var(--codex-plus-bg-primary, #fff);
        pointer-events: auto;
        -webkit-app-region: no-drag;
      }
      /* 提升定位包装层，避免只改 tooltip/menu 子节点仍被父级堆叠上下文困住。 */
      html[data-codex-plus-page-open] [data-radix-popper-content-wrapper]:not(.${codexPlusPageClass} *),
      html[data-codex-plus-page-open] [role="tooltip"]:not(.${codexPlusPageClass} *),
      html[data-codex-plus-page-open] [role="menu"]:not(.${codexPlusPageClass} *),
      html[data-codex-plus-page-open] [class*="ApplicationMenuTopBar"],
      html[data-codex-plus-page-open] .app-header-tint {
        z-index: 2147483645 !important;
      }
      .${codexPlusPageClass} .codex-plus-modal-content {
        width: auto;
        height: 100%;
        max-height: none;
        border: 0;
        border-radius: 0;
        background: var(--codex-plus-bg-primary, #fff);
        box-shadow: none;
      }
      .${codexPlusPageClass} .codex-plus-modal-header {
        width: 100%;
        margin: 0;
        padding: 16px 24px 10px;
      }
      .${codexPlusPageClass} .codex-plus-modal-body {
        width: 100%;
        margin: 0;
        padding: 4px 32px 32px;
      }
      /* 两栏：左侧自己的面板（导航 / 列表），右侧内容区。观感对齐 Codex 原生页面。 */
      .${codexPlusPageClass} .codex-plus-page-layout {
        display: flex;
        flex: 1 1 auto;
        min-height: 0;
        width: 100%;
      }
      .${codexPlusPageClass} .codex-plus-page-main {
        flex: 1 1 auto;
        min-width: 0;
        display: flex;
        flex-direction: column;
        min-height: 0;
      }
      /* 拓展条目：三行结构（名称 / 简介 / 作者+操作），对齐 VSCode 扩展列表的 .extension-list-item */
      /* 市场清单给的图标：正方形等比缩放，圆角与 VSCode 的扩展图标一致 */
      /* 名称：VSCode 用 semiBold，且 hover 才加下划线 */
      /* 底部行：作者在左、操作在右，VSCode 的 .footer 是 24px 高 */
      /* 行内按钮：默认低调，hover 整行时才提亮，避免列表花掉 */
      /* 启用状态点挪到名称右侧，用 VSCode 那种 14px 徽标尺寸 */
      /* 拓展页：搜索框 + 分组标题 + 市场条目的「安装」按钮 */
      .codex-plus-page-search { padding: 0 10px 8px; }
      .codex-plus-page-search-input {
        width: 100%;
        box-sizing: border-box;
        padding: 6px 9px;
        border: 1px solid var(--codex-plus-border);
        border-radius: 8px;
        background: var(--codex-plus-bg-secondary);
        color: var(--codex-plus-text);
        font: inherit;
        font-size: 13px;
        outline: none;
      }
      .codex-plus-page-search-input:focus { border-color: var(--codex-plus-border-subtle); background: var(--codex-plus-bg-elevated); }
      .codex-plus-page-search-input::placeholder { color: var(--codex-plus-text-tertiary); }
      /* 左面板条目图标：市场里没有图标字段，统一用 VSCode 的默认扩展字形 */
      /* 右上角详情：形态对齐 VSCode 的扩展详情页 */
      /* issue #2359：原 #fbbf24 在浅色主题下对比度仅 1.56:1，改为随主题走的警告色。 */
      .codex-plus-modal-close {
        border: 0;
        background: transparent;
        color: #d1d5db;
        font-size: 20px;
        cursor: pointer;
        pointer-events: auto;
        -webkit-app-region: no-drag;
      }
      .codex-plus-modal-body {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
        overscroll-behavior: contain;
        scrollbar-gutter: stable;
        padding: 4px 20px 16px;
        scrollbar-width: thin;
        scrollbar-color: rgba(255,255,255,.28) transparent;
      }
      .codex-plus-modal-body::-webkit-scrollbar { width: 10px; }
      .codex-plus-modal-body::-webkit-scrollbar-track { background: transparent; }
      .codex-plus-modal-body::-webkit-scrollbar-thumb {
        border: 2px solid transparent;
        border-radius: 999px;
        background: rgba(255,255,255,.28);
        background-clip: padding-box;
      }
      .codex-plus-modal-body::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,.38); background-clip: padding-box; }
      .codex-plus-row {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 0;
        border-top: 1px solid rgba(255,255,255,.1);
      }
      .codex-plus-row:first-child { border-top: 0; }
      .codex-plus-row-title { font-weight: 550; line-height: 1.35; }
      .codex-plus-row-description { margin-top: 2px; color: #a1a1aa; font-size: 13px; line-height: 1.4; }
      .codex-plus-model-compat-warning { margin-top: 6px; color: #fbbf24; font-size: 13px; line-height: 1.45; }
      .codex-plus-toggle {
        width: 42px;
        height: 24px;
        border: 0;
        border-radius: 999px;
        background: #52525b;
        padding: 2px;
      }
      .codex-plus-toggle span {
        display: block;
        width: 20px;
        height: 20px;
        border-radius: 999px;
        background: white;
        transition: transform .12s ease;
      }
      .codex-plus-toggle,
      .codex-plus-action-button,
      .codex-plus-issue-button,
      .codex-plus-backend-status {
        flex-shrink: 0;
        align-self: center;
      }
      .codex-plus-toggle[data-enabled="true"] { background: #10a37f; }
      .codex-plus-toggle[data-enabled="true"] span { transform: translateX(18px); }
      .codex-plus-toggle[data-pending="true"],
      .codex-plus-toggle:disabled { cursor: not-allowed; opacity: .55; }
      .codex-plus-width-control { display: flex; align-items: center; justify-content: flex-end; gap: 8px; min-width: 176px; align-self: center; }
      .codex-plus-width-input {
        width: 78px;
        height: 26px;
        box-sizing: border-box;
        border: 1px solid rgba(255,255,255,.18);
        border-radius: 7px;
        background: rgba(255,255,255,.08);
        color: #f3f4f6;
        font-size: 13px;
        font-family: inherit;
        padding: 0 8px;
      }
      .codex-plus-width-input:disabled { opacity: .55; cursor: not-allowed; }
      .codex-plus-typing-effect-select {
        flex-shrink: 0;
        align-self: center;
        min-width: 112px;
        height: 32px;
        padding: 0 8px;
        font-size: 13px;
      }
      .codex-plus-typing-effect-select:disabled { opacity: .55; cursor: not-allowed; }
      .codex-plus-about { color: #a1a1aa; line-height: 1.5; }
      .codex-plus-panel[hidden] { display: none; }
      .codex-plus-action-button,
      .codex-plus-issue-button { border: 1px solid rgba(255,255,255,.18); border-radius: 7px; background: #3f3f46; color: #f3f4f6; font-size: 13px;
        font-family: inherit; padding: 6px 8px; }
      .codex-plus-form-field {
        display: grid;
        gap: 4px;
        margin-top: 10px;
        /* issue #2359：原来是写死的 #d4d4d8，浅色主题下对比度只有 1.38:1（≈看不见）。
           标签文字改跟主题走。 */
        color: var(--codex-plus-text-secondary);
        font-size: 13px;
        font-family: inherit;
        text-align: left;
      }
      .codex-plus-form-field input {
        width: min(520px, 72vw);
        border: 1px solid rgba(255,255,255,.18);
        border-radius: 8px;
        background: #18181b;
        color: #f4f4f5;
        padding: 8px 10px;
        font: 13px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      }
      .codex-plus-form-message {
        min-height: 18px;
        margin-top: 10px;
        color: #a1a1aa;
        font-size: 13px;
        font-family: inherit;
        text-align: left;
      }
      .codex-plus-form-message[data-status="ok"] { color: #34d399; }
      .codex-plus-form-message[data-status="failed"] { color: #f87171; }
      .codex-plus-form-message[data-status="loading"] { color: #fbbf24; }
      .codex-plus-backend-status { display: grid; gap: 4px; min-width: 132px; justify-items: end; }
      .codex-plus-backend-label { color: #a1a1aa; font-size: 13px; }
      .codex-plus-backend-label[data-status="ok"] { color: #34d399; }
      .codex-plus-backend-label[data-status="failed"] { color: #f87171; }
      .codex-plus-backend-label[data-status="degraded"] { color: #fbbf24; }
      /*
       * 推荐内容：网格卡片。
       *
       * 一张卡 = 图标 + 名称/简介 + 右上箭头 + 底部优惠条。用 auto-fill + minmax
       * 让列数随宽度自适应（宽屏 4 列、窄屏递减），卡片等高对齐。
       */
      /* 清单没给图时用名称首字占位，比空一块整齐。 */
      /* 简介不再压成一行：卡片按内容撑高，最多 3 行，超出才省略。
         nowrap 会让「提供 Claude 与 ...」这类较长简介只露前几个字。 */
      /* 底部优惠条：撑满卡片宽度，长文本截断。 */
      /*
       * 注入面板的语义色板：前景/背景必须取自同一套 token，且都要能被主题切换带走。
       *
       * issue #2359（Windows 浅色主题下黑底黑字）：旧写法在中间塞了一整层
       * --token-* 回退名（--token-bg-primary / --token-text-primary /
       * --token-border / --token-list-hover-background / --token-text-default /
       * --token-bg-fog / --token-text-tertiary …）。实测 Codex 客户端（26.9xx）
       * 的产物里这些名字**一个都不存在**——真正在用的一套是 --color-token-*。
       * 于是三级回退链的中间那级永远落空，浅色主题下只靠最后一级写死的深色值
       * 兜底，前景与背景各自独立兜底时明度撞在一起，就成了黑底黑字。
       * 这里把死名删掉，直接接到确实存在、且**由 Codex 自己按主题重算**的
       * --color-token-* 上；末级兜底仅作最后保险，不再承担主题判断。
       */
      :root {
        --codex-plus-bg-primary: var(--color-token-bg-primary, var(--color-token-main-surface-primary, #fff));
        --codex-plus-bg-secondary: var(--color-token-bg-secondary, var(--codex-plus-bg-primary));
        --codex-plus-bg-elevated: var(--color-token-dropdown-background, var(--color-token-bg-secondary, var(--codex-plus-bg-primary)));
        --codex-plus-bg-hover: var(--color-token-interactive-bg-secondary-hover, var(--color-token-list-hover-background, rgba(0,0,0,.06)));
        --codex-plus-bg-selected: var(--color-token-interactive-bg-secondary-selected, var(--codex-plus-bg-hover));
        --codex-plus-text: var(--color-token-text-primary, var(--color-token-foreground, #171717));
        --codex-plus-text-secondary: var(--color-token-text-secondary, var(--codex-plus-text));
        --codex-plus-text-tertiary: var(--color-token-text-tertiary, var(--codex-plus-text-secondary));
        --codex-plus-border: var(--color-token-border-light, var(--color-token-border, var(--color-token-border-default, rgba(0,0,0,.12))));
        --codex-plus-border-subtle: var(--codex-plus-border);
        --codex-plus-focus: var(--color-token-focus-border, var(--color-border-focus, currentColor));
        --codex-plus-danger: var(--color-text-danger, #dc2626);
        --codex-plus-danger-bg: var(--color-background-danger-soft, rgba(220,38,38,.1));
        --codex-plus-success: var(--color-text-success, #15803d);
        --codex-plus-warning: var(--color-text-warning, #a16207);
      }
      :where(.${moreMenuClass}, .${actionTooltipClass}, .codex-delete-toast, .codex-delete-confirm-overlay, .codex-plus-modal-overlay, .${codexPlusPageClass}) {
        color: var(--codex-plus-text);
        font-family: inherit;
      }
      .${moreMenuClass} {
        border-color: var(--codex-plus-border);
        border-radius: var(--border-radius-lg, 8px);
        background: var(--codex-plus-bg-elevated);
        color: var(--codex-plus-text);
        box-shadow: var(--ui-menu-shadow, var(--shadow-300, 0 8px 24px rgba(0,0,0,.16)));
      }
      .codex-session-more-menu-item { border-radius: var(--border-radius-sm, 6px); font-family: inherit; }
      .codex-session-more-menu-item:hover,
      .codex-session-more-menu-item:focus-visible { background: var(--codex-plus-bg-hover); }
      .${actionButtonClass} {
        width: var(--h-token-button-composer-sm, 28px);
        height: var(--h-token-button-composer-sm, 28px);
        border-radius: var(--border-radius-lg, 8px);
        color: var(--codex-session-action-color, var(--codex-plus-text-tertiary));
        font-family: inherit;
      }
      .${actionButtonClass}:hover,
      .${actionButtonClass}:focus-visible {
        background: var(--codex-session-action-hover-background, var(--codex-plus-bg-hover));
        color: var(--codex-session-action-hover-color, var(--codex-plus-text));
      }
      .${sessionShareButtonClass}:hover,
      .${sessionShareButtonClass}:focus-visible {
        background: var(--codex-plus-bg-hover);
        color: var(--codex-plus-text);
      }
      .${actionTooltipClass} {
        border-color: var(--codex-plus-border);
        border-radius: var(--border-radius-md, 6px);
        background: var(--codex-plus-bg-elevated);
        color: var(--codex-plus-text);
        font-family: inherit;
        font-size: 13px;
        line-height: 16px;
        padding: 6px 8px;
        box-shadow: var(--tooltip-box-shadow, var(--shadow-200, 0 4px 12px rgba(0,0,0,.14)));
      }
      .codex-delete-confirm-overlay,
      .codex-plus-modal-overlay { background: var(--color-background-surface-under, rgba(0,0,0,.32)); backdrop-filter: blur(1px); }
      .codex-delete-confirm-content,
      .codex-plus-modal-content {
        border-color: var(--codex-plus-border);
        border-radius: var(--border-radius-xl, 12px);
        background: var(--codex-plus-bg-primary);
        color: var(--codex-plus-text);
        font-family: inherit;
        box-shadow: var(--shadow-400, 0 16px 48px rgba(0,0,0,.2));
      }
      .codex-delete-confirm-message,
      .codex-plus-row-description,
      .codex-plus-about,
      .codex-plus-backend-label,
      .codex-plus-form-message { color: var(--codex-plus-text-secondary); }
      .codex-delete-confirm-actions button,
      .codex-plus-action-button,
      .codex-plus-issue-button {
        min-height: 32px;
        border: 1px solid var(--codex-plus-border);
        border-radius: var(--border-radius-lg, 8px);
        background: var(--codex-plus-bg-secondary);
        color: var(--codex-plus-text);
        font: inherit;
        font-size: 13px;
        line-height: 18px;
        padding: 5px 10px;
      }
      .codex-delete-confirm-actions button:hover,
      .codex-delete-confirm-actions button:focus-visible,
      .codex-plus-action-button:hover,
      .codex-plus-action-button:focus-visible,
      .codex-plus-issue-button:hover,
      .codex-plus-issue-button:focus-visible,
      .codex-delete-confirm-actions [data-codex-delete-confirm="true"] {
        border-color: var(--color-border-danger, #dc2626);
        background: var(--color-background-danger-solid, #dc2626);
        color: var(--color-text-danger-solid, #fff);
      }
      .codex-plus-modal-close { border-color: var(--codex-plus-border); color: var(--codex-plus-text-secondary); border-radius: var(--border-radius-lg, 8px); }
      .codex-plus-modal-close:hover,
      .codex-plus-modal-close:focus-visible { background: var(--codex-plus-bg-hover); color: var(--codex-plus-text); outline: none; }
      .${codexPlusPageClass},
      .${codexPlusPageClass} .codex-plus-modal-content {
        background: var(--codex-plus-bg-primary) !important;
        color: var(--codex-plus-text) !important;
      }
      .${codexPlusPageClass} .codex-plus-modal-content { border-color: transparent; }
      .codex-plus-modal-body { scrollbar-color: var(--codex-plus-text-tertiary) transparent; }
      .codex-plus-modal-body::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--codex-plus-text-tertiary) 45%, transparent); background-clip: padding-box; }
      .codex-plus-modal-body::-webkit-scrollbar-thumb:hover { background: var(--codex-plus-text-tertiary); background-clip: padding-box; }
      .codex-plus-row { border-top-color: var(--codex-plus-border-subtle); }
      .codex-plus-toggle { background: var(--color-background-secondary-solid, var(--codex-plus-text-tertiary)); }
      .codex-plus-toggle span { background: var(--color-token-bg-primary, #fff); box-shadow: var(--switch-thumb-shadow, 0 1px 2px rgba(0,0,0,.16)); }
      .codex-plus-toggle[data-enabled="true"] { background: var(--color-background-primary-solid, var(--color-background-success-solid, #10a37f)); }
      .codex-plus-width-input,
      .codex-plus-typing-effect-select,
      .codex-plus-form-field input {
        border: 1px solid var(--codex-plus-border);
        border-radius: var(--border-radius-lg, 8px);
        background: var(--codex-plus-bg-secondary);
        color: var(--codex-plus-text);
        font-family: inherit;
      }
      .codex-plus-width-input:focus,
      .codex-plus-typing-effect-select:focus,
      .codex-plus-form-field input:focus { border-color: var(--codex-plus-focus); outline: 2px solid color-mix(in srgb, var(--codex-plus-focus) 25%, transparent); outline-offset: 0; }
      #${codexPlusSidebarNavId} .codex-plus-sidebar-nav-status,
      .codex-plus-backend-indicator { box-shadow: none; }
      #${codexPlusSidebarNavId} .codex-plus-sidebar-nav-status[data-status="ok"],
      .codex-plus-backend-indicator[data-status="ok"] { background: var(--codex-plus-success); }
      #${codexPlusSidebarNavId} .codex-plus-sidebar-nav-status[data-status="failed"],
      .codex-plus-backend-indicator[data-status="failed"] { background: var(--codex-plus-danger); }
      #${codexPlusSidebarNavId} .codex-plus-sidebar-nav-status[data-status="checking"],
      .codex-plus-backend-indicator[data-status="checking"] { background: var(--codex-plus-warning); }
      #${codexPlusSidebarNavId} .codex-plus-sidebar-nav-status[data-status="degraded"],
      .codex-plus-backend-indicator[data-status="degraded"] { background: var(--codex-plus-warning); }
      /*
       * 优惠条：暗底配橙色文字。
       *
       * 底色不能用 --codex-plus-danger-bg —— 它在当前主题下解析成浅粉（偏浅色主题
       * 的值），压在深色卡片上非常刺眼。改成用警告色按低透明度混出来，深浅主题
       * 都成立，也和原生「需要注意」的语义色同源。
       */
      .codex-plus-form-message[data-status="ok"], .codex-plus-backend-label[data-status="ok"] { color: var(--codex-plus-success); }
      .codex-plus-form-message[data-status="failed"], .codex-plus-backend-label[data-status="failed"] { color: var(--codex-plus-danger); }
      .codex-plus-backend-label[data-status="degraded"] { color: var(--codex-plus-warning); }
      .codex-plus-form-message[data-status="loading"], .codex-plus-model-compat-warning { color: var(--codex-plus-warning); }
      /* Codex++ 设置主页：对齐原生设置页，保持其它页面与弹窗的布局独立。 */
      .${codexPlusPageClass} .codex-plus-modal-content[data-codex-plus-active-tab="home"] {
        background: var(--codex-plus-settings-page-bg, var(--codex-plus-bg-primary)) !important;
      }
      .${codexPlusPageClass} .codex-plus-modal-content[data-codex-plus-active-tab="home"] .codex-plus-modal-body {
        box-sizing: border-box;
        padding: 72px 32px 64px;
      }
      .codex-plus-settings {
        width: 100%;
        max-width: 740px;
        min-width: 0;
        margin: 0 auto;
        container: codex-plus-settings / inline-size;
      }
      .codex-plus-settings > .codex-plus-modal-header {
        width: 100%;
        box-sizing: border-box;
        padding: 0;
        margin: 0 0 48px;
        gap: 16px;
      }
      .codex-plus-settings .codex-plus-modal-title {
        min-width: 0;
        font-size: 28px;
        font-weight: 600;
        line-height: 36px;
        letter-spacing: -.02em;
        overflow-wrap: anywhere;
      }
      .codex-plus-settings-section { margin: 0 0 48px; }
      .codex-plus-settings-section:last-child { margin-bottom: 0; }
      .codex-plus-settings-section-title {
        margin: 0 0 16px;
        color: var(--codex-plus-text);
        font-size: 14px;
        font-weight: 550;
        line-height: 20px;
      }
      .codex-plus-settings-card,
      .codex-plus-settings > [data-codex-plus-ext-menu] {
        box-sizing: border-box;
        min-width: 0;
        padding: 0 16px;
        border: 1px solid var(--codex-plus-border);
        border-radius: 16px;
        background: var(--codex-plus-settings-card-bg, var(--codex-plus-bg-secondary));
      }
      .codex-plus-settings > [data-codex-plus-ext-menu] { margin-top: 48px; }
      .codex-plus-settings .codex-plus-row {
        box-sizing: border-box;
        min-height: 60px;
        align-items: center;
        gap: 24px;
        padding: 10px 0;
        font-size: 14px;
        line-height: 20px;
      }
      .codex-plus-settings .codex-plus-row[hidden] { display: none; }
      .codex-plus-settings .codex-plus-row > :first-child {
        flex: 1 1 auto;
        min-width: 0;
        overflow-wrap: anywhere;
      }
      .codex-plus-settings .codex-plus-row > :not(:first-child) { max-width: 48%; }
      .codex-plus-settings .codex-plus-row-title { font-weight: 500; line-height: 20px; }
      .codex-plus-settings .codex-plus-row-description,
      .codex-plus-settings .codex-plus-about {
        margin-top: 2px;
        color: var(--codex-plus-text-secondary);
        font-size: 13px;
        line-height: 18px;
        overflow-wrap: anywhere;
      }
      .codex-plus-settings .codex-plus-toggle {
        flex: 0 0 32px;
        width: 32px;
        height: 20px;
        min-height: 20px;
        box-sizing: border-box;
        padding: 2px;
        background: var(--codex-plus-switch-off, #3a3a3a);
        cursor: pointer;
      }
      .codex-plus-settings .codex-plus-toggle span {
        width: 16px;
        height: 16px;
        background: var(--codex-plus-switch-thumb, #fff);
      }
      .codex-plus-settings .codex-plus-toggle[data-enabled="true"] { background: var(--codex-plus-switch-on, #3485ff); }
      .codex-plus-settings .codex-plus-toggle[data-enabled="true"] span { transform: translateX(12px); }
      .codex-plus-settings .codex-plus-toggle[data-pending="true"],
      .codex-plus-settings .codex-plus-toggle:disabled { cursor: not-allowed; opacity: .55; }
      .codex-plus-settings .codex-plus-width-control {
        flex: 0 1 auto;
        min-width: 0;
        flex-wrap: wrap;
        gap: 8px;
      }
      .codex-plus-settings .codex-plus-backend-status { overflow-wrap: anywhere; text-align: right; }
      .codex-plus-settings .codex-plus-action-button,
      .codex-plus-settings .codex-plus-issue-button,
      .codex-plus-settings .codex-plus-width-input,
      .codex-plus-settings .codex-plus-typing-effect-select {
        box-sizing: border-box;
        min-height: 32px;
        border: 1px solid var(--codex-plus-border);
        border-radius: 8px;
        background: var(--codex-plus-bg-secondary);
        color: var(--codex-plus-text);
        font-family: inherit;
        font-size: 13px;
        line-height: 18px;
      }
      .codex-plus-settings .codex-plus-width-input,
      .codex-plus-settings .codex-plus-typing-effect-select { height: 32px; }
      .codex-plus-settings .codex-plus-width-input { width: 72px; min-width: 48px; }
      .codex-plus-settings .codex-plus-typing-effect-select { min-width: 0; }
      .codex-plus-settings .codex-plus-typing-effect-select[hidden] { display: none; }
      .codex-plus-settings .codex-plus-dropdown-trigger {
        display: inline-flex;
        flex: 0 0 auto;
        align-items: center;
        align-self: center;
        justify-content: space-between;
        gap: 8px;
        height: 28px;
        min-width: 112px;
        box-sizing: border-box;
        border: 1px solid var(--codex-plus-border);
        border-radius: 8px;
        padding: 3px 10px;
        background: var(--codex-plus-bg-secondary);
        color: var(--codex-plus-text);
        font: inherit;
        font-size: 13px;
        line-height: 20px;
        cursor: pointer;
      }
      .codex-plus-settings .codex-plus-dropdown-trigger > svg {
        flex: 0 0 16px;
        width: 16px;
        height: 16px;
        color: var(--codex-plus-text-secondary);
      }
      .codex-plus-settings .codex-plus-dropdown-trigger:hover:not(:disabled),
      .codex-plus-settings .codex-plus-dropdown-trigger[aria-expanded="true"] { background: var(--codex-plus-bg-hover); }
      .codex-plus-settings .codex-plus-dropdown-trigger:disabled { cursor: not-allowed; opacity: .55; }
      /* 菜单挂在 overlay 上，避免设置卡片或滚动容器裁切。 */
      .codex-plus-dropdown-menu {
        position: absolute;
        z-index: 2;
        overflow-y: auto;
        overscroll-behavior: contain;
        width: 220px;
        max-width: calc(100% - 16px);
        box-sizing: border-box;
        padding: 6px;
        border: 1px solid var(--codex-plus-border);
        border-radius: 14px;
        background: var(--codex-plus-bg-elevated);
        color: var(--codex-plus-text);
        font-family: inherit;
        box-shadow: var(--ui-menu-shadow, var(--shadow-300, 0 8px 24px rgba(0,0,0,.16)));
      }
      .codex-plus-dropdown-menu[hidden] { display: none; }
      .codex-plus-dropdown-option {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        width: 100%;
        min-height: 28px;
        box-sizing: border-box;
        border: 0;
        border-radius: 8px;
        padding: 4px 12px;
        background: transparent;
        color: inherit;
        font: inherit;
        font-size: 14px;
        line-height: 20px;
        text-align: left;
        cursor: pointer;
      }
      .codex-plus-dropdown-option > svg {
        flex: 0 0 16px;
        width: 16px;
        height: 16px;
        visibility: hidden;
      }
      .codex-plus-dropdown-option[aria-selected="true"] > svg { visibility: visible; }
      .codex-plus-dropdown-option:hover,
      .codex-plus-dropdown-option:focus-visible {
        background: var(--codex-plus-bg-hover);
        outline: none;
      }
      .codex-plus-settings .codex-plus-action-button,
      .codex-plus-settings .codex-plus-issue-button { white-space: normal; overflow-wrap: anywhere; }
      .codex-plus-settings .codex-plus-action-button:hover,
      .codex-plus-settings .codex-plus-action-button:focus-visible,
      .codex-plus-settings .codex-plus-issue-button:hover,
      .codex-plus-settings .codex-plus-issue-button:focus-visible {
        border-color: var(--codex-plus-border);
        background: var(--codex-plus-bg-hover);
        color: var(--codex-plus-text);
      }
      .codex-plus-settings button:focus-visible,
      .codex-plus-settings input:focus-visible,
      .codex-plus-settings select:focus-visible {
        outline: 2px solid var(--codex-plus-switch-on, #3485ff);
        outline-offset: 3px;
      }
      .${codexPlusPageClass} .codex-plus-modal-content[data-codex-plus-active-tab="home"] { container: codex-plus-settings-page / inline-size; }
      @container codex-plus-settings-page (max-width: 800px) {
        .${codexPlusPageClass} .codex-plus-modal-content[data-codex-plus-active-tab="home"] .codex-plus-modal-body { padding: 48px 24px; }
      }
      @container codex-plus-settings-page (max-width: 480px) {
        .${codexPlusPageClass} .codex-plus-modal-content[data-codex-plus-active-tab="home"] .codex-plus-modal-body { padding: 32px 16px; }
      }
      @container codex-plus-settings (max-width: 560px) {
        .codex-plus-settings .codex-plus-row { gap: 16px; }
      }
      /* 拓展与推荐内容使用原生插件页面的导航、标题和轻量列表布局。 */
    `;
    document.documentElement.appendChild(style);
  }

  function defaultCodexPlusSettings() {
    // capacityAutoRetry* 必须写成字面量：多个测试（typing-effects-settings、whale-widget、
    // session-share-runtime…）把 defaultCodexPlusSettings 切片到不带 prelude 的沙箱里执行，
    // 引用 prelude 常量会直接 ReferenceError。与 00-prelude.js 里
    // capacityAutoRetryDefaultMaxAttempts / capacityAutoRetryDefaultIntervalSeconds 的一致性
    // 由 capacity-auto-retry.test.ts 的防漂移用例守住。
    return { pluginMarketplaceUnlock: true, modelWhitelistUnlock: true, sessionDelete: true, markdownExport: true, sessionShare: true, pasteFix: false, typingEffect: "off", threadIdBadge: false, conversationView: false, whaleWidget: false, conversationViewMaxWidth: conversationViewDefaultWidth, threadScrollRestore: true, nativeMenuPlacement: true, nativeFastUnlock: false, petRealMouseLook: false, activityOverlayRight: false, stepwise: false, answerOutline: false, usageStatusLine: true, capacityAutoRetry: false, capacityAutoRetryMaxAttempts: 15, capacityAutoRetryIntervalSeconds: 0, };
  }

  const codexPlusBackendSettingMap = {
    pluginMarketplaceUnlock: "codexAppPluginMarketplaceUnlock",
    modelWhitelistUnlock: "codexAppModelWhitelistUnlock",
    sessionDelete: "codexAppSessionDelete",
    markdownExport: "codexAppMarkdownExport",
    sessionShare: "codexAppSessionShare",
    threadIdBadge: "codexAppThreadIdBadge",
    conversationView: "codexAppConversationView",
    whaleWidget: "codexAppWhaleWidgetEnabled",
    threadScrollRestore: "codexAppThreadScrollRestore",
    nativeMenuPlacement: "codexAppNativeMenuPlacement",
    nativeFastUnlock: "codexAppNativeFastUnlock",
    petRealMouseLook: "codexAppPetRealMouseLook",
    activityOverlayRight: "codexAppActivityOverlayRight",
    stepwise: "codexAppStepwiseEnabled",
    answerOutline: "codexAppAnswerOutlineEnabled",
    usageStatusLine: "codexAppUsageStatusLine",
    capacityAutoRetry: "codexAppCapacityAutoRetry",
    pasteFix: "codexAppPasteFix",
    typingEffect: "codexAppTypingEffect",
  };
  const codexPlusBackendMappedSettings = new Set(Object.keys(codexPlusBackendSettingMap));

  function backendCodexPlusSettings() {
    const settings = {};
    Object.entries(codexPlusBackendSettingMap).forEach(([localKey, backendKey]) => {
      const value = codexPlusBackendSettings[backendKey];
      if (typeof value === "boolean" || typeof value === "string" || (value && typeof value === "object" && !Array.isArray(value))) {
        settings[localKey] = value;
      }
    });
    return settings;
  }

  function codexPlusSettings() {
    if (window.__CODEX_PLUS_MARKETPLACE_ONLY__ === true || codexPlusBackendSettings.enhancementsEnabled === false) {
      return {
        pluginMarketplaceUnlock: codexPlusBackendSettings.enhancementsEnabled !== false
          && codexPlusBackendSettings.codexAppPluginMarketplaceUnlock !== false,
        modelWhitelistUnlock: false,
        sessionDelete: false,
        markdownExport: false,
        sessionShare: false,
        pasteFix: false,
        typingEffect: "off",
        threadIdBadge: false,
        conversationView: false,
        whaleWidget: false,
        conversationViewMaxWidth: conversationViewDefaultWidth,
        threadScrollRestore: false,
        nativeMenuPlacement: false,
        nativeFastUnlock: false,
        petRealMouseLook: false,
        activityOverlayRight: false,
        stepwise: false,
        answerOutline: false,
        usageStatusLine: false,
        capacityAutoRetry: false,
        capacityAutoRetryMaxAttempts: 15,
        capacityAutoRetryIntervalSeconds: 0,
      };
    }
    try {
      const settings = { ...defaultCodexPlusSettings(), ...JSON.parse(localStorage.getItem(codexPlusSettingsKey) || "{}"), ...backendCodexPlusSettings() };
      delete settings.customLayout;
      delete settings.serviceTierControls;
      return settings;
    } catch {
      const settings = { ...defaultCodexPlusSettings(), ...backendCodexPlusSettings() };
      return settings;
    }
  }

  function setCodexPlusSetting(key, value) {
    if (window.__CODEX_PLUS_MARKETPLACE_ONLY__ === true && key !== "pluginMarketplaceUnlock") return;
    const backendKey = codexPlusBackendSettingMap[key];
    if (backendKey) {
      if (key === "stepwise") syncStepwisePanel(value);
      if (key === "answerOutline") syncStepwisePanel(undefined, value);
      void setBackendSetting(backendKey, value).then(() => {
        if (key === "stepwise" || key === "answerOutline") {
          Promise.resolve(window.__codexStepwisePanel?.loadSettings?.()).then(() => syncStepwisePanel());
        }
        // 容量错误自动重试：开关落库后立即启停轮询，不必等下一次心跳。
        if (key === "capacityAutoRetry") syncCodexPlusCapacityAutoRetry();
      }).catch(() => {
        void loadBackendSettings();
      });
      return;
    }
    let stored = {};
    try {
      stored = JSON.parse(localStorage.getItem(codexPlusSettingsKey) || "{}");
    } catch {
      stored = {};
    }
    const next = { ...stored, [key]: value };
    localStorage.setItem(codexPlusSettingsKey, JSON.stringify(next));
    if (key === "threadScrollRestore" && !value) {
      clearTimeout(window.__codexThreadScrollSaveTimer);
      window.__codexThreadScrollSaveTimer = null;
      window.__codexThreadScrollRestoreRevision = (window.__codexThreadScrollRestoreRevision || 0) + 1;
      window.__codexThreadScrollSyncRevision = (window.__codexThreadScrollSyncRevision || 0) + 1;
      (window.__codexThreadScrollRestoreTimers || []).forEach((timer) => clearTimeout(timer));
      window.__codexThreadScrollRestoreTimers = [];
      (window.__codexThreadScrollSyncTimers || []).forEach((timer) => clearTimeout(timer));
      window.__codexThreadScrollSyncTimers = [];
      window.__codexThreadScrollRuntime = null;
    }
    if (key === "stepwise") syncStepwisePanel(value);
    renderCodexPlusMenu();
    scan();
  }

  function syncStepwisePanel(
    enabled = codexPlusSettings().stepwise,
    answerOutlineEnabled = codexPlusSettings().answerOutline
  ) {
    try {
      window.__codexStepwisePanel?.syncSettings?.({
        enabled: !!enabled,
        answerOutlineEnabled: !!answerOutlineEnabled,
      });
    } catch (error) {
      sendCodexPlusDiagnostic("stepwise_sync_failed", {
        errorName: error?.name || "",
        errorMessage: error?.message || String(error),
      });
    }
  }

  function normalizeConversationViewWidth(value) {
    if (value === null || value === undefined || String(value).trim() === "") return null;
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    return Math.max(conversationViewMinWidth, Math.min(conversationViewMaxAllowedWidth, Math.round(number)));
  }

  function conversationViewWidth() {
    const settingsWidth = normalizeConversationViewWidth(codexPlusSettings().conversationViewMaxWidth);
    if (settingsWidth) return settingsWidth;
    const legacyWidth = normalizeConversationViewWidth(localStorage.getItem(conversationViewLegacyWidthKey));
    return legacyWidth || conversationViewDefaultWidth;
  }

  function refreshConversationViewControls() {
    const enabled = !!codexPlusSettings().conversationView;
    const width = conversationViewWidth();
    document.querySelectorAll("[data-codex-plus-conversation-view-width]").forEach((input) => {
      input.value = String(width);
      input.disabled = !enabled;
    });
  }

  function setConversationViewWidth(value) {
    const width = normalizeConversationViewWidth(value);
    if (!width) return;
    setCodexPlusSetting("conversationViewMaxWidth", width);
  }
