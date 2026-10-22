export type EnhancementSection = "stepwise" | "dictation";
export type EnhancementTab = "general" | EnhancementSection;

export type ManagerNavigationIntent = {
  page: "settings" | "enhance" | "pluginMarket";
  section?: EnhancementSection;
};

export const ENHANCEMENT_SECTION_IDS: Record<EnhancementSection, string> = {
  stepwise: "enhance-stepwise",
  dictation: "enhance-dictation",
};

export function managerNavigationDestination(intent: ManagerNavigationIntent): {
  route: "enhance" | "overview";
  section: EnhancementSection | null;
} {
  // 旧版悬浮球发出的 settings + section 也定位到新的增强配置页。
  // 兼容旧版客户端留下的市场跳转，退役页面统一回到概览。
  if (intent.page === "pluginMarket") return { route: "overview", section: null };
  const section = intent.section ?? null;
  return { route: "enhance", section };
}
