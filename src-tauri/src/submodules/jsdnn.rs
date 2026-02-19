use crate::submodules::jsmat::{IntoJs, JsMat};
use boa_engine::object::ObjectInitializer;
use boa_engine::object::builtins::JsArray;
use boa_engine::property::Attribute;
use boa_engine::{
    Context, Finalize, JsData, JsNativeError, JsObject, JsResult, JsValue, Trace,
    class::{Class, ClassBuilder},
    js_string,
    native_function::NativeFunction,
};
use opencv::{
    core::{CV_32F, Mat, Scalar, Size},
    dnn,
    prelude::{MatTraitConst, NetTrait, NetTraitConst, VectorToVec},
};
use std::cell::RefCell;

/// JS 侧 DNN 网络对象封装（包装 OpenCV `dnn::Net`）。
#[derive(Debug, Trace, Finalize, JsData)]
pub struct JsDnnNet {
    #[unsafe_ignore_trace]
    pub(crate) inner: RefCell<dnn::Net>,
}

/// 将 JS 值解析为 `Mat` 对象引用。
fn _expect_mat(value: Option<&JsValue>) -> JsResult<JsObject<JsMat>> {
    value
        .and_then(JsValue::as_object)
        .and_then(|obj| obj.downcast::<JsMat>().ok())
        .ok_or_else(|| JsNativeError::typ().with_message("Argument must be a Mat").into())
}

/// 解析可选字符串参数，`undefined/null` 返回默认值。
fn _parse_optional_string_arg(
    args: &[JsValue],
    index: usize,
    default_value: &str,
    ctx: &mut Context,
) -> JsResult<String> {
    let Some(value) = args.get(index) else {
        return Ok(default_value.to_string());
    };
    if value.is_undefined() || value.is_null() {
        return Ok(default_value.to_string());
    }
    value
        .to_string(ctx)
        .map(|s| s.to_std_string_lossy())
        .map_err(|_| JsNativeError::typ().with_message(format!("参数[{index}] 必须是字符串")).into())
}

/// 解析可选数字参数，`undefined/null` 返回默认值。
fn _parse_optional_number_arg(
    args: &[JsValue],
    index: usize,
    default_value: f64,
    ctx: &mut Context,
) -> JsResult<f64> {
    let Some(value) = args.get(index) else {
        return Ok(default_value);
    };
    if value.is_undefined() || value.is_null() {
        return Ok(default_value);
    }
    value
        .to_number(ctx)
        .map_err(|_| JsNativeError::typ().with_message(format!("参数[{index}] 必须是数字")).into())
}

/// 解析可选布尔参数，`undefined/null` 返回默认值。
fn _parse_optional_bool_arg(args: &[JsValue], index: usize, default_value: bool) -> bool {
    args.get(index)
        .filter(|v| !v.is_undefined() && !v.is_null())
        .is_some_and(JsValue::to_boolean)
        || (args
            .get(index)
            .is_none_or(|v| v.is_undefined() || v.is_null())
            && default_value)
}

/// 解析 JS 数组为 `Scalar`。
///
/// 支持长度：
/// - `3`: `[v0, v1, v2]`（v3 默认 0）
/// - `4`: `[v0, v1, v2, v3]`
fn _parse_scalar_array(value: &JsValue, ctx: &mut Context) -> JsResult<Scalar> {
    let Some(obj) = value.as_object() else {
        return Err(JsNativeError::typ()
            .with_message("mean 参数必须是 number[]")
            .into());
    };
    let array = JsArray::from_object(obj.clone())
        .map_err(|_| JsNativeError::typ().with_message("mean 参数必须是 number[]"))?;
    let len = array.length(ctx)? as usize;
    if len != 3 && len != 4 {
        return Err(JsNativeError::typ()
            .with_message("mean 参数长度必须为 3 或 4")
            .into());
    }

    let mut values = [0.0f64; 4];
    for (index, slot) in values.iter_mut().enumerate().take(len) {
        *slot = array
            .get(index as u32, ctx)?
            .to_number(ctx)
            .map_err(|_| JsNativeError::typ().with_message(format!("mean[{index}] 必须是数字")))?;
    }

    Ok(Scalar::new(values[0], values[1], values[2], values[3]))
}

/// 解析可选 `Scalar` 参数。
///
/// 支持：
/// - `undefined/null`: 默认 `Scalar::all(0.0)`
/// - `number`: 扩展为 `[n, n, n, n]`
/// - `number[]`: 解析为 `Scalar`
fn _parse_optional_scalar_arg(args: &[JsValue], index: usize, ctx: &mut Context) -> JsResult<Scalar> {
    let Some(value) = args.get(index) else {
        return Ok(Scalar::all(0.0));
    };
    if value.is_undefined() || value.is_null() {
        return Ok(Scalar::all(0.0));
    }

    if let Some(number) = value.as_number() {
        return Ok(Scalar::all(number));
    }
    _parse_scalar_array(value, ctx)
}

/// 解析可选 `[w, h]` 尺寸参数。
///
/// 约定：
/// - `undefined/null` 返回 `Size::new(0, 0)`（OpenCV 默认行为）；
/// - 必须是长度为 2 的数字数组。
fn _parse_optional_size_arg(args: &[JsValue], index: usize, ctx: &mut Context) -> JsResult<Size> {
    let Some(value) = args.get(index) else {
        return Ok(Size::new(0, 0));
    };
    if value.is_undefined() || value.is_null() {
        return Ok(Size::new(0, 0));
    }

    let obj = value
        .as_object()
        .ok_or_else(|| JsNativeError::typ().with_message("size 参数必须是 [w, h]"))?;
    let array = JsArray::from_object(obj.clone())
        .map_err(|_| JsNativeError::typ().with_message("size 参数必须是 [w, h]"))?;
    if array.length(ctx)? != 2 {
        return Err(JsNativeError::typ()
            .with_message("size 参数长度必须为 2，格式为 [w, h]")
            .into());
    }

    let width = array
        .get(0, ctx)?
        .to_number(ctx)
        .map_err(|_| JsNativeError::typ().with_message("size[0] 必须是数字"))?
        .round() as i32;
    let height = array
        .get(1, ctx)?
        .to_number(ctx)
        .map_err(|_| JsNativeError::typ().with_message("size[1] 必须是数字"))?
        .round() as i32;
    if width < 0 || height < 0 {
        return Err(JsNativeError::typ()
            .with_message("size 的宽高必须是非负整数")
            .into());
    }

    Ok(Size::new(width, height))
}

impl Class for JsDnnNet {
    /// 绑定到 JS 的类型名。
    const NAME: &'static str = "DnnNet";
    /// 构造函数参数个数（`new DnnNet()`）。
    const LENGTH: usize = 0;

    /// 注册 `DnnNet` 原型方法。
    fn init(class: &mut ClassBuilder<'_>) -> JsResult<()> {
        class.method(
            js_string!("empty"),
            0,
            NativeFunction::from_fn_ptr(|this, _args, _ctx| {
                let binding = this.as_object().ok_or_else(|| {
                    JsNativeError::typ().with_message("Object is not a DnnNet")
                })?;
                let js_net = binding
                    .downcast_ref::<JsDnnNet>()
                    .ok_or_else(|| JsNativeError::typ().with_message("Object is not a DnnNet"))?;
                let is_empty = js_net
                    .inner
                    .borrow()
                    .empty()
                    .map_err(|e| JsNativeError::error().with_message(format!("Net.empty 失败: {e}")))?;
                Ok(JsValue::new(is_empty))
            }),
        );

        class.method(
            js_string!("setPreferableBackend"),
            1,
            NativeFunction::from_fn_ptr(|this, args, ctx| {
                let backend_id = args
                    .first()
                    .ok_or_else(|| JsNativeError::typ().with_message("setPreferableBackend 需要 1 个参数"))?
                    .to_number(ctx)
                    .map_err(|_| JsNativeError::typ().with_message("backendId 必须是数字"))?
                    .round() as i32;
                let binding = this.as_object().ok_or_else(|| {
                    JsNativeError::typ().with_message("Object is not a DnnNet")
                })?;
                let js_net = binding
                    .downcast_ref::<JsDnnNet>()
                    .ok_or_else(|| JsNativeError::typ().with_message("Object is not a DnnNet"))?;
                js_net.inner.borrow_mut().set_preferable_backend(backend_id).map_err(|e| {
                    JsNativeError::error().with_message(format!("setPreferableBackend 失败: {e}"))
                })?;
                Ok(JsValue::undefined())
            }),
        );

        class.method(
            js_string!("setPreferableTarget"),
            1,
            NativeFunction::from_fn_ptr(|this, args, ctx| {
                let target_id = args
                    .first()
                    .ok_or_else(|| JsNativeError::typ().with_message("setPreferableTarget 需要 1 个参数"))?
                    .to_number(ctx)
                    .map_err(|_| JsNativeError::typ().with_message("targetId 必须是数字"))?
                    .round() as i32;
                let binding = this.as_object().ok_or_else(|| {
                    JsNativeError::typ().with_message("Object is not a DnnNet")
                })?;
                let js_net = binding
                    .downcast_ref::<JsDnnNet>()
                    .ok_or_else(|| JsNativeError::typ().with_message("Object is not a DnnNet"))?;
                js_net.inner.borrow_mut().set_preferable_target(target_id).map_err(|e| {
                    JsNativeError::error().with_message(format!("setPreferableTarget 失败: {e}"))
                })?;
                Ok(JsValue::undefined())
            }),
        );

        class.method(
            js_string!("setInput"),
            4,
            NativeFunction::from_fn_ptr(|this, args, ctx| {
                let js_blob = _expect_mat(args.first())?;
                let blob = js_blob.borrow();
                let input_name = _parse_optional_string_arg(args, 1, "", ctx)?;
                let scale = _parse_optional_number_arg(args, 2, 1.0, ctx)?;
                let mean = _parse_optional_scalar_arg(args, 3, ctx)?;

                let binding = this.as_object().ok_or_else(|| {
                    JsNativeError::typ().with_message("Object is not a DnnNet")
                })?;
                let js_net = binding
                    .downcast_ref::<JsDnnNet>()
                    .ok_or_else(|| JsNativeError::typ().with_message("Object is not a DnnNet"))?;
                js_net
                    .inner
                    .borrow_mut()
                    .set_input(&*blob.data().inner, input_name.as_str(), scale, mean)
                    .map_err(|e| JsNativeError::error().with_message(format!("setInput 失败: {e}")))?;

                Ok(JsValue::undefined())
            }),
        );

        class.method(
            js_string!("forward"),
            1,
            NativeFunction::from_fn_ptr(|this, args, ctx| {
                let binding = this.as_object().ok_or_else(|| {
                    JsNativeError::typ().with_message("Object is not a DnnNet")
                })?;
                let js_net = binding
                    .downcast_ref::<JsDnnNet>()
                    .ok_or_else(|| JsNativeError::typ().with_message("Object is not a DnnNet"))?;

                let output = if args
                    .first()
                    .is_some_and(|v| !v.is_undefined() && !v.is_null())
                {
                    let output_name = args[0].to_string(ctx).map(|s| s.to_std_string_lossy()).map_err(|_| {
                        JsNativeError::typ().with_message("forward(outputName) 的 outputName 必须是字符串")
                    })?;
                    js_net
                        .inner
                        .borrow_mut()
                        .forward_single(output_name.as_str())
                        .map_err(|e| JsNativeError::error().with_message(format!("forward 失败: {e}")))?
                } else {
                    js_net
                        .inner
                        .borrow_mut()
                        .forward_single_def()
                        .map_err(|e| JsNativeError::error().with_message(format!("forward 失败: {e}")))?
                };

                Box::new(output).into_js(ctx)
            }),
        );

        class.method(
            js_string!("getUnconnectedOutLayersNames"),
            0,
            NativeFunction::from_fn_ptr(|this, _args, ctx| {
                let binding = this.as_object().ok_or_else(|| {
                    JsNativeError::typ().with_message("Object is not a DnnNet")
                })?;
                let js_net = binding
                    .downcast_ref::<JsDnnNet>()
                    .ok_or_else(|| JsNativeError::typ().with_message("Object is not a DnnNet"))?;
                let names = js_net
                    .inner
                    .borrow()
                    .get_unconnected_out_layers_names()
                    .map_err(|e| {
                        JsNativeError::error()
                            .with_message(format!("getUnconnectedOutLayersNames 失败: {e}"))
                    })?
                    .to_vec();

                let js_array = JsArray::new(ctx);
                for name in names {
                    js_array.push(JsValue::from(js_string!(name)), ctx)?;
                }
                Ok(js_array.into())
            }),
        );

        Ok(())
    }

    /// `new DnnNet()` 的默认构造器（创建空 Net）。
    fn data_constructor(
        _new_target: &JsValue,
        _args: &[JsValue],
        _context: &mut Context,
    ) -> JsResult<Self> {
        let net = dnn::Net::default()
            .map_err(|e| JsNativeError::error().with_message(format!("创建 DnnNet 失败: {e}")))?;
        Ok(Self {
            inner: RefCell::new(net),
        })
    }
}

/// 为 `Box<dnn::Net>` 提供 JS 对象转换能力。
impl IntoJs for Box<dnn::Net> {
    fn into_js(self, context: &mut Context) -> JsResult<JsValue> {
        let prototype = context
            .get_global_class::<JsDnnNet>()
            .ok_or_else(|| JsNativeError::typ().with_message("JsDnnNet class not registered"))?
            .prototype();
        let data = JsDnnNet {
            inner: RefCell::new(*self),
        };
        let obj = JsObject::from_proto_and_data(prototype, data);
        Ok(obj.into())
    }
}

/// JS: `cv.dnn.readNetFromCaffe(prototxt, caffeModel?)`。
pub fn read_net_from_caffe_js(
    _this: &JsValue,
    args: &[JsValue],
    ctx: &mut Context,
) -> JsResult<JsValue> {
    let prototxt = args
        .first()
        .ok_or_else(|| JsNativeError::typ().with_message("readNetFromCaffe 需要 prototxt 参数"))?
        .to_string(ctx)
        .map(|s| s.to_std_string_lossy())
        .map_err(|_| JsNativeError::typ().with_message("prototxt 必须是字符串"))?;
    if prototxt.trim().is_empty() {
        return Err(JsNativeError::typ()
            .with_message("prototxt 路径不能为空")
            .into());
    }

    let model = _parse_optional_string_arg(args, 1, "", ctx)?;
    let net = if model.trim().is_empty() {
        dnn::read_net_from_caffe_def(prototxt.as_str())
            .map_err(|e| JsNativeError::error().with_message(format!("readNetFromCaffe 失败: {e}")))?
    } else {
        dnn::read_net_from_caffe(prototxt.as_str(), model.as_str())
            .map_err(|e| JsNativeError::error().with_message(format!("readNetFromCaffe 失败: {e}")))?
    };

    Box::new(net).into_js(ctx)
}

/// JS: `cv.dnn.readNetFromONNX(modelPath)`。
pub fn read_net_from_onnx_js(_this: &JsValue, args: &[JsValue], ctx: &mut Context) -> JsResult<JsValue> {
    let model_path = args
        .first()
        .ok_or_else(|| JsNativeError::typ().with_message("readNetFromONNX 需要 modelPath 参数"))?
        .to_string(ctx)
        .map(|s| s.to_std_string_lossy())
        .map_err(|_| JsNativeError::typ().with_message("modelPath 必须是字符串"))?;
    if model_path.trim().is_empty() {
        return Err(JsNativeError::typ()
            .with_message("modelPath 路径不能为空")
            .into());
    }

    let net = dnn::read_net_from_onnx(model_path.as_str())
        .map_err(|e| JsNativeError::error().with_message(format!("readNetFromONNX 失败: {e}")))?;
    Box::new(net).into_js(ctx)
}

/// JS: `cv.dnn.blobFromImage(image, scale?, size?, mean?, swapRB?, crop?, ddepth?)`。
pub fn blob_from_image_js(_this: &JsValue, args: &[JsValue], ctx: &mut Context) -> JsResult<JsValue> {
    let js_image = _expect_mat(args.first())?;
    let image = js_image.borrow();
    if image.data().inner.rows() <= 0 || image.data().inner.cols() <= 0 {
        return Err(JsNativeError::typ()
            .with_message("image Mat 尺寸无效")
            .into());
    }

    let scale = _parse_optional_number_arg(args, 1, 1.0, ctx)?;
    let size = _parse_optional_size_arg(args, 2, ctx)?;
    let mean = _parse_optional_scalar_arg(args, 3, ctx)?;
    let swap_rb = _parse_optional_bool_arg(args, 4, false);
    let crop = _parse_optional_bool_arg(args, 5, false);
    let ddepth = _parse_optional_number_arg(args, 6, CV_32F as f64, ctx)?.round() as i32;

    let blob: Mat =
        dnn::blob_from_image(&*image.data().inner, scale, size, mean, swap_rb, crop, ddepth)
            .map_err(|e| JsNativeError::error().with_message(format!("blobFromImage 失败: {e}")))?;
    Box::new(blob).into_js(ctx)
}

/// 注册 `cv.dnn` 命名空间。
pub fn register_cv_dnn_namespace(context: &mut Context) -> JsResult<()> {
    let dnn_object = {
        let mut dnn_builder = ObjectInitializer::new(context);
        dnn_builder
            .function(
                NativeFunction::from_fn_ptr(read_net_from_caffe_js),
                js_string!("readNetFromCaffe"),
                2,
            )
            .function(
                NativeFunction::from_fn_ptr(read_net_from_onnx_js),
                js_string!("readNetFromONNX"),
                1,
            )
            .function(
                NativeFunction::from_fn_ptr(blob_from_image_js),
                js_string!("blobFromImage"),
                7,
            )
            .property(
                js_string!("DNN_BACKEND_DEFAULT"),
                dnn::DNN_BACKEND_DEFAULT,
                Attribute::READONLY | Attribute::NON_ENUMERABLE | Attribute::CONFIGURABLE,
            )
            .property(
                js_string!("DNN_BACKEND_HALIDE"),
                dnn::DNN_BACKEND_HALIDE,
                Attribute::READONLY | Attribute::NON_ENUMERABLE | Attribute::CONFIGURABLE,
            )
            .property(
                js_string!("DNN_BACKEND_INFERENCE_ENGINE"),
                dnn::DNN_BACKEND_INFERENCE_ENGINE,
                Attribute::READONLY | Attribute::NON_ENUMERABLE | Attribute::CONFIGURABLE,
            )
            .property(
                js_string!("DNN_BACKEND_OPENCV"),
                dnn::DNN_BACKEND_OPENCV,
                Attribute::READONLY | Attribute::NON_ENUMERABLE | Attribute::CONFIGURABLE,
            )
            .property(
                js_string!("DNN_BACKEND_CUDA"),
                dnn::DNN_BACKEND_CUDA,
                Attribute::READONLY | Attribute::NON_ENUMERABLE | Attribute::CONFIGURABLE,
            )
            .property(
                js_string!("DNN_TARGET_CPU"),
                dnn::DNN_TARGET_CPU,
                Attribute::READONLY | Attribute::NON_ENUMERABLE | Attribute::CONFIGURABLE,
            )
            .property(
                js_string!("DNN_TARGET_OPENCL"),
                dnn::DNN_TARGET_OPENCL,
                Attribute::READONLY | Attribute::NON_ENUMERABLE | Attribute::CONFIGURABLE,
            )
            .property(
                js_string!("DNN_TARGET_OPENCL_FP16"),
                dnn::DNN_TARGET_OPENCL_FP16,
                Attribute::READONLY | Attribute::NON_ENUMERABLE | Attribute::CONFIGURABLE,
            )
            .property(
                js_string!("DNN_TARGET_MYRIAD"),
                dnn::DNN_TARGET_MYRIAD,
                Attribute::READONLY | Attribute::NON_ENUMERABLE | Attribute::CONFIGURABLE,
            )
            .property(
                js_string!("DNN_TARGET_FPGA"),
                dnn::DNN_TARGET_FPGA,
                Attribute::READONLY | Attribute::NON_ENUMERABLE | Attribute::CONFIGURABLE,
            )
            .property(
                js_string!("DNN_TARGET_CUDA"),
                dnn::DNN_TARGET_CUDA,
                Attribute::READONLY | Attribute::NON_ENUMERABLE | Attribute::CONFIGURABLE,
            )
            .property(
                js_string!("DNN_TARGET_CUDA_FP16"),
                dnn::DNN_TARGET_CUDA_FP16,
                Attribute::READONLY | Attribute::NON_ENUMERABLE | Attribute::CONFIGURABLE,
            )
            .property(
                js_string!("DNN_TARGET_HDDL"),
                dnn::DNN_TARGET_HDDL,
                Attribute::READONLY | Attribute::NON_ENUMERABLE | Attribute::CONFIGURABLE,
            );
        dnn_builder.build()
    };

    let cv_object = {
        let mut cv_builder = ObjectInitializer::new(context);
        cv_builder.property(
            js_string!("dnn"),
            dnn_object,
            Attribute::READONLY | Attribute::NON_ENUMERABLE | Attribute::CONFIGURABLE,
        );
        cv_builder.build()
    };

    context.register_global_property(
        js_string!("cv"),
        cv_object,
        Attribute::WRITABLE | Attribute::NON_ENUMERABLE | Attribute::CONFIGURABLE,
    )?;
    Ok(())
}
