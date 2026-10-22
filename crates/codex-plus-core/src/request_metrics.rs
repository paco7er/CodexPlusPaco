//! 协议转换与输入框状态条共用的运行中请求指标，仅保存在内存中。

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::atomic::{AtomicU64, Ordering};

static ENTRY_SEQUENCE: AtomicU64 = AtomicU64::new(0);

/// 一次上游请求的 token 用量。
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestUsage {
    pub input_tokens: u64,
    pub output_tokens: u64,
    #[serde(default)]
    pub cached_tokens: u64,
    #[serde(default)]
    pub reasoning_tokens: u64,
}

impl RequestUsage {
    /// 缓存命中率（cached / input），没有输入 token 时为 None。
    pub fn cache_hit_ratio(&self) -> Option<f64> {
        (self.input_tokens > 0).then(|| self.cached_tokens as f64 / self.input_tokens as f64)
    }
}

/// 一次被代理自动重试的上游尝试摘要。
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestAttemptDetail {
    /// 第几次上游尝试（从 1 开始）。
    pub attempt: u32,
    /// 触发重试的上游错误 code（若有）。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
    /// 上游错误 message（最多 200 字符）。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    /// 本次重试前的退避等待（毫秒）。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub delay_ms: Option<u64>,
}

/// 代理内部的重试/路由痕迹，随 `UpstreamProxyResponse` 交给启动器更新状态。
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestTrace {
    pub relay_id: String,
    pub relay_name: String,
    /// 客户端请求的模型名（聚合前缀/后缀原样）。
    pub model: String,
    /// 真正发给上游的模型名。
    pub upstream_model: String,
    pub wire_api: String,
    /// 上游请求总次数（含失败切换与自动重试）。
    pub attempts: u32,
    /// 代理自动重试次数（不含成员间失败切换）。
    pub auto_retries: u32,
    /// 上游第一段输出到达的 unix 毫秒时间（用于计算首字耗时）。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub first_output_at_ms: Option<u64>,
    #[serde(default)]
    pub retry_reasons: Vec<String>,
    /// 每次自动重试前的失败尝试摘要。
    #[serde(default)]
    pub attempt_details: Vec<RequestAttemptDetail>,
}

/// 输入框状态条使用的运行中请求快照。
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InFlightRequest {
    pub id: String,
    pub timestamp_ms: u64,
    pub started_at_ms: u64,
    pub duration_ms: u64,
    pub method: String,
    pub path: String,
    pub status_code: u16,
    pub success: bool,
    pub stream: bool,
    pub model: String,
    /// Codex 的会话/线程 id（来自请求头），用于把状态条限定在当前会话。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thread_id: Option<String>,
    pub upstream_model: String,
    pub relay_id: String,
    pub relay_name: String,
    pub wire_api: String,
    pub attempts: u32,
    pub auto_retries: u32,
    #[serde(default)]
    pub retry_reasons: Vec<String>,
    /// 每次自动重试前的失败尝试摘要。
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub attempt_details: Vec<RequestAttemptDetail>,
    /// `running` 表示请求还在进行中。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub state: Option<String>,
    /// 首字耗时（从请求开始到第一段上游输出），毫秒。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub first_token_ms: Option<u64>,
    /// 请求进行中按流式 delta 粗估的输出 token，完成后清空并写入准确 usage。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub estimated_output_tokens: Option<u64>,
    /// 请求进行中的阶段：requesting / waiting / retrying / generating。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub phase: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stream_outcome: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub usage: Option<RequestUsage>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cache_hit_ratio: Option<f64>,
}

impl InFlightRequest {
    pub fn new_id(started_at_ms: u64) -> String {
        let sequence = ENTRY_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        format!("{started_at_ms}-{sequence}")
    }

    pub fn finish(&mut self, finished_at_ms: u64) {
        self.timestamp_ms = finished_at_ms;
        self.duration_ms = finished_at_ms.saturating_sub(self.started_at_ms);
        self.cache_hit_ratio = self.usage.as_ref().and_then(RequestUsage::cache_hit_ratio);
        self.state = Some(if self.success { "success" } else { "failed" }.to_string());
        self.estimated_output_tokens = None;
    }
}

fn live_requests() -> &'static std::sync::Mutex<std::collections::BTreeMap<String, InFlightRequest>> {
    static LIVE: std::sync::OnceLock<
        std::sync::Mutex<std::collections::BTreeMap<String, InFlightRequest>>,
    > = std::sync::OnceLock::new();
    LIVE.get_or_init(|| std::sync::Mutex::new(std::collections::BTreeMap::new()))
}

/// 请求开始时登记到内存，供输入框状态条展示。
pub fn start_request(entry: &InFlightRequest) {
    let mut live = live_requests()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    live.insert(entry.id.clone(), entry.clone());
    // 防止异常退出前请求堆积；只保留最近的 64 条进行中记录。
    while live.len() > 64 {
        if let Some(oldest) = live.keys().next().cloned() {
            live.remove(&oldest);
        } else {
            break;
        }
    }
}

/// 请求结束即移除快照，不保存历史记录。
pub fn finish_request(entry: &InFlightRequest) {
    if let Ok(mut live) = live_requests().lock() {
        live.remove(&entry.id);
    }
}

/// 更新进行中请求的快照（例如上游地址/首字耗时在请求结束前就已知）。
pub fn update_running(entry: &InFlightRequest) {
    if let Ok(mut live) = live_requests().lock()
        && live.contains_key(&entry.id)
    {
        live.insert(entry.id.clone(), entry.clone());
    }
}

/// 更新进行中请求的阶段（供 Codex 应用内的状态条展示）。
pub fn update_running_phase(id: &str, phase: &str) {
    if let Ok(mut live) = live_requests().lock()
        && let Some(entry) = live.get_mut(id)
    {
        if entry.first_token_ms.is_some() && phase == "waiting" {
            return;
        }
        entry.phase = Some(phase.to_string());
    }
}

/// 缓冲读取到第一段输出时，立刻更新首字耗时与阶段。
pub fn update_running_first_token(id: &str) {
    if let Ok(mut live) = live_requests().lock()
        && let Some(entry) = live.get_mut(id)
    {
        if entry.first_token_ms.is_none() {
            entry.first_token_ms = Some(crate::request_metrics::current_time_ms_since(entry.started_at_ms));
        }
        entry.phase = Some("generating".to_string());
    }
}

fn current_time_ms_since(started_at_ms: u64) -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| (duration.as_millis() as u64).saturating_sub(started_at_ms))
        .unwrap_or(0)
}

/// 请求重试时实时更新进行中记录，管理器无需等请求结束就能看到重试次数递增。
pub fn update_running_retry(
    id: &str,
    attempts: u32,
    auto_retries: u32,
    retry_reasons: Vec<String>,
) {
    if let Ok(mut live) = live_requests().lock()
        && let Some(entry) = live.get_mut(id)
    {
        entry.attempts = attempts;
        entry.auto_retries = auto_retries;
        entry.retry_reasons = retry_reasons;
    }
}

/// 运行中请求的输出 token 粗估（按已收到的流式 delta 字符数 / 4 计算）。
pub fn update_running_output_estimate(id: &str, tokens: u64) {
    if let Ok(mut live) = live_requests().lock()
        && let Some(entry) = live.get_mut(id)
    {
        entry.estimated_output_tokens = Some(tokens);
    }
}

/// 记录一次失败尝试摘要；进行中的请求详情即可看到重试原因。
pub fn update_running_attempt_detail(id: &str, detail: RequestAttemptDetail) {
    if let Ok(mut live) = live_requests().lock()
        && let Some(entry) = live.get_mut(id)
    {
        entry.attempt_details.push(detail);
    }
}

pub fn running_requests() -> Vec<InFlightRequest> {
    live_requests()
        .lock()
        .map(|live| live.values().cloned().collect())
        .unwrap_or_default()
}

/// 串行化使用运行中列表的测试（Rust 测试默认并行）。
pub fn request_metrics_test_guard() -> std::sync::MutexGuard<'static, ()> {
    static LOCK: std::sync::OnceLock<std::sync::Mutex<()>> = std::sync::OnceLock::new();
    LOCK.get_or_init(|| std::sync::Mutex::new(()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// 从非流式 Responses JSON（或 `response.completed` 的 data）里提取 usage。
pub fn usage_from_response_json(value: &Value) -> Option<RequestUsage> {
    let usage = value
        .get("response")
        .and_then(|response| response.get("usage"))
        .or_else(|| value.get("usage"))?;
    let input_tokens = usage.get("input_tokens").and_then(Value::as_u64)?;
    let output_tokens = usage.get("output_tokens").and_then(Value::as_u64)?;
    let cached_tokens = usage
        .pointer("/input_tokens_details/cached_tokens")
        .and_then(Value::as_u64)
        .or_else(|| usage.get("cache_read_input_tokens").and_then(Value::as_u64))
        .unwrap_or(0);
    let reasoning_tokens = usage
        .pointer("/output_tokens_details/reasoning_tokens")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    Some(RequestUsage {
        input_tokens,
        output_tokens,
        cached_tokens,
        reasoning_tokens,
    })
}

/// 从任意响应 JSON 里尽力提取 usage（含 chat completions 的 prompt/completion 字段）。
pub fn usage_from_body_bytes(body: &[u8]) -> Option<RequestUsage> {
    let value: Value = serde_json::from_slice(body).ok()?;
    if let Some(usage) = usage_from_response_json(&value) {
        return Some(usage);
    }
    let usage = value.get("usage")?;
    let input_tokens = usage
        .get("prompt_tokens")
        .or_else(|| usage.get("input_tokens"))
        .and_then(Value::as_u64)?;
    let output_tokens = usage
        .get("completion_tokens")
        .or_else(|| usage.get("output_tokens"))
        .and_then(Value::as_u64)?;
    let cached_tokens = usage
        .pointer("/prompt_tokens_details/cached_tokens")
        .and_then(Value::as_u64)
        .or_else(|| usage.pointer("/input_tokens_details/cached_tokens").and_then(Value::as_u64))
        .unwrap_or(0);
    Some(RequestUsage {
        input_tokens,
        output_tokens,
        cached_tokens,
        reasoning_tokens: 0,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn entry(id: &str) -> InFlightRequest {
        InFlightRequest {
            id: id.to_string(),
            timestamp_ms: 0,
            started_at_ms: 0,
            duration_ms: 0,
            method: "POST".to_string(),
            path: "/v1/responses".to_string(),
            status_code: 200,
            success: true,
            stream: true,
            model: "gpt-6.1-sol".to_string(),
            thread_id: Some("thread-1".to_string()),
            upstream_model: "gpt-6.1-sol".to_string(),
            relay_id: "relay-a".to_string(),
            relay_name: "供应商 4".to_string(),
            wire_api: "Responses".to_string(),
            attempts: 2,
            auto_retries: 1,
            retry_reasons: vec!["upstream_stream_failed:server_is_overloaded".to_string()],
            attempt_details: Vec::new(),
            state: None,
            first_token_ms: Some(120),
            estimated_output_tokens: None,
            phase: None,
            error: None,
            stream_outcome: None,
            usage: Some(RequestUsage {
                input_tokens: 1000,
                output_tokens: 200,
                cached_tokens: 900,
                reasoning_tokens: 50,
            }),
            cache_hit_ratio: None,
        }
    }

    #[test]
    fn attempt_details_round_trip_and_legacy_entries_default_empty() {
        let mut retried = entry("retried");
        retried.attempt_details.push(RequestAttemptDetail {
            attempt: 1,
            code: Some("server_is_overloaded".to_string()),
            message: Some("Our servers are currently overloaded.".to_string()),
            delay_ms: Some(250),
        });
        let raw = serde_json::to_value(&retried).unwrap();
        assert_eq!(raw["attemptDetails"][0]["attempt"], json!(1));
        assert_eq!(
            raw["attemptDetails"][0]["code"],
            json!("server_is_overloaded")
        );
        assert_eq!(raw["attemptDetails"][0]["delayMs"], json!(250));
        let parsed: InFlightRequest = serde_json::from_value(raw).unwrap();
        assert_eq!(parsed.attempt_details, retried.attempt_details);

        // 旧日志没有 attemptDetails：读入后为空，且空明细不写盘。
        let mut legacy = serde_json::to_value(entry("legacy")).unwrap();
        legacy.as_object_mut().unwrap().remove("attemptDetails");
        let parsed: InFlightRequest = serde_json::from_value(legacy).unwrap();
        assert!(parsed.attempt_details.is_empty());
        let empty = serde_json::to_value(entry("empty")).unwrap();
        assert!(empty.get("attemptDetails").is_none());
    }

    #[test]
    fn live_requests_are_visible_until_finished() {
        let _guard = request_metrics_test_guard();

        let mut running = entry("live-1");
        running.state = Some("running".to_string());
        running.success = false;
        start_request(&running);
        update_running_output_estimate("live-1", 42);
        update_running_retry("live-1", 2, 1, vec!["upstream_buffered_overload".to_string()]);
        let visible = running_requests();
        assert!(visible.iter().any(|item| item.id == "live-1" && item.state.as_deref() == Some("running")));
        assert!(visible.iter().any(|item| item.estimated_output_tokens == Some(42)));
        assert!(visible.iter().any(|item| item.attempts == 2 && item.auto_retries == 1));

        let mut finished = running.clone();
        finished.success = true;
        finished.finish(200);
        finish_request(&finished);
        assert!(running_requests().is_empty());
    }

    #[test]
    fn usage_is_extracted_from_completed_response() {
        let completed = json!({
            "type": "response.completed",
            "response": {
                "usage": {
                    "input_tokens": 111,
                    "output_tokens": 22,
                    "input_tokens_details": {"cached_tokens": 100},
                    "output_tokens_details": {"reasoning_tokens": 7}
                }
            }
        });
        let usage = usage_from_response_json(&completed).unwrap();
        assert_eq!(usage.input_tokens, 111);
        assert_eq!(usage.output_tokens, 22);
        assert_eq!(usage.cached_tokens, 100);
        assert_eq!(usage.reasoning_tokens, 7);
        assert_eq!(usage.cache_hit_ratio(), Some(100.0 / 111.0));

        let chat = br#"{"usage":{"prompt_tokens":10,"completion_tokens":5,"prompt_tokens_details":{"cached_tokens":4}}}"#;
        let usage = usage_from_body_bytes(chat).unwrap();
        assert_eq!(usage.input_tokens, 10);
        assert_eq!(usage.output_tokens, 5);
        assert_eq!(usage.cached_tokens, 4);
        assert!(usage_from_body_bytes(b"not-json").is_none());
    }
}
