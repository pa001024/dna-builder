use boa_engine::class::Class;
use boa_engine::job::NativeAsyncJob;
use boa_engine::object::builtins::{JsFunction, JsPromise};
use boa_engine::{
    Context, IntoJsFunctionCopied, JsData, JsError, JsNativeError, JsObject, JsResult, JsValue,
    js_string, js_value,
};
use opencv::prelude::{MatTraitConst, VectorToVec};
use std::{thread, time::Duration};
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, SetForegroundWindow};

use crate::submodules::{
    color_match::{check_color_mat, find_color_and_match_template, rgb_to_bgr},
    fx::draw_border,
    input::*,
    jsmat::{IntoJs, JsMat},
    tpl::{get_template, get_template_b64},
    tpl_match::match_template,
    util::{capture_window, capture_window_wgc, check_size},
    win::{find_window, get_window_by_process_name, move_window, win_get_client_pos},
};
use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;

trait JsArgExt {
    // 泛型 T 必须实现 Class (为了获取名字) 和 JsData (为了转换)
    fn get_native<T: Class + JsData>(&self) -> JsResult<JsObject<T>>;
}
// 为 JsValue 实现该 Trait
impl JsArgExt for JsValue {
    fn get_native<T: Class + JsData>(&self) -> JsResult<JsObject<T>> {
        self.as_object()
            .and_then(|obj| obj.downcast::<T>().ok())
            .ok_or_else(|| {
                // 自动生成清晰的错误信息，例如 "Argument must be a Mat"
                let msg = format!("Argument must be a {}", T::NAME);
                JsNativeError::typ().with_message(msg).into()
            })
    }
}

fn _win_get_client_pos(hwnd: Option<JsValue>, ctx: &mut Context) -> JsResult<JsValue> {
    let hwnd = HWND(
        hwnd.unwrap_or_else(|| JsValue::undefined())
            .to_i32(ctx)
            .unwrap_or(0) as isize as *mut std::ffi::c_void,
    );
    // Get ownership of rest arguments.
    if let Some((x, y, width, height)) = win_get_client_pos(hwnd) {
        Ok(js_value!([x, y, width, height], ctx))
    } else {
        Ok(JsValue::undefined())
    }
}

/// 鼠标点击函数
fn _mc(
    hwnd: Option<JsValue>,
    x: Option<JsValue>,
    y: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    let hwnd = HWND(
        hwnd.unwrap_or_else(|| JsValue::undefined())
            .to_number(ctx)? as isize as *mut std::ffi::c_void,
    );
    let x = x.unwrap_or_else(|| JsValue::undefined()).to_number(ctx)? as i32;
    let y = y.unwrap_or_else(|| JsValue::undefined()).to_number(ctx)? as i32;
    if hwnd.is_invalid() {
        click_to(x, y);
    } else {
        post_mouse_click(hwnd, x, y);
    }
    Ok(JsValue::undefined())
}

/// 鼠标移动函数
fn _mm(x: Option<JsValue>, y: Option<JsValue>, ctx: &mut Context) -> JsResult<JsValue> {
    let x = x.unwrap_or_else(|| JsValue::undefined()).to_number(ctx)? as i32;
    let y = y.unwrap_or_else(|| JsValue::undefined()).to_number(ctx)? as i32;
    mouse_move(x, y);
    Ok(JsValue::undefined())
}

/// 鼠标绝对移动函数（带缓动，异步）
fn _move_to(
    hwnd: Option<JsValue>,
    x: Option<JsValue>,
    y: Option<JsValue>,
    duration: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    let hwnd = HWND(
        hwnd.unwrap_or_else(|| JsValue::undefined())
            .to_number(ctx)? as isize as *mut std::ffi::c_void,
    );
    let mut end_x = x.unwrap_or_else(|| JsValue::undefined()).to_number(ctx)? as i32;
    let mut end_y = y.unwrap_or_else(|| JsValue::undefined()).to_number(ctx)? as i32;
    let duration = duration
        .unwrap_or_else(|| JsValue::undefined())
        .to_number(ctx)? as u64;

    if !hwnd.is_invalid() {
        let (x, y, _width, _height) = win_get_client_pos(hwnd).unwrap_or((0, 0, 0, 0));
        end_x += x;
        end_y += y;
    }

    // 获取当前鼠标位置
    let mut current_pos = windows::Win32::Foundation::POINT { x: 0, y: 0 };
    unsafe {
        let _ = GetCursorPos(&mut current_pos);
    }

    // 立即开始移动（在 tokio 任务中）
    let start_x = current_pos.x;
    let start_y = current_pos.y;
    let duration_ms = duration as u32;
    tokio::spawn(async move {
        mouse_move_to_eased(start_x, start_y, end_x, end_y, duration_ms).await;
    });

    // 返回在 duration 毫秒后 resolve 的 promise
    let mut cb: Option<JsFunction> = None;
    let promise = JsPromise::new(
        |resolvers, _context| {
            cb = Some(resolvers.resolve.clone());

            Ok(JsValue::undefined())
        },
        ctx,
    );
    let job = boa_engine::job::TimeoutJob::new(
        boa_engine::job::NativeJob::new(move |context| {
            cb.unwrap()
                .call(&JsValue::undefined(), &[], context)
                .unwrap();
            Ok(JsValue::undefined())
        }),
        duration,
    );
    ctx.enqueue_job(job.into());
    Ok(promise.into())
}

/// 鼠标按下函数
fn _md(
    hwnd: Option<JsValue>,
    x: Option<JsValue>,
    y: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    let hwnd = HWND(
        hwnd.unwrap_or_else(|| JsValue::undefined())
            .to_number(ctx)? as isize as *mut std::ffi::c_void,
    );
    let x = x.unwrap_or_else(|| js_value!(-1)).to_number(ctx)? as i32;
    let y = y.unwrap_or_else(|| js_value!(-1)).to_number(ctx)? as i32;
    if hwnd.is_invalid() {
        if x == -1 || y == -1 {
            mouse_down();
        } else {
            mouse_move_to(x, y);
            mouse_down();
        }
    } else {
        post_mouse_down(hwnd, x, y);
    }
    Ok(JsValue::undefined())
}

/// 鼠标释放函数
fn _mu(
    hwnd: Option<JsValue>,
    x: Option<JsValue>,
    y: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    let hwnd = HWND(
        hwnd.unwrap_or_else(|| JsValue::undefined())
            .to_number(ctx)? as isize as *mut std::ffi::c_void,
    );
    let x = x.unwrap_or_else(|| js_value!(-1)).to_number(ctx)? as i32;
    let y = y.unwrap_or_else(|| js_value!(-1)).to_number(ctx)? as i32;
    if hwnd.is_invalid() {
        if x == -1 || y == -1 {
            mouse_up();
        } else {
            mouse_move_to(x, y);
            mouse_up();
        }
    } else {
        post_mouse_up(hwnd, x, y);
    }
    Ok(JsValue::undefined())
}

/// 鼠标中键点击函数
fn _mt(
    hwnd: Option<JsValue>,
    x: Option<JsValue>,
    y: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    let hwnd = HWND(
        hwnd.unwrap_or_else(|| JsValue::undefined())
            .to_number(ctx)? as isize as *mut std::ffi::c_void,
    );
    let x = x.unwrap_or_else(|| js_value!(-1)).to_number(ctx)? as i32;
    let y = y.unwrap_or_else(|| js_value!(-1)).to_number(ctx)? as i32;
    if hwnd.is_invalid() {
        if x == -1 || y == -1 {
            middle_click();
        } else {
            middle_click_to(x, y);
        }
    } else {
        post_mouse_middle_click(hwnd, x, y);
    }
    Ok(JsValue::undefined())
}

/// 键盘按键函数
fn _kb(
    hwnd: Option<JsValue>,
    key: Option<JsValue>,
    duration: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    let hwnd = HWND(
        hwnd.unwrap_or_else(|| JsValue::undefined())
            .to_number(ctx)? as isize as *mut std::ffi::c_void,
    );
    let key = key
        .unwrap_or_else(|| JsValue::undefined())
        .to_string(ctx)?
        .to_std_string_lossy();
    let duration = duration.unwrap_or_else(|| js_value!(0)).to_number(ctx)? as u32;
    if hwnd.is_invalid() {
        key_press(&key, duration);
    } else {
        post_key_press(hwnd, &key, duration);
    }
    Ok(JsValue::undefined())
}

/// 键盘按下函数
fn _kd(hwnd: Option<JsValue>, key: Option<JsValue>, ctx: &mut Context) -> JsResult<JsValue> {
    let hwnd = HWND(
        hwnd.unwrap_or_else(|| JsValue::undefined())
            .to_number(ctx)? as isize as *mut std::ffi::c_void,
    );
    let key = key
        .unwrap_or_else(|| JsValue::undefined())
        .to_string(ctx)?
        .to_std_string_lossy();
    let vkey = key_to_vkey(&key);
    if hwnd.is_invalid() {
        key_down(vkey);
    } else {
        post_key_down(hwnd, vkey);
    }
    Ok(JsValue::undefined())
}

/// 键盘释放函数
fn _ku(hwnd: Option<JsValue>, key: Option<JsValue>, ctx: &mut Context) -> JsResult<JsValue> {
    let hwnd = HWND(
        hwnd.unwrap_or_else(|| JsValue::undefined())
            .to_number(ctx)? as isize as *mut std::ffi::c_void,
    );
    let key = key
        .unwrap_or_else(|| JsValue::undefined())
        .to_string(ctx)?
        .to_std_string_lossy();
    let vkey = key_to_vkey(&key);
    if hwnd.is_invalid() {
        key_up(vkey);
    } else {
        post_key_up(hwnd, vkey);
    }
    Ok(JsValue::undefined())
}

/// 设置前景窗口函数
fn _set_foreground_window(hwnd: Option<JsValue>, ctx: &mut Context) -> JsResult<JsValue> {
    let hwnd = HWND(
        hwnd.unwrap_or_else(|| JsValue::undefined())
            .to_number(ctx)? as isize as *mut std::ffi::c_void,
    );
    unsafe {
        let _ = SetForegroundWindow(hwnd);
    }
    Ok(JsValue::undefined())
}

/// 检查窗口大小函数
fn _check_size(hwnd: Option<JsValue>, ctx: &mut Context) -> JsResult<JsValue> {
    let hwnd = HWND(
        hwnd.unwrap_or_else(|| JsValue::undefined())
            .to_number(ctx)? as isize as *mut std::ffi::c_void,
    );
    check_size(hwnd);
    Ok(JsValue::undefined())
}

/// 移动窗口并设置大小函数
fn _move_window(
    hwnd: Option<JsValue>,
    x: Option<JsValue>,
    y: Option<JsValue>,
    w: Option<JsValue>,
    h: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    let hwnd = HWND(
        hwnd.unwrap_or_else(|| JsValue::undefined())
            .to_number(ctx)? as isize as *mut std::ffi::c_void,
    );
    let x = x.unwrap_or_else(|| JsValue::undefined()).to_number(ctx)? as i32;
    let y = y.unwrap_or_else(|| JsValue::undefined()).to_number(ctx)? as i32;
    let w = w.and_then(|v| v.to_number(ctx).ok()).map(|v| v as i32);
    let h = h.and_then(|v| v.to_number(ctx).ok()).map(|v| v as i32);
    if hwnd.is_invalid() {
        return Ok(JsValue::new(false));
    }
    let result = move_window(hwnd, x, y, w, h);
    Ok(JsValue::new(result))
}

/// 从窗口获取图像Mat对象函数
fn _capture_window(hwnd: Option<JsValue>, ctx: &mut Context) -> JsResult<JsValue> {
    let hwnd = HWND(
        hwnd.unwrap_or_else(|| JsValue::undefined())
            .to_number(ctx)? as isize as *mut std::ffi::c_void,
    );

    if let Some(mat) = capture_window(hwnd) {
        let js_mat = Box::new(mat).into_js(ctx)?;
        Ok(js_mat)
    } else {
        Ok(JsValue::undefined())
    }
}
/// 从窗口获取图像Mat对象函数（WGC优化版）
fn _capture_window_wgc(hwnd: Option<JsValue>, ctx: &mut Context) -> JsResult<JsValue> {
    let hwnd = HWND(
        hwnd.unwrap_or_else(|| JsValue::undefined())
            .to_number(ctx)? as isize as *mut std::ffi::c_void,
    );

    if let Some(mat) = capture_window_wgc(hwnd) {
        let js_mat = mat.into_js(ctx)?;
        Ok(js_mat)
    } else {
        Ok(JsValue::undefined())
    }
}

/// 从文件加载模板Mat对象函数
fn _get_template(path: Option<JsValue>, ctx: &mut Context) -> JsResult<JsValue> {
    let path = path
        .unwrap_or_else(|| JsValue::undefined())
        .to_string(ctx)?
        .to_std_string_lossy();

    if let Ok(mat) = get_template(&path) {
        let js_mat = Box::new(mat).into_js(ctx)?;
        Ok(js_mat)
    } else {
        Ok(JsValue::undefined())
    }
}

/// 从 base64 字符串加载模板Mat对象函数
fn _get_template_b64(b64_str: Option<JsValue>, ctx: &mut Context) -> JsResult<JsValue> {
    let b64_str = b64_str
        .unwrap_or_else(|| JsValue::undefined())
        .to_string(ctx)?
        .to_std_string_lossy();

    if let Ok(mat) = get_template_b64(&b64_str) {
        let js_mat = Box::new(mat).into_js(ctx)?;
        Ok(js_mat)
    } else {
        Ok(JsValue::undefined())
    }
}

/// 从文件加载图像Mat对象函数
fn _imread(path: Option<JsValue>, ctx: &mut Context) -> JsResult<JsValue> {
    let path = path
        .unwrap_or_else(|| JsValue::undefined())
        .to_string(ctx)?
        .to_std_string_lossy();

    if let Ok(mat) = opencv::imgcodecs::imread(&path, opencv::imgcodecs::IMREAD_COLOR) {
        let js_mat = Box::new(mat).into_js(ctx)?;
        Ok(js_mat)
    } else {
        println!("imread failed: {:?}", path);
        Ok(JsValue::undefined())
    }
}

/// 保存Mat对象到文件函数
fn _imwrite(
    js_img_mat: Option<JsValue>,
    path: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    // 获取第一个参数 (图像Mat)
    let js_img_mat = js_img_mat
        .unwrap_or_else(|| JsValue::undefined())
        .get_native::<JsMat>()?;

    let path = path
        .unwrap_or_else(|| JsValue::undefined())
        .to_string(ctx)?
        .to_std_string_lossy();

    // 保存图像到文件
    match opencv::imgcodecs::imwrite(
        &path,
        &*js_img_mat.borrow().data().inner,
        &opencv::core::Vector::new(),
    ) {
        Ok(_) => Ok(JsValue::new(true)),
        Err(_) => Ok(JsValue::new(false)),
    }
}

/// 复制Mat对象到剪贴板函数
fn _copy_image(js_img_mat: Option<JsValue>, _ctx: &mut Context) -> JsResult<JsValue> {
    // 获取第一个参数 (图像Mat)
    let js_img_mat = js_img_mat
        .unwrap_or_else(|| JsValue::undefined())
        .get_native::<JsMat>()?;

    // 将 Mat 转换为字节数据
    let mut buf = opencv::core::Vector::new();
    let params = opencv::core::Vector::new();
    match opencv::imgcodecs::imencode(
        ".png",
        &*js_img_mat.borrow().data().inner,
        &mut buf,
        &params,
    ) {
        Ok(_) => {
            // 使用 arboard 复制图像到剪贴板
            let mut clipboard = arboard::Clipboard::new().unwrap();
            let image_data = arboard::ImageData {
                bytes: buf.to_vec().into(),
                width: js_img_mat.borrow().data().inner.cols() as usize,
                height: js_img_mat.borrow().data().inner.rows() as usize,
            };
            let _ = clipboard.set_image(image_data);
            Ok(JsValue::new(true))
        }
        Err(_) => Ok(JsValue::new(false)),
    }
}

/// 从本地或网络加载图像Mat对象函数
/// 如果 local_path 不为空，先尝试从本地路径加载，失败则从网络下载并保存到本地
/// 如果 local_path 为空，直接从网络加载不保存到本地
fn _imread_url(
    local_path: Option<JsValue>,
    url: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    let local_path = local_path
        .unwrap_or_else(|| JsValue::undefined())
        .to_string(ctx)?
        .to_std_string_lossy();
    let url = url
        .unwrap_or_else(|| JsValue::undefined())
        .to_string(ctx)?
        .to_std_string_lossy();

    // 如果 local_path 不为空，先尝试从本地加载
    if !local_path.is_empty() {
        if let Ok(mat) = opencv::imgcodecs::imread(&local_path, opencv::imgcodecs::IMREAD_COLOR) {
            let js_mat = Box::new(mat).into_js(ctx)?;
            return Ok(js_mat);
        }
    }

    // 从网络下载
    match reqwest::blocking::get(&url) {
        Ok(response) => {
            if response.status().is_success() {
                match response.bytes() {
                    Ok(bytes) => {
                        // 将字节数据转换为 Vec<u8>
                        let byte_vec: Vec<u8> = bytes.to_vec();

                        // 如果 local_path 不为空，保存原始数据到本地
                        if !local_path.is_empty() {
                            if let Err(_) = std::fs::write(&local_path, &byte_vec) {
                                return Ok(JsValue::undefined());
                            }
                        }

                        // 将字节数据解码为图像
                        match opencv::imgcodecs::imdecode(
                            &opencv::core::Vector::<u8>::from(byte_vec),
                            opencv::imgcodecs::IMREAD_COLOR,
                        ) {
                            Ok(mat) => {
                                let js_mat = Box::new(mat).into_js(ctx)?;
                                Ok(js_mat)
                            }
                            Err(_) => Ok(JsValue::undefined()),
                        }
                    }
                    Err(_) => Ok(JsValue::undefined()),
                }
            } else {
                Ok(JsValue::undefined())
            }
        }
        Err(_) => Ok(JsValue::undefined()),
    }
}

/// 显示图片函数 (异步)
fn _imshow(
    title: Option<JsValue>,
    js_img_mat: Option<JsValue>,
    wait_key_ms: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    let (promise, resolvers) = JsPromise::new_pending(ctx);
    let js_img_mat = js_img_mat.unwrap_or_else(|| JsValue::undefined());
    let js_img_mat = js_img_mat.get_native::<JsMat>()?;

    let title = title
        .unwrap_or_else(|| JsValue::undefined())
        .to_string(ctx)?
        .to_std_string_lossy();
    let wait_key_ms = wait_key_ms.unwrap_or_else(|| js_value!(0)).to_number(ctx)? as i32;

    let mat_clone = (*js_img_mat.borrow().data().inner).clone();

    ctx.enqueue_job(
        NativeAsyncJob::new(async move |context| {
            let _ = thread::spawn(move || {
                let _ = opencv::highgui::imshow(&title, &mat_clone);
                let _ = opencv::highgui::wait_key(wait_key_ms);
                // let _ = opencv::highgui::destroy_window(&title);
            })
            .join();

            let context = &mut context.borrow_mut();
            resolvers.resolve.call(&JsValue::undefined(), &[], context)
        })
        .into(),
    );

    Ok(promise.into())
}

/// 使用两个Mat对象进行颜色和模板匹配函数
fn _find_color_and_match_template(
    js_img_mat: Option<JsValue>,
    js_tpl_mat: Option<JsValue>,
    color: Option<JsValue>,
    tolerance: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    // 获取第一个参数 (图像Mat)
    let js_img_mat = js_img_mat
        .unwrap_or_else(|| JsValue::undefined())
        .get_native::<JsMat>()?;

    // 获取第二个参数 (模板Mat)
    let js_tpl_mat = js_tpl_mat
        .unwrap_or_else(|| JsValue::undefined())
        .get_native::<JsMat>()?;

    // 获取颜色参数
    let color = color
        .unwrap_or_else(|| JsValue::undefined())
        .to_number(ctx)? as u32;
    let tolerance = tolerance
        .unwrap_or_else(|| JsValue::undefined())
        .to_number(ctx)? as u8;
    let bgr_color = rgb_to_bgr(color);

    // 执行匹配
    match find_color_and_match_template(
        &js_img_mat.borrow().data().inner,
        &js_tpl_mat.borrow().data().inner,
        bgr_color,
        tolerance,
    ) {
        Ok(Some((x, y))) => Ok(js_value!([x, y], ctx)),
        Ok(None) => Ok(JsValue::undefined()),
        Err(e) => Err(JsError::from_opaque(JsValue::from(js_string!(format!(
            "颜色匹配失败: {:?}",
            e
        ))))),
    }
}

/// 模板匹配函数
fn _match_template(
    js_img_mat: Option<JsValue>,
    js_tpl_mat: Option<JsValue>,
    tolerance: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    // 获取第一个参数 (图像Mat)
    let js_img_mat = js_img_mat
        .unwrap_or_else(|| JsValue::undefined())
        .get_native::<JsMat>()?;

    // 获取第二个参数 (模板Mat)
    let js_tpl_mat = js_tpl_mat
        .unwrap_or_else(|| JsValue::undefined())
        .get_native::<JsMat>()?;

    // 获取容差参数
    let tolerance = tolerance
        .unwrap_or_else(|| JsValue::undefined())
        .to_number(ctx)? as f64;

    // 执行模板匹配（自动检测是否带透明度）
    match match_template(
        &js_img_mat.borrow().data().inner,
        &js_tpl_mat.borrow().data().inner,
        tolerance,
    ) {
        Ok(Some((x, y))) => Ok(js_value!([x, y], ctx)),
        Ok(None) => Ok(JsValue::undefined()),
        Err(e) => {
            let msg = format!("模板匹配失败: {:?}", e);
            Err(JsError::from_opaque(JsValue::from(js_string!(msg))))
        }
    }
}

/// 颜色矩阵检查函数
fn _cc(
    js_img_mat: Option<JsValue>,
    x: Option<JsValue>,
    y: Option<JsValue>,
    color: Option<JsValue>,
    tolerance: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    // 获取第一个参数 (图像Mat)
    let js_img_mat = js_img_mat
        .unwrap_or_else(|| JsValue::undefined())
        .get_native::<JsMat>()?;

    let x = x.unwrap_or_else(|| JsValue::undefined()).to_number(ctx)? as i32;
    let y = y.unwrap_or_else(|| JsValue::undefined()).to_number(ctx)? as i32;
    let color = color
        .unwrap_or_else(|| JsValue::undefined())
        .to_number(ctx)? as u32;
    let tolerance = tolerance
        .unwrap_or_else(|| JsValue::undefined())
        .to_number(ctx)? as u8;

    Ok(JsValue::new(check_color_mat(
        &js_img_mat.borrow().data().inner,
        x,
        y,
        color,
        tolerance,
    )))
}

/// 边框绘制函数
fn _draw_border(
    hwnd: Option<JsValue>,
    left: Option<JsValue>,
    top: Option<JsValue>,
    right: Option<JsValue>,
    bottom: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    let hwnd = HWND(
        hwnd.unwrap_or_else(|| JsValue::undefined())
            .to_number(ctx)? as isize as *mut std::ffi::c_void,
    );
    let left = left
        .unwrap_or_else(|| JsValue::undefined())
        .to_number(ctx)? as i32;
    let top = top.unwrap_or_else(|| JsValue::undefined()).to_number(ctx)? as i32;
    let right = right
        .unwrap_or_else(|| JsValue::undefined())
        .to_number(ctx)? as i32;
    let bottom = bottom
        .unwrap_or_else(|| JsValue::undefined())
        .to_number(ctx)? as i32;

    draw_border(hwnd, left, top, right, bottom, Some(0xFF0000));
    Ok(JsValue::undefined())
}

/// 延迟函数
fn _s(ms: Option<JsValue>, ctx: &mut Context) -> JsResult<JsValue> {
    let ms = ms.unwrap_or_else(|| JsValue::undefined()).to_number(ctx)? as u64;
    thread::sleep(Duration::from_millis(ms));
    Ok(JsValue::undefined())
}

/// 异步延迟函数
fn _sleep(ms: Option<JsValue>, ctx: &mut Context) -> JsResult<JsValue> {
    let ms = ms.unwrap_or_else(|| JsValue::undefined()).to_number(ctx)? as u64;
    let mut cb: Option<JsFunction> = None;
    let promise = JsPromise::new(
        |resolvers, _context| {
            cb = Some(resolvers.resolve.clone());

            Ok(JsValue::undefined())
        },
        ctx,
    );
    let job = boa_engine::job::TimeoutJob::new(
        boa_engine::job::NativeJob::new(move |context| {
            cb.unwrap()
                .call(&JsValue::undefined(), &[], context)
                .unwrap();
            Ok(JsValue::undefined())
        }),
        ms,
    );
    ctx.enqueue_job(job.into());
    Ok(promise.into())
}

/// 复制文本到剪贴板
fn _copy_text(text: Option<JsValue>, ctx: &mut Context) -> JsResult<JsValue> {
    let text = text
        .unwrap_or_else(|| JsValue::undefined())
        .to_string(ctx)?
        .to_std_string_lossy();

    // 使用 arboard 复制文本到剪贴板
    let mut clipboard = arboard::Clipboard::new().unwrap();
    let _ = clipboard.set_text(&text);

    Ok(JsValue::undefined())
}

/// 从剪贴板粘贴文本
fn _paste_text(_ctx: &mut Context) -> JsResult<JsValue> {
    // 使用 arboard 从剪贴板读取文本
    let mut clipboard = arboard::Clipboard::new().unwrap();
    match clipboard.get_text() {
        Ok(text) => Ok(JsValue::from(js_string!(text))),
        Err(_) => Ok(JsValue::undefined()),
    }
}

/// 根据窗口标题查找窗口句柄函数
fn _find_window(title: Option<JsValue>, ctx: &mut Context) -> JsResult<JsValue> {
    let title = title
        .unwrap_or_else(|| JsValue::undefined())
        .to_string(ctx)?
        .to_std_string_lossy();
    match find_window(&title) {
        Some(hwnd) => Ok(JsValue::new(hwnd.0 as u64 as f64)),
        None => Ok(JsValue::new(0 as u64 as f64)),
    }
}

/// 获取窗口句柄函数
fn _get_window_by_process_name(
    process_name: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    let process_name = process_name
        .unwrap_or_else(|| JsValue::undefined())
        .to_string(ctx)?
        .to_std_string_lossy();
    match get_window_by_process_name(&process_name) {
        Some(hwnd) => Ok(JsValue::new(hwnd.0 as u64 as f64)),
        None => Ok(JsValue::new(0 as u64 as f64)),
    }
}

/// 获取前台窗口函数
fn _get_foreground_window(_ctx: &mut Context) -> JsResult<JsValue> {
    let hwnd = unsafe { GetForegroundWindow() };
    Ok(JsValue::new(hwnd.0 as u64 as f64))
}

fn _set_program_volume(
    program_name: Option<JsValue>,
    volume: Option<JsValue>,
    ctx: &mut Context,
) -> JsResult<JsValue> {
    let program_name = program_name
        .unwrap_or_else(|| JsValue::undefined())
        .to_string(ctx)?
        .to_std_string_lossy();
    let volume = volume
        .unwrap_or_else(|| JsValue::undefined())
        .to_number(ctx)? as f32;
    super::setvol::set_program_volume(program_name, volume);
    Ok(JsValue::undefined())
}

// 注册到JS环境中的函数集合
pub fn register_builtin_functions(context: &mut Context) -> JsResult<()> {
    // AHK: WinGetClientPos
    let f = _win_get_client_pos.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("winGetClientPos"), 1, f)?;
    // 鼠标操作函数
    let f = _mc.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("mc"), 3, f)?;

    let f = _mm.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("mm"), 2, f)?;

    let f = _move_to.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("moveTo"), 4, f)?;

    let f = _md.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("md"), 3, f)?;

    let f = _mu.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("mu"), 3, f)?;

    let f = _mt.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("mt"), 3, f)?;

    // 键盘操作函数
    let f = _kb.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("kb"), 3, f)?;

    let f = _kd.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("kd"), 2, f)?;

    let f = _ku.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("ku"), 2, f)?;

    // 延迟函数
    let f = _s.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("s"), 1, f)?;

    // 异步延迟函数
    let f = _sleep.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("sleep"), 1, f)?;

    // 剪贴板操作函数
    let f = _copy_text.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("copyText"), 1, f)?;

    let f = _paste_text.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("pasteText"), 0, f)?;

    // 获取窗口句柄函数
    let f = _find_window.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("findWindow"), 1, f)?;

    let f = _get_window_by_process_name.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("getWindowByProcessName"), 1, f)?;

    // 设置前景窗口
    let f = _set_foreground_window.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("setForegroundWindow"), 1, f)?;

    // 检查窗口大小
    let f = _check_size.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("checkSize"), 1, f)?;

    // 移动窗口并设置大小
    let f = _move_window.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("moveWindow"), 5, f)?;

    // 获取前台窗口
    let f = _get_foreground_window.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("getForegroundWindow"), 0, f)?;

    // 从窗口获取图像Mat对象
    let f = _capture_window.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("captureWindow"), 1, f)?;

    // 从窗口获取图像Mat对象（WGC优化版）
    let f = _capture_window_wgc.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("captureWindowWGC"), 1, f)?;

    // 从文件加载模板Mat对象
    let f = _get_template.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("getTemplate"), 1, f)?;

    // 从 base64 字符串加载模板Mat对象
    let f = _get_template_b64.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("getTemplateB64"), 1, f)?;

    // 从文件加载模板Mat对象
    let f = _imread.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("imread"), 1, f)?;

    // 保存Mat对象到文件
    let f = _imwrite.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("imwrite"), 2, f)?;

    // 复制Mat对象到剪贴板
    let f = _copy_image.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("copyImage"), 1, f)?;

    // 从本地或网络加载图像Mat对象
    let f = _imread_url.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("imreadUrl"), 2, f)?;

    // 显示图片
    let f = _imshow.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("imshow"), 3, f)?;

    // 使用两个Mat对象进行颜色和模板匹配
    let f = _find_color_and_match_template.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("findColorAndMatchTemplate"), 4, f)?;

    // 模板匹配函数
    let f = _match_template.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("matchTemplate"), 3, f)?;

    // 边框绘制函数
    let f = _draw_border.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("drawBorder"), 5, f)?;

    // 颜色矩阵检查函数
    let f = _cc.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("cc"), 5, f)?;

    // 设置程序音量函数
    let f = _set_program_volume.into_js_function_copied(context);
    context.register_global_builtin_callable(js_string!("setProgramVolume"), 2, f)?;

    Ok(())
}
