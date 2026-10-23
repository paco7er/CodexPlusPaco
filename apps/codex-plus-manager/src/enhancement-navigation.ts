export type EnhancementSection = "stepwise" | "dictation";

export type ManagerNavigationIntent = {
  page: "settings" | "enhance" | "pluginMarket";
  section?: EnhancementSection;
};

export function managerNavigationDestination(_intent: ManagerNavigationIntent): {
  route: "overview";
} {
  // 保留旧客户端的导航意图格式，插件市场开关已合并到概览。
  return { route: "overview" };
}
