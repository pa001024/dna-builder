use boa_engine::{
    Context, Finalize, JsData, JsNativeError, JsResult, JsValue, Trace,
    class::{Class, ClassBuilder},
    job::NativeAsyncJob,
    js_string,
    native_function::NativeFunction,
    object::builtins::JsPromise,
};
use std::sync::{Arc, Mutex};
use tokio::time::Instant;

/// 定义一个包装Timer的结构体
#[derive(Debug, Trace, Finalize, JsData)]
pub struct JsTimer {
    #[unsafe_ignore_trace]
    pub(crate) start_time: Arc<Mutex<Instant>>,
}

impl Class for JsTimer {
    /// 绑定到 JS 中的类名
    const NAME: &'static str = "Timer";
    /// 绑定的长度 (构造函数参数个数)
    const LENGTH: usize = 0;

    /// 初始化/构造函数 (new Timer())
    fn init(class: &mut ClassBuilder<'_>) -> JsResult<()> {
        class.method(
            js_string!("reset"),
            0,
            NativeFunction::from_fn_ptr(|this, _args, _ctx| {
                // 获取 Rust 对象引用
                let binding = this.as_object().unwrap();
                let js_timer = binding
                    .downcast_ref::<JsTimer>()
                    .ok_or_else(|| JsNativeError::typ().with_message("Object is not a Timer"))?;

                // 重置定时器
                *js_timer.start_time.lock().unwrap() = Instant::now();
                Ok(JsValue::undefined())
            }),
        );
        class.method(
            js_string!("elapsed"),
            0,
            NativeFunction::from_fn_ptr(|this, _args, _ctx| {
                // 获取 Rust 对象引用
                let binding = this.as_object().unwrap();
                let js_timer = binding
                    .downcast_ref::<JsTimer>()
                    .ok_or_else(|| JsNativeError::typ().with_message("Object is not a Timer"))?;
                Ok(JsValue::new(
                    js_timer.start_time.lock().unwrap().elapsed().as_millis() as f64,
                ))
            }),
        );
        class.method(
            js_string!("sleep"),
            1,
            NativeFunction::from_fn_ptr(|this, args, ctx| {
                // 获取 Rust 对象引用
                let binding = this.as_object().unwrap();
                let js_timer = binding
                    .downcast_ref::<JsTimer>()
                    .ok_or_else(|| JsNativeError::typ().with_message("Object is not a Timer"))?;

                // 获取延迟时间（毫秒）
                let duration_ms = args
                    .get(0)
                    .ok_or_else(|| {
                        JsNativeError::typ().with_message("Missing target time argument")
                    })?
                    .to_number(ctx)?;

                // 创建 Promise
                let (promise, resolvers) = JsPromise::new_pending(ctx);

                // 转换为 tokio::time::Instant
                let target_instant = *js_timer.start_time.lock().unwrap()
                    + tokio::time::Duration::from_millis(duration_ms as u64);
                *js_timer.start_time.lock().unwrap() = target_instant;

                // 将 resolvers 克隆到异步任务中
                let resolvers_clone = resolvers.clone();

                // 入队异步任务
                ctx.enqueue_job(
                    NativeAsyncJob::new(async move |context| {
                        // 使用 tokio::time::sleep_until 等待到指定时间
                        tokio::time::sleep_until(target_instant).await;

                        // 解析 Promise
                        let context = &mut context.borrow_mut();
                        resolvers_clone
                            .resolve
                            .call(&JsValue::undefined(), &[], context)
                    })
                    .into(),
                );

                Ok(promise.into())
            }),
        );
        class.method(
            js_string!("sleepUntil"),
            1,
            NativeFunction::from_fn_ptr(|this, args, ctx| {
                // 获取 Rust 对象引用
                let binding = this.as_object().unwrap();
                let js_timer = binding
                    .downcast_ref::<JsTimer>()
                    .ok_or_else(|| JsNativeError::typ().with_message("Object is not a Timer"))?;

                // 获取目标时间戳（毫秒）
                let target_ms = args
                    .get(0)
                    .ok_or_else(|| {
                        JsNativeError::typ().with_message("Missing target time argument")
                    })?
                    .to_number(ctx)?;

                // 创建 Promise
                let (promise, resolvers) = JsPromise::new_pending(ctx);

                // 转换为 tokio::time::Instant
                let target_instant = *js_timer.start_time.lock().unwrap()
                    + tokio::time::Duration::from_millis(target_ms as u64);

                // 将 resolvers 克隆到异步任务中
                let resolvers_clone = resolvers.clone();

                // 入队异步任务
                ctx.enqueue_job(
                    NativeAsyncJob::new(async move |context| {
                        // 使用 tokio::time::sleep_until 等待到指定时间
                        tokio::time::sleep_until(target_instant).await;

                        // 解析 Promise
                        let context = &mut context.borrow_mut();
                        resolvers_clone
                            .resolve
                            .call(&JsValue::undefined(), &[], context)
                    })
                    .into(),
                );

                Ok(promise.into())
            }),
        );
        Ok(())
    }

    fn data_constructor(
        _new_target: &JsValue,
        _args: &[JsValue],
        _context: &mut Context,
    ) -> JsResult<Self> {
        Ok(JsTimer {
            start_time: Arc::new(Mutex::new(Instant::now())),
        })
    }
}
