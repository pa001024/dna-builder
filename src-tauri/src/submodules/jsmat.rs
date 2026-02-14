use crate::submodules::color::rgb_to_hsl;
use boa_engine::{
    Context, Finalize, JsData, JsNativeError, JsObject, JsResult, JsValue, Trace,
    class::{Class, ClassBuilder},
    js_string, js_value,
    native_function::NativeFunction,
};
use opencv::{
    core::{self, Size},
    imgproc,
    prelude::*,
};

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
        class.method(
            js_string!("roi"),
            4,
            NativeFunction::from_fn_ptr(|this, args, ctx| {
                // 参数数量校验
                if args.len() != 4 {
                    return Err(JsNativeError::typ()
                        .with_message("roi expects 4 arguments")
                        .into());
                }

                // 获取 Mat 实例
                let binding = this.as_object().unwrap();
                let js_mat = binding
                    .downcast_ref::<JsMat>()
                    .ok_or_else(|| JsNativeError::typ().with_message("Object is not a Mat"))?;

                // 解析参数：x、y、w、h
                let x = args[0]
                    .to_number(ctx)
                    .map_err(|_e| JsNativeError::typ().with_message("x must be a number"))?
                    as i32;
                let y = args[1]
                    .to_number(ctx)
                    .map_err(|_e| JsNativeError::typ().with_message("y must be a number"))?
                    as i32;
                let width = args[2]
                    .to_number(ctx)
                    .map_err(|_e| JsNativeError::typ().with_message("w must be a number"))?
                    as i32;
                let height = args[3]
                    .to_number(ctx)
                    .map_err(|_e| JsNativeError::typ().with_message("h must be a number"))?
                    as i32;

                // 参数取值校验
                if x < 0 || y < 0 || width <= 0 || height <= 0 {
                    return Err(JsNativeError::typ()
                        .with_message("Invalid roi. Expected x >= 0, y >= 0, w > 0, h > 0")
                        .into());
                }

                // 边界校验，防止 ROI 超出原图
                let rows = js_mat.inner.rows() as i64;
                let cols = js_mat.inner.cols() as i64;
                let roi_right = x as i64 + width as i64;
                let roi_bottom = y as i64 + height as i64;
                if roi_right > cols || roi_bottom > rows {
                    return Err(JsNativeError::typ()
                        .with_message("ROI is out of image bounds")
                        .into());
                }

                // 生成 ROI 并复制为独立 Mat，避免生命周期问题
                let roi_rect = core::Rect::new(x, y, width, height);
                let roi_ref = js_mat
                    .inner
                    .roi(roi_rect)
                    .map_err(|_e| JsNativeError::typ().with_message("Failed to create ROI"))?;
                let mut roi_mat = core::Mat::default();
                roi_ref
                    .copy_to(&mut roi_mat)
                    .map_err(|_e| JsNativeError::typ().with_message("Failed to copy ROI Mat"))?;

                Box::new(roi_mat).into_js(ctx)
            }),
        );
        class.method(
            js_string!("resize"),
            3,
            NativeFunction::from_fn_ptr(|this, args, ctx| {
                // 参数数量校验（w, h, interpolation?）
                if args.len() < 2 || args.len() > 3 {
                    return Err(JsNativeError::typ()
                        .with_message("resize expects 2 or 3 arguments")
                        .into());
                }

                // 获取 Mat 实例
                let binding = this.as_object().unwrap();
                let js_mat = binding
                    .downcast_ref::<JsMat>()
                    .ok_or_else(|| JsNativeError::typ().with_message("Object is not a Mat"))?;

                // 解析宽高参数
                let width = args[0]
                    .to_number(ctx)
                    .map_err(|_e| JsNativeError::typ().with_message("w must be a number"))?
                    as i32;
                let height = args[1]
                    .to_number(ctx)
                    .map_err(|_e| JsNativeError::typ().with_message("h must be a number"))?
                    as i32;
                if width <= 0 || height <= 0 {
                    return Err(JsNativeError::typ()
                        .with_message("Invalid resize size. Expected w > 0, h > 0")
                        .into());
                }

                // 解析插值参数：支持字符串别名和 OpenCV 常量值
                let interpolation = if args.len() == 3 {
                    let value = &args[2];
                    if let Some(num) = value.as_number() {
                        num as i32
                    } else {
                        let text = value
                            .to_string(ctx)
                            .map_err(|_e| {
                                JsNativeError::typ()
                                    .with_message("interpolation must be a string or number")
                            })?
                            .to_std_string_lossy()
                            .to_lowercase();
                        match text.as_str() {
                            "nearest" => imgproc::INTER_NEAREST,
                            "linear" => imgproc::INTER_LINEAR,
                            "cubic" => imgproc::INTER_CUBIC,
                            "area" => imgproc::INTER_AREA,
                            "lanczos4" => imgproc::INTER_LANCZOS4,
                            _ => {
                                return Err(JsNativeError::typ()
                                    .with_message(
                                        "Invalid interpolation. Use nearest/linear/cubic/area/lanczos4 or OpenCV constant",
                                    )
                                    .into());
                            }
                        }
                    }
                } else {
                    imgproc::INTER_LINEAR
                };

                // 执行缩放并返回新 Mat（不修改原对象）
                let mut dst = core::Mat::default();
                imgproc::resize(
                    &*js_mat.inner,
                    &mut dst,
                    Size::new(width, height),
                    0.0,
                    0.0,
                    interpolation,
                )
                .map_err(|_e| JsNativeError::typ().with_message("Failed to resize Mat"))?;

                Box::new(dst).into_js(ctx)
            }),
        );
        class.method(
            js_string!("at_2d"),
            2,
            NativeFunction::from_fn_ptr(|this, args, ctx| {
                // 检查参数数量
                if args.len() != 2 {
                    return Err(JsNativeError::typ()
                        .with_message("at_2d expects 2 arguments")
                        .into());
                }

                // 获取 Rust 对象引用
                let binding = this.as_object().unwrap();
                let js_mat = binding
                    .downcast_ref::<JsMat>()
                    .ok_or_else(|| JsNativeError::typ().with_message("Object is not a Mat"))?;
                // 提取参数
                let row = args[0]
                    .to_number(ctx)
                    .map_err(|_e| JsNativeError::typ().with_message("Row index must be a number"))?
                    as i32;
                let col = args[1].to_number(ctx).map_err(|_e| {
                    JsNativeError::typ().with_message("Column index must be a number")
                })? as i32;

                match js_mat.inner.at_2d::<core::Vec3b>(row, col) {
                    Ok(value) => Ok(js_value!([value[0], value[1], value[2]], ctx)),
                    Err(_) => Ok(JsValue::undefined()),
                }
            }),
        );
        class.method(
            js_string!("get_rgb"),
            2,
            NativeFunction::from_fn_ptr(|this, args, ctx| {
                // 检查参数数量
                if args.len() != 2 {
                    return Err(JsNativeError::typ()
                        .with_message("at_2d expects 2 arguments")
                        .into());
                }

                // 获取 Rust 对象引用
                let binding = this.as_object().unwrap();
                let js_mat = binding
                    .downcast_ref::<JsMat>()
                    .ok_or_else(|| JsNativeError::typ().with_message("Object is not a Mat"))?;
                // 提取参数
                let row = args[1]
                    .to_number(ctx)
                    .map_err(|_e| JsNativeError::typ().with_message("Row index must be a number"))?
                    as i32;
                let col = args[0].to_number(ctx).map_err(|_e| {
                    JsNativeError::typ().with_message("Column index must be a number")
                })? as i32;

                match js_mat.inner.at_2d::<core::Vec3b>(row, col) {
                    Ok(value) => Ok(js_value!(
                        (value[2] as u32) << 16 | (value[1] as u32) << 8 | value[0] as u32,
                        ctx
                    )),
                    Err(_) => Ok(JsValue::undefined()),
                }
            }),
        );
        class.method(
            js_string!("get_hsl"),
            2,
            NativeFunction::from_fn_ptr(|this, args, ctx| {
                // 检查参数数量
                if args.len() != 2 {
                    return Err(JsNativeError::typ()
                        .with_message("get_hsl expects 2 arguments")
                        .into());
                }

                // 获取 Rust 对象引用
                let binding = this.as_object().unwrap();
                let js_mat = binding
                    .downcast_ref::<JsMat>()
                    .ok_or_else(|| JsNativeError::typ().with_message("Object is not a Mat"))?;
                // 提取参数
                let row = args[1]
                    .to_number(ctx)
                    .map_err(|_e| JsNativeError::typ().with_message("Row index must be a number"))?
                    as i32;
                let col = args[0].to_number(ctx).map_err(|_e| {
                    JsNativeError::typ().with_message("Column index must be a number")
                })? as i32;

                match js_mat.inner.at_2d::<core::Vec3b>(row, col) {
                    Ok(value) => {
                        // 提取 RGB 值并转换为 HSL
                        let rgb =
                            (value[2] as u32) << 16 | (value[1] as u32) << 8 | value[0] as u32;
                        let (hue, saturation, luminance) = rgb_to_hsl(rgb);
                        Ok(js_value!([hue, saturation, luminance], ctx))
                    }
                    Err(_) => Ok(JsValue::undefined()),
                }
            }),
        );
        class.method(
            js_string!("find_color"),
            6,
            NativeFunction::from_fn_ptr(|this, args, ctx| {
                // 检查参数数量
                if args.len() != 6 {
                    return Err(JsNativeError::typ()
                        .with_message("find_color expects 6 arguments")
                        .into());
                }

                // 获取 Rust 对象引用
                let binding = this.as_object().unwrap();
                let js_mat = binding
                    .downcast_ref::<JsMat>()
                    .ok_or_else(|| JsNativeError::typ().with_message("Object is not a Mat"))?;

                // 提取参数
                let x = args[0]
                    .to_number(ctx)
                    .map_err(|_e| JsNativeError::typ().with_message("x must be a number"))?
                    as i32;
                let y = args[1]
                    .to_number(ctx)
                    .map_err(|_e| JsNativeError::typ().with_message("y must be a number"))?
                    as i32;
                let max_length = args[2].to_number(ctx).map_err(|_e| {
                    JsNativeError::typ().with_message("max_length must be a number")
                })? as i32;
                let target_color = args[3]
                    .to_number(ctx)
                    .map_err(|_e| JsNativeError::typ().with_message("color must be a number"))?
                    as u32;
                let tolerance = args[4]
                    .to_number(ctx)
                    .map_err(|_e| JsNativeError::typ().with_message("tolerance must be a number"))?
                    as u8;
                let direction = args[5]
                    .to_string(ctx)
                    .map_err(|_e| JsNativeError::typ().with_message("direction must be a string"))?
                    .to_std_string()
                    .map_err(|_e| JsNativeError::typ().with_message("Invalid direction string"))?;

                // 提取目标颜色的 RGB 分量
                let target_r = ((target_color >> 16) & 0xFF) as u8;
                let target_g = ((target_color >> 8) & 0xFF) as u8;
                let target_b = (target_color & 0xFF) as u8;

                // 根据方向遍历像素
                let rows = js_mat.inner.rows();
                let cols = js_mat.inner.cols();

                for i in 0..max_length {
                    let (check_x, check_y) = match direction.as_str() {
                        "ltr" => (x + i, y),
                        "rtl" => (x - i, y),
                        "ttb" => (x, y + i),
                        "btt" => (x, y - i),
                        _ => {
                            return Err(JsNativeError::typ()
                                .with_message(
                                    "Invalid direction. Use 'ltr', 'rtl', 'ttb', or 'btt'",
                                )
                                .into());
                        }
                    };

                    // 检查边界
                    if check_x < 0 || check_x >= cols || check_y < 0 || check_y >= rows {
                        continue;
                    }

                    // 获取像素颜色
                    if let Ok(pixel) = js_mat.inner.at_2d::<core::Vec3b>(check_y, check_x) {
                        let b = pixel[0];
                        let g = pixel[1];
                        let r = pixel[2];

                        // 计算颜色差值
                        let dr = (r as i32 - target_r as i32).abs() as u8;
                        let dg = (g as i32 - target_g as i32).abs() as u8;
                        let db = (b as i32 - target_b as i32).abs() as u8;

                        // 检查是否在容差范围内
                        if dr <= tolerance && dg <= tolerance && db <= tolerance {
                            return Ok(js_value!([check_x, check_y], ctx));
                        }
                    }
                }

                // 未找到符合条件的颜色
                Ok(JsValue::undefined())
            }),
        );
        class.method(
            js_string!("find_bright"),
            7,
            NativeFunction::from_fn_ptr(|this, args, ctx| {
                // 检查参数数量
                if args.len() != 7 {
                    return Err(JsNativeError::typ()
                        .with_message("find_bright expects 7 arguments")
                        .into());
                }

                // 获取 Rust 对象引用
                let binding = this.as_object().unwrap();
                let js_mat = binding
                    .downcast_ref::<JsMat>()
                    .ok_or_else(|| JsNativeError::typ().with_message("Object is not a Mat"))?;

                // 提取参数
                let x = args[0]
                    .to_number(ctx)
                    .map_err(|_e| JsNativeError::typ().with_message("x must be a number"))?
                    as i32;
                let y = args[1]
                    .to_number(ctx)
                    .map_err(|_e| JsNativeError::typ().with_message("y must be a number"))?
                    as i32;
                let max_length = args[2].to_number(ctx).map_err(|_e| {
                    JsNativeError::typ().with_message("max_length must be a number")
                })? as i32;
                let target_bright = args[3]
                    .to_number(ctx)
                    .map_err(|_e| JsNativeError::typ().with_message("bright must be a number"))?
                    as f64;
                let tolerance = args[4]
                    .to_number(ctx)
                    .map_err(|_e| JsNativeError::typ().with_message("tolerance must be a number"))?
                    as f64;
                let operator = args[5]
                    .to_string(ctx)
                    .map_err(|_e| JsNativeError::typ().with_message("operator must be a string"))?
                    .to_std_string()
                    .map_err(|_e| JsNativeError::typ().with_message("Invalid operator string"))?;
                let direction = args[6]
                    .to_string(ctx)
                    .map_err(|_e| JsNativeError::typ().with_message("direction must be a string"))?
                    .to_std_string()
                    .map_err(|_e| JsNativeError::typ().with_message("Invalid direction string"))?;

                // 验证操作符
                if operator != ">" && operator != "<" {
                    return Err(JsNativeError::typ()
                        .with_message("Invalid operator. Use '>' or '<'")
                        .into());
                }

                // 根据方向遍历像素
                let rows = js_mat.inner.rows();
                let cols = js_mat.inner.cols();

                for i in 0..max_length {
                    let (check_x, check_y) = match direction.as_str() {
                        "ltr" => (x + i, y),
                        "rtl" => (x - i, y),
                        "ttb" => (x, y + i),
                        "btt" => (x, y - i),
                        _ => {
                            return Err(JsNativeError::typ()
                                .with_message(
                                    "Invalid direction. Use 'ltr', 'rtl', 'ttb', or 'btt'",
                                )
                                .into());
                        }
                    };

                    // 检查边界
                    if check_x < 0 || check_x >= cols || check_y < 0 || check_y >= rows {
                        continue;
                    }

                    // 获取像素颜色并计算亮度
                    if let Ok(pixel) = js_mat.inner.at_2d::<core::Vec3b>(check_y, check_x) {
                        let b = pixel[0] as f64;
                        let g = pixel[1] as f64;
                        let r = pixel[2] as f64;

                        // 计算亮度 (使用标准亮度公式)
                        let brightness = 0.299 * r + 0.587 * g + 0.114 * b;

                        // 根据操作符检查亮度条件
                        let matches = if operator == ">" {
                            brightness >= target_bright - tolerance
                        } else {
                            brightness <= target_bright + tolerance
                        };

                        if matches {
                            return Ok(js_value!([check_x, check_y], ctx));
                        }
                    }
                }

                // 未找到符合条件的亮度
                Ok(JsValue::undefined())
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
