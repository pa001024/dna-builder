use boa_engine::{
    Context, Finalize, JsData, JsNativeError, JsObject, JsResult, JsValue, Trace,
    class::{Class, ClassBuilder},
    js_string,
    native_function::NativeFunction,
};
use opencv::core::MatTraitConst;

// 定义一个包装Mat的结构体
#[derive(Debug, Trace, Finalize, JsData)]
pub struct JsMat {
    #[unsafe_ignore_trace]
    pub(crate) inner: Box<opencv::core::Mat>,
}
impl Class for JsMat {
    // 绑定到 JS 中的类名
    const NAME: &'static str = "Mat";
    // 绑定的长度 (构造函数参数个数)
    const LENGTH: usize = 0;

    // 初始化/构造函数 (new Mat())
    fn init(class: &mut ClassBuilder<'_>) -> JsResult<()> {
        class.method(
            js_string!("rows"),
            0,
            NativeFunction::from_fn_ptr(|this, _args, _ctx| {
                // 获取 Rust 对象引用
                let binding = this.as_object().unwrap();
                let js_mat = binding
                    .downcast_ref::<JsMat>()
                    .ok_or_else(|| JsNativeError::typ().with_message("Object is not a Mat"))?;

                // 调用第三方库的方法
                let rows = js_mat.inner.rows();

                // 返回给 JS
                Ok(JsValue::from(rows))
            }),
        );
        class.method(
            js_string!("cols"),
            0,
            NativeFunction::from_fn_ptr(|this, _args, _ctx| {
                // 获取 Rust 对象引用
                let binding = this.as_object().unwrap();
                let js_mat = binding
                    .downcast_ref::<JsMat>()
                    .ok_or_else(|| JsNativeError::typ().with_message("Object is not a Mat"))?;

                // 调用第三方库的方法
                let cols = js_mat.inner.cols();

                // 返回给 JS
                Ok(JsValue::from(cols))
            }),
        );
        Ok(())
    }
    fn data_constructor(
        _new_target: &JsValue,
        _args: &[JsValue],
        _context: &mut Context,
    ) -> JsResult<Self> {
        let mat = opencv::core::Mat::default();
        Ok(JsMat {
            inner: Box::new(mat),
        })
    }
}

pub trait IntoJs {
    fn into_js(self, context: &mut Context) -> JsResult<JsValue>;
}

// 为 OpenCV 的 Mat 实现这个 Trait
impl IntoJs for Box<opencv::core::Mat> {
    fn into_js(self, context: &mut Context) -> JsResult<JsValue> {
        // 1. 获取 JsMat 类在 Context 中的原型
        let prototype = context
            .get_global_class::<JsMat>()
            .ok_or_else(|| JsNativeError::typ().with_message("JsMat class not registered"))?
            .prototype();

        // 2. 包装数据
        let data = JsMat {
            inner: self, // 这里假设你的 JsMat 使用 Box<Mat>
        };

        // 3. 组合原型和数据，生成 JS 对象
        let obj = JsObject::from_proto_and_data(prototype, data);

        Ok(obj.into())
    }
}
