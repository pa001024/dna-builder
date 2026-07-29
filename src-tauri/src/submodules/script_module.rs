use boa_engine::module::{ModuleLoader, Referrer, resolve_module_specifier};
use boa_engine::{Context, JsNativeError, JsResult, JsString, Module, Source};
use std::cell::RefCell;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::rc::Rc;

/// 脚本引擎 ESM 加载器，负责内存模块与本地文件模块。
#[derive(Default)]
pub struct ScriptModuleLoader {
    cap_module: RefCell<Option<Module>>,
    file_modules: RefCell<HashMap<PathBuf, Module>>,
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
}

impl ModuleLoader for ScriptModuleLoader {
    /// 加载 ESM 依赖；cap 使用内存源码，其余标识符解析为本地文件。
    async fn load_imported_module(
        self: Rc<Self>,
        referrer: Referrer,
        specifier: JsString,
        context: &RefCell<&mut Context>,
    ) -> JsResult<Module> {
        if specifier == JsString::from("cap") {
            return self.load_cap_module(&mut context.borrow_mut());
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
        Context::builder()
            .module_loader(Rc::new(ScriptModuleLoader::default()))
            .build()
            .expect("创建 ESM 测试上下文失败")
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
