export type EnhancementSection = "stepwise" | "dictation";

export type ManagerNavigationIntent = {
  page: "settings" | "enhance" | "pluginMarket";
  section?: EnhancementSection;
};

export function managerNavigationDestination(intent: ManagerNavigationIntent): {
  route: "enhance" | "overview";
} {
  // 保留旧客户端的导航意图格式，已撤下的配置区不再触发标签选择或滚动。
  return { route: intent.page === "pluginMarket" ? "overview" : "enhance" };
}
