use boa_engine::module::{ModuleLoader, Referrer, resolve_module_specifier};
use boa_engine::{Context, JsNativeError, JsResult, JsString, Module, Source};
use reqwest::Url;
use std::cell::RefCell;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::rc::Rc;
use std::time::Duration;

/// 判断字符串是否为 HTTP(S) 地址。
pub(crate) fn is_http_url(value: &str) -> bool {
    let bytes = value.trim().as_bytes();
    bytes
        .get(..7)
        .is_some_and(|prefix| prefix.eq_ignore_ascii_case(b"http://"))
        || bytes
            .get(..8)
            .is_some_and(|prefix| prefix.eq_ignore_ascii_case(b"https://"))
}

/// 解析远程模块地址：绝对 HTTP 地址直接使用，相对标识符基于引用模块的地址拼接。
///
/// 返回 `Ok(None)` 表示没有远程上下文，交由本地路径解析；返回 `Err` 表示地址非法。
fn resolve_remote_module_url(
    referrer_url: Option<&str>,
    specifier: &str,
) -> Result<Option<String>, String> {
    let specifier = specifier.trim();
    if is_http_url(specifier) {
        let url = Url::parse(specifier)
            .map_err(|e| format!("远程模块地址无效: {specifier}，错误: {e}"))?;
        return Ok(Some(url.to_string()));
    }

    let Some(referrer_url) = referrer_url else {
        return Ok(None);
    };
    let base = Url::parse(referrer_url)
        .map_err(|e| format!("引用模块地址无效: {referrer_url}，错误: {e}"))?;
    let url = base
        .join(specifier)
        .map_err(|e| format!("解析远程模块地址失败: {specifier}，错误: {e}"))?;
    Ok(is_http_url(url.as_str()).then(|| url.to_string()))
}

/// 下载远程脚本源码，返回跟随重定向后的最终地址与源码字节。
pub(crate) async fn fetch_remote_script_source(url: &str) -> Result<(String, Vec<u8>), String> {
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(30))
        .user_agent(concat!("dob-script/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| format!("初始化 HTTP 客户端失败: {e}"))?;
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("请求远程脚本失败: {url}，错误: {e}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "请求远程脚本失败: {url}，HTTP 状态码: {}",
            response.status()
        ));
    }
    let final_url = response.url().to_string();
    let source = response
        .bytes()
        .await
        .map_err(|e| format!("读取远程脚本内容失败: {url}，错误: {e}"))?;
    Ok((final_url, source.to_vec()))
}

/// 脚本引擎 ESM 加载器，负责内存模块、本地文件模块与远程模块。
#[derive(Default)]
pub struct ScriptModuleLoader {
    cap_module: RefCell<Option<Module>>,
    file_modules: RefCell<HashMap<PathBuf, Module>>,
    remote_modules: RefCell<HashMap<String, Module>>,
}

impl ScriptModuleLoader {
    /// 从内存源码解析并缓存 cap 内置模块。
    fn load_cap_module(&self, context: &mut Context) -> JsResult<Module> {
        if let Some(module) = self.cap_module.borrow().clone() {
            return Ok(module);
        }

        let source = Source::from_bytes(include_str!("script_cap.js")).with_path(Path::new("cap"));
        let module = Module::parse(source, None, context).map_err(|error| {
            JsNativeError::syntax()
                .with_message(format!("could not parse built-in module `cap`: {error}"))
                .with_cause(error)
        })?;
        *self.cap_module.borrow_mut() = Some(module.clone());
        Ok(module)
    }

    /// 从本地文件解析并缓存 ESM 模块。
    fn load_file_module(&self, path: PathBuf, context: &mut Context) -> JsResult<Module> {
        if let Some(module) = self.file_modules.borrow().get(&path).cloned() {
            return Ok(module);
        }

        let source = Source::from_filepath(&path).map_err(|error| {
            JsNativeError::typ().with_message(format!(
                "could not open module `{}`: {error}",
                path.display()
            ))
        })?;
        let module = Module::parse(source, None, context).map_err(|error| {
            JsNativeError::syntax()
                .with_message(format!("could not parse module `{}`", path.display()))
                .with_cause(error)
        })?;
        self.file_modules.borrow_mut().insert(path, module.clone());
        Ok(module)
    }

    /// 下载并解析远程 ESM 模块，按最终地址缓存。
    async fn load_remote_module(
        &self,
        url: String,
        context: &RefCell<&mut Context>,
    ) -> JsResult<Module> {
        if let Some(module) = self.remote_modules.borrow().get(&url).cloned() {
            return Ok(module);
        }

        let (final_url, source_bytes) = fetch_remote_script_source(&url)
            .await
            .map_err(|message| JsNativeError::typ().with_message(message))?;
        if let Some(module) = self.remote_modules.borrow().get(&final_url).cloned() {
            return Ok(module);
        }

        let source = Source::from_bytes(&source_bytes).with_path(Path::new(&final_url));
        let module = Module::parse(source, None, &mut context.borrow_mut()).map_err(|error| {
            JsNativeError::syntax()
                .with_message(format!("could not parse module `{final_url}`"))
                .with_cause(error)
        })?;
        self.remote_modules
            .borrow_mut()
            .insert(final_url, module.clone());
        Ok(module)
    }
}

impl ModuleLoader for ScriptModuleLoader {
    /// 加载 ESM 依赖；cap 使用内存源码，远程引用走 HTTP 下载，其余标识符解析为本地文件。
    async fn load_imported_module(
        self: Rc<Self>,
        referrer: Referrer,
        specifier: JsString,
        context: &RefCell<&mut Context>,
    ) -> JsResult<Module> {
        if specifier == JsString::from("cap") {
            return self.load_cap_module(&mut context.borrow_mut());
        }

        let specifier_text = specifier.to_std_string_escaped();
        let referrer_url = referrer
            .path()
            .and_then(Path::to_str)
            .filter(|path| is_http_url(path));
        match resolve_remote_module_url(referrer_url, &specifier_text) {
            Ok(Some(url)) => return self.load_remote_module(url, context).await,
            Ok(None) => {}
            Err(message) => return Err(JsNativeError::typ().with_message(message).into()),
        }

        let path =
            resolve_module_specifier(None, &specifier, referrer.path(), &mut context.borrow_mut())?;
        self.load_file_module(path, &mut context.borrow_mut())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use boa_engine::builtins::promise::PromiseState;
    use boa_engine::{JsValue, js_string};
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    /// 创建带脚本模块加载器的测试上下文。
    fn test_context() -> Context {
        let mut context = Context::builder()
            .module_loader(Rc::new(ScriptModuleLoader::default()))
            .build()
            .expect("创建 ESM 测试上下文失败");
        // DSL 播放（Cap.play）依赖全局 Timer 类，测试上下文需注册
        context
            .register_global_class::<crate::jstimer::JsTimer>()
            .expect("注册 JsTimer 失败");
        context
    }

    /// 完成模块的 load、link 与 evaluate 生命周期。
    fn evaluate_module(module: &Module, context: &mut Context) {
        let load_promise = module.load(context);
        context.run_jobs().expect("运行 ESM 任务失败");
        assert_eq!(
            load_promise.state(),
            PromiseState::Fulfilled(JsValue::undefined())
        );
        module.link(context).expect("链接 ESM 失败");
        let evaluate_promise = module.evaluate(context);
        context.run_jobs().expect("执行 ESM 任务失败");
        match evaluate_promise.state() {
            PromiseState::Fulfilled(value) => assert_eq!(value, JsValue::undefined()),
            PromiseState::Rejected(reason) => {
                let reason = reason
                    .to_string(context)
                    .expect("转换 ESM 拒绝原因失败")
                    .to_std_string_escaped();
                panic!("ESM 执行失败: {reason}");
            }
            PromiseState::Pending => panic!("ESM 执行结束后仍为 pending"),
        }
    }

    #[test]
    fn cap_is_loaded_from_memory_without_global_exports() {
        let mut context = test_context();
        let source = Source::from_bytes(
            r##"
            import { Cap, DslParser } from "cap";
            export const result = [
                typeof Cap,
                typeof DslParser,
                typeof globalThis.Cap,
                JSON.stringify(new DslParser("#1q").parse()),
            ].join("|");
            "##,
        );
        let module = Module::parse(source, None, &mut context).expect("解析 cap 导入测试失败");

        evaluate_module(&module, &mut context);
        let result = module
            .namespace(&mut context)
            .get(js_string!("result"), &mut context)
            .expect("读取 cap 导入测试结果失败")
            .to_string(&mut context)
            .expect("转换 cap 导入测试结果失败")
            .to_std_string_escaped();

        assert_eq!(
            result,
            r#"function|function|undefined|[{"type":"wait","ms":1000},{"type":"key","key":"q"}]"#
        );
    }

    #[test]
    fn cap_esm_export_preserves_constructor_and_stoppable_promise() {
        let mut context = test_context();
        let source = Source::from_bytes(
            r#"
            import { Cap } from "cap";
            globalThis.isElevated = () => true;
            globalThis.checkSize = (...args) => globalThis.sizeArgs = args;
            globalThis.captureWindowWGC = (...args) => {
                globalThis.captureArgs = args;
                return "frame";
            };
            globalThis.mc = (...args) => globalThis.mcArgs = args;
            const cap = new Cap(123);
            cap.mc(10, 20, "right");
            const task = cap.play("");
            task.stop();
            export const result = JSON.stringify({
                nativePromise: task instanceof Promise,
                stopMethod: typeof task.stop,
                sizeArgs: globalThis.sizeArgs,
                captureArgs: globalThis.captureArgs,
                mcArgs: globalThis.mcArgs,
            });
            "#,
        );
        let module = Module::parse(source, None, &mut context).expect("解析 Cap ESM 行为测试失败");

        evaluate_module(&module, &mut context);
        let result = module
            .namespace(&mut context)
            .get(js_string!("result"), &mut context)
            .expect("读取 Cap ESM 行为测试结果失败")
            .to_string(&mut context)
            .expect("转换 Cap ESM 行为测试结果失败")
            .to_std_string_escaped();

        assert_eq!(
            result,
            r#"{"nativePromise":true,"stopMethod":"function","sizeArgs":[123,1600,930],"captureArgs":[123,0,30,1600,900],"mcArgs":[123,10,50,"right"]}"#
        );
    }

    #[test]
    fn http_url_detection_accepts_scheme_case_insensitively() {
        assert!(is_http_url("http://example.com/a.js"));
        assert!(is_http_url("HTTPS://example.com/a.js"));
        assert!(is_http_url("  https://example.com/a.js  "));
        assert!(!is_http_url("//example.com/a.js"));
        assert!(!is_http_url("./a.js"));
        assert!(!is_http_url("cap"));
    }

    #[test]
    fn remote_module_specifier_is_resolved_against_referrer_url() {
        let referrer_url = Some("https://example.com/scripts/main.js");
        assert_eq!(
            resolve_remote_module_url(referrer_url, "./dependency.js").expect("解析相对模块失败"),
            Some("https://example.com/scripts/dependency.js".to_string())
        );
        assert_eq!(
            resolve_remote_module_url(referrer_url, "../lib/util.js").expect("解析上级模块失败"),
            Some("https://example.com/lib/util.js".to_string())
        );
        assert_eq!(
            resolve_remote_module_url(referrer_url, "/shared.js").expect("解析根路径模块失败"),
            Some("https://example.com/shared.js".to_string())
        );
        assert_eq!(
            resolve_remote_module_url(referrer_url, "https://cdn.example.com/dep.js")
                .expect("解析绝对模块失败"),
            Some("https://cdn.example.com/dep.js".to_string())
        );
        assert_eq!(
            resolve_remote_module_url(None, "./dependency.js").expect("无远程上下文解析失败"),
            None
        );
    }

    #[test]
    fn local_file_module_is_loaded_relative_to_referrer() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("系统时间早于 UNIX_EPOCH")
            .as_nanos();
        let test_dir =
            std::env::temp_dir().join(format!("dna-builder-esm-{}-{unique}", std::process::id()));
        fs::create_dir_all(&test_dir).expect("创建 ESM 测试目录失败");
        fs::write(
            test_dir.join("dependency.js"),
            "export const localValue = 42;",
        )
        .expect("写入 ESM 测试依赖失败");

        let mut context = test_context();
        let main_path = test_dir.join("main.js");
        let source = Source::from_bytes(
            r#"
            import { localValue } from "./dependency.js";
            export const result = localValue;
            "#,
        )
        .with_path(&main_path);
        let module = Module::parse(source, None, &mut context).expect("解析本地 ESM 测试失败");

        evaluate_module(&module, &mut context);
        let result = module
            .namespace(&mut context)
            .get(js_string!("result"), &mut context)
            .expect("读取本地 ESM 测试结果失败");

        assert_eq!(result, JsValue::new(42));
        fs::remove_dir_all(test_dir).expect("清理 ESM 测试目录失败");
    }
}
