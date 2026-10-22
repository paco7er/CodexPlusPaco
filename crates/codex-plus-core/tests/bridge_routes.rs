use std::sync::{Arc, Mutex};

use async_trait::async_trait;
use codex_plus_core::launcher::{
    CodexLaunch, LaunchHooks, LaunchOptions, ProcessWaitStrategy, launch_and_inject_with_hooks,
};
use codex_plus_core::models::{DeleteResult, DeleteStatus, ExportResult, ExportStatus, SessionRef};
use codex_plus_core::routes::{
    BridgeContext, BridgeDataService, BridgeRuntimeService, BridgeSettingsService,
    CoreRuntimeService, evaluate_extension_cdp, handle_bridge_request,
};
use codex_plus_core::settings::BackendSettings;
use codex_plus_core::status::StatusStore;
use serde_json::{Value, json};

#[tokio::test]
async fn bridge_routes_cover_all_current_paths() {
    let ctx = test_context();

    let cases = [
        ("/settings/get", json!({})),
        ("/settings/set", json!({"providerSyncEnabled": true})),
        ("/cdp/targets", json!({})),
        ("/cdp/evaluate", json!({"kind":"avatar-overlay","expression":"1"})),
        ("/devtools/open", json!({})),
        ("/manager/open", json!({})),
        ("/manager/open-transient", json!({})),
        ("/backend/status", json!({})),
        ("/whale/balance", json!({})),
        ("/whale/session", json!({"session_id": "s1"})),
        ("/whale/history", json!({})),
        ("/whale/full", json!({"path":"/dsh-whale/size.json"})),
        ("/codex-model-catalog", json!({})),
        ("/codex-config-model", json!({})),
        (
            "/llm-proxy",
            json!({"url": "http://example.com", "method": "POST"}),
        ),
        ("/stepwise/settings", json!({})),
        (
            "/stepwise/generate",
            json!({"request": {"lastUserMessage": "请继续", "lastAssistantMessage": "已完成"}}),
        ),
        ("/stepwise/test", json!({})),
        (
            "/delete",
            json!({"session_id": "s1", "title": "First", "host_id": "local"}),
        ),
        ("/undo", json!({"undo_token": "undo-1"})),
        (
            "/export-markdown",
            json!({"session_id": "s1", "title": "First"}),
        ),
        (
            "/thread-usage-history",
            json!({"session_id": "s1", "title": "First"}),
        ),
        (
            "/thread-usage-live",
            json!({"session_id": "s1", "title": "First"}),
        ),
        ("/archived-thread", json!({"title": "Archived"})),
    ];

    for (path, payload) in cases {
        let result = handle_bridge_request(ctx.clone(), path, payload).await;
        assert_ne!(
            result["message"], "Unknown bridge path",
            "{path} should be routed"
        );
    }
}

#[tokio::test]
async fn retired_advertisement_route_fails_closed() {
    let result = handle_bridge_request(test_context(), "/ads", json!({})).await;
    assert_eq!(result["message"], "Unknown bridge path");
}

#[tokio::test]
async fn retired_script_management_routes_are_unavailable() {
    let ctx = test_context();
    for path in [
        "/user-scripts/list",
        "/user-scripts/load",
        "/user-scripts/reload",
        "/user-scripts/set-enabled",
        "/user-scripts/set-script-enabled",
        "/user-scripts/delete",
        "/script-market/list",
        "/script-market/install",
    ] {
        let result = handle_bridge_request(
            ctx.clone(),
            path,
            json!({"enabled": true, "key": "user:existing.js", "id": "existing"}),
        )
        .await;
        assert_eq!(result["message"], "Unknown bridge path", "{path}");
    }
}

#[tokio::test]
async fn cdp_evaluate_rejects_empty_expression_without_touching_cdp() {
    let error = evaluate_extension_cdp(1, &json!({"kind": "avatar-overlay"}))
        .await
        .unwrap_err();
    assert!(
        error.to_string().contains("expression"),
        "{error}"
    );
}

#[tokio::test]
async fn cdp_routes_are_wired_for_extensions() {
    let result = handle_bridge_request(test_context(), "/cdp/targets", json!({})).await;
    assert_eq!(result["status"], "failed");
    assert_ne!(result["message"], "Unknown bridge path");
    assert!(
        result["message"].as_str().unwrap_or("").contains("CDP targets"),
        "{}",
        result
    );
}

#[tokio::test]
async fn thread_usage_live_route_returns_recent_token_events() {
    // 内置状态栏走的就是这条路由；它必须与 /thread-usage-history 分开，
    // 因为状态栏按秒级轮询，拿不动全量历史。
    let result = handle_bridge_request(
        test_context(),
        "/thread-usage-live",
        json!({"session_id": "s1", "title": "First"}),
    )
    .await;
    assert_eq!(result["status"], "ok");
    assert_eq!(result["session_id"], "s1");
    assert_eq!(result["events"][0]["cached_input_tokens"], json!(900));
    assert_eq!(result["events"][0]["context_window"], json!(258400));
}

#[tokio::test]
async fn whale_routes_require_both_enhancements_and_widget_switch() {
    for (enhancements, widget) in [(false, true), (true, false), (false, false)] {
        let settings = BackendSettings {
            enhancements_enabled: enhancements,
            codex_app_whale_widget_enabled: widget,
            ..BackendSettings::default()
        };
        let ctx = BridgeContext::new(
            Arc::new(FakeSettings::with_settings(settings)),
            Arc::new(FakeRuntime::default()),
            Arc::new(FakeData),
        );
        for route in ["/whale/balance", "/whale/session", "/whale/history"] {
            let result =
                handle_bridge_request(ctx.clone(), route, json!({"session_id":"s1"})).await;
            assert_eq!(result["status"], "disabled", "{route}");
        }
        let result = handle_bridge_request(
            ctx,
            "/whale/full",
            json!({"path":"/dsh-whale/size.json","method":"PUT","body":{"scale":1.5}}),
        )
        .await;
        assert_eq!(result["status"], 403);
    }
    let settings = BackendSettings {
        codex_app_whale_widget_enabled: true,
        ..BackendSettings::default()
    };
    let ctx = BridgeContext::new(
        Arc::new(FakeSettings::with_settings(settings)),
        Arc::new(FakeRuntime::default()),
        Arc::new(FakeData),
    );
    let result =
        handle_bridge_request(ctx.clone(), "/whale/session", json!({"session_id":"s1"})).await;
    assert_eq!(result["status"], "ok");
    assert_eq!(result["sessionId"], "s1");
    let result = handle_bridge_request(ctx, "/whale/balance", json!({})).await;
    assert_eq!(result["status"], "unsupported");
    assert!(result["balances"].as_array().unwrap().is_empty());
}

#[tokio::test]
async fn whale_local_statistics_toggle_stops_both_current_and_machine_log_routes() {
    let service = Arc::new(FakeSettings::with_settings(BackendSettings {
        codex_app_whale_widget_enabled: true,
        ..BackendSettings::default()
    }));
    let path = service.whale_ledger_path();
    let ctx = BridgeContext::new(
        service,
        Arc::new(FakeRuntime::default()),
        Arc::new(FakeData),
    );
    let history = handle_bridge_request(ctx.clone(), "/whale/history", json!({})).await;
    assert_eq!(history["status"], "ok");
    let result = handle_bridge_request(
        ctx.clone(),
        "/whale/full",
        json!({"path":"/dsh-whale/size.json","method":"PUT","body":{"codexStatsOn":false}}),
    )
    .await;
    assert_eq!(result["status"], 200);
    assert!(path.exists());
    for route in ["/whale/session", "/whale/history"] {
        let result = handle_bridge_request(ctx.clone(), route, json!({"session_id":"s1"})).await;
        assert_eq!(result["status"], "disabled");
    }
    let result = handle_bridge_request(
        ctx,
        "/whale/full",
        json!({"path":"/dsh-whale/api-models.json"}),
    )
    .await;
    assert_eq!(result["body"]["codexStatsOn"], false);
}

#[tokio::test]
async fn llm_proxy_rejects_local_addresses() {
    let ctx = test_context();

    let result = handle_bridge_request(
        ctx,
        "/llm-proxy",
        json!({
            "url": "https://127.0.0.1/v1/chat/completions",
            "method": "POST",
            "headers": {"Authorization": "Bearer sk-test"},
            "body": "{}"
        }),
    )
    .await;

    assert_eq!(result["status"], json!("failed"));
    assert_eq!(result["message"], json!("Base URL 不得指向本机或私有网络"));
}

#[tokio::test]
async fn llm_proxy_requires_https() {
    let ctx = test_context();

    let result = handle_bridge_request(
        ctx,
        "/llm-proxy",
        json!({
            "url": "http://api.example.com/v1/chat/completions",
            "method": "POST",
            "body": "{}"
        }),
    )
    .await;

    assert_eq!(result["status"], json!("failed"));
    assert_eq!(result["message"], json!("Base URL 必须使用 HTTPS"));
}

#[tokio::test]
async fn llm_proxy_rejects_non_post_methods() {
    let ctx = test_context();

    let result = handle_bridge_request(
        ctx,
        "/llm-proxy",
        json!({
            "url": "https://api.example.com/v1/chat/completions",
            "method": "GET",
            "body": "{}"
        }),
    )
    .await;

    assert_eq!(result["status"], json!("failed"));
    assert_eq!(result["message"], json!("LLM Bridge 仅支持 POST 请求"));
}

#[tokio::test]
async fn settings_get_includes_runtime_codex_app_version() {
    let ctx = BridgeContext::new(
        Arc::new(FakeSettings::with_codex_app_version("26.601.21317")),
        Arc::new(FakeRuntime::default()),
        Arc::new(FakeData::default()),
    );

    let result = handle_bridge_request(ctx, "/settings/get", json!({})).await;

    assert_eq!(result["codexAppVersion"], json!("26.601.21317"));
    assert_eq!(result["activeRelaySessionProvider"], json!("custom"));
    assert_eq!(result["codexAppPluginMarketplaceUnlock"], json!(true));
    assert_eq!(result.get("codexAppForcePluginInstall"), None);
    assert_eq!(result["codexAppThreadIdBadge"], json!(false));
}

#[tokio::test]
async fn settings_get_exposes_active_openai_session_provider() {
    let settings = BackendSettings {
        relay_profiles: vec![codex_plus_core::settings::RelayProfile {
            config_contents: "model_provider = \"openai\"\n".to_string(),
            ..codex_plus_core::settings::RelayProfile::default()
        }],
        ..BackendSettings::default()
    };
    let ctx = BridgeContext::new(
        Arc::new(FakeSettings::with_settings(settings)),
        Arc::new(FakeRuntime::default()),
        Arc::new(FakeData::default()),
    );

    let result = handle_bridge_request(ctx, "/settings/get", json!({})).await;

    assert_eq!(result["activeRelaySessionProvider"], json!("openai"));
    assert_eq!(result["activeRelayCodexProvider"], json!("openai"));
}

#[tokio::test]
async fn settings_get_preserves_arbitrary_custom_provider_id() {
    let settings = BackendSettings {
        relay_profiles: vec![codex_plus_core::settings::RelayProfile {
            config_contents: "model_provider = \"ccswitch\"\n".to_string(),
            ..codex_plus_core::settings::RelayProfile::default()
        }],
        ..BackendSettings::default()
    };
    let ctx = BridgeContext::new(
        Arc::new(FakeSettings::with_settings(settings)),
        Arc::new(FakeRuntime::default()),
        Arc::new(FakeData::default()),
    );

    let result = handle_bridge_request(ctx, "/settings/get", json!({})).await;

    assert_eq!(result["activeRelaySessionProvider"], json!("custom"));
    assert_eq!(result["activeRelayCodexProvider"], json!("ccswitch"));
}

#[tokio::test]
async fn settings_get_does_not_expose_stepwise_api_key_to_renderer() {
    let settings = BackendSettings {
        codex_app_stepwise_api_key: "sk-secret".to_string(),
        ..BackendSettings::default()
    };
    let ctx = BridgeContext::new(
        Arc::new(FakeSettings::with_settings(settings)),
        Arc::new(FakeRuntime::default()),
        Arc::new(FakeData::default()),
    );

    let result = handle_bridge_request(ctx, "/settings/get", json!({})).await;

    assert!(result.get("codexAppStepwiseApiKey").is_none());
    assert_eq!(
        result["codexAppStepwiseApiKeyEnv"],
        json!("CODEX_STEPWISE_API_KEY")
    );
}

#[tokio::test]
async fn settings_set_does_not_persist_runtime_codex_app_version() {
    let settings = Arc::new(FakeSettings::with_codex_app_version("26.601.21317"));
    let ctx = BridgeContext::new(
        settings.clone(),
        Arc::new(FakeRuntime::default()),
        Arc::new(FakeData::default()),
    );

    let result = handle_bridge_request(
        ctx,
        "/settings/set",
        json!({
            "codexAppVersion": "1.2.3",
            "codexAppPluginMarketplaceUnlock": false
        }),
    )
    .await;

    assert_eq!(result["codexAppVersion"], json!("26.601.21317"));
    assert_eq!(result["codexAppPluginMarketplaceUnlock"], json!(false));

    let persisted = settings.settings.lock().unwrap().clone();
    let persisted_value = serde_json::to_value(persisted).unwrap();
    assert!(persisted_value.get("codexAppVersion").is_none());
}

#[tokio::test]
async fn bridge_context_core_with_app_dir_exposes_runtime_codex_app_version() {
    let temp = tempfile::tempdir().unwrap();
    let app_dir = temp
        .path()
        .join("OpenAI.Codex_26.601.21317.0_x64__abc")
        .join("app");
    std::fs::create_dir_all(&app_dir).unwrap();
    std::fs::write(app_dir.join("Codex.exe"), "").unwrap();
    let ctx = BridgeContext::core_with_data_and_app_dir(
        Arc::new(FakeRuntime::default()),
        Arc::new(FakeData::default()),
        app_dir,
    );

    let result = handle_bridge_request(ctx, "/settings/get", json!({})).await;

    assert_eq!(result["codexAppVersion"], json!("26.601.21317.0"));
}

#[tokio::test]
async fn stepwise_routes_use_settings_service() {
    let settings = BackendSettings {
        codex_app_stepwise_enabled: false,
        codex_app_stepwise_generation_mode: "manual".to_string(),
        codex_app_stepwise_direct_send: true,
        codex_app_stepwise_model: "settings-service-stepwise".to_string(),
        codex_app_stepwise_max_items: 3,
        ..BackendSettings::default()
    };
    let ctx = BridgeContext::new(
        Arc::new(FakeSettings::with_settings(settings)),
        Arc::new(FakeRuntime::default()),
        Arc::new(FakeData::default()),
    );

    let public_settings = handle_bridge_request(ctx.clone(), "/stepwise/settings", json!({})).await;
    assert_eq!(public_settings["settings"]["enabled"], json!(false));
    assert_eq!(
        public_settings["settings"]["generationMode"],
        json!("manual")
    );
    assert_eq!(
        public_settings["settings"]["answerOutlineEnabled"],
        json!(false)
    );
    assert_eq!(public_settings["settings"]["directSend"], json!(true));
    assert_eq!(
        public_settings["settings"]["model"],
        json!("settings-service-stepwise")
    );
    assert_eq!(public_settings["settings"]["maxItems"], json!(3));
    assert_eq!(
        handle_bridge_request(
            ctx.clone(),
            "/stepwise/generate",
            json!({"request": {"lastUserMessage": "请继续", "lastAssistantMessage": "已完成"}}),
        )
        .await,
        json!({
            "status": "ok",
            "disabled": true,
            "protocol": "chat_completions",
            "items": []
        })
    );
    assert_eq!(
        handle_bridge_request(ctx, "/stepwise/test", json!({})).await,
        json!({
            "status": "ok",
            "disabled": true,
            "protocol": "chat_completions",
            "items": []
        })
    );
}

#[tokio::test]
async fn unknown_bridge_path_preserves_empty_session_id_shape() {
    let result = handle_bridge_request(
        test_context(),
        "/missing",
        json!({"session_id": "should-not-leak"}),
    )
    .await;

    assert_eq!(
        result,
        json!({
            "status": "failed",
            "session_id": "",
            "message": "Unknown bridge path"
        })
    );
}

#[tokio::test]
async fn settings_routes_use_settings_service() {
    let ctx = test_context();

    let updated = handle_bridge_request(
        ctx.clone(),
        "/settings/set",
        json!({"providerSyncEnabled": true, "codexAppSessionDelete": false, "codexAppNativeFastUnlock": true, "codexAppPetRealMouseLook": true, "codexAppActivityOverlayRight": true}),
    )
    .await;
    let loaded = handle_bridge_request(ctx, "/settings/get", json!({})).await;

    assert_eq!(updated["providerSyncEnabled"], true);
    assert_eq!(updated["codexAppSessionDelete"], false);
    assert_eq!(updated["codexAppNativeFastUnlock"], true);
    assert!(updated.get("codexAppServiceTierControls").is_none());
    assert_eq!(updated["codexAppPetRealMouseLook"], true);
    assert_eq!(updated["codexAppActivityOverlayRight"], true);
    assert_eq!(loaded, updated);
}

#[tokio::test]
async fn runtime_status_devtools_repair_and_ads_routes_are_dispatched() {
    let runtime = Arc::new(FakeRuntime::default());
    let ctx = BridgeContext::new(
        Arc::new(FakeSettings::default()),
        runtime.clone(),
        Arc::new(FakeData::default()),
    );

    assert_eq!(
        handle_bridge_request(ctx.clone(), "/devtools/open", json!({})).await,
        json!({"status": "ok", "opened": true})
    );
    let manager_payload = json!({"page": "settings", "section": "stepwise"});
    assert_eq!(
        handle_bridge_request(ctx.clone(), "/manager/open", manager_payload.clone()).await,
        json!({"status": "ok", "opened": "manager"})
    );
    assert_eq!(*runtime.manager_payload.lock().unwrap(), manager_payload);

    let transient_payload = json!({"page": "settings"});
    assert_eq!(
        handle_bridge_request(
            ctx.clone(),
            "/manager/open-transient",
            transient_payload.clone(),
        )
        .await,
        json!({"status": "ok", "opened": "manager-transient"})
    );
    assert_eq!(*runtime.manager_payload.lock().unwrap(), transient_payload);
    assert_eq!(
        handle_bridge_request(ctx.clone(), "/backend/status", json!({})).await,
        json!({"status": "ok", "message": "后端已连接", "version": codex_plus_core::version::VERSION, "hideOfficialUsageAlert": false})
    );
}

#[tokio::test]
async fn backend_status_includes_active_official_usage_alert_setting() {
    let settings = BackendSettings {
        active_relay_id: "official".to_string(),
        relay_profiles: vec![codex_plus_core::settings::RelayProfile {
            id: "official".to_string(),
            relay_mode: codex_plus_core::settings::RelayMode::Official,
            official_mix_api_key: true,
            hide_official_usage_alert: false,
            ..Default::default()
        }],
        ..Default::default()
    };
    let ctx = BridgeContext::new(
        Arc::new(FakeSettings::with_settings(settings)),
        Arc::new(FakeRuntime::default()),
        Arc::new(FakeData::default()),
    );

    let result = handle_bridge_request(ctx, "/backend/status", json!({})).await;

    assert_eq!(result["hideOfficialUsageAlert"], true);
}

#[tokio::test]
async fn data_routes_forward_payloads_to_data_service() {
    let ctx = test_context();

    assert_eq!(
        handle_bridge_request(
            ctx.clone(),
            "/delete",
            json!({"session_id": "s1", "title": "First", "host_id": "local"}),
        )
        .await["undo_token"],
        "undo-s1"
    );
    assert_eq!(
        handle_bridge_request(ctx.clone(), "/undo", json!({"undo_token": "undo-s1"})).await,
        json!({
            "status": "undone",
            "session_id": "s1",
            "message": "undone",
            "undo_token": "undo-s1",
            "backup_path": null
        })
    );
    assert_eq!(
        handle_bridge_request(
            ctx.clone(),
            "/export-markdown",
            json!({"session_id": "s1", "title": "First"}),
        )
        .await["filename"],
        "First.md"
    );
    assert_eq!(
        handle_bridge_request(
            ctx.clone(),
            "/thread-usage-history",
            json!({"session_id": "s1", "title": "First"}),
        )
        .await,
        json!({
            "status": "ok",
            "session_id": "s1",
            "history": [
                {
                    "source": "rollout-history",
                    "conversation_id": "local:s1",
                    "turn_id": "turn-1",
                    "observed_at": "2026-06-02T05:00:00Z",
                    "usage": {
                        "inputTokens": 1200,
                        "outputTokens": 120,
                        "totalTokens": 1320,
                        "cachedTokens": 900,
                        "cacheReadTokens": 0,
                        "cacheCreationTokens": 0,
                        "contextUsed": 1320,
                        "contextLimit": 258400,
                        "hasBreakdown": true
                    }
                }
            ]
        })
    );
    assert_eq!(
        handle_bridge_request(
            ctx.clone(),
            "/archived-thread",
            json!({"title": "Archived"})
        )
        .await,
        json!({"session_id": "archived-1", "title": "Archived"})
    );
}

#[tokio::test]
async fn bridge_context_core_with_data_uses_injected_data_service() {
    let ctx = BridgeContext::core_with_data(
        Arc::new(CoreRuntimeService::new(9229, StatusStore::default())),
        Arc::new(FakeData::default()),
    );

    let result = handle_bridge_request(
        ctx,
        "/delete",
        json!({"session_id": "s1", "title": "First", "host_id": "local"}),
    )
    .await;

    assert_eq!(result["status"], "local_deleted");
    assert_eq!(result["undo_token"], "undo-s1");
    assert_ne!(
        result["message"],
        "Delete service is not wired in core launcher hooks"
    );
}

#[tokio::test]
async fn delete_refuses_remote_and_unknown_hosts_instead_of_local_fallback() {
    let ctx = test_context();
    for host in [
        json!(null),
        json!(""),
        json!("remote-ssh:fixture"),
        json!({"id":"local"}),
    ] {
        let result = handle_bridge_request(
            ctx.clone(),
            "/delete",
            json!({
                "session_id": "s1", "title": "Same ID on another host", "host_id": host,
            }),
        )
        .await;
        // FakeData 必定返回 local_deleted/undo-s1，失败说明没有进入本地服务。
        assert_eq!(result["status"], "failed");
        assert!(result.get("undo_token").is_none());
    }
    let conflict = handle_bridge_request(
        ctx.clone(),
        "/delete",
        json!({
            "session_id":"s1", "host_id":"local", "hostId":"remote-ssh:fixture",
        }),
    )
    .await;
    assert_eq!(conflict["status"], "failed");
    assert!(conflict.get("undo_token").is_none());
    let local = handle_bridge_request(
        ctx,
        "/delete",
        json!({
            "session_id":"s1", "title":"Local", "hostId":"local",
        }),
    )
    .await;
    assert_eq!(local["status"], "local_deleted");
    assert_eq!(local["undo_token"], "undo-s1");
}

#[tokio::test]
async fn core_runtime_open_devtools_uses_inspector_url_opener() {
    let opened = Arc::new(Mutex::new(Vec::<String>::new()));
    let runtime = CoreRuntimeService::new(9229, StatusStore::default())
        .with_devtools_opener({
            let opened = opened.clone();
            Arc::new(move |url| {
                opened.lock().unwrap().push(url.to_string());
                Ok(())
            })
        })
        .with_devtools_target_id("page-1");
    let ctx = BridgeContext::core_with_data(Arc::new(runtime), Arc::new(FakeData::default()));

    let result = handle_bridge_request(ctx, "/devtools/open", json!({})).await;

    assert_eq!(result["status"], "ok");
    assert_eq!(result["target_id"], "page-1");
    assert_eq!(
        opened.lock().unwrap().as_slice(),
        ["http://127.0.0.1:9229/devtools/inspector.html?ws=127.0.0.1:9229/devtools/page/page-1"]
    );
}

#[tokio::test]
async fn core_runtime_manager_route_attempts_to_open_manager_binary() {
    let ctx = BridgeContext::core(Arc::new(CoreRuntimeService::new(
        9229,
        StatusStore::default(),
    )));

    let result = handle_bridge_request(ctx, "/manager/open", json!({})).await;

    assert_ne!(result["message"], "管理工具启动未接入当前运行时");
}

#[tokio::test]
async fn bridge_backend_status_writes_diagnostic_log() {
    let temp = tempfile::tempdir().unwrap();
    let log_path = temp.path().join("codex-plus.log");
    codex_plus_core::diagnostic_log::set_diagnostic_log_path_for_tests(Some(log_path.clone()));
    let ctx = BridgeContext::core(Arc::new(CoreRuntimeService::new(
        9229,
        StatusStore::default(),
    )));

    let result = handle_bridge_request(ctx, "/backend/status", json!({})).await;

    assert_eq!(result["status"], "ok");
    let contents = std::fs::read_to_string(&log_path).unwrap();
    assert!(contents.contains("bridge.request"));
    assert!(contents.contains("bridge.backend_status_ok"));
    assert!(contents.contains("/backend/status"));
    codex_plus_core::diagnostic_log::set_diagnostic_log_path_for_tests(None);
}

#[tokio::test]
async fn launch_lifecycle_uses_hook_supplied_bridge_context_for_injection() {
    let temp = tempfile::tempdir().unwrap();
    let app_dir = temp.path().join("Codex.app");
    std::fs::create_dir_all(&app_dir).unwrap();
    let events = Arc::new(Mutex::new(Vec::<String>::new()));
    let hooks = ContextHooks {
        events: events.clone(),
    };

    launch_and_inject_with_hooks(
        LaunchOptions {
            app_dir: Some(app_dir),
            debug_port: 9229,
            helper_port: 57321,
            status_store: StatusStore::new(temp.path().join("latest-status.json")),
            ..Default::default()
        },
        &hooks,
    )
    .await
    .unwrap();

    assert_eq!(
        *events.lock().unwrap(),
        vec![
            "bridge-context:9229",
            "inject-bridge:9229:57321",
            "watchdog:9229:57321",
            "status:running",
        ]
    );
}

fn test_context() -> BridgeContext {
    BridgeContext::new(
        Arc::new(FakeSettings::default()),
        Arc::new(FakeRuntime::default()),
        Arc::new(FakeData::default()),
    )
}

struct FakeSettings {
    settings: Mutex<BackendSettings>,
    codex_app_version: Mutex<String>,
    whale_ledger_dir: tempfile::TempDir,
}

impl Default for FakeSettings {
    fn default() -> Self {
        Self {
            settings: Mutex::new(BackendSettings::default()),
            codex_app_version: Mutex::new(String::new()),
            whale_ledger_dir: tempfile::TempDir::new().unwrap(),
        }
    }
}

impl FakeSettings {
    fn with_settings(settings: BackendSettings) -> Self {
        Self {
            settings: Mutex::new(settings),
            codex_app_version: Mutex::new(String::new()),
            whale_ledger_dir: tempfile::TempDir::new().unwrap(),
        }
    }

    fn with_codex_app_version(version: &str) -> Self {
        Self {
            settings: Mutex::new(BackendSettings::default()),
            codex_app_version: Mutex::new(version.to_string()),
            whale_ledger_dir: tempfile::TempDir::new().unwrap(),
        }
    }
}

#[async_trait]
impl BridgeSettingsService for FakeSettings {
    fn whale_ledger_path(&self) -> std::path::PathBuf {
        self.whale_ledger_dir.path().join("whale.sqlite3")
    }
    async fn get_settings(&self) -> anyhow::Result<BackendSettings> {
        Ok(self.settings.lock().unwrap().clone())
    }

    async fn set_settings(&self, payload: Value) -> anyhow::Result<BackendSettings> {
        let current = self.settings.lock().unwrap().clone();
        let mut raw = serde_json::to_value(current).unwrap();
        let raw = raw.as_object_mut().unwrap();
        if let Some(value) = payload.get("providerSyncEnabled").and_then(Value::as_bool) {
            raw.insert("providerSyncEnabled".to_string(), json!(value));
        }
        if let Some(value) = payload.get("enhancementsEnabled").and_then(Value::as_bool) {
            raw.insert("enhancementsEnabled".to_string(), json!(value));
        }
        for key in [
            "codexAppPluginMarketplaceUnlock",
            "codexAppModelWhitelistUnlock",
            "codexAppSessionDelete",
            "codexAppMarkdownExport",
            "codexAppThreadIdBadge",
            "codexAppConversationView",
            "codexAppThreadScrollRestore",
            "codexAppNativeMenuPlacement",
            "codexAppNativeFastUnlock",
            "codexAppPetRealMouseLook",
            "codexAppActivityOverlayRight",
            "codexAppWhaleWidgetEnabled",
        ] {
            if let Some(value) = payload.get(key).and_then(Value::as_bool) {
                raw.insert(key.to_string(), json!(value));
            }
        }
        if let Some(value) = payload.get("relayBaseUrl").and_then(Value::as_str) {
            raw.insert("relayBaseUrl".to_string(), json!(value));
        }
        if let Some(value) = payload.get("relayApiKey").and_then(Value::as_str) {
            raw.insert("relayApiKey".to_string(), json!(value));
        }
        let updated: BackendSettings = serde_json::from_value(Value::Object(raw.clone())).unwrap();
        *self.settings.lock().unwrap() = updated.clone();
        Ok(updated)
    }

    async fn codex_app_version(&self) -> anyhow::Result<String> {
        Ok(self.codex_app_version.lock().unwrap().clone())
    }
}

struct FakeRuntime {

    manager_payload: Mutex<Value>,
}

impl Default for FakeRuntime {
    fn default() -> Self {
        Self {

            manager_payload: Mutex::new(json!({})),
        }
    }
}

#[async_trait]
impl BridgeRuntimeService for FakeRuntime {

    async fn open_devtools(&self) -> anyhow::Result<Value> {
        Ok(json!({"status": "ok", "opened": true}))
    }

    async fn open_manager(&self, payload: Value) -> anyhow::Result<Value> {
        *self.manager_payload.lock().unwrap() = payload;
        Ok(json!({"status": "ok", "opened": "manager"}))
    }

    async fn open_transient_manager(&self, payload: Value) -> anyhow::Result<Value> {
        *self.manager_payload.lock().unwrap() = payload;
        Ok(json!({"status": "ok", "opened": "manager-transient"}))
    }

    async fn backend_status(&self) -> anyhow::Result<Value> {
        Ok(
            json!({"status": "ok", "message": "后端已连接", "version": codex_plus_core::version::VERSION}),
        )
    }

    async fn codex_model_catalog(&self) -> anyhow::Result<Value> {
        Ok(json!({
            "status": "ok",
            "model": "qwen3-coder",
            "default_model": "qwen3-coder",
            "model_provider": "relay",
            "provider_name": "Relay",
            "models": ["qwen3-coder"],
            "sources": []
        }))
    }

}

struct FakeData;

impl Default for FakeData {
    fn default() -> Self {
        Self
    }
}

#[async_trait]
impl BridgeDataService for FakeData {
    async fn whale_history(&self, _payload: Value) -> anyhow::Result<Value> {
        Ok(json!({"status":"ok","complete":true,"models":[],"days":[],"records":[]}))
    }
    async fn whale_session(&self, session: SessionRef) -> anyhow::Result<Value> {
        Ok(json!({"status": "ok", "sessionId": session.session_id}))
    }

    async fn delete(&self, session: SessionRef) -> anyhow::Result<DeleteResult> {
        Ok(DeleteResult {
            status: DeleteStatus::LocalDeleted,
            session_id: session.session_id.clone(),
            message: format!("deleted {}", session.title),
            undo_token: Some(format!("undo-{}", session.session_id)),
            backup_path: None,
        })
    }

    async fn undo(&self, undo_token: String) -> anyhow::Result<DeleteResult> {
        Ok(DeleteResult {
            status: DeleteStatus::Undone,
            session_id: "s1".to_string(),
            message: "undone".to_string(),
            undo_token: Some(undo_token),
            backup_path: None,
        })
    }

    async fn export_markdown(&self, session: SessionRef) -> anyhow::Result<ExportResult> {
        Ok(ExportResult {
            status: ExportStatus::Exported,
            session_id: session.session_id,
            message: "exported".to_string(),
            filename: Some("First.md".to_string()),
            markdown: Some("# First\n".to_string()),
        })
    }

    async fn thread_usage_live(&self, session: SessionRef) -> anyhow::Result<Value> {
        Ok(json!({
            "status": "ok",
            "session_id": session.session_id,
            "events": [
                {
                    "t": "2026-06-02T05:00:00Z",
                    "input_tokens": 1200,
                    "cached_input_tokens": 900,
                    "output_tokens": 120,
                    "reasoning_output_tokens": 40,
                    "total_tokens": 1320,
                    "context_window": 258400,
                    "turn_output_tokens": 120
                }
            ]
        }))
    }

    async fn thread_usage_history(&self, session: SessionRef) -> anyhow::Result<Value> {
        Ok(json!({
            "status": "ok",
            "session_id": session.session_id,
            "history": [
                {
                    "source": "rollout-history",
                    "conversation_id": "local:s1",
                    "turn_id": "turn-1",
                    "observed_at": "2026-06-02T05:00:00Z",
                    "usage": {
                        "inputTokens": 1200,
                        "outputTokens": 120,
                        "totalTokens": 1320,
                        "cachedTokens": 900,
                        "cacheReadTokens": 0,
                        "cacheCreationTokens": 0,
                        "contextUsed": 1320,
                        "contextLimit": 258400,
                        "hasBreakdown": true
                    }
                }
            ]
        }))
    }

    async fn find_archived_thread_by_title(
        &self,
        title: String,
    ) -> anyhow::Result<Option<SessionRef>> {
        Ok(Some(SessionRef {
            session_id: "archived-1".to_string(),
            title,
            host_id: None,
        }))
    }
}

#[derive(Clone)]
struct ContextHooks {
    events: Arc<Mutex<Vec<String>>>,
}

impl ContextHooks {
    fn event(&self, event: impl Into<String>) {
        self.events.lock().unwrap().push(event.into());
    }
}

#[async_trait(?Send)]
impl LaunchHooks for ContextHooks {
    fn resolve_app_dir(
        &self,
        app_dir: Option<&std::path::Path>,
        _settings: &BackendSettings,
    ) -> anyhow::Result<std::path::PathBuf> {
        app_dir
            .map(std::path::Path::to_path_buf)
            .ok_or_else(|| anyhow::anyhow!("missing app dir"))
    }

    fn select_debug_port(&self, requested: u16) -> u16 {
        requested
    }

    fn select_helper_port(&self, requested: u16) -> u16 {
        requested
    }

    async fn load_settings(&self) -> anyhow::Result<BackendSettings> {
        Ok(BackendSettings::default())
    }

    async fn run_provider_sync(&self) -> anyhow::Result<()> {
        Ok(())
    }

    async fn run_remote_control_session_recovery(&self) -> anyhow::Result<()> {
        Ok(())
    }

    async fn start_helper(&self, _helper_port: u16) -> anyhow::Result<()> {
        Ok(())
    }

    async fn launch_codex(
        &self,
        _app_dir: &std::path::Path,
        _debug_port: u16,
        _settings: &BackendSettings,
        _extra_args: &[String],
    ) -> anyhow::Result<CodexLaunch> {
        Ok(CodexLaunch::Process {
            command: vec!["codex".to_string()],
            wait_strategy: ProcessWaitStrategy::TrackedChild,
            macos_cleanup_policy: None,
        })
    }

    async fn bridge_context(
        &self,
        debug_port: u16,
        _app_dir: &std::path::Path,
    ) -> anyhow::Result<Option<BridgeContext>> {
        self.event(format!("bridge-context:{debug_port}"));
        Ok(Some(test_context()))
    }

    async fn inject(&self, _debug_port: u16, _helper_port: u16) -> anyhow::Result<()> {
        anyhow::bail!("legacy inject should not run when bridge context is supplied")
    }

    async fn inject_bridge(
        &self,
        debug_port: u16,
        helper_port: u16,
        _ctx: BridgeContext,
    ) -> anyhow::Result<()> {
        self.event(format!("inject-bridge:{debug_port}:{helper_port}"));
        Ok(())
    }

    async fn start_bridge_watchdog(&self, debug_port: u16, helper_port: u16) -> anyhow::Result<()> {
        self.event(format!("watchdog:{debug_port}:{helper_port}"));
        Ok(())
    }

    async fn write_status(&self, status: &str) {
        self.event(format!("status:{status}"));
    }

    async fn wait_for_codex_exit(
        &self,
        _launch: &CodexLaunch,
        _debug_port: u16,
    ) -> anyhow::Result<()> {
        Ok(())
    }

    async fn shutdown_helper(&self, _helper_port: u16) {}

    async fn terminate_codex(&self, _launch: &CodexLaunch) {}
}

#[tokio::test]
async fn retired_remote_routes_are_unavailable() {
    let ctx = test_context();
    for path in [
        "/zed-remote/status",
        "/zed-remote/resolve-host",
        "/zed-remote/fallback-request",
        "/zed-remote/open",
        "/zed-remote/projects",
        "/zed-remote/remember-project",
        "/zed-remote/forget-project",
        "/upstream-worktree/status",
        "/upstream-worktree/defaults",
        "/upstream-worktree/prepare",
        "/upstream-worktree/create",
    ] {
        let result = handle_bridge_request(ctx.clone(), path, json!({})).await;
        assert_eq!(result["status"], "failed", "{path}");
        assert!(
            result["message"]
                .as_str()
                .unwrap()
                .contains("Unknown bridge path"),
            "{path}: {result}"
        );
    }
}
