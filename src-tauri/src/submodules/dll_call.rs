use boa_engine::object::JsObject;
use boa_engine::{Context, JsNativeError, JsResult, JsValue, js_string};

#[cfg(target_os = "windows")]
mod platform {
    use super::*;
    use libffi::high::CodePtr;
    use libffi::middle::{Arg, Cif, Ret, Type, arg};
    use std::ffi::{CStr, CString, c_char};
    use std::os::windows::ffi::OsStrExt;
    use windows::Win32::Foundation::{FreeLibrary, HMODULE};
    use windows::Win32::System::LibraryLoader::{GetModuleHandleW, GetProcAddress, LoadLibraryW};
    use windows::core::{PCSTR, PCWSTR};

    /// 标准模块列表（与 AHK DllCall 的默认搜索思路一致）。
    const STD_DLLS: [&str; 4] = ["user32.dll", "kernel32.dll", "comctl32.dll", "gdi32.dll"];

    /// AHK DllCall 支持的参数基础类型（本实现使用 libffi 动态调用）。
    #[derive(Clone, Copy, Debug)]
    enum DllBaseType {
        Int,
        Int64,
        Short,
        Char,
        Ptr,
        Float,
        Double,
        Str,
        AStr,
        WStr,
        Void,
    }

    /// 参数/返回类型描述。
    #[derive(Clone, Copy, Debug)]
    struct DllTypeDesc {
        base: DllBaseType,
        is_unsigned: bool,
        passed_by_address: bool,
    }

    /// 返回类型扩展描述（支持 CDecl/HRESULT 前缀）。
    #[derive(Clone, Copy, Debug)]
    struct ReturnTypeDesc {
        value_type: DllTypeDesc,
        is_cdecl: bool,
        is_hresult: bool,
    }

    /// 函数地址来源。
    #[derive(Clone, Debug)]
    enum FunctionTarget {
        Address(usize),
        Name(String),
    }

    /// 参数内存持有与写回信息。
    ///
    /// 说明：
    /// 1. `libffi::Arg` 只持有借用，所以这里必须保证底层内存在调用期间稳定存在；
    /// 2. 对于 `Type*` 参数，若传入对象 `{ value: ... }`，调用后会把结果写回 `value` 字段。
    #[derive(Debug)]
    enum PreparedValue {
        I8(i8),
        U8(u8),
        I16(i16),
        U16(u16),
        I32(i32),
        U32(u32),
        I64(i64),
        U64(u64),
        F32(f32),
        F64(f64),
        Ptr(usize),
        ByRefI8 {
            cell: Box<i8>,
            ptr: usize,
            target: Option<JsObject>,
            is_unsigned: bool,
        },
        ByRefU8 {
            cell: Box<u8>,
            ptr: usize,
            target: Option<JsObject>,
        },
        ByRefI16 {
            cell: Box<i16>,
            ptr: usize,
            target: Option<JsObject>,
            is_unsigned: bool,
        },
        ByRefU16 {
            cell: Box<u16>,
            ptr: usize,
            target: Option<JsObject>,
        },
        ByRefI32 {
            cell: Box<i32>,
            ptr: usize,
            target: Option<JsObject>,
            is_unsigned: bool,
        },
        ByRefU32 {
            cell: Box<u32>,
            ptr: usize,
            target: Option<JsObject>,
        },
        ByRefI64 {
            cell: Box<i64>,
            ptr: usize,
            target: Option<JsObject>,
            is_unsigned: bool,
        },
        ByRefU64 {
            cell: Box<u64>,
            ptr: usize,
            target: Option<JsObject>,
        },
        ByRefUsize {
            cell: Box<usize>,
            ptr: usize,
            target: Option<JsObject>,
        },
        ByRefF32 {
            cell: Box<f32>,
            ptr: usize,
            target: Option<JsObject>,
        },
        ByRefF64 {
            cell: Box<f64>,
            ptr: usize,
            target: Option<JsObject>,
        },
    }

    impl PreparedValue {
        /// 生成传给 libffi 的参数借用。
        fn as_ffi_arg(&self) -> Arg<'_> {
            match self {
                PreparedValue::I8(v) => arg(v),
                PreparedValue::U8(v) => arg(v),
                PreparedValue::I16(v) => arg(v),
                PreparedValue::U16(v) => arg(v),
                PreparedValue::I32(v) => arg(v),
                PreparedValue::U32(v) => arg(v),
                PreparedValue::I64(v) => arg(v),
                PreparedValue::U64(v) => arg(v),
                PreparedValue::F32(v) => arg(v),
                PreparedValue::F64(v) => arg(v),
                PreparedValue::Ptr(v) => arg(v),
                PreparedValue::ByRefI8 { ptr, .. }
                | PreparedValue::ByRefU8 { ptr, .. }
                | PreparedValue::ByRefI16 { ptr, .. }
                | PreparedValue::ByRefU16 { ptr, .. }
                | PreparedValue::ByRefI32 { ptr, .. }
                | PreparedValue::ByRefU32 { ptr, .. }
                | PreparedValue::ByRefI64 { ptr, .. }
                | PreparedValue::ByRefU64 { ptr, .. }
                | PreparedValue::ByRefUsize { ptr, .. }
                | PreparedValue::ByRefF32 { ptr, .. }
                | PreparedValue::ByRefF64 { ptr, .. } => arg(ptr),
            }
        }

        /// 将 `Type*` 输出写回到 `{ value: ... }` 对象。
        fn write_back(&self, ctx: &mut Context) -> JsResult<()> {
            let (target, value) = match self {
                PreparedValue::ByRefI8 {
                    cell,
                    target,
                    is_unsigned,
                    ..
                } => {
                    if *is_unsigned {
                        (target, JsValue::new(**cell as u8 as f64))
                    } else {
                        (target, JsValue::new(**cell as f64))
                    }
                }
                PreparedValue::ByRefU8 { cell, target, .. } => (target, JsValue::new(**cell as f64)),
                PreparedValue::ByRefI16 {
                    cell,
                    target,
                    is_unsigned,
                    ..
                } => {
                    if *is_unsigned {
                        (target, JsValue::new(**cell as u16 as f64))
                    } else {
                        (target, JsValue::new(**cell as f64))
                    }
                }
                PreparedValue::ByRefU16 { cell, target, .. } => (target, JsValue::new(**cell as f64)),
                PreparedValue::ByRefI32 {
                    cell,
                    target,
                    is_unsigned,
                    ..
                } => {
                    if *is_unsigned {
                        (target, JsValue::new(**cell as u32 as f64))
                    } else {
                        (target, JsValue::new(**cell as f64))
                    }
                }
                PreparedValue::ByRefU32 { cell, target, .. } => (target, JsValue::new(**cell as f64)),
                PreparedValue::ByRefI64 {
                    cell,
                    target,
                    is_unsigned,
                    ..
                } => {
                    if *is_unsigned {
                        (target, JsValue::new(**cell as u64 as f64))
                    } else {
                        (target, JsValue::new(**cell as f64))
                    }
                }
                PreparedValue::ByRefU64 { cell, target, .. } => (target, JsValue::new(**cell as f64)),
                PreparedValue::ByRefUsize { cell, target, .. } => (target, JsValue::new(**cell as u64 as f64)),
                PreparedValue::ByRefF32 { cell, target, .. } => (target, JsValue::new(**cell as f64)),
                PreparedValue::ByRefF64 { cell, target, .. } => (target, JsValue::new(**cell)),
                _ => return Ok(()),
            };

            if let Some(obj) = target {
                obj.set(js_string!("value"), value, true, ctx)?;
            }
            Ok(())
        }
    }

    /// 一次调用期间的可变参数内存池。
    #[derive(Default)]
    struct ArgBuildContext {
        ansi_pool: Vec<CString>,
        wide_pool: Vec<Vec<u16>>,
    }

    /// 动态加载模块的自动释放守卫。
    struct ModuleFreeGuard(Option<HMODULE>);

    impl Drop for ModuleFreeGuard {
        fn drop(&mut self) {
            if let Some(module) = self.0.take() {
                // SAFETY: 仅释放本次调用通过 LoadLibraryW 临时加载的模块句柄。
                unsafe {
                    let _ = FreeLibrary(module);
                }
            }
        }
    }

    /// 将普通字符串转为 Windows 宽字符串（末尾 NUL）。
    fn _to_wide_nul(text: &str) -> Vec<u16> {
        let mut wide = std::ffi::OsStr::new(text).encode_wide().collect::<Vec<u16>>();
        wide.push(0);
        wide
    }

    /// 解析 AHK 风格类型字符串。
    ///
    /// 语义参考：
    /// - `U` 前缀表示无符号；
    /// - `*` 或后缀 `P`/`p` 表示按地址传参（`Type*`）。
    fn _parse_dll_type(type_text: &str) -> Result<DllTypeDesc, String> {
        let mut raw = type_text.trim().to_string();
        if raw.is_empty() {
            return Err("类型字符串不能为空".to_string());
        }

        let mut is_unsigned = false;
        if raw.starts_with('U') || raw.starts_with('u') {
            is_unsigned = true;
            raw = raw[1..].trim().to_string();
        }

        let mut passed_by_address = false;
        let mut trunc = raw.len();
        for (index, ch) in raw.char_indices().skip(1) {
            if ch == '*' || ch == 'P' || ch == 'p' {
                passed_by_address = true;
                trunc = index;
                break;
            }
        }
        raw = raw[..trunc].trim().to_string();
        if raw.is_empty() {
            return Err(format!("无效类型: {type_text}"));
        }

        let base = match raw.to_ascii_lowercase().as_str() {
            "int" => DllBaseType::Int,
            "int64" => DllBaseType::Int64,
            "short" => DllBaseType::Short,
            "char" => DllBaseType::Char,
            "ptr" => DllBaseType::Ptr,
            "float" => DllBaseType::Float,
            "double" => DllBaseType::Double,
            "str" => DllBaseType::Str,
            "astr" => DllBaseType::AStr,
            "wstr" => DllBaseType::WStr,
            "void" => DllBaseType::Void,
            _ => return Err(format!("不支持的类型: {type_text}")),
        };

        if matches!(base, DllBaseType::Str | DllBaseType::AStr | DllBaseType::WStr) && is_unsigned {
            return Err(format!("字符串类型不支持无符号前缀: {type_text}"));
        }
        if matches!(base, DllBaseType::Void) && passed_by_address {
            return Err(format!("Void 不支持按地址传递: {type_text}"));
        }

        Ok(DllTypeDesc {
            base,
            is_unsigned,
            passed_by_address,
        })
    }

    /// 解析返回类型（支持 `CDecl`/`HRESULT`）。
    fn _parse_return_type(tail: Option<&JsValue>, ctx: &mut Context) -> Result<ReturnTypeDesc, String> {
        let default_return = ReturnTypeDesc {
            value_type: DllTypeDesc {
                base: DllBaseType::Int,
                is_unsigned: false,
                passed_by_address: false,
            },
            is_cdecl: false,
            is_hresult: false,
        };
        let Some(value) = tail else {
            return Ok(default_return);
        };

        let mut raw = value
            .to_string(ctx)
            .map_err(|_| "返回类型必须是字符串".to_string())?
            .to_std_string_lossy()
            .trim()
            .to_string();
        if raw.is_empty() {
            return Ok(default_return);
        }

        let mut is_cdecl = false;
        if raw.len() >= 5 && raw[..5].eq_ignore_ascii_case("cdecl") {
            is_cdecl = true;
            raw = raw[5..].trim().to_string();
            if raw.is_empty() {
                return Ok(ReturnTypeDesc {
                    value_type: default_return.value_type,
                    is_cdecl,
                    is_hresult: false,
                });
            }
        }

        if raw.eq_ignore_ascii_case("hresult") {
            return Ok(ReturnTypeDesc {
                value_type: default_return.value_type,
                is_cdecl,
                is_hresult: true,
            });
        }

        let parsed = _parse_dll_type(&raw)?;
        if parsed.passed_by_address {
            return Err("返回类型不支持 * / P 后缀".to_string());
        }

        Ok(ReturnTypeDesc {
            value_type: parsed,
            is_cdecl,
            is_hresult: false,
        })
    }

    /// 解析函数参数（地址、字符串、或带 Ptr 属性的对象）。
    fn _parse_function_target(value: &JsValue, ctx: &mut Context) -> Result<FunctionTarget, String> {
        if let Some(number) = value.as_number() {
            let ptr = number as i64 as isize as usize;
            if ptr == 0 {
                return Err("函数地址不能为 0".to_string());
            }
            return Ok(FunctionTarget::Address(ptr));
        }

        if let Some(obj) = value.as_object() {
            let ptr_value = obj
                .get(js_string!("Ptr"), ctx)
                .map_err(|e| format!("读取对象 Ptr 属性失败: {e}"))?;
            if !ptr_value.is_undefined() && !ptr_value.is_null() {
                let ptr = ptr_value
                    .to_number(ctx)
                    .map_err(|_| "对象 Ptr 属性必须是数字".to_string())?
                    as i64 as isize as usize;
                if ptr == 0 {
                    return Err("对象 Ptr 属性不能为 0".to_string());
                }
                return Ok(FunctionTarget::Address(ptr));
            }
        }

        let name = value
            .to_string(ctx)
            .map_err(|_| "第一个参数必须是函数地址或函数名字符串".to_string())?
            .to_std_string_lossy()
            .trim()
            .to_string();
        if name.is_empty() {
            return Err("函数名不能为空".to_string());
        }
        Ok(FunctionTarget::Name(name))
    }

    /// 获取导出地址（支持自动追加 W 后缀）。
    fn _get_proc_address(module: HMODULE, function_name: &str) -> Result<Option<usize>, String> {
        let symbol = CString::new(function_name).map_err(|e| format!("函数名无效: {function_name}, {e}"))?;
        // SAFETY: module 句柄由系统 API 获取；symbol 为 NUL 终止字符串。
        let proc = unsafe { GetProcAddress(module, PCSTR(symbol.as_ptr() as *const u8)) };
        if let Some(p) = proc {
            return Ok(Some(p as *const () as usize));
        }

        if !function_name.ends_with('W') && !function_name.ends_with('A') {
            let with_w = format!("{function_name}W");
            let symbol_w = CString::new(with_w.clone()).map_err(|e| format!("函数名无效: {with_w}, {e}"))?;
            // SAFETY: 同上。
            let proc_w = unsafe { GetProcAddress(module, PCSTR(symbol_w.as_ptr() as *const u8)) };
            if let Some(p) = proc_w {
                return Ok(Some(p as *const () as usize));
            }
        }

        Ok(None)
    }

    /// 解析函数地址（参考 AHK `GetDllProcAddress` 行为）。
    fn _resolve_proc_address(name: &str) -> Result<(usize, Option<HMODULE>), String> {
        if let Some((dll_name, function_name)) = name.rsplit_once('\\') {
            if dll_name.trim().is_empty() || function_name.trim().is_empty() {
                return Err(format!("无效函数标识: {name}"));
            }

            let dll_name = dll_name.trim();
            let function_name = function_name.trim();
            let mut loaded_for_this_call = None;

            let module = {
                let wide = _to_wide_nul(dll_name);
                // SAFETY: PCWSTR 来自本地缓冲区，生命周期覆盖本调用。
                if let Ok(module) = unsafe { GetModuleHandleW(PCWSTR(wide.as_ptr())) } {
                    module
                } else {
                    // SAFETY: 路径字符串有效；失败会返回错误。
                    let module = unsafe { LoadLibraryW(PCWSTR(wide.as_ptr())) }
                        .map_err(|e| format!("加载 DLL 失败: {dll_name}, {e}"))?;
                    loaded_for_this_call = Some(module);
                    module
                }
            };

            if let Some(addr) = _get_proc_address(module, function_name)? {
                return Ok((addr, loaded_for_this_call));
            }

            if let Some(module) = loaded_for_this_call {
                // SAFETY: 仅释放当前函数临时加载的模块。
                unsafe {
                    let _ = FreeLibrary(module);
                }
            }
            return Err(format!("找不到导出函数: {name}"));
        }

        for dll in STD_DLLS {
            let wide = _to_wide_nul(dll);
            // SAFETY: PCWSTR 来自本地缓冲区。
            if let Ok(module) = unsafe { GetModuleHandleW(PCWSTR(wide.as_ptr())) }
                && let Some(addr) = _get_proc_address(module, name)?
            {
                return Ok((addr, None));
            }
        }

        Err(format!("找不到导出函数: {name}"))
    }

    /// 读取对象初始化值：对象时优先取 `value` 字段，否则使用参数本身。
    fn _extract_byref_initial(value: &JsValue, ctx: &mut Context) -> Result<(Option<JsObject>, JsValue), String> {
        if let Some(obj) = value.as_object() {
            let initial = obj
                .get(js_string!("value"), ctx)
                .map_err(|e| format!("读取 byref 对象 value 失败: {e}"))?;
            let initial = if initial.is_undefined() || initial.is_null() {
                JsValue::new(0)
            } else {
                initial
            };
            return Ok((Some(obj.clone()), initial));
        }
        Ok((None, value.clone()))
    }

    /// JS 值转 i64。
    fn _to_i64(value: &JsValue, ctx: &mut Context) -> Result<i64, String> {
        let number = value
            .to_number(ctx)
            .map_err(|_| "参数必须是数字".to_string())?;
        if !number.is_finite() {
            return Err("参数必须是有限数字".to_string());
        }
        Ok(number as i64)
    }

    /// JS 值转 f64。
    fn _to_f64(value: &JsValue, ctx: &mut Context) -> Result<f64, String> {
        let number = value
            .to_number(ctx)
            .map_err(|_| "参数必须是数字".to_string())?;
        if !number.is_finite() {
            return Err("参数必须是有限数字".to_string());
        }
        Ok(number)
    }

    /// JS 值转字符串。
    fn _to_string(value: &JsValue, ctx: &mut Context) -> Result<String, String> {
        value
            .to_string(ctx)
            .map_err(|_| "参数必须是字符串".to_string())
            .map(|s| s.to_std_string_lossy())
    }

    /// AHK 类型映射到 libffi 类型。
    fn _ffi_type(type_desc: DllTypeDesc) -> Type {
        if type_desc.passed_by_address {
            return Type::pointer();
        }

        match type_desc.base {
            DllBaseType::Int => {
                if type_desc.is_unsigned {
                    Type::u32()
                } else {
                    Type::i32()
                }
            }
            DllBaseType::Int64 => {
                if type_desc.is_unsigned {
                    Type::u64()
                } else {
                    Type::i64()
                }
            }
            DllBaseType::Short => {
                if type_desc.is_unsigned {
                    Type::u16()
                } else {
                    Type::i16()
                }
            }
            DllBaseType::Char => {
                if type_desc.is_unsigned {
                    Type::u8()
                } else {
                    Type::i8()
                }
            }
            DllBaseType::Ptr | DllBaseType::Str | DllBaseType::AStr | DllBaseType::WStr => {
                Type::pointer()
            }
            DllBaseType::Float => Type::f32(),
            DllBaseType::Double => Type::f64(),
            DllBaseType::Void => Type::void(),
        }
    }

    /// 构建单个参数内存。
    fn _prepare_argument(
        type_desc: DllTypeDesc,
        value: &JsValue,
        ctx: &mut Context,
        pools: &mut ArgBuildContext,
    ) -> Result<PreparedValue, String> {
        if type_desc.passed_by_address {
            if matches!(
                type_desc.base,
                DllBaseType::Str | DllBaseType::AStr | DllBaseType::WStr | DllBaseType::Void
            ) {
                return Err("暂不支持 Str*/AStr*/WStr*/Void* 参数".to_string());
            }

            let (target, initial) = _extract_byref_initial(value, ctx)?;
            return match type_desc.base {
                DllBaseType::Int => {
                    if type_desc.is_unsigned {
                        let mut cell = Box::new(_to_i64(&initial, ctx)? as u32);
                        let ptr = (&mut *cell as *mut u32) as usize;
                        Ok(PreparedValue::ByRefU32 { cell, ptr, target })
                    } else {
                        let mut cell = Box::new(_to_i64(&initial, ctx)? as i32);
                        let ptr = (&mut *cell as *mut i32) as usize;
                        Ok(PreparedValue::ByRefI32 {
                            cell,
                            ptr,
                            target,
                            is_unsigned: false,
                        })
                    }
                }
                DllBaseType::Int64 => {
                    if type_desc.is_unsigned {
                        let mut cell = Box::new(_to_i64(&initial, ctx)? as u64);
                        let ptr = (&mut *cell as *mut u64) as usize;
                        Ok(PreparedValue::ByRefU64 { cell, ptr, target })
                    } else {
                        let mut cell = Box::new(_to_i64(&initial, ctx)? as i64);
                        let ptr = (&mut *cell as *mut i64) as usize;
                        Ok(PreparedValue::ByRefI64 {
                            cell,
                            ptr,
                            target,
                            is_unsigned: false,
                        })
                    }
                }
                DllBaseType::Short => {
                    if type_desc.is_unsigned {
                        let mut cell = Box::new(_to_i64(&initial, ctx)? as u16);
                        let ptr = (&mut *cell as *mut u16) as usize;
                        Ok(PreparedValue::ByRefU16 { cell, ptr, target })
                    } else {
                        let mut cell = Box::new(_to_i64(&initial, ctx)? as i16);
                        let ptr = (&mut *cell as *mut i16) as usize;
                        Ok(PreparedValue::ByRefI16 {
                            cell,
                            ptr,
                            target,
                            is_unsigned: false,
                        })
                    }
                }
                DllBaseType::Char => {
                    if type_desc.is_unsigned {
                        let mut cell = Box::new(_to_i64(&initial, ctx)? as u8);
                        let ptr = (&mut *cell as *mut u8) as usize;
                        Ok(PreparedValue::ByRefU8 { cell, ptr, target })
                    } else {
                        let mut cell = Box::new(_to_i64(&initial, ctx)? as i8);
                        let ptr = (&mut *cell as *mut i8) as usize;
                        Ok(PreparedValue::ByRefI8 {
                            cell,
                            ptr,
                            target,
                            is_unsigned: false,
                        })
                    }
                }
                DllBaseType::Ptr => {
                    let mut cell = Box::new(_to_i64(&initial, ctx)? as isize as usize);
                    let ptr = (&mut *cell as *mut usize) as usize;
                    Ok(PreparedValue::ByRefUsize { cell, ptr, target })
                }
                DllBaseType::Float => {
                    let mut cell = Box::new(_to_f64(&initial, ctx)? as f32);
                    let ptr = (&mut *cell as *mut f32) as usize;
                    Ok(PreparedValue::ByRefF32 { cell, ptr, target })
                }
                DllBaseType::Double => {
                    let mut cell = Box::new(_to_f64(&initial, ctx)?);
                    let ptr = (&mut *cell as *mut f64) as usize;
                    Ok(PreparedValue::ByRefF64 { cell, ptr, target })
                }
                DllBaseType::Str | DllBaseType::AStr | DllBaseType::WStr | DllBaseType::Void => {
                    Err("不支持的 byref 参数类型".to_string())
                }
            };
        }

        match type_desc.base {
            DllBaseType::Int => {
                if type_desc.is_unsigned {
                    Ok(PreparedValue::U32(_to_i64(value, ctx)? as u32))
                } else {
                    Ok(PreparedValue::I32(_to_i64(value, ctx)? as i32))
                }
            }
            DllBaseType::Int64 => {
                if type_desc.is_unsigned {
                    Ok(PreparedValue::U64(_to_i64(value, ctx)? as u64))
                } else {
                    Ok(PreparedValue::I64(_to_i64(value, ctx)?))
                }
            }
            DllBaseType::Short => {
                if type_desc.is_unsigned {
                    Ok(PreparedValue::U16(_to_i64(value, ctx)? as u16))
                } else {
                    Ok(PreparedValue::I16(_to_i64(value, ctx)? as i16))
                }
            }
            DllBaseType::Char => {
                if type_desc.is_unsigned {
                    Ok(PreparedValue::U8(_to_i64(value, ctx)? as u8))
                } else {
                    Ok(PreparedValue::I8(_to_i64(value, ctx)? as i8))
                }
            }
            DllBaseType::Ptr => Ok(PreparedValue::Ptr(_to_i64(value, ctx)? as isize as usize)),
            DllBaseType::Float => Ok(PreparedValue::F32(_to_f64(value, ctx)? as f32)),
            DllBaseType::Double => Ok(PreparedValue::F64(_to_f64(value, ctx)?)),
            DllBaseType::Str | DllBaseType::WStr => {
                let text = _to_string(value, ctx)?;
                let mut wide = text.encode_utf16().collect::<Vec<u16>>();
                wide.push(0);
                let ptr = wide.as_ptr() as usize;
                pools.wide_pool.push(wide);
                Ok(PreparedValue::Ptr(ptr))
            }
            DllBaseType::AStr => {
                let text = _to_string(value, ctx)?;
                let cstr = CString::new(text).map_err(|e| format!("AStr 包含非法 NUL 字符: {e}"))?;
                let ptr = cstr.as_ptr() as usize;
                pools.ansi_pool.push(cstr);
                Ok(PreparedValue::Ptr(ptr))
            }
            DllBaseType::Void => Err("Void 不能作为参数类型".to_string()),
        }
    }

    /// 读取 NUL 结尾 UTF-16 字符串。
    unsafe fn _read_wide_string(ptr: *const u16) -> String {
        if ptr.is_null() {
            return String::new();
        }
        let mut length = 0usize;
        while length < 1024 * 1024 {
            // SAFETY: 由调用方保证指针来自有效 API 返回；设置上限避免无限扫描。
            let ch = unsafe { *ptr.add(length) };
            if ch == 0 {
                break;
            }
            length += 1;
        }
        // SAFETY: 上面已找到长度范围。
        let slice = unsafe { std::slice::from_raw_parts(ptr, length) };
        String::from_utf16_lossy(slice)
    }

    /// 读取 NUL 结尾 ANSI 字符串。
    unsafe fn _read_ansi_string(ptr: *const c_char) -> String {
        if ptr.is_null() {
            return String::new();
        }
        // SAFETY: 由调用方保证指针有效且 NUL 结尾。
        unsafe { CStr::from_ptr(ptr) }
            .to_string_lossy()
            .to_string()
    }

    /// 将调用结果转换为 JS 值。
    fn _convert_return_value(
        cif: &Cif,
        proc_addr: usize,
        args: &[Arg],
        return_desc: ReturnTypeDesc,
    ) -> Result<JsValue, String> {
        let code_ptr = CodePtr(proc_addr as *mut _);

        if matches!(return_desc.value_type.base, DllBaseType::Void) {
            // SAFETY: CIF/参数由本函数构建，void 返回时输出缓冲可为空。
            unsafe {
                cif.call_return_into(code_ptr, args, Ret::void());
            }
            return Ok(JsValue::undefined());
        }

        let result = match return_desc.value_type.base {
            DllBaseType::Int => {
                if return_desc.value_type.is_unsigned {
                    // SAFETY: 调用约定由 CIF 描述。
                    let value: u32 = unsafe { cif.call(code_ptr, args) };
                    JsValue::new(value as f64)
                } else {
                    let value: i32 = unsafe { cif.call(code_ptr, args) };
                    if return_desc.is_hresult && value < 0 {
                        return Err(format!("HRESULT 调用失败: 0x{:08X}", value as u32));
                    }
                    JsValue::new(value as f64)
                }
            }
            DllBaseType::Int64 => {
                if return_desc.value_type.is_unsigned {
                    let value: u64 = unsafe { cif.call(code_ptr, args) };
                    JsValue::new(value as f64)
                } else {
                    let value: i64 = unsafe { cif.call(code_ptr, args) };
                    JsValue::new(value as f64)
                }
            }
            DllBaseType::Short => {
                if return_desc.value_type.is_unsigned {
                    let value: u16 = unsafe { cif.call(code_ptr, args) };
                    JsValue::new(value as f64)
                } else {
                    let value: i16 = unsafe { cif.call(code_ptr, args) };
                    JsValue::new(value as f64)
                }
            }
            DllBaseType::Char => {
                if return_desc.value_type.is_unsigned {
                    let value: u8 = unsafe { cif.call(code_ptr, args) };
                    JsValue::new(value as f64)
                } else {
                    let value: i8 = unsafe { cif.call(code_ptr, args) };
                    JsValue::new(value as f64)
                }
            }
            DllBaseType::Ptr => {
                let value: usize = unsafe { cif.call(code_ptr, args) };
                JsValue::new(value as u64 as f64)
            }
            DllBaseType::Float => {
                let value: f32 = unsafe { cif.call(code_ptr, args) };
                JsValue::new(value as f64)
            }
            DllBaseType::Double => {
                let value: f64 = unsafe { cif.call(code_ptr, args) };
                JsValue::new(value)
            }
            DllBaseType::Str | DllBaseType::WStr => {
                let value: usize = unsafe { cif.call(code_ptr, args) };
                // SAFETY: 指针由 DLL 返回，按 UTF-16 NUL 结尾字符串读取。
                let text = unsafe { _read_wide_string(value as *const u16) };
                JsValue::from(js_string!(text))
            }
            DllBaseType::AStr => {
                let value: usize = unsafe { cif.call(code_ptr, args) };
                // SAFETY: 指针由 DLL 返回，按 ANSI NUL 结尾字符串读取。
                let text = unsafe { _read_ansi_string(value as *const c_char) };
                JsValue::from(js_string!(text))
            }
            DllBaseType::Void => JsValue::undefined(),
        };

        Ok(result)
    }

    /// JS 层可变参数 `dllCall` 实现。
    ///
    /// 兼容 AHK 风格参数布局：
    /// `dllCall(func, type1, value1, type2, value2, ..., returnType?)`
    pub fn dll_call_js(_this: &JsValue, args: &[JsValue], ctx: &mut Context) -> JsResult<JsValue> {
        if args.is_empty() {
            return Err(JsNativeError::typ()
                .with_message("dllCall 至少需要 1 个参数（函数名或函数地址）")
                .into());
        }

        let function_target = _parse_function_target(&args[0], ctx)
            .map_err(|msg| JsNativeError::typ().with_message(msg))?;

        let tail = &args[1..];
        let (arg_tail, return_tail) = if tail.len() % 2 == 0 {
            (tail, None)
        } else {
            (&tail[..tail.len() - 1], tail.last())
        };

        let return_desc = _parse_return_type(return_tail, ctx)
            .map_err(|msg| JsNativeError::typ().with_message(msg))?;

        let mut arg_types = Vec::<Type>::with_capacity(arg_tail.len() / 2);
        let mut prepared = Vec::<PreparedValue>::with_capacity(arg_tail.len() / 2);
        let mut pools = ArgBuildContext::default();

        for index in (0..arg_tail.len()).step_by(2) {
            let type_text = arg_tail[index]
                .to_string(ctx)
                .map_err(|_| {
                    JsNativeError::typ().with_message(format!("dllCall 参数类型[{index}] 必须是字符串"))
                })?
                .to_std_string_lossy();
            let type_desc = _parse_dll_type(&type_text)
                .map_err(|msg| JsNativeError::typ().with_message(format!("参数类型[{index}] 无效: {msg}")))?;

            let value = _prepare_argument(type_desc, &arg_tail[index + 1], ctx, &mut pools)
                .map_err(|msg| JsNativeError::typ().with_message(format!("参数值[{}] 无效: {msg}", index + 1)))?;

            arg_types.push(_ffi_type(type_desc));
            prepared.push(value);
        }

        // 64 位下 CDecl 与默认 ABI 等价；保留解析以兼容 AHK 写法。
        let _cdecl = return_desc.is_cdecl;
        let cif = Cif::new(arg_types, _ffi_type(return_desc.value_type));
        let ffi_args = prepared
            .iter()
            .map(PreparedValue::as_ffi_arg)
            .collect::<Vec<_>>();

        let (proc_addr, module_to_free) = match function_target {
            FunctionTarget::Address(addr) => (addr, None),
            FunctionTarget::Name(name) => _resolve_proc_address(&name)
                .map_err(|msg| JsNativeError::error().with_message(msg))?,
        };
        let _module_guard = ModuleFreeGuard(module_to_free);

        let result = _convert_return_value(&cif, proc_addr, &ffi_args, return_desc)
            .map_err(|msg| JsNativeError::error().with_message(msg))?;

        for value in &prepared {
            value.write_back(ctx)?;
        }

        Ok(result)
    }
}

#[cfg(target_os = "windows")]
pub use platform::dll_call_js;

#[cfg(not(target_os = "windows"))]
pub fn dll_call_js(_this: &JsValue, _args: &[JsValue], _ctx: &mut Context) -> JsResult<JsValue> {
    Err(JsNativeError::error()
        .with_message("dllCall 目前仅支持 Windows 平台")
        .into())
}
