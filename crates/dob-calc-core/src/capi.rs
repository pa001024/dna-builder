//! C ABI（wasm/cdylib 用）。
//!
//! 全 `#[no_mangle] pub unsafe extern "C"`，`memory` 导出，空 imports 可实例化。
//! `dobcc_evaluate` 恒返回合法 JSON 信封 `{"ok":true,"result":{…}}` /
//! `{"ok":false,"error":"…"}`，调用方用 `dobcc_dealloc(ptr, out_len)` 释放。

use std::alloc::{Layout, alloc, dealloc};
use std::ptr;
use std::slice;

use crate::config::CharSettings;
use crate::evaluate::{BuildRequest, evaluate_build};
use crate::session::{self, BuildPayload};

fn byte_layout(size: usize) -> Option<Layout> {
    if size == 0 {
        return None;
    }
    Layout::from_size_align(size, 8).ok()
}

fn export_text(text: String, out_len: *mut usize) -> *mut u8 {
    let bytes = text.into_bytes();
    if !out_len.is_null() {
        unsafe {
            *out_len = bytes.len();
        }
    }
    let Some(layout) = byte_layout(bytes.len()) else {
        return ptr::null_mut();
    };
    let ptr = unsafe { alloc(layout) };
    if ptr.is_null() {
        return ptr::null_mut();
    }
    unsafe {
        ptr::copy_nonoverlapping(bytes.as_ptr(), ptr, bytes.len());
    }
    ptr
}

/// 从线性内存分配一段字节，返回指针。
///
/// # Safety
/// 返回指针在 `dobcc_dealloc` 前有效；长度必须与释放时一致。
#[unsafe(no_mangle)]
pub unsafe extern "C" fn dobcc_alloc(size: usize) -> *mut u8 {
    let Some(layout) = byte_layout(size) else {
        return ptr::null_mut();
    };
    unsafe { alloc(layout) }
}

/// 释放由 `dobcc_alloc` / `dobcc_evaluate` 返回的字节。
///
/// # Safety
/// ptr 必须是本模块的返回值且尚未被释放。
#[unsafe(no_mangle)]
pub unsafe extern "C" fn dobcc_dealloc(ptr: *mut u8, size: usize) {
    let Some(layout) = byte_layout(size) else {
        return;
    };
    if ptr.is_null() {
        return;
    }
    unsafe { dealloc(ptr, layout) }
}

/// 打开求值会话：把调用方注好的模块 JSON 建表，返回会话句柄；0 = 失败。
///
/// # Safety
/// `tables_ptr` 必须指向 `tables_len` 字节的可读线性内存（UTF-8 模块 JSON）。
#[unsafe(no_mangle)]
pub unsafe extern "C" fn dobcc_open_session(tables_ptr: *const u8, tables_len: usize) -> u64 {
    if tables_ptr.is_null() {
        return 0;
    }
    let bytes = unsafe { slice::from_raw_parts(tables_ptr, tables_len) };
    let text = match std::str::from_utf8(bytes) {
        Ok(text) => text,
        Err(_) => return 0,
    };
    match BuildPayload::from_json(text) {
        Ok(payload) => session::insert_payload(payload),
        Err(_) => 0,
    }
}

/// 在会话里求值一份构筑，恒返回合法 JSON 信封，长度写 `out_len`。
///
/// 请求 JSON：`{charId, settings, seed?, timeline?}`。
/// 信封：`{"ok":true,"result":{…}}` / `{"ok":false,"error":"…"}`。
///
/// # Safety
/// `req_ptr` 必须指向 `req_len` 字节的可读内存；`out_len` 必须可写。
/// 返回指针用 `dobcc_dealloc(ptr, out_len)` 释放。
#[unsafe(no_mangle)]
pub unsafe extern "C" fn dobcc_evaluate(
    session: u64,
    req_ptr: *const u8,
    req_len: usize,
    out_len: *mut usize,
) -> *mut u8 {
    export_text(evaluate_envelope(session, req_ptr, req_len), out_len)
}

fn error_envelope(message: impl std::fmt::Display) -> String {
    serde_json::json!({"ok": false, "error": message.to_string()}).to_string()
}

fn ok_envelope(result: serde_json::Value) -> String {
    serde_json::json!({"ok": true, "result": result}).to_string()
}

fn request_json(req_ptr: *const u8, req_len: usize) -> Result<serde_json::Value, String> {
    if req_ptr.is_null() {
        return Err("求值请求为空".to_string());
    }
    let bytes = unsafe { slice::from_raw_parts(req_ptr, req_len) };
    serde_json::from_slice(bytes).map_err(|error| format!("请求 JSON 非法：{error}"))
}

fn evaluate_envelope(session: u64, req_ptr: *const u8, req_len: usize) -> String {
    let raw = match request_json(req_ptr, req_len) {
        Ok(raw) => raw,
        Err(error) => return error_envelope(error),
    };
    // 请求形状 `{charId, settings}`：settings 缺失/类型不符时按 CharSettings 容错范式取默认。
    let Some(char_id) = raw.get("charId").and_then(crate::config::json_id) else {
        return error_envelope("构筑配置解析失败：缺少 charId");
    };
    let settings = raw
        .get("settings")
        .map(CharSettings::from_json)
        .unwrap_or_default();
    let request = BuildRequest {
        char_id,
        settings,
        seed: None,
        timeline: None,
    };
    match session::with_payload(session, |payload| evaluate_build(&payload.tables, &request)) {
        Ok(result) => ok_envelope(build_result_json(&result)),
        Err(error) => error_envelope(error),
    }
}

/// `BuildResult` → dob-app `evaluate.rs` 口径的结果 JSON。
fn build_result_json(result: &crate::evaluate::BuildResult) -> serde_json::Value {
    let attributes: serde_json::Map<String, serde_json::Value> = result
        .attributes
        .iter()
        .map(|(key, value)| (key.to_string(), serde_json::Value::from(*value)))
        .collect();
    let weapon: Option<serde_json::Map<String, serde_json::Value>> =
        result.weapon.as_ref().map(|panel| {
            panel
                .iter()
                .map(|(key, value)| (key.to_string(), serde_json::Value::from(*value)))
                .collect()
        });
    let damage = result.damage.map(|item| {
        serde_json::json!({
            "expectedDamage": item.expected_damage,
            "noHpDamage": item.no_hp_damage,
            "physicalDamage": item.physical_damage,
            "elementDamage": item.element_damage,
            "higherCritExpectedTrigger": item.higher_crit_expected_trigger,
            "lowerCritExpectedTrigger": item.lower_crit_expected_trigger,
        })
    });
    let buffs: Vec<serde_json::Value> = result
        .buffs
        .iter()
        .map(|buff| {
            serde_json::json!({
                "name": buff.name,
                "applicableSkill": buff.skill,
                "tags": buff.tags,
            })
        })
        .collect();
    serde_json::json!({
        "attributes": attributes,
        "weapon": weapon,
        "targetValue": result.target_value,
        "damage": damage,
        "targetFunction": result.target_function,
        "buffs": buffs,
        "error": result.error,
    })
}

/// 关闭会话并释放其表；重复关闭安全。
///
/// # Safety
/// `session` 为 `dobcc_*` 建表调用返回的会话句柄（`0` 表示空会话，直接返回）；
/// 本函数只做映射移除，不解引用任何裸指针，任意线程调用安全。
#[unsafe(no_mangle)]
pub unsafe extern "C" fn dobcc_close_session(session: u64) {
    session::remove_payload(session);
}

/// 打开计算会话：复用表会话的表建 `CalcSession`，返回计算句柄；0 = 失败。
///
/// 同构筑重复求值时复用装配与记忆化状态（对标 TS `CharBuild` 实例热复用），
/// 只差目标函数/自定义变量时约十微秒级，全同请求约一微秒级。
/// 句柄绑定创建线程（`BuildContext` 含 `Rc` 缓存）；跨线程使用返回无效句柄错误。
///
/// # Safety
/// `session` 为 `dobcc_open_session` 返回的表会话句柄；本函数不解引用裸指针。
#[unsafe(no_mangle)]
pub unsafe extern "C" fn dobcc_calc_open(session: u64) -> u64 {
    match session::with_payload(session, |payload| payload.tables.clone()) {
        Ok(tables) => session::insert_calc_session(&tables),
        Err(_) => 0,
    }
}

/// 在计算会话里求值一份构筑，恒返回合法 JSON 信封（同 `dobcc_evaluate` 约定）。
///
/// 请求 JSON：`{charId, settings, seed?, timeline?}`（含 `timeline` 时不缓存，透传全量）。
///
/// # Safety
/// `req_ptr` 必须指向 `req_len` 字节的可读内存；`out_len` 必须可写。
/// 返回指针用 `dobcc_dealloc(ptr, out_len)` 释放。
#[unsafe(no_mangle)]
pub unsafe extern "C" fn dobcc_calc_evaluate(
    calc: u64,
    req_ptr: *const u8,
    req_len: usize,
    out_len: *mut usize,
) -> *mut u8 {
    export_text(calc_evaluate_envelope(calc, req_ptr, req_len), out_len)
}

fn calc_evaluate_envelope(calc: u64, req_ptr: *const u8, req_len: usize) -> String {
    let raw = match request_json(req_ptr, req_len) {
        Ok(raw) => raw,
        Err(error) => return error_envelope(error),
    };
    let request = match BuildRequest::from_json(&raw) {
        Ok(request) => request,
        Err(error) => return error_envelope(error),
    };
    match session::with_calc_session(calc, |session| session.evaluate(&request)) {
        Ok(result) => ok_envelope(build_result_json(&result)),
        Err(error) => error_envelope(error),
    }
}

/// 关闭计算会话；重复关闭安全。
///
/// # Safety
/// `calc` 为 `dobcc_calc_open` 返回的计算句柄（`0` 直接返回）；
/// 只做映射移除，不解引用任何裸指针。
#[unsafe(no_mangle)]
pub unsafe extern "C" fn dobcc_calc_close(calc: u64) {
    session::remove_calc_session(calc);
}

/// 在会话里跑整轮自动配装，恒返回合法 JSON 信封（同 `dobcc_evaluate` 约定）。
///
/// 请求 JSON：`{base: BuildRequest, candidates, options, seed}`（见 spec §4.1）。
///
/// # Safety
/// `req_ptr` 必须指向 `req_len` 字节的可读内存；`out_len` 必须可写。
/// 返回指针用 `dobcc_dealloc(ptr, out_len)` 释放。
#[unsafe(no_mangle)]
pub unsafe extern "C" fn dobcc_autobuild(
    session: u64,
    req_ptr: *const u8,
    req_len: usize,
    out_len: *mut usize,
) -> *mut u8 {
    export_text(autobuild_envelope(session, req_ptr, req_len), out_len)
}

fn autobuild_envelope(session: u64, req_ptr: *const u8, req_len: usize) -> String {
    let payload = match session::with_payload(session, |payload| payload.tables.clone()) {
        Ok(tables) => tables,
        Err(error) => return error_envelope(error),
    };
    let raw = match request_json(req_ptr, req_len) {
        Ok(raw) => raw,
        Err(error) => return error_envelope(error),
    };
    let request = match crate::autobuild::AutobuildRequest::from_json(&raw) {
        Ok(request) => request,
        Err(error) => return error_envelope(error),
    };
    let result = crate::autobuild::autobuild(&payload, &request);
    let timeline = request.base.timeline.as_ref();
    let target_value = crate::timeline::calculate_with_settings(
        &payload,
        request.base.char_id,
        &result.settings,
        timeline,
    );
    ok_envelope(crate::autobuild::AutobuildRequest::result_json(
        &result,
        target_value,
    ))
}

/// # Safety
/// 与 `dobcc_autobuild` 同（`req_ptr` 可读 `req_len` 字节，`out_len` 可写，返回指针需释放）。
#[unsafe(no_mangle)]
pub unsafe extern "C" fn dobcc_income(
    session: u64,
    req_ptr: *const u8,
    req_len: usize,
    out_len: *mut usize,
) -> *mut u8 {
    export_text(income_envelope(session, req_ptr, req_len), out_len)
}

fn income_envelope(session: u64, req_ptr: *const u8, req_len: usize) -> String {
    let payload = match session::with_payload(session, |payload| payload.tables.clone()) {
        Ok(tables) => tables,
        Err(error) => return error_envelope(error),
    };
    let raw = match request_json(req_ptr, req_len) {
        Ok(raw) => raw,
        Err(error) => return error_envelope(error),
    };
    let base = match raw
        .get("base")
        .map(BuildRequest::from_json)
        .transpose()
    {
        Ok(base) => base,
        Err(error) => return error_envelope(error),
    };
    let Some(base) = base else {
        return error_envelope("缺少 base");
    };
    let skill_inherit = raw.get("skillInherit").and_then(|v| v.as_str());
    let items = raw
        .get("items")
        .and_then(serde_json::Value::as_array)
        .cloned()
        .unwrap_or_default();
    let base_value =
        crate::income::build_value(&payload, base.char_id, &base.settings, base.timeline.as_ref());
    let mut values = serde_json::Map::new();
    for item in &items {
        let key = item
            .get("key")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("")
            .to_string();
        let value = income_item_value(&payload, &base, skill_inherit, item, base_value);
        values.insert(key, serde_json::json!(value));
    }
    ok_envelope(serde_json::json!({"base": base_value, "values": values}))
}

fn income_item_value(
    payload: &crate::tables::BuildTables,
    base: &BuildRequest,
    skill_inherit: Option<&str>,
    item: &serde_json::Value,
    base_value: f64,
) -> f64 {
    let text = |key: &str| item.get(key).and_then(serde_json::Value::as_str).unwrap_or("");
    let num = |key: &str| item.get(key).and_then(serde_json::Value::as_f64);
    let kind = text("kind");
    let timeline = base.timeline.as_ref();
    match kind {
        "buff_add" => {
            let name = text("name");
            let level = num("level");
            let coverage = num("coverage").unwrap_or(1.0);
            let Some(raw) = payload.buffs.get(name).cloned() else {
                return 0.0;
            };
            let mut buff = crate::models::LeveledBuff::new(raw, level);
            buff.coverage = coverage;
            buff.update_properties();
            crate::income::calc_income_buff(
                payload,
                base.char_id,
                &base.settings,
                &buff,
                timeline,
                Some(base_value),
            )
        }
        "buff_remove" => {
            let name = text("name");
            crate::income::calc_equipped_buff_income(
                payload,
                base.char_id,
                &base.settings,
                name,
                timeline,
                Some(base_value),
            )
        }
        "mod_add" => {
            let id = item.get("id").and_then(crate::config::json_id).unwrap_or(0);
            let level = num("level");
            let buff_level = num("buffLevel");
            let Some(source) = payload.mods.get(&id) else {
                return 0.0;
            };
            let candidate = crate::models::LeveledMod::from_source(source, level, buff_level);
            crate::income::calc_income_mod(
                payload,
                base.char_id,
                &base.settings,
                &candidate,
                timeline,
                Some(base_value),
            )
        }
        "mod_replace" => {
            let id = item.get("id").and_then(crate::config::json_id).unwrap_or(0);
            let level = num("level");
            let buff_level = num("buffLevel");
            let index = num("index").unwrap_or(0.0) as usize;
            let key = item
                .get("slot")
                .and_then(crate::income::ModSlotKey::from_json_value)
                .unwrap_or(crate::income::ModSlotKey::Char);
            let Some(source) = payload.mods.get(&id) else {
                return 0.0;
            };
            let candidate = crate::models::LeveledMod::from_source(source, level, buff_level);
            crate::income::calc_replacement_mod_income(
                payload,
                base.char_id,
                &base.settings,
                skill_inherit,
                key,
                index,
                &candidate,
                timeline,
                Some(base_value),
            )
        }
        "mod_remove" => {
            let index = num("index").unwrap_or(0.0) as usize;
            let key = item
                .get("slot")
                .and_then(crate::income::ModSlotKey::from_json_value)
                .unwrap_or(crate::income::ModSlotKey::Char);
            crate::income::calc_equipped_mod_income(
                payload,
                base.char_id,
                &base.settings,
                skill_inherit,
                key,
                index,
                timeline,
                Some(base_value),
            )
        }
        "target" => {
            let settings = item
                .get("settings")
                .map(CharSettings::from_json)
                .unwrap_or_else(|| base.settings.clone());
            let char_id = item
                .get("charId")
                .and_then(crate::config::json_id)
                .unwrap_or(base.char_id);
            crate::income::build_value(payload, char_id, &settings, timeline)
        }
        _ => 0.0,
    }
}
