import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import {
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  Bell,
  Cable,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Copy,
  Download,
  Edit3,
  GripVertical,
  GitBranch,
  Info,
  Hammer,
  KeyRound,
  Layers3,
  LayoutDashboard,
  MessageCircle,
  FileCode2,
  FolderOpen,
  Network,
  Plus,
  RefreshCw,
  Rocket,
  Save,
  Search,
  ShieldCheck,
  ShieldAlert,
  Stethoscope,
  TestTube,
  Trash2,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { createPresetPatch } from "@/components/ProviderPresetSelector";
import { PRESETS, type ProviderPreset } from "./presets";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { Badge as UiBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";


import { McpPage, PageHeader } from "./ManagementPages";
import { SkillsPage } from "./ManagementExtra";
import { ProjectSessionPage } from "./ProjectSessionPage";
import { managerNavigationDestination, type ManagerNavigationIntent } from "./enhancement-navigation";
import { DEFAULT_AUTO_COMPACT_PERCENT, autoCompactOptions, normalizeAutoCompactPercent } from "./auto-compact";
import { defaultWhaleBalanceSettings, normalizeWhaleBalanceSettings, type WhaleBalanceSettings } from "./whale-settings";
import {
  defaultDictationSettings,
  normalizeDictationSettings,
  type DictationSettings,
} from "./dictation-settings";
import {
  builtinEntryToImportDocument,
  builtinRowBackfillValue,
  clearModelMetadataForSlug,
  importDocumentSyncPatch,
  importPanelControls,
  importSaveDecision,
  metadataMatchesBuiltin,
  metadataSourceTags,
  modelSlugFromRowName,
  suffixWindowString,
  normalizeTokenCountInput,
  modelMetadataKey,
  modelFastSupportMode,
  synchronizeModelMetadataLiteSupport,
  synchronizeModelMetadataFastSupport,
  type ModelFastSupportMode,
  parseModelMetadataDocument,
  parseModelMetadataMap,
  remapModelMetadataSlugs,
  replaceModelMetadataForSlug,
  resolveModelMetadataRowKey,
  retainModelMetadataForSlugs,
  serializeModelMetadataDocument,
  synchronizeModelMetadataDocumentLimitsPreview,
  type ActiveImportDraft,
  createActiveImportDraft,
  updateActiveImportDraft,
  cancelActiveImportDraft,
  rematchActiveImportDraft,
  builtinMetadataQueryState,
  type BuiltinMetadataQueryState,
  type BuiltinModelMetadataMatch,
  type ImportedModelMetadata,
} from "./model-metadata";
import {
  independentProxyEnabled,
  setIndependentProxyConfigured,
  requestCompatibilityEnabled,
  findRelayModelRouteIssue,
  modelRouteSaveRequiresRestart,
  normalizeRelayModelRoutes,
  PROTOCOL_PROXY_BASE_URL,
  type RelayModelRoute,
} from "./model-routes";
import {
  mergeModelWindowRows,
  modelWindowRowsFromProfile,
  modelWindowRowsValidationError,
  serializeModelWindowRows,
  reorderModelWindowRows,
  type ModelWindowRowsValidationIssue,
  type ModelWindowRow,
} from "./model-windows";
import {
  reasoningParameterMode,
  setModelReasoningParameterMode,
  type ReasoningParameterMode,
  formatReasoningLevelsLabel,
  normalizeReasoningLevels,
  REASONING_LEVELS,
  resolveModelReasoningLevels,
  setModelReasoningLevelsForSlug,
} from "./model-reasoning";
import { clampAggregateRoutePriority, normalizeAggregateRoutes, validateAggregateRoutes } from "./aggregate-routes";
import {
  aggregateMemberCandidates,
  normalizeAggregateMembers,
  isAggregateProfile,
  isOfficialLoginMemberProfile,
  normalizeAggregateDefaultRelayId,
} from "./aggregate-members";
import { relayAuthForLiveDraft, shouldBackfillRelayProfileBeforeSwitch } from "./relay-live-files";
import { createRelayApiKey, normalizeRelayApiKeys, relayProfileWithNormalizedApiKeys, relayProfileWithUpdatedApiKey, type RelayApiKey } from "./provider-api-keys";
import { relayHeadersValidationMessage, serializeRelayHeaders } from "./relay-headers";
import { sessionProviderForProtocol } from "./relay-session";
import { usePopoverLayer } from "./use-popover-layer";
import {
  providerSyncStreamPercent,
  resolveProviderSyncCompletion,
  type ProviderSyncStreamProgress,
} from "./provider-sync-flow";
import { isProviderSyncTargetSelectable, preferredProviderSyncTarget } from "./provider-sync-target";
import { resolveLaunchStatus, launchCompletionNotice } from "./launch-status";
import { t, tf } from "@/i18n";
import { vlmTestTranslation } from "./vlm-test-translation";

type Status = "ok" | "failed" | "not_implemented" | "not_checked" | string;

function modelWindowRowsValidationMessage(issue: ModelWindowRowsValidationIssue | null): string | null {
  if (!issue) return null;
  if (issue.code === "duplicateModel") return tf("模型名称重复：{0}", [issue.model]);
  if (issue.code === "invalidWindow") {
    return tf("模型 {0} 的上下文窗口无效；请输入正整数，或使用 K/M 整数后缀。", [issue.model]);
  }
  return tf("模型 {0} 的自动压缩百分比无效；请输入 0 到 100 之间、最多 6 位小数的十进制数。", [issue.model]);
}

type CommandResult<T> = T & {
  status: Status;
  message: string;
};

type PathState = {
  status: string;
  path: string | null;
};

type LaunchStatus = {
  status: string;
  message: string;
  started_at_ms: number;
  debug_port: number | null;
  helper_port: number | null;
  codex_app: string | null;
  aumid: string | null;
};

type RuntimeServiceState = { status: string; address: string | null; message: string };

type OverviewResult = CommandResult<{
  codex_app: PathState;
  codex_version: string | null;
  silent_shortcut: PathState;
  management_shortcut: PathState;
  latest_launch: LaunchStatus | null;
  runtime_health: { codex_app: RuntimeServiceState; local_server: RuntimeServiceState; debugger: RuntimeServiceState; protocol_conversion_enabled: boolean | null };
  current_version: string;
  settings_path: string;
  logs_path: string;
}>;

type LaunchCommandResult = CommandResult<{
  launchStartedAtMs?: number;
  nativeBrowserRestoreFailed?: boolean;
}>;

type BackendSettings = WhaleBalanceSettings & {
  revision?: string;
  codexAppPath: string;
  /** 自动接管官方 App（与 Rust `codex_app_auto_takeover` 对应）。 */
  codexAppAutoTakeover: boolean;
  codexAppAutoTakeoverWhenActive: string;

  dictation: DictationSettings;
  providerSyncEnabled: boolean;
  ccsDbPath: string;
  providerSyncSavedProviders: string[];
  providerSyncManualProviders: string[];
  providerSyncLastSelectedProvider: string;
  relayProfilesEnabled: boolean;
  localConfigProviderImported: boolean;
  enhancementsEnabled: boolean;
  codexAppStandaloneQuotaUnlock: boolean;
  codexAppPluginMarketplaceUnlock: boolean;
  codexAppModelWhitelistUnlock: boolean;
  codexAppSessionDelete: boolean;
  codexAppMarkdownExport: boolean;
  codexAppUsageStatusLine: boolean;
  codexAppPasteFix: boolean;
  codexAppForceChineseLocale: boolean;
  codexAppTypingEffect: TypingEffect;
  codexAppThreadIdBadge: boolean;
  codexAppConversationView: boolean;
  codexAppThreadScrollRestore: boolean;
  codexAppNativeMenuPlacement: boolean;
  codexAppNativeBrowserRequireIdentification: boolean;
  codexAppNativeFastUnlock: boolean;
  codexAppPetRealMouseLook: boolean;
  codexAppActivityOverlayRight: boolean;
  /** 协议代理内部自动重试（与 Rust `protocol_proxy_auto_retry` 对应）。 */
  protocolProxyAutoRetry: boolean;
  protocolProxyAutoRetryMaxAttempts: number;
  protocolProxyAutoRetryIntervalSeconds: number;
  protocolProxyAutoRetryMode: "streaming" | "streaming-legacy" | "buffered";
  /** 流式避震下首段可见输出后到提交的延迟（毫秒）；0 表示一出现可见输出立即提交。与 Rust `protocol_proxy_auto_retry_commit_delay_ms` 对应。 */
  protocolProxyAutoRetryCommitDelayMs: number;
  codexAppCapacityAutoRetry: boolean;
  codexAppStepwiseEnabled: boolean;
  codexAppAnswerOutlineEnabled: boolean;
  codexAppStepwiseDirectSend: boolean;
  codexAppStepwiseProtocol: StepwiseProtocol;
  codexAppStepwiseGenerationMode: StepwiseGenerationMode;
  codexAppStepwiseBaseUrl: string;
  codexAppStepwiseApiKey: string;
  codexAppStepwiseApiKeyEnv: string;
  codexAppStepwiseModel: string;
  codexAppStepwiseMaxItems: number;
  codexAppStepwiseMaxInputChars: number;
  codexAppStepwiseMaxOutputTokens: number;
  codexAppStepwiseTimeoutMs: number;
  codexGoalsEnabled: boolean;
  relayBaseUrl: string;
  relayApiKey: string;
  relayProfiles: RelayProfile[];
  aggregateRelayProfiles: AggregateRelayProfile[];
  activeAggregateRelayId: string;
  relayCommonConfigContents: string;
  relayPreserveNonproviderSettings: boolean;
  relayContextConfigContents: string;
  activeRelayId: string;

  /** 按工具分区的配置镜像，保留历史工具的配置。 */
  tools?: Record<string, ToolShard>;
  /** 侧栏当前聚焦的工具。只影响管理器的展示，不影响 Codex 的启动配置。 */
  activeTool?: string;
};

/** settings.json 里单个工具的配置分片。Codex 分片由后端从扁平字段镜像生成。 */
type ToolShard = {
  relayProfiles?: RelayProfile[];
  activeRelayId?: string;
  aggregateRelayProfiles?: AggregateRelayProfile[];
  activeAggregateRelayId?: string;
  relayCommonConfigContents?: string;
  relayContextConfigContents?: string;

};

type TypingEffect = "off" | "rainbow" | "fireworks" | "stars";

export type RelayProfile = {
  id: string;
  name: string;
  model: string;
  baseUrl: string;
  upstreamBaseUrl: string;
  apiKey: string;
  apiKeys?: RelayApiKey[];
  activeApiKeyId?: string;
  protocol: RelayProtocol;
  relayMode: RelayMode;
  sessionProvider?: RelaySessionProvider;
  officialMixApiKey: boolean;
  hideOfficialUsageAlert: boolean;
  testModel: string;
  configContents: string;
  authContents: string;
  useCommonConfig: boolean;
  contextSelection: RelayContextSelection;
  contextSelectionInitialized: boolean;
  contextWindow: string;
  autoCompactLimit: string;
  modelList: string;
  modelWindows: string;
  modelAutoCompact: string;
  modelMetadata: string;
  modelVlm: string;
  vlmApiKey: string;
  vlmModel: string;
  vlmBaseUrl: string;
  userAgent: string;
  customHeaders: { key: string; value: string }[];
  sub2apiEnabled: boolean;
  sub2apiMultiplier: string;
  noAuth: boolean;
  modelRoutes?: RelayModelRoute[];
  standardOpenaiProtocol: boolean;
  webSearchHistoryCompat: boolean;
  trustUpstreamCatalogLite?: boolean;
  strictResponsesReasoning?: boolean;
  /** Anthropic 上游的认证字段：`x-api-key`（默认）或 `authorization`。 */
  anthropicAuthHeader?: string;
  /** Anthropic 的 `max_tokens` 兜底值，0/缺省表示用内置 8192；填了则优先于请求值。 */
  anthropicMaxTokens?: number;
  /** 注入 Anthropic 提示缓存断点，默认开启。 */
  anthropicPromptCache?: boolean;
  /** 伪装 Claude Code 客户端（仅网关限制「只能通过 Claude Code 使用」时需要）。 */
  anthropicImpersonateClaudeCode?: boolean;
  /** 思考模式：空/auto、adaptive（等级透传）、budget（经典预算）、off。 */
  anthropicThinkingMode?: string;
  aggregate?: RelayAggregateConfig | null;
};

type RelayAggregateStrategy = "failover" | "conversationRoundRobin" | "requestRoundRobin" | "weightedRoundRobin";
type AggregateMode = "provider" | "model";
type RelayAggregateMember = {
  profileId: string;
  weight: number;
};
type RelayAggregateRoute = {
  pattern: string;
  profileId: string;
  priority: number;
};
type RelayAggregateConfig = {
  strategy: RelayAggregateStrategy;
  members: RelayAggregateMember[];
  routes?: RelayAggregateRoute[];
  modelAggregationEnabled?: boolean;
  /** 默认供应商：解析不到成员的普通模型请求交给该成员转发；空串表示未设置。 */
  defaultRelayId?: string;
  /** 把默认成员的官方登录同步进 Codex（写 auth.json 的 tokens 段）。默认关。 */
  syncDefaultMemberLogin?: boolean;
};
type AggregateRelayMember = {
  relayId: string;
  weight: number;
};
type AggregateRelayProfile = {
  id: string;
  name: string;
  sessionProvider?: RelaySessionProvider;
  modelAggregationEnabled?: boolean;
  strategy: RelayAggregateStrategy;
  members: AggregateRelayMember[];
  routes?: { pattern: string; relayId: string; priority: number }[];
  defaultRelayId?: string;
  /** 把默认成员的官方登录同步进 Codex（auth.json 的 tokens 段）。默认关。 */
  syncDefaultMemberLogin?: boolean;
};

type RelayContextSelection = {
  mcpServers: string[];
  skills: string[];
  plugins: string[];
};

type ContextKind = "mcp" | "skill" | "plugin";

type CodexContextEntry = {
  id: string;
  kind: ContextKind;
  title: string;
  summary: string;
  tomlBody: string;
  enabled: boolean;
};

type CodexContextEntries = {
  mcpServers: CodexContextEntry[];
  skills: CodexContextEntry[];
  plugins: CodexContextEntry[];
};

type RelayProtocol = "responses" | "chatCompletions" | "anthropicMessages";
type StepwiseProtocol = "auto" | "chat_completions" | "responses" | "anthropic_messages";
type StepwiseGenerationMode = "auto" | "manual";
type RelayMode = "official" | "mixedApi" | "pureApi" | "aggregate";
type RelaySessionProvider = "custom" | "openai";
type RelayEditorMode = "official" | "mixedApi" | "pureApi";
const CHAT_UPSTREAM_BASE_URL_KEY = "codex_plus_chat_base_url";

const emptyContextSelection = (): RelayContextSelection => ({
  mcpServers: [],
  skills: [],
  plugins: [],
});

type SettingsResult = CommandResult<{
  revision: string;
  settings: BackendSettings;
  settings_path: string;
}>;

type RelayResult = CommandResult<{
  authenticated: boolean;
  authSource: string;
  accountLabel: string | null;
  configPath: string;
  configured: boolean;
  requiresOpenaiAuth: boolean;
  hasBearerToken: boolean;
  backupPath: string | null;
}>;

type RelayPayload = Omit<RelayResult, "status" | "message">;

type RelayFilesResult = CommandResult<{
  configPath: string;
  authPath: string;
  configContents: string;
  authContents: string;
}>;

type LocalSession = {
  id: string;
  title: string;
  cwd: string;
  modelProvider: string;
  archived: boolean;
  updatedAtMs: number | null;
  rolloutPath: string;
  dbPath: string;
};

type LocalSessionsResult = CommandResult<{
  dbPath: string;
  dbPaths: string[];
  sessions: LocalSession[];
  offset: number;
  limit: number;
  hasMore: boolean;
  totalCount: number;
}>;

type DeleteLocalSessionResult = CommandResult<{
  status: string;
  session_id: string;
  message: string;
  undo_token: string | null;
  backup_path: string | null;
}>;

type ContextEntriesResult = CommandResult<{
  settings: BackendSettings;
  entries: CodexContextEntries;
}>;

type McpImportPreviewResult = CommandResult<{
  entries: Array<{ id: string; tomlBody: string }>;
  warnings: string[];
}>;

type LiveContextEntriesResult = CommandResult<{
  entries: CodexContextEntries;
}>;

type ExtractRelayCommonConfigResult = CommandResult<{
  commonConfigContents: string;
  profileConfigContents: string;
}>;

type RelaySwitchResult = CommandResult<{
  settings: BackendSettings;
  settingsPath: string;
  relay: RelayPayload;
}>;

type SettingsBackfillResult = CommandResult<{
  settings: BackendSettings;
}>;

type RelayProfileTestResult = CommandResult<{
  httpStatus: number;
  endpoint: string;
  responsePreview: string;
  protocolValid: boolean;
  completionStatus: "completed" | "incomplete" | "failed";
}>;

type RelayProfileModelsResult = CommandResult<{
  models: string[];
  endpoint: string;
}>;

type ProviderDoctorCheck = {
  id: string;
  title: string;
  status: Status;
  detail: string;
};

type ProviderDoctorResult = CommandResult<{
  profileName: string;
  model: string;
  summary: string;
  recommendation: string;
  checks: ProviderDoctorCheck[];
}>;

type CcsProviderImport = {
  sourceId: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  protocol: RelayProtocol;
  configContents: string;
  authContents: string;
};

type CcsProvidersResult = CommandResult<{
  dbPath: string;
  configuredDbPath: string;
  fallbackReason?: string | null;
  providers: CcsProviderImport[];
}>;

type SkillInventoryResult = CommandResult<{
  skills: Array<{ id: string; name: string; description: string; enabled: boolean; bundled: boolean }>;
  codexSkillsDir: string;
}>;

type ProviderImportRequest = {
  name: string;
  baseUrl: string;
  apiKey: string;
  wireApi: string;
  relayMode: string;
  configContents: string;
  authContents: string;
};

type PendingProviderImportResult = CommandResult<{
  pending: ProviderImportRequest | null;
}>;

type EnvConflict = {
  name: string;
  source: "process" | "user" | string;
  valuePresent: boolean;
};

type EnvConflictsResult = CommandResult<{
  conflicts: EnvConflict[];
}>;

type RemoveEnvConflictsResult = CommandResult<{
  removed: Array<{
    name: string;
    removedProcess: boolean;
    removedUser: boolean;
  }>;
  backupPath: string | null;
  remaining: EnvConflict[];
}>;

type ProviderSyncPayload = {
  syncStatus?: string;
  syncMessage?: string;
  recoveryJournalPath?: string | null;
  recoveryAvailable?: boolean;
  recoveryErrors?: string[];
  databaseOutcomes?: Array<{ database: string; attemptedRows: number; restoredRows: number; remainingRows: number }>;
  targetProvider?: string;
  changedSessionFiles?: number;
  skippedLockedRolloutFiles?: string[];
  sqliteRowsUpdated?: number;
  sqliteProviderRowsUpdated?: number;
  sqliteUserEventRowsUpdated?: number;
  sqliteCwdRowsUpdated?: number;
  sqliteCatalogRowsInserted?: number;
  sqliteCatalogRowsRemoved?: number;
  updatedWorkspaceRoots?: number;
  prunedSessionIndexEntries?: number;
  encryptedContentWarning?: string | null;
  repairAudit?: {
    catalogOnlySessions: number;
    catalogOnlyWithCurrentRollout: number;
    catalogOnlyWithBackupDatabase: number;
    catalogOnlyWithoutRecoverySource: number;
  };
  backupDir?: string | null;
};

type SessionIndexCleanupCandidate = {
  id: string;
  threadName: string;
  updatedAt: string;
};

type SessionIndexCleanupPreviewPayload = {
  snapshotSha256: string;
  candidates: SessionIndexCleanupCandidate[];
};

type SessionIndexCleanupApplyPayload = {
  prunedEntries?: number;
  backupDir?: string | null;
};

type ProviderSyncTargetSource = "config" | "rollout" | "sqlite" | "manual";

type ProviderSyncTargetOption = {
  id: string;
  sources: ProviderSyncTargetSource[];
  isCurrentProvider: boolean;
  isManual: boolean;
  isSaved: boolean;
  isResolvable: boolean;
  unavailableReason: string | null;
};

type ProviderSyncTargetsPayload = {
  currentProvider: string;
  targets: ProviderSyncTargetOption[];
};

type ProviderSyncTargetsResult = CommandResult<ProviderSyncTargetsPayload>;

type ProviderSyncProgress = {
  active: boolean;
  percent: number;
  message: string;
  result: CommandResult<ProviderSyncPayload> | null;
};

type TaskProgress = {
  active: boolean;
  percent: number;
  message: string;
  indeterminate?: boolean;
  failed?: boolean;
};

type SessionIndexRepairReport = {
  scannedFiles: number;
  cachedFiles: number;
  repairedItems: number;
  alreadyPresent: number;
  skippedItems: number;
  deferredItems?: number;
  issues: string[];
  issuesTruncated?: number;
  abortedReason?: string | null;
  warnings?: string[];
  backupPath: string | null;
  elapsedMs: number;
  checkedAtMs?: number;
  pendingDetails?: {
    threadId: string | null;
    turnId: string | null;
    reason: string;
    state: "waiting" | "blocked";
    firstSeenAtMs: number;
    lastCheckedAtMs: number;
    checks: number;
  }[];
};

function providerSyncProgressMessage(result: CommandResult<ProviderSyncPayload>): string {
  const changed = result.changedSessionFiles ?? 0;
  const rows = result.sqliteRowsUpdated ?? 0;
  const insertedCatalogRows = result.sqliteCatalogRowsInserted ?? 0;
  const removedCatalogRows = result.sqliteCatalogRowsRemoved ?? 0;
  const pruned = result.prunedSessionIndexEntries ?? 0;
  const target = result.targetProvider || t("当前 provider");
  const skipped = result.skippedLockedRolloutFiles?.length ?? 0;
  const prunedText = pruned ? tf("，清理 {0} 条失效任务索引", [pruned]) : "";
  const skippedText = skipped ? tf("，跳过 {0} 个占用文件", [skipped]) : "";
  const catalogText = insertedCatalogRows ? tf("，补齐 {0} 条侧边栏索引", [insertedCatalogRows]) : "";
  const catalogCleanupText = removedCatalogRows
    ? tf("，清理 {0} 条误列的子任务侧边栏索引", [removedCatalogRows])
    : "";
  return tf("已同步到 {0}：修复 {1} 个会话文件，更新 {2} 行数据库索引{3}{4}{5}{6}。", [
    target,
    changed,
    rows,
    catalogText,
    catalogCleanupText,
    prunedText,
    skippedText,
  ]);
}

const providerSyncSourceLabels: Record<ProviderSyncTargetSource, string> = {
  get config() { return t("配置"); },
  get rollout() { return t("会话"); },
  get sqlite() { return t("索引"); },
  get manual() { return t("手动"); },
};

function providerSyncTargetLabel(target: ProviderSyncTargetOption): string {
  const labels = target.sources.map((source) => providerSyncSourceLabels[source]).filter(Boolean);
  const current = target.isCurrentProvider ? [t("当前")] : [];
  const unavailable = isProviderSyncTargetSelectable(target) ? [] : [t("供应商切换不可用")];
  return [...labels, ...current, ...unavailable].join(" / ") || t("发现");
}

type Route = "overview" | "relay" | "sessions" | "context" | "skills" | "enhance";

const MANAGER_NAVIGATION_EVENT = "manager-navigation-requested";

// 保留 Codex 工作区导航；tool 标签兼容已有工作区归属约定。
const routes: Array<{ id: Route; label: string; icon: LucideIcon; badge?: string; tool?: string }> = [
  // 概览展示 Codex 应用路径与运行状态。
  { id: "overview", get label() { return t("概览"); }, icon: LayoutDashboard },
  { id: "relay", get label() { return t("供应商配置"); }, icon: KeyRound, tool: "codex" },
  { id: "sessions", get label() { return t("会话管理"); }, icon: MessageCircle, tool: "codex" },
  { id: "context", label: "MCP", icon: Network, tool: "codex" },
  { id: "skills", label: "Skills", icon: BookOpen, tool: "codex" },
  { id: "enhance", get label() { return t("Codex增强"); }, icon: Hammer, tool: "codex" },
];

const navigationSections: Array<{ label: string; routes: Route[] }> = [
  {
    get label() { return t("工作区"); },
    routes: ["overview", "relay"],
  },
  {
    get label() { return t("全局管理"); },
    routes: ["context", "skills", "sessions"],
  },
  {
    get label() { return t("扩展"); },
    routes: ["enhance"],
  },
];

const defaultSettings: BackendSettings = {
  ...defaultWhaleBalanceSettings(),
  codexAppPath: "",
  codexAppAutoTakeover: false,
  codexAppAutoTakeoverWhenActive: "defer",

  dictation: defaultDictationSettings(),
  providerSyncEnabled: false,
  ccsDbPath: "",
  providerSyncSavedProviders: [],
  providerSyncManualProviders: [],
  providerSyncLastSelectedProvider: "",
  relayProfilesEnabled: true,
  localConfigProviderImported: false,
  enhancementsEnabled: true,
  codexAppStandaloneQuotaUnlock: false,
  codexAppPluginMarketplaceUnlock: true,
  codexAppModelWhitelistUnlock: true,
  codexAppSessionDelete: true,
  codexAppMarkdownExport: true,
  codexAppUsageStatusLine: true,
  codexAppPasteFix: false,
  codexAppForceChineseLocale: false,
  codexAppTypingEffect: "off",
  codexAppThreadIdBadge: false,
  codexAppConversationView: false,
  codexAppThreadScrollRestore: true,
  codexAppNativeMenuPlacement: true,
  codexAppNativeBrowserRequireIdentification: false,
  codexAppNativeFastUnlock: false,
  codexAppPetRealMouseLook: false,
  codexAppActivityOverlayRight: false,
  protocolProxyAutoRetry: true,
  protocolProxyAutoRetryMaxAttempts: 5,
  protocolProxyAutoRetryIntervalSeconds: 2,
  protocolProxyAutoRetryMode: "streaming",
  protocolProxyAutoRetryCommitDelayMs: 1000,
  codexAppCapacityAutoRetry: false,
  codexAppStepwiseEnabled: false,
  codexAppAnswerOutlineEnabled: false,
  codexAppStepwiseDirectSend: false,
  codexAppStepwiseProtocol: "chat_completions",
  codexAppStepwiseGenerationMode: "auto",
  codexAppStepwiseBaseUrl: "",
  codexAppStepwiseApiKey: "",
  codexAppStepwiseApiKeyEnv: "CODEX_STEPWISE_API_KEY",
  codexAppStepwiseModel: "",
  codexAppStepwiseMaxItems: 4,
  codexAppStepwiseMaxInputChars: 6000,
  codexAppStepwiseMaxOutputTokens: 500,
  codexAppStepwiseTimeoutMs: 8000,
  codexGoalsEnabled: false,
  relayBaseUrl: "",
  relayApiKey: "",
  relayProfiles: [
    {
      id: "default",
      name: t("默认中转"),
      model: "",
      baseUrl: "",
      upstreamBaseUrl: "",
      apiKey: "",
      protocol: "responses",
      relayMode: "official",
      officialMixApiKey: false,
      hideOfficialUsageAlert: false,
      testModel: "",
      configContents: "",
      authContents: "",
      useCommonConfig: true,
      contextSelection: emptyContextSelection(),
      contextSelectionInitialized: true,
      contextWindow: "",
      autoCompactLimit: "",
      modelList: "",
      modelWindows: "",
      modelAutoCompact: "",
      modelMetadata: "",
      modelVlm: "",
      vlmApiKey: "",
      vlmModel: "",
      vlmBaseUrl: "",
      userAgent: "",
      customHeaders: [],
      sub2apiEnabled: false,
      noAuth: false,
      sub2apiMultiplier: "",
      standardOpenaiProtocol: false,
      webSearchHistoryCompat: false,
    },
  ],
  relayCommonConfigContents: "",
  relayPreserveNonproviderSettings: false,
  relayContextConfigContents: "",
  activeRelayId: "default",
  aggregateRelayProfiles: [],
  activeAggregateRelayId: "",

  tools: {},
  activeTool: "codex",
};

export function App() {

  const [route, setRoute] = useState<Route>(() => loadInitialRoute());
  const [notice, setNotice] = useState<{ title: string; message: string; status?: Status } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    confirmText: string;
    cancelText: string;
    resolve: (confirmed: boolean) => void;
  } | null>(null);
  const [sessionIndexCleanupDialog, setSessionIndexCleanupDialog] = useState<{
    candidates: SessionIndexCleanupCandidate[];
    resolve: (selectedIds: string[] | null) => void;
  } | null>(null);
  const [overview, setOverview] = useState<OverviewResult | null>(null);
  const [settings, setSettings] = useState<SettingsResult | null>(null);
  const [relay, setRelay] = useState<RelayResult | null>(null);
  const [relayFiles, setRelayFiles] = useState<RelayFilesResult | null>(null);
  const [envConflicts, setEnvConflicts] = useState<EnvConflictsResult | null>(null);
  const [ccsProviders, setCcsProviders] = useState<CcsProvidersResult | null>(null);
  const [pendingProviderImport, setPendingProviderImport] = useState<ProviderImportRequest | null>(null);
  const [localSessions, setLocalSessions] = useState<LocalSessionsResult | null>(null);
  const [liveContextEntries, setLiveContextEntries] = useState<CodexContextEntries | null>(null);
  const prevLaunchStatusRef = useRef<string | null>(null);
  const overviewRequestSequence = useRef(0);
  const launchPendingRef = useRef(false);
  const [launchPending, setLaunchPending] = useState(false);
  const [settingsForm, setSettingsForm] = useState<BackendSettings>({ ...defaultSettings });

  const [providerSyncProgress, setProviderSyncProgress] = useState<ProviderSyncProgress>({
    active: false,
    percent: 0,
    message: t("尚未运行历史会话修复。"),
    result: null,
  });
  const [providerSyncTargets, setProviderSyncTargets] = useState<ProviderSyncTargetsResult | null>(null);
  const [sessionIndexRepairActive, setSessionIndexRepairActive] = useState(false);
  const sessionIndexRepairRunning = useRef(false);
  const sessionIndexReportLoading = useRef(false);
  const [sessionIndexRepairReport, setSessionIndexRepairReport] = useState<SessionIndexRepairReport | null>(null);
  const [sessionIndexRepairReportError, setSessionIndexRepairReportError] = useState<string | null>(null);
  const [selectedProviderSyncTarget, setSelectedProviderSyncTarget] = useState("");
  const [relaySwitching, setRelaySwitching] = useState(false);
  const settingsDirty = useMemo(
    () => Boolean(settings && !backendSettingsEqual(settingsForm, settings.settings)),
    [settings, settingsForm],
  );

  const call = <T,>(command: string, args?: Record<string, unknown>) => {
    const snapshot = args?.settings as BackendSettings | undefined;
    return invoke<T>(command, command === "save_settings"
      ? { ...args, expectedRevision: snapshot?.revision || "" }
      : args).then((result) => {
        const response = result as { message?: string };
        if (command === "save_settings" && response?.message?.includes("settings_revision_conflict")) {
          // 所有保存调用都保留当前草稿，不能把失败响应当成新表单回填。
          throw new Error(response.message);
        }
        return result;
      });
  };

  const logDiagnostic = (event: string, detail: Record<string, unknown> = {}) => {
    void invoke("write_diagnostic_event", { event, detail }).catch(() => {});
  };

  const run = async <T,>(task: () => Promise<T>): Promise<T | null> => {
    try {
      return await task();
    } catch (error) {
      showNotice(t("调用失败"), stringifyError(error), "failed");
      return null;
    }
  };

  const refreshOverview = async (silent = false) => {
    const requestSequence = ++overviewRequestSequence.current;
    const result = await run(() => call<OverviewResult>("load_overview"));
    if (result && requestSequence === overviewRequestSequence.current) {
      // 崩溃检测：进程从运行状态变为停止/失败 → 弹出通知
      const prev = prevLaunchStatusRef.current;
      const current = result.latest_launch?.status;
      if (prev && prev === "running" && current && (current === "stopped" || current === "failed" || current === "crashed")) {
        showNotice(t("Codex 意外停止"), tf("进程状态：{0}。是否要重新启动？", [current]), "failed");
      }
      prevLaunchStatusRef.current = current ?? null;
      setOverview(result);
      if (!silent) showResultNotice(t("概览已检查"), result, { silentSuccess: true });
    }
  };

  const refreshSettings = async (silent = false) => {
    const result = await run(() => call<SettingsResult>("load_settings"));
    if (result) {
      setSettings(result);
      const normalized = normalizeSettings(result.settings);
      setSettingsForm(normalized);
      if (!silent) showResultNotice(t("设置已加载"), result, { silentSuccess: true });
      return normalized;
    }
    return null;
  };

  const refreshRelay = async (silent = false) => {
    const result = await run(() => call<RelayResult>("relay_status"));
    if (result) {
      setRelay(result);
      if (!silent) showResultNotice(t("登录状态"), result, { silentSuccess: true });
    }
  };

  const refreshRelayFiles = async (silent = false) => {
    const result = await run(() => call<RelayFilesResult>("read_relay_files"));
    if (result) {
      setRelayFiles(result);
      if (!silent) showResultNotice(t("配置文件"), result, { silentSuccess: true });
    }
    return result;
  };

  const refreshEnvConflicts = async (silent = false) => {
    const result = await run(() => call<EnvConflictsResult>("check_env_conflicts"));
    if (result) {
      setEnvConflicts(result);
      if (!silent || !isSuccessStatus(result.status)) showResultNotice(t("环境变量检测"), result, { silentSuccess: true });
    }
    return result;
  };

  const removeEnvConflicts = async (names: string[]) => {
    const uniqueNames = Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));
    if (!uniqueNames.length) return;
    if (!window.confirm(tf("删除这些环境变量？\n\n{0}\n\n删除前会写入备份。", [uniqueNames.join("\n")]))) return;
    const result = await run(() => call<RemoveEnvConflictsResult>("remove_env_conflicts", { request: { names: uniqueNames } }));
    if (result) {
      setEnvConflicts({
        status: result.status,
        message: result.message,
        conflicts: result.remaining,
      });
      showNotice(t("环境变量清理"), result.message, result.status);
    }
  };

  const refreshCcsProviders = async (silent = false) => {
    const result = await run(() => call<CcsProvidersResult>("load_ccs_providers"));
    if (result) {
      setCcsProviders(result);
      if (!silent || !isSuccessStatus(result.status)) showResultNotice(t("cc-switch 导入"), result, { silentSuccess: true });
    }
    return result;
  };

  const importCcsProviders = async (bindings: Record<string, string> = {}) => {
    const result = await run(() => call<SettingsResult>("import_ccs_providers", { bindings }));
    if (result) {
      setSettings(result);
      setSettingsForm(normalizeSettings(result.settings));
      showResultNotice(t("cc-switch 导入"), result);
      await refreshCcsProviders(true);
    }
  };

  const refreshPendingProviderImport = async (silent = true) => {
    const result = await run(() => call<PendingProviderImportResult>("load_pending_provider_import"));
    if (result) {
      setPendingProviderImport(result.pending);
      if (!silent && !isSuccessStatus(result.status)) showResultNotice(t("Codex++ 导入"), result, { silentSuccess: true });
    }
    return result;
  };

  const confirmPendingProviderImport = async () => {
    const result = await run(() => call<SettingsResult>("confirm_pending_provider_import"));
    if (result) {
      setPendingProviderImport(null);
      setSettings(result);
      setSettingsForm(normalizeSettings(result.settings));
      showResultNotice(t("Codex++ 导入"), result);
      await refreshCcsProviders(true);
    }
  };

  const dismissPendingProviderImport = async () => {
    const result = await run(() => call<PendingProviderImportResult>("dismiss_pending_provider_import"));
    if (result) {
      setPendingProviderImport(null);
      showResultNotice(t("Codex++ 导入"), result, { silentSuccess: true });
    }
  };

  const refreshLocalSessions = async (silent = false, offset = 0): Promise<LocalSessionsResult | null> => {
    const result = await run(() =>
      call<LocalSessionsResult>("list_local_sessions", {
        request: { offset, limit: 50 },
      }),
    );
    if (result) {
      if (!result.sessions.length && result.offset > 0) {
        return refreshLocalSessions(silent, Math.max(0, result.offset - result.limit));
      }
      setLocalSessions(result);
      if (!silent || !isSuccessStatus(result.status)) showResultNotice(t("会话管理"), result, { silentSuccess: true });
    }
    return result;
  };

  const listProjectSessions = async (cwd: string): Promise<LocalSession[]> => {
    const result = await run(() => call<LocalSessionsResult>("list_project_sessions", { request: { cwd } }));
    if (!result || !isSuccessStatus(result.status)) {
      if (result) showResultNotice(t("会话管理"), result);
      return [];
    }
    showNotice(t("会话管理"), result.message, "ok");
    return result.sessions;
  };

  const requestDeleteLocalSession = (session: LocalSession) =>
    call<DeleteLocalSessionResult>("delete_local_session", {
      request: { sessionId: session.id, title: session.title, dbPath: session.dbPath },
    });

  const confirmSessionDelete = (title: string, message: string) =>
    new Promise<boolean>((resolve) => {
      setConfirmDialog({
        title,
        message,
        confirmText: t("确认删除"),
        cancelText: t("取消"),
        resolve,
      });
    });

  const selectSessionIndexCleanupCandidates = (candidates: SessionIndexCleanupCandidate[]) =>
    new Promise<string[] | null>((resolve) => {
      setSessionIndexCleanupDialog({
        candidates,
        resolve,
      });
    });

  const deleteLocalSession = async (session: LocalSession) => {
    const title = session.title || session.id;
    const confirmed = await confirmSessionDelete(t("删除会话"), tf("删除会话“{0}”？此操作会删除本地数据库记录和 rollout 文件，并创建备份。", [title]));
    if (!confirmed) return false;
    const result = await run(() => requestDeleteLocalSession(session));
    if (result) {
      showResultNotice(t("会话删除"), result);
      await refreshLocalSessions(true, localSessions?.offset ?? 0);
    }
    return !!result && isSuccessStatus(result.status);
  };

  const deleteLocalSessions = async (sessions: LocalSession[]) => {
    const uniqueSessions = Array.from(new Map(sessions.map((session) => [session.id, session])).values());
    if (!uniqueSessions.length) {
      showNotice(t("批量删除会话"), t("请先选择要删除的会话。"), "failed");
      return false;
    }
    const preview = uniqueSessions
      .slice(0, 6)
      .map((session) => `- ${truncateSessionDeletePreview(session.title || session.id)}`)
      .join("\n");
    const extraCount = uniqueSessions.length > 6 ? tf("\n...以及另外 {0} 个会话", [uniqueSessions.length - 6]) : "";
    const confirmed = await confirmSessionDelete(
      t("批量删除会话"),
      tf("删除选中的 {0} 个会话？此操作会删除本地数据库记录和 rollout 文件，并为每个会话创建备份。\n\n{1}{2}", [uniqueSessions.length, preview, extraCount]),
    );
    if (!confirmed) return false;

    let succeeded = 0;
    const failed: string[] = [];
    for (const session of uniqueSessions) {
      const result = await run(() => requestDeleteLocalSession(session));
      if (result && isSuccessStatus(result.status)) {
        succeeded += 1;
      } else {
        failed.push(session.title || session.id);
      }
    }

    if (failed.length) {
      showNotice(
        t("批量删除会话"),
        tf("已删除 {0} 个，失败 {1} 个：{2}", [succeeded, failed.length, failed.slice(0, 3).map(truncateSessionDeletePreview).join(t("、"))]),
        succeeded ? "ok" : "failed",
      );
    } else {
      showNotice(t("批量删除会话"), tf("已删除 {0} 个会话。", [succeeded]), "ok");
    }
    await refreshLocalSessions(true, localSessions?.offset ?? 0);
    return true;
  };

  const archiveLocalSessions = async (sessions: LocalSession[], archived = true) => {
    const uniqueSessions = Array.from(new Map(sessions.map((session) => [session.id, session])).values());
    if (!uniqueSessions.length) return false;
    const confirmed = await confirmSessionDelete(
      archived ? t("归档会话") : t("取消归档会话"),
      tf("{0} 个会话？这只更新本地归档状态，不删除 rollout 文件。", [uniqueSessions.length]),
    );
    if (!confirmed) return false;
    const result = await run(() => call<CommandResult<{ succeeded: number; failed: number }>>("archive_local_sessions", {
      request: { sessions: uniqueSessions, archived },
    }));
    if (result) showNotice(archived ? t("归档会话") : t("取消归档会话"), result.message, result.status);
    await refreshLocalSessions(true, localSessions?.offset ?? 0);
    return true;
  };

  const refreshLiveContextEntries = async (silent = false) => {
    const result = await run(() => call<LiveContextEntriesResult>("read_live_context_entries"));
    if (result) {
      setLiveContextEntries(result.entries);
      if (!silent || !isSuccessStatus(result.status)) showResultNotice(t("MCP&插件"), result, { silentSuccess: true });
    }
    return result;
  };

  const syncLiveContextEntries = async (next: BackendSettings, silent = false) => {
    const result = await run(() => call<LiveContextEntriesResult>("sync_live_context_entries", { request: { settings: next } }));
    if (result) {
      setLiveContextEntries(result.entries);
      if (!silent || !isSuccessStatus(result.status)) showResultNotice(t("MCP&插件"), result, { silentSuccess: true });
    }
    return result;
  };

  const navigate = async (next: Route) => {
    setRoute(next);
    if (next === "overview") await refreshOverview(true);
    if (next === "sessions") {
      await refreshSettings(true);
      await refreshLocalSessions(true);
      await refreshProviderSyncTargets(true);
      await refreshSessionIndexRepairReport();
    }
    if (next === "context") {
      await refreshSettings(true);
      await refreshRelayFiles(true);
      await refreshLiveContextEntries(true);
    }
    if (next === "enhance") await refreshSettings(true);
  };

  const consumePendingManagerNavigation = async (): Promise<boolean> => {
    try {
      const navigation = await invoke<ManagerNavigationIntent | null>("consume_pending_manager_navigation");
      if (!navigation) return false;
      const destination = managerNavigationDestination(navigation);
      await refreshSettings(true);
      setRoute(destination.route);
      return true;
    } catch (error) {
      logDiagnostic("manager.navigation_failed", { error: stringifyError(error) });
    }
    return false;
  };

  const launch = async () => {
    if (launchPendingRef.current) return;
    launchPendingRef.current = true;
    setLaunchPending(true);
    try {
      const result = await launchCommand("launch_codex_plus");
      if (!result) return;
      if (!isSuccessStatus(result.status)) {
        showNotice(t("启动任务"), result.message, result.status);
        return;
      }
      showNotice(t("启动任务"), t("正在等待 Codex 启动结果…"), "accepted");
      const completion = await waitForLaunchCompletion(result.launchStartedAtMs);
      showLaunchCompletionNotice(t("启动任务"), completion, result.launchStartedAtMs);
    } finally {
      launchPendingRef.current = false;
      setLaunchPending(false);
    }
  };

  const restart = async (syncActiveRelay = false) => {
    if (launchPendingRef.current) return false;
    launchPendingRef.current = true;
    setLaunchPending(true);
    try {
      const result = await launchCommand("restart_codex_plus", syncActiveRelay);
      if (!result) return false;
      if (!isSuccessStatus(result.status)) {
        showNotice(t("重启 Codex"), result.message, result.status);
        return false;
      }
      showNotice(
        t("重启 Codex"),
        result.nativeBrowserRestoreFailed
          ? t("原生浏览器文件恢复失败，仍会继续启动。")
          : t("正在等待 Codex 重新启动…"),
        result.nativeBrowserRestoreFailed ? "failed" : "accepted",
      );
      const completion = await waitForLaunchCompletion(result.launchStartedAtMs);
      showLaunchCompletionNotice(t("重启 Codex"), completion, result.launchStartedAtMs);
      const succeeded = Boolean(
        completion
        && resolveLaunchStatus(completion.latest_launch, result.launchStartedAtMs ?? 0) === "success",
      );
      return succeeded;
    } finally {
      launchPendingRef.current = false;
      setLaunchPending(false);
    }
  };

  const launchCommand = async (command: "launch_codex_plus" | "restart_codex_plus", syncActiveRelay = false) => {
    const result = await run(() =>
      call<LaunchCommandResult>(command, {
        request: {
          appPath: settings?.settings.codexAppPath ?? "",
          debugPort: 9229,
          helperPort: 57321,
          syncActiveRelay,
        },
      }),
    );
    return result;
  };

  const waitForLaunchCompletion = async (requestStartedAtMs?: number) => {
    if (!requestStartedAtMs) {
      await refreshOverview(true);
      return null;
    }
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const result = await run(() => call<OverviewResult>("load_overview"));
      if (result) {
        setOverview(result);
        const resolution = resolveLaunchStatus(result.latest_launch, requestStartedAtMs);
        if (resolution === "success" || resolution === "failed") return result;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 400));
    }
    await refreshOverview(true);
    return null;
  };

  const showLaunchCompletionNotice = (title: string, result: OverviewResult | null, requestedAt?: number) => {
    const notice = launchCompletionNotice(result?.latest_launch ?? null, requestedAt ?? 0);
    showNotice(title, t(notice.message), notice.status);
  };

  const saveSettings = async () => {
    const next = normalizeSettings(settingsForm);
    const result = await run(() => call<SettingsResult>("save_settings", { settings: next }));
    if (result) {
      if (isSuccessStatus(result.status)) {
        setSettings(result);
        setSettingsForm(normalizeSettings(result.settings));
      }
      showNotice(t("设置保存"), result.message, result.status);
    }
  };

  const saveSettingsValue = async (next: BackendSettings, silent = true) => {
    const normalized = normalizeSettings(next);
    const result = await run(() => call<SettingsResult>("save_settings", { settings: normalized }));
    if (result && isSuccessStatus(result.status)) {
      const saved = normalizeSettings(result.settings);
      setSettings(result);
      setSettingsForm(saved);
      if (!silent) showNotice(t("设置保存"), result.message, result.status);
      return saved;
    }
    if (result) showNotice(t("设置保存"), result.message, result.status);
    // 保留草稿供用户重载后合并，不能拿最新版本号自动重试旧快照。
    return null;
  };

  const refreshProviderSyncTargets = async (silent = false) => {
    const result = await run(() => call<ProviderSyncTargetsResult>("load_provider_sync_targets"));
    if (result) {
      setProviderSyncTargets(result);
      const targets = result.targets ?? [];
      const saved = settingsForm.providerSyncLastSelectedProvider;
      const preferred = preferredProviderSyncTarget(targets, result.currentProvider, saved);
      setSelectedProviderSyncTarget(preferred);
      if (!silent && !isSuccessStatus(result.status)) showNotice(t("Provider 同步目标"), result.message, result.status);
    }
    return result;
  };

  const refreshSessionIndexRepairReport = async (isCurrent = () => true) => {
    if (sessionIndexReportLoading.current || sessionIndexRepairRunning.current) return;
    sessionIndexReportLoading.current = true;
    try {
      // 持久报告读取失败时保留现有结果，后台刷新不触发全局通知或忙碌状态。
      const result = await call<CommandResult<{ report: SessionIndexRepairReport | null }>>(
        "load_session_index_repair_report",
      );
      if (isCurrent() && !sessionIndexRepairRunning.current && isSuccessStatus(result.status)) {
        setSessionIndexRepairReportError(null);
        setSessionIndexRepairReport((previous) => {
          if ((previous?.checkedAtMs ?? 0) > (result.report?.checkedAtMs ?? 0)) return previous;
          return result.report;
        });
      } else if (isCurrent() && !isSuccessStatus(result.status)) {
        setSessionIndexRepairReportError(result.message || t("读取会话索引修复报告失败"));
      }
    } catch (error) {
      if (isCurrent()) {
        setSessionIndexRepairReportError(
          tf("读取会话索引修复报告失败：{0}", [stringifyError(error)]),
        );
      }
    } finally {
      sessionIndexReportLoading.current = false;
    }
  };

  const repairSessionIndex = async () => {
    if (sessionIndexRepairRunning.current || providerSyncProgress.active) return;
    sessionIndexRepairRunning.current = true;
    setSessionIndexRepairActive(true);
    try {
      const result = await run(() => call<CommandResult<SessionIndexRepairReport>>("repair_session_index"));
      if (result) {
        if (isSuccessStatus(result.status)) {
          setSessionIndexRepairReport(result);
          await refreshLocalSessions(true);
        }
        showNotice(t("修复会话索引"), result.message, result.status);
      }
    } finally {
      sessionIndexRepairRunning.current = false;
      setSessionIndexRepairActive(false);
    }
  };

  const recoverProviderSync = async () => {
    const backupDir = providerSyncProgress.result?.backupDir;
    if (providerSyncProgress.active || !backupDir) return;
    if (!window.confirm(t("恢复这次未完成的修复？期间被其他操作修改的数据会保留，并报告冲突。"))) return;
    setProviderSyncProgress((current) => ({ ...current, active: true, message: t("正在恢复…") }));
    try {
      const result = await run(() => call<CommandResult<ProviderSyncPayload>>("recover_provider_sync", { backupDir }));
      if (result) {
        setProviderSyncProgress({ active: false, percent: 100, message: result.message, result });
        showNotice(t("恢复历史会话修复"), result.message, result.status);
        await refreshLocalSessions(true);
      }
    } finally {
      setProviderSyncProgress((current) => ({ ...current, active: false }));
    }
  };

  const syncProvidersNow = async () => {
    if (sessionIndexRepairRunning.current) return;
    if (providerSyncProgress.active) return;
    setProviderSyncProgress({
      active: true,
      percent: 0,
      message: t("正在扫描历史会话与索引…"),
      result: null,
    });
    let unlisten: (() => void) | undefined;
    try {
      unlisten = await listen<ProviderSyncStreamProgress>("provider-sync-progress", (event) => {
        const progress = event.payload;
        const message = (() => {
          switch (progress.phase) {
            case "scanning":
              return t("正在扫描历史会话与索引…");
            case "planning":
              return t("正在检查会话 provider 标记…");
            case "backing_up":
              return t("正在创建修复备份…");
            case "rewriting":
              return t("正在写入会话修复…");
            case "updating_indexes":
              return t("正在更新会话索引…");
            case "rolling_back":
              return t("正在回滚已写入的会话…");
            case "complete":
              return t("正在完成历史会话修复…");
          }
        })();
        setProviderSyncProgress((current) => {
          if (!current.active) return current;
          return {
            ...current,
            percent: Math.max(current.percent, providerSyncStreamPercent(progress)),
            message,
          };
        });
      });
      const targetProvider = selectedProviderSyncTarget || undefined;
      const result = await run(() =>
        call<CommandResult<ProviderSyncPayload>>("sync_providers_now", { targetProvider }),
      );
      if (result) {
        const syncSucceeded = isSuccessStatus(result.status) && result.syncStatus === "synced";
        let finalResult =
          isSuccessStatus(result.status) && !syncSucceeded
            ? {
                ...result,
                status: "failed",
                message: result.syncMessage || t("历史会话修复失败，请查看错误提示后重试。"),
              }
            : result;
        let cleanupFailure: { status: Status; message: string } | null = null;
        if (syncSucceeded) {
          const preview = await run(() =>
            call<CommandResult<SessionIndexCleanupPreviewPayload>>("preview_session_index_cleanup"),
          );
          if (!preview) {
            cleanupFailure = {
              status: "failed",
              message: t("幽灵任务索引处理失败，请查看错误提示后重试。"),
            };
          } else if (isSuccessStatus(preview.status) && preview.candidates.length > 0) {
            const selectedIds = await selectSessionIndexCleanupCandidates(preview.candidates);
            if (selectedIds?.length) {
              const cleanup = await run(() =>
                call<CommandResult<SessionIndexCleanupApplyPayload>>("apply_session_index_cleanup", {
                  snapshotSha256: preview.snapshotSha256,
                  threadIds: selectedIds,
                }),
              );
              if (cleanup && isSuccessStatus(cleanup.status)) {
                finalResult = {
                  ...result,
                  prunedSessionIndexEntries: cleanup.prunedEntries ?? 0,
                };
              } else {
                cleanupFailure = cleanup ?? {
                  status: "failed",
                  message: t("幽灵任务索引处理失败，请查看错误提示后重试。"),
                };
              }
            }
          } else if (!isSuccessStatus(preview.status)) {
            cleanupFailure = preview;
          }
        }
        const completion = resolveProviderSyncCompletion(finalResult, cleanupFailure);
        setProviderSyncProgress({
          active: false,
          percent: 100,
          message:
            completion.progressMessage ??
            (isSuccessStatus(completion.result.status)
              ? providerSyncProgressMessage(completion.result)
              : completion.result.message),
          result: completion.result,
        });
        if (targetProvider && syncSucceeded) {
          const next = {
            ...settingsForm,
            providerSyncLastSelectedProvider: targetProvider,
            providerSyncSavedProviders: Array.from(
              new Set([...(settingsForm.providerSyncSavedProviders ?? []), targetProvider]),
            ).sort(),
          };
          setSettingsForm(next);
        }
        await refreshProviderSyncTargets(true);
        const noticeTitle =
          completion.noticeKind === "cleanup" ? t("清理幽灵任务索引") : t("历史会话修复");
        showNotice(
          noticeTitle,
          completion.result.message,
          completion.result.status,
        );
      } else {
        setProviderSyncProgress({
          active: false,
          percent: 100,
          message: t("历史会话修复失败，请查看错误提示后重试。"),
          result: null,
        });
      }
    } catch (error) {
      const message = stringifyError(error);
      setProviderSyncProgress({
        active: false,
        percent: 100,
        message,
        result: null,
      });
      showNotice(t("历史会话修复"), message, "failed");
    } finally {
      unlisten?.();
    }
  };

  const applyRelayInjection = async (silent = false) => {
    const settingsResult = await run(() => call<SettingsResult>("save_settings", { settings: settingsForm }));
    if (settingsResult) {
      setSettings(settingsResult);
      setSettingsForm(normalizeSettings(settingsResult.settings));
      if (!isSuccessStatus(settingsResult.status)) {
        showNotice(t("设置保存"), settingsResult.message, settingsResult.status);
        return false;
      }
    } else {
      return false;
    }
    const result = await run(() => call<RelayResult>("apply_relay_injection"));
    if (result) {
      setRelay(result);
      await refreshRelayFiles(true);
      if (!silent || !isSuccessStatus(result.status)) showNotice(t("官方混入 API Key"), result.message, result.status);
    }
    return !!result && isSuccessStatus(result.status) && result.configured;
  };

  const applyPureApiInjection = async (silent = false) => {
    const settingsResult = await run(() => call<SettingsResult>("save_settings", { settings: settingsForm }));
    if (settingsResult) {
      setSettings(settingsResult);
      setSettingsForm(normalizeSettings(settingsResult.settings));
      if (!isSuccessStatus(settingsResult.status)) {
        showNotice(t("设置保存"), settingsResult.message, settingsResult.status);
        return false;
      }
    } else {
      return false;
    }
    const result = await run(() => call<RelayResult>("apply_pure_api_injection"));
    if (result) {
      setRelay(result);
      await refreshRelayFiles(true);
      if (!silent || !isSuccessStatus(result.status)) showNotice(t("纯 API 模式"), result.message, result.status);
    }
    return !!result && isSuccessStatus(result.status) && result.configured;
  };

  const clearRelayInjection = async (silent = false) => {
    const result = await run(() => call<RelayResult>("clear_relay_injection"));
    if (result) {
      setRelay(result);
      await refreshRelayFiles(true);
      if (!silent || !isSuccessStatus(result.status)) showNotice(t("官方登录模式"), result.message, result.status);
    }
    return !!result && isSuccessStatus(result.status) && !result.configured;
  };

  const saveRelayFile = async (kind: "config" | "auth", contents: string, silent = false) => {
    const result = await run(() => call<RelayFilesResult>("save_relay_file", { request: { kind, contents } }));
    if (result) {
      setRelayFiles(result);
      if (!silent || !isSuccessStatus(result.status)) {
        showNotice(kind === "config" ? "config.toml" : "auth.json", result.message, result.status);
      }
      await refreshRelay(true);
    }
  };

  const upsertContextEntry = async (next: BackendSettings, kind: ContextKind, id: string, tomlBody: string) => {
    const result = await run(() =>
      call<ContextEntriesResult>("upsert_context_entry", {
        request: { settings: next, kind, id, tomlBody },
      }),
    );
    if (!result) return null;
    let normalized = normalizeSettings(result.settings);
    const saveResult = await run(() => call<SettingsResult>("save_settings", { settings: normalized }));
    if (saveResult) {
      setSettings(saveResult);
      normalized = normalizeSettings(saveResult.settings);
    }
    setSettingsForm(normalized);
    if (!isSuccessStatus(result.status)) showResultNotice(t("MCP&插件"), result);
    return normalized;
  };

  const deleteContextEntry = async (next: BackendSettings, kind: ContextKind, id: string) => {
    const result = await run(() =>
      call<ContextEntriesResult>("delete_context_entry", {
        request: { settings: next, kind, id },
      }),
    );
    if (!result) return null;
    let normalized = normalizeSettings(result.settings);
    const saveResult = await run(() => call<SettingsResult>("save_settings", { settings: normalized }));
    if (saveResult) {
      setSettings(saveResult);
      normalized = normalizeSettings(saveResult.settings);
    }
    setSettingsForm(normalized);
    if (!isSuccessStatus(result.status)) showResultNotice(t("MCP&插件"), result);
    return normalized;
  };

  const previewMcpServersJson = async (json: string) => {
    const result = await run(() => call<McpImportPreviewResult>("preview_mcp_servers_json", { json }));
    if (result && !isSuccessStatus(result.status)) showResultNotice(t("MCP 导入"), result);
    return result;
  };

  const importMcpServersJson = async (next: BackendSettings, json: string) => {
    const result = await run(() =>
      call<ContextEntriesResult>("import_mcp_servers_json", { request: { settings: next, json } }),
    );
    if (!result) return null;
    let normalized = normalizeSettings(result.settings);
    const saveResult = await run(() => call<SettingsResult>("save_settings", { settings: normalized }));
    if (saveResult) {
      setSettings(saveResult);
      normalized = normalizeSettings(saveResult.settings);
    }
    setSettingsForm(normalized);
    showResultNotice(t("MCP 导入"), result);
    return isSuccessStatus(result.status) ? normalized : null;
  };

  const extractRelayCommonConfig = async (configContents: string) => {
    const result = await run(() =>
      call<ExtractRelayCommonConfigResult>("extract_relay_common_config", {
        request: { configContents },
      }),
    );
    if (result) showResultNotice(t("通用配置文件"), result);
    return result && isSuccessStatus(result.status) ? result : null;
  };

  const testRelayProfile = async (profile: RelayProfile) => {
    const result = await run(() => call<RelayProfileTestResult>("test_relay_profile", { profile }));
    if (result) showNotice(t("供应商测试"), result.message, result.status);
  };

  const diagnoseRelayProfile = async (profile: RelayProfile) => {
    const result = await run(() => call<ProviderDoctorResult>("diagnose_relay_profile", { profile }));
    if (result) showNotice("Provider Doctor", result.message, result.status);
    return result ?? null;
  };

  const fetchRelayProfileModels = async (profile: RelayProfile) => {
    const result = await run(() => call<RelayProfileModelsResult>("fetch_relay_profile_models", { profile }));
    if (result) showNotice(t("模型列表"), result.message, result.status);
    return result && isSuccessStatus(result.status) ? result.models : null;
  };

  const switchOfficialMode = async () => {
    const switched = await clearRelayInjection(true);
    if (!switched) return;
    showNotice(t("官方登录模式"), t("已切回官方登录。"), "ok");
  };

  const switchPureApiMode = async () => {
    const switched = await applyPureApiInjection(true);
    if (!switched) return;
    showNotice(t("纯 API 模式"), t("已切换到纯 API。"), "ok");
  };

  const switchRelayProfile = async (next: BackendSettings, previousActiveRelayId = settingsForm.activeRelayId) => {
    if (relaySwitching) {
      showNotice(t("供应商切换中"), t("上一次切换还没有完成，请稍后再试。"), "failed");
      return;
    }
    let switchSettings = normalizeSettings(next);
    if (!switchSettings.relayProfilesEnabled) {
      showNotice(t("供应商配置已关闭"), t("当前不会写入 Codex config.toml / auth.json。打开供应商配置总开关后再切换。"), "failed");
      return;
    }
    const targetBeforeSnapshot = activeRelayProfile(switchSettings);
    logDiagnostic("switchRelayProfile.start", {
      currentRelayId: settingsForm.activeRelayId,
      targetRelayId: switchSettings.activeRelayId,
      targetRelayName: targetBeforeSnapshot.name,
      targetRelayMode: targetBeforeSnapshot.relayMode,
    });
    const selectedBeforeSave = activeRelayProfile(switchSettings);
    const validationError = relayProfileSwitchValidation(selectedBeforeSave, switchSettings);
    if (validationError) {
      logDiagnostic("switchRelayProfile.validation_failed", {
        targetRelayId: selectedBeforeSave.id,
        targetRelayName: selectedBeforeSave.name,
        error: validationError,
      });
      showNotice(t("供应商配置可能不正确"), validationError, "failed");
      return;
    }
    switchSettings = await snapshotActiveRelayFilesBeforeSwitch(switchSettings, previousActiveRelayId);
    const selectedAfterSave = activeRelayProfile(switchSettings);
    const command = relayProfileSwitchCommand(selectedAfterSave);

    logDiagnostic("switchRelayProfile.apply_start", {
      targetRelayId: selectedAfterSave.id,
      targetRelayName: selectedAfterSave.name,
      previousActiveRelayId,
      command,
    });
    setRelaySwitching(true);
    try {
      const result = await run(() =>
        call<RelaySwitchResult>("switch_relay_profile", {
          request: { settings: switchSettings, previousActiveRelayId },
        }),
      );
      if (!result) {
        logDiagnostic("switchRelayProfile.apply_no_result", {
          targetRelayId: selectedAfterSave.id,
        });
        return;
      }
      const selectedSettings = normalizeSettings(result.settings);
      setSettings({
        revision: selectedSettings.revision || "",
        status: result.status,
        message: result.message,
        settings: selectedSettings,
        settings_path: result.settingsPath,
      });
      setSettingsForm(selectedSettings);
      setRelay({
        status: result.status,
        message: result.message,
        ...result.relay,
      });
      await refreshRelayFiles(true);
      if (!isSuccessStatus(result.status)) {
        logDiagnostic("switchRelayProfile.apply_failed", {
          targetRelayId: selectedAfterSave.id,
          status: result.status,
          message: result.message,
          activeRelayId: selectedSettings.activeRelayId,
        });
        showNotice(t("供应商切换"), result.message, result.status);
        return;
      }
      const currentSelected = activeRelayProfile(selectedSettings);
      logDiagnostic("switchRelayProfile.ok", {
        targetRelayId: currentSelected.id,
        status: result.status,
      });
    } finally {
      setRelaySwitching(false);
    }
  };

  const snapshotActiveRelayFilesBeforeSwitch = async (
    next: BackendSettings,
    previousActiveRelayId: string,
  ): Promise<BackendSettings> => {
    if (!shouldBackfillRelayProfileBeforeSwitch(previousActiveRelayId, next.activeRelayId)) return next;
    const profileId = previousActiveRelayId.trim();
    const result = await run(() =>
      call<SettingsBackfillResult>("backfill_relay_profile_from_live", {
        request: { settings: next, profileId },
      }),
    );
    if (!result) return next;
    const normalized = normalizeSettings(result.settings);
    // degraded = 后端跳过了回填（例如 live config.toml 有语法错误，issue #618）。
    // 切换本身照常继续，只是用原配置走；提示一下原因即可，不能按 failed 处理，
    // 否则会把用户卡在中转态回不去。
    if (isDegradedStatus(result.status)) {
      showNotice(t("供应商切换"), result.message, result.status);
      return normalized;
    }
    if (!isSuccessStatus(result.status)) {
      showNotice(t("供应商切换"), result.message, result.status);
      return next;
    }
    return normalized;
  };

  const showNotice = (title: string, message: string, status?: Status) => {
    setNotice({ title, message: t(message), status });
  };

  const exitManagerApp = async () => {
    await call<void>("manager_exit_app");
  };

  const hideManagerToTray = async () => {
    await call<void>("manager_hide_to_tray");
  };

  const showResultNotice = (
    title: string,
    result: Pick<CommandResult<unknown>, "message" | "status">,
    options: { silentSuccess?: boolean } = {},
  ) => {
    if (options.silentSuccess && isSuccessStatus(result.status)) return;
    showNotice(title, result.message, result.status);
  };

  useEffect(() => {
    void (async () => {
      const handledNavigation = await consumePendingManagerNavigation();
      await refreshOverview(true);
      if (!handledNavigation) await refreshSettings(true);
      await refreshRelay(true);
      await refreshEnvConflicts(true);
      await refreshProviderSyncTargets(true);
      await refreshPendingProviderImport(true);
    })();
  }, []);

  useEffect(() => {
    let disposed = false;
    let stopListening: (() => void) | undefined;
    void listen(MANAGER_NAVIGATION_EVENT, () => {
      if (!disposed) void consumePendingManagerNavigation();
    }).then((unlisten) => {
      if (disposed) {
        unlisten();
      } else {
        stopListening = unlisten;
      }
    });
    return () => {
      disposed = true;
      stopListening?.();
    };
  }, []);

  useEffect(() => {
    if (route !== "sessions") return;
    let disposed = false;
    void call<CommandResult<ProviderSyncPayload>>("load_provider_sync_recovery").then((result) => {
      if (disposed || !result.recoveryJournalPath) return;
      setProviderSyncProgress((current) => current.active ? current : ({ active: false, percent: 0, message: result.message, result }));
    }).catch(() => {});
    return () => { disposed = true; };
  }, [route]);

  useEffect(() => {
    if (route !== "sessions") return;
    let disposed = false;
    const refresh = () => void refreshSessionIndexRepairReport(() => !disposed);
    refresh();
    const timer = window.setInterval(refresh, 15_000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [route]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshPendingProviderImport(true);
    }, 1200);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const refresh = () => { void refreshOverview(true); };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  useEffect(() => {
    let disposed = false;
    let stopListening: (() => void) | undefined;
    void listen("runtime-health-changed", () => {
      if (!disposed) void refreshOverview(true);
    }).then((unlisten) => {
      if (disposed) unlisten();
      else {
        stopListening = unlisten;
        // 先订阅再读取，覆盖后台恢复早于监听安装完成的情况。
        void refreshOverview(true);
      }
    });
    return () => {
      disposed = true;
      stopListening?.();
    };
  }, []);

  const saveCodexAppPath = async (appPath: string) => {
    const saved = await saveSettingsValue({ ...settingsForm, codexAppPath: appPath });
    if (saved) await refreshOverview(true);
    return saved;
  };

  const actions = useMemo(
    () => ({
      refreshCurrent: () => navigate(route),
      launch,
      restart,

      saveSettings,
      saveSettingsValue,
      refreshSettings,

      chooseCodexAppPath: async (mode: "folder" | "file") => {
        let selected: unknown;
        try {
          selected = await open(
            mode === "folder"
              ? { directory: true, multiple: false, title: t("选择 Codex 应用目录") }
              : {
                  directory: false,
                  multiple: false,
                  title: t("选择 Codex.exe 或 Codex.app"),
                  filters: [{ name: t("Codex 应用"), extensions: ["exe", "app"] }],
                },
          );
        } catch (error) {
          // Surface plugin failures (e.g. missing capability permission) so the
          // buttons no longer appear unresponsive — see #345.
          const message = error instanceof Error ? error.message : String(error);
          showNotice(t("Codex 应用路径"), tf("打开选择器失败：{0}", [message]), "failed");
          return;
        }
        if (typeof selected === "string" && selected.trim()) {
          const result = await saveCodexAppPath(selected.trim());
          if (result) {
            showNotice(t("Codex 应用路径"), t("应用路径已保存，之后启动会自动复用。"), "ok");
          }
        }
      },
      clearCodexAppPath: async () => {
        const saved = await saveCodexAppPath("");
        if (saved) showNotice(t("Codex 应用路径"), t("已清除保存路径，后续启动会回到自动探测。"), "ok");
      },
      syncProvidersNow,
      recoverProviderSync,
      repairSessionIndex,
      refreshProviderSyncTargets,
      setProviderSyncTarget: (provider: string) => {
        setSelectedProviderSyncTarget(provider);
      },
      refreshRelay,
      refreshRelayFiles,
      refreshEnvConflicts,
      removeEnvConflicts,
      refreshCcsProviders,
      importCcsProviders,
      refreshLiveContextEntries,
      syncLiveContextEntries,
      refreshLocalSessions,
      listProjectSessions,
      deleteLocalSession,
      deleteLocalSessions,
      archiveLocalSessions,
      applyRelayInjection,
      applyPureApiInjection,
      clearRelayInjection,
      saveRelayFile,
      upsertContextEntry,
      deleteContextEntry,
      previewMcpServersJson,
      importMcpServersJson,
      extractRelayCommonConfig,
      testRelayProfile,
      diagnoseRelayProfile,
      fetchRelayProfileModels,
      switchRelayProfile,
      relaySwitching,
      switchOfficialMode,
      switchPureApiMode,

      showMessage: async (title: string, message: string, status?: Status) => showNotice(title, message, status),

    }),
    [route, settingsForm, settings, overview, relayFiles, localSessions, selectedProviderSyncTarget, envConflicts, ccsProviders],
  );

  const isManagementScreen = route === "relay" || route === "sessions" || route === "context" || route === "skills";
  const codexAppRunning = overview?.runtime_health?.codex_app?.status === "running";

  return (
    <div className="shell">
        <aside className="sidebar">
          <nav className="nav" aria-label={t("主导航")}>
            {navigationSections.map((section) => {
              return (
              <div className="nav-section" key={section.label}>
                <div className="nav-section-label">{section.label}</div>
                {section.routes.map((routeId) => {
                  const item = routes.find((candidate) => candidate.id === routeId);
                  if (!item) return null;
                  const Icon = item.icon;
                  return (
                    <button
                      className={`nav-item ${route === item.id ? "active" : ""}`}
                      key={item.id}
                      onClick={() => void navigate(item.id)}
                      title={item.label}
                      type="button"
                    >
                      <span className="nav-icon">
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="nav-label">{item.label}</span>
                      {item.badge ? <span className="nav-badge">{item.badge}</span> : null}
                    </button>
                  );
                })}
              </div>
              );
            })}
          </nav>
        </aside>
      <main className="workspace">
        <header className="topbar" key={`topbar-${route}`}>
          <div>
            <h1>{routeTitle(route)}</h1>
            <p>{routeSubtitle(route)}</p>
          </div>
          <div className="topbar-actions">
                <span className="codex-app-state" aria-live="polite">
                  <UiBadge
                    className={statusClass(overview?.runtime_health?.codex_app?.status ?? "not_checked")}
                    variant="secondary"
                  >
                    Codex {statusLabel(overview?.runtime_health?.codex_app?.status ?? "not_checked")}
                  </UiBadge>
                </span>
                <Button
                  disabled={launchPending || !overview?.runtime_health}
                  onClick={() => void (codexAppRunning ? actions.restart() : actions.launch())}
                  title={codexAppRunning ? t("重启 Codex") : t("启动 Codex")}
                >
                  <Rocket className="h-4 w-4" />
                  {codexAppRunning ? t("重启 Codex") : t("启动 Codex")}
                </Button>
          </div>
        </header>
        <section
          className={`screen ${isManagementScreen ? "management-screen" : ""}`.trim()}
          key={route}
        >
          {route === "overview" ? (
            <OverviewScreen
              overview={overview}
              settings={settings}
              actions={actions}
            />
          ) : null}
          {route === "relay" ? (
            <RelayScreen
              settings={settings}
              relayFiles={relayFiles}
              envConflicts={envConflicts}
              ccsProviders={ccsProviders}
              form={settingsForm}
              actions={actions}
            />
          ) : null}
          {route === "sessions" ? (
            <ProjectSessionPage
              sessions={localSessions}
              onRefresh={async (offset) => { await actions.refreshLocalSessions(false, offset ?? 0); }}
              onDelete={actions.deleteLocalSession}
              onDeleteMany={actions.deleteLocalSessions}
              onArchiveMany={actions.archiveLocalSessions}
              onListProjectSessions={actions.listProjectSessions}
              repairPanel={<SessionRepairPanel form={settingsForm} providerSyncProgress={providerSyncProgress}
                sessionIndexRepairActive={sessionIndexRepairActive} sessionIndexRepairReport={sessionIndexRepairReport}
                sessionIndexRepairReportError={sessionIndexRepairReportError} providerSyncTargets={providerSyncTargets}
                selectedProviderSyncTarget={selectedProviderSyncTarget} onFormChange={setSettingsForm} actions={actions} />}
            />
          ) : null}
          {route === "context" ? (
            <McpPage
              entries={[...contextEntriesByKind(contextEntriesWithLiveEntries(settingsForm, liveContextEntries), "mcp"), ...contextEntriesByKind(contextEntriesWithLiveEntries(settingsForm, liveContextEntries), "plugin")]}
              onSave={async (kind, id, body) => {
                const next = await actions.upsertContextEntry(settingsForm, kind, id, body);
                if (!next) return false;
                const synced = await actions.syncLiveContextEntries(next, true);
                return Boolean(synced && isSuccessStatus(synced.status));
              }}
              onDelete={async (entry) => {
                const next = await actions.deleteContextEntry(settingsForm, entry.kind, entry.id);
                if (!next) return false;
                const synced = await actions.syncLiveContextEntries(next, true);
                return Boolean(synced && isSuccessStatus(synced.status));
              }}
              onRefresh={async () => { await actions.refreshLiveContextEntries(); await actions.refreshRelayFiles(); }}
              onImport={async (json) => {
                const next = await actions.importMcpServersJson(settingsForm, json);
                if (!next) return false;
                const synced = await actions.syncLiveContextEntries(next, true);
                return Boolean(synced && isSuccessStatus(synced.status));
              }}
              notify={actions.showMessage}
            />
          ) : null}
          {route === "skills" ? <SkillsPage notify={actions.showMessage} /> : null}

          {route === "enhance" ? (
            <EnhanceScreen
              dirty={settingsDirty}
              form={settingsForm}
              onFormChange={setSettingsForm}
              actions={actions}
            />
          ) : null}


        </section>
      </main>

      {notice ? (
        <NoticeDialog
          key={`${notice.title}-${notice.message}-${notice.status ?? ""}`}
          notice={notice}
          onClose={() => setNotice(null)}
        />
      ) : null}
      {confirmDialog ? (
        <ConfirmDialog
          confirm={confirmDialog}
          onCancel={() => {
            confirmDialog.resolve(false);
            setConfirmDialog(null);
          }}
          onConfirm={() => {
            confirmDialog.resolve(true);
            setConfirmDialog(null);
          }}
        />
      ) : null}
      {sessionIndexCleanupDialog ? (
        <SessionIndexCleanupDialog
          request={sessionIndexCleanupDialog}
          onCancel={() => {
            sessionIndexCleanupDialog.resolve(null);
            setSessionIndexCleanupDialog(null);
          }}
          onConfirm={(selectedIds) => {
            sessionIndexCleanupDialog.resolve(selectedIds);
            setSessionIndexCleanupDialog(null);
          }}
        />
      ) : null}

      {pendingProviderImport ? (
        <PendingProviderImportDialog
          request={pendingProviderImport}
          onConfirm={() => void confirmPendingProviderImport()}
          onDismiss={() => void dismissPendingProviderImport()}
        />
      ) : null}

    </div>
  );
}

// 模型行「思考等级」列：多选档位 + 默认档。选择直接写回该模型的
// supported_reasoning_levels，不下发本地草稿，面板与「模型配置」JSON 共用一份数据。
function ModelReasoningLevelsCell({
  levels,
  inherited,
  defaultLevel,
  parameterMode,
  onParameterModeChange,
  onChange,
}: {
  levels: string[];
  parameterMode: ReasoningParameterMode;
  onParameterModeChange: (mode: ReasoningParameterMode) => void;
  /// true = 当前值来自内置声明而非该模型的自定义配置。
  inherited: boolean;
  defaultLevel: string | null;
  onChange: (levels: string[], defaultLevel: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const label = parameterMode === "omit" ? t("不发送思考参数") : formatReasoningLevelsLabel(levels);
  const toggleLevel = (level: string) => {
    const picked = levels.includes(level)
      ? levels.filter((item) => item !== level)
      : [...levels, level];
    const next = normalizeReasoningLevels(picked);
    // 默认档必须落在选中集合里，取消勾选时一起清掉。
    onChange(next, defaultLevel && next.includes(defaultLevel) ? defaultLevel : null);
  };
  const triggerTip = levels.length
    ? `${levels.join(", ")}${defaultLevel ? ` · ${t("默认等级")}: ${defaultLevel}` : ""}`
    : t("未设置时沿用内置默认档位");
  const { rootRef, menuRef, menuStyle } = usePopoverLayer({
    open,
    onOpenChange: setOpen,
    align: "end",
    menuWidth: 240,
    minWidth: 240,
    maxHeight: 320,
  });
  return (
    <div
      className={`app-select relay-reasoning ${open ? "open" : ""} ${inherited ? "inherited" : ""}`.trim()}
      ref={rootRef}
    >
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        className="app-select-trigger"
        onClick={() => setOpen((current) => !current)}
        title={triggerTip}
        type="button"
      >
        <span className={label ? "" : "relay-reasoning-empty"}>{label || t("未设置")}</span>
        <ChevronDown className="h-4 w-4" />
      </button>
      {open ? createPortal(
        <div
          aria-multiselectable="true"
          className="app-select-menu app-select-menu-portal relay-reasoning-menu"
          ref={menuRef}
          role="listbox"
          style={menuStyle}
        >
          <div className="relay-reasoning-default">
            <span>{t("请求参数")}</span>
            <div className="relay-reasoning-chips">
              {([ ["auto", t("自动兼容")], ["passthrough", t("原样传等级（Chat）")], ["omit", t("不发送")] ] as const).map(([mode, text]) =>
                <button key={mode} type="button" className={parameterMode === mode ? "selected" : ""} onClick={() => onParameterModeChange(mode)}>{text}</button>)}
            </div>
          </div>
          {REASONING_LEVELS.map((level) => {
            const selected = levels.includes(level);
            return (
              <button
                aria-selected={selected}
                className={`app-select-option ${selected ? "selected" : ""}`.trim()}
                key={level}
                disabled={parameterMode === "omit"}
                onClick={() => toggleLevel(level)}
                onMouseDown={(event) => event.preventDefault()}
                role="option"
                type="button"
              >
                {selected ? <CheckCircle2 className="h-4 w-4" /> : <span className="app-select-option-spacer" />}
                <span>{level}</span>
              </button>
            );
          })}
          <div className="relay-reasoning-default">
            <span>{t("默认等级")}</span>
            <div className="relay-reasoning-chips">
              <button
                className={defaultLevel ? "" : "selected"}
                disabled={parameterMode === "omit"}
                onClick={() => onChange(levels, null)}
                type="button"
              >
                {t("自动")}
              </button>
              {levels.map((level) => (
                <button
                  className={defaultLevel === level ? "selected" : ""}
                  key={level}
                  disabled={parameterMode === "omit"}
                  onClick={() => onChange(levels, level)}
                  type="button"
                >
                  {level}
                </button>
              ))}
            </div>
          </div>
          <p className="relay-reasoning-hint">
            {parameterMode === "omit" ? t("请求不发送思考参数；档位草稿保留，切回自动兼容后可恢复。")
              : parameterMode === "passthrough" ? t("Chat 上游按原值接收 reasoning_effort，不按模型名改写档位。")
              : inherited
              ? t("当前为内置默认，修改后保存为该模型的自定义思考等级。")
              : t("未设置时沿用内置默认；清空全部档位即恢复内置。")}
          </p>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

type Actions = {
  refreshCurrent: () => Promise<void>;
  launch: () => Promise<void>;
  restart: (syncActiveRelay?: boolean) => Promise<boolean>;

  saveSettings: () => Promise<void>;
  saveSettingsValue: (settings: BackendSettings, silent?: boolean) => Promise<BackendSettings | null>;
  refreshSettings: (silent?: boolean) => Promise<BackendSettings | null>;

  chooseCodexAppPath: (mode: "folder" | "file") => Promise<void>;
  clearCodexAppPath: () => Promise<void>;
  syncProvidersNow: () => Promise<void>;
  recoverProviderSync: () => Promise<void>;
  repairSessionIndex: () => Promise<void>;
  refreshProviderSyncTargets: (silent?: boolean) => Promise<ProviderSyncTargetsResult | null>;
  setProviderSyncTarget: (provider: string) => void;
  refreshRelay: () => Promise<void>;
  refreshRelayFiles: () => Promise<RelayFilesResult | null>;
  refreshEnvConflicts: (silent?: boolean) => Promise<EnvConflictsResult | null>;
  removeEnvConflicts: (names: string[]) => Promise<void>;
  refreshCcsProviders: (silent?: boolean) => Promise<CcsProvidersResult | null>;
  importCcsProviders: (bindings?: Record<string, string>) => Promise<void>;
  refreshLiveContextEntries: () => Promise<LiveContextEntriesResult | null>;
  syncLiveContextEntries: (settings: BackendSettings, silent?: boolean) => Promise<LiveContextEntriesResult | null>;
  refreshLocalSessions: (silent?: boolean, offset?: number) => Promise<LocalSessionsResult | null>;
  listProjectSessions: (cwd: string) => Promise<LocalSession[]>;
  // 返回是否真正执行（用户取消时为 false），调用方据此决定是否清空选择。
  deleteLocalSession: (session: LocalSession) => Promise<boolean>;
  deleteLocalSessions: (sessions: LocalSession[]) => Promise<boolean>;
  archiveLocalSessions: (sessions: LocalSession[], archived?: boolean) => Promise<boolean>;
  applyRelayInjection: () => Promise<boolean>;
  applyPureApiInjection: () => Promise<boolean>;
  clearRelayInjection: () => Promise<boolean>;
  saveRelayFile: (kind: "config" | "auth", contents: string, silent?: boolean) => Promise<void>;
  upsertContextEntry: (
    settings: BackendSettings,
    kind: ContextKind,
    id: string,
    tomlBody: string,
  ) => Promise<BackendSettings | null>;
  deleteContextEntry: (settings: BackendSettings, kind: ContextKind, id: string) => Promise<BackendSettings | null>;
  previewMcpServersJson: (json: string) => Promise<McpImportPreviewResult | null>;
  importMcpServersJson: (settings: BackendSettings, json: string) => Promise<BackendSettings | null>;
  extractRelayCommonConfig: (configContents: string) => Promise<ExtractRelayCommonConfigResult | null>;
  testRelayProfile: (profile: RelayProfile) => Promise<void>;
  diagnoseRelayProfile: (profile: RelayProfile) => Promise<ProviderDoctorResult | null>;
  fetchRelayProfileModels: (profile: RelayProfile) => Promise<string[] | null>;
  switchRelayProfile: (settings: BackendSettings, previousActiveRelayId?: string) => Promise<void>;
  relaySwitching: boolean;
  switchOfficialMode: () => Promise<void>;
  switchPureApiMode: () => Promise<void>;

  showMessage: (title: string, message: string, status?: Status) => Promise<void>;
};

function OverviewScreen({ overview, settings, actions }: {
  overview: OverviewResult | null;
  settings: SettingsResult | null;
  actions: Actions;
}) {
  const health = healthItems(overview);
  const savedCodexAppPath = settings?.settings.codexAppPath ?? "";
  return (
    <>
    <Panel>
            <CardHeader className="panel-head overview-health-header">
              <CardTitle>{t("健康检查")}</CardTitle>
              <div className="overview-health-header-actions">
                <CardDescription>{t("Codex 应用与本地运行状态")}</CardDescription>
                <Button
                  aria-label={t("刷新状态")}
                  title={t("刷新状态")}
                  size="icon"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => void actions.refreshCurrent()}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="health-grid overview-health-grid">
                <div className={`health-item ${overview?.codex_version ? "ok" : "needs-fix"}`}>
                  {overview?.codex_version ? <CheckCircle2 className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                  <div>
                    <strong>{t("Codex 版本")}</strong>
                    <span>{overview?.codex_version ?? t("未检测到 Codex 应用版本。")}</span>
                  </div>
                  <Badge status={overview?.codex_version ? "ok" : "not_checked"} />
                </div>
                {health.map((item) => (
                  <div className={`health-item ${item.ok ? "ok" : "needs-fix"}`} key={item.title}>
                    {item.ok ? <CheckCircle2 className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                    <div>
                      <strong>{item.title}</strong>
                      <span>{item.detail}</span>
                    </div>
                    <Badge status={item.status} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Panel>
      <Panel className="overview-app-path">
        <CardHead title={t("Codex 应用路径")} detail={t("免安装版或解包版只需要选择一次，之后从界面启动会自动复用")} />
        <CardContent>
          <div className="status-table">
            <StatusRow title={t("保存路径")} status={savedCodexAppPath ? "ok" : "not_checked"} path={savedCodexAppPath || null} />
            <StatusRow title={t("当前识别")} status={overview?.codex_app.status} path={overview?.codex_app.path} />
          </div>
          <Field label={t("保存的应用路径")}>
            <Input
              value={savedCodexAppPath}
              placeholder={t("选择 Codex.exe、Codex.app、app 目录或解包目录")}
              readOnly
            />
          </Field>
          <Toolbar>
            <Button disabled={!settings} onClick={() => void actions.chooseCodexAppPath("folder")}>
              <FolderOpen className="h-4 w-4" />
              {t("选择应用目录")}
            </Button>
            <Button disabled={!settings} variant="secondary" onClick={() => void actions.chooseCodexAppPath("file")}>
              <FileCode2 className="h-4 w-4" />
              {t("选择 Codex.exe")}
            </Button>
            <Button disabled={!settings} variant="secondary" onClick={() => void actions.clearCodexAppPath()}>
              <Trash2 className="h-4 w-4" />
              {t("清除保存路径")}
            </Button>
          </Toolbar>
        </CardContent>
      </Panel>
    </>
  );
}

function RelayScreen({
  settings: _settings,
  relayFiles,
  envConflicts,
  ccsProviders,
  form,
  actions,
}: {
  settings: SettingsResult | null;
  relayFiles: RelayFilesResult | null;
  envConflicts: EnvConflictsResult | null;
  ccsProviders: CcsProvidersResult | null;
  form: BackendSettings;
  actions: Actions;
}) {
  const normalized = normalizeSettings(form);
  const [detailProfileId, setDetailProfileId] = useState<string | null>(null);
  const [newProfileDraft, setNewProfileDraft] = useState<RelayProfile | null>(null);
  const [providerCatalogOpen, setProviderCatalogOpen] = useState(false);
  const [providerView, setProviderView] = useState<ProviderViewKind>("direct");
  const [newAggregateMode, setNewAggregateMode] = useState<AggregateMode | null>(null);
  const [thirdPartyImportOpen, setThirdPartyImportOpen] = useState(false);
  const thirdPartyImportTriggerRef = useRef<HTMLDivElement>(null);
  const [thirdPartyImportPosition, setThirdPartyImportPosition] = useState<{ top: number; right: number } | null>(null);
  const [ccsDbPathDraft, setCcsDbPathDraft] = useState(normalized.ccsDbPath);
  const [ccsPathSaving, setCcsPathSaving] = useState(false);
  const [ccsBindings, setCcsBindings] = useState<Record<string, string>>({});
  useEffect(() => setCcsDbPathDraft(normalized.ccsDbPath), [normalized.ccsDbPath]);
  const saveCcsDbPath = async (path = ccsDbPathDraft) => {
    setCcsPathSaving(true);
    try {
      const saved = await actions.saveSettingsValue({ ...normalized, ccsDbPath: path.trim() }, true);
      if (saved) await actions.refreshCcsProviders();
    } finally {
      setCcsPathSaving(false);
    }
  };
  const selectCcsDatabase = async () => {
    try {
      const selected = await open({
        title: t("选择 cc-switch 数据库"),
        multiple: false,
        directory: false,
        filters: [{ name: "SQLite", extensions: ["db", "sqlite", "sqlite3"] }],
      });
      const path = Array.isArray(selected) ? selected[0] : selected;
      if (path) {
        setCcsDbPathDraft(path);
        await saveCcsDbPath(path);
      }
    } catch (error) {
      await actions.showMessage(t("cc-switch 导入"), stringifyError(error), "failed");
    }
  };
  const detailProfile = newProfileDraft || (detailProfileId
    ? normalized.relayProfiles.find((profile) => profile.id === detailProfileId) || null
    : null);
  const isNewProfile = !!newProfileDraft;
  const saveRelaySettings = async (next: BackendSettings) => {
    return actions.saveSettingsValue(next, true);
  };
  const createNewAggregateProfile = (mode: AggregateMode) => {
    const draft = aggregateProfileForMode(createAggregateRelayProfile(normalized), normalized, mode);
    setDetailProfileId(null);
    setNewProfileDraft(draft);
    setNewAggregateMode(mode);
    if (!normalizeAggregateConfig(draft.aggregate, aggregateMemberCandidates(normalized.relayProfiles, draft.id)).members.length) {
      void actions.showMessage(
        t("创建聚合供应商"),
        t("已打开聚合供应商详情；请先添加或完善至少 1 个 API 供应商，或登录一个官方账号，再勾选为成员。"),
        "failed",
      );
    }
  };
  const visibleProfiles = normalized.relayProfiles.filter((profile) => (
    relayProviderView(profile) === providerView
  ));
  // 分区只在首次进入时自动选择；之后尊重用户点击，避免只有协议转换供应商时
  // 「直连」分页被强制弹回、看起来像切换按钮点不动（#2470/#2481/#2495）。
  const providerViewAutoSelectedRef = useRef(false);
  const selectProviderView = (view: ProviderViewKind) => {
    providerViewAutoSelectedRef.current = true;
    setProviderView(view);
  };
  useEffect(() => {
    // 协议转换供应商归入独立分区；首次打开时如果没有直连项，直接展示该分区。
    if (providerViewAutoSelectedRef.current) return;
    if (!normalized.relayProfiles.length) return;
    providerViewAutoSelectedRef.current = true;
    if (
      providerView === "direct"
      && !normalized.relayProfiles.some((profile) => relayProviderView(profile) === "direct")
      && normalized.relayProfiles.some((profile) => relayProviderView(profile) === "routing")
    ) {
      setProviderView("routing");
    }
  }, [normalized.relayProfiles, providerView]);
  // 分页仅控制渲染。卡片的删除、复制和排序必须基于完整配置，避免隐藏的
  // 当前供应商被 syncLegacyRelayFields 当成不存在，改写成直连列表第一项。
  const switchRelayProfileFromList = (profileId: string) => {
    const next = syncLegacyRelayFields({ ...normalized, activeRelayId: profileId });
    void actions.switchRelayProfile(next, normalized.activeRelayId);
  };
  const editRelayProfile = async (profileId: string) => {
    setNewProfileDraft(null);
    setDetailProfileId(
      normalized.relayProfiles.some((item) => item.id === profileId) ? profileId : null,
    );
  };
  useEffect(() => {
    if (!newProfileDraft && detailProfileId && !normalized.relayProfiles.some((profile) => profile.id === detailProfileId)) {
      setDetailProfileId(null);
    }
  }, [detailProfileId, newProfileDraft, normalized.relayProfiles]);
  useEffect(() => {
    if (!newProfileDraft && detailProfileId === normalized.activeRelayId) {
      void actions.refreshRelayFiles();
    }
  }, [detailProfileId, newProfileDraft, normalized.activeRelayId]);
  const openThirdPartyImport = () => {
    const next = !thirdPartyImportOpen;
    if (next) {
      // 菜单改为 fixed 定位：它原本挂在 .mg-content（overflow:auto）里，
      // 面板较矮时后半截会被裁掉（ccswitch 导入按钮、刷新列表都看不到）。
      const rect = thirdPartyImportTriggerRef.current?.getBoundingClientRect();
      setThirdPartyImportPosition(
        rect
          ? { top: Math.round(rect.bottom + 8), right: Math.round(Math.max(12, window.innerWidth - rect.right)) }
          : null,
      );
    }
    setThirdPartyImportOpen(next);
    if (!ccsProviders) void actions.refreshCcsProviders(true);
  };
  useEffect(() => {
    if (!thirdPartyImportOpen) return;
    const close = () => setThirdPartyImportOpen(false);
    // 菜单挂在 .mg-page（overflow:hidden）里，只能自己判定外点，不然点空白处收不起来。
    const handlePointerDown = (event: PointerEvent) => {
      if (thirdPartyImportTriggerRef.current?.contains(event.target as Node)) return;
      close();
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("resize", close);
    // capture 监听内层 .mg-content 的滚动。
    window.addEventListener("scroll", close, { capture: true, passive: true });
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, { capture: true });
    };
  }, [thirdPartyImportOpen]);
  if (detailProfile) {
    return (
      <RelayProfileDetail
        profile={detailProfile}
        relayFiles={!isNewProfile && detailProfile.id === normalized.activeRelayId ? relayFiles : null}
        form={normalized}
        isNew={isNewProfile}
        initialAggregateMode={isNewProfile ? newAggregateMode : null}
        onBack={() => {
          setNewProfileDraft(null);
          setNewAggregateMode(null);
          setDetailProfileId(null);
        }}
        onFormChange={saveRelaySettings}
        onSaved={() => {
          setNewProfileDraft(null);
          setNewAggregateMode(null);
          setDetailProfileId(null);
        }}
        actions={actions}
      />
    );
  }

  if (providerCatalogOpen) {
    return (
      <ProviderCatalogScreen
        form={normalized}
        onBack={() => setProviderCatalogOpen(false)}
        onSelect={(profile) => {
          setNewProfileDraft(profile);
          setNewAggregateMode(null);
          setProviderCatalogOpen(false);
        }}
      />
    );
  }

  return (
    <div className="mg-page relay-management-page">
      <PageHeader
        icon={<KeyRound className="h-5 w-5" />}
        title={t("供应商列表")}
        actions={(
          <Button onClick={() => { setNewProfileDraft(null); setDetailProfileId(null); setProviderCatalogOpen(true); }}>
            <Plus className="h-4 w-4" />
            {t("添加供应商")}
          </Button>
        )}
      />
      <div className="mg-content">
        <Panel className="relay-management-panel">
          <CardContent>
          <EnvConflictNotice envConflicts={envConflicts} actions={actions} />
          <label className="switch-row relay-master-switch">
            <input
              checked={normalized.relayProfilesEnabled}
              onChange={(event) => {
                const next = { ...normalized, relayProfilesEnabled: event.currentTarget.checked };
                void saveRelaySettings(next);
              }}
              type="checkbox"
            />
            <span>
              <strong>{t("启用供应商配置切换")}</strong>
              <small>{t("关闭后本工具不会在手动切换时写入 Codex 的 config.toml / auth.json；启动 Codex 时始终不会自动改这些文件。")}</small>
            </span>
            <ToggleVisual />
          </label>
          <div className="relay-add-row">
            <div className="third-party-import" ref={thirdPartyImportTriggerRef}>
              <Button
                onClick={openThirdPartyImport}
                variant="secondary"
              >
                <Download className="h-4 w-4" />
                {t("从第三方导入")}
              </Button>
              {thirdPartyImportOpen ? (
                <div
                  className="third-party-import-menu"
                  style={thirdPartyImportPosition
                    ? { position: "fixed", top: thirdPartyImportPosition.top, right: thirdPartyImportPosition.right }
                    : undefined}
                >
                  <label>
                    {t("cc-switch 数据库路径")}
                    <Input value={ccsDbPathDraft} onChange={(event) => setCcsDbPathDraft(event.currentTarget.value)} placeholder={t("留空使用默认路径")} />
                  </label>
                  <button disabled={ccsPathSaving} onClick={() => void selectCcsDatabase()} type="button">{t("选择数据库")}</button>
                  <button disabled={ccsPathSaving} onClick={() => void saveCcsDbPath()} type="button">{t("保存路径并刷新")}</button>
                  {ccsProviders && isSuccessStatus(ccsProviders.status) ? <span className="text-xs break-all">{t("实际来源")}：{ccsProviders.dbPath}</span> : null}
                  {ccsProviders?.fallbackReason ? <span className="text-xs break-all">{ccsProviders.fallbackReason}</span> : null}
                  {ccsProviders?.providers.map((provider) => <label key={provider.sourceId}>
                    {provider.name}
                    <select value={ccsBindings[provider.sourceId] || ""} onChange={(event) => setCcsBindings((current) => ({ ...current, [provider.sourceId]: event.currentTarget.value }))}>
                      <option value="">{t("自动识别来源或新增")}</option>
                      {normalized.relayProfiles.map((profile) => <option key={profile.id} value={profile.id}>{t("关联已有")}：{profile.name}</option>)}
                    </select>
                  </label>)}
                  <button
                    disabled={ccsPathSaving || ccsDbPathDraft.trim() !== normalized.ccsDbPath || !ccsProviders?.providers.length}
                    onClick={() => {
                      setThirdPartyImportOpen(false);
                      void actions.importCcsProviders(ccsBindings);
                    }}
                    type="button"
                  >
                    <strong>ccswitch</strong>
                    <span>{ccsProviderSummary(ccsProviders)}</span>
                  </button>
                  <button
                    onClick={() => void actions.refreshCcsProviders()}
                    type="button"
                  >
                    <RefreshCw className="h-4 w-4" />
                    {t("刷新列表")}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          <div className="provider-view-tabs" role="tablist" aria-label={t("供应商配置模式")}>
            <button aria-selected={providerView === "direct"} className={providerView === "direct" ? "active" : ""} onClick={() => selectProviderView("direct")} role="tab" title={t("直接访问 Responses API 供应商：只写入 Base URL 与 Key，不做协议转换。")} type="button">
              <Cable className="h-4 w-4" />
              <span>{t("直连")}</span>
              <CircleHelp className="provider-view-help" size={13} />
            </button>
            <button aria-selected={providerView === "modelAggregation"} className={providerView === "modelAggregation" ? "active" : ""} onClick={() => selectProviderView("modelAggregation")} role="tab" title={t("把成员模型合并到 Codex 模型列表，带供应商前缀的模型固定发送到对应成员。")} type="button">
              <Layers3 className="h-4 w-4" />
              <span>{t("模型聚合")}</span>
              <CircleHelp className="provider-view-help" size={13} />
            </button>
            <button aria-selected={providerView === "routing"} className={providerView === "routing" ? "active" : ""} onClick={() => selectProviderView("routing")} role="tab" title={t("供应商只支持 Chat Completions（或配置了模型路由）：由本地协议代理转换后转发。")} type="button">
              <GitBranch className="h-4 w-4" />
              <span>{t("需协议转换")}</span>
              <CircleHelp className="provider-view-help" size={13} />
            </button>
            <button aria-selected={providerView === "failover"} className={providerView === "failover" ? "active" : ""} onClick={() => selectProviderView("failover")} role="tab" title={t("多个供应商组成请求池，支持失败切换、会话轮转、请求轮转与权重；成员可以是 API 供应商或官方登录账号。")} type="button">
              <ArrowRightLeft className="h-4 w-4" />
              <span>{t("故障转移")}</span>
              <CircleHelp className="provider-view-help" size={13} />
            </button>
          </div>
          {providerView === "direct" && !visibleProfiles.length ? (
            <div className="provider-aggregate-empty">
              <strong>{t("这个分页还没有直连供应商")}</strong>
              <span>{t("直连分页只显示 Responses 直连且未配置模型路由的供应商；其他供应商在其余分页，配置不会丢失。")}</span>
              <Button onClick={() => { setNewProfileDraft(null); setDetailProfileId(null); setProviderCatalogOpen(true); }}>{t("添加供应商")}</Button>
            </div>
          ) : null}
          {providerView === "routing" && !visibleProfiles.length ? (
            <div className="provider-aggregate-empty">
              <strong>{t("这个分页还没有需协议转换的供应商")}</strong>
              <span>{t("Chat Completions 协议或配置了模型路由的供应商会显示在这里；其他供应商在其余分页。")}</span>
              <Button onClick={() => { setNewProfileDraft(null); setDetailProfileId(null); setProviderCatalogOpen(true); }}>{t("添加供应商")}</Button>
            </div>
          ) : null}
          {providerView === "failover" && !visibleProfiles.length ? (
            <div className="provider-aggregate-empty">
              <strong>{t("还没有故障转移配置")}</strong>
              <span>{t("在编辑页勾选成员供应商，并选择失败切换、轮转或权重策略。")}</span>
              <Button onClick={() => createNewAggregateProfile("provider")}>{t("创建故障转移配置")}</Button>
            </div>
          ) : null}
          {providerView === "modelAggregation" && !visibleProfiles.length ? (
            <div className="provider-aggregate-empty">
              <strong>{t("还没有模型聚合配置")}</strong>
              <span>{t("把成员模型合并到 Codex 列表，选中模型会固定发送到对应供应商。")}</span>
              <Button onClick={() => createNewAggregateProfile("model")}>{t("创建模型聚合配置")}</Button>
            </div>
          ) : null}
          {(providerView === "failover" || providerView === "modelAggregation") && visibleProfiles.length ? (
            <div className="provider-aggregate-toolbar">
              <Button
                onClick={() => createNewAggregateProfile(providerView === "failover" ? "provider" : "model")}
                size="sm"
                variant="secondary"
              >
                <Plus className="h-4 w-4" />
                {providerView === "failover" ? t("新建故障转移") : t("新建模型聚合")}
              </Button>
            </div>
          ) : null}
          <RelayProfileList
            form={normalized}
            visibleProfiles={visibleProfiles}
            onEdit={(profileId) => void editRelayProfile(profileId)}
            onFormChange={saveRelaySettings}
            onSwitchProfile={switchRelayProfileFromList}
            disabled={actions.relaySwitching}
            actions={actions}
          />
          </CardContent>
        </Panel>
      </div>
    </div>
  );
}

function ProviderCatalogScreen({
  form,
  onBack,
  onSelect,
}: {
  form: BackendSettings;
  onBack: () => void;
  onSelect: (profile: RelayProfile) => void;
}) {
  const [query, setQuery] = useState("");
  const categories: Array<{ id: ProviderPreset["category"]; label: string }> = [
    { id: "official", label: t("账号登录") },
    { id: "cn_official", label: t("模型厂商") },
    { id: "aggregator", label: t("聚合/中转") },
    { id: "third_party", label: t("第三方平台") },
  ];
  const filteredPresets = PRESETS.filter((preset) => {
    const haystack = `${preset.name} ${preset.baseUrl} ${preset.model}`.toLowerCase();
    return !query.trim() || haystack.includes(query.trim().toLowerCase());
  });
  const selectPreset = (preset?: ProviderPreset) => {
    const draft = createRelayProfile(form);
    const patch = preset ? createPresetPatch(preset) : { name: t("自定义供应商") };
    onSelect(applyRelayProfilePatchToFiles(draft, patch as unknown as Partial<RelayProfile>, { allowGenerateFiles: true }));
  };
  return (
    <div className="provider-catalog-screen provider-add-simple">
      <header className="provider-catalog-header" data-tauri-drag-region>
        <Button onClick={onBack} size="icon" variant="ghost" title={t("返回供应商列表")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h2>{t("添加新供应商")}</h2>
        <span>Codex</span>
      </header>
      <main className="provider-add-simple-body provider-add-reference-layout">
        <div className="provider-add-search">
          <Search className="h-4 w-4" />
          <Input
            aria-label={t("搜索供应商")}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder={t("搜索名称或网址，例如 kimi、智谱、openrouter")}
            value={query}
          />
        </div>
        <div className="provider-add-results">
          <button className="provider-add-result provider-add-custom-result" onClick={() => selectPreset()} type="button">
            <span className="provider-add-icon">✦</span>
            <span><strong>{t("自定义配置")}</strong><small>{t("手动填写请求地址和 API Key")}</small></span>
          </button>
        </div>
        {categories.map((category) => {
          const presets = filteredPresets.filter((preset) => preset.category === category.id);
          if (!presets.length) return null;
          return (
            <section className="provider-add-section" key={category.id}>
              <h3>{category.label}</h3>
              <div className="provider-add-results">
                {presets.map((preset) => (
                  <button className="provider-add-result" key={preset.id} onClick={() => selectPreset(preset)} type="button">
                    <span className="provider-add-icon">{preset.name.slice(0, 1).toUpperCase()}</span>
                    <span><strong>{preset.name}</strong><small>{preset.websiteUrl ? new URL(preset.websiteUrl).host : preset.baseUrl}</small></span>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
        {!filteredPresets.length ? <div className="empty">{t("没有匹配的供应商")}</div> : null}
        <p className="provider-add-hint">{t("选择供应商后会进入编辑页；API Key 和本地配置只在保存时写入当前 Codex。")}</p>
      </main>
    </div>
  );
}

function EnvConflictNotice({
  envConflicts,
  actions,
}: {
  envConflicts: EnvConflictsResult | null;
  actions: Actions;
}) {
  const conflicts = envConflicts?.conflicts ?? [];
  if (!conflicts.length) return null;
  const names = Array.from(new Set(conflicts.map((conflict) => conflict.name))).sort();
  return (
    <div className="env-conflict-notice">
      <div className="env-conflict-icon">
        <ShieldAlert className="h-4 w-4" />
      </div>
      <div className="env-conflict-body">
        <strong>{t("检测到 OPENAI 环境变量")}</strong>
        <p>{t("这些变量可能覆盖当前供应商写入的 config.toml / auth.json；CODEX_HOME 不会被清理。")}</p>
        <div className="env-conflict-tags">
          {conflicts.map((conflict) => (
            <span key={`${conflict.source}-${conflict.name}`}>
              {conflict.name}
              <small>{envConflictSourceLabel(conflict.source)}</small>
            </span>
          ))}
        </div>
      </div>
      <div className="env-conflict-actions">
        <Button onClick={() => void actions.removeEnvConflicts(names)} size="sm">
          <Trash2 className="h-4 w-4" />
          {t("删除")}
        </Button>
        <Button onClick={() => void actions.refreshEnvConflicts(false)} size="sm" variant="secondary">
          <RefreshCw className="h-4 w-4" />
          {t("检测")}
        </Button>
      </div>
    </div>
  );
}

function envConflictSourceLabel(source: string): string {
  if (source === "process") return t("当前进程");
  if (source === "user") return t("用户环境");
  return source || t("环境变量");
}

function EnhanceScreen({
  dirty,
  form,
  onFormChange,
  actions,
}: {
  dirty: boolean;
  form: BackendSettings;
  onFormChange: (value: BackendSettings) => void;
  actions: Actions;
}) {
  const setEnhanceFlag = (key: keyof BackendSettings, value: boolean) => onFormChange({ ...form, [key]: value });
  const masterEnabled = form.enhancementsEnabled;
  return (
    <div className="settings-page enhance-page">
      <div className="enhance-page-controls" id="enhance-page-controls">
        <div className="enhance-page-toolbar">
          <label className="switch-row compact enhance-master-switch">
            <input
              checked={form.enhancementsEnabled}
              onChange={(event) => onFormChange({ ...form, enhancementsEnabled: event.currentTarget.checked })}
              type="checkbox"
            />
            <span>
              <strong>{t("启用 Codex增强")}</strong>
              <small>{t("关闭后暂停增强功能，服务配置会保留。")}</small>
            </span>
            <ToggleVisual />
          </label>
          <div className="enhance-save-actions">
            <span className={dirty ? "is-dirty" : ""} role="status">{dirty ? t("有未保存修改") : t("已保存")}</span>
            <Button disabled={!dirty} onClick={() => void actions.saveSettings()}>
              <Save className="h-4 w-4" />
              {t("保存增强设置")}
            </Button>
          </div>
        </div>
      </div>
      <div className="enhance-general">
        <Panel className="enhance-panel">
          <CardContent className="enhance-content">
            <div className="feature-switch-grid enhance-switch-grid">
              <FeatureToggle title={t("插件市场解锁")} detail={t("API Key 模式下扩展插件市场请求，尽量显示完整插件列表；官方/混合模式通常不需要。")} checked={form.codexAppPluginMarketplaceUnlock} disabled={!masterEnabled} onChange={(value) => setEnhanceFlag("codexAppPluginMarketplaceUnlock", value)} />
            </div>
          </CardContent>
        </Panel>
      </div>
    </div>
  );
}

function SessionRepairPanel({ form, providerSyncProgress, sessionIndexRepairActive, sessionIndexRepairReport, sessionIndexRepairReportError, providerSyncTargets, selectedProviderSyncTarget, onFormChange, actions }: {
  form: BackendSettings;
  providerSyncProgress: ProviderSyncProgress;
  sessionIndexRepairActive: boolean;
  sessionIndexRepairReport: SessionIndexRepairReport | null;
  sessionIndexRepairReportError: string | null;
  providerSyncTargets: ProviderSyncTargetsResult | null;
  selectedProviderSyncTarget: string;
  onFormChange: (value: BackendSettings) => void;
  actions: Actions;
}) {
  const providerTargets = providerSyncTargets?.targets ?? [];
  const selectedProviderTarget = providerTargets.find((target) => target.id === selectedProviderSyncTarget);
  const canRepairProviderSessions = Boolean(selectedProviderTarget && isProviderSyncTargetSelectable(selectedProviderTarget));
  const maintenanceBusy = providerSyncProgress.active || sessionIndexRepairActive;
  const maintenanceHasError = Boolean(
    sessionIndexRepairReportError
    || providerSyncProgress.result?.status === "failed"
    || providerSyncProgress.result?.syncStatus === "partial_failure"
    || providerSyncProgress.result?.recoveryErrors?.length
    || sessionIndexRepairReport?.abortedReason
    || sessionIndexRepairReport?.warnings?.length,
  );
  const maintenanceNeedsAttention = maintenanceBusy || maintenanceHasError;
  const [maintenanceExpanded, setMaintenanceExpanded] = useState(maintenanceNeedsAttention);

  useEffect(() => {
    if (maintenanceNeedsAttention) setMaintenanceExpanded(true);
  }, [maintenanceNeedsAttention, providerSyncProgress.active, sessionIndexRepairActive, sessionIndexRepairReportError]);

  return <details
    className="session-maintenance"
    open={maintenanceExpanded}
    onToggle={(event) => setMaintenanceExpanded(event.currentTarget.open)}
  >
    <summary className="session-maintenance-summary">
      <Wrench aria-hidden="true" className="h-4 w-4" />
      <strong>{t("修复与维护")}</strong>
      <span className="session-maintenance-auto-state" data-enabled={form.providerSyncEnabled}>
        {form.providerSyncEnabled ? t("自动修复已开启") : t("自动修复已关闭")}
      </span>
      <span className="session-maintenance-status" data-error={maintenanceHasError} role="status" aria-live="polite">
        {providerSyncProgress.active
          ? <>{t("正在修复历史会话")} {formatProgressPercent(providerSyncProgress.percent)}%</>
          : sessionIndexRepairActive
            ? t("正在检查索引…")
            : maintenanceHasError ? t("需要处理") : null}
      </span>
      <ChevronDown aria-hidden="true" className="session-maintenance-chevron h-4 w-4" />
    </summary>
    <div className="session-maintenance-content">
          <div className="session-repair-tools">
            <Field className="session-sync-target" label={t("同步目标")}>
              <AppSelect
                disabled={providerSyncProgress.active || !providerTargets.length}
                value={selectedProviderSyncTarget}
                onChange={(value) => actions.setProviderSyncTarget(value)}
                options={
                  providerTargets.length
                    ? [
                        ...(!selectedProviderSyncTarget
                          ? [{ value: "", label: t("当前配置 provider"), disabled: true }]
                          : []),
                        ...providerTargets.map((target) => ({
                          value: target.id,
                          label: `${target.id}${t("（")}${providerSyncTargetLabel(target)}${t("）")}`,
                          disabled: !isProviderSyncTargetSelectable(target),
                          title: target.unavailableReason ?? undefined,
                        })),
                      ]
                    : [{ value: "", label: t("当前配置 provider"), disabled: true }]
                }
              />
            </Field>

            <label className="switch-row compact session-auto-repair">
              <input
                checked={form.providerSyncEnabled}
                onChange={(event) => onFormChange({ ...form, providerSyncEnabled: event.currentTarget.checked })}
                type="checkbox"
              />
              <span>
                <strong>{t("启动前自动修复历史会话")}</strong>
                <small>{t("启动前整理会话归属并检查缺失消息；运行期间每 30 分钟复查索引。保存设置后生效。")}</small>
              </span>
              <ToggleVisual />
            </label>

            <div className="session-repair-actions">
              <Button
                disabled={providerSyncProgress.active || sessionIndexRepairActive || !canRepairProviderSessions}
                onClick={() => void actions.syncProvidersNow()}
                variant="outline"
              >
                <Wrench className="h-4 w-4" />
                {providerSyncProgress.active ? t("正在修复…") : t("修复历史会话")}
              </Button>
              <Button
                disabled={sessionIndexRepairActive || providerSyncProgress.active}
                onClick={() => void actions.repairSessionIndex()}
                variant="outline"
              >
                <Wrench className="h-4 w-4" />
                {sessionIndexRepairActive ? t("正在检查索引…") : t("修复会话索引")}
              </Button>
              <Button onClick={() => void actions.saveSettings()}>
                <Save className="h-4 w-4" />
                {t("保存设置")}
              </Button>
            </div>
          </div>

          {providerSyncProgress.active || providerSyncProgress.percent > 0 ? (
            <div className="provider-sync-progress session-repair-progress" data-active={providerSyncProgress.active}>
              <div className="provider-sync-progress-head">
                <strong>{providerSyncProgress.active ? t("正在修复历史会话") : t("历史会话修复进度")}</strong>
                <span>{formatProgressPercent(providerSyncProgress.percent)}%</span>
              </div>
              <div
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={providerSyncProgress.percent}
                className="provider-sync-progress-bar"
                role="progressbar"
              >
                <div className="provider-sync-progress-fill" style={{ width: `${providerSyncProgress.percent}%` }} />
              </div>
              <small>{providerSyncProgress.message}</small>
            </div>
          ) : null}

          {sessionIndexRepairActive ? (
            <p role="status">{t("正在检查全部会话并恢复高可信缺失消息，首次检查可能需要较长时间…")}</p>
          ) : null}
          {sessionIndexRepairReportError ? (
            <p role="alert" className="break-all">{sessionIndexRepairReportError}</p>
          ) : null}
          {sessionIndexRepairReport ? (
            <div className="provider-sync-progress session-repair-progress" aria-live="polite">
              <strong>{t("最近一次会话索引修复报告")}</strong>
              <p>{t("最后检查：")}{sessionIndexRepairReport.checkedAtMs ? formatTime(sessionIndexRepairReport.checkedAtMs) : t("旧版报告未记录时间")}</p>
              <p>
                {t("读取文件")} {sessionIndexRepairReport.scannedFiles} · {t("复用缓存")} {sessionIndexRepairReport.cachedFiles} · {t("耗时")} {(sessionIndexRepairReport.elapsedMs / 1000).toFixed(1)} s
              </p>
              <p>
                {t("恢复消息")} {sessionIndexRepairReport.repairedItems} · {t("已存在")} {sessionIndexRepairReport.alreadyPresent} · {t("短暂等待")} {sessionIndexRepairReport.deferredItems ?? 0} · {t("需核查")} {sessionIndexRepairReport.skippedItems}
              </p>
              <small>{t("仅恢复有本地原文且可确认位置的消息；已打开的会话可能需要重新打开才能显示。")}</small>
              <p><small>{t("自动检查需要从此界面启动 Codex，并保持 Codex++ 运行，且自动修复开关已开启并保存；每次检查完成后间隔 30 分钟复查。此页面每 15 秒刷新报告，不会单独启动修复；再次检查不保证恢复。")}</small></p>
              <p><small>{t("短暂等待最长 30 分钟；原文和记录文件都已超过 24 小时未更新的项目直接转入需核查。缺少对应轮次或结束状态，当前证据不足以安全补回；后续检查仍会核验。")}</small></p>
              {sessionIndexRepairReport.backupPath ? <p className="break-all">{t("修复前备份：")}{sessionIndexRepairReport.backupPath}</p> : null}
              {sessionIndexRepairReport.abortedReason ? (
                <p role="alert" className="break-all"><strong>{t("修复已中止：")}</strong>{sessionIndexRepairReport.abortedReason}</p>
              ) : null}
              {sessionIndexRepairReport.warnings?.map((warning, index) => (
                <p key={index} role="alert" className="break-all"><strong>{t("修复警告：")}</strong>{warning}</p>
              ))}
              {sessionIndexRepairReport.pendingDetails?.length ? (
                <details>
                  <summary>{t("等待与持续无法恢复详情")} ({sessionIndexRepairReport.pendingDetails.length})</summary>
                  <ul>
                    {sessionIndexRepairReport.pendingDetails.map((item, index) => (
                      <li key={`${item.threadId}-${item.turnId}-${index}`} className="break-all my-3">
                        <strong>{item.state === "waiting" ? t("短暂等待") : t("持续无法恢复")}</strong>
                        <p>{t("任务 ID：")}{item.threadId ?? "—"} · {t("轮次 ID：")}{item.turnId ?? "—"}</p>
                        <p>{t("原因：")}{item.reason}</p>
                        <small>{t("首次发现：")}{formatTime(item.firstSeenAtMs)} · {t("最后检查：")}{formatTime(item.lastCheckedAtMs)} · {t("检查次数：")}{item.checks}</small>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
              {sessionIndexRepairReport.issues.length ? (
                <details>
                  <summary>{t("查看检查详情")} ({sessionIndexRepairReport.issues.length})</summary>
                  <ul>{sessionIndexRepairReport.issues.map((issue, index) => <li key={index} className="break-all">{issue}</li>)}</ul>
                </details>
              ) : null}
              {sessionIndexRepairReport.issuesTruncated ? (
                <p><small>{tf("另有 {0} 条检查详情因报告上限未显示。", [sessionIndexRepairReport.issuesTruncated])}</small></p>
              ) : null}
            </div>
          ) : null}

    {providerSyncProgress.result?.recoveryJournalPath ? <div>
      {!providerSyncProgress.active && providerSyncProgress.percent === 0 ? <p role="alert">{providerSyncProgress.message}</p> : null}
      <p role="alert" className="break-all">{t("恢复记录：")}{providerSyncProgress.result.recoveryJournalPath}</p>
      {providerSyncProgress.result.syncStatus === "partial_failure" && providerSyncProgress.result.backupDir && providerSyncProgress.result.recoveryAvailable !== false ? <Button
        disabled={providerSyncProgress.active || sessionIndexRepairActive}
        onClick={() => void actions.recoverProviderSync()}>{t("恢复未完成修复")}</Button> : null}
    </div> : null}
    {providerSyncProgress.result?.recoveryErrors?.map((error, index) => <p role="alert" key={index}>{error}</p>)}
    {providerSyncProgress.result?.syncStatus === "partial_failure" && Boolean(providerSyncProgress.result.databaseOutcomes?.length || (providerSyncProgress.result.changedSessionFiles ?? 0) > 0 || (providerSyncProgress.result.sqliteRowsUpdated ?? 0) > 0) ? <p role="status">
      {t("仍有改动：")}{providerSyncProgress.result.changedSessionFiles ?? 0} {t("个会话文件，")}
      {providerSyncProgress.result.sqliteRowsUpdated ?? 0} {t("行索引。请查看恢复记录处理剩余冲突。")}
    </p> : null}
    </div>
  </details>;
}

function SessionsScreen({
  settings,
  form,
  sessions,
  providerSyncProgress,
  sessionIndexRepairActive,
  sessionIndexRepairReport,
  sessionIndexRepairReportError,
  providerSyncTargets,
  selectedProviderSyncTarget,
  onFormChange,
  actions,
}: {
  settings: SettingsResult | null;
  form: BackendSettings;
  sessions: LocalSessionsResult | null;
  providerSyncProgress: ProviderSyncProgress;
  sessionIndexRepairActive: boolean;
  sessionIndexRepairReport: SessionIndexRepairReport | null;
  sessionIndexRepairReportError: string | null;
  providerSyncTargets: ProviderSyncTargetsResult | null;
  selectedProviderSyncTarget: string;
  onFormChange: (value: BackendSettings) => void;
  actions: Actions;
}) {
  const items = sessions?.sessions ?? [];
  const pageOffset = sessions?.offset ?? 0;
  const pageSize = sessions?.limit ?? 50;
  const currentPage = Math.floor(pageOffset / pageSize) + 1;
  const hasPreviousPage = pageOffset > 0;
  const hasNextPage = sessions?.hasMore === true;
  const activeCount = items.filter((item) => !item.archived).length;
  const archivedCount = items.length - activeCount;
  const totalCount = sessions?.totalCount ?? items.length;
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(() => new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const selectedSessions = useMemo(() => items.filter((session) => selectedSessionIds.has(session.id)), [items, selectedSessionIds]);
  const selectedCount = selectedSessions.length;
  const allSelected = items.length > 0 && selectedCount === items.length;
  const providerTargets = providerSyncTargets?.targets ?? [];
  const selectedProviderTarget = providerTargets.find(
    (target) => target.id === selectedProviderSyncTarget,
  );
  const canRepairProviderSessions = selectedProviderTarget
    ? isProviderSyncTargetSelectable(selectedProviderTarget)
    : false;

  useEffect(() => {
    const itemIds = new Set(items.map((session) => session.id));
    setSelectedSessionIds((current) => {
      const next = new Set(Array.from(current).filter((id) => itemIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [items]);

  const toggleSessionSelection = (sessionId: string, checked: boolean) => {
    setSelectedSessionIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(sessionId);
      } else {
        next.delete(sessionId);
      }
      return next;
    });
  };

  const selectAllSessions = () => {
    setSelectionMode(true);
    setSelectedSessionIds(new Set(items.map((session) => session.id)));
  };

  const clearSelectedSessions = () => setSelectedSessionIds(new Set());

  const deleteSelectedSessions = async () => {
    if (!selectionMode) {
      setSelectionMode(true);
      return;
    }
    setBulkDeleting(true);
    try {
      await actions.deleteLocalSessions(selectedSessions);
    } finally {
      setBulkDeleting(false);
    }
  };

  return (
    <>
      <Panel className="sessions-overview-panel">
        <CardHead title={t("会话管理")} detail={t("读取 Codex 本地 SQLite 会话库，会删除数据库记录和对应 rollout 文件")} />
        <CardContent className="sessions-overview-content">
          <div className="session-summary-bar">
            <div>
              <span>{t("会话总数")}</span>
              <strong>{tf("{0} 个", [totalCount])}</strong>
            </div>
            <div>
              <span>{t("当前页会话")}</span>
              <strong>{tf("{0} 个", [items.length])}</strong>
            </div>
            <div>
              <span>{t("当前页未归档")}</span>
              <strong>{tf("{0} 个", [activeCount])}</strong>
            </div>
            <div>
              <span>{t("当前页已归档")}</span>
              <strong>{tf("{0} 个", [archivedCount])}</strong>
            </div>
            <div className="session-summary-path">
              <span>{t("数据库")}</span>
              <code>{sessions?.dbPath ?? "~/.codex/sqlite/*.db"}</code>
            </div>
          </div>

          <SessionRepairPanel form={form} providerSyncProgress={providerSyncProgress} sessionIndexRepairActive={sessionIndexRepairActive} sessionIndexRepairReport={sessionIndexRepairReport} sessionIndexRepairReportError={sessionIndexRepairReportError} providerSyncTargets={providerSyncTargets} selectedProviderSyncTarget={selectedProviderSyncTarget} onFormChange={onFormChange} actions={actions} />
        </CardContent>
      </Panel>
      <Panel className="sessions-list-panel">
        <CardHead
          title={t("本地会话")}
          detail={sessions ? tf("第 {0} 页，每页最多 {1} 条，按更新时间倒序显示", [currentPage, pageSize]) : t("点击刷新会话读取本地数据库")}
        />
        <CardContent className="session-list-content">
          {items.length ? (
            <>
              <div className="session-list-toolbar">
                <span className="session-selection-summary">{t("已选择")} {selectedCount} / {items.length} {t("个会话")}</span>
                <div className="session-selection-actions">
                  <Button disabled={allSelected || bulkDeleting} onClick={selectAllSessions} size="sm" variant="outline">
                    {t("全选当前列表")}
                  </Button>
                  <Button disabled={!selectedCount || bulkDeleting} onClick={clearSelectedSessions} size="sm" variant="outline">
                    {t("清空选择")}
                  </Button>
                  <Button disabled={(selectionMode && !selectedCount) || bulkDeleting} onClick={() => void deleteSelectedSessions()} size="sm" variant="outline">
                    {selectionMode ? <Trash2 className="h-4 w-4" /> : null}
                    {selectionMode ? (bulkDeleting ? t("正在删除…") : t("删除已选")) : t("多选")}
                  </Button>
                </div>
              </div>
              <div className="session-list">
                {items.map((session) => {
                  const selected = selectedSessionIds.has(session.id);
                  return (
                    <div className="session-row" data-selection-mode={selectionMode} data-selected={selected} key={session.id}>
                      {selectionMode ? (
                        <label className="session-select" title={t("选择会话")}>
                          <input
                            aria-label={tf("选择会话 {0}", [session.title || session.id])}
                            checked={selected}
                            onChange={(event) => toggleSessionSelection(session.id, event.currentTarget.checked)}
                            type="checkbox"
                          />
                        </label>
                      ) : null}
                      <div className="session-main">
                        <strong>{session.title || t("未命名会话")}</strong>
                        <span>{session.id}</span>
                        <small>{session.cwd || t("未记录项目路径")}</small>
                      </div>
                      <div className="session-meta">
                        <Badge status={session.archived ? "archived" : "ok"} />
                        <span>{session.modelProvider || t("provider 未记录")}</span>
                        <span>{formatTime(session.updatedAtMs ?? 0)}</span>
                      </div>
                      <Button className="session-delete-button" variant="outline" onClick={() => void actions.deleteLocalSession(session)}>
                        <Trash2 className="h-4 w-4" />
                        {t("删除")}
                      </Button>
                    </div>
                  );
                })}
              </div>
              <div className="session-pagination">
                <Button
                  aria-label={t("上一页")}
                  disabled={!hasPreviousPage || bulkDeleting}
                  onClick={() => void actions.refreshLocalSessions(true, Math.max(0, pageOffset - pageSize))}
                  size="icon"
                  title={t("上一页")}
                  variant="outline"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <span>{tf("第 {0} 页", [currentPage])}</span>
                <Button
                  aria-label={t("下一页")}
                  disabled={!hasNextPage || bulkDeleting}
                  onClick={() => void actions.refreshLocalSessions(true, pageOffset + pageSize)}
                  size="icon"
                  title={t("下一页")}
                  variant="outline"
                >
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </>
          ) : (
            <div className="empty">{t("未读取到本地会话，或当前 SQLite 会话库不存在。")}</div>
          )}
        </CardContent>
      </Panel>
    </>
  );
}

function RelayProfileList({
  form,
  visibleProfiles = form.relayProfiles,
  onFormChange,
  onEdit,
  onSwitchProfile,
  disabled = false,
  actions,
}: {
  form: BackendSettings;
  visibleProfiles?: RelayProfile[];
  onFormChange: (value: BackendSettings) => void;
  onEdit: (id: string) => void;
  onSwitchProfile: (id: string) => void;
  disabled?: boolean;
  actions: Actions;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const next = reorderRelayProfiles(form, String(active.id), String(over.id));
    if (next !== form) onFormChange(next);
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={visibleProfiles.map((profile) => profile.id)} strategy={verticalListSortingStrategy}>
        <div className="relay-profile-list">
          {visibleProfiles.map((profile, index) => (
            <SortableRelayProfileCard
              actions={actions}
              form={form}
              index={index}
              key={profile.id}
              onEdit={onEdit}
              onFormChange={onFormChange}
              onSwitchProfile={onSwitchProfile}
              disabled={disabled}
              profile={profile}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableRelayProfileCard({
  form,
  profile,
  index,
  onFormChange,
  onEdit,
  onSwitchProfile,
  disabled = false,
  actions,
}: {
  form: BackendSettings;
  profile: RelayProfile;
  index: number;
  onFormChange: (value: BackendSettings) => void;
  onEdit: (id: string) => void;
  onSwitchProfile: (id: string) => void;
  disabled?: boolean;
  actions: Actions;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: profile.id });
  const active = profile.id === form.activeRelayId;
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      className={`relay-profile-card ${active ? "active" : ""} ${isDragging ? "dragging" : ""}`}
      data-relay-profile-id={profile.id}
      key={profile.id}
      onKeyDown={(event) => {
        if (event.key === "Enter") onEdit(profile.id);
      }}
      ref={setNodeRef}
      style={style}
      tabIndex={0}
    >
      <button
        aria-label={t("拖动排序")}
        className="relay-drag"
        title={t("拖动排序")}
        type="button"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="relay-index" title={profile.name || t("未命名供应商")}>
        {providerInitial(profile.name)}
      </span>
      <span className="relay-summary">
        <strong>{profile.name || t("未命名供应商")}</strong>
        <small>{relayProfileModeLabel(profile)} · {relayProtocolLabel(profile.protocol)} · {relayProfileConfigBrief(profile)}</small>
      </span>
      <span className="relay-card-actions">
        <Button
          className={`relay-use-button ${active ? "active" : ""}`}
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            if (disabled) return;
            onSwitchProfile(profile.id);
          }}
          size="sm"
          title={
            disabled
              ? t("供应商切换中")
              : !form.relayProfilesEnabled
                ? t("供应商配置总开关已关闭，点击后按提示开启")
                : active
                  ? t("当前正在使用")
                  : t("设为当前")
          }
          variant={active ? "secondary" : "outline"}
        >
          <CheckCircle2 className="h-4 w-4" />
          {active ? t("使用中") : t("使用")}
        </Button>
        <span className="relay-card-extra">

          <Button
            disabled={isAggregateRelayProfile(profile)}
            onClick={(event) => {
              event.stopPropagation();
              if (isAggregateRelayProfile(profile)) return;
              void actions.testRelayProfile(profile);
            }}
            size="icon"
            title={isAggregateRelayProfile(profile) ? t("聚合供应商会在真实对话中轮转成员，请测试成员供应商") : t("发送 hi 测试")}
            variant="ghost"
          >
            <TestTube className="h-4 w-4" />
          </Button>
          <Button
            onClick={(event) => {
              event.stopPropagation();
              onEdit(profile.id);
            }}
            size="icon"
            title={t("编辑")}
            variant="ghost"
          >
            <Edit3 className="h-4 w-4" />
          </Button>
          <Button
            onClick={(event) => {
              event.stopPropagation();
              onFormChange(duplicateRelayProfile(form, profile.id));
            }}
            size="icon"
            title={t("复制")}
            variant="ghost"
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            disabled={form.relayProfiles.length <= 1}
            onClick={(event) => {
              event.stopPropagation();
              const deleteIssue = relayProfileDeleteIssue(form, profile.id);
              if (deleteIssue) {
                void actions.showMessage(t("删除供应商"), deleteIssue, "failed");
                return;
              }
              onFormChange(removeRelayProfile(form, profile.id));
            }}
            size="icon"
            title={t("删除供应商")}
            variant="ghost"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </span>
      </span>
    </div>
  );
}

function RelayProfileDetail({
  profile,
  relayFiles,
  form,
  isNew = false,
  initialAggregateMode = null,
  onBack,
  onFormChange,
  onSaved,
  actions,
}: {
  profile: RelayProfile;
  relayFiles: RelayFilesResult | null;
  form: BackendSettings;
  isNew?: boolean;
  initialAggregateMode?: AggregateMode | null;
  onBack: () => void;
  onFormChange: (value: BackendSettings) => Promise<BackendSettings | null>;
  onSaved?: () => void;
  actions: Actions;
}) {
  const [draft, setDraft] = useState<RelayProfile>(profile);
  const [modelWindowRows, setModelWindowRows] = useState<ModelWindowRow[]>(
    modelWindowRowsFromProfile(profile.modelList, profile.modelWindows || "", profile.modelVlm, profile.modelAutoCompact),
  );
  const [doctorResult, setDoctorResult] = useState<ProviderDoctorResult | null>(null);
  const [doctorOpen, setDoctorOpen] = useState(false);
  const [doctorRunning, setDoctorRunning] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [aggregateMode, setAggregateMode] = useState<AggregateMode | null>(() => {
    if (!isAggregateRelayProfile(profile)) return null;
    if (!isNew) return profile.aggregate?.modelAggregationEnabled === true ? "model" : "provider";
    // 从「故障转移 / 模型聚合」分页进入时类型已确定，不再弹选择器。
    return initialAggregateMode ?? null;
  });
  const isActive = !isNew && profile.id === form.activeRelayId;
  const profileUsesLiveFiles = relayProfileUsesLiveFiles(profile);
  // 只有当前供应商才从 live 文件回填；非当前供应商时不能把 relayFiles 当依赖——
  // live 文件一变就会重建整份模型行，编辑中的增删被无声撤销（保存后看起来「没生效」）。
  const liveConfigContents = isActive && profileUsesLiveFiles ? relayFiles?.configContents ?? "" : "";
  const liveAuthContents = isActive && profileUsesLiveFiles ? relayFiles?.authContents ?? "" : "";
  // 行编辑守卫：编辑器里还有未保存的模型行改动时，外部变化（元数据、live 文件、别处保存设置
  // 触发的重渲染）不许把用户的增删覆盖回已保存列表。
  const unsavedRowEditsRef = useRef(false);
  const lastDetailProfileIdRef = useRef(profile.id);
  useEffect(() => {
    const useLiveFiles = isActive && profileUsesLiveFiles && relayFiles;
    const liveDraft = isAggregateRelayProfile(profile)
      ? normalizeAggregateRelayProfile(profile, form)
      : deriveRelayProfileFromFiles(
          useLiveFiles
            ? {
              ...profile,
              configContents: relayFiles.configContents,
              authContents: relayAuthForLiveDraft(profile, relayFiles.authContents),
            }
            : profile,
        );
    const storedApiKey = useLiveFiles ? profile.apiKey.trim() : "";
    const nextDraft = useLiveFiles && !isAggregateRelayProfile(liveDraft)
      ? applyRelayProfilePatchToFiles(liveDraft, { apiKey: storedApiKey })
      : liveDraft;
    setDraft(nextDraft);
    const switchedProfile = lastDetailProfileIdRef.current !== profile.id;
    lastDetailProfileIdRef.current = profile.id;
    if (switchedProfile || !unsavedRowEditsRef.current) {
      setModelWindowRows(modelWindowRowsFromProfile(nextDraft.modelList, nextDraft.modelWindows || "", nextDraft.modelVlm, nextDraft.modelAutoCompact));
    }
    // 依赖里刻意不放 profile.modelMetadata / 原始 relayFiles：元数据改动是本编辑器自己触发的
    // （删行会清该模型元数据），把它当依赖会让「删行 → 清元数据 → 重建行」把删掉的行加回来。
  }, [profile.id, profile.modelList, profile.modelWindows, profile.modelAutoCompact, profile.modelVlm, profileUsesLiveFiles, isActive, isNew, liveConfigContents, liveAuthContents]);
  const validationSettings = relaySettingsWithDraft(form, profile.id, draft, isNew);
  const validationError = relaySessionProviderValidation(draft)
    ?? (isAggregateRelayProfile(draft)
      ? aggregateRelayProfileValidation(draft)
      : relayModelRoutesSettingsValidation(validationSettings));
  const modelRowsError = modelWindowRowsValidationMessage(modelWindowRowsValidationError(modelWindowRows));
  const customHeadersError = relayHeadersValidationMessage(profile.customHeaders || []);
  const draftWithModelRows = () => {
    const serializedRows = serializeModelWindowRows(modelWindowRows);
    const validSlugs = serializedRows.modelList.split("\n").map((slug) => slug.trim()).filter(Boolean);
    return {
      ...draft,
      modelList: serializedRows.modelList,
      modelWindows: serializedRows.modelWindows,
      modelAutoCompact: serializedRows.modelAutoCompact,
      modelMetadata: retainModelMetadataForSlugs(draft.modelMetadata, validSlugs),
      customHeaders: serializeRelayHeaders(draft.customHeaders || []),
      modelVlm: serializedRows.modelVlm,
    };
  };
  const currentModelState = draftWithModelRows();
  const persistedModelState = {
    modelList: profile.modelList || "",
    modelWindows: profile.modelWindows || "",
    modelAutoCompact: profile.modelAutoCompact || "",
    modelMetadata: profile.modelMetadata || "",
    modelVlm: profile.modelVlm || "",
  };
  const hasUnsavedModelChanges = JSON.stringify({
    modelList: currentModelState.modelList,
    modelWindows: currentModelState.modelWindows,
    modelAutoCompact: currentModelState.modelAutoCompact,
    modelMetadata: currentModelState.modelMetadata,
    modelVlm: currentModelState.modelVlm,
  }) !== JSON.stringify(persistedModelState);
  // 交给上面的行编辑守卫：有未保存行改动时，外部变化不覆盖模型行。
  unsavedRowEditsRef.current = hasUnsavedModelChanges;
  const saveDraft = async () => {
    if (savingDraft) return;
    // 配置有误不再静默 return：把原因弹出来（按钮也不再因此禁用，见头部那一行提示）。
    if (isNew && isAggregateRelayProfile(draft) && aggregateMode === null) {
      void actions.showMessage(t("保存供应商"), t("先选择聚合类型（模型聚合 / 故障转移）再保存。"), "failed");
      return;
    }
    const blockingIssue = validationError || modelRowsError;
    if (blockingIssue) {
      void actions.showMessage(t("保存供应商"), blockingIssue, "failed");
      return;
    }
    setSavingDraft(true);
    try {
      const draftWithWindows = draftWithModelRows();
      const normalizedDraft = isAggregateRelayProfile(draftWithWindows) ? normalizeAggregateRelayProfile(draftWithWindows, form) : deriveRelayProfileFromFiles(draftWithWindows);
      const next = normalizeSettings(isNew
        ? addRelayProfile(form, normalizedDraft)
        : updateRelayProfile(form, profile.id, normalizedDraft));
      const settingsValidationError = relaySettingsValidation(next);
      if (settingsValidationError) return;
      const activeLiveBaseUrl = codexBaseUrlFromConfig(
        relayFiles?.configContents ?? profile.configContents,
      );
      const requiresRestart = isActive && modelRouteSaveRequiresRestart(
        normalizeSettings(form),
        next,
        activeLiveBaseUrl,
      );
      if (requiresRestart && !window.confirm(t("此请求设置需要启动本地协议代理。保存后将立即重启 Codex，使设置安全生效。是否继续？"))) {
        return;
      }
      const savedSettings = await onFormChange(next);
      if (!savedSettings) return;
      if (requiresRestart) {
        const restarted = await actions.restart(true);
        if (!restarted) return;
        onSaved?.();
        return;
      }
      const savedProfile = savedSettings.relayProfiles.find((candidate) => candidate.id === normalizedDraft.id)
        ?? normalizedDraft;
      if (isActive && savedSettings.relayProfilesEnabled && relayProfileUsesLiveFiles(savedProfile)) {
        await actions.switchRelayProfile(savedSettings, savedSettings.activeRelayId);
      }
      onSaved?.();
    } finally {
      setSavingDraft(false);
    }
  };
  const switchDraft = () => {
    if (isNew || validationError || modelRowsError) return;
    const draftWithWindows = draftWithModelRows();
    const normalizedDraft = isAggregateRelayProfile(draftWithWindows) ? normalizeAggregateRelayProfile(draftWithWindows, form) : deriveRelayProfileFromFiles(draftWithWindows);
    const previousActiveRelayId = form.activeRelayId;
    const next = syncLegacyRelayFields({
      ...form,
      relayProfiles: form.relayProfiles.map((item) => (item.id === profile.id ? normalizedDraft : item)),
      activeRelayId: profile.id,
    });
    void actions.switchRelayProfile(next, previousActiveRelayId);
  };
  const runProviderDoctor = async () => {
    setDoctorOpen(true);
    setDoctorRunning(true);
    setDoctorResult(null);
    const draftWithWindows = draftWithModelRows();
    const result = await actions.diagnoseRelayProfile(deriveRelayProfileFromFiles(draftWithWindows));
    setDoctorResult(result);
    setDoctorRunning(false);
  };
  const aggregateProfile = isAggregateRelayProfile(draft);
  const aggregateModeRequired = isNew && aggregateProfile && aggregateMode === null;
  const selectAggregateMode = (mode: AggregateMode) => {
    if (!aggregateProfile) return;
    setAggregateMode(mode);
    setDraft(aggregateProfileForMode(draft, form, mode));
  };
  const showDoctor = !aggregateProfile && (draft.relayMode !== "official" || draft.officialMixApiKey);
  const detailStatus = aggregateProfile
    ? aggregateModeRequired
      ? t("先选择类型")
      : draft.aggregate?.modelAggregationEnabled === true
        ? t("模型聚合：模型固定绑定供应商")
        : t("故障转移：按策略分配请求")
    : relayProfileEditorStatus(draft, form, isNew);
  return (
    <div className="relay-detail-page" key={profile.id}>
      <div className="relay-detail-header">
        <div className="relay-editor-heading">
          <Button aria-label={t("返回列表")} onClick={() => {
            if (hasUnsavedModelChanges && !window.confirm(t("有未保存的模型修改，确定放弃吗？"))) return;
            onBack();
          }} size="icon" title={t("返回列表")} type="button" variant="ghost">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="relay-editor-heading-copy">
            <strong>{draft.name || (aggregateProfile ? t("未命名聚合供应商") : t("未命名供应商"))}</strong>
            <span>{hasUnsavedModelChanges ? `${detailStatus} · ${t("有未保存修改")}` : detailStatus}</span>
            {validationError || modelRowsError ? (
              // 就地写出「为什么存不了」：按钮不再禁用，这里也给人一眼能看到的原因。
              <span className="relay-editor-validation" role="alert">
                {validationError || modelRowsError}
              </span>
            ) : null}
          </div>
        </div>
        <div className="relay-editor-actions">
          {showDoctor ? (
            <Button disabled={doctorRunning} onClick={() => void runProviderDoctor()} type="button" variant="secondary">
              <Stethoscope className="h-4 w-4" />
              {doctorRunning ? t("诊断中") : t("诊断供应商")}
            </Button>
          ) : null}
          {aggregateProfile ? (
            <UiBadge variant="secondary">{aggregateModeRequired ? t("聚合")
              : draft.aggregate?.modelAggregationEnabled === true ? t("模型聚合") : t("故障转移")}</UiBadge>
          ) : isNew ? null : (
            <Button
              disabled={actions.relaySwitching}
              onClick={switchDraft}
              title={!form.relayProfilesEnabled ? t("供应商配置总开关已关闭，点击后按提示开启") : actions.relaySwitching ? t("供应商切换中") : undefined}
              variant={draft.id === form.activeRelayId ? "secondary" : "default"}
            >
              {actions.relaySwitching ? t("切换中") : draft.id === form.activeRelayId ? t("使用中") : t("设为当前")}
            </Button>
          )}
          <Button
            // 配置有误时也让人点：点一下把原因弹出来，比一个点不动的按钮清楚。
            disabled={savingDraft}
            onClick={() => void saveDraft()}
            title={aggregateModeRequired ? t("先选择类型") : validationError || modelRowsError || t("保存")}
            type="button"
          >
            <Save className="h-4 w-4" />
            {savingDraft ? t("保存中") : t("保存供应商")}
          </Button>
        </div>
      </div>
      <div className="relay-detail-body">
        {aggregateModeRequired ? (
          <AggregateModeChooser onSelect={selectAggregateMode} />
        ) : (
          <RelayProfileEditor
            profile={draft}
            form={form}
            isNew={isNew}
            onProfileChange={setDraft}
            actions={actions}
            modelWindowRows={modelWindowRows}
            setModelWindowRows={setModelWindowRows}
          />
        )}
        {isAggregateRelayProfile(draft) ? null : (
        <RelayFileEditors
          contextProfile={profile}
          profile={draft}
          form={form}
          isActive={isActive}
          profileId={profile.id}
          onFormChange={onFormChange}
          onProfileChange={setDraft}
          actions={actions}
        />
        )}
      </div>
      {doctorOpen ? (
        <ProviderDoctorModal
          result={doctorResult}
          running={doctorRunning}
          onClose={() => {
            if (!doctorRunning) setDoctorOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function ContextScreen({
  form,
  liveEntries,
  relayFiles,
  onFormChange,
  actions,
}: {
  form: BackendSettings;
  liveEntries: CodexContextEntries | null;
  relayFiles: RelayFilesResult | null;
  onFormChange: (value: BackendSettings) => void;
  actions: Actions;
}) {
  return (
    <Panel fill>
      <CardHead title={t("Codex MCP&插件")} detail={t("独立管理 Codex 的 MCP 服务器与插件；切换任意供应商都会带上。")} />
      <CardContent>
        <RelayContextManager
          form={normalizeSettings(form)}
          liveEntries={liveEntries}
          relayFiles={relayFiles}
          onFormChange={onFormChange}
          actions={actions}
        />
      </CardContent>
    </Panel>
  );
}

type SortableModelWindowEntryProps = {
  id: string;
  children: (sortable: ReturnType<typeof useSortable>) => ReactNode;
};

function SortableModelWindowEntry({ id, children }: SortableModelWindowEntryProps) {
  const sortable = useSortable({ id });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  };

  return (
    <div
      className={`relay-model-entry ${sortable.isDragging ? "dragging" : ""}`}
      ref={sortable.setNodeRef}
      style={style}
    >
      {children(sortable)}
    </div>
  );
}

function RelayFold({ title, children, className = "", bodyClassName = "", issue, sectionId, defaultOpen = false }: {
  title: string;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  issue?: string | null;
  sectionId?: string;
  defaultOpen?: boolean;
}) {
  const preferenceKey = sectionId ? `codex-plus-relay-fold:${sectionId}` : null;
  const [open, setOpen] = useState(() => {
    if (issue) return true;
    try {
      const stored = preferenceKey ? window.localStorage.getItem(preferenceKey) : null;
      if (stored === "true" || stored === "false") return stored === "true";
    } catch {
      // 无法使用本地存储时仍可展开、编辑并保存供应商草稿。
    }
    return defaultOpen;
  });
  const previousIssue = useRef(issue);
  useEffect(() => {
    // 同一项错误更新文字时不抢回用户刚收起的面板，新出现的错误才展开。
    if (issue && !previousIssue.current) setOpen(true);
    previousIssue.current = issue;
  }, [issue]);
  return (
    <details className={`relay-fold ${className}`.trim()} open={open} onToggle={(event) => {
      const next = event.currentTarget.open;
      if (next === open) return;
      setOpen(next);
      if (preferenceKey) {
        try { window.localStorage.setItem(preferenceKey, String(next)); } catch { /* 偏好不可写不影响编辑。 */ }
      }
    }}>
      <summary className="relay-fold-summary">
        <ChevronDown aria-hidden="true" className="relay-fold-chevron h-4 w-4" />
        <strong>{title}</strong>
        {issue ? <span className="relay-fold-issue" title={issue}>{t("需要检查")}</span> : null}
      </summary>
      <div className={`relay-fold-body ${bodyClassName}`.trim()}>{children}</div>
    </details>
  );
}

// 模型行级内置元数据索引：窗口/压缩用于回填，「思考等级」列用作内置初值。
type BuiltinMetadataIndexEntry = {
  source: string;
  context_window: unknown;
  auto_compact_token_limit: unknown;
  supported_reasoning_levels?: unknown;
};

function RelayProfileEditor({
  profile,
  form,
  isNew = false,
  onProfileChange,
  actions,
  modelWindowRows,
  setModelWindowRows,
}: {
  profile: RelayProfile;
  form: BackendSettings;
  isNew?: boolean;
  onProfileChange: (value: RelayProfile) => void;
  actions: Actions;
  modelWindowRows: ModelWindowRow[];
  setModelWindowRows: (value: ModelWindowRow[]) => void;
}) {
  const [vlmTestOpen, setVlmTestOpen] = useState(false);
  const [relayProxyUrl, setRelayProxyUrl] = useState("");
  const [relayProxyBusy, setRelayProxyBusy] = useState(false);
  const relayProxyProfileRef = useRef(profile);
  relayProxyProfileRef.current = profile;
  const relayProxyRevisionRef = useRef(0);
  const [stabilizePromptPrefix, setStabilizePromptPrefix] = useState(false);
  const [stabilizePromptPrefixBusy, setStabilizePromptPrefixBusy] = useState(false);
  const useCommonConfig = profile.useCommonConfig !== false;
  useEffect(() => {
    let cancelled = false;
    const revision = ++relayProxyRevisionRef.current;
    setRelayProxyUrl("");
    setIndependentProxyConfigured(profile.id, false);
    void invoke<{ status: string; proxyUrl?: string; configured?: boolean }>("load_relay_proxy", { profileId: profile.id })
      .then((result) => {
        if (!cancelled && revision === relayProxyRevisionRef.current && result.status === "ok") {
          setIndependentProxyConfigured(profile.id, result.configured ?? Boolean(result.proxyUrl?.trim()));
          setRelayProxyUrl(result.proxyUrl || "");
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [profile.id]);
  useEffect(() => {
    let cancelled = false;
    setStabilizePromptPrefix(false);
    void invoke<{ stabilizePromptPrefix?: boolean }>("load_relay_feature", { profileId: profile.id })
      .then((result) => { if (!cancelled) setStabilizePromptPrefix(result.stabilizePromptPrefix === true); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [profile.id]);
  const saveRelayProxy = async () => {
    const profileId = profile.id;
    ++relayProxyRevisionRef.current;
    setRelayProxyBusy(true);
    try {
      const result = await invoke<{ status: string; message: string; configured?: boolean }>("set_relay_proxy", {
        profileId,
        proxyUrl: relayProxyUrl,
      });
      if (result.status === "ok") {
        setIndependentProxyConfigured(profileId, result.configured ?? Boolean(relayProxyUrl.trim()));
        const current = relayProxyProfileRef.current;
        if (current.id === profileId) {
          // 保存响应返回时从最新草稿重算，保留期间编辑的其它字段。
          onProfileChange(applyRelayProfilePatchToFiles(current, { baseUrl: current.baseUrl }, { allowGenerateFiles: isNew }));
        }
      }
      await actions.showMessage(t("供应商独立代理"), result.message, result.status === "ok" ? "ok" : "failed");
    } catch (error) {
      await actions.showMessage(t("供应商独立代理"), String(error), "failed");
    } finally {
      setRelayProxyBusy(false);
    }
  };
  const saveStabilizePromptPrefix = async (enabled: boolean) => {
    setStabilizePromptPrefix(enabled);
    setStabilizePromptPrefixBusy(true);
    try {
      const result = await invoke<{ status: string; message: string }>("set_relay_feature", {
        profileId: profile.id,
        stabilizePromptPrefix: enabled,
      });
      await actions.showMessage(t("前缀稳定层"), result.message, result.status === "ok" ? "ok" : "failed");
    } catch (error) {
      setStabilizePromptPrefix(!enabled);
      await actions.showMessage(t("前缀稳定层"), String(error), "failed");
    } finally {
      setStabilizePromptPrefixBusy(false);
    }
  };
  const [activeImportDraft, setActiveImportDraft] = useState<ActiveImportDraft | null>(null);
  const [metadataImportError, setMetadataImportError] = useState("");
  const [builtinMatch, setBuiltinMatch] = useState<BuiltinModelMetadataMatch | null>(null);
  const [builtinMatchSlug, setBuiltinMatchSlug] = useState("");
  const [builtinQueryState, setBuiltinQueryState] = useState<BuiltinMetadataQueryState | null>(null);
  const [importPrefillSource, setImportPrefillSource] = useState<"builtin" | "existing" | null>(null);
  const [builtinIndex, setBuiltinIndex] = useState<Map<string, BuiltinMetadataIndexEntry>>(new Map());
  const modelSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  // 面板内置查询的请求代数：begin/rematch 是命令式调用（没有 effect cleanup
  // 的 cancelled 通道），响应返回时代数不匹配即丢弃全部 setState——防止迟到
  // 响应把已取消的面板重新打开，或覆盖用户改名后的新查询结果。
  const builtinQuerySeqRef = useRef(0);
  const queryBuiltinCommand = async <T,>(command: string, args?: Record<string, unknown>): Promise<T | null> => {
    try { return await invoke<T>(command, args); } catch (error) {
      // 索引只影响行级标记与便利回填（失败是假阴性、不产错误数据），可诊断即可。
      console.warn(`[Codex++] ${command} 查询失败`, error);
      return null;
    }
  };
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await queryBuiltinCommand<{ entries: Array<BuiltinMetadataIndexEntry & { slug: string }> }>("builtin_model_metadata_index");
      if (cancelled || !result?.entries) return;
      const map = new Map<string, BuiltinMetadataIndexEntry>();
      for (const entry of result.entries) {
        map.set(modelMetadataKey(entry.slug), {
          source: entry.source,
          context_window: entry.context_window,
          auto_compact_token_limit: entry.auto_compact_token_limit,
          supported_reasoning_levels: entry.supported_reasoning_levels,
        });
      }
      setBuiltinIndex(map);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 导入区打开期间模型名被修改：标签与内置预填实时跟随新名字（覆盖
  // 「创建模型后改名」「编辑模型名」场景，而不是沿用旧名字的匹配结果）。
  // 面板身份只用 draft.index；行已删除时回退打开面板时的行名兜底。
  const activeImportSlug = activeImportDraft
    ? modelWindowRows[activeImportDraft.index]?.model.trim() ?? activeImportDraft.originalSlug
    : "";
  const metadataImportTarget = activeImportDraft;
  const metadataImportDocument = activeImportDraft?.document ?? "";
  const metadataImportPreview = activeImportDraft?.preview ?? null;
  const setMetadataImportDocument = (document: string) =>
    setActiveImportDraft((draft) => draft ? updateActiveImportDraft(draft, { document }) : draft);
  const setMetadataImportPreview = (preview: ImportedModelMetadata | null) =>
    setActiveImportDraft((draft) => draft ? updateActiveImportDraft(draft, { preview }) : draft);
  useEffect(() => {
    if (!metadataImportTarget || !activeImportSlug || activeImportSlug === builtinMatchSlug) return;
    let cancelled = false;
    void (async () => {
      let match: BuiltinModelMetadataMatch | null = null;
      try {
        const result = await invoke<BuiltinModelMetadataMatch>("query_builtin_model_metadata", { slug: activeImportSlug });
        // 迟到响应守卫：改名后旧查询一律丢弃（含错误态），否则旧 error 会把
        // 当前正确匹配的徽标误藏成回退/错误态（cancelled 只由 cleanup 置位，
        // cleanup 跑过必有新 run 接手，不存在「最后一次响应被误丢」）。
        if (cancelled) return;
        const state = builtinMetadataQueryState(result);
        setBuiltinQueryState(state);
        match = state.status === "error" ? null : state.value;
      } catch (error) {
        if (cancelled) return;
        const state = builtinMetadataQueryState(null, error);
        setBuiltinQueryState(state);
        setMetadataImportError(state.status === "error" ? state.error : "");
      }
      if (cancelled) return;
      setBuiltinMatch(match);
      setBuiltinMatchSlug(activeImportSlug);
      // 内置预填态（用户尚未编辑）跟随新名字重新预填；已编辑/自有内容不动。
      if (importPrefillSource === "builtin" && match?.matched && match.entry) {
        const document = builtinEntryToImportDocument(match.entry, modelSlugFromRowName(activeImportSlug));
        // 文档写的是后端返回的规范 slug，匹配时也要用规范 slug（剥掉 [1M] 后缀），
        // 否则带后缀的行名永远匹配不到，面板一打开就报「找不到 slug」。
        const preview = parseModelMetadataDocument(document, modelSlugFromRowName(activeImportSlug));
        setMetadataImportDocument(document);
        setMetadataImportError("");
        setMetadataImportPreview(preview.ok ? preview.value : null);
        if (preview.ok && preview.value.contextWindow && !suffixWindowString(activeImportSlug)) {
          updateModelWindowRow(metadataImportTarget.index, { window: preview.value.contextWindow });
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeImportSlug, builtinMatchSlug, metadataImportTarget, importPrefillSource]);

  const modelSlugOriginsRef = useRef(modelWindowRows.map((row) => row.model.trim()));
  useEffect(() => {
    modelSlugOriginsRef.current = modelWindowRows.map((row) => row.model.trim());
  }, [profile.id, profile.modelList]);
  const importedModelMetadata = useMemo(
    () => parseModelMetadataMap(profile.modelMetadata),
    [profile.modelMetadata],
  );
  // 当前内置匹配条目的「全字段」基线：用来判断面板里的内容是否只是内置的复刻。
  // 与预填走同一管道（同行名、同 slug 文本），并保留窗口/压缩字段——窗口/
  // 压缩偏离内置值同样是用户编辑，保存应落自定义；写 map 仍走白名单过滤。
  const builtinMetadata = useMemo(() => {
    if (!builtinMatch?.matched || !builtinMatch.entry) return null;
    const rowName = activeImportSlug || builtinMatchSlug || builtinMatch.entry.slug;
    const canonical = modelSlugFromRowName(rowName);
    const parsed = parseModelMetadataDocument(builtinEntryToImportDocument(builtinMatch.entry, canonical), canonical);
    return parsed.ok ? parsed.value.documentEntry : null;
  }, [builtinMatch, activeImportSlug, builtinMatchSlug]);
  // VLM/Strip 对 Chat Completions 与 Responses 协议均可用(注入块类型已按协议适配)。
  const vlmUnsupportedProtocol = false;
  if (isAggregateRelayProfile(profile)) {
    return (
      <AggregateRelayProfileEditor
        profile={profile}
        form={form}
        onProfileChange={onProfileChange}
      />
    );
  }

  const editorMode = relayEditorMode(profile);
  const showApiFields = editorMode !== "official";
  const sessionProvider = relaySessionProvider(profile);
  const canUseOpenAiSessionProvider = profile.relayMode !== "official" || profile.officialMixApiKey;
  const updateDraft = (patch: Partial<RelayProfile>) => {
    onProfileChange(applyRelayProfilePatchToFiles(profile, patch, { allowGenerateFiles: isNew }));
  };
  const normalizedApiKeys = normalizeRelayApiKeys(profile);
  const updateApiKeys = (apiKeys: RelayApiKey[], activeApiKeyId = normalizedApiKeys.activeApiKeyId) => {
    const selected = apiKeys.find((entry) => entry.id === activeApiKeyId) || apiKeys[0];
    updateDraft({ apiKeys, activeApiKeyId: selected?.id || "", apiKey: selected?.apiKey || "" });
  };
  const selectEditorMode = (mode: RelayEditorMode) => {
    if (mode === "official") {
      updateDraft({ relayMode: "official", officialMixApiKey: false });
      return;
    }
    if (mode === "mixedApi") {
      updateDraft({ relayMode: "official", officialMixApiKey: true });
      return;
    }
    updateDraft({ relayMode: "pureApi", officialMixApiKey: false });
  };
  const modelRoutes = normalizeRelayModelRoutes(profile.modelRoutes);
  const modelRouteTargets = form.relayProfiles.filter(
    (candidate) => candidate.id !== profile.id && !isAggregateRelayProfile(candidate) && candidate.protocol === "responses",
  );
  const updateModelRoute = (index: number, patch: Partial<RelayModelRoute>) => {
    updateDraft({
      modelRoutes: modelRoutes.map((route, routeIndex) => (routeIndex === index ? { ...route, ...patch } : route)),
    });
  };
  const commitModelMetadata = (modelMetadata: string) => {
    updateDraft({ modelMetadata });
  };
  const updateModelWindowRow = (index: number, patch: Partial<ModelWindowRow>) => {
    setModelWindowRows(
      modelWindowRows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    );
  };
  // 内置命中 → 回填空窗口/压缩列的统一入口：上游获取、手动提交行名、打开导入
  // 面板都走这一条规则，不再只有「重新匹配」才回填（裁决见 builtinRowBackfillValue）。
  const backfillRowFromBuiltin = (index: number, slug: string) => {
    const row = modelWindowRows[index];
    if (!row) return;
    const patch = builtinRowBackfillValue(slug, row.window, row.autoCompact, builtinIndex.get(modelMetadataKey(slug)));
    if (patch.window || patch.autoCompact) {
      updateModelWindowRow(index, {
        ...(patch.window ? { window: patch.window } : {}),
        ...(patch.autoCompact ? { autoCompact: patch.autoCompact } : {}),
      });
    }
  };
  const resolvePendingModelSlugRenames = (
    rows: ModelWindowRow[],
    origins: string[],
    modelMetadata: string,
  ) => {
    const slugs = rows.map((row) => row.model.trim()).filter(Boolean);
    if (new Set(slugs).size !== slugs.length) return { modelMetadata, origins };
    const nextOrigins = rows.map((row, index) => row.model.trim() || origins[index] || "");
    return {
      modelMetadata: remapModelMetadataSlugs(
        modelMetadata,
        rows.map((row, index) => ({
          previousSlug: origins[index] || "",
          nextSlug: row.model,
        })),
      ),
      origins: nextOrigins,
    };
  };
  const commitModelSlug = (index: number) => {
    const nextSlug = modelWindowRows[index]?.model.trim() ?? "";
    if (!nextSlug) return;
    // 面板身份只用 index（activeImportSlug 实时跟随输入框），改名只需在这里
    // 迁移 metadata map 的 key；draft 不再持有 slug 副本，避免双轨漂移。
    const resolved = resolvePendingModelSlugRenames(
      modelWindowRows,
      modelSlugOriginsRef.current,
      profile.modelMetadata,
    );
    modelSlugOriginsRef.current = resolved.origins;
    if (resolved.modelMetadata !== profile.modelMetadata) commitModelMetadata(resolved.modelMetadata);
    // 手动新增/改名提交即同步：内置命中且窗口/压缩列为空时立即回填
    backfillRowFromBuiltin(index, nextSlug);
  };
  const closeModelMetadataImport = () => {
    // 作废所有在飞的命令式内置查询（begin/rematch）：面板已关，迟到响应
    // 不得再把面板重新打开或写入陈旧匹配状态。
    builtinQuerySeqRef.current += 1;
    setActiveImportDraft(null);
    setMetadataImportError("");
  };
  const handleModelRowsDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeIndex = Number(String(active.id).replace("model-row-", ""));
    const overIndex = Number(String(over.id).replace("model-row-", ""));
    if (!Number.isInteger(activeIndex) || !Number.isInteger(overIndex)) return;
    const nextRows = reorderModelWindowRows(modelWindowRows, activeIndex, overIndex);
    if (nextRows === modelWindowRows) return;
    // 导入面板的身份按行索引保存；排序时关闭它，避免面板跟着错误的行移动。
    if (activeImportDraft) closeModelMetadataImport();
    const nextOrigins = [...modelSlugOriginsRef.current];
    const [movedOrigin] = nextOrigins.splice(activeIndex, 1);
    nextOrigins.splice(overIndex, 0, movedOrigin);
    modelSlugOriginsRef.current = nextOrigins;
    setModelWindowRows(nextRows);
  };
  const cancelModelMetadataImport = () => {
    if (activeImportDraft) {
      const cancelled = cancelActiveImportDraft(activeImportDraft);
      updateModelWindowRow(activeImportDraft.index, {
        window: cancelled.rowPatch.window,
        autoCompact: cancelled.rowPatch.autoCompact,
      });
    }
    closeModelMetadataImport();
  };
  const beginModelMetadataImport = async (index: number, slug: string) => {
    // 配置可能还挂在「改名尚未提交」的旧 key 下（resolvePendingModelSlugRenames
    // 的 previousSlug 同源），按行解析而不是按实时名硬查。
    const existingKey = resolveModelMetadataRowKey(importedModelMetadata, {
      current: slug,
      origin: modelSlugOriginsRef.current[index],
    });
    const existingMetadata = existingKey ? importedModelMetadata[existingKey] : undefined;
    const existingDocument = existingMetadata
      ? serializeModelMetadataDocument(
          // 文档 slug 必须与解析目标（剥后缀的行名）一致，否则带 [1M] 的行
          // 现有配置文档永远匹配不上，保存键被解析失败锁死。
          modelSlugFromRowName(slug),
          existingMetadata,
          modelWindowRows[index]?.window ?? "",
          modelWindowRows[index]?.autoCompact ?? "",
        )
      : "";
    // 无论有无已导入配置都查询内置匹配（标签需要准确的匹配状态）；
    // 无已导入配置且命中内置时，把内置条目预填为可编辑底稿（预填 ≠ 导入）。
    let match: BuiltinModelMetadataMatch | null = null;
    let metadataQueryError = "";
    if (slug.trim()) {
      const querySeq = ++builtinQuerySeqRef.current;
      try {
        const result = await invoke<BuiltinModelMetadataMatch>("query_builtin_model_metadata", { slug });
        // 代数守卫：await 期间面板被取消或被另一次 begin/rematch 抢占
        // （seq 已变）时，本次响应整体丢弃——迟到响应不得重开已关闭的面板。
        if (querySeq !== builtinQuerySeqRef.current) return;
        const state = builtinMetadataQueryState(result);
        setBuiltinQueryState(state);
        match = state.status === "error" ? null : state.value;
      } catch (error) {
        if (querySeq !== builtinQuerySeqRef.current) return;
        const state = builtinMetadataQueryState(null, error);
        setBuiltinQueryState(state);
        metadataQueryError = state.status === "error" ? state.error : "";
      }
    }
    let document = existingDocument;
    if (!document && match?.matched && match.entry) {
      document = builtinEntryToImportDocument(match.entry, modelSlugFromRowName(slug));
      setImportPrefillSource("builtin");
      // 打开面板即同步：内置条目的窗口/压缩回填空列（后缀与已填值不覆盖，
      // 与上游获取/手动提交同一规则）
      const backfill = builtinRowBackfillValue(
        slug,
        modelWindowRows[index]?.window ?? "",
        modelWindowRows[index]?.autoCompact ?? "",
        match.entry,
      );
      if (backfill.window || backfill.autoCompact) {
        updateModelWindowRow(index, {
          ...(backfill.window ? { window: backfill.window } : {}),
          ...(backfill.autoCompact ? { autoCompact: backfill.autoCompact } : {}),
        });
      }
    } else {
      setImportPrefillSource(existingMetadata ? "existing" : null);
    }
    setBuiltinMatch(match);
    setBuiltinMatchSlug(slug);
    const existingPreview = document
      ? parseModelMetadataDocument(document, modelSlugFromRowName(slug))
      : null;
    setActiveImportDraft(createActiveImportDraft({
      index,
      rowName: slug,
      window: modelWindowRows[index]?.window ?? "",
      autoCompact: modelWindowRows[index]?.autoCompact ?? "",
      document,
      preview: existingPreview?.ok ? existingPreview.value : null,
    }));
    setMetadataImportError(metadataQueryError);
  };
  const applyModelMetadataImport = () => {
    if (!metadataImportTarget) return;
    // 空文档是合法保存输入（清除 → 保存 = 放弃自定义回退内置）；解析失败才无内容可存。
    const documentBlank = !metadataImportDocument.trim();
    if (!metadataImportPreview && !documentBlank) return;
    // 保存跟当前行名（改名后保存写回新 slug，不存旧名）
    const slug = modelWindowRows[metadataImportTarget.index]?.model.trim()
      || metadataImportPreview?.slug || "";
    const key = modelMetadataKey(slug);
    const decision = importSaveDecision({
      parseOk: true,
      documentBlank,
      imported: Boolean(importedModelMetadata[key]),
      // 内容与内置全字段一致时目标态就是「用内置」，不写自定义覆盖——
      // 否则「重新匹配后保存」会把内置数据复制成一份自定义配置。
      matchesBuiltin: metadataImportPreview && !(importPrefillSource === "existing"
        && modelFastSupportMode(metadataImportPreview.metadata) !== "inherit")
        ? metadataMatchesBuiltin(metadataImportPreview.documentEntry, builtinMetadata)
        : false,
    });
    if (!decision.needsSave) {
      closeModelMetadataImport();
      return;
    }
    if (decision.effect === "builtin") {
      commitModelMetadata(clearModelMetadataForSlug(profile.modelMetadata, slug));
      closeModelMetadataImport();
      return;
    }
    if (!metadataImportPreview) {
      closeModelMetadataImport();
      return;
    }
    commitModelMetadata(replaceModelMetadataForSlug(
      profile.modelMetadata,
      slug,
      metadataImportPreview.metadata,
    ));
    // 保存的窗口/压缩写回与实时同步规则一致：解析有值才写，null 不写，
    // 不再 fallback 回导入前的旧值（保存把用户清空的窗口又写回旧值）。
    const row = modelWindowRows[metadataImportTarget.index];
    if (row) {
      const patch = importDocumentSyncPatch(row, metadataImportPreview);
      if (suffixWindowString(row.model)) delete patch.window;
      if (patch.window !== undefined || patch.autoCompact !== undefined) {
        updateModelWindowRow(metadataImportTarget.index, patch);
      }
    }
    closeModelMetadataImport();
  };
  // 「重新匹配」：按当前模型名重查内置元数据并重填下方内容（含实时写回行窗口）。
  const rematchBuiltinImport = async (slug: string) => {
    setImportPrefillSource("builtin");
    if (!slug.trim()) return;
    const querySeq = ++builtinQuerySeqRef.current;
    let match: BuiltinModelMetadataMatch | null = null;
    try {
      const result = await invoke<BuiltinModelMetadataMatch>("query_builtin_model_metadata", { slug });
      // 代数守卫：连点重新匹配或面板已关闭时，旧响应整体丢弃。
      if (querySeq !== builtinQuerySeqRef.current) return;
      const state = builtinMetadataQueryState(result);
      setBuiltinQueryState(state);
      match = state.status === "error" ? null : state.value;
    } catch (error) {
      if (querySeq !== builtinQuerySeqRef.current) return;
      const state = builtinMetadataQueryState(null, error);
      setBuiltinQueryState(state);
      setMetadataImportError(state.status === "error" ? state.error : "");
    }
    setBuiltinMatch(match);
    // 未命中也要同步 slug：否则跟随 effect 的「slug 未变」早退会挡住后续查询，
    // 用户把名字改对后按钮状态不更新。
    setBuiltinMatchSlug(slug);
    if (!match?.matched || !match.entry) return;
    // 重新匹配只替换当前 draft；窗口后缀是用户显式意图，不能被内置值覆盖。
    const document = builtinEntryToImportDocument(match.entry, modelSlugFromRowName(slug));
    const preview = parseModelMetadataDocument(document, modelSlugFromRowName(slug));
    if (activeImportDraft) {
      setActiveImportDraft(rematchActiveImportDraft(
        activeImportDraft, document, preview.ok ? preview.value : null,
      ));
    }
    setMetadataImportError("");
    if (metadataImportTarget && preview.ok && preview.value.contextWindow
      && !suffixWindowString(slug)) {
      updateModelWindowRow(metadataImportTarget.index, { window: preview.value.contextWindow });
    }
  };
  // 「清除」：只清空面板文档（draft 内容），面板保持打开——不摘已保存配置、
  // 不回滚窗口/压缩列、不关闭面板。回到内置走 清除 → 重新匹配 → 保存（内容=
  // 内置 → 目标态内置）；粘贴最新供应商元数据也以清空后的面板为起点。
  const clearImportDocument = () => {
    setActiveImportDraft((draft) => draft
      ? updateActiveImportDraft(draft, { document: "", preview: null })
      : draft);
    // 内容已被用户接管：后续改名不再自动回填内置预填
    setImportPrefillSource(null);
    setMetadataImportError("");
  };
  const removeModelWindowRow = (index: number) => {
    const removedSlug = modelWindowRows[index]?.model.trim() || modelSlugOriginsRef.current[index] || "";
    // 「配置模型」不能被删掉：保存时后端会把 profile.model 合并回 model_list
    // （relay_config::merge_model_into_model_list），删了也会被加回来、看起来像"保存没生效"。
    const configuredSlug = parseModelSuffix(profile.model || "").slug.trim();
    if (removedSlug && configuredSlug && removedSlug === configuredSlug) {
      void actions.showMessage(
        t("配置模型不能从列表里删除"),
        tf("「{0}」是当前「配置模型」：Codex 会始终把它发布在模型列表里，删掉保存后也会被加回来。要减少模型，请先把上方「配置模型」改成要保留的那个，再删这一行。", [removedSlug]),
      );
      return;
    }
    const nextRows = modelWindowRows.filter((_, rowIndex) => rowIndex !== index);
    const nextOrigins = modelSlugOriginsRef.current.filter((_, rowIndex) => rowIndex !== index);
    const resolved = resolvePendingModelSlugRenames(nextRows, nextOrigins, profile.modelMetadata);
    modelSlugOriginsRef.current = resolved.origins;
    // 删到没有模型就保持空列表，不再补一行空行。
    setModelWindowRows(nextRows);
    const slugStillPresent = nextRows.some((row) => row.model.trim() === removedSlug)
      || resolved.origins.includes(removedSlug);
    const nextMetadata = removedSlug && !slugStillPresent
      ? clearModelMetadataForSlug(resolved.modelMetadata, removedSlug)
      : resolved.modelMetadata;
    if (nextMetadata !== profile.modelMetadata) commitModelMetadata(nextMetadata);
    if (metadataImportTarget?.index === index) {
      closeModelMetadataImport();
    } else if (metadataImportTarget && metadataImportTarget.index > index) {
      setActiveImportDraft({ ...activeImportDraft, index: activeImportDraft.index - 1 });
    }
  };
  const addModelWindowRows = (rows: ModelWindowRow[]) => {
    const merged = mergeModelWindowRows(modelWindowRows, rows);
    modelSlugOriginsRef.current = merged.map((row) => {
      const currentIndex = modelWindowRows.findIndex((current) => current.model.trim() === row.model.trim());
      return currentIndex >= 0 ? modelSlugOriginsRef.current[currentIndex] || row.model.trim() : row.model.trim();
    });
    // 上游获取的行窗口/压缩列一律为空：内置命中时立即回填（同一回填裁决）
    setModelWindowRows(merged.map((row) => {
      if (row.window.trim() && row.autoCompact.trim()) return row;
      const entry = builtinIndex.get(modelMetadataKey(row.model));
      const patch = builtinRowBackfillValue(row.model, row.window, row.autoCompact, entry);
      return patch.window || patch.autoCompact
        ? {
            ...row,
            ...(patch.window ? { window: patch.window } : {}),
            ...(patch.autoCompact ? { autoCompact: patch.autoCompact } : {}),
          }
        : row;
    }));
  };
  const appendEmptyModelRow = () => {
    modelSlugOriginsRef.current = [...modelSlugOriginsRef.current, ""];
    setModelWindowRows([...modelWindowRows, { model: "", window: "", autoCompact: "", imageHandling: "" }]);
  };
  const modelRowsError = modelWindowRowsValidationMessage(modelWindowRowsValidationError(modelWindowRows));
  const customHeadersError = relayHeadersValidationMessage(profile.customHeaders || []);
  const localizeMetadataSourceTag = (tag: ReturnType<typeof metadataSourceTags>[number]) => {
    if (tag.kind === "match") {
      return {
        text: tf("匹配：{0}", [tag.source]),
        title: tf("内置元数据：{0}", [tag.source]),
      };
    }
    if (tag.kind === "fallback") {
      return {
        text: tf("回退：{0}", [tag.source]),
        title: tf("无内置元数据，生成时回退 {0} 官方模板", [tag.source]),
      };
    }
    return {
      text: t("自定义"),
      title: tag.source
        ? tf("已导入自定义元数据，生成时覆盖内置（{0}）", [tag.source])
        : t("已导入自定义元数据，生成时以该配置为准"),
    };
  };
  return (
    <div className="relay-profile-editor">
      <div className="relay-fields">
        <section className="relay-config-section relay-basic-section">
          <div className="relay-config-section-head">
            <div>
              <strong>{t("基础设置")}</strong>
              <span>{t("先选择接入方式，相关字段会立即显示在这里。")}</span>
            </div>
          </div>
          <div className="relay-basic-fields">
            <Field className="relay-field-name" label={t("名称")}>
              <Input
                value={profile.name}
                onChange={(event) => updateDraft({ name: event.currentTarget.value })}
              />
            </Field>
          </div>
          <div className="relay-mode-block">
            <div className="relay-mode-block-head">
              <div>
                <strong>{t("接入方式")}</strong>
                <span>{t("官方登录 + API 会保留官方账号，同时使用下方 API 连接；不需要再到其他面板勾选。")}</span>
              </div>
            </div>
            <div className="relay-mode-options" role="radiogroup" aria-label={t("接入方式")}>
              {([
                {
                  mode: "official" as const,
                  icon: ShieldCheck,
                  title: t("官方登录"),
                  description: t("使用 ChatGPT 官方账号，不写入 API 凭据。"),
                },
                {
                  mode: "mixedApi" as const,
                  icon: Cable,
                  title: t("官方登录 + API"),
                  description: t("保留官方登录，同时使用 API Base URL 与 Key。"),
                },
                {
                  mode: "pureApi" as const,
                  icon: KeyRound,
                  title: t("纯 API"),
                  description: t("只使用 API 凭据，不依赖官方登录。"),
                },
              ]).map(({ mode, icon: Icon, title, description }) => (
                <button
                  aria-checked={editorMode === mode}
                  className={`relay-mode-option ${editorMode === mode ? "active" : ""}`}
                  key={mode}
                  onClick={() => selectEditorMode(mode)}
                  role="radio"
                  type="button"
                >
                  <span className="relay-mode-option-icon"><Icon className="h-4 w-4" /></span>
                  <span className="relay-mode-option-copy">
                    <strong>{title}</strong>
                    <small>{description}</small>
                  </span>
                  <span className="relay-mode-option-indicator" aria-hidden="true" />
                </button>
              ))}
            </div>
            {showApiFields ? (
              <div className="relay-inline-connection">
                <div className="relay-inline-connection-head">
                  <div>
                    <strong>{t("API 连接")}</strong>
                    <span>
                      {editorMode === "mixedApi"
                        ? t("官方账号负责登录与会话，API 连接负责实际请求。")
                        : t("保存后会把这组凭据用于当前供应商的请求。")}
                    </span>
                  </div>
                  <UiBadge variant={profile.baseUrl.trim() && profile.apiKey.trim() ? "secondary" : "outline"}>
                    {profile.baseUrl.trim() && profile.apiKey.trim() ? t("已填写") : t("待填写")}
                  </UiBadge>
                </div>
                <div className="relay-api-fields">
                  <div className="relay-api-connection-fields">
                    <Field className="relay-field-base-url" label="Base URL">
                      <Input
                        value={profile.baseUrl}
                        onChange={(event) => updateDraft({ baseUrl: event.currentTarget.value })}
                        placeholder={t("填写供应商的 Base URL")}
                      />
                    </Field>
                    <Field className="relay-field-protocol" label={t("上游协议")}>
                      <AppSelect
                        ariaLabel={t("上游协议")}
                        value={profile.protocol}
                        onChange={(protocol) => updateDraft({ protocol })}
                        options={[
                          { value: "responses", label: "Responses API" },
                          { value: "chatCompletions", label: "Chat Completions" },
                          { value: "anthropicMessages", label: "Anthropic Messages" },
                        ]}
                      />
                    </Field>
                  </div>
                  <Field className="relay-field-key" label="API Keys">
                    <div className="relay-api-key-list">
                      {normalizedApiKeys.apiKeys.map((entry) => {
                        const active = entry.id === normalizedApiKeys.activeApiKeyId;
                        return (
                          <div className={`relay-api-key-row ${active ? "active" : ""}`} key={entry.id}>
                            <button
                              aria-label={t("设为当前 Key")}
                              aria-pressed={active}
                              className="relay-api-key-select"
                              onClick={() => updateApiKeys(normalizedApiKeys.apiKeys, entry.id)}
                              title={t("设为当前 Key")}
                              type="button"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </button>
                            <Input
                              aria-label={t("Key 名称")}
                              value={entry.name}
                              onChange={(event) => updateApiKeys(normalizedApiKeys.apiKeys.map((key) =>
                                key.id === entry.id ? { ...key, name: event.currentTarget.value } : key))}
                            />
                            <Input
                              aria-label={tf("{0} 的 API Key", [entry.name])}
                              type="password"
                              value={entry.apiKey}
                              onChange={(event) => updateApiKeys(normalizedApiKeys.apiKeys.map((key) =>
                                key.id === entry.id ? { ...key, apiKey: event.currentTarget.value } : key))}
                              placeholder={t("输入供应商的 API Key")}
                            />
                            <Button
                              aria-label={t("删除 Key")}
                              disabled={normalizedApiKeys.apiKeys.length === 1}
                              onClick={() => updateApiKeys(normalizedApiKeys.apiKeys.filter((key) => key.id !== entry.id))}
                              size="icon"
                              title={t("删除 Key")}
                              type="button"
                              variant="ghost"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        );
                      })}
                      <Button onClick={() => {
                        const key = createRelayApiKey(normalizedApiKeys.apiKeys);
                        updateApiKeys([...normalizedApiKeys.apiKeys, key]);
                      }} size="sm" type="button" variant="secondary">
                        <Plus className="h-4 w-4" />
                        {t("添加 Key")}
                      </Button>
                    </div>
                  </Field>
                  {profile.protocol === "anthropicMessages" ? (
                    <>
                      <Field className="relay-field-anthropic-auth" label={t("认证字段")}>
                        <AppSelect
                          ariaLabel={t("认证字段")}
                          value={profile.anthropicAuthHeader || "x-api-key"}
                          onChange={(value) => updateDraft({ anthropicAuthHeader: value })}
                          options={[
                            { value: "x-api-key", label: t("x-api-key（Anthropic 原生）") },
                            { value: "authorization", label: t("Authorization: Bearer") },
                          ]}
                        />
                      </Field>
                      <Field className="relay-field-anthropic-max-tokens" label={t("最大输出 tokens")}>
                        <Input
                          inputMode="numeric"
                          value={profile.anthropicMaxTokens ? String(profile.anthropicMaxTokens) : ""}
                          placeholder="8192"
                          onChange={(event) =>
                            updateDraft({ anthropicMaxTokens: normalizeAnthropicMaxTokens(Number(event.currentTarget.value)) })
                          }
                        />
                      </Field>
                      <Field className="relay-field-anthropic-thinking" label={t("思考模式")}>
                        <AppSelect
                          ariaLabel={t("思考模式")}
                          value={profile.anthropicThinkingMode || "auto"}
                          onChange={(value) =>
                            updateDraft({ anthropicThinkingMode: value === "auto" ? "" : value })
                          }
                          options={[
                            { value: "auto", label: t("自动（新代模型透传等级）") },
                            { value: "adaptive", label: t("等级透传（adaptive）") },
                            { value: "budget", label: t("经典预算（budget_tokens）") },
                            { value: "off", label: t("关闭思考") },
                          ]}
                        />
                      </Field>
                      <label className="switch-row compact relay-switch-row relay-field-anthropic-cache">
                        <input
                          checked={profile.anthropicPromptCache !== false}
                          onChange={(event) =>
                            updateDraft({ anthropicPromptCache: event.currentTarget.checked })
                          }
                          type="checkbox"
                        />
                        <span>
                          <strong>{t("提示缓存")}</strong>
                          <small>
                            {t("给系统提示、工具定义和最新一轮对话打 5 分钟缓存断点（最多 4 个），长对话不会每轮全价重发。")}
                          </small>
                        </span>
                        <ToggleVisual />
                      </label>
                      <label className="switch-row compact relay-switch-row relay-field-anthropic-impersonate">
                        <input
                          checked={profile.anthropicImpersonateClaudeCode === true}
                          onChange={(event) =>
                            updateDraft({ anthropicImpersonateClaudeCode: event.currentTarget.checked })
                          }
                          type="checkbox"
                        />
                        <span>
                          <strong>{t("模拟 Claude Code 客户端")}</strong>
                          <small>
                            {t("伪装 User-Agent、anthropic-beta、x-app，并在系统提示首行注入 Claude Code 身份。仅在网关限制「只能通过 Claude Code 使用」时开启。")}
                          </small>
                        </span>
                        <ToggleVisual />
                      </label>
                      <div className="hint-line relay-protocol-hint">
                        <MessageCircle className="h-4 w-4" />
                        <span>
                          {t("思考档位跟随 Codex 的 reasoning effort：自动模式下新代模型按等级透传（adaptive + effort），旧代模型折算成 thinking 预算；模型声明 1M 窗口时会自动附上 1m 上下文 beta 头。")}
                        </span>
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="relay-mode-note">
                <ShieldCheck className="h-4 w-4" />
                <span>{t("当前使用官方账号登录；切换到“官方登录 + API”或“纯 API”后，API 连接字段会在这里展开。")}</span>
              </div>
            )}
          </div>
        </section>
        <RelayFold
          className="relay-config-section relay-model-settings"
          sectionId="models"
          defaultOpen
          issue={modelRowsError || relayModelRoutesSettingsValidation(relaySettingsWithDraft(form, profile.id, profile, isNew))}
          title={t("模型配置")}
        >
          <div className="relay-options-grid">
            <Field className="relay-field-config-model" label={t("配置模型")}>
              <Input
                value={profile.model}
                onChange={(event) => updateDraft({ model: event.currentTarget.value })}
                placeholder={t("例如 deepseek-v4-pro")}
              />
              <p className="field-hint">
                {t("默认启动 Codex 时使用的模型名，请勿带后缀；上下文窗口请在下方「模型列表」中按模型单独配置。")}
              </p>
            </Field>
            {/* 官方登录 profile 同样维护模型列表：按模型聚合与官方模型目录拉取都依赖它。 */}
            <section className="relay-config-section relay-field-model-list">
                <div className="relay-config-section-head">
                  <div>
                    <strong>{t("模型列表")}</strong>
                    <span>
                      {t("每行一个模型；上下文窗口可填")} <code>1M</code>{t("、")}<code>200K</code> {t("或")} <code>1000000</code>{t("，留空表示使用 Codex 默认长度。")}
                    </span>
                  </div>
                  <div className="relay-model-list-tools">
                    <Button
                      onClick={appendEmptyModelRow}
                      size="sm"
                      type="button"
                      variant="secondary"
                    >
                      <Plus className="h-4 w-4" />
                      {t("添加模型")}
                    </Button>
                    <Button
                      onClick={async () => {
                        const serializedRows = serializeModelWindowRows(modelWindowRows);
                        const models = await actions.fetchRelayProfileModels({
                          ...profile,
                          modelList: serializedRows.modelList,
                          modelWindows: serializedRows.modelWindows,
                          modelAutoCompact: serializedRows.modelAutoCompact,
                        });
                        if (models?.length) {
                          addModelWindowRows(models.map((model) => ({ model, window: "", autoCompact: "", imageHandling: "" })));
                        }
                      }}
                      size="sm"
                      type="button"
                      variant="secondary"
                    >
                      <Download className="h-4 w-4" />
                      {t("从上游获取")}
                    </Button>
                    <Button
                      disabled={!modelWindowRows.some((row) => row.model.trim())}
                      onClick={() => setModelWindowRows([])}
                      size="sm"
                      title={t("清空模型")}
                      type="button"
                      variant="outline"
                    >
                      <Trash2 className="h-4 w-4" />
                      {t("清空模型")}
                    </Button>
                  </div>
                </div>
                <div className="relay-model-row-editor">
                  {modelWindowRows.length ? <div className="relay-model-row relay-model-row-head">
                    <span aria-hidden="true" />
                    <span>{t("模型名称")}</span>
                    <span>{t("上下文窗口")}</span>
                    <span>{t("自动压缩")}</span>
                    <span>{t("图片处理方式")}</span>
                    <span>{t("思考等级")}</span>
                    <span>{t("模型配置")}</span>
                    <span aria-hidden="true" />
                  </div> : null}
                  <DndContext
                    sensors={modelSensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleModelRowsDragEnd}
                  >
                    <SortableContext
                      items={modelWindowRows.map((_, index) => `model-row-${index}`)}
                      strategy={verticalListSortingStrategy}
                    >
                      {modelWindowRows.map((row, index) => {
                        const slug = row.model.trim();
                        // 面板身份只用 index：slug 双轨（draft 副本 vs 实时输入）曾导致
                        // 改名时面板整体卸载、blur 后重挂抢焦点。
                        const importing = metadataImportTarget?.index === index;
                        // 配置可能还挂在「改名尚未提交」的旧 key 下，按行解析而不是按实时名硬查。
                        const rowMetadataKey = resolveModelMetadataRowKey(importedModelMetadata, {
                          current: slug,
                          origin: modelSlugOriginsRef.current[index],
                        });
                        const imported = rowMetadataKey !== null;
                        // 思考等级列：自定义声明优先，其次内置初值；写回沿用到
                        // 改名前尚未提交的 key，blur 迁移时不会丢这次编辑。
                        const reasoning = resolveModelReasoningLevels(
                          rowMetadataKey ? importedModelMetadata[rowMetadataKey] : undefined,
                          builtinIndex.get(modelMetadataKey(slug))?.supported_reasoning_levels,
                        );
                        // 按钮可用性与状态行都从这一个纯函数出（见 model-metadata.ts）。
                        // 面板关闭时不创建导入控件，避免用一个面板级状态为所有行派生按钮状态。
                        const importControls = importing
                          ? importPanelControls({
                              slug,
                              document: metadataImportDocument,
                              imported,
                              // 空文档（清除后）不算解析失败：保存键保持可用，
                              // 走「放弃自定义回退内置」的保存路径。
                              parseOk: !metadataImportDocument.trim() || Boolean(metadataImportPreview),
                              matched: builtinQueryState?.status === "error" ? false : Boolean(builtinMatch?.matched),
                              // 面板内容与内置条目全字段等价：保存的目标态就是「用内置」。
                              matchesBuiltin: metadataImportPreview
                                ? metadataMatchesBuiltin(metadataImportPreview.documentEntry, builtinMetadata)
                                : false,
                            })
                          : null;

                        return (
                      <SortableModelWindowEntry id={`model-row-${index}`} key={index}>
                        {(sortable) => (
                          <>
                        <div className="relay-model-row">
                          <button
                            aria-label={t("拖动排序")}
                            className="relay-model-drag"
                            title={t("拖动排序")}
                            type="button"
                            {...sortable.attributes}
                            {...sortable.listeners}
                          >
                            <GripVertical className="h-4 w-4" />
                          </button>
                          <div className="relay-model-cell relay-model-cell-name">
                            <span className="relay-model-cell-label">{t("模型名称")}</span>
                            <Input
                              aria-label={t("模型名称")}
                              value={row.model}
                              onChange={(event) => updateModelWindowRow(index, { model: event.currentTarget.value })}
                              onBlur={() => commitModelSlug(index)}
                              placeholder="deepseek/deepseek-v4-flash"
                            />
                          </div>
                          <div className="relay-model-cell relay-model-cell-window">
                            <span className="relay-model-cell-label">{t("上下文窗口")}</span>
                            <Input
                              aria-label={t("上下文窗口")}
                              value={row.window}
                              onChange={(event) => {
                                const window = event.currentTarget.value;
                                updateModelWindowRow(index, { window });
                                // 导入面板尚未粘贴 JSON 时，只编辑模型行；不要把空文档同步失败显示成错误。
                                if (!importing || !metadataImportDocument.trim() || !metadataImportPreview) return;
                                const synchronized = synchronizeModelMetadataDocumentLimitsPreview(
                                  metadataImportDocument,
                                  slug,
                                  window,
                                  metadataImportPreview?.autoCompactCalculationPercent
                                    ?? metadataImportPreview?.autoCompactPercent
                                    ?? row.autoCompact,
                                );
                                if (!synchronized) {
                                  setMetadataImportPreview(null);
                                  setMetadataImportError(t("上下文窗口与自动压缩值无效，无法同步模型配置。"));
                                  return;
                                }
                                setMetadataImportDocument(synchronized.document);
                                setMetadataImportPreview(synchronized.preview);
                                setMetadataImportError("");
                              }}
                              placeholder="1M"
                            />
                          </div>
                          <div className="relay-model-cell relay-model-cell-compact">
                            <span className="relay-model-cell-label">{t("自动压缩")}</span>
                            <AppSelect
                              ariaLabel={t("自动压缩")}
                              className="text-xs"
                              value={normalizeAutoCompactPercent(row.autoCompact) || DEFAULT_AUTO_COMPACT_PERCENT}
                              onChange={(value) => {
                                updateModelWindowRow(index, { autoCompact: value });
                                // 导入面板尚未粘贴 JSON 时，只编辑模型行；不要把空文档同步失败显示成错误。
                                if (!importing || !metadataImportDocument.trim() || !metadataImportPreview) return;
                                const synchronized = synchronizeModelMetadataDocumentLimitsPreview(
                                  metadataImportDocument,
                                  slug,
                                  row.window,
                                  value,
                                );
                                if (!synchronized) {
                                  setMetadataImportPreview(null);
                                  setMetadataImportError(t("上下文窗口与自动压缩值无效，无法同步模型配置。"));
                                  return;
                                }
                                setMetadataImportDocument(synchronized.document);
                                setMetadataImportPreview(synchronized.preview);
                                setMetadataImportError("");
                              }}
                              options={autoCompactOptions(row.autoCompact).map((value) => ({ value, label: value }))}
                              title={t("自动压缩留空时沿用 Codex 默认行为；填写百分比后会按该模型的上下文窗口重新计算阈值。")}
                            />
                          </div>
                          <div className="relay-model-cell relay-model-cell-image">
                            <span className="relay-model-cell-label">{t("图片处理方式")}</span>
                            <AppSelect
                              ariaLabel={t("图片处理方式")}
                              className="text-xs"
                              value={row.imageHandling}
                              disabled={vlmUnsupportedProtocol}
                              onChange={(value) => updateModelWindowRow(index, { imageHandling: value })}
                              options={[
                                { value: "", label: t("纯文本模型请配置此项"), disabled: true },
                                { value: "send-as-is", label: t("原样发送图片"), title: t("多模态模型直接接收图片,不经过任何处理") },
                                { value: "strip", label: t("移除图片"), title: t("删掉图片只发文字,避免纯文本模型报错(模型看不到图)") },
                                { value: "vlm", label: t("视觉辅助分析"), title: t("图片先由视觉辅助模型(Qwen)转成文字描述,纯文本模型也能\"看图\"") },
                              ]}
                              title={vlmUnsupportedProtocol ? t("VLM 仅支持 Chat Completions 协议和聚合模式") : t("多模态模型（支持图片输入的模型）请保持 send-as-is。")}
                            />
                          </div>
                          <div className="relay-model-cell relay-model-cell-reasoning">
                            <span className="relay-model-cell-label">{t("思考等级")}</span>
                            <ModelReasoningLevelsCell
                              levels={reasoning.levels}
                              parameterMode={reasoningParameterMode(rowMetadataKey ? importedModelMetadata[rowMetadataKey] : undefined)}
                              onParameterModeChange={(mode) => commitModelMetadata(setModelReasoningParameterMode(profile.modelMetadata, rowMetadataKey ?? slug, mode))}
                              inherited={!reasoning.overridden}
                              defaultLevel={reasoning.defaultLevel}
                              onChange={(levels, defaultLevel) => commitModelMetadata(
                                setModelReasoningLevelsForSlug(
                                  profile.modelMetadata,
                                  rowMetadataKey ?? slug,
                                  levels,
                                  defaultLevel,
                                ),
                              )}
                            />
                          </div>
                          <Button
                            className={`relay-model-import-button${imported ? " relay-model-import-custom" : builtinIndex.has(modelMetadataKey(slug)) ? " relay-model-import-builtin" : ""}`}
                            aria-expanded={importing}
                            disabled={!slug}
                            onClick={() => (importing ? cancelModelMetadataImport() : beginModelMetadataImport(index, slug))}
                            size="icon"
                            title={t("模型配置：元数据与 Fast 支持")}
                            type="button"
                            variant="ghost"
                          >
                            <FileCode2 className="h-4 w-4" />
                          </Button>
                          <Button
                            className="relay-model-delete"
                            aria-label={t("删除模型")}
                            onClick={() => removeModelWindowRow(index)}
                            size="icon"
                            title={t("删除模型")}
                            type="button"
                            variant="ghost"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        {importing ? (
                          <section className="relay-model-import-workbench">
                            <Field label={t("Fast（priority）支持")}>
                              <AppSelect
                                ariaLabel={t("Fast（priority）支持")}
                                value={importPrefillSource === "builtin" ? "inherit" : modelFastSupportMode(metadataImportPreview?.metadata)}
                                onChange={(value) => {
                                  const changed = synchronizeModelMetadataFastSupport(metadataImportDocument, slug, value as ModelFastSupportMode);
                                  if (!changed) {
                                    setMetadataImportError(t("请先修正当前模型的 JSON 配置，再设置 Fast 支持。"));
                                    return;
                                  }
                                  setMetadataImportDocument(changed.document);
                                  setMetadataImportPreview(changed.preview);
                                  setImportPrefillSource("existing");
                                  setMetadataImportError("");
                                }}
                                options={[
                                  { value: "inherit", label: t("继承模型默认能力") },
                                  { value: "supported", label: t("明确支持 priority") },
                                  { value: "unsupported", label: t("不支持 priority") },
                                ]}
                              />
                              <p className="field-hint">{t("按当前供应商逐模型声明。仅在上游支持 service_tier=priority 时选择支持；继承会清除自定义声明，取消不会保存修改。")}</p>
                            </Field>
                            <Field label={t("Responses Lite 支持")}>
                              <AppSelect value={metadataImportPreview?.metadata.use_responses_lite === true ? "supported" : metadataImportPreview?.metadata.use_responses_lite === false ? "unsupported" : "inherit"}
                                options={[{ value: "inherit", label: t("继承模型默认能力") }, { value: "supported", label: t("明确支持 Lite") }, { value: "unsupported", label: t("标准 Responses") }]}
                                onChange={(value) => {
                                  const changed = synchronizeModelMetadataLiteSupport(metadataImportDocument, slug, value as "inherit" | "supported" | "unsupported");
                                  if (!changed) { setMetadataImportError(t("请先修正当前模型的 JSON 配置。")); return; }
                                  setMetadataImportDocument(changed.document); setMetadataImportPreview(changed.preview); setImportPrefillSource("existing"); setMetadataImportError("");
                                }} />
                              <p className="field-hint">{t("保存此模型后还需保存并使用供应商；只为已核实支持 Lite 的上游选择支持。")}</p>
                            </Field>
                            <Textarea
                              autoFocus
                              value={metadataImportDocument}
                              onChange={(event) => {
                                const document = event.currentTarget.value;
                                setImportPrefillSource("existing");
                                setMetadataImportDocument(document);
                                setMetadataImportError("");
                                const parsed = parseModelMetadataDocument(document, slug);
                                if (!parsed.ok) {
                                  setMetadataImportPreview(null);
                                  setMetadataImportError(t(parsed.error));
                                  return;
                                }
                                setMetadataImportPreview(parsed.value);
                                // 实时替换：JSON 里的窗口/压缩比即时写回模型行输入框（所见即所得）。
                                if (metadataImportTarget) {
                                  const row = modelWindowRows[metadataImportTarget.index];
                                  if (row) {
                                    const patch = importDocumentSyncPatch(row, parsed.value);
                                    if (suffixWindowString(row.model)) delete patch.window;
                                    if (patch.window !== undefined || patch.autoCompact !== undefined) {
                                      updateModelWindowRow(metadataImportTarget.index, patch);
                                    }
                                  }
                                }
                              }}
                              placeholder={t("需要补充供应商模型信息时填写；不填则使用 Codex++ 默认配置（自动压缩 90%、图片原样发送）。从供应商的 models.json 或 model.json 复制，支持多个模型。")}
                              rows={7}
                            />
                            {metadataImportError ? <div className="relay-model-metadata-import-error" role="alert">{metadataImportError}</div> : null}
                            {metadataImportPreview?.contextWindow && row.window.trim() && metadataImportPreview.contextWindow !== row.window.trim() ? (
                              <div className="relay-model-metadata-import-warning" role="status">
                                {tf("文档里的上下文窗口是 {0}，当前列填的是 {1}，已保留当前值；要用文档的值请先清空窗口。", [metadataImportPreview.contextWindow, row.window.trim()])}
                              </div>
                            ) : null}
                            {metadataImportPreview?.ignoredFields.length ? (
                              <div className="relay-model-metadata-import-warning" role="status">
                                {tf("以下字段由 Codex++ 计算或维护，导入不会覆盖：{0}", [metadataImportPreview.ignoredFields.join(", ")])}
                              </div>
                            ) : null}
                            <div className="relay-model-metadata-import-actions">
                              <div className="relay-model-import-copy">
                                <strong>{slug}</strong>
                                {metadataSourceTags({
                                  slug,
                                  imported,
                                  builtinMatch: builtinQueryState?.status === "error" ? null : builtinMatch,
                                  builtinIndexSlug: builtinIndex.get(modelMetadataKey(slug)),
                                  // 回退模板名从后端 fallback 字段实时取，不写死
                                  fallbackSlug: builtinMatch?.fallback?.slug,
                                }).map((tag) => (
                                  (() => {
                                    const localized = localizeMetadataSourceTag(tag);
                                    return (
                                      <span
                                        key={tag.kind}
                                        className={`relay-model-source-badge relay-model-source-${tag.tone}`}
                                        title={localized.title}
                                      >
                                        {localized.text}
                                      </span>
                                    );
                                  })()
                                ))}
                              </div>
                              <div className="relay-model-metadata-import-flow">
                                {/* 四个按钮恒定渲染：只用置灰表达可用性，不再随状态出现/消失 */}
                                <Button
                                  disabled={importControls?.rematch.disabled ?? true}
                                  onClick={() => void rematchBuiltinImport(slug)}
                                  size="sm"
                                  title={t(importControls?.rematch.title ?? "重新匹配")}
                                  type="button"
                                  variant="ghost"
                                >
                                  {t("重新匹配")}
                                </Button>
                                <Button
                                  disabled={importControls?.clear.disabled ?? true}
                                  onClick={() => clearImportDocument()}
                                  size="sm"
                                  title={t(importControls?.clear.title ?? "清除")}
                                  type="button"
                                  variant="ghost"
                                >
                                  {t("清除")}
                                </Button>
                                <Button
                                  disabled={importControls?.cancel.disabled ?? true}
                                  onClick={cancelModelMetadataImport}
                                  size="sm"
                                  title={t(importControls?.cancel.title ?? "取消")}
                                  type="button"
                                  variant="ghost"
                                >
                                  {t("取消")}
                                </Button>
                                <Button
                                  disabled={importControls?.save.disabled ?? true}
                                  onClick={applyModelMetadataImport}
                                  size="sm"
                                  type="button"
                                  title={t(importControls?.save.title ?? "保存此模型")}
                                >
                                  {t(importControls?.save.label ?? "保存此模型")}
                                </Button>
                              </div>
                            </div>
                          </section>
                        ) : null}
                          </>
                        )}
                      </SortableModelWindowEntry>
                        );
                      })}
                    </SortableContext>
                  </DndContext>
                </div>
                {modelRowsError ? <div className="relay-model-metadata-import-error" role="alert">{modelRowsError}</div> : null}
                <p className="field-hint">
                  {t("自动压缩留空时沿用 Codex 默认行为；填写百分比后会按该模型的上下文窗口重新计算阈值。")}
                  {" "}{t("需要自定义 Fast 白名单时，打开对应模型的配置按钮，设置 Fast（priority）支持并保存此模型与供应商。")}
                </p>
            </section>
            {showApiFields ? (
              <section className="relay-config-section relay-field-model-routes">
                <div className="relay-config-section-head">
                  <div>
                    <strong>{t("单模型协议转换")}</strong>
                    <span>{t("仅在当前供应商启用时生效；精确匹配模型名并使用目标供应商的 URL 与 Key。目标必须是 Responses API，且需要从 Codex++ 启动。")}</span>
                  </div>
                  <div className="relay-model-list-tools">
                    <Button
                      disabled={modelRouteTargets.length === 0}
                      onClick={() => updateDraft({ modelRoutes: [...modelRoutes, { model: "", targetRelayId: "", targetModel: "" }] })}
                      size="sm"
                      title={modelRouteTargets.length === 0 ? t("请先创建一个 Responses API 目标供应商") : t("添加协议转换")}
                      type="button"
                      variant="secondary"
                    >
                      <Plus className="h-4 w-4" />
                      {t("添加协议转换")}
                    </Button>
                  </div>
                </div>
                <div className="relay-model-route-editor">
                  {modelRoutes.length ? (
                    <div className="relay-model-route-row relay-model-route-head">
                      <span>{t("匹配模型")}</span>
                      <span>{t("目标供应商")}</span>
                      <span>{t("目标模型（可选）")}</span>
                    </div>
                  ) : null}
                  {modelRoutes.map((route, index) => (
                    <div className="relay-model-route-row" key={`model-route-${index}`}>
                      <Input
                        value={route.model}
                        onChange={(event) => updateModelRoute(index, { model: event.currentTarget.value })}
                        placeholder={t("例：gpt-5.6-luna")}
                      />
                      <AppSelect
                        value={route.targetRelayId}
                        onChange={(targetRelayId) => updateModelRoute(index, { targetRelayId })}
                        options={[
                          { value: "", label: t("选择 Responses 供应商"), disabled: true },
                          ...modelRouteTargets.map((candidate) => ({ value: candidate.id, label: candidate.name || candidate.id })),
                        ]}
                      />
                      <Input
                        value={route.targetModel}
                        onChange={(event) => updateModelRoute(index, { targetModel: event.currentTarget.value })}
                        placeholder={t("留空保持原模型名")}
                      />
                      <Button
                        aria-label={t("删除协议转换")}
                        onClick={() => updateDraft({ modelRoutes: modelRoutes.filter((_, routeIndex) => routeIndex !== index) })}
                        size="icon"
                        title={t("删除协议转换")}
                        type="button"
                        variant="ghost"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
            {showApiFields && modelWindowRows.some((row) => row.imageHandling === "vlm") ? (
              <div className="relay-vlm-section">
                <div className="relay-vlm-section-header">{t("Vision Analysis Provider")}</div>
                <Field className="relay-field-vlm-api-key" label={t("VLM API Key")}>
                  <Input
                    type="password"
                    value={profile.vlmApiKey}
                    onChange={(event) => updateDraft({ vlmApiKey: event.currentTarget.value })}
                    placeholder="sk-..."
                  />
                </Field>
                <Field className="relay-field-vlm-model" label={t("VLM Model")}>
                  <Input
                    value={profile.vlmModel}
                    onChange={(event) => updateDraft({ vlmModel: event.currentTarget.value })}
                    placeholder="qwen-vl-plus"
                  />
                </Field>
                <Field className="relay-field-vlm-base-url" label={t("VLM Base URL")}>
                  <Input
                    value={profile.vlmBaseUrl}
                    onChange={(event) => updateDraft({ vlmBaseUrl: event.currentTarget.value })}
                    placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1"
                  />
                </Field>
                <p className="field-hint">
                  {t("若开启 VLM analysis，请确认 VLM 配置项完整且服务可用。")}
                  <br />
                  {t("仅在 Chat Completion 和聚合模式生效。")}
                </p>
                {modelWindowRows.some((row) => row.imageHandling === "vlm") && (!profile.vlmApiKey || !profile.vlmModel || !profile.vlmBaseUrl) ? (
                  <p className="field-hint warn">{t("VLM 配置不完整：API Key、Model 和 Base URL 为必填项，否则 VLM 不会生效。")}</p>
                ) : null}
                <div className="vlm-test-entry">
                  <Button
                    onClick={() => setVlmTestOpen((v) => !v)}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    {vlmTestOpen ? t("收起测试面板") : t("测试 VLM")}
                  </Button>
                </div>
                {vlmTestOpen ? <VlmTestPanel profile={profile} onClose={() => setVlmTestOpen(false)} /> : null}
              </div>
            ) : null}
          </div>
        </RelayFold>
        {showApiFields ? (
          <RelayFold
            className="relay-config-section relay-request-settings"
            defaultOpen
            sectionId="requests"
            issue={customHeadersError || relaySessionProviderValidation(profile)}
            title={t("请求设置")}
          >
          <div className="relay-options-grid">
            {showApiFields ? (
              <Field className="relay-field-session-provider" label={t("Codex 会话身份")}>
                <AppSelect
                  value={sessionProvider}
                  onChange={(value) => updateDraft({ sessionProvider: value })}
                  options={[
                    { value: "custom", label: t("Custom（默认）") },
                    {
                      value: "openai",
                      label: t("OpenAI（兼容 ChatGPT Remote）"),
                      disabled: !canUseOpenAiSessionProvider || profile.protocol !== "responses",
                    },
                  ]}
                />
                <p className="field-hint">
                  {profile.protocol !== "responses"
                    ? t("OpenAI 会话身份需要 Responses API；Chat Completions 不支持远程压缩。")
                    : canUseOpenAiSessionProvider
                      ? t("选择 OpenAI 后，Codex Remote 会把当前会话识别为 ChatGPT 会话；中转仍使用 custom 表。")
                      : t("官方登录未混入 API 时不写入会话 provider")}
                </p>
              </Field>
            ) : null}
            {showApiFields ? (
              <label
                className={`switch-row compact relay-switch-row relay-field-standard${profile.protocol === "chatCompletions" ? "" : " is-disabled"}`}
                title={profile.protocol === "chatCompletions" ? undefined : t("仅在上游协议为 Chat Completions 时可用。Responses API 会原样转发。")}
              >
                <input
                  checked={profile.standardOpenaiProtocol}
                  disabled={profile.protocol !== "chatCompletions"}
                  onChange={(event) =>
                    updateDraft({ standardOpenaiProtocol: event.currentTarget.checked })
                  }
                  type="checkbox"
                />
                <span>
                  <strong>{t("纯标准协议")}</strong>
                  <small>
                    {t("强制走标准 OpenAI 协议，不注入厂商私有 reasoning 参数。面向只认标准 OpenAI 字段、拒绝厂商私有参数的第三方网关。")}
                    {" "}
                    {t("若网关提示 thinking type: adaptive 无效，可启用此项后重试；这会停用厂商私有推理参数。")}
                  </small>
                </span>
                <ToggleVisual />
              </label>
            ) : null}
            {showApiFields ? (
              <Field className="relay-field-user-agent" label="User-Agent">
                <Input
                  value={profile.userAgent}
                  onChange={(event) => updateDraft({ userAgent: event.currentTarget.value })}
                  placeholder={t("留空使用默认值")}
                />
              </Field>
            ) : null}
            {showApiFields ? (
              <Field className="relay-field-proxy" label={t("供应商独立代理")}>
                <div className="relay-inline-field">
                  <Input
                    value={relayProxyUrl}
                    onChange={(event) => setRelayProxyUrl(event.currentTarget.value)}
                    placeholder="http://127.0.0.1:7890"
                  />
                  <Button disabled={relayProxyBusy} onClick={() => void saveRelayProxy()} size="sm" type="button" variant="secondary">
                    {t("保存")}
                  </Button>
                </div>
                <span className="hint-line">{t("留空表示使用系统代理；仅影响当前供应商的模型拉取、测试和请求。")}</span>
              </Field>
            ) : null}
            {showApiFields ? (
              <label className="switch-row compact relay-switch-row">
                <input
                  checked={stabilizePromptPrefix}
                  disabled={stabilizePromptPrefixBusy}
                  onChange={(event) => void saveStabilizePromptPrefix(event.currentTarget.checked)}
                  type="checkbox"
                />
                <span><strong>{t("前缀稳定层")}</strong><small>{t("按供应商稳定可选历史块的顺序并移除成对 image_resize_notice；默认关闭，适合已确认上游支持的缓存场景。")}</small></span>
                <ToggleVisual />
              </label>
            ) : null}
            {showApiFields ? (
              <label
                className={`switch-row compact relay-switch-row relay-field-search-history${profile.protocol === "responses" ? "" : " is-disabled"}`}
                title={profile.protocol === "responses" ? undefined : t("仅限 Responses API。")}
              >
                <input
                  checked={profile.webSearchHistoryCompat}
                  disabled={profile.protocol !== "responses"}
                  onChange={(event) =>
                    updateDraft({ webSearchHistoryCompat: event.currentTarget.checked })
                  }
                  type="checkbox"
                />
                <span>
                  <strong>{t("搜索历史压缩兼容（实验）")}</strong>
                  <small>response protection is unavailable</small>
                </span>
                <ToggleVisual />
              </label>
            ) : null}
            {showApiFields && profile.protocol === "responses" ? <>
              <label className="switch-row compact relay-switch-row">
                <input type="checkbox" checked={profile.trustUpstreamCatalogLite === true} onChange={(event) => updateDraft({ trustUpstreamCatalogLite: event.currentTarget.checked })} />
                <span><strong>{t("保留外部目录的 Lite 声明")}</strong><small>{t("仅在已确认上游支持时启用；保留每个模型的显式声明，不会为全部模型开启 Lite。")}</small></span><ToggleVisual />
              </label>
              <label className="switch-row compact relay-switch-row">
                <input type="checkbox" checked={profile.strictResponsesReasoning === true} onChange={(event) => updateDraft({ strictResponsesReasoning: event.currentTarget.checked })} />
                <span><strong>{t("严格 Responses 推理历史兼容")}</strong><small>{t("仅当目标上游接受当前账号的加密历史时启用。混合推理只发送可识别的加密信封；占位或无效密文会明确报错。本地记录不变。")}</small></span><ToggleVisual />
              </label>
            </> : null}
            {showApiFields ? (
              <Field className="relay-field-custom-headers" label={t("自定义请求头")}>
                <div className="relay-custom-headers">
                  {(profile.customHeaders || []).map((row, index) => (
                    <div className="relay-custom-header-row" key={`custom-header-${index}`}>
                      <Input
                        aria-label={t("请求头名称")}
                        value={row.key}
                        onChange={(event) => {
                          const next = (profile.customHeaders || []).slice();
                          next[index] = { ...next[index], key: event.currentTarget.value };
                          updateDraft({ customHeaders: next });
                        }}
                        placeholder="X-Tenant"
                      />
                      <Input
                        aria-label={t("请求头值")}
                        value={row.value}
                        onChange={(event) => {
                          const next = (profile.customHeaders || []).slice();
                          next[index] = { ...next[index], value: event.currentTarget.value };
                          updateDraft({ customHeaders: next });
                        }}
                        placeholder={t("请求头值")}
                      />
                      <Button
                        aria-label={t("删除这一项")}
                        onClick={() =>
                          updateDraft({
                            customHeaders: (profile.customHeaders || []).filter((_, i) => i !== index),
                          })
                        }
                        size="sm"
                        type="button"
                        variant="secondary"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <div className="relay-custom-headers-actions">
                    <Button
                      onClick={() =>
                        updateDraft({
                          customHeaders: [...(profile.customHeaders || []), { key: "", value: "" }],
                        })
                      }
                      size="sm"
                      type="button"
                      variant="secondary"
                    >
                      <Plus className="h-4 w-4" />
                      {t("添加请求头")}
                    </Button>
                  </div>
                  <span className="hint-line">
                    {t("自定义请求头会同时用于测试连接、模型列表与实际代理请求。")}
                  </span>
                  <span className="hint-line">
                    {t("Host、Content-Length 等传输头由协议层掌控，不能覆盖；配置 Authorization 时以它为准，不再注入 API Key。")}
                  </span>
                  {customHeadersError ? (
                    <span className="hint-line relay-custom-headers-error">{customHeadersError}</span>
                  ) : null}
                </div>
              </Field>
            ) : null}
            {showApiFields && profile.protocol !== "responses" ? (
              <div className="hint-line relay-protocol-hint">
                <MessageCircle className="h-4 w-4" />
                <span>
                  {profile.protocol === "anthropicMessages"
                    ? t("此上游说 Anthropic Messages（/v1/messages）：本地 127.0.0.1:57321 会把请求转成 Anthropic 协议发出，再转回 Responses，需要从 Codex++ 启动 Codex。")
                    : t("此上游会通过本地 127.0.0.1:57321 转成 Responses API，需要从 Codex++ 启动 Codex。")}
                </span>
              </div>
            ) : null}
            <div className="hint-line relay-protocol-hint">
              <ShieldCheck className="h-4 w-4" />
              <span>{relayProfileModeHelp(profile)}</span>
            </div>
          </div>
          </RelayFold>
        ) : null}
      </div>
      <div className="relay-bottom-options">
        <RelayFold className="relay-advanced-block" defaultOpen sectionId="advanced" title={t("更多选项")}>
          <p className="relay-fold-description">
            {t("包含测试模型、上下文大小与压缩阈值；留空即沿用全局默认值。")}
          </p>
          <div className="relay-advanced-fields">
            <Field className="relay-field-test-model" label={t("测试模型")}>
              <Input
                value={profile.testModel}
                onChange={(event) => updateDraft({ testModel: event.currentTarget.value })}
                placeholder={tf("留空使用默认：{0}", ["gpt-5.4-mini"])}
              />
            </Field>
            <Field className="relay-field-context-window" label={t("上下文大小")}>
              <Input
                inputMode="numeric"
                value={profile.contextWindow}
                onChange={(event) => updateDraft({ contextWindow: normalizeTokenCountInput(event.currentTarget.value) })}
                placeholder={t("留空不改写，例如 200000")}
              />
            </Field>
            <Field className="relay-field-auto-compact" label={t("压缩上下文大小")}>
              <Input
                inputMode="numeric"
                value={profile.autoCompactLimit}
                onChange={(event) => updateDraft({ autoCompactLimit: normalizeTokenCountInput(event.currentTarget.value) })}
                placeholder={t("留空不改写，例如 160000")}
              />
            </Field>
          </div>
        </RelayFold>
      </div>
    </div>
  );
}

type VlmTestState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; result: TestVlmResult };

type TestVlmResult = {
  status: string;
  message: string;
  vlmStatus: string;
  httpCode: number | null;
  durationMs: number;
  error: string | null;
  description: string | null;
  model: string;
  rawRequest: string | null;
  rawResponse: string | null;
};

const VLM_TEST_MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/// 方向 C：选图即测 + 排障增强（spec §4）。
/// 选完文件自动开跑；失败时给通俗诊断 + 复制错误 + 原始请求/响应折叠。
function VlmTestPanel({
  profile,
  onClose,
}: {
  profile: Pick<RelayProfile, "vlmApiKey" | "vlmModel" | "vlmBaseUrl">;
  onClose: () => void;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [state, setState] = useState<VlmTestState>({ kind: "idle" });
  const [showRaw, setShowRaw] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const tr = (zh: string, params?: string[]) => (params ? tf(zh, params) : t(zh));

  const runTest = async (url: string) => {
    setState({ kind: "running" });
    setLocalError(null);
    try {
      const res = await invoke<TestVlmResult>("test_vlm", {
        request: {
          apiKey: profile.vlmApiKey,
          model: profile.vlmModel,
          baseUrl: profile.vlmBaseUrl,
          imageDataUrl: url,
        },
      });
      setState({ kind: "done", result: res });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setState({
        kind: "done",
        result: {
          status: "failed",
          message: msg,
          vlmStatus: "client_error",
          httpCode: null,
          durationMs: 0,
          error: msg,
          description: null,
          model: profile.vlmModel,
          rawRequest: null,
          rawResponse: null,
        },
      });
    }
  };

  // 选图即测：选完文件自动发起，无需二次点击（spec §4）。
  const onFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setLocalError(t("请选择图片文件。"));
      return;
    }
    if (file.size > VLM_TEST_MAX_IMAGE_BYTES) {
      setLocalError(t("图片超过 10MB，请换一张较小的图片。"));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setLocalError(t("读取图片失败，请重新选择"));
    reader.onload = () => {
      const url = typeof reader.result === "string" ? reader.result : null;
      if (url) {
        setDataUrl(url);
        void runTest(url);
      }
    };
    reader.readAsDataURL(file);
  };

  // 复制完整排障信息（诊断 + 原始报文，无 API Key），可直接贴 issue（spec §3）。
  const copyError = async () => {
    if (state.kind !== "done") return;
    const r = state.result;
    const text = [
      vlmTestTranslation(r.vlmStatus, r.httpCode ?? undefined, r.durationMs, tr),
      `model: ${r.model}`,
      r.httpCode != null ? `HTTP ${r.httpCode}` : null,
      r.error ? `error: ${r.error}` : null,
      r.rawRequest ? `--- request ---\n${r.rawRequest}` : null,
      r.rawResponse ? `--- response ---\n${r.rawResponse}` : null,
    ]
      .filter((x) => x !== null)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setLocalError(t("复制失败，请从报文中手动复制。"));
    }
  };

  const done = state.kind === "done" ? state.result : null;
  const running = state.kind === "running";
  const formReady = !!profile.vlmApiKey && !!profile.vlmModel && !!profile.vlmBaseUrl;
  const canRun = !!dataUrl && formReady;

  return (
    <div className="vlm-test-panel">
      <div className="modal-head">
        <div>
          <h2>{t("测试 VLM")}</h2>
          <p className="modal-message">
            {t("选一张图片立即验证当前 VLM 配置（使用表单当前值，无需保存）。")}
          </p>
        </div>
        <button className="toast-close" aria-label={t("关闭窗口")} onClick={onClose} type="button">×</button>
      </div>

      <div className="vlm-test-upload">
        <input
          ref={fileInputRef}
          accept="image/*"
          onChange={(e) => {
            onFile(e.currentTarget.files?.[0]);
            e.currentTarget.value = "";
          }}
          type="file"
          style={{ display: "none" }}
        />
        <Button disabled={running || !formReady} onClick={() => fileInputRef.current?.click()} size="sm" type="button" variant="secondary">
          {dataUrl ? t("换图并测试") : t("选择图片并测试")}
        </Button>
        {dataUrl ? <img alt={t("图片预览")} className="vlm-test-preview" src={dataUrl} /> : null}
        {running ? (
          <p className="vlm-test-running">
            <span className="vlm-test-spinner" aria-hidden="true" />
            {t("正在调用 VLM…")}
          </p>
        ) : null}
      </div>

      {localError ? <p className="field-hint warn">{localError}</p> : null}

      {done ? (
        <div className="vlm-test-result">
          <p className="vlm-test-summary" role="status">
            {vlmTestTranslation(done.vlmStatus, done.httpCode ?? undefined, done.durationMs, tr)}
          </p>
          {done.description ? (
            <pre className="vlm-test-description">{done.description}</pre>
          ) : null}
          {done.vlmStatus !== "ok" ? (
            <button className="vlm-test-detail-toggle" onClick={() => void copyError()} type="button">
              {t("复制错误")}
            </button>
          ) : null}
          <button
            className="vlm-test-detail-toggle"
            aria-expanded={showRaw}
            onClick={() => setShowRaw((v) => !v)}
            type="button"
          >
            {showRaw ? t("隐藏原始报文") : t("显示原始报文")}
          </button>
          {showRaw ? (
            <div className="vlm-test-raw">
              <div className="label">{t("原始请求")}</div>
              <pre className="vlm-test-description">{done.rawRequest ?? "-"}</pre>
              <div className="label">{t("原始响应")}</div>
              <pre className="vlm-test-description">{done.rawResponse ?? "-"}</pre>
            </div>
          ) : null}
        </div>
      ) : null}

      <Toolbar>
        {dataUrl ? (
          <Button disabled={!canRun || running} onClick={() => dataUrl && void runTest(dataUrl)} type="button">
            {t("重测")}
          </Button>
        ) : null}
        <Button onClick={onClose} type="button" variant="secondary">
          {t("收起")}
        </Button>
      </Toolbar>
    </div>
  );
}

function AggregateModeChooser({ onSelect }: { onSelect: (mode: AggregateMode) => void }) {
  return (
    <div className="aggregate-mode-chooser">
      <div className="aggregate-mode-chooser-copy">
        <h2>{t("先选择类型")}</h2>
        <p>{t("故障转移与模型聚合彼此独立；选择后只显示对应的成员和路由表单。")}</p>
      </div>
      <div className="aggregate-mode-choice-grid">
        <button className="mode-option aggregate-mode-choice" onClick={() => onSelect("provider")} type="button">
          <strong>{t("故障转移")}</strong>
          <span>{t("多个供应商组成请求池，支持失败切换、会话轮转、请求轮转和权重。")}</span>
        </button>
        <button className="mode-option aggregate-mode-choice" onClick={() => onSelect("model")} type="button">
          <strong>{t("模型聚合")}</strong>
          <span>{t("把成员模型合并到 Codex 列表，选择模型后固定发送到对应供应商。")}</span>
        </button>
      </div>
    </div>
  );
}

function AggregateRelayProfileEditor({
  profile,
  form,
  onProfileChange,
}: {
  profile: RelayProfile;
  form: BackendSettings;
  onProfileChange: (value: RelayProfile) => void;
}) {
  const candidates = aggregateMemberCandidates(form.relayProfiles, profile.id);
  const aggregate = normalizeAggregateConfig(profile.aggregate, candidates);
  const modelMode = aggregate.modelAggregationEnabled === true;
  const memberIds = new Set(aggregate.members.map((member) => member.profileId));
  const sessionProvider = normalizeRelaySessionProvider(profile.sessionProvider);
  const updateAggregate = (nextAggregate: RelayAggregateConfig) => {
    onProfileChange(normalizeAggregateRelayProfile({ ...profile, aggregate: nextAggregate }, form));
  };
  const toggleMember = (profileId: string, checked: boolean) => {
    const members = checked
      ? [...aggregate.members, { profileId, weight: 1 }]
      : aggregate.members.filter((member) => member.profileId !== profileId);
    updateAggregate({ ...aggregate, members });
  };
  const updateWeight = (profileId: string, weight: number) => {
    updateAggregate({
      ...aggregate,
      members: aggregate.members.map((member) =>
        member.profileId === profileId ? { ...member, weight: clampAggregateWeight(weight) } : member,
      ),
    });
  };
  const totalWeight = aggregate.members.reduce((total, member) => total + clampAggregateWeight(member.weight), 0);
  // 只有"纯官方登录"成员才有 ChatGPT 凭据可同步；带 URL/Key 的官方混入走 API 通道。
  const defaultMemberCandidate = candidates.find((candidate) => candidate.id === aggregate.defaultRelayId);
  const defaultMemberIsOfficialLogin = !!defaultMemberCandidate
    && defaultMemberCandidate.relayMode === "official"
    && !defaultMemberCandidate.officialMixApiKey;
  const routes = aggregate.routes ?? [];
  const routeTargetOptions = aggregate.members
    .map((member) => {
      const candidate = candidates.find((item) => item.id === member.profileId);
      return { value: member.profileId, label: candidate?.name || t("未命名供应商") };
    })
    .filter((option) => option.value.trim() !== "");
  const updateRoute = (index: number, patch: Partial<RelayAggregateRoute>) => {
    updateAggregate({
      ...aggregate,
      routes: routes.map((route, routeIndex) => (routeIndex === index ? { ...route, ...patch } : route)),
    });
  };
  const removeRoute = (index: number) => {
    updateAggregate({ ...aggregate, routes: routes.filter((_, routeIndex) => routeIndex !== index) });
  };
  const addRoute = () => {
    updateAggregate({
      ...aggregate,
      routes: [...routes, { pattern: "", profileId: aggregate.members[0]?.profileId ?? "", priority: 0 }],
    });
  };

  return (
    <div className="relay-profile-editor aggregate-editor" data-aggregate-mode={modelMode ? "model" : "provider"}>
      <div className="relay-fields aggregate-fields">
        <Field className="relay-field-name" label={t("名称")}>
          <Input
            value={profile.name}
            onChange={(event) => onProfileChange({ ...profile, name: event.currentTarget.value })}
            placeholder={t("例如 主力聚合池")}
          />
        </Field>
        {!modelMode ? <Field className="relay-field-test-model" label={t("测试模型")}>
          <Input
            value={profile.testModel}
            onChange={(event) => onProfileChange({ ...profile, testModel: event.currentTarget.value })}
            placeholder={tf("留空使用默认：{0}", ["gpt-5.4-mini"])}
          />
        </Field> : null}
        {!modelMode ? (
          <Field className="aggregate-strategy-field" label={t("聚合策略")}>
            <AppSelect
              value={aggregate.strategy}
              onChange={(value) => updateAggregate({ ...aggregate, strategy: value })}
              options={aggregateStrategyOptions.map((option) => ({ value: option.value, label: option.label }))}
            />
          </Field>
        ) : null}
        <Field className="relay-field-session-provider" label={t("Codex 会话身份")}>
          <AppSelect
            value={sessionProvider}
            onChange={(value) => onProfileChange(normalizeAggregateRelayProfile({ ...profile, sessionProvider: value }, form))}
            options={[
              { value: "custom", label: t("Custom（默认）") },
              { value: "openai", label: t("OpenAI（兼容 ChatGPT Remote）") },
            ]}
          />
          <p className="field-hint">
            {modelMode
              ? t("模型聚合请求仍由本地 Responses 代理转发；OpenAI 身份用于让 ChatGPT Remote 识别会话。")
              : t("聚合请求仍由本地 Responses 代理轮转成员；OpenAI 身份用于让 ChatGPT Remote 识别会话。")}
          </p>
        </Field>
      </div>
      {!modelMode ? (
        <div className="aggregate-strategy-grid">
          {aggregateStrategyOptions.map((option) => (
            <button
              className={`mode-option aggregate-strategy-option ${aggregate.strategy === option.value ? "active" : ""}`}
              key={option.value}
              onClick={() => updateAggregate({ ...aggregate, strategy: option.value })}
              type="button"
            >
              <strong>{option.label}</strong>
              <span>{option.description}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="aggregate-model-mode-hint">
          <strong>{t("模型聚合已启用")}</strong>
          <span>{t("默认成员的模型以裸名发布、其他成员带 cpx- 前缀；勾选成员后点行尾「设为默认」指定默认供应商。本模式不使用轮转策略或通配符路由。")}</span>
        </div>
      )}
      <div className="aggregate-members">
        <div className="aggregate-members-head">
          <div>
            <strong>{t("成员供应商")}</strong>
            <span>{t("可勾选 API 供应商或已完成 ChatGPT 登录的官方账号；聚合供应商不会作为成员。")}</span>
          </div>
          <UiBadge variant="outline">{aggregate.members.length} / {candidates.length}</UiBadge>
        </div>
        {candidates.length ? (
          <div className="aggregate-member-list">
            {candidates.map((candidate) => {
              const member = aggregate.members.find((item) => item.profileId === candidate.id);
              const checked = memberIds.has(candidate.id);
              const isDefaultMember = !!aggregate.defaultRelayId && aggregate.defaultRelayId === candidate.id;
              // 只显示模型数量 + 行内「设为默认」：整串模型名会把每张卡片撑成不同高度。
              // 完整名单放 title；「默认」和勾选在同一行，不再需要下方单独的下拉。
              const memberModelNames = [...new Set([
                ...candidate.modelList.split(/[\r\n,]+/).map((line) => line.trim()).filter(Boolean),
                ...(candidate.model.trim() ? [candidate.model.trim()] : []),
              ])];
              return (
                <label className={`aggregate-member-row ${checked ? "selected" : ""}`} key={candidate.id}>
                  <input
                    checked={checked}
                    onChange={(event) => toggleMember(candidate.id, event.currentTarget.checked)}
                    type="checkbox"
                  />
                  <span className="aggregate-member-summary">
                    <span className="aggregate-member-title">
                      <strong>{candidate.name || t("未命名供应商")}</strong>
                    </span>
                    <small>
                      {relayProfileModeLabel(candidate)} · {relayProtocolLabel(candidate.protocol)} ·{" "}
                      {isOfficialLoginMemberProfile(candidate)
                        ? t("使用已登录的 ChatGPT 账号凭据")
                        : relayProfileConfigBrief(candidate)}
                    </small>
                  </span>
                  {modelMode ? (
                    <span className="aggregate-member-models">
                      <span
                        className="aggregate-member-models-count"
                        title={memberModelNames.length ? memberModelNames.join("\n") : undefined}
                      >
                        {memberModelNames.length
                          ? tf("{0} 个模型", [memberModelNames.length])
                          : (isOfficialLoginMemberProfile(candidate)
                            ? t("请填写该官方账号的模型列表")
                            : t("未填写模型"))}
                      </span>
                      {checked ? (isDefaultMember ? (
                        <UiBadge className="aggregate-member-default-badge" variant="secondary">
                          {t("默认")}
                        </UiBadge>
                      ) : (
                        <Button
                          className="aggregate-member-default-action"
                          onClick={(event) => {
                            // 行本身是 <label>：不拦默认行为会顺带切换勾选状态。
                            event.preventDefault();
                            event.stopPropagation();
                            updateAggregate({ ...aggregate, defaultRelayId: candidate.id });
                          }}
                          size="sm"
                          title={t("不带 cpx- 前缀的请求（旧会话、自动压缩带的模型名）会原样交给它")}
                          type="button"
                          variant="ghost"
                        >
                          {t("设为默认")}
                        </Button>
                      )) : null}
                    </span>
                  ) : (
                    <span className="aggregate-weight-box">
                      <span>{t("权重")}</span>
                      <Input
                        disabled={!checked}
                        min={1}
                        onChange={(event) => updateWeight(candidate.id, Number.parseInt(event.currentTarget.value, 10))}
                        type="number"
                        value={String(member?.weight ?? 1)}
                      />
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        ) : (
          <div className="empty">{t("先添加至少 1 个可用的 API 供应商或官方登录账号，再创建聚合供应商。")}</div>
        )}
      </div>
      {modelMode ? (
        <div className="aggregate-default-provider aggregate-default-hint">
          <span>
            {aggregate.defaultRelayId
              ? tf("默认供应商：{0}。不带 cpx- 前缀的请求（旧会话、自动压缩带的模型名等）会原样交给它；带 cpx- 前缀但解析不出来的 ID 一律报错，不回落。", [
                candidates.find((candidate) => candidate.id === aggregate.defaultRelayId)?.name || aggregate.defaultRelayId,
              ])
              : t("还没指定默认供应商：在上方成员行尾点「设为默认」。不带 cpx- 前缀的请求会原样交给它，没设就报错。")}
          </span>
          {defaultMemberIsOfficialLogin ? (
            <label className="aggregate-default-login-sync">
              <input
                checked={aggregate.syncDefaultMemberLogin === true}
                onChange={(event) => updateAggregate({
                  ...aggregate,
                  syncDefaultMemberLogin: event.currentTarget.checked,
                })}
                type="checkbox"
              />
              <span>
                <strong>{t("把默认成员的官方登录同步到 Codex")}</strong>
                <small>{t("开启后切换到本聚合时，会把默认成员的 ChatGPT 凭据一并写进 Codex（代理 Key 保留），账号在 Codex 里就是登录态。默认成员不是官方登录时无效。")}</small>
              </span>
            </label>
          ) : (
            <span className="aggregate-default-login-note">
              {t("当前默认成员不是官方登录账号，无法把登录同步到 Codex；只有「官方登录」类型的成员才有 ChatGPT 凭据。")}
            </span>
          )}
        </div>
      ) : null}
      {!modelMode ? <div className="aggregate-routes">
        <div className="aggregate-routes-head">
          <div>
            <strong>{t("路由规则")}</strong>
            <span>{t("按模型名自动路由到指定成员；仅支持 * 通配符，chat/completions 协议不走路由。")}</span>
          </div>
          <UiBadge variant="outline">{routes.length}</UiBadge>
        </div>
        {routes.length ? (
          <div className="aggregate-route-list">
            {routes.map((route, index) => (
              <div className="aggregate-route-row" key={index}>
                <Input
                  onChange={(event) => updateRoute(index, { pattern: event.currentTarget.value })}
                  placeholder={t("例如 deepseek-*")}
                  value={route.pattern}
                />
                <AppSelect
                  onChange={(value) => updateRoute(index, { profileId: value })}
                  options={routeTargetOptions}
                  value={route.profileId}
                />
                {!routeTargetOptions.some((option) => option.value === route.profileId) ? (
                  <span className="aggregate-route-target-error">{t("路由目标必须是已勾选的聚合成员，请先在成员供应商中勾选。")}</span>
                ) : null}
                <div className="aggregate-route-priority">
                  <span>{t("优先级")}</span>
                  <Input
                    min={0}
                    onChange={(event) =>
                      updateRoute(index, { priority: clampAggregateRoutePriority(Number.parseInt(event.currentTarget.value, 10)) })
                    }
                    type="number"
                    value={String(route.priority)}
                  />
                </div>
                <button
                  className="aggregate-route-remove"
                  onClick={() => removeRoute(index)}
                  title={t("删除规则")}
                  type="button"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">{t("暂无路由规则，未匹配的模型会按聚合策略选择成员。")}</div>
        )}
        <div>
          <Button disabled={!aggregate.members.length} onClick={addRoute} size="sm" variant="secondary">
            <Plus className="h-4 w-4" />
            {t("添加规则")}
          </Button>
        </div>
      </div> : null}
      {!modelMode ? (
        <>
          <div className="relay-grid compact aggregate-preview">
            <Metric label={t("策略")} value={aggregateStrategyLabel(aggregate.strategy)} />
            <Metric label={t("成员数量")} value={tf("{0} 个", [aggregate.members.length])} />
            <Metric label={t("总权重")} value={`${totalWeight}`} />
            <Metric label={t("序列化字段")} value="aggregate.strategy / aggregate.members / aggregate.routes" />
          </div>
          <div className="hint-line relay-protocol-hint">
            <ShieldCheck className="h-4 w-4" />
            <span>{aggregateStrategyHelp(aggregate.strategy)}</span>
          </div>
        </>
      ) : null}
    </div>
  );
}

function RelayContextManager({
  form,
  liveEntries,
  relayFiles,
  onFormChange,
  actions,
}: {
  form: BackendSettings;
  liveEntries: CodexContextEntries | null;
  relayFiles: RelayFilesResult | null;
  onFormChange: (value: BackendSettings) => void;
  actions: Actions;
}) {
  const entries = contextEntriesWithLiveEntries(form, liveEntries);
  const [activeKind, setActiveKind] = useState<ContextKind>("mcp");
  const [editor, setEditor] = useState<{ kind: ContextKind; entry?: CodexContextEntry } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [skillInventory, setSkillInventory] = useState<SkillInventoryResult | null>(null);
  const refreshSkillInventory = async () => {
    try {
      setSkillInventory(await invoke<SkillInventoryResult>("list_installed_skills"));
    } catch (error) {
      setSkillInventory({ status: "failed", message: stringifyError(error), skills: [], codexSkillsDir: "" });
      await actions.showMessage("Skills", stringifyError(error), "failed");
    }
  };
  useEffect(() => { void refreshSkillInventory(); }, []);
  const visibleEntries = contextEntriesByKind(entries, activeKind);
  const label = contextKindLabel(activeKind);

  const syncContextEntries = async (next: BackendSettings) => {
    const syncResult = await actions.syncLiveContextEntries(next, true);
    if (!syncResult || !isSuccessStatus(syncResult.status)) return false;
    await actions.refreshRelayFiles();
    return true;
  };

  const saveEntry = async (kind: ContextKind, id: string, tomlBody: string) => {
    const next = await actions.upsertContextEntry(form, kind, id, tomlBody);
    if (!next) return;
    onFormChange(next);
    if (!(await syncContextEntries(next))) return;
    setEditor(null);
  };

  const toggleContextEntryEnabled = async (entry: CodexContextEntry) => {
    const nextBody = setContextEntryEnabled(entry.tomlBody, !entry.enabled);
    const next = await actions.upsertContextEntry(form, entry.kind, entry.id, nextBody);
    if (!next) return;
    onFormChange(next);
    await syncContextEntries(next);
  };

  const deleteEntry = async (entry: CodexContextEntry) => {
    const next = await actions.deleteContextEntry(form, entry.kind, entry.id);
    if (!next) return;
    onFormChange(next);
    await syncContextEntries(next);
  };

  const importJson = async (json: string) => {
    const next = await actions.importMcpServersJson(form, json);
    if (!next) return;
    onFormChange(next);
    if (!(await syncContextEntries(next))) return;
    setImportOpen(false);
  };

  return (
    <div className="relay-context-panel">
      <div className="relay-context-head">
        <div>
          <strong>{t("Codex MCP&插件")}</strong>
          <span>{t("MCP 与插件作为全局配置独立管理，切换任意供应商都会合并。")}</span>
        </div>
        <div className="relay-context-head-actions">
          {activeKind === "mcp" ? (
            <Button
              onClick={() => {
                setEditor(null);
                setImportOpen(true);
              }}
              size="sm"
              variant="secondary"
            >
              <Download className="h-4 w-4" />
              {t("导入 JSON")}
            </Button>
          ) : null}
          {activeKind === "skill" ? (
            <Button onClick={() => void refreshSkillInventory()} size="sm" variant="secondary"><RefreshCw className="h-4 w-4" />{t("刷新列表")}</Button>
          ) : <Button onClick={() => setEditor({ kind: activeKind })} size="sm" variant="secondary">
            <Plus className="h-4 w-4" />
            {t("新增")}{label}
          </Button>}
        </div>
      </div>
      <div className="segmented">
        {contextKindOptions.map((option) => (
          <button
            className={activeKind === option.kind ? "active" : ""}
            key={option.kind}
            onClick={() => setActiveKind(option.kind)}
            type="button"
          >
            <span>{option.label}</span>
            <small>{option.kind === "skill" ? (skillInventory ? (isSuccessStatus(skillInventory.status) ? skillInventory.skills.length : "?") : "…") : contextEntriesByKind(entries, option.kind).length}</small>
          </button>
        ))}
      </div>
      <div className="relay-context-summary">
        {activeKind === "skill" ? <>{t("本地与内置 Skills 由 Codex 从目录发现。")}{skillInventory ? <span className="break-all"> {skillInventory.codexSkillsDir}</span> : null}</> : <>{t("当前共有")} {visibleEntries.length} {t("个")}{label}{t("；这些条目独立于供应商保存，会写入所有供应商切换后的 config.toml。")}</>}
      </div>
      <div className="relay-context-list">
        {activeKind === "skill" ? (
          !skillInventory ? <div className="empty">{t("正在读取 Skills…")}</div>
          : !isSuccessStatus(skillInventory.status) ? <div className="empty">{skillInventory.message}</div>
          : skillInventory.skills.length ? skillInventory.skills.map((skill) => (
            <div className="relay-context-row" key={`local-skill-${skill.id}`}>
              <div><strong className="context-title">{skill.name || skill.id}</strong><div className="text-xs">{skill.description}</div></div>
              <span>{skill.bundled ? t("内置") : t("本地")}{!skill.enabled ? ` · ${t("已停用")}` : ""}</span>
            </div>
          )) : <div className="empty">{t("Skills 目录中暂无技能。")}</div>
        ) : visibleEntries.length ? (
          visibleEntries.map((entry) => (
            <div className="relay-context-row" key={`${entry.kind}-${entry.id}`}>
              <strong className="context-title">{entry.title || entry.id}</strong>
              <div className="relay-context-actions">
                <button
                  aria-checked={entry.enabled}
                  aria-label={`contextEnabledSwitch-${entry.kind}-${entry.id}`}
                  className={`context-enabled-switch ${entry.enabled ? "active" : ""}`}
                  onClick={() => void toggleContextEntryEnabled(entry)}
                  role="switch"
                  title={entry.enabled ? t("禁用此扩展项") : t("启用此扩展项")}
                  type="button"
                >
                  <span className="context-switch-track" aria-hidden="true">
                    <span className="context-switch-thumb" />
                  </span>
                </button>
                <Button onClick={() => setEditor({ kind: entry.kind, entry })} size="icon" title={t("编辑扩展项")} variant="ghost">
                  <Edit3 className="h-4 w-4" />
                </Button>
                <Button
                  className="relay-context-delete"
                  onClick={() => void deleteEntry(entry)}
                  size="icon"
                  title={t("删除扩展项")}
                  variant="ghost"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))
        ) : (
          <div className="empty">{t("暂无")}{label}{t("，可以从通用配置文件或这里新增。")}</div>
        )}
      </div>
      {importOpen ? (
        <McpJsonImporter actions={actions} onCancel={() => setImportOpen(false)} onImport={importJson} />
      ) : null}
      {editor ? (
        <ContextEntryEditor
          entry={editor.entry}
          kind={editor.kind}
          onCancel={() => setEditor(null)}
          onSave={(kind, id, tomlBody) => void saveEntry(kind, id, tomlBody)}
        />
      ) : null}
    </div>
  );
}

function McpJsonImporter({
  actions,
  onCancel,
  onImport,
}: {
  actions: Actions;
  onCancel: () => void;
  onImport: (json: string) => void;
}) {
  const [json, setJson] = useState("");
  const [preview, setPreview] = useState<McpImportPreviewResult | null>(null);

  const runPreview = async () => {
    const result = await actions.previewMcpServersJson(json);
    setPreview(result && isSuccessStatus(result.status) ? result : null);
  };

  return (
    <div aria-modal="true" className="modal-backdrop" role="dialog">
      <div className="modal-card context-modal">
        <div className="modal-head">
          <div>
            <h2>{t("导入 MCP JSON")}</h2>
            <p className="modal-message">{t("支持 mcpServers / servers 包裹，也支持直接粘贴单个服务器配置。")}</p>
          </div>
          <button aria-label={t("关闭窗口")} className="toast-close" onClick={onCancel} type="button">×</button>
        </div>
        <Field label={t("MCP 配置 JSON")}>
          <Textarea
            className="context-editor-textarea"
            value={json}
            onChange={(event) => {
              setJson(event.currentTarget.value);
              setPreview(null);
            }}
            placeholder={'{\n  "mcpServers": {\n    "context7": {\n      "command": "npx",\n      "args": ["-y", "@upstash/context7-mcp"]\n    }\n  }\n}'}
            spellCheck={false}
          />
        </Field>
        {preview ? (
          <div className="relay-context-summary">
            <div>{tf("将导入 {0} 个：{1}", [preview.entries.length, preview.entries.map((item) => item.id).join("、")])}</div>
            {preview.warnings.map((warning) => <div key={warning}>{warning}</div>)}
          </div>
        ) : null}
        <Toolbar>
          <Button disabled={!json.trim()} onClick={() => void runPreview()} size="sm" variant="secondary">{t("预览")}</Button>
          <Button disabled={!preview} onClick={() => onImport(json)} size="sm">
            <Download className="h-4 w-4" />
            {t("确认导入")}
          </Button>
          <Button onClick={onCancel} size="sm" variant="secondary">{t("取消")}</Button>
        </Toolbar>
      </div>
    </div>
  );
}

function ContextEntryEditor({
  kind,
  entry,
  onCancel,
  onSave,
}: {
  kind: ContextKind;
  entry?: CodexContextEntry;
  onCancel: () => void;
  onSave: (kind: ContextKind, id: string, tomlBody: string) => void;
}) {
  const [draftKind, setDraftKind] = useState<ContextKind>(entry?.kind ?? kind);
  const [id, setId] = useState(entry?.id ?? "");
  const [tomlBody, setTomlBody] = useState(entry?.tomlBody ?? "");
  const canSave = id.trim().length > 0;

  return (
    <div className="context-editor">
      <div className="context-editor-fields">
        <Field label={t("类型")}>
          <AppSelect
            disabled={!!entry}
            value={draftKind}
            onChange={(value) => setDraftKind(value)}
            options={contextKindOptions.map((option) => ({ value: option.kind, label: option.label }))}
          />
        </Field>
        <Field label="ID">
          <Input
            disabled={!!entry}
            value={id}
            onChange={(event) => setId(event.currentTarget.value.trim())}
            placeholder={t("例如 context7")}
          />
        </Field>
      </div>
      <Field label={t("TOML 配置体")}>
        <Textarea
          className="context-editor-textarea"
          value={tomlBody}
          onChange={(event) => setTomlBody(event.currentTarget.value)}
          placeholder={t("只填写表头下面的内容，例如：\ncommand = \"npx\"\nargs = [\"-y\", \"@upstash/context7-mcp\"]")}
          spellCheck={false}
        />
      </Field>
      <Toolbar>
        <Button disabled={!canSave} onClick={() => onSave(draftKind, id.trim(), tomlBody)} size="sm">
          <Save className="h-4 w-4" />
          {t("保存扩展项")}
        </Button>
        <Button onClick={onCancel} size="sm" variant="secondary">{t("取消")}</Button>
      </Toolbar>
    </div>
  );
}

function SyncedTextarea({
  value,
  onValueChange,
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}) {
  const [localValue, setLocalValue] = useState(value);
  const isFocusedRef = useRef(false);
  const latestExternalValueRef = useRef(value);

  useEffect(() => {
    latestExternalValueRef.current = value;
    if (!isFocusedRef.current) {
      setLocalValue(value);
    }
  }, [value]);

  return (
    <Textarea
      className={className}
      value={localValue}
      onBlur={() => {
        isFocusedRef.current = false;
        setLocalValue(latestExternalValueRef.current);
      }}
      onChange={(event) => {
        const next = event.currentTarget.value;
        setLocalValue(next);
        onValueChange(next);
      }}
      onFocus={() => {
        isFocusedRef.current = true;
      }}
      spellCheck={false}
    />
  );
}

function RelayFileEditors({
  contextProfile,
  profile,
  form,
  isActive,
  profileId,
  onFormChange,
  onProfileChange,
  actions,
}: {
  contextProfile: RelayProfile;
  profile: RelayProfile;
  form: BackendSettings;
  isActive: boolean;
  profileId: string;
  onFormChange: (value: BackendSettings) => void;
  onProfileChange: (value: RelayProfile) => void;
  actions: Actions;
}) {
  const configPreview = effectiveRelayConfigPreview(profile, form, contextProfile);
  const entries = contextEntriesForProfile(form, contextProfile);
  return (
    <div className="relay-file-grid">
      <RelayFold className="relay-file-panel relay-config-preview" sectionId="config-preview" title={t("config.toml 预览")}>
        <p className="relay-fold-description">
          {isActive ? t("当前供应商切换后会写入的预览；上下文开关变化会立即反映") : t("切换到此供应商时会写入的预览；上下文开关变化会立即反映")}
        </p>
        <SyncedTextarea
          className="relay-file-textarea"
          value={configPreview}
          onValueChange={(value) => {
            const withoutCommon = stripCommonConfigTextFallback(
              value,
              relayCombinedCommonConfig(form),
            );
            const configContents = stripContextEntriesFromConfig(withoutCommon, entries);
            onProfileChange(deriveRelayProfileFromFiles({
              ...profile,
              configContents,
            }, "config"));
          }}
        />
      </RelayFold>
      <RelayFold
        bodyClassName="relay-common-config-body"
        className="relay-file-panel relay-common-config-panel"
        defaultOpen
        sectionId="common-config"
        title={t("通用配置文件")}
      >
        <p className="relay-fold-description">
          {t("只保留非 MCP、插件的跨供应商配置；MCP&插件在独立页面管理。点此展开编辑。")}
        </p>
            <Button
              onClick={async () => {
                const extracted = await actions.extractRelayCommonConfig(profile.configContents || "");
                if (!extracted) return;
                const split = splitContextConfigText(extracted.commonConfigContents || "");
                if (!split.common.trim() && !split.context.trim()) {
                  await actions.showMessage(t("通用配置文件"), t("当前供应商 config.toml 里没有可提取的通用配置。"), "failed");
                  return;
                }
                const promotedProfile = {
                  ...profile,
                  configContents: extracted.profileConfigContents,
                };
                const next = syncLegacyRelayFields({
                  ...form,
                  relayCommonConfigContents: split.common,
                  relayContextConfigContents: joinTomlSectionsRootFirst([form.relayContextConfigContents || "", split.context]),
                  relayProfiles: form.relayProfiles.map((item) => (item.id === profileId ? promotedProfile : item)),
                });
                onFormChange(next);
                onProfileChange(promotedProfile);
                await actions.saveSettingsValue(next, false);
              }}
              size="sm"
              type="button"
              variant="secondary"
            >
              <Download className="h-4 w-4" />
              {t("提取当前供应商配置")}
            </Button>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.relayPreserveNonproviderSettings === true}
              onChange={(event) => onFormChange({ ...form, relayPreserveNonproviderSettings: event.currentTarget.checked })} />
            {t("切换时保留缺失的项目信任设置与通知命令")}
          </label>
          <SyncedTextarea
            className="relay-file-textarea"
            value={form.relayCommonConfigContents}
            onValueChange={(value) => onFormChange({ ...form, relayCommonConfigContents: value })}
          />
      </RelayFold>
      <RelayFold className="relay-file-panel relay-auth-preview" defaultOpen sectionId="auth-preview" title="auth.json">
        <p className="relay-fold-description">
          {isActive
            ? profile.relayMode === "pureApi"
              ? t("当前使用中：保留此供应商的 auth 存档，避免 Codex 登录密钥覆盖供应商密钥")
              : t("当前使用中：打开时从 Codex 主目录的 auth.json 回填，保存后会作为此供应商 auth 存档")
            : t("切换到此供应商时会写入 Codex 主目录的 auth.json")}
        </p>
        <SyncedTextarea
          className="relay-file-textarea"
          value={profile.authContents}
          onValueChange={(value) => onProfileChange(deriveRelayProfileFromFiles({ ...profile, authContents: value }, "auth"))}
        />
      </RelayFold>
    </div>
  );
}

function ProviderDoctorModal({
  result,
  running,
  onClose,
}: {
  result: ProviderDoctorResult | null;
  running: boolean;
  onClose: () => void;
}) {
  const steps = providerDoctorSteps(result, running);
  const doneCount = steps.filter((step) => step.state === "ok" || step.state === "warning" || step.state === "failed").length;
  const progress = Math.round((doneCount / steps.length) * 100);
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card provider-doctor-modal">
        <div className="modal-head">
          <div>
            <h2>Provider Doctor</h2>
            <p>{running ? t("正在诊断供应商，请稍候。") : result?.summary ?? t("诊断已完成。")}</p>
          </div>
          <UiBadge variant={result && !isSuccessStatus(result.status) ? "outline" : "secondary"}>
            {running ? t("诊断中") : result && !isSuccessStatus(result.status) ? t("异常") : t("完成")}
          </UiBadge>
        </div>
        <div className="provider-doctor-progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} role="progressbar">
          <div style={{ width: `${progress}%` }} />
        </div>
        <div className="provider-doctor-step-list">
          {steps.map((step) => (
            <div className={`provider-doctor-step ${step.state}`} key={step.id}>
              <span className="provider-doctor-step-icon">
                {step.state === "running" ? (
                  <RefreshCw className="h-4 w-4" />
                ) : step.state === "ok" ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : step.state === "warning" ? (
                  <ShieldAlert className="h-4 w-4" />
                ) : step.state === "failed" ? (
                  <Info className="h-4 w-4" />
                ) : (
                  <span />
                )}
              </span>
              <div>
                <strong>{step.title}</strong>
                <small>{step.detail}</small>
              </div>
            </div>
          ))}
        </div>
        {result?.recommendation ? <p className="provider-doctor-recommendation">{result.recommendation}</p> : null}
        <div className="modal-actions">
          <Button disabled={running} onClick={onClose} variant="secondary">
            {running ? t("诊断中") : t("关闭")}
          </Button>
        </div>
      </div>
    </div>
  );
}

type ProviderDoctorStepState = "pending" | "running" | "ok" | "warning" | "failed";

function providerDoctorSteps(
  result: ProviderDoctorResult | null,
  running: boolean,
): Array<{ id: string; title: string; detail: string; state: ProviderDoctorStepState }> {
  const base = [
    { id: "config", title: t("配置完整性"), pending: t("等待检查 Base URL / API Key。") },
    { id: "models", title: t("模型列表"), pending: t("等待检查 /v1/models。") },
    { id: "request", title: t("真实请求"), pending: t("等待发送一次测试请求。") },
    { id: "recommendation", title: t("处理建议"), pending: t("等待生成建议。") },
  ];
  if (!result) {
    return base.map((step, index) => ({
      id: step.id,
      title: step.title,
      detail: index === 0 && running ? t("正在检查配置完整性…") : step.pending,
      state: index === 0 && running ? "running" : "pending",
    }));
  }
  const checks = new Map(result.checks.map((check) => [check.id, check]));
  return base.map((step) => {
    if (step.id === "recommendation") {
      return {
        id: step.id,
        title: step.title,
        detail: result.recommendation || step.pending,
        state: result.status === "failed" ? "warning" : "ok",
      };
    }
    const check = checks.get(step.id);
    if (!check) {
      return {
        id: step.id,
        title: step.title,
        detail: step.id === "models" || step.id === "request" ? t("该步骤未执行。") : step.pending,
        state: "pending",
      };
    }
    return {
      id: step.id,
      title: check.title || step.title,
      detail: check.detail,
      state: check.status === "ok" ? "ok" : check.status === "warning" ? "warning" : "failed",
    };
  });
}

function FeatureItem({ title, detail, enabled }: { title: string; detail: string; enabled: boolean }) {
  return (
    <div className="feature-item">
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
      <Badge status={enabled ? "ok" : "disabled"} />
    </div>
  );
}

function FeatureToggle({
  title,
  detail,
  checked,
  disabled = false,
  onChange,
}: {
  title: string;
  detail: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className={`feature-toggle ${disabled ? "disabled" : ""}`}>
      <input
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
        type="checkbox"
      />
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      <ToggleVisual />
    </label>
  );
}

function ToggleVisual() {
  return (
    <span aria-hidden="true" className="toggle-switch-visual">
      <span className="toggle-switch-thumb" />
    </span>
  );
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

function formatProgressPercent(value: number): string {
  if (!Number.isFinite(value)) return "0.00";
  return Math.min(100, Math.max(0, value)).toFixed(2);
}

function GuideList({ items }: { items: string[] }) {
  return (
    <div className="guide-list">
      {items.map((item, index) => (
        <div className="guide-step" key={item}>
          <span>{index + 1}</span>
          <p>{item}</p>
        </div>
      ))}
    </div>
  );
}

function NoticeDialog({
  notice,
  onClose,
}: {
  notice: { title: string; message: string; status?: Status };
  onClose: () => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, 4200);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="toast-wrap" role="status" aria-live="polite">
      <div className={`toast-card ${notice.status === "failed" ? "failed" : ""}`}>
        <div className="toast-progress" />
        <div className="toast-icon">
          {notice.status === "failed" ? <Bell className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
        </div>
        <div className="toast-body">
          <h2>{notice.title}</h2>
          <p>{notice.message}</p>
        </div>
        <button className="toast-close" onClick={onClose} type="button">×</button>
      </div>
    </div>
  );
}

function ConfirmDialog({
  confirm,
  onConfirm,
  onCancel,
}: {
  confirm: { title: string; message: string; confirmText: string; cancelText: string };
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card confirm-modal">
        <div className="modal-head">
          <div>
            <h2>{confirm.title}</h2>
          </div>
          <button className="toast-close" onClick={onCancel} type="button">×</button>
        </div>
        <div className="confirm-modal-body">
          <p className="modal-message">{confirm.message}</p>
        </div>
        <Toolbar className="confirm-modal-actions">
          <Button onClick={onConfirm}>
            <Trash2 className="h-4 w-4" />
            {confirm.confirmText}
          </Button>
          <Button onClick={onCancel} variant="secondary">{confirm.cancelText}</Button>
        </Toolbar>
      </div>
    </div>
  );
}

function SessionIndexCleanupDialog({
  request,
  onConfirm,
  onCancel,
}: {
  request: { candidates: SessionIndexCleanupCandidate[] };
  onConfirm: (selectedIds: string[]) => void;
  onCancel: () => void;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const allSelected = request.candidates.length > 0 && selectedIds.size === request.candidates.length;
  const toggleCandidate = (id: string, selected: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card session-index-cleanup-modal">
        <div className="modal-head">
          <div>
            <h2>{t("清理幽灵任务索引")}</h2>
            <p className="modal-message">
              {tf("发现 {0} 条仅存在于 session_index.jsonl、未在本地数据库或 rollout 中找到来源的候选记录。它们也可能是云端或尚未落盘的任务，请逐项核对。任务标题仅用于预览，实际按 thread ID 与数据来源判断。清理前请先完全退出 Codex App / ChatGPT。", [request.candidates.length])}
            </p>
          </div>
          <button className="toast-close" onClick={onCancel} type="button">×</button>
        </div>
        <label className="session-index-cleanup-select-all">
          <input
            checked={allSelected}
            onChange={(event) => {
              setSelectedIds(event.target.checked ? new Set(request.candidates.map((candidate) => candidate.id)) : new Set());
            }}
            type="checkbox"
          />
          <span>{t("选择全部候选记录")}</span>
        </label>
        <div className="session-index-cleanup-list">
          {request.candidates.map((candidate) => (
            <label className="session-index-cleanup-item" key={candidate.id}>
              <input
                checked={selectedIds.has(candidate.id)}
                onChange={(event) => toggleCandidate(candidate.id, event.target.checked)}
                type="checkbox"
              />
              <span>
                <strong>{candidate.threadName || t("未命名任务")}</strong>
                <code>{candidate.id}</code>
                <small>{candidate.updatedAt}</small>
              </span>
            </label>
          ))}
        </div>
        <Toolbar>
          <Button disabled={selectedIds.size === 0} onClick={() => onConfirm(Array.from(selectedIds))}>
            <Trash2 className="h-4 w-4" />
            {tf("确认清理 {0} 条", [selectedIds.size])}
          </Button>
          <Button onClick={onCancel} variant="secondary">{t("取消")}</Button>
        </Toolbar>
      </div>
    </div>
  );
}

function PendingProviderImportDialog({
  request,
  onConfirm,
  onDismiss,
}: {
  request: ProviderImportRequest;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card provider-import-modal">
        <div className="modal-head">
          <div>
            <h2>{t("导入 Codex++ 供应商")}</h2>
            <p>{t("检测到来自网页的供应商配置导入请求，确认后会写入本机 Codex++。")}</p>
          </div>
          <button className="toast-close" onClick={onDismiss} type="button">×</button>
        </div>
        <div className="metric-list">
          <Metric label={t("名称")} value={request.name || t("未命名供应商")} />
          <Metric label="Base URL" value={request.baseUrl || t("未填写")} />
          <Metric label={t("协议")} value={providerImportWireApiLabel(request.wireApi)} />
          <Metric label={t("模式")} value={providerImportRelayModeLabel(request.relayMode)} />
          <Metric label="API Key" value={maskSecret(request.apiKey)} />
        </div>
        <div className="hint-line" role="note">
          {t("安全提示：网页链接中的自定义 config.toml 和 auth.json 不会执行；管理工具只会使用上方字段生成受管配置。")}
        </div>
        <Toolbar>
          <Button onClick={onConfirm}>
            <Download className="h-4 w-4" />
            {t("确认导入")}
          </Button>
          <Button onClick={onDismiss} variant="secondary">{t("取消")}</Button>
        </Toolbar>
      </div>
    </div>
  );
}

function TaskProgressBox({ progress, title, completedTitle = t("上次修复结果") }: { progress: TaskProgress; title: string; completedTitle?: string }) {
  if (!progress.active && progress.percent <= 0 && !progress.failed) return null;
  return (
    <div className="provider-sync-progress task-progress" data-active={progress.active}>
      <div className="provider-sync-progress-head">
        <strong>{progress.active ? title : completedTitle}</strong>
        <span>{progress.indeterminate || progress.failed ? null : `${formatProgressPercent(progress.percent)}%`}</span>
      </div>
      {!progress.failed ? <div
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={progress.indeterminate ? undefined : progress.percent}
        className="provider-sync-progress-bar"
        data-indeterminate={progress.indeterminate ? "true" : undefined}
        role="progressbar"
      >
        <div
          className="provider-sync-progress-fill"
          style={progress.indeterminate ? undefined : { width: `${progress.percent}%` }}
        />
      </div> : null}
      <small>{progress.message}</small>
    </div>
  );
}

function Panel({ children, fill = false, className = "" }: { children: React.ReactNode; fill?: boolean; className?: string }) {
  return (
    <Card className={`panel ${fill ? "fill" : ""} ${className}`}>
      {children}
    </Card>
  );
}

function CardHead({ title, detail }: { title: string; detail: string }) {
  return (
    <CardHeader className="panel-head">
      <CardTitle>{title}</CardTitle>
      <CardDescription>{detail}</CardDescription>
    </CardHeader>
  );
}

function Toolbar({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`toolbar ${className}`.trim()}>{children}</div>;
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <Label className={`field ${className}`}>
      <span>{label}</span>
      {children}
    </Label>
  );
}

type AppSelectOption<T extends string> = {
  value: T;
  label: ReactNode;
  disabled?: boolean;
  title?: string;
};

function AppSelect<T extends string>({
  value,
  options,
  onChange,
  disabled = false,
  className = "",
  title = "",
  ariaLabel,
}: {
  value: T;
  options: AppSelectOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
  title?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) || options[0];
  const selectOption = (option: AppSelectOption<T>) => {
    if (option.disabled) return;
    onChange(option.value);
    setOpen(false);
  };
  const { rootRef, menuRef, menuStyle } = usePopoverLayer({
    open: open && !disabled,
    onOpenChange: setOpen,
    minWidth: 180,
    maxHeight: 260,
  });
  return (
    <div
      className={`app-select ${open ? "open" : ""} ${disabled ? "disabled" : ""} ${className}`.trim()}
      ref={rootRef}
    >
      <button
        aria-expanded={open}
        aria-label={ariaLabel}
        className="app-select-trigger"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        title={title}
        type="button"
      >
        <span>{selected?.label ?? value}</span>
        <ChevronDown className="h-4 w-4" />
      </button>
      {open && !disabled ? createPortal(
        <div
          className={`app-select-menu app-select-menu-portal ${className}`.trim()}
          ref={menuRef}
          role="listbox"
          style={menuStyle}
        >
          {options.map((option) => (
            <button
              aria-selected={option.value === value}
              className={`app-select-option ${option.value === value ? "selected" : ""}`}
              disabled={option.disabled}
              key={option.value}
              onClick={() => selectOption(option)}
              onMouseDown={(event) => {
                event.preventDefault();
                selectOption(option);
              }}
              title={option.title}
              type="button"
            >
              {option.value === value ? <CheckCircle2 className="h-4 w-4" /> : <span className="app-select-option-spacer" />}
              <span>{option.label}</span>
            </button>
          ))}
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

function StatusRow({ title, status = "unknown", path }: { title: string; status?: string; path?: string | null }) {
  return (
    <div className="status-row">
      <span>{title}</span>
      <Badge status={status} />
      <code>{path || t("未记录路径")}</code>
    </div>
  );
}

function Badge({ status }: { status: string }) {
  return <UiBadge className={statusClass(status)} variant="secondary">{statusLabel(status)}</UiBadge>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function routeTitle(route: Route) {
  return routes.find((item) => item.id === route)?.label ?? t("概览");
}

function routeSubtitle(route: Route) {
  const subtitles: Record<Route, string> = {
    overview: t("应用路径与运行状态"),
    relay: t("管理 API 供应商、协议、Key 与配置文件"),
    sessions: t("查看、删除和修复 Codex 本地会话"),
    context: t("独立管理 MCP 服务器与插件"),
    skills: t("从 GitHub 仓库安装 Skill 到 Codex"),
    enhance: t("管理 Codex 常用增强功能。"),
  };
  return subtitles[route];
}

const contextKindOptions: Array<{ kind: ContextKind; label: string; tableName: string }> = [
  { kind: "mcp", label: "MCP", tableName: "mcp_servers" },
  { kind: "skill", label: "Skills", tableName: "skills" },
  { kind: "plugin", get label() { return t("插件"); }, tableName: "plugins" },
];

function contextKindLabel(kind: ContextKind) {
  return contextKindOptions.find((option) => option.kind === kind)?.label ?? t("扩展项");
}

function contextEntriesFromSettings(settings: BackendSettings): CodexContextEntries {
  const commonConfig = normalizeDuplicateTomlTables(settings.relayContextConfigContents || "");
  return {
    mcpServers: parseContextEntries(commonConfig, "mcp", "mcp_servers"),
    skills: parseContextEntries(commonConfig, "skill", "skills"),
    plugins: parseContextEntries(commonConfig, "plugin", "plugins"),
  };
}

function contextEntriesWithLiveEntries(settings: BackendSettings, liveEntries: CodexContextEntries | null): CodexContextEntries {
  const commonEntries = contextEntriesFromSettings(settings);
  if (!liveEntries) return commonEntries;
  const liveByKind: Record<ContextKind, Map<string, CodexContextEntry>> = {
    mcp: new Map(liveEntries.mcpServers.map((entry) => [entry.id, entry])),
    skill: new Map(liveEntries.skills.map((entry) => [entry.id, entry])),
    plugin: new Map(liveEntries.plugins.map((entry) => [entry.id, entry])),
  };
  return {
    mcpServers: mergeLiveContextEntries(commonEntries.mcpServers, liveByKind.mcp),
    skills: mergeLiveContextEntries(commonEntries.skills, liveByKind.skill),
    plugins: mergeLiveContextEntries(commonEntries.plugins, liveByKind.plugin),
  };
}

function mergeLiveContextEntries(entries: CodexContextEntry[], liveEntries: Map<string, CodexContextEntry>): CodexContextEntry[] {
  const uniqueEntries = dedupeContextEntryList(entries);
  const merged = uniqueEntries.map((entry) => {
    const live = liveEntries.get(entry.id);
    return withLiveEntryState(entry, live);
  });
  const knownIds = new Set(uniqueEntries.map((entry) => entry.id));
  for (const liveEntry of liveEntries.values()) {
    if (!knownIds.has(liveEntry.id)) merged.push(liveEntry);
  }
  return merged;
}

function withLiveEntryState(entry: CodexContextEntry, live?: CodexContextEntry): CodexContextEntry {
  return live ? { ...entry, enabled: live.enabled } : entry;
}

function contextEntriesForProfile(settings: BackendSettings, profile: RelayProfile): CodexContextEntries {
  return filterContextEntriesBySelection(contextEntriesFromSettings(settings), profile.contextSelection);
}

function contextEntriesFromConfig(configContents: string): CodexContextEntries {
  return {
    mcpServers: parseContextEntries(configContents, "mcp", "mcp_servers"),
    skills: parseContextEntries(configContents, "skill", "skills"),
    plugins: parseContextEntries(configContents, "plugin", "plugins"),
  };
}

function mergeContextEntries(primary: CodexContextEntries, secondary: CodexContextEntries): CodexContextEntries {
  return {
    mcpServers: mergeContextEntryList(primary.mcpServers, secondary.mcpServers),
    skills: mergeContextEntryList(primary.skills, secondary.skills),
    plugins: mergeContextEntryList(primary.plugins, secondary.plugins),
  };
}

function mergeContextEntryList(primary: CodexContextEntry[], secondary: CodexContextEntry[]): CodexContextEntry[] {
  return dedupeContextEntryList([...primary, ...secondary]);
}

function dedupeContextEntryList(entries: CodexContextEntry[]): CodexContextEntry[] {
  const byId = new Map<string, CodexContextEntry>();
  for (const entry of entries) {
    byId.set(entry.id, entry);
  }
  return Array.from(byId.values());
}

function parseContextEntries(commonConfig: string, kind: ContextKind, tableName: string): CodexContextEntry[] {
  const anyHeaderPattern = /^\s*\[[^\]]+\]\s*$/;
  const entries = new Map<string, CodexContextEntry>();
  let currentId: string | null = null;
  let body: string[] = [];

  const flush = () => {
    if (!currentId) return;
    const tomlBody = ensureTrailingNewline(body.join("\n").trimEnd());
    entries.set(currentId, {
      id: currentId,
      kind,
      title: currentId,
      summary: contextEntrySummary(tomlBody),
      tomlBody,
      enabled: contextEntryEnabled(tomlBody),
    });
  };

  for (const line of commonConfig.split(/\r?\n/)) {
    const path = tomlTablePathFromLine(line);
    if (path?.[0] === tableName && path.length >= 2) {
      const id = path[1];
      if (currentId === id && path.length > 2) {
        body.push(`[${path.slice(2).map(tomlKey).join(".")}]`);
        continue;
      }
      flush();
      currentId = id;
      body = [];
      continue;
    }
    if (currentId && anyHeaderPattern.test(line)) {
      flush();
      currentId = null;
      body = [];
      continue;
    }
    if (currentId) body.push(line);
  }
  flush();

  return Array.from(entries.values());
}

function tomlTablePathFromLine(line: string): string[] | null {
  const match = /^\s*\[([^\]]+)\]\s*$/.exec(line);
  if (!match) return null;
  return parseTomlDottedPath(match[1].trim());
}

function parseTomlDottedPath(path: string): string[] | null {
  const parts: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let escaping = false;

  for (const char of path) {
    if (quote) {
      if (quote === '"' && escaping) {
        current += char;
        escaping = false;
      } else if (quote === '"' && char === "\\") {
        escaping = true;
      } else if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === ".") {
      if (!current.trim()) return null;
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  if (quote || escaping || !current.trim()) return null;
  parts.push(current.trim());
  return parts;
}

function contextEntrySummary(tomlBody: string) {
  return tomlBody
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#") && !/^enabled\s*=/.test(line))
    ?.slice(0, 96) ?? "";
}

function contextEntryEnabled(tomlBody: string) {
  return !tomlBody.split(/\r?\n/).some((line) => /^\s*enabled\s*=\s*false\s*(#.*)?$/i.test(line));
}

function setContextEntryEnabled(tomlBody: string, enabled: boolean) {
  const lines = tomlBody.trimEnd().split(/\r?\n/);
  const nextValue = `enabled = ${enabled ? "true" : "false"}`;
  let replaced = false;
  const next = lines.map((line) => {
    if (/^\s*enabled\s*=/.test(line)) {
      replaced = true;
      return nextValue;
    }
    return line;
  });
  if (!replaced) next.unshift(nextValue);
  return ensureTrailingNewline(next.join("\n").trimEnd());
}

function ensureTrailingNewline(value: string) {
  return value.trim() ? `${value}\n` : "";
}

function unquoteTomlKey(key: string) {
  if (key.length >= 2 && ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'")))) {
    return key.slice(1, -1);
  }
  return key;
}

function contextEntriesByKind(entries: CodexContextEntries, kind: ContextKind): CodexContextEntry[] {
  if (kind === "mcp") return dedupeContextEntryList(entries.mcpServers);
  if (kind === "skill") return dedupeContextEntryList(entries.skills);
  return dedupeContextEntryList(entries.plugins);
}

function filterContextEntriesBySelection(entries: CodexContextEntries, selection: RelayContextSelection): CodexContextEntries {
  const selected = {
    mcp: new Set(selection.mcpServers.map((id) => id.trim()).filter(Boolean)),
    skill: new Set(selection.skills.map((id) => id.trim()).filter(Boolean)),
    plugin: new Set(selection.plugins.map((id) => id.trim()).filter(Boolean)),
  };
  return {
    mcpServers: entries.mcpServers.filter((entry) => selected.mcp.has(entry.id)),
    skills: entries.skills.filter((entry) => selected.skill.has(entry.id)),
    plugins: entries.plugins.filter((entry) => selected.plugin.has(entry.id)),
  };
}

function effectiveRelayConfigPreview(profile: RelayProfile, settings: BackendSettings, contextProfile = profile): string {
  const entries = contextEntriesForProfile(settings, contextProfile);
  const isolatedConfig = stripContextEntriesFromConfig(profile.configContents, entries);
  const configWithLimits = applyContextLimitPreview(isolatedConfig, profile);
  const profileAndCommon = mergeFeaturesTableForPreview(configWithLimits, settings.relayCommonConfigContents || "");
  return joinTomlSectionsRootFirst([profileAndCommon, selectedContextConfigToml(entries)]);
}

function mergeFeaturesTableForPreview(profileConfig: string, commonConfig: string): string {
  const profile = splitFeaturesTable(profileConfig);
  const common = splitFeaturesTable(commonConfig);
  if (!profile.body && !common.body) return joinTomlSectionsRootFirst([profileConfig, commonConfig]);

  const profileKeys = new Set(tomlAssignmentKeys(profile.body));
  const commonBody = common.body
    .split(/\r?\n/)
    .filter((line) => {
      const key = tomlAssignmentKey(line);
      return !key || !profileKeys.has(key);
    })
    .join("\n");
  const mergedFeatures = ["[features]", commonBody, profile.body]
    .filter((part) => part.trim())
    .join("\n");
  return joinTomlSectionsRootFirst([
    profile.without,
    common.without,
    mergedFeatures,
  ]);
}

function splitFeaturesTable(contents: string): { without: string; body: string } {
  const lines = contents.trim().split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === "[features]");
  if (start < 0) return { without: contents, body: "" };
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^\s*\[[^\]]+\]\s*$/.test(lines[index])) {
      end = index;
      break;
    }
  }
  return {
    without: [...lines.slice(0, start), ...lines.slice(end)].join("\n"),
    body: lines.slice(start + 1, end).join("\n"),
  };
}

function tomlAssignmentKey(line: string): string | undefined {
  return /^\s*([A-Za-z0-9_-]+)\s*=/.exec(line)?.[1];
}

function tomlAssignmentKeys(contents: string): string[] {
  return contents.split(/\r?\n/).map(tomlAssignmentKey).filter((key): key is string => Boolean(key));
}

function selectedContextConfigToml(entries: CodexContextEntries): string {
  const sections: string[] = [];
  for (const option of contextKindOptions) {
    for (const entry of dedupeContextEntryList(contextEntriesByKind(entries, option.kind))) {
      if (!entry.enabled) continue;
      sections.push(contextEntryToTomlSection(option.tableName, entry));
    }
  }
  return ensureTrailingNewline(sections.join("\n\n"));
}

function allContextConfigToml(entries: CodexContextEntries): string {
  const sections: string[] = [];
  for (const option of contextKindOptions) {
    for (const entry of dedupeContextEntryList(contextEntriesByKind(entries, option.kind))) {
      sections.push(contextEntryToTomlSection(option.tableName, entry));
    }
  }
  return ensureTrailingNewline(sections.join("\n\n"));
}

function contextEntryToTomlSection(tableName: string, entry: CodexContextEntry): string {
  const parentHeader = `[${tableName}.${tomlKey(entry.id)}]`;
  const body = entry.tomlBody
    .trimEnd()
    .split(/\r?\n/)
    .map((line) => relativeContextSubtableToAbsolute(line, tableName, entry.id))
    .join("\n");
  return `${parentHeader}\n${body}`;
}

function relativeContextSubtableToAbsolute(line: string, tableName: string, id: string): string {
  const match = /^\s*\[([^\]]+)\]\s*$/.exec(line);
  if (!match) return line;
  const subtable = match[1].trim();
  if (!subtable || subtable.includes(".")) return line;
  return `[${tableName}.${tomlKey(id)}.${tomlKey(subtable)}]`;
}

function syncLiveConfigContextState(liveConfigContents: string, settings: BackendSettings): string {
  const entries = contextEntriesFromSettings(settings);
  const withoutManaged = stripContextEntriesFromConfig(liveConfigContents, entries);
  return joinTomlSectionsRootFirst([withoutManaged, selectedContextConfigToml(entries)]);
}

function relayCombinedCommonConfig(settings: BackendSettings): string {
  return joinTomlSectionsRootFirst([settings.relayCommonConfigContents || "", settings.relayContextConfigContents || ""]);
}

function splitContextConfigText(configContents: string): { common: string; context: string } {
  const entries = contextEntriesFromConfig(configContents);
  return {
    common: stripContextEntriesFromConfig(configContents, entries),
    context: allContextConfigToml(entries),
  };
}

function stripContextEntriesFromConfig(configContents: string, entries: CodexContextEntries): string {
  const knownIds: Record<ContextKind, Set<string>> = {
    mcp: new Set(entries.mcpServers.map((entry) => entry.id)),
    skill: new Set(entries.skills.map((entry) => entry.id)),
    plugin: new Set(entries.plugins.map((entry) => entry.id)),
  };
  const lines = configContents.split(/\r?\n/);
  const kept: string[] = [];
  let skipping = false;

  for (const line of lines) {
    const contextHeader = contextHeaderFromLine(line);
    if (contextHeader) {
      skipping = knownIds[contextHeader.kind].has(contextHeader.id);
    } else if (/^\s*\[[^\]]+\]\s*$/.test(line)) {
      skipping = false;
    }
    if (!skipping) kept.push(line);
  }

  return ensureTrailingNewline(kept.join("\n").trimEnd());
}

function stripCommonConfigTextFallback(configContents: string, commonConfig: string): string {
  const anchors = commonConfigAnchors(commonConfig);
  if (!anchors.rootKeys.size && !anchors.tableHeaders.size) return ensureTrailingNewline(configContents.trimEnd());

  const kept: string[] = [];
  let skippingTable = false;

  for (const line of configContents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^\[[^\]]+\]$/.test(trimmed)) {
      skippingTable = anchors.tableHeaders.has(trimmed);
      if (skippingTable) continue;
    }
    if (skippingTable) continue;
    const key = tomlRootKeyFromLine(trimmed);
    if (key && anchors.rootKeys.has(key)) continue;
    kept.push(line);
  }

  return ensureTrailingNewline(kept.join("\n").trimEnd());
}

function commonConfigAnchors(commonConfig: string): { rootKeys: Set<string>; tableHeaders: Set<string> } {
  const rootKeys = new Set<string>();
  const tableHeaders = new Set<string>();
  let inRoot = true;

  for (const line of commonConfig.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^\[[^\]]+\]$/.test(trimmed)) {
      inRoot = false;
      tableHeaders.add(trimmed);
      continue;
    }
    if (inRoot) {
      const key = tomlRootKeyFromLine(trimmed);
      if (key) rootKeys.add(key);
    }
  }

  return { rootKeys, tableHeaders };
}

function tomlRootKeyFromLine(line: string): string | null {
  if (!line || line.startsWith("#")) return null;
  const index = line.indexOf("=");
  if (index < 0) return null;
  const key = line.slice(0, index).trim();
  return key || null;
}

function contextHeaderFromLine(line: string): { kind: ContextKind; id: string } | null {
  const path = tomlTablePathFromLine(line);
  if (!path || path.length !== 2) return null;
  const option = contextKindOptions.find((item) => item.tableName === path[0]);
  return option ? { kind: option.kind, id: path[1] } : null;
}

function applyContextLimitPreview(configContents: string, profile: RelayProfile): string {
  const replacements: Array<[string, string]> = [
    ["model_context_window", profile.contextWindow],
    ["model_auto_compact_token_limit", profile.autoCompactLimit],
  ];
  let lines = configContents.split(/\r?\n/);

  for (const [key, value] of replacements) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    let replaced = false;
    lines = lines.map((line) => {
      if (!replaced && new RegExp(`^\\s*${key}\\s*=`).test(line)) {
        replaced = true;
        return `${key} = ${trimmed}`;
      }
      return line;
    });
    if (!replaced) {
      const firstTable = lines.findIndex((line) => /^\s*\[[^\]]+\]\s*$/.test(line));
      const insertAt = firstTable >= 0 ? firstTable : lines.length;
      lines.splice(insertAt, 0, `${key} = ${trimmed}`);
    }
  }

  return ensureTrailingNewline(lines.join("\n").trimEnd());
}

function removeRootTomlKey(contents: string, key: string): string {
  const lines: string[] = [];
  let inRoot = true;
  const sourceLines = contents.split(/\r?\n/);
  const structural = tomlStructureMask(sourceLines);
  for (const [index, line] of sourceLines.entries()) {
    if (structural[index] && tomlSectionName(line) !== null) inRoot = false;
    const assignment = tomlKeyAssignment(line);
    if (structural[index] && inRoot && assignment?.path.length === 1 && assignment.path[0] === key) continue;
    lines.push(line);
  }
  return ensureTrailingNewline(lines.join("\n").trimEnd());
}

function joinTomlSections(sections: string[]): string {
  return ensureTrailingNewline(
    sections
      .map((section) => section.trim())
      .filter(Boolean)
      .join("\n\n"),
  );
}

function joinTomlSectionsRootFirst(sections: string[]): string {
  const rootParts: string[] = [];
  const tableParts: string[] = [];

  for (const section of sections) {
    const { root, tables } = splitTomlRootAndTables(section);
    if (root.trim()) rootParts.push(root.trim());
    if (tables.trim()) tableParts.push(tables.trim());
  }

  return normalizeDuplicateTomlTables(joinTomlSections([...dedupeTomlRootLines(rootParts), ...tableParts]));
}

function normalizeDuplicateTomlTables(contents: string): string {
  const seenHeaders = new Set<string>();
  const kept: string[] = [];
  let skipping = false;

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^\[[^\]]+\]$/.test(trimmed)) {
      skipping = seenHeaders.has(trimmed);
      seenHeaders.add(trimmed);
      if (skipping) continue;
    }
    if (!skipping) kept.push(line);
  }

  return ensureTrailingNewline(kept.join("\n").trimEnd());
}

function dedupeTomlRootLines(rootParts: string[]): string[] {
  const rootLines = rootParts
    .join("\n")
    .split(/\r?\n/)
    .map((line) => line.trimEnd());
  const rootSeen = new Set<string>();
  const kept: string[] = [];

  for (let index = rootLines.length - 1; index >= 0; index -= 1) {
    const line = rootLines[index];
    const key = tomlRootKeyFromLine(line.trim());
    if (key) {
      if (rootSeen.has(key)) continue;
      rootSeen.add(key);
    }
    kept.push(line);
  }

  const normalized = kept.reverse().join("\n").trim();
  return normalized ? [normalized] : [];
}

function splitTomlRootAndTables(section: string): { root: string; tables: string } {
  const lines = section.trim().split(/\r?\n/);
  const structural = tomlStructureMask(lines);
  const firstTable = lines.findIndex((line, index) => structural[index] && tomlSectionName(line) !== null);
  if (firstTable < 0) return { root: lines.join("\n"), tables: "" };
  return {
    root: lines.slice(0, firstTable).join("\n"),
    tables: lines.slice(firstTable).join("\n"),
  };
}

function tomlKey(key: string): string {
  return /^[A-Za-z0-9_-]+$/.test(key) ? key : `"${tomlString(key)}"`;
}

function contextSelectionIds(selection: RelayContextSelection, kind: ContextKind): string[] {
  if (kind === "mcp") return selection.mcpServers;
  if (kind === "skill") return selection.skills;
  return selection.plugins;
}

function setContextSelectionId(selection: RelayContextSelection, kind: ContextKind, id: string, checked: boolean): RelayContextSelection {
  const next = {
    mcpServers: [...selection.mcpServers],
    skills: [...selection.skills],
    plugins: [...selection.plugins],
  };
  const list = contextSelectionIds(next, kind);
  const normalizedId = id.trim();
  const exists = list.includes(normalizedId);
  if (checked && normalizedId && !exists) list.push(normalizedId);
  if (!checked && exists) list.splice(list.indexOf(normalizedId), 1);
  return next;
}

function removeContextSelectionFromSettings(settings: BackendSettings, kind: ContextKind, id: string): BackendSettings {
  return {
    ...settings,
    relayProfiles: settings.relayProfiles.map((profile) => ({
      ...profile,
      contextSelection: setContextSelectionId(profile.contextSelection, kind, id, false),
    })),
  };
}

function contextSelectionForAllEntries(settings: BackendSettings): RelayContextSelection {
  const entries = contextEntriesFromSettings(settings);
  return {
    mcpServers: entries.mcpServers.map((entry) => entry.id),
    skills: entries.skills.map((entry) => entry.id),
    plugins: entries.plugins.map((entry) => entry.id),
  };
}

function relayProfileEditorStatus(profile: RelayProfile, form: BackendSettings, isNew: boolean) {
  if (isNew) return t("新建供应商需要先保存到列表");
  if (!form.relayProfilesEnabled) return t("供应商配置总开关已关闭；当前只保存配置，不写入 Codex live 文件");
  return profile.id === form.activeRelayId ? t("当前正在使用") : t("编辑后保存列表，再切换模式时会使用新配置");
}

function providerInitial(name: string) {
  const trimmed = (name || t("供应商")).trim();
  return Array.from(trimmed)[0]?.toUpperCase() || t("供");
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    found: t("已找到"),
    missing: t("缺失"),
    installed: t("已安装"),
    ok: t("正常"),
    running: t("运行中"),
    running_degraded: t("运行中（增强等待中）"),
    degraded: t("已降级"),
    starting: t("启动中"),
    failed: t("失败"),
    archived: t("已归档"),
    accepted: t("已受理"),
    not_checked: t("未检查"),
    not_implemented: t("未实现"),
    disabled: t("已禁用"),
    stopped: t("未运行"),
    connected: t("已连接"),
    disconnected: t("未连接"),
    unknown: t("未知"),
  };
  return labels[status] ?? status;
}

function statusClass(status: string) {
  if (["found", "installed", "ok", "running", "running_degraded", "connected"].includes(status)) return "good";
  if (["failed", "missing"].includes(status)) return "bad";
  return "warn";
}

function isSuccessStatus(status?: Status) {
  return status === "ok" || status === "accepted";
}

/// 后端「降级但流程可继续」的状态。目前用于回填跳过（live config.toml 语法
/// 错误，issue #618）：要在提示用户的同时继续执行，不能当成失败中断。
function isDegradedStatus(status?: Status) {
  return status === "degraded";
}

function truncateSessionDeletePreview(value: string) {
  const normalized = value.trim();
  return normalized.length > 20 ? `${normalized.slice(0, 20)}...` : normalized;
}

function healthItems(overview: OverviewResult | null) {
  const conversionEnabled = overview?.runtime_health?.protocol_conversion_enabled;
  const conversionDetail = typeof conversionEnabled === "boolean"
    ? t(conversionEnabled ? "协议转换已启用" : "协议转换未启用")
    : undefined;
  const serviceItem = (title: string, state: RuntimeServiceState | undefined, extraDetail?: string) => ({
    title,
    status: state?.status ?? "not_checked",
    ok: ["running", "connected", "disabled"].includes(state?.status ?? ""),
    detail: state ? [state.address, t(state.message), extraDetail].filter(Boolean).join(" · ") : t("等待状态检查"),
  });
  return [
    {
      title: t("Codex 应用"),
      status: overview?.codex_app.status ?? "not_checked",
      ok: overview?.codex_app.status === "found",
      detail: overview?.codex_app.path || t("尚未检查 Codex 应用路径。"),
    },
    serviceItem(t("本地服务器状态"), overview?.runtime_health?.local_server, conversionDetail),
    serviceItem(t("调试连接状态"), overview?.runtime_health?.debugger),
  ];
}

function normalizeTypingEffect(value: unknown): TypingEffect {
  return value === "rainbow" || value === "fireworks" || value === "stars" ? value : "off";
}

function normalizeSettings(settings: BackendSettings): BackendSettings {
  const backendAggregates = new Map(
    (settings.aggregateRelayProfiles ?? []).map((aggregate) => [aggregate.id, aggregate] as const),
  );
  const splitCommon = splitContextConfigText(settings.relayCommonConfigContents || "");
  const relayCommonConfigContents = splitCommon.common;
  const relayContextConfigContents = joinTomlSectionsRootFirst([
    settings.relayContextConfigContents || "",
    splitCommon.context,
  ]);
  const defaultContextSelection = contextSelectionForAllEntries({
    ...settings,
    relayCommonConfigContents,
    relayContextConfigContents,
  });
  const profiles =
    settings.relayProfiles?.length
      ? settings.relayProfiles.map((profile) =>
          normalizeRelayProfile(hydrateAggregateRelayProfile(profile, backendAggregates.get(profile.id)), defaultContextSelection),
        )
      : [
          {
            id: settings.activeRelayId || "default",
            name: t("默认中转"),
            model: "",
            baseUrl: settings.relayBaseUrl || defaultSettings.relayBaseUrl,
            upstreamBaseUrl: settings.relayBaseUrl || defaultSettings.relayBaseUrl,
            apiKey: settings.relayApiKey || "",
            protocol: "responses" as RelayProtocol,
            relayMode: "official" as RelayMode,
            sessionProvider: "custom" as RelaySessionProvider,
            officialMixApiKey: false,
            hideOfficialUsageAlert: false,
            testModel: "",
            configContents: "",
            authContents: "",
            useCommonConfig: true,
            contextSelection: defaultContextSelection,
            contextSelectionInitialized: true,
            contextWindow: "",
            autoCompactLimit: "",
            modelList: "",
            modelWindows: "",
            modelAutoCompact: "",
            modelMetadata: "",
            modelVlm: "",
            vlmApiKey: "",
            vlmModel: "",
            vlmBaseUrl: "",
            userAgent: "",
            customHeaders: [],
            sub2apiEnabled: false,
            noAuth: false,
            sub2apiMultiplier: "",
            standardOpenaiProtocol: false,
            webSearchHistoryCompat: false,
          },
        ];
  const activeRelayId = profiles.some((profile) => profile.id === settings.activeRelayId)
    ? settings.activeRelayId
    : profiles[0]?.id || "default";
  return syncLegacyRelayFields({
    ...defaultSettings,
    ...settings,
    ...normalizeWhaleBalanceSettings(settings),
    ccsDbPath: (settings.ccsDbPath || "").trim(),
    dictation: normalizeDictationSettings(settings.dictation),
    codexAppTypingEffect: normalizeTypingEffect(settings.codexAppTypingEffect),
    relayProfilesEnabled: settings.relayProfilesEnabled !== false,
    protocolProxyAutoRetry: settings.protocolProxyAutoRetry !== false,
    protocolProxyAutoRetryMaxAttempts: clampNumber(settings.protocolProxyAutoRetryMaxAttempts ?? 5, 0, 20),
    protocolProxyAutoRetryMode:
      settings.protocolProxyAutoRetryMode === "buffered"
        ? "buffered"
        : settings.protocolProxyAutoRetryMode === "streaming-legacy"
          ? "streaming-legacy"
          : "streaming",
    protocolProxyAutoRetryCommitDelayMs: clampNumber(settings.protocolProxyAutoRetryCommitDelayMs ?? 1000, 0, 10000),
    protocolProxyAutoRetryIntervalSeconds: clampNumber(settings.protocolProxyAutoRetryIntervalSeconds ?? 2, 0, 30),
    codexAppStepwiseProtocol: normalizeStepwiseProtocol(settings.codexAppStepwiseProtocol),
    codexAppStepwiseGenerationMode: normalizeStepwiseGenerationMode(settings.codexAppStepwiseGenerationMode),
    codexAppStepwiseMaxItems: clampNumber(settings.codexAppStepwiseMaxItems ?? 4, 0, 6),
    codexAppStepwiseMaxInputChars: clampNumber(settings.codexAppStepwiseMaxInputChars || 6000, 1000, 24000),
    codexAppStepwiseMaxOutputTokens: clampNumber(settings.codexAppStepwiseMaxOutputTokens || 500, 100, 4000),
    codexAppStepwiseTimeoutMs: clampNumber(settings.codexAppStepwiseTimeoutMs || 8000, 1000, 60000),
    relayCommonConfigContents,
    relayContextConfigContents,
    relayProfiles: profiles,
    activeRelayId,
  });
}

function normalizeStepwiseProtocol(value: StepwiseProtocol | undefined): StepwiseProtocol {
  return value === "auto"
    || value === "responses"
    || value === "anthropic_messages"
    ? value
    : "chat_completions";
}

function backendSettingsEqual(left: BackendSettings, right: BackendSettings): boolean {
  const { revision: _leftRevision, ...leftValues } = normalizeSettings(left);
  const { revision: _rightRevision, ...rightValues } = normalizeSettings(right);
  return JSON.stringify(leftValues) === JSON.stringify(rightValues);
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function normalizeStepwiseGenerationMode(value: StepwiseGenerationMode | undefined): StepwiseGenerationMode {
  return value === "manual" ? "manual" : "auto";
}

function parsePort(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535 ? parsed : fallback;
}

function normalizeRelayProfile(profile: RelayProfile, defaultContextSelection = emptyContextSelection()): RelayProfile {
  const legacyMixedApi = profile.relayMode === "mixedApi";
  if (profile.relayMode === "aggregate" || profile.aggregate) {
    return normalizeAggregateRelayProfile(
      {
        ...profile,
        model: profile.model || "",
        baseUrl: "",
        upstreamBaseUrl: "",
        apiKey: "",
        protocol: "responses",
        relayMode: "aggregate",
        sessionProvider: normalizeRelaySessionProvider(profile.sessionProvider),
        officialMixApiKey: false,
        hideOfficialUsageAlert: false,
        testModel: profile.testModel || "",
        configContents: "",
        authContents: "",
        useCommonConfig: profile.useCommonConfig !== false,
        contextSelection: profile.contextSelectionInitialized
          ? normalizeContextSelection(profile.contextSelection)
          : normalizeContextSelection(undefined, defaultContextSelection),
        contextSelectionInitialized: true,
        contextWindow: "",
        autoCompactLimit: "",
        modelList: "",
        modelWindows: "",
        modelAutoCompact: "",
        modelMetadata: "",
        modelRoutes: [],
        sub2apiEnabled: false,
        noAuth: false,
        sub2apiMultiplier: "",
        standardOpenaiProtocol: false,
        webSearchHistoryCompat: false,
      },
      null,
    );
  }
  const relayMode = normalizeRelayMode(profile.relayMode);
  const officialMixApiKey = profile.officialMixApiKey === true || legacyMixedApi;
  let normalized: RelayProfile = {
    ...profile,
    model: profile.model || "",
    baseUrl: profile.baseUrl || defaultSettings.relayBaseUrl,
    upstreamBaseUrl: profile.upstreamBaseUrl || profile.baseUrl || "",
    apiKey: profile.apiKey || "",
    protocol: normalizeRelayProtocol(profile.protocol),
    relayMode,
    sessionProvider: relaySessionProvider(profile),
    officialMixApiKey,
    hideOfficialUsageAlert: profile.hideOfficialUsageAlert === true,
    testModel: profile.testModel || "",
    configContents: profile.configContents || "",
    authContents: relayMode === "official" && !officialMixApiKey ? buildOfficialRelayAuthJson(profile.authContents || "") : profile.authContents || "",
    useCommonConfig: profile.useCommonConfig !== false,
    contextSelection: profile.contextSelectionInitialized
      ? normalizeContextSelection(profile.contextSelection)
      : normalizeContextSelection(undefined, defaultContextSelection),
    contextSelectionInitialized: true,
    contextWindow: profile.contextWindow || "",
    autoCompactLimit: profile.autoCompactLimit || "",
    modelList: profile.modelList || "",
    modelWindows: profile.modelWindows || "",
    modelAutoCompact: profile.modelAutoCompact || "",
    modelMetadata: profile.modelMetadata || "",
    modelRoutes: relayMode === "official" && !officialMixApiKey ? [] : normalizeRelayModelRoutes(profile.modelRoutes),
    userAgent: profile.userAgent || "",
    customHeaders: profile.customHeaders || [],
    sub2apiEnabled: profile.noAuth ? false : profile.sub2apiEnabled === true,
    sub2apiMultiplier: !profile.noAuth && profile.sub2apiEnabled === true ? profile.sub2apiMultiplier || "" : "",
    standardOpenaiProtocol: profile.standardOpenaiProtocol === true,
    webSearchHistoryCompat: profile.webSearchHistoryCompat === true,
    trustUpstreamCatalogLite: profile.trustUpstreamCatalogLite === true,
    strictResponsesReasoning: profile.strictResponsesReasoning === true,
    anthropicAuthHeader: normalizeAnthropicAuthHeader(profile.anthropicAuthHeader),
    anthropicMaxTokens: normalizeAnthropicMaxTokens(profile.anthropicMaxTokens),
    anthropicPromptCache: profile.anthropicPromptCache !== false,
    anthropicImpersonateClaudeCode: profile.anthropicImpersonateClaudeCode === true,
    anthropicThinkingMode: normalizeAnthropicThinkingMode(profile.anthropicThinkingMode),
  };
  const derived = relayProfileUsesLiveFiles(normalized) ? deriveRelayProfileFromFiles(normalized) : normalized;
  return derived.noAuth || (derived.relayMode === "official" && !derived.officialMixApiKey)
    ? derived : relayProfileWithNormalizedApiKeys(derived);
}

function hydrateAggregateRelayProfile(profile: RelayProfile, aggregate: AggregateRelayProfile | undefined): RelayProfile {
  if (!aggregate) return profile;
  return {
    ...profile,
    name: profile.name || aggregate.name,
    relayMode: "aggregate",
    sessionProvider: normalizeRelaySessionProvider(aggregate.sessionProvider),
    aggregate: {
      strategy: aggregate.strategy,
      modelAggregationEnabled: aggregate.modelAggregationEnabled === true,
      members: aggregate.members.map((member) => ({
        profileId: member.relayId,
        weight: clampAggregateWeight(member.weight),
      })),
      routes: normalizeAggregateRoutes(aggregate.routes ?? []),
      defaultRelayId: aggregate.defaultRelayId ?? "",
      syncDefaultMemberLogin: aggregate.syncDefaultMemberLogin === true,
    },
  };
}

function activeRelayProfile(settings: BackendSettings): RelayProfile {
  return (
    settings.relayProfiles.find((profile) => profile.id === settings.activeRelayId) ||
    settings.relayProfiles[0] ||
    defaultSettings.relayProfiles[0]
  );
}

/** 协议取值归一化：认不出的值一律回退 Responses，避免脏数据把上游写成直连。 */
function normalizeRelayProtocol(value: RelayProtocol | undefined): RelayProtocol {
  if (value === "chatCompletions" || value === "anthropicMessages") return value;
  return "responses";
}

/** Anthropic 认证字段：只允许 `x-api-key` 与 `authorization`，缺省用前者。 */
function normalizeAnthropicAuthHeader(value: string | undefined): string {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "authorization" || normalized === "bearer") return "authorization";
  if (normalized === "x-api-key" || normalized === "x_api_key" || normalized === "api_key") return "x-api-key";
  return "";
}

/** 思考模式：只认四个取值，其余（含空串）按 auto。 */
function normalizeAnthropicThinkingMode(value: string | undefined): string {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "adaptive" || normalized === "budget" || normalized === "off") {
    return normalized;
  }
  return "";
}

/** Anthropic 的 `max_tokens` 兜底值：空/非法按 0（用内置 8192），上限 200000。 */
function normalizeAnthropicMaxTokens(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  return Math.min(200000, Math.round(value));
}

function relayProtocolLabel(protocol: RelayProtocol): string {
  if (protocol === "chatCompletions") return t("Chat Completions 转 Responses");
  if (protocol === "anthropicMessages") return t("Anthropic Messages 转 Responses");
  return "Responses API";
}

function ccsProviderSummary(result: CcsProvidersResult | null): string {
  if (!result) return t("读取 ~/.cc-switch/cc-switch.db");
  if (!isSuccessStatus(result.status)) return result.message || t("读取 cc-switch 供应商失败。");
  const count = result.providers.length;
  return count ? tf("发现 {0} 个 Codex 供应商", [count]) : t("未发现可导入供应商");
}

function normalizeRelayMode(mode: RelayMode | undefined): RelayMode {
  if (mode === "aggregate") return mode;
  if (mode === "pureApi") return mode;
  return "official";
}

function normalizeRelaySessionProvider(value: string | undefined): RelaySessionProvider {
  return value === "openai" ? "openai" : "custom";
}

function relaySessionProviderFromConfig(contents: string): RelaySessionProvider {
  return normalizeRelaySessionProvider(rootTomlStringValue(contents, "model_provider"));
}

function relaySessionProvider(profile: Pick<RelayProfile, "configContents" | "sessionProvider">): RelaySessionProvider {
  const fromConfig = relaySessionProviderFromConfig(profile.configContents);
  return fromConfig === "openai" || profile.sessionProvider === "openai" ? "openai" : "custom";
}

function normalizeContextSelection(
  selection?: Partial<RelayContextSelection>,
  fallback: RelayContextSelection = emptyContextSelection(),
): RelayContextSelection {
  if (!selection) {
    return {
      mcpServers: [...fallback.mcpServers],
      skills: [...fallback.skills],
      plugins: [...fallback.plugins],
    };
  }
  return {
    mcpServers: Array.isArray(selection?.mcpServers) ? selection.mcpServers.map(String) : [],
    skills: Array.isArray(selection?.skills) ? selection.skills.map(String) : [],
    plugins: Array.isArray(selection?.plugins) ? selection.plugins.map(String) : [],
  };
}

function relayModeLabel(mode: RelayMode): string {
  if (mode === "aggregate") return t("聚合供应商");
  if (mode === "pureApi") return t("纯 API");
  return t("官方登录");
}

function relayEditorMode(profile: Pick<RelayProfile, "relayMode" | "officialMixApiKey">): RelayEditorMode {
  if (profile.relayMode === "pureApi") return "pureApi";
  if (profile.relayMode === "mixedApi" || profile.officialMixApiKey) return "mixedApi";
  return "official";
}

function relayProfileModeLabel(profile: Pick<RelayProfile, "relayMode" | "officialMixApiKey" | "aggregate">): string {
  if (profile.relayMode === "aggregate") {
    return profile.aggregate?.modelAggregationEnabled === true ? t("模型聚合") : t("故障转移");
  }
  return relayEditorMode(profile) === "mixedApi" ? t("官方登录 + API") : relayModeLabel(profile.relayMode);
}

function providerImportWireApiLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "chat" || normalized === "chat_completions" || normalized === "chat-completions") {
    return "Chat Completions";
  }
  return "Responses";
}

function providerImportRelayModeLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "official") return t("官方登录");
  if (normalized === "mixedapi" || normalized === "mixed-api" || normalized === "mixed_api") return t("官方登录 + API");
  if (normalized === "aggregate") return t("聚合供应商");
  return t("纯 API");
}

function maskSecret(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return t("未填写");
  if (trimmed.length <= 10) return `${trimmed.slice(0, 2)}…${trimmed.slice(-2)}`;
  return `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}`;
}

function relayProfileConfigBrief(profile: RelayProfile): string {
  if (isAggregateRelayProfile(profile)) {
    const aggregate = normalizeAggregateConfig(profile.aggregate, []);
    // 模型聚合与轮转策略无关，卡片上不显示「失败切换」这类策略文案。
    if (aggregate.modelAggregationEnabled === true) {
      return tf("模型固定绑定 · {0} 个成员", [aggregate.members.length]);
    }
    return tf("{0} · {1} 个成员", [aggregateStrategyLabel(aggregate.strategy), aggregate.members.length]);
  }
  if (profile.relayMode === "official") return profile.officialMixApiKey ? t("混入 API Key") : t("不写 API 文件");
  return profile.baseUrl || t("未填写 URL");
}

function relayProfileModeHelp(profile: RelayProfile): string {
  if (isAggregateRelayProfile(profile)) {
    const aggregate = normalizeAggregateConfig(profile.aggregate, []);
    if (aggregate.modelAggregationEnabled) {
      return t("此聚合会把成员模型合并到 Codex 列表；带供应商前缀的模型固定发送到对应成员，普通模型仍按策略轮转。");
    }
    return t("聚合供应商只保存成员和策略配置，成员来自已有 API 供应商；切为当前后会通过本地协议代理轮转请求。");
  }
  if (profile.relayMode === "official") {
    if (profile.officialMixApiKey) {
      return t("此供应商会保留官方登录模式，并把请求混入当前 API Key；Codex增强仍使用兼容模式。");
    }
    return t("此供应商会切回官方登录模式，使用 ChatGPT 官方账号，不写入 API Key。");
  }
  if (profile.relayMode === "pureApi") {
    return t("此供应商会同时写入 config.toml 和 auth.json；API Key 也会注入到 provider bearer token。");
  }
  return t("此供应商会保留官方登录模式，并把请求混入当前 API Key；Codex增强仍使用兼容模式。");
}

function relayProfileReadinessText(profile: RelayProfile, relay: RelayResult | null): string {
  if (isAggregateRelayProfile(profile)) {
    const aggregate = normalizeAggregateConfig(profile.aggregate, []);
    return tf("聚合供应商已配置为{0}，包含 {1} 个成员；真实对话会走本地代理轮转。", [aggregateStrategyLabel(aggregate.strategy), aggregate.members.length]);
  }
  if (profile.relayMode === "official") {
    if (profile.officialMixApiKey) {
      const hasApiFields = profile.baseUrl.trim() && profile.apiKey.trim();
      if (!relay?.authenticated && !hasApiFields) return t("当前未登录官方账号，也未配置混入 API 的 Base URL / Key。");
      if (!relay?.authenticated) return t("当前未登录官方账号；官方登录混入 API Key 需要先登录官方账号。");
      if (!hasApiFields) return t("当前还没有填写混入 API 的 Base URL / Key。");
      return tf("官方登录已就绪：{0}，会混入当前 API Key。", [relay.accountLabel || t("已登录")]);
    }
    return relay?.authenticated
      ? tf("官方账号已登录：{0}。", [relay.accountLabel || relay.authSource || t("已检测")])
      : t("当前未登录官方账号；切到官方登录模式后仍需要先在 Codex/ChatGPT 登录。");
  }
  const hasFiles = profile.configContents.trim() && profile.authContents.trim();
  if (!hasFiles) return t("当前供应商还没有完整 config.toml / API Key 存档。");
  if (relay && !relay.configured) return t("纯 API 配置未完整写入：请检查此供应商是否有 OPENAI_API_KEY，且 config.toml 是否包含 model_provider / provider / base_url。");
  return t("纯 API 就绪：会同时写入 config.toml 和 auth.json。");
}

function relayProfileSwitchCommand(profile: RelayProfile): "clear_relay_injection" | "apply_relay_injection" | "apply_pure_api_injection" {
  if (isAggregateRelayProfile(profile)) return "apply_relay_injection";
  if (profile.relayMode === "pureApi") return "apply_pure_api_injection";
  if (profile.relayMode === "official" && !profile.officialMixApiKey) return "clear_relay_injection";
  if (profile.configContents.trim()) return "apply_relay_injection";
  return profile.officialMixApiKey ? "apply_relay_injection" : "clear_relay_injection";
}

function withGeneratedRelayFiles(profile: RelayProfile): RelayProfile {
  if (isAggregateRelayProfile(profile)) {
    return { ...profile, configContents: "", authContents: "", aggregate: normalizeAggregateConfig(profile.aggregate, []) };
  }
  if (profile.relayMode === "official") {
    return {
      ...profile,
      configContents: profile.officialMixApiKey
        ? buildRelayConfigToml(profile, { includeBearerToken: true, requiresOpenAiAuth: true })
        : "",
      authContents: profile.authContents || "",
    };
  }
  return {
    ...profile,
    configContents: buildRelayConfigToml(profile, { includeBearerToken: !profile.noAuth, requiresOpenAiAuth: false }),
    authContents: buildRelayAuthJson(profile),
  };
}

function buildRelayConfigToml(
  profile: Pick<RelayProfile, "id" | "model" | "baseUrl" | "upstreamBaseUrl" | "apiKey" | "protocol" | "sessionProvider" | "relayMode" | "officialMixApiKey" | "webSearchHistoryCompat" | "strictResponsesReasoning" | "modelMetadata">,
  options: { includeBearerToken: boolean; requiresOpenAiAuth?: boolean },
): string {
  const searchHistoryCompat = profile.webSearchHistoryCompat === true
    && profile.protocol === "responses"
    && profile.relayMode !== "aggregate"
    && (profile.relayMode !== "official" || profile.officialMixApiKey);
  const baseUrl = profile.protocol !== "responses" || independentProxyEnabled(profile) || searchHistoryCompat || requestCompatibilityEnabled(profile)
    ? PROTOCOL_PROXY_BASE_URL
    : profile.baseUrl.trim();
  const apiKey = profile.apiKey.trim();
  const sessionProvider = normalizeRelaySessionProvider(profile.sessionProvider);
  const rootLines = [
    profile.model.trim() ? `model = "${tomlString(profile.model.trim())}"` : null,
    `model_provider = "${sessionProvider}"`,
    sessionProvider === "openai" ? `openai_base_url = "${PROTOCOL_PROXY_BASE_URL}"` : null,
    "",
  ].filter((line): line is string => line !== null);
  const requiresOpenAiAuthLine = options.requiresOpenAiAuth === undefined
    ? null
    : `requires_openai_auth = ${options.requiresOpenAiAuth ? "true" : "false"}`;
  return [
    ...rootLines,
    "[model_providers.custom]",
    'name = "custom"',
    'wire_api = "responses"',
    requiresOpenAiAuthLine,
    `base_url = "${tomlString(baseUrl)}"`,
    options.includeBearerToken && apiKey ? `experimental_bearer_token = "${tomlString(apiKey)}"` : null,
    "",
  ].filter((line): line is string => line !== null).join("\n");
}

function buildRelayAuthJson(profile: Pick<RelayProfile, "apiKey">): string {
  return `${JSON.stringify({ OPENAI_API_KEY: profile.apiKey.trim() }, null, 2)}\n`;
}

function buildOfficialRelayAuthJson(contents: string): string {
  const trimmed = contents.trim();
  if (!trimmed) return "";
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return contents;
    const knownOAuth = String(parsed.auth_mode || "").toLowerCase() === "chatgpt" && parsed.tokens && typeof parsed.tokens === "object";
    if (!knownOAuth && Object.keys(parsed).some((key) => key !== "OPENAI_API_KEY")) return contents;
    delete parsed.OPENAI_API_KEY;
    return `${JSON.stringify(parsed, null, 2)}\n`;
  } catch {
    return contents;
  }
}

function deriveRelayProfileFromFiles(profile: RelayProfile, editedFile?: "config" | "auth"): RelayProfile {
  if (isAggregateRelayProfile(profile)) {
    return normalizeAggregateRelayProfile(profile, null);
  }
  if (editedFile === "auth") {
    try {
      JSON.parse(profile.authContents || "{}");
    } catch {
      return profile;
    }
  }
  let configContents = profile.configContents || "";
  let authContents = profile.relayMode === "official" ? buildOfficialRelayAuthJson(profile.authContents || "") : profile.authContents || "";
  const configBaseUrl = codexBaseUrlFromConfig(configContents);
  const chatUpstreamBaseUrl = rootTomlStringValue(configContents, CHAT_UPSTREAM_BASE_URL_KEY);
  const isProxyConfig = configBaseUrl === PROTOCOL_PROXY_BASE_URL;
  const upstreamBaseUrl = profile.upstreamBaseUrl || chatUpstreamBaseUrl || (configBaseUrl && !isProxyConfig ? configBaseUrl : profile.baseUrl || "");
  const configApiKey = codexExperimentalBearerTokenFromConfig(configContents);
  const apiKey = editedFile === "config" ? configApiKey
    : editedFile === "auth" && profile.relayMode === "pureApi" ? codexApiKeyFromAuth(authContents)
    : profile.relayMode === "official"
    ? configApiKey || profile.apiKey || ""
    : codexApiKeyFromAuth(authContents) || configApiKey || "";
  if (profile.relayMode === "pureApi") {
    // 旧 false/缺省模板也需要显式 provider 认证；保留用户已有的 true/false。
    configContents = profile.noAuth
      ? removeCodexExperimentalBearerToken(configContents)
      : apiKey && configContents.trim()
        ? setCodexExperimentalBearerToken(configContents, apiKey, { requiresOpenAiAuth: false })
        : configContents;
    if (editedFile && !profile.noAuth) {
      if (editedFile === "config") authContents = setAuthOpenAiApiKey(authContents, apiKey);
      if (!apiKey) configContents = removeCodexExperimentalBearerToken(configContents);
    }
  }
  const configModel = codexModelFromConfig(configContents);
  // 如果用户输入了带后缀的模型名，优先保留在界面的「配置模型」字段中；
  // config.toml 里实际写的是剥离后缀的 slug（由 applyRelayProfilePatchToFiles 处理）。
  const model = /\[.+\]$/.test(profile.model.trim()) ? profile.model.trim() : configModel;
  const derived = {
    ...profile,
    model,
    sessionProvider: relaySessionProviderFromConfig(configContents),
    baseUrl: upstreamBaseUrl,
    upstreamBaseUrl,
    apiKey,
    contextWindow: codexTopLevelIntFromConfig(configContents, "model_context_window"),
    autoCompactLimit: codexTopLevelIntFromConfig(configContents, "model_auto_compact_token_limit"),
    configContents,
    authContents,
  };
  return editedFile ? relayProfileWithUpdatedApiKey(derived, apiKey) : derived;
}

function applyRelayProfilePatchToFiles(
  profile: RelayProfile,
  patch: Partial<RelayProfile>,
  options: { allowGenerateFiles?: boolean } = {},
): RelayProfile {
  const protocol = patch.protocol ?? profile.protocol;
  const sessionProvider = "sessionProvider" in patch
    ? normalizeRelaySessionProvider(patch.sessionProvider)
    : relaySessionProvider(profile);
  const compatibleSession = sessionProviderForProtocol(sessionProvider, protocol);
  const normalizedPatch = compatibleSession === sessionProvider
    ? patch
    : { ...patch, sessionProvider: compatibleSession };
  let next: RelayProfile = { ...profile, ...normalizedPatch };
  if (isAggregateRelayProfile(next)) {
    return normalizeAggregateRelayProfile(next, null);
  }
  const shouldHaveFiles =
    next.relayMode !== "official" || next.officialMixApiKey || next.configContents.trim() || next.authContents.trim();
  const needsAuthFile = next.relayMode === "pureApi";
  if (options.allowGenerateFiles && shouldHaveFiles && (!next.configContents.trim() || (needsAuthFile && !next.authContents.trim()))) {
    next = withGeneratedRelayFiles(next);
  }

  if ("sessionProvider" in patch) {
    const sessionProvider = normalizeRelaySessionProvider(patch.sessionProvider);
    next.sessionProvider = sessionProvider;
    next.configContents = setRootTomlStringKey(next.configContents, "model_provider", sessionProvider);
    next.configContents = setManagedOpenAiBaseUrl(next.configContents, sessionProvider === "openai");
  }

  if ("model" in patch) {
    // 模型后缀（如 [1M]）仅供 CodexPlusPlus 内部使用，写入 config.toml 前需剥离，
    // 否则 codex 会按带后缀的字符串去匹配 catalog slug，导致窗口回退到默认值。
    const { slug } = parseModelSuffix(patch.model || "");
    next.configContents = setRootTomlStringKey(next.configContents, "model", slug);
  }
  if ("apiKey" in patch) {
    next = relayProfileWithUpdatedApiKey(next, patch.apiKey || "");
    if (next.relayMode === "pureApi") {
      next.authContents = setAuthOpenAiApiKey(next.authContents, patch.apiKey || "");
      next.configContents = setCodexExperimentalBearerToken(next.configContents, patch.apiKey || "", { requiresOpenAiAuth: false });
    } else {
      next.configContents = setCodexExperimentalBearerToken(next.configContents, patch.apiKey || "");
    }
  }
  if ("baseUrl" in patch) {
    next.upstreamBaseUrl = patch.baseUrl || "";
  }
  if ("upstreamBaseUrl" in patch) {
    next.baseUrl = patch.upstreamBaseUrl || "";
  }
  if ("baseUrl" in patch || "upstreamBaseUrl" in patch || "protocol" in patch || "modelRoutes" in patch || "webSearchHistoryCompat" in patch || "strictResponsesReasoning" in patch || "modelMetadata" in patch) {
    const searchHistoryCompat = next.webSearchHistoryCompat === true
      && next.protocol === "responses"
      && next.relayMode !== "aggregate"
      && (next.relayMode !== "official" || next.officialMixApiKey);
    const baseUrlForConfig = next.protocol !== "responses" || independentProxyEnabled(next) || normalizeRelayModelRoutes(next.modelRoutes).length > 0 || searchHistoryCompat || requestCompatibilityEnabled(next)
      ? PROTOCOL_PROXY_BASE_URL
      : next.upstreamBaseUrl || next.baseUrl;
    next.configContents = setCodexProviderStringKey(next.configContents, "base_url", baseUrlForConfig, {
      requiresOpenAiAuth: next.relayMode !== "pureApi",
    });
    next.configContents = removeRootTomlKey(next.configContents, CHAT_UPSTREAM_BASE_URL_KEY);
  }
  if ("contextWindow" in patch) {
    next.configContents = setRootTomlIntKey(next.configContents, "model_context_window", patch.contextWindow || "");
  }
  if ("autoCompactLimit" in patch) {
    next.configContents = setRootTomlIntKey(
      next.configContents,
      "model_auto_compact_token_limit",
      patch.autoCompactLimit || "",
    );
  }
  if ("relayMode" in patch || "officialMixApiKey" in patch) {
    if (next.relayMode === "official" && !next.officialMixApiKey) {
      next.configContents = "";
      next.authContents = buildOfficialRelayAuthJson(next.authContents);
    } else if (options.allowGenerateFiles && (!next.configContents.trim() || (next.relayMode === "pureApi" && !next.authContents.trim()))) {
      next = withGeneratedRelayFiles(next);
    }
  }
  return deriveRelayProfileFromFiles(next);
}

function codexModelFromConfig(contents: string): string {
  const lines = contents.split(/\r?\n/);
  const structural = tomlStructureMask(lines);
  for (const [index, line] of lines.entries()) {
    if (!structural[index]) continue;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (trimmed.startsWith("[")) break;
    const match = /^model\s*=\s*(["'])(.*)\1\s*$/.exec(trimmed);
    if (match) return match[2].replace(/\\(["'\\])/g, "$1");
  }
  return "";
}

/// 解析模型后缀语法，如 deepseek-v4-flash[1M] -> { slug: "deepseek-v4-flash", window: 1000000 }
/// 非法或没有后缀时返回原串作为 slug。剥离与换算统一走 model-metadata.ts 的
/// suffixWindowString/modelSlugFromRowName，避免两处实现对「什么算合法后缀」
/// 的判断分叉。
function parseModelSuffix(raw: string): { slug: string; window?: number } {
  const window = suffixWindowString(raw);
  if (window === null) return { slug: raw.trim() };
  return { slug: modelSlugFromRowName(raw), window: Number(window) };
}

function codexBaseUrlFromConfig(contents: string): string {
  return codexProviderStringFromConfig(contents, "base_url");
}

function codexExperimentalBearerTokenFromConfig(contents: string): string {
  return codexProviderStringFromConfig(contents, "experimental_bearer_token");
}

function codexProviderStringFromConfig(contents: string, key: string): string {
  const provider = rootTomlStringValue(contents, "model_provider");
  const targetSection = codexProviderSectionName(provider || "custom");
  const fallbackSection = provider === "openai" && rootTomlStringValue(contents, "openai_base_url") === PROTOCOL_PROXY_BASE_URL
    ? codexProviderSectionName("custom") : "";
  const lines = contents.split(/\r?\n/);
  const structural = tomlStructureMask(lines);
  let currentSection = "";
  let rootValue = "";
  let fallbackValue = "";

  for (const [index, line] of lines.entries()) {
    if (!structural[index]) continue;
    const section = tomlSectionName(line);
    if (section !== null) {
      currentSection = section;
      continue;
    }
    const value = tomlStringAssignmentValue(line, key);
    if (value === null) continue;
    if (currentSection === targetSection) return value;
    if (fallbackSection && currentSection === fallbackSection) fallbackValue = value;
    if (!provider && currentSection === "") rootValue = value;
  }

  // 不借用 inactive provider 的 Key；仅托管 OpenAI 会话允许回落 custom transport。
  return fallbackValue || rootValue;
}

function codexApiKeyFromAuth(contents: string): string {
  try {
    const parsed = JSON.parse(contents || "{}") as { OPENAI_API_KEY?: unknown };
    return typeof parsed.OPENAI_API_KEY === "string" ? parsed.OPENAI_API_KEY : "";
  } catch {
    return "";
  }
}

function codexTopLevelIntFromConfig(contents: string, key: string): string {
  const topLevel = splitTomlRootAndTables(contents).root;
  const pattern = new RegExp(`^\\s*${key}\\s*=\\s*(\\d+)\\s*(?:#.*)?$`);
  const lines = topLevel.split(/\r?\n/);
  const structural = tomlStructureMask(lines);
  for (const [index, line] of lines.entries()) {
    if (!structural[index]) continue;
    const match = pattern.exec(line);
    if (match) return match[1];
  }
  return "";
}

function rootTomlStringValue(contents: string, key: string): string {
  const topLevel = splitTomlRootAndTables(contents).root;
  const lines = topLevel.split(/\r?\n/);
  const structural = tomlStructureMask(lines);
  for (const [index, line] of lines.entries()) {
    if (!structural[index]) continue;
    const value = tomlStringAssignmentValue(line, key);
    if (value !== null) return value;
  }
  return "";
}

function tomlStructureMask(lines: string[]): boolean[] {
  // 提示词里的伪表头/赋值只是字符串正文，不能参与 provider 鉴权读写。
  let multiline: string | null = null;
  return lines.map((line) => {
    const structural = multiline === null;
    for (let index = 0; index < line.length; index += 1) {
      if (multiline !== null) {
        if (multiline === '"' && line[index] === "\\") {
          index += 1;
        } else if (line[index] === multiline) {
          let end = index;
          while (line[end] === multiline) end += 1;
          if (end - index >= 3) multiline = null;
          index = end - 1;
        }
      } else if (line[index] === "#") {
        break;
      } else if (line[index] === '"' || line[index] === "'") {
        if (line[index + 1] === line[index] && line[index + 2] === line[index]) {
          multiline = line[index];
          index += 2;
        } else {
          const quoted = tomlQuotedValue(line, index);
          if (!quoted) break;
          index = quoted.end - 1;
        }
      }
    }
    return structural;
  });
}

function tomlSectionName(line: string): string | null {
  const text = line.trim();
  if (!text.startsWith("[")) return null;
  const array = text.startsWith("[[");
  const start = array ? 2 : 1;
  for (let index = start; index < text.length; index += 1) {
    if (text[index] === '"' || text[index] === "'") {
      const quoted = tomlQuotedValue(text, index);
      if (!quoted) return null;
      index = quoted.end - 1;
    } else if (text[index] === "]") {
      const end = index + (array ? 2 : 1);
      if (array && text[index + 1] !== "]") return null;
      const rest = text.slice(end).trim();
      if (rest && !rest.startsWith("#")) return null;
      const path = tomlDottedKeyPath(text.slice(start, index));
      // 数组表也是前一个表的边界，但不能与同名普通表混为一谈。
      return path ? (array ? "[]" : "") + tomlKeyPathName(path) : null;
    }
  }
  return null;
}

function tomlQuotedValue(text: string, start: number): { value: string; end: number } | null {
  const quote = text[start];
  if (quote !== '"' && quote !== "'") return null;
  let value = "";
  for (let index = start + 1; index < text.length; index += 1) {
    const character = text[index];
    if (character === quote) return { value, end: index + 1 };
    if ((character.charCodeAt(0) < 32 && character !== "\t") || character.charCodeAt(0) === 127) return null;
    if (quote === '"' && character === "\\") {
      const escape = text[++index];
      const escapes: Record<string, string> = { '"': '"', "\\": "\\", b: "\b", t: "\t", n: "\n", f: "\f", r: "\r" };
      if (Object.prototype.hasOwnProperty.call(escapes, escape)) value += escapes[escape];
      else if (escape === "u" || escape === "U") {
        const length = escape === "u" ? 4 : 8;
        const digits = text.slice(index + 1, index + 1 + length);
        if (digits.length !== length || !/^[0-9a-f]+$/i.test(digits)) return null;
        const codepoint = Number.parseInt(digits, 16);
        if (codepoint > 0x10ffff || (codepoint >= 0xd800 && codepoint <= 0xdfff)) return null;
        value += String.fromCodePoint(codepoint);
        index += length;
      } else return null;
    } else value += character;
  }
  return null;
}

function tomlDottedKeyPath(text: string): string[] | null {
  const path: string[] = [];
  let index = 0;
  while (index < text.length) {
    while (text[index] === " " || text[index] === "\t") index += 1;
    if (text[index] === '"' || text[index] === "'") {
      const quoted = tomlQuotedValue(text, index);
      if (!quoted) return null;
      path.push(quoted.value);
      index = quoted.end;
    } else {
      const bare = /^[A-Za-z0-9_-]+/.exec(text.slice(index));
      if (!bare) return null;
      path.push(bare[0]);
      index += bare[0].length;
    }
    while (text[index] === " " || text[index] === "\t") index += 1;
    if (index === text.length) return path;
    if (text[index] !== ".") return null;
    index += 1;
  }
  return null;
}

function tomlKeyPathName(path: string[]): string {
  return path.map((part) => /^[A-Za-z0-9_-]+$/.test(part) ? part : JSON.stringify(part)).join(".");
}

function codexProviderSectionName(provider: string): string {
  return tomlKeyPathName(["model_providers", provider]);
}

function tomlKeyAssignment(line: string): { path: string[]; valueStart: number } | null {
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '"' || line[index] === "'") {
      const quoted = tomlQuotedValue(line, index);
      if (!quoted) return null;
      index = quoted.end - 1;
    } else if (line[index] === "#") return null;
    else if (line[index] === "=") {
      const path = tomlDottedKeyPath(line.slice(0, index));
      return path ? { path, valueStart: index + 1 } : null;
    }
  }
  return null;
}

function tomlInlineComment(line: string, start: number): string {
  for (let index = start; index < line.length; index += 1) {
    if (line[index] === '"' || line[index] === "'") {
      const quoted = tomlQuotedValue(line, index);
      if (!quoted) return "";
      index = quoted.end - 1;
    } else if (line[index] === "#") {
      const spacing = /[ \t]*$/.exec(line.slice(start, index))?.[0] || "";
      return spacing + line.slice(index);
    }
  }
  return "";
}

function tomlStringAssignmentValue(line: string, key: string): string | null {
  const assignment = tomlKeyAssignment(line);
  if (!assignment || assignment.path.length !== 1 || assignment.path[0] !== key) return null;
  const text = line.slice(assignment.valueStart).trimStart();
  const quoted = tomlQuotedValue(text, 0);
  if (!quoted) return null;
  const rest = text.slice(quoted.end).trimStart();
  return !rest || rest.startsWith("#") ? quoted.value : null;
}

function setAuthOpenAiApiKey(contents: string, apiKey: string): string {
  let parsed: Record<string, unknown> = {};
  try {
    const value = JSON.parse(contents || "{}");
    if (value && typeof value === "object" && !Array.isArray(value)) parsed = value as Record<string, unknown>;
  } catch {
    parsed = {};
  }
  parsed.OPENAI_API_KEY = apiKey.trim();
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

function setRootTomlStringKey(contents: string, key: string, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return removeRootTomlKey(contents, key);
  return setRootTomlLine(contents, key, `${key} = "${tomlString(trimmed)}"`);
}

function setManagedOpenAiBaseUrl(contents: string, enabled: boolean): string {
  const current = rootTomlStringValue(contents, "openai_base_url");
  if (enabled) {
    return !current || current === PROTOCOL_PROXY_BASE_URL
      ? setRootTomlStringKey(contents, "openai_base_url", PROTOCOL_PROXY_BASE_URL)
      : contents;
  }
  return current === PROTOCOL_PROXY_BASE_URL ? removeRootTomlKey(contents, "openai_base_url") : contents;
}

function setRootTomlIntKey(contents: string, key: string, value: string): string {
  const trimmed = value.replace(/[^\d]/g, "");
  if (!trimmed) return removeRootTomlKey(contents, key);
  return setRootTomlLine(contents, key, `${key} = ${trimmed}`);
}

function setRootTomlLine(contents: string, key: string, lineText: string): string {
  const lines = contents.split(/\r?\n/);
  const structural = tomlStructureMask(lines);
  const firstTable = lines.findIndex((line, index) => structural[index] && tomlSectionName(line) !== null);
  const rootEnd = firstTable >= 0 ? firstTable : lines.length;
  for (let index = 0; index < rootEnd; index += 1) {
    if (!structural[index]) continue;
    const assignment = tomlKeyAssignment(lines[index]);
    if (assignment?.path.length === 1 && assignment.path[0] === key) {
      const replacement = tomlKeyAssignment(lineText);
      lines[index] = replacement
        ? lines[index].slice(0, assignment.valueStart) + " " + lineText.slice(replacement.valueStart).trimStart() + tomlInlineComment(lines[index], assignment.valueStart)
        : lineText;
      return ensureTrailingNewline(lines.join("\n").trimEnd());
    }
  }
  const insertAt = key === "model" ? 0 : rootEnd;
  lines.splice(insertAt, 0, lineText);
  return ensureTrailingNewline(lines.join("\n").trimEnd());
}

function codexRequiresOpenAiAuthFromConfig(contents: string): boolean {
  const provider = rootTomlStringValue(contents, "model_provider");
  const targetSection = provider ? codexProviderSectionName(provider) : "";
  const lines = contents.split(/\r?\n/);
  const structural = tomlStructureMask(lines);
  let currentSection = "";
  let sawProviderSection = false;
  let rootRequiresAuth = false;

  for (const [index, line] of lines.entries()) {
    if (!structural[index]) continue;
    const section = tomlSectionName(line);
    if (section !== null) {
      currentSection = section;
      if (section.startsWith("model_providers.")) sawProviderSection = true;
      continue;
    }
    const match = /^\s*requires_openai_auth\s*=\s*(true|false)\s*(?:#.*)?$/i.exec(line);
    if (match && currentSection === "") rootRequiresAuth = match[1].toLowerCase() === "true";
    if (!match || !currentSection.startsWith("model_providers.")) continue;
    if (targetSection) {
      if (currentSection === targetSection) return match[1].toLowerCase() === "true";
      continue;
    }
    if (match[1].toLowerCase() === "true") return true;
  }

  return !sawProviderSection && rootRequiresAuth;
}

function setCodexProviderStringKey(
  contents: string,
  key: string,
  value: string,
  options: { requiresOpenAiAuth?: boolean } = {},
): string {
  const sessionProvider = rootTomlStringValue(contents, "model_provider") || "custom";
  const provider = sessionProvider === "openai" ? "custom" : sessionProvider;
  let next = contents;
  if (!rootTomlStringValue(next, "model_provider")) {
    next = setRootTomlStringKey(next, "model_provider", sessionProvider);
  }
  next = ensureCodexProviderDefaults(next, provider, { requiresOpenAiAuth: options.requiresOpenAiAuth !== false });
  return setTomlSectionStringKey(next, codexProviderSectionName(provider), key, value);
}

function setCodexExperimentalBearerToken(contents: string, apiKey: string, options: { requiresOpenAiAuth?: boolean } = {}): string {
  const trimmed = apiKey.trim();
  if (trimmed && options.requiresOpenAiAuth === false) {
    // 补纯 API 鉴权时只改目标字段，不覆盖导入模板的名称、协议或登录要求。
    const sessionProvider = rootTomlStringValue(contents, "model_provider") || "custom";
    const provider = sessionProvider === "openai" ? "custom" : sessionProvider;
    const next = rootTomlStringValue(contents, "model_provider")
      ? contents
      : setRootTomlStringKey(contents, "model_provider", sessionProvider);
    return setTomlSectionStringKey(next, codexProviderSectionName(provider), "experimental_bearer_token", trimmed);
  }
  return trimmed
    ? setCodexProviderStringKey(contents, "experimental_bearer_token", trimmed, options)
    : removeCodexExperimentalBearerToken(contents);
}

function removeCodexExperimentalBearerToken(contents: string): string {
  const sessionProvider = rootTomlStringValue(contents, "model_provider") || "custom";
  const provider = sessionProvider === "openai" ? "custom" : sessionProvider;
  return removeTomlSectionKey(contents, codexProviderSectionName(provider), "experimental_bearer_token");
}

function ensureCodexProviderDefaults(
  contents: string,
  provider: string,
  options: { requiresOpenAiAuth?: boolean } = {},
): string {
  let next = contents;
  const section = codexProviderSectionName(provider);
  next = setTomlSectionStringKey(next, section, "name", provider);
  next = setTomlSectionStringKey(next, section, "wire_api", "responses");
  return options.requiresOpenAiAuth === false ? next : setTomlSectionBoolKey(next, section, "requires_openai_auth", true);
}

function setTomlSectionBoolKey(contents: string, sectionName: string, key: string, value: boolean): string {
  return setTomlSectionRawKey(contents, sectionName, key, value ? "true" : "false");
}

function setTomlSectionStringKey(contents: string, sectionName: string, key: string, value: string): string {
  return setTomlSectionRawKey(contents, sectionName, key, `"${tomlString(value.trim())}"`);
}

function setTomlSectionRawKey(contents: string, sectionName: string, key: string, value: string): string {
  const lines = contents.split(/\r?\n/);
  const structural = tomlStructureMask(lines);
  let sectionStart = -1;
  let sectionEnd = lines.length;
  for (let index = 0; index < lines.length; index += 1) {
    if (!structural[index]) continue;
    const section = tomlSectionName(lines[index]);
    if (section === null) continue;
    if (sectionStart >= 0) {
      sectionEnd = index;
      break;
    }
    if (section === sectionName) sectionStart = index;
  }
  if (sectionStart < 0) {
    const prefix = ensureTrailingNewline(lines.join("\n").trimEnd()).trimEnd();
    return joinTomlSections([prefix, `[${sectionName}]\n${key} = ${value}`]);
  }
  const replacement = `${key} = ${value}`;
  for (let index = sectionStart + 1; index < sectionEnd; index += 1) {
    if (!structural[index]) continue;
    const assignment = tomlKeyAssignment(lines[index]);
    if (assignment?.path.length === 1 && assignment.path[0] === key) {
      lines[index] = lines[index].slice(0, assignment.valueStart) + " " + value + tomlInlineComment(lines[index], assignment.valueStart);
      return ensureTrailingNewline(lines.join("\n").trimEnd());
    }
  }
  let insertAt = sectionEnd;
  while (insertAt > sectionStart + 1 && lines[insertAt - 1].trim() === "") insertAt -= 1;
  lines.splice(insertAt, 0, replacement);
  return ensureTrailingNewline(lines.join("\n").trimEnd());
}

function removeTomlSectionKey(contents: string, sectionName: string, key: string): string {
  const lines = contents.split(/\r?\n/);
  const structural = tomlStructureMask(lines);
  let sectionStart = -1;
  let sectionEnd = lines.length;
  for (let index = 0; index < lines.length; index += 1) {
    if (!structural[index]) continue;
    const section = tomlSectionName(lines[index]);
    if (section === null) continue;
    if (sectionStart >= 0) {
      sectionEnd = index;
      break;
    }
    if (section === sectionName) sectionStart = index;
  }
  if (sectionStart < 0) return contents;
  const next = lines.filter((line, index) => {
    if (index <= sectionStart || index >= sectionEnd || !structural[index]) return true;
    const assignment = tomlKeyAssignment(line);
    return assignment?.path.length !== 1 || assignment.path[0] !== key;
  });
  return ensureTrailingNewline(next.join("\n").trimEnd());
}

function relayProfileSwitchValidation(profile: RelayProfile, settings: BackendSettings | null = null): string | null {
  const sessionProviderError = relaySessionProviderValidation(profile);
  if (sessionProviderError) return sessionProviderError;
  if (isAggregateRelayProfile(profile)) {
    return aggregateRelayProfileValidation(profile);
  }
  const modelRouteError = relayModelRoutesValidation(profile, settings);
  if (modelRouteError) return modelRouteError;
  if (profile.relayMode === "official" && !profile.officialMixApiKey) return null;
  if (!profile.configContents.trim()) {
    return tf("供应商「{0}」缺少独立 config.toml，已停止切换，避免继续显示上一套配置文件。请先在该供应商详情里保存 config.toml。", [profile.name || profile.id]);
  }
  if (profile.relayMode !== "official" || !authJsonHasOpenAiApiKey(profile.authContents)) return null;
  return t("官方混合 API 不应在 auth.json 中保存 OPENAI_API_KEY。请清理此供应商的 auth.json 后再切换。");
}

function relayModelRoutesValidation(profile: RelayProfile, settings: BackendSettings | null): string | null {
  const issue = findRelayModelRouteIssue([profile], settings?.relayProfiles ?? [profile]);
  return relayModelRouteIssueMessage(issue);
}

function relayModelRoutesSettingsValidation(settings: BackendSettings): string | null {
  return relayModelRouteIssueMessage(
    findRelayModelRouteIssue(settings.relayProfiles, settings.relayProfiles),
  );
}

function relaySettingsValidation(settings: BackendSettings): string | null {
  for (const profile of settings.relayProfiles) {
    const sessionProviderError = relaySessionProviderValidation(profile);
    if (sessionProviderError) return sessionProviderError;
  }
  return relayModelRoutesSettingsValidation(settings);
}

function relaySessionProviderValidation(profile: RelayProfile): string | null {
  if (relaySessionProvider(profile) === "openai" && profile.protocol !== "responses") {
    return t("OpenAI 会话身份仅支持 Responses API；Chat Completions 不支持 ChatGPT Remote 的远程压缩。请切换协议或改回 Custom。");
  }
  return null;
}

function relayModelRouteIssueMessage(issue: ReturnType<typeof findRelayModelRouteIssue>): string | null {
  if (!issue) return null;
  switch (issue.kind) {
    case "incomplete":
      return t("单模型协议转换需要填写模型名称和目标供应商。");
    case "duplicate":
      return tf("模型「{0}」存在重复路由。", [issue.model]);
    case "self":
      return tf("模型「{0}」不能路由到当前供应商自身。", [issue.model]);
    case "missingTarget":
      return tf("模型「{0}」的目标供应商不存在。", [issue.model]);
    case "aggregateTarget":
      return tf("模型「{0}」不能路由到聚合供应商。", [issue.model]);
    case "targetProtocol":
      return tf("模型「{0}」的目标供应商必须使用 Responses API。", [issue.model]);
    case "targetCredentials":
      return tf("模型「{0}」的目标供应商缺少 Base URL 或 Key。", [issue.model]);
  }
}

function relaySettingsWithDraft(
  settings: BackendSettings,
  profileId: string,
  draft: RelayProfile,
  isNew: boolean,
): BackendSettings {
  const normalizedDraft = isAggregateRelayProfile(draft)
    ? normalizeAggregateRelayProfile(draft, settings)
    : deriveRelayProfileFromFiles(draft);
  return isNew
    ? addRelayProfile(settings, normalizedDraft)
    : updateRelayProfile(settings, profileId, normalizedDraft);
}

function relayProfileUsesLiveFiles(profile: RelayProfile): boolean {
  return profile.relayMode !== "official" || profile.officialMixApiKey || !!profile.configContents.trim();
}

function authJsonHasOpenAiApiKey(contents: string): boolean {
  const trimmed = contents.trim();
  if (!trimmed) return false;
  try {
    const value = JSON.parse(trimmed);
    return !!value && typeof value === "object" && typeof value.OPENAI_API_KEY === "string" && value.OPENAI_API_KEY.trim().length > 0;
  } catch {
    return /"OPENAI_API_KEY"\s*:/.test(trimmed);
  }
}

function tomlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function syncLegacyRelayFields(settings: BackendSettings): BackendSettings {
  // 先规范化非聚合供应商：聚合成员的"存在性"要用**规范化后仍然在列表里**的那些 id，
  // 否则同一批 profile 里排在聚合后面的成员会被当成不存在而丢掉（顺序相关的老问题）。
  const nonAggregate = settings.relayProfiles
    .filter((profile) => !isAggregateRelayProfile(profile))
    .map((profile) => deriveRelayProfileFromFiles(profile));
  const relayProfiles = settings.relayProfiles.map((profile) =>
    isAggregateRelayProfile(profile)
      ? normalizeAggregateRelayProfile(profile, { ...settings, relayProfiles: [...nonAggregate, ...settings.relayProfiles.filter(isAggregateRelayProfile)] })
      : deriveRelayProfileFromFiles(profile),
  );
  const active = activeRelayProfile({ ...settings, relayProfiles });
  const aggregateRelayProfiles = normalizeAggregateProfilesFromRelayProfiles(relayProfiles);
  const activeAggregateRelayId = isAggregateRelayProfile(active) ? active.id : "";
  return {
    ...settings,
    relayProfiles,
    activeRelayId: active.id,
    relayBaseUrl: isAggregateRelayProfile(active) ? PROTOCOL_PROXY_BASE_URL : active.baseUrl,
    relayApiKey: active.apiKey,
    aggregateRelayProfiles,
    activeAggregateRelayId,
  };
}

function normalizeAggregateProfilesFromRelayProfiles(profiles: RelayProfile[]): AggregateRelayProfile[] {
  const candidates = profiles.filter((profile) => !isAggregateRelayProfile(profile));
  return profiles.filter(isAggregateRelayProfile).map((profile) => {
    const aggregate = normalizeAggregateConfig(profile.aggregate, candidates);
    const memberIds = new Set(aggregate.members.map((member) => member.profileId));
    return {
      id: profile.id,
      name: profile.name || t("聚合供应商"),
      sessionProvider: normalizeRelaySessionProvider(profile.sessionProvider),
      modelAggregationEnabled: aggregate.modelAggregationEnabled === true,
      strategy: aggregate.strategy,
      members: aggregate.members.map((member) => ({
        relayId: member.profileId,
        weight: clampAggregateWeight(member.weight),
      })),
      routes: normalizeAggregateRoutes(aggregate.routes ?? [], { dropEmptyPattern: true, memberIds }).map((route) => ({
        pattern: route.pattern,
        relayId: route.profileId,
        priority: route.priority,
      })),
      defaultRelayId: aggregate.defaultRelayId ?? "",
      syncDefaultMemberLogin: aggregate.syncDefaultMemberLogin === true,
    };
  });
}
function updateRelayProfile(settings: BackendSettings, id: string, patch: Partial<RelayProfile>): BackendSettings {
  if (patch.relayMode === "aggregate" || patch.aggregate) {
    return syncLegacyRelayFields({
      ...settings,
      relayProfiles: settings.relayProfiles.map((profile) =>
        profile.id === id ? normalizeAggregateRelayProfile({ ...profile, ...patch }, settings) : profile,
      ),
    });
  }
  return syncLegacyRelayFields({
    ...settings,
    relayProfiles: settings.relayProfiles.map((profile) => {
      if (profile.id !== id) return profile;
      return deriveRelayProfileFromFiles({ ...profile, ...patch });
    }),
  });
}

function createRelayProfile(settings: BackendSettings): RelayProfile {
  const id = `relay-${Date.now().toString(36)}`;
  const contextSelection = contextSelectionForAllEntries(settings);
  const next = {
    id,
    name: tf("供应商 {0}", [settings.relayProfiles.length + 1]),
    model: "",
    baseUrl: defaultSettings.relayBaseUrl,
    upstreamBaseUrl: defaultSettings.relayBaseUrl,
    apiKey: "",
    protocol: "responses" as RelayProtocol,
    relayMode: "official" as RelayMode,
    sessionProvider: "custom" as RelaySessionProvider,
    officialMixApiKey: false,
    hideOfficialUsageAlert: false,
    testModel: "",
    configContents: "",
    authContents: "",
    useCommonConfig: true,
    contextSelection,
    contextSelectionInitialized: true,
    contextWindow: "",
    autoCompactLimit: "",
    modelList: "",
    modelWindows: "",
    modelAutoCompact: "",
    modelMetadata: "",
    modelVlm: "",
    vlmApiKey: "",
    vlmModel: "",
    vlmBaseUrl: "",
    userAgent: "",
    customHeaders: [],
    sub2apiEnabled: false,
    noAuth: false,
    sub2apiMultiplier: "",
    modelRoutes: [],
    standardOpenaiProtocol: false,
    webSearchHistoryCompat: false,
  };
  return withGeneratedRelayFiles(next);
}

function createAggregateRelayProfile(settings: BackendSettings): RelayProfile {
  const id = `aggregate-${Date.now().toString(36)}`;
  const contextSelection = contextSelectionForAllEntries(settings);
  const candidates = aggregateMemberCandidates(settings.relayProfiles, id);
  return normalizeAggregateRelayProfile(
    {
      id,
      name: tf("聚合供应商 {0}", [settings.relayProfiles.filter(isAggregateRelayProfile).length + 1]),
      model: "",
      baseUrl: "",
      upstreamBaseUrl: "",
      apiKey: "",
      protocol: "responses",
      relayMode: "aggregate",
      sessionProvider: "custom",
      officialMixApiKey: false,
      hideOfficialUsageAlert: false,
      testModel: "",
      configContents: "",
      authContents: "",
      useCommonConfig: true,
      contextSelection,
      contextSelectionInitialized: true,
      contextWindow: "",
      autoCompactLimit: "",
      modelList: "",
      modelWindows: "",
      modelAutoCompact: "",
      modelMetadata: "",
      modelVlm: "",
      vlmApiKey: "",
      vlmModel: "",
      vlmBaseUrl: "",
      userAgent: "",
      customHeaders: [],
      sub2apiEnabled: false,
      noAuth: false,
      sub2apiMultiplier: "",
      modelRoutes: [],
      standardOpenaiProtocol: false,
      webSearchHistoryCompat: false,
      aggregate: {
        strategy: "failover",
        modelAggregationEnabled: false,
        members: candidates.slice(0, 1).map((profile) => ({ profileId: profile.id, weight: 1 })),
        defaultRelayId: "",
      },
    },
    settings,
  );
}

function addRelayProfile(settings: BackendSettings, profile: RelayProfile): BackendSettings {
  const nextWithFiles = isAggregateRelayProfile(profile)
    ? normalizeAggregateRelayProfile(profile, settings)
    : deriveRelayProfileFromFiles(
        profile.configContents.trim() || profile.authContents.trim() ? profile : withGeneratedRelayFiles(profile),
      );
  const activeId = settings.relayProfiles.some((item) => item.id === settings.activeRelayId)
    ? settings.activeRelayId
    : activeRelayProfile(settings).id;
  return syncLegacyRelayFields({
    ...settings,
    relayProfiles: [...settings.relayProfiles, nextWithFiles],
    activeRelayId: activeId,
  });
}

function duplicateRelayProfile(settings: BackendSettings, id: string): BackendSettings {
  const sourceIndex = settings.relayProfiles.findIndex((profile) => profile.id === id);
  const source = settings.relayProfiles[sourceIndex] || activeRelayProfile(settings);
  const nextId = `relay-${Date.now().toString(36)}`;
  const next = {
    ...source,
    id: nextId,
    name: tf("{0} 副本", [source.name || t("未命名供应商")]),
  };
  const normalizedNext = isAggregateRelayProfile(next) ? normalizeAggregateRelayProfile(next, settings) : next;
  const relayProfiles = [...settings.relayProfiles];
  relayProfiles.splice(sourceIndex >= 0 ? sourceIndex + 1 : relayProfiles.length, 0, normalizedNext);
  return syncLegacyRelayFields({
    ...settings,
    relayProfiles,
  });
}

function reorderRelayProfiles(settings: BackendSettings, sourceId: string, targetId: string): BackendSettings {
  if (sourceId === targetId) return settings;
  const sourceIndex = settings.relayProfiles.findIndex((profile) => profile.id === sourceId);
  const targetIndex = settings.relayProfiles.findIndex((profile) => profile.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return settings;
  const relayProfiles = [...settings.relayProfiles];
  const [moved] = relayProfiles.splice(sourceIndex, 1);
  relayProfiles.splice(targetIndex, 0, moved);
  return syncLegacyRelayFields({
    ...settings,
    relayProfiles,
  });
}

function removeRelayProfile(settings: BackendSettings, id: string): BackendSettings {
  if (relayProfileDeleteIssue(settings, id)) return settings;
  const profiles = settings.relayProfiles.filter((profile) => profile.id !== id);
  const scrubbedProfiles = profiles.map((profile) =>
    isAggregateRelayProfile(profile)
      ? normalizeAggregateRelayProfile(
          {
            ...profile,
            aggregate: {
              ...normalizeAggregateConfig(profile.aggregate, [], new Set(profiles.map((item) => item.id))),
              // 用户显式删除的这家必须从成员/路由里移除：存在性判定会保留它
              // （profiles 里已经没有了，其实也会被丢掉），这里再做一次明确的过滤。
              members: normalizeAggregateConfig(profile.aggregate, [], new Set(profiles.map((item) => item.id)))
                .members.filter((member) => member.profileId !== id),
              routes: (normalizeAggregateConfig(profile.aggregate, [], new Set(profiles.map((item) => item.id))).routes ?? [])
                .filter((route) => route.profileId !== id),
            },
          },
          { ...settings, relayProfiles: profiles },
        )
      : {
          ...profile,
          modelRoutes: normalizeRelayModelRoutes(profile.modelRoutes).filter((route) => route.targetRelayId !== id),
        },
  );
  return syncLegacyRelayFields({
    ...settings,
    relayProfiles: scrubbedProfiles.length ? scrubbedProfiles : defaultSettings.relayProfiles,
    activeRelayId: settings.activeRelayId === id ? scrubbedProfiles[0]?.id || "default" : settings.activeRelayId,
  });
}

function relayProfileDeleteIssue(settings: BackendSettings, id: string): string | null {
  if (settings.activeRelayId === id) {
    return t("当前正在使用该供应商，请先切换到其他供应商后再删除。");
  }
  const existingProfileIds = new Set(settings.relayProfiles.map((profile) => profile.id));
  for (const aggregateProfile of settings.relayProfiles.filter(isAggregateRelayProfile)) {
    const aggregate = normalizeAggregateConfig(aggregateProfile.aggregate, [], existingProfileIds);
    if (!aggregate.members.some((member) => member.profileId === id)) continue;
    if (aggregate.defaultRelayId === id) {
      return tf("供应商「{0}」是聚合配置「{1}」的默认成员，请先调整聚合配置后再删除。", [
        settings.relayProfiles.find((profile) => profile.id === id)?.name || id,
        aggregateProfile.name || aggregateProfile.id,
      ]);
    }
    if (aggregate.members.length <= 1) {
      return tf("供应商「{0}」是聚合配置「{1}」的最后成员，请先调整聚合配置后再删除。", [
        settings.relayProfiles.find((profile) => profile.id === id)?.name || id,
        aggregateProfile.name || aggregateProfile.id,
      ]);
    }
  }
  return null;
}

const aggregateStrategyOptions: Array<{ value: RelayAggregateStrategy; label: string; description: string }> = [
  {
    value: "failover",
    get label() { return t("失败切换"); },
    get description() { return t("按成员顺序请求，失败后切到下一个供应商。"); },
  },
  {
    value: "conversationRoundRobin",
    get label() { return t("按对话轮转"); },
    get description() { return t("同一对话保持一个成员，不同对话依次分配。"); },
  },
  {
    value: "requestRoundRobin",
    get label() { return t("按请求轮转"); },
    get description() { return t("每次请求按成员顺序切换，适合均匀摊请求量。"); },
  },
  {
    value: "weightedRoundRobin",
    get label() { return t("权重轮转"); },
    get description() { return t("按成员权重分配请求，权重越高承担越多。"); },
  },
];

function isAggregateRelayProfile(profile: Pick<RelayProfile, "relayMode" | "aggregate">): boolean {
  return isAggregateProfile(profile);
}

type ProviderViewKind = "direct" | "routing" | "failover" | "modelAggregation";

function relayProviderView(profile: RelayProfile): ProviderViewKind {
  if (isAggregateRelayProfile(profile)) {
    return profile.aggregate?.modelAggregationEnabled === true ? "modelAggregation" : "failover";
  }
  return profile.protocol !== "responses" || normalizeRelayModelRoutes(profile.modelRoutes).length
    ? "routing"
    : "direct";
}

function normalizeAggregateRelayProfile(profile: RelayProfile, settings: BackendSettings | null): RelayProfile {
  const candidates = settings ? aggregateMemberCandidates(settings.relayProfiles, profile.id) : [];
  // 传"全部供应商 id"而不是候选：成员的存在性判定不能受"当前是否就绪"影响。
  const existingProfileIds = settings ? new Set(settings.relayProfiles.map((item) => item.id)) : null;
  const aggregate = normalizeAggregateConfig(profile.aggregate, candidates, existingProfileIds);
  return {
    ...profile,
    baseUrl: "",
    upstreamBaseUrl: "",
    apiKey: "",
    protocol: "responses",
    relayMode: "aggregate",
    sessionProvider: normalizeRelaySessionProvider(profile.sessionProvider),
    officialMixApiKey: false,
    hideOfficialUsageAlert: false,
    configContents: "",
    authContents: "",
    sub2apiEnabled: false,
    noAuth: false,
    sub2apiMultiplier: "",
    standardOpenaiProtocol: false,
    webSearchHistoryCompat: false,
    aggregate,
  };
}

// 创建时选定类型；重新创建草稿时不沿用另一类的路由、权重或测试模型。
function aggregateProfileForMode(profile: RelayProfile, settings: BackendSettings, mode: AggregateMode): RelayProfile {
  const members = (profile.aggregate?.members ?? []).map((member) => ({ profileId: member.profileId, weight: 1 }));
  // 模型聚合总要有一个默认供应商（对标 CC Switch）：沿用仍合法的旧值，否则默认第一个成员。
  const defaultRelayId = mode === "model"
    ? normalizeAggregateDefaultRelayId(
        profile.aggregate?.defaultRelayId,
        new Set(members.map((member) => member.profileId)),
      ) || members[0]?.profileId || ""
    : "";
  return normalizeAggregateRelayProfile({
    ...profile,
    testModel: "",
    aggregate: {
      strategy: "failover",
      modelAggregationEnabled: mode === "model",
      members,
      routes: [],
      defaultRelayId,
    },
  }, settings);
}

function normalizeAggregateConfig(
  aggregate: RelayAggregateConfig | null | undefined,
  candidates: RelayProfile[],
  /**
   * 当前快照里**全部**供应商 id（不只是可勾选候选）。传了才判定成员的存在性；不传
   * （分页子集、拿不到完整快照）则一律保留成员——宁可留着让用户自己取消勾选，
   * 也不能替用户删配置。
   */
  existingProfileIds: ReadonlySet<string> | null = null,
): RelayAggregateConfig {
  const candidateIds = new Set(candidates.map((profile) => profile.id));
  const seen = new Set<string>();
  const strategy: RelayAggregateStrategy =
    aggregate?.strategy && aggregateStrategyOptions.some((option) => option.value === aggregate.strategy)
      ? aggregate.strategy
      : "failover";
  const modelAggregationEnabled = aggregate?.modelAggregationEnabled === true;
  // 成员去留只看"这家供应商还在不在"：候选集合只决定 UI 能勾选什么，不能用来删掉
  // 已经在聚合里的成员（供应商编辑中缺 Key 时判定会翻转，见 normalizeAggregateMembers）。
  const members = normalizeAggregateMembers(aggregate?.members ?? [], existingProfileIds)
    .map((member) => {
      seen.add(member.profileId);
      return { profileId: member.profileId, weight: modelAggregationEnabled ? 1 : clampAggregateWeight(member.weight) };
    });
  // 路由目标同样只按"供应商还在不在"去留：路由早就配好了，目标一时不就绪（或同一批
  // settings 里排在聚合后面）不代表用户想删掉这条路由。
  const routes = modelAggregationEnabled ? [] : (aggregate?.routes ?? [])
    .filter((route) => route.pattern.trim() !== "" || route.profileId.trim() !== "")
    .filter((route) => !existingProfileIds || !route.profileId.trim() || existingProfileIds.has(route.profileId.trim()))
    .map((route) => ({
      pattern: route.pattern.trim(),
      profileId: route.profileId,
      priority: clampAggregateRoutePriority(route.priority),
    }));
  // 默认供应商必须是当前成员；成员被移出（或值不再合法）时自动清空为「未设置」。
  const defaultRelayId = normalizeAggregateDefaultRelayId(
    aggregate?.defaultRelayId,
    new Set(members.map((member) => member.profileId)),
  );
  return {
    strategy: modelAggregationEnabled ? "failover" : strategy,
    modelAggregationEnabled,
    members,
    routes,
    defaultRelayId,
    syncDefaultMemberLogin: aggregate?.syncDefaultMemberLogin === true,
  };
}

function clampAggregateWeight(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(999, Math.round(value)));
}

function aggregateStrategyLabel(strategy: RelayAggregateStrategy): string {
  return aggregateStrategyOptions.find((option) => option.value === strategy)?.label ?? t("失败切换");
}

function aggregateStrategyHelp(strategy: RelayAggregateStrategy): string {
  if (strategy === "failover") return t("失败切换会保留成员顺序，优先使用第一个可用供应商。");
  if (strategy === "conversationRoundRobin") return t("按对话轮转会让同一对话尽量保持固定成员，降低上下文漂移。");
  if (strategy === "requestRoundRobin") return t("按请求轮转会逐请求切换成员，适合供应商能力接近的场景。");
  return t("权重轮转会读取每个成员的权重值，权重越高的成员获得更多请求。");
}

function aggregateRelayProfileValidation(profile: RelayProfile): string | null {
  const aggregate = normalizeAggregateConfig(profile.aggregate, []);
  if (aggregate.members.length < 1) {
    return t("聚合供应商至少需要勾选 1 个可用成员（API 供应商或官方登录账号）。");
  }
  // 模型聚合必须指定默认供应商（不带前缀的请求只有它能接）。
  if (aggregate.modelAggregationEnabled === true) {
    const defaultRelayId = (aggregate.defaultRelayId ?? "").trim();
    const defaultIsMember = !!defaultRelayId
      && aggregate.members.some((member) => member.profileId === defaultRelayId);
    if (!defaultIsMember) {
      return t("模型聚合必须指定「默认供应商」：在成员列表里点某一行的「设为默认」。不带 cpx- 前缀的请求会原样交给它，没设就报错。");
    }
  }
  const issues = validateAggregateRoutes(
    aggregate.routes ?? [],
    new Set(aggregate.members.map((member) => member.profileId)),
  );
  if (!issues) return null;
  const first = issues[0];
  if (first.code === "emptyPattern") {
    return t("路由规则的模型匹配模式不能为空。");
  }
  if (first.code === "invalidPriority") {
    return tf("路由规则「{0}」的优先级必须是大于等于 0 的整数。", [first.pattern]);
  }
  return tf("路由规则「{0}」的目标供应商必须是聚合成员，请先将其勾选为成员。", [first.pattern]);
}

function splitLogLines(text: string) {
  return text.trimEnd().split(/\r?\n/).filter((line, index, lines) => line.length > 0 || index < lines.length - 1);
}

function formatTime(value: number) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN");
}

function formatDuration(startedAtMs: number): string {
  if (!startedAtMs) return "-";
  const elapsed = Date.now() - startedAtMs;
  if (elapsed < 0) return formatTime(startedAtMs);
  const mins = Math.floor(elapsed / 60000);
  if (mins < 1) return t("刚刚启动");
  if (mins < 60) return tf("已运行 {0} 分钟", [mins]);
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return tf("已运行 {0} 小时 {1} 分钟", [hours, remainMins]);
}

function stringifyError(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function loadInitialRoute(): Route {
  if (typeof window === "undefined") return "overview";
  const params = new URLSearchParams(window.location.search);
  const previewRoute = params.get("previewRoute");
  if (previewRoute && routes.some((item) => item.id === previewRoute)) {
    return previewRoute as Route;
  }
  return "overview";
}
