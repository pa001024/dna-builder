//! 远程桌面 ActiveX 宿主：AtlAxWin 子窗口、类型库驱动的属性写入、连接点事件槽与生命周期。
//!
//! 所有 COM 对象只在主线程创建/调用：宿主状态存放在主线程 thread-local 中，
//! 跨线程调用一律经 [`super::on_main_sync`] 投递。凭据只在写入 `ClearTextPassword`
//! 期间存在，不进入日志、设置或 Debug 输出。

use std::cell::RefCell;
use std::collections::HashMap;
use std::ffi::c_void;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, OnceLock};

use tauri::AppHandle;
use windows::Win32::Foundation::{
    E_NOINTERFACE, E_NOTIMPL, E_POINTER, HINSTANCE, HWND, S_OK, VARIANT_BOOL,
};
use windows::Win32::System::Com::{
    DISPATCH_METHOD, DISPATCH_PROPERTYGET, DISPATCH_PROPERTYPUT, DISPPARAMS, EXCEPINFO,
    IConnectionPoint, IConnectionPointContainer, IDispatch, INVOKE_FUNC, INVOKE_PROPERTYGET,
    INVOKE_PROPERTYPUT, SAFEARRAY, SAFEARRAYBOUND,
};
use windows::Win32::System::LibraryLoader::GetProcAddress;
use windows::Win32::System::Ole::{
    LoadTypeLib, OleInitialize, OleUninitialize, SafeArrayAccessData, SafeArrayCreate,
    SafeArrayDestroy, SafeArrayUnaccessData,
};
use windows::Win32::System::Variant::{VARENUM, VARIANT};
use windows::Win32::UI::Input::KeyboardAndMouse::SetFocus;
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DestroyWindow, GUITHREADINFO, GWL_STYLE, GetForegroundWindow,
    GetGUIThreadInfo, GetWindowLongPtrW, GetWindowThreadProcessId, HWND_TOP, IsChild, MoveWindow,
    SW_HIDE, SW_SHOW, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SetForegroundWindow,
    SetWindowLongPtrW, SetWindowPos, ShowWindow, WINDOW_EX_STYLE, WS_CHILD, WS_CLIPCHILDREN,
    WS_CLIPSIBLINGS, WS_VISIBLE,
};
use windows::core::{BSTR, GUID, HRESULT, IUnknown, Interface, PCWSTR};
use windows::core::{HSTRING, w};

use super::settings::{CloneOptions, KeyboardHook, MouseMode};
use super::viewer::HostRect;
use super::{RdpEvent, SecretString, on_main_sync};

/// `MsRdpClient9NotSafeForScripting` 的 CLSID。
const CONTROL_CLSID: &str = "{8B918B82-7985-4C24-89DF-C33AD2BBFBCD}";
/// ATL 宿主窗口类名：本机 ATL 3.05 注册的是 `AtlAxWin`，部分系统是 `AtlAxWin80`。
const ATL_CLASSES: [PCWSTR; 2] = [w!("AtlAxWin"), w!("AtlAxWin80")];

const IID_NULL: GUID = GUID::from_u128(0);
const IID_IUNKNOWN: GUID = GUID::from_u128(0x00000000_0000_0000_c000_000000000046);
const IID_IDISPATCH: GUID = GUID::from_u128(0x00020400_0000_0000_c000_000000000046);
const DISPID_PROPERTYPUT: i32 = -3;

const VT_I2: u16 = 2;
const VT_I4: u16 = 3;
const VT_BSTR: u16 = 8;
const VT_BOOL: u16 = 11;
const VT_INT: u16 = 22;
const VT_INT_PTR: u16 = 29;

const TKIND_INTERFACE: i32 = 3;

/// 宿主窗口是否已创建（该标志可跨线程读取，句柄本身只在主线程使用）。
static HOST_PRESENT: AtomicBool = AtomicBool::new(false);
static ATL: OnceLock<Result<AtlApi, String>> = OnceLock::new();

thread_local! {
    static HOST: RefCell<Option<HostWindow>> = const { RefCell::new(None) };
    static TYPELIB: RefCell<Option<TypeLibIndex>> = const { RefCell::new(None) };
    static OLE: RefCell<bool> = const { RefCell::new(false) };
}

/// 登录凭据。不派生 Debug/Clone，密码由 [`SecretString`] 在丢弃时覆写。
pub struct Credentials {
    pub user: String,
    pub domain: String,
    password: Option<SecretString>,
}

impl Credentials {
    pub fn new(user: String, domain: String, password: Option<SecretString>) -> Self {
        Self {
            user,
            domain,
            password,
        }
    }

    fn password(&self) -> Option<&str> {
        self.password.as_ref().map(SecretString::as_str)
    }

    /// 仅内存复制（重连使用）。刻意不实现 `Clone`，避免凭据被无意扩散。
    pub fn duplicate(&self) -> Self {
        Self {
            user: self.user.clone(),
            domain: self.domain.clone(),
            password: self.password.as_ref().map(SecretString::duplicate),
        }
    }

    pub fn password_copy(&self) -> Option<SecretString> {
        self.password.as_ref().map(SecretString::duplicate)
    }
}

fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(std::iter::once(0)).collect()
}

pub fn hr(error: windows::core::Error) -> String {
    format!(
        "{} (HRESULT 0x{:08X})",
        error.message(),
        error.code().0 as u32
    )
}

pub fn hresult_text(result: HRESULT) -> String {
    if result.is_ok() {
        "S_OK".into()
    } else {
        format!("HRESULT 0x{:08X}", result.0 as u32)
    }
}

// ---------------------------------------------------------------- ATL host

struct AtlApi {
    get_control: unsafe extern "system" fn(HWND, *mut *mut c_void) -> HRESULT,
}

fn atl() -> Result<&'static AtlApi, String> {
    let result = ATL.get_or_init(|| unsafe {
        // 只从系统目录加载：本进程以管理员运行，不能受当前目录/环境变量影响
        let library = super::capability::load_system_library("atl.dll")?;
        let init = GetProcAddress(library, windows::core::s!("AtlAxWinInit"))
            .ok_or("atl.dll 缺少 AtlAxWinInit 导出")?;
        let get_control = GetProcAddress(library, windows::core::s!("AtlAxGetControl"))
            .ok_or("atl.dll 缺少 AtlAxGetControl 导出")?;
        let win_init: unsafe extern "system" fn() -> i32 = std::mem::transmute(init);
        let get_control: unsafe extern "system" fn(HWND, *mut *mut c_void) -> HRESULT =
            std::mem::transmute(get_control);
        if win_init() == 0 {
            return Err("AtlAxWinInit 返回 0".to_string());
        }
        Ok(AtlApi { get_control })
    });
    match result {
        Ok(api) => Ok(api),
        Err(error) => Err(error.clone()),
    }
}

fn get_control(host: HWND) -> Result<IDispatch, String> {
    let api = atl()?;
    let mut raw: *mut c_void = std::ptr::null_mut();
    let result = unsafe { (api.get_control)(host, &mut raw) };
    result.ok().map_err(hr)?;
    if raw.is_null() {
        return Err("AtlAxGetControl 返回了空 IDispatch".to_string());
    }
    let unknown = unsafe { IUnknown::from_raw(raw) };
    unknown.cast::<IDispatch>().map_err(hr)
}

// ---------------------------------------------------------------- type library

#[derive(Clone)]
struct Member {
    iid: GUID,
    index: usize,
    params: Vec<u16>,
}

struct ExtendedSettings {
    iid: GUID,
    put_index: usize,
    #[allow(dead_code)]
    get_index: usize,
}

struct TypeLibIndex {
    /// 持有 ITypeLib 保证下面的槽位信息有效。
    #[allow(dead_code)]
    lib: windows::Win32::System::Com::ITypeLib,
    putters: HashMap<String, Vec<Member>>,
    methods: HashMap<String, Vec<Member>>,
    events: HashMap<i32, String>,
    events_iid: Option<GUID>,
    extended: Option<ExtendedSettings>,
}

/// 读取 ELEMDESC 的 VARTYPE。x64 上 TYPEDESC 的 vt 位于元素描述起点 +8（spike 实测）。
fn element_vt(elem: *const c_void) -> u16 {
    let offset = if cfg!(target_pointer_width = "64") {
        8
    } else {
        4
    };
    unsafe { std::ptr::read_unaligned((elem as *const u8).add(offset) as *const u16) }
}

fn typelib_path() -> String {
    // 真实系统目录，不读 SYSTEMROOT
    super::capability::system32_path("mstscax.dll")
        .display()
        .to_string()
}

fn load_typelib() -> Result<TypeLibIndex, String> {
    let path = typelib_path();
    let path_w = wide(&path);
    let lib = unsafe { LoadTypeLib(PCWSTR(path_w.as_ptr())) }
        .map_err(|error| format!("加载类型库 {path} 失败: {}", hr(error)))?;
    let count = unsafe { lib.GetTypeInfoCount() };

    let mut putters: HashMap<String, Vec<Member>> = HashMap::new();
    let mut methods: HashMap<String, Vec<Member>> = HashMap::new();
    let mut events: HashMap<i32, String> = HashMap::new();
    let mut events_iid: Option<GUID> = None;
    let mut extended: Option<ExtendedSettings> = None;

    for index in 0..count {
        let Ok(info) = (unsafe { lib.GetTypeInfo(index) }) else {
            continue;
        };
        let Ok(attr_ptr) = (unsafe { info.GetTypeAttr() }) else {
            continue;
        };
        let attr = unsafe { &*attr_ptr };
        let kind = attr.typekind.0;
        let interface_iid = attr.guid;
        let func_count = attr.cFuncs;

        let mut local_events: Vec<(i32, String)> = Vec::new();
        let mut is_event_interface = false;

        for function_index in 0..func_count as u32 {
            let Ok(func_ptr) = (unsafe { info.GetFuncDesc(function_index) }) else {
                continue;
            };
            let func = unsafe { &*func_ptr };
            let mut names = vec![BSTR::new(); 1 + func.cParams.max(0) as usize];
            let mut got = 0u32;
            let named = unsafe { info.GetNames(func.memid, &mut names, &mut got) }.is_ok();
            let name = if named && got > 0 {
                names[0].to_string()
            } else {
                String::new()
            };

            let mut params = Vec::new();
            if func.cParams > 0 && !func.lprgelemdescParam.is_null() {
                for param_index in 0..func.cParams {
                    params.push(element_vt(unsafe {
                        func.lprgelemdescParam.add(param_index as usize)
                    } as *const c_void));
                }
            }

            if name == "OnLoginComplete" {
                is_event_interface = true;
            }
            if !name.is_empty() {
                local_events.push((func.memid, name.clone()));
            }

            if kind == TKIND_INTERFACE && func.oVft >= 24 && func.oVft % 8 == 0 {
                let member = Member {
                    iid: interface_iid,
                    index: (func.oVft as usize) / 8,
                    params: params.clone(),
                };
                if func.invkind == INVOKE_PROPERTYPUT && !name.is_empty() {
                    putters.entry(name.clone()).or_default().push(member);
                } else if func.invkind == INVOKE_FUNC && !name.is_empty() {
                    methods.entry(name.clone()).or_default().push(member);
                }
            }

            // IMsRdpExtendedSettings::Property(BSTR name, VARIANT* value)
            if name == "Property" && params.len() == 2 && params[0] == VT_BSTR && func.oVft % 8 == 0
            {
                let entry = extended.get_or_insert(ExtendedSettings {
                    iid: interface_iid,
                    put_index: usize::MAX,
                    get_index: usize::MAX,
                });
                let slot = (func.oVft as usize) / 8;
                if func.invkind == INVOKE_PROPERTYPUT {
                    entry.put_index = slot;
                } else if func.invkind == INVOKE_PROPERTYGET {
                    entry.get_index = slot;
                }
            }

            unsafe { info.ReleaseFuncDesc(func_ptr) };
        }

        if is_event_interface {
            events_iid = Some(interface_iid);
            events = local_events.into_iter().collect();
        }

        unsafe { info.ReleaseTypeAttr(attr_ptr) };
    }

    Ok(TypeLibIndex {
        lib,
        putters,
        methods,
        events,
        events_iid,
        extended,
    })
}

/// 在主线程借用（按需加载）的类型库索引。索引持有 COM 接口，不能离开主线程。
fn with_typelib<T>(f: impl FnOnce(&TypeLibIndex) -> Result<T, String>) -> Result<T, String> {
    TYPELIB.with(|slot| {
        if slot.borrow().is_none() {
            let index = load_typelib()?;
            *slot.borrow_mut() = Some(index);
        }
        let guard = slot.borrow();
        f(guard.as_ref().expect("typelib 已在上方写入"))
    })
}

// ---------------------------------------------------------------- event sink

#[repr(C)]
struct SinkVtbl {
    query_interface:
        unsafe extern "system" fn(*mut c_void, *const GUID, *mut *mut c_void) -> HRESULT,
    add_ref: unsafe extern "system" fn(*mut c_void) -> u32,
    release: unsafe extern "system" fn(*mut c_void) -> u32,
    get_type_info_count: unsafe extern "system" fn(*mut c_void, *mut u32) -> HRESULT,
    get_type_info: unsafe extern "system" fn(*mut c_void, u32, u32, *mut *mut c_void) -> HRESULT,
    get_ids_of_names: unsafe extern "system" fn(
        *mut c_void,
        *const GUID,
        *const PCWSTR,
        u32,
        u32,
        *mut i32,
    ) -> HRESULT,
    invoke: unsafe extern "system" fn(
        *mut c_void,
        i32,
        *const GUID,
        u32,
        u16,
        *const DISPPARAMS,
        *mut VARIANT,
        *mut EXCEPINFO,
        *mut u32,
    ) -> HRESULT,
}

#[repr(C)]
struct SinkObject {
    vtbl: *const SinkVtbl,
    refs: AtomicU32,
    /// mstscax 在 Advise 前会按事件 dispinterface IID 做 QI，必须接受。
    event_iid: GUID,
    app: AppHandle,
    events: Arc<HashMap<i32, String>>,
    /// 订阅时的连接代次；代次失效后丢弃事件，避免关闭/重连后晚到事件改写状态。
    generation: u64,
}

static SINK_VTBL: SinkVtbl = SinkVtbl {
    query_interface: sink_query_interface,
    add_ref: sink_add_ref,
    release: sink_release,
    get_type_info_count: sink_get_type_info_count,
    get_type_info: sink_get_type_info,
    get_ids_of_names: sink_get_ids_of_names,
    invoke: sink_invoke,
};

unsafe extern "system" fn sink_query_interface(
    this: *mut c_void,
    iid: *const GUID,
    out: *mut *mut c_void,
) -> HRESULT {
    if out.is_null() {
        return E_POINTER;
    }
    let iid = if iid.is_null() {
        IID_NULL
    } else {
        unsafe { *iid }
    };
    let event_iid = unsafe { (*(this as *const SinkObject)).event_iid };
    if iid == IID_IUNKNOWN || iid == IID_IDISPATCH || iid == event_iid {
        unsafe { sink_add_ref(this) };
        unsafe { *out = this };
        S_OK
    } else {
        unsafe { *out = std::ptr::null_mut() };
        E_NOINTERFACE
    }
}

unsafe extern "system" fn sink_add_ref(this: *mut c_void) -> u32 {
    let object = unsafe { &*(this as *const SinkObject) };
    object.refs.fetch_add(1, Ordering::SeqCst) + 1
}

unsafe extern "system" fn sink_release(this: *mut c_void) -> u32 {
    let object = unsafe { &*(this as *const SinkObject) };
    let previous = object.refs.fetch_sub(1, Ordering::SeqCst);
    if previous == 1 {
        unsafe { drop(Box::from_raw(this as *mut SinkObject)) };
        0
    } else {
        previous - 1
    }
}

unsafe extern "system" fn sink_get_type_info_count(_this: *mut c_void, count: *mut u32) -> HRESULT {
    if !count.is_null() {
        unsafe { *count = 0 };
    }
    S_OK
}

unsafe extern "system" fn sink_get_type_info(
    _this: *mut c_void,
    _index: u32,
    _lcid: u32,
    _out: *mut *mut c_void,
) -> HRESULT {
    E_NOTIMPL
}

unsafe extern "system" fn sink_get_ids_of_names(
    _this: *mut c_void,
    _iid: *const GUID,
    _names: *const PCWSTR,
    _count: u32,
    _lcid: u32,
    _dispids: *mut i32,
) -> HRESULT {
    E_NOTIMPL
}

unsafe extern "system" fn sink_invoke(
    this: *mut c_void,
    dispid: i32,
    _iid: *const GUID,
    _lcid: u32,
    _flags: u16,
    params: *const DISPPARAMS,
    _result: *mut VARIANT,
    _exception: *mut EXCEPINFO,
    _arg_err: *mut u32,
) -> HRESULT {
    let object = unsafe { &*(this as *const SinkObject) };
    if !super::is_current_generation(object.generation) {
        return S_OK;
    }
    let event = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let name = object
            .events
            .get(&dispid)
            .cloned()
            .unwrap_or_else(|| format!("dispid#{dispid}"));
        let code = unsafe { arg_i32(params, 0) };
        let event = match name.as_str() {
            "OnConnecting" => Some(RdpEvent::Connecting),
            "OnConnected" => Some(RdpEvent::Connected),
            "OnLoginComplete" => Some(RdpEvent::LoginComplete),
            "OnLogonError" => Some(RdpEvent::LogonError(code)),
            "OnDisconnected" => Some(RdpEvent::Disconnected(code)),
            "OnFatalError" => Some(RdpEvent::FatalError(code)),
            "OnConfirmClose" => Some(RdpEvent::ConfirmClose),
            "OnMouseInputModeChanged" => Some(RdpEvent::MouseInputMode(code != 0)),
            _ => None,
        };
        match event {
            Some(event) => super::handle_rdp_event(&object.app, event),
            None => {
                eprintln!("[desktop-clone] 未映射的控件事件 {name} (dispid={dispid}, arg0={code})")
            }
        }
    }));
    if event.is_err() {
        eprintln!("[desktop-clone] 事件处理发生 panic (dispid={dispid})");
    }
    S_OK
}

unsafe fn arg_i32(params: *const DISPPARAMS, index: usize) -> i32 {
    if params.is_null() {
        return 0;
    }
    unsafe {
        let params = &*params;
        if params.rgvarg.is_null() || index >= params.cArgs as usize {
            return 0;
        }
        let value = &*params.rgvarg.add(index);
        let inner = &value.Anonymous.Anonymous;
        match inner.vt.0 {
            VT_I2 => inner.Anonymous.iVal as i32,
            VT_I4 | VT_INT => inner.Anonymous.lVal,
            VT_BOOL => inner.Anonymous.boolVal.0 as i32,
            _ => 0,
        }
    }
}

fn create_sink(
    event_iid: GUID,
    app: AppHandle,
    events: Arc<HashMap<i32, String>>,
    generation: u64,
) -> IUnknown {
    let object = Box::new(SinkObject {
        vtbl: &SINK_VTBL,
        refs: AtomicU32::new(1),
        event_iid,
        app,
        events,
        generation,
    });
    let raw = Box::into_raw(object) as *mut c_void;
    unsafe { IUnknown::from_raw(raw) }
}

struct Advised {
    point: IConnectionPoint,
    #[allow(dead_code)]
    sink: IUnknown,
    cookie: u32,
    /// 订阅时的连接代次：宿主复用时据此判断是否需要重挂事件槽。
    generation: u64,
}

/// 复用已存在的宿主时，旧事件槽的代次已失效（sink 会丢弃全部事件），必须重新订阅。
fn needs_readvise(advised_generation: Option<u64>, generation: u64) -> bool {
    advised_generation != Some(generation)
}

fn advise_events(
    control: &IDispatch,
    index: &TypeLibIndex,
    app: &AppHandle,
    generation: u64,
) -> Result<Advised, String> {
    let iid = index.events_iid.ok_or("类型库中未找到控件事件接口")?;
    let container: IConnectionPointContainer = control.cast().map_err(hr)?;
    let point = unsafe { container.FindConnectionPoint(&iid) }
        .map_err(|error| format!("FindConnectionPoint 失败: {}", hr(error)))?;
    let sink = create_sink(iid, app.clone(), Arc::new(index.events.clone()), generation);
    let cookie = unsafe { point.Advise(&sink) }
        .map_err(|error| format!("订阅控件事件失败: {}", hr(error)))?;
    Ok(Advised {
        point,
        sink,
        cookie,
        generation,
    })
}

// ---------------------------------------------------------------- property access

#[derive(Clone)]
pub enum Value {
    Bool(bool),
    Int(i32),
    Str(String),
    /// 口令等敏感字符串：写入后覆写临时缓冲。
    Secret(String),
    Ptr(isize),
}

impl Drop for Value {
    fn drop(&mut self) {
        if let Value::Secret(text) = self {
            unsafe {
                for byte in text.as_bytes_mut() {
                    *byte = 0;
                }
            }
        }
    }
}

impl Value {
    fn is_secret(&self) -> bool {
        matches!(self, Value::Secret(_))
    }

    fn as_str(&self) -> Option<&str> {
        match self {
            Value::Str(text) | Value::Secret(text) => Some(text),
            _ => None,
        }
    }
}

fn variant_of(value: &Value) -> VARIANT {
    match value {
        Value::Bool(value) => VARIANT::from(*value),
        Value::Int(value) => VARIANT::from(*value),
        Value::Str(value) | Value::Secret(value) => VARIANT::from(value.as_str()),
        Value::Ptr(value) => VARIANT::from(*value as i64),
    }
}

/// 覆写 VARIANT 内 BSTR 的字符缓冲（其后由 `VariantClear` 负责释放）。
unsafe fn zero_variant_bstr(variant: &VARIANT, utf16_len: usize) {
    unsafe {
        let inner = &variant.Anonymous.Anonymous;
        if inner.vt.0 == VT_BSTR {
            let pointer = inner.Anonymous.bstrVal.as_ptr() as *mut u16;
            if !pointer.is_null() {
                std::ptr::write_bytes(pointer, 0u8, utf16_len * 2);
            }
        }
    }
}

fn idispatch_put(control: &IDispatch, name: &str, value: &Value) -> Result<(), String> {
    let name_w = wide(name);
    let names = [PCWSTR(name_w.as_ptr())];
    let mut dispid = 0i32;
    unsafe { control.GetIDsOfNames(&IID_NULL, names.as_ptr(), 1, 0, &mut dispid) }.map_err(hr)?;

    let mut argument = variant_of(value);
    let mut named = DISPID_PROPERTYPUT;
    let params = DISPPARAMS {
        rgvarg: &mut argument,
        rgdispidNamedArgs: &mut named,
        cArgs: 1,
        cNamedArgs: 1,
    };
    let result = unsafe {
        control.Invoke(
            dispid,
            &IID_NULL,
            0,
            DISPATCH_PROPERTYPUT,
            &params,
            None,
            None,
            None,
        )
    };
    if value.is_secret() {
        let length = value
            .as_str()
            .map(|text| text.encode_utf16().count())
            .unwrap_or(0);
        unsafe { zero_variant_bstr(&argument, length) };
    }
    result.map_err(hr)
}

unsafe fn qi_raw(unknown: &IUnknown, iid: &GUID) -> Option<*mut c_void> {
    let raw = unknown.as_raw();
    let vtbl = unsafe { *(raw as *const *const usize) };
    let query: unsafe extern "system" fn(*mut c_void, *const GUID, *mut *mut c_void) -> HRESULT =
        unsafe { std::mem::transmute(*vtbl) };
    let mut out: *mut c_void = std::ptr::null_mut();
    unsafe { query(raw, iid, &mut out) }.is_ok().then_some(out)
}

unsafe fn invoke_put(raw: *mut c_void, member: &Member, value: &Value) -> Result<(), String> {
    let vt = member.params.first().copied().unwrap_or(0);
    let vtbl = unsafe { *(raw as *const *const usize) };
    let slot = unsafe { *vtbl.add(member.index) };

    match vt {
        VT_BOOL => {
            let Value::Bool(flag) = value else {
                return Err("需要布尔值".into());
            };
            let function: unsafe extern "system" fn(*mut c_void, VARIANT_BOOL) -> HRESULT =
                unsafe { std::mem::transmute(slot) };
            unsafe { function(raw, VARIANT_BOOL(if *flag { -1 } else { 0 })) }
                .ok()
                .map_err(hr)
        }
        VT_I4 | VT_INT => {
            let Value::Int(number) = value else {
                return Err("需要整数值".into());
            };
            let function: unsafe extern "system" fn(*mut c_void, i32) -> HRESULT =
                unsafe { std::mem::transmute(slot) };
            unsafe { function(raw, *number) }.ok().map_err(hr)
        }
        VT_BSTR => {
            let Some(text) = value.as_str() else {
                return Err("需要字符串值".into());
            };
            let raw_bstr = BSTR::from(text).into_raw();
            let function: unsafe extern "system" fn(*mut c_void, *const u16) -> HRESULT =
                unsafe { std::mem::transmute(slot) };
            let result = unsafe { function(raw, raw_bstr) };
            if value.is_secret() {
                // 控件已复制口令；释放前把本进程的副本清零
                let length = text.encode_utf16().count();
                unsafe { std::ptr::write_bytes(raw_bstr as *mut u16, 0u8, length) };
            }
            let _ = unsafe { BSTR::from_raw(raw_bstr) };
            result.ok().map_err(hr)
        }
        VT_INT_PTR => {
            let Value::Ptr(pointer) = value else {
                return Err("需要指针值".into());
            };
            let function: unsafe extern "system" fn(*mut c_void, isize) -> HRESULT =
                unsafe { std::mem::transmute(slot) };
            unsafe { function(raw, *pointer) }.ok().map_err(hr)
        }
        other => Err(format!("不支持的参数类型 vt={other}")),
    }
}

fn vtable_put(
    control: &IDispatch,
    index: &TypeLibIndex,
    name: &str,
    value: &Value,
) -> Result<String, String> {
    let members = index
        .putters
        .get(name)
        .ok_or_else(|| "没有非脚本接口暴露该属性".to_string())?;
    let unknown: IUnknown = control.cast().map_err(hr)?;
    let mut errors = Vec::new();
    for member in members {
        let Some(raw) = (unsafe { qi_raw(&unknown, &member.iid) }) else {
            errors.push(format!("QI {:?} 失败", member.iid));
            continue;
        };
        let result = unsafe { invoke_put(raw, member, value) };
        let _guard = unsafe { IUnknown::from_raw(raw) };
        match result {
            Ok(()) => return Ok(format!("接口 {:?} 槽 {}", member.iid, member.index)),
            Err(error) => errors.push(format!("{:?}: {error}", member.iid)),
        }
    }
    Err(errors.join(" | "))
}

/// 先走脚本 IDispatch，再回落到非脚本接口槽位。
fn set_prop(
    control: &IDispatch,
    index: &TypeLibIndex,
    name: &str,
    value: &Value,
) -> Result<String, String> {
    let mut dispatch_error = None;
    if !matches!(value, Value::Ptr(_)) {
        match idispatch_put(control, name, value) {
            Ok(()) => return Ok("IDispatch".into()),
            Err(error) => dispatch_error = Some(error),
        }
    }
    match vtable_put(control, index, name, value) {
        Ok(path) => Ok(path),
        Err(error) => Err(match dispatch_error {
            Some(first) => format!("IDispatch: {first}; 接口: {error}"),
            None => format!("接口: {error}"),
        }),
    }
}

fn set_extended(
    control: &IDispatch,
    index: &TypeLibIndex,
    name: &str,
    value: &Value,
) -> Result<(), String> {
    let extended = index
        .extended
        .as_ref()
        .ok_or("类型库中未找到 IMsRdpExtendedSettings")?;
    if extended.put_index == usize::MAX {
        return Err("未找到 IMsRdpExtendedSettings::put_Property".to_string());
    }
    let unknown: IUnknown = control.cast().map_err(hr)?;
    let raw = unsafe { qi_raw(&unknown, &extended.iid) }
        .ok_or_else(|| format!("QI {:?} 失败", extended.iid))?;
    let _guard = unsafe { IUnknown::from_raw(raw) };

    let name_bstr = BSTR::from(name);
    let raw_name = name_bstr.clone().into_raw();
    let argument = variant_of(value);
    let vtbl = unsafe { *(raw as *const *const usize) };
    let slot = unsafe { *vtbl.add(extended.put_index) };
    let function: unsafe extern "system" fn(*mut c_void, *const u16, *const VARIANT) -> HRESULT =
        unsafe { std::mem::transmute(slot) };
    let result = unsafe { function(raw, raw_name, &argument) };
    let _ = unsafe { BSTR::from_raw(raw_name) };
    result.ok().map_err(hr)
}

fn get_disp(control: &IDispatch, name: &str) -> Result<IDispatch, String> {
    let name_w = wide(name);
    let names = [PCWSTR(name_w.as_ptr())];
    let mut dispid = 0i32;
    unsafe { control.GetIDsOfNames(&IID_NULL, names.as_ptr(), 1, 0, &mut dispid) }.map_err(hr)?;

    let params = DISPPARAMS::default();
    let mut result = VARIANT::default();
    unsafe {
        control.Invoke(
            dispid,
            &IID_NULL,
            0,
            DISPATCH_PROPERTYGET,
            &params,
            Some(&mut result),
            None,
            None,
        )
    }
    .map_err(hr)?;
    IDispatch::try_from(&result).map_err(hr)
}

fn invoke_method(control: &IDispatch, name: &str) -> Result<(), String> {
    let name_w = wide(name);
    let names = [PCWSTR(name_w.as_ptr())];
    let mut dispid = 0i32;
    unsafe { control.GetIDsOfNames(&IID_NULL, names.as_ptr(), 1, 0, &mut dispid) }.map_err(hr)?;

    let params = DISPPARAMS::default();
    unsafe {
        control.Invoke(
            dispid,
            &IID_NULL,
            0,
            DISPATCH_METHOD,
            &params,
            None,
            None,
            None,
        )
    }
    .map_err(hr)
}

fn reset_password(control: &IDispatch, index: &TypeLibIndex) {
    let Some(members) = index.methods.get("ResetPassword") else {
        return;
    };
    let Ok(unknown) = control.cast::<IUnknown>() else {
        return;
    };
    for member in members {
        let Some(raw) = (unsafe { qi_raw(&unknown, &member.iid) }) else {
            continue;
        };
        let vtbl = unsafe { *(raw as *const *const usize) };
        let slot = unsafe { *vtbl.add(member.index) };
        let function: unsafe extern "system" fn(*mut c_void) -> HRESULT =
            unsafe { std::mem::transmute(slot) };
        let result = unsafe { function(raw) };
        let _guard = unsafe { IUnknown::from_raw(raw) };
        if result.is_err() {
            // E_FAIL 属良性：控件通常已自行清理口令
            eprintln!(
                "[desktop-clone] ResetPassword 返回 {}",
                hresult_text(result)
            );
        }
        return;
    }
}

const ADVANCED_SETTINGS_NAMES: [&str; 5] = [
    "AdvancedSettings9",
    "AdvancedSettings7",
    "AdvancedSettings6",
    "AdvancedSettings5",
    "AdvancedSettings2",
];

fn remember_advanced_settings(control: &IDispatch, name: &str) -> Option<IDispatch> {
    get_disp(control, name).ok()
}

fn advanced_object(control: &IDispatch, names: &[&str]) -> Option<(String, IDispatch)> {
    names.iter().find_map(|name| {
        remember_advanced_settings(control, name).map(|object| ((*name).to_string(), object))
    })
}

fn apply_advanced_settings(
    control: &IDispatch,
    index: &TypeLibIndex,
    options: &CloneOptions,
) -> bool {
    let Some((name, object)) = advanced_object(control, &ADVANCED_SETTINGS_NAMES) else {
        eprintln!("[desktop-clone] 没有可用的 AdvancedSettings 对象");
        return false;
    };

    let settings = [
        ("SmartSizing", Value::Bool(options.smart_sizing)),
        ("DisplayConnectionBar", Value::Bool(false)),
        ("ContainerHandledFullScreen", Value::Bool(true)),
        ("AuthenticationLevel", Value::Int(0)),
        ("EnableCredSspSupport", Value::Bool(true)),
        // 0 = 重定向到本机；2 = 不播放（静音）
        (
            "AudioRedirectionMode",
            Value::Int(if options.muted { 2 } else { 0 }),
        ),
        ("RedirectClipboard", Value::Bool(true)),
    ];
    let mut ok = true;
    for (property, value) in settings {
        if let Err(error) = set_prop(&object, index, property, &value) {
            ok = false;
            eprintln!("[desktop-clone] 设置 {name}.{property} 失败: {error}");
        }
    }
    ok
}

/// 相对（游戏）鼠标：属性在 AdvancedSettings7 上，逐级尝试继承对象。
fn apply_relative_mouse_mode(control: &IDispatch, index: &TypeLibIndex, game: bool) -> bool {
    const NAMES: [&str; 4] = [
        "AdvancedSettings7",
        "AdvancedSettings9",
        "AdvancedSettings8",
        "AdvancedSettings6",
    ];
    for name in NAMES {
        let Ok(object) = get_disp(control, name) else {
            continue;
        };
        match set_prop(&object, index, "RelativeMouseMode", &Value::Bool(game)) {
            Ok(path) => {
                println!("[desktop-clone] {name}.RelativeMouseMode={game}（{path}）");
                return true;
            }
            Err(error) => {
                eprintln!("[desktop-clone] 设置 {name}.RelativeMouseMode 失败: {error}");
            }
        }
    }
    false
}

/// 系统热键路由：`SecuredSettings2.KeyboardHookMode`（0=本机，1=子会话）。
fn set_keyboard_hook_value(
    control: &IDispatch,
    index: &TypeLibIndex,
    mode: i32,
) -> Result<(), String> {
    let mut errors = Vec::new();
    for name in ["SecuredSettings2", "SecuredSettings3", "SecuredSettings"] {
        let Ok(object) = get_disp(control, name) else {
            continue;
        };
        match set_prop(&object, index, "KeyboardHookMode", &Value::Int(mode)) {
            Ok(path) => {
                println!("[desktop-clone] {name}.KeyboardHookMode={mode}（{path}）");
                return Ok(());
            }
            Err(error) => errors.push(format!("{name}: {error}")),
        }
    }
    match set_prop(control, index, "KeyboardHookMode", &Value::Int(mode)) {
        Ok(path) => {
            println!("[desktop-clone] KeyboardHookMode={mode}（{path}）");
            Ok(())
        }
        Err(error) => {
            errors.push(format!("control: {error}"));
            Err(errors.join(" | "))
        }
    }
}

fn apply_secured_settings(
    control: &IDispatch,
    index: &TypeLibIndex,
    options: &CloneOptions,
) -> bool {
    let mode = match options.keyboard_hook {
        KeyboardHook::Local => 0,
        KeyboardHook::Remote => 1,
    };
    match set_keyboard_hook_value(control, index, mode) {
        Ok(()) => true,
        Err(error) => {
            eprintln!("[desktop-clone] 设置 KeyboardHookMode 失败: {error}");
            false
        }
    }
}

/// 写入连接所需属性；`ConnectToChildSession` 失败视为致命错误。
fn apply_connection_settings(
    control: &IDispatch,
    index: &TypeLibIndex,
    ui_parent: HWND,
    credentials: Option<&Credentials>,
    options: &CloneOptions,
) -> Result<(), String> {
    let basics = [
        ("DesktopWidth", Value::Int(1920)),
        ("DesktopHeight", Value::Int(1080)),
        ("ColorDepth", Value::Int(32)),
        ("FullScreen", Value::Bool(false)),
        ("Server", Value::Str("localhost".to_string())),
    ];
    for (property, value) in basics {
        if let Err(error) = set_prop(control, index, property, &value) {
            eprintln!("[desktop-clone] 设置 {property} 失败: {error}");
        }
    }

    // 无身份时必须显式清空：复用宿主时控件会保留上一次的 UserName/Domain/口令
    let (user, domain) = match credentials {
        Some(credentials) => (credentials.user.as_str(), credentials.domain.as_str()),
        None => ("", ""),
    };
    for (property, value) in [("UserName", user), ("Domain", domain)] {
        if let Err(error) = set_prop(control, index, property, &Value::Str(value.to_string())) {
            eprintln!("[desktop-clone] 设置 {property} 失败: {error}");
        }
    }
    match credentials
        .and_then(|credentials| credentials.password())
        .filter(|password| !password.is_empty())
    {
        Some(password) => {
            set_prop(
                control,
                index,
                "ClearTextPassword",
                &Value::Secret(password.to_string()),
            )
            // 不把控件返回的原文并入错误信息，避免任何口令回显的可能
            .map_err(|_| "写入凭据失败（控件拒绝 ClearTextPassword）".to_string())?;
        }
        // 无口令时必须清空控件里上一次留下的值，否则会复用旧密码
        None => reset_password(control, index),
    }

    apply_advanced_settings(control, index, options);
    apply_secured_settings(control, index, options);

    let game_mouse = options.mouse_mode == MouseMode::Game;
    apply_relative_mouse_mode(control, index, game_mouse);
    if game_mouse {
        // Win11 24H2+ 才支持；旧系统失败只记录，不影响连接
        if let Err(error) =
            set_extended(control, index, "AllowRelativeMouseMode", &Value::Bool(true))
        {
            eprintln!("[desktop-clone] AllowRelativeMouseMode 不可用（继续）: {error}");
        }
    }

    for (property, value) in [
        ("PromptForCredentials", Value::Bool(false)),
        ("AllowPromptingForCredentials", Value::Bool(false)),
        ("UIParentWindowHandle", Value::Ptr(ui_parent.0 as isize)),
    ] {
        if let Err(error) = set_prop(control, index, property, &value) {
            eprintln!("[desktop-clone] 设置 {property} 失败: {error}");
        }
    }

    set_extended(control, index, "ConnectToChildSession", &Value::Bool(true))
        .map_err(|error| format!("启用子会话失败: {error}"))?;
    if let Err(error) = set_extended(
        control,
        index,
        "EnableFrameBufferRedirection",
        &Value::Bool(true),
    ) {
        eprintln!("[desktop-clone] 启用帧缓冲重定向失败（继续）: {error}");
    }
    Ok(())
}

// ---------------------------------------------------------------- host lifecycle

struct HostWindow {
    hwnd: HWND,
    control: IDispatch,
    advised: Option<Advised>,
}

fn ensure_ole() -> Result<(), String> {
    OLE.with(|flag| {
        let mut flag = flag.borrow_mut();
        if *flag {
            return Ok(());
        }
        match unsafe { OleInitialize(None) } {
            Ok(()) => {
                *flag = true;
                Ok(())
            }
            Err(error) => Err(format!("OleInitialize 失败: {}", hr(error))),
        }
    })
}

fn release_ole() {
    OLE.with(|flag| {
        let mut flag = flag.borrow_mut();
        if *flag {
            *flag = false;
            unsafe { OleUninitialize() };
        }
    });
}

fn create_host_window(parent: HWND, rect: HostRect) -> Result<HWND, String> {
    unsafe {
        let instance = windows::Win32::System::LibraryLoader::GetModuleHandleW(PCWSTR::null())
            .map_err(|error| format!("获取模块句柄失败: {}", hr(error)))?;
        let text = HSTRING::from(CONTROL_CLSID);
        let mut last_error = String::new();
        for class in ATL_CLASSES {
            match CreateWindowExW(
                WINDOW_EX_STYLE(0),
                class,
                &text,
                WS_CHILD | WS_VISIBLE | WS_CLIPCHILDREN | WS_CLIPSIBLINGS,
                rect.x,
                rect.y,
                rect.width,
                rect.height,
                Some(parent),
                None,
                Some(HINSTANCE(instance.0)),
                None,
            ) {
                Ok(hwnd) => return Ok(hwnd),
                Err(error) => last_error = hr(error),
            }
        }
        Err(format!("创建 ActiveX 宿主窗口失败: {last_error}"))
    }
}

/// 补齐 `WS_CLIPSIBLINGS`：WebView2 重绘时不得覆盖同级宿主窗口。
fn ensure_host_style(hwnd: HWND) {
    unsafe {
        let style = GetWindowLongPtrW(hwnd, GWL_STYLE);
        let clipped = WS_CLIPSIBLINGS.0 as isize;
        if style & clipped == 0 {
            SetWindowLongPtrW(hwnd, GWL_STYLE, style | clipped);
        }
    }
}

fn move_host_window(hwnd: HWND, rect: HostRect) {
    ensure_host_style(hwnd);
    unsafe {
        let _ = MoveWindow(hwnd, rect.x, rect.y, rect.width, rect.height, true);
        let _ = SetWindowPos(
            hwnd,
            Some(HWND_TOP),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
        );
    }
}

fn connect_on_main(
    app: &AppHandle,
    credentials: Option<Credentials>,
    options: &CloneOptions,
    chrome_height: f64,
    generation: u64,
) -> Result<(), String> {
    if !super::is_current_generation(generation) {
        return Err("连接请求已被取消".to_string());
    }
    let parent = super::viewer::parent_hwnd(app)?;
    let rect = super::viewer::compute_host_rect(app, chrome_height)?;
    ensure_ole()?;
    atl()?;

    HOST.with(|slot| {
        let mut guard = slot.borrow_mut();
        if guard.is_none() {
            let hwnd = create_host_window(parent, rect)?;
            let control = match get_control(hwnd) {
                Ok(control) => control,
                Err(error) => {
                    unsafe {
                        let _ = DestroyWindow(hwnd);
                    };
                    return Err(error);
                }
            };
            *guard = Some(HostWindow {
                hwnd,
                control,
                advised: None,
            });
            HOST_PRESENT.store(true, Ordering::SeqCst);
        }
        let host = guard.as_mut().ok_or("宿主窗口创建失败")?;
        move_host_window(host.hwnd, rect);

        with_typelib(|index| {
            // 复用宿主说明上一次连接失败/2055 中断：先显式断开再写属性。
            // 此时旧的 sink 代次已失效，会丢弃这次断开抛出的所有事件。
            if host.advised.is_some() {
                let _ = invoke_method(&host.control, "Disconnect");
            }
            apply_connection_settings(&host.control, index, parent, credentials.as_ref(), options)?;
            // 2055 重试 / 失败重试会复用同一宿主：旧 sink 因代次不符丢弃全部事件，
            // 必须先退订再按新代次重新订阅，否则连接成功但状态永远停在 connecting。
            if needs_readvise(
                host.advised.as_ref().map(|advised| advised.generation),
                generation,
            ) {
                if let Some(previous) = host.advised.take() {
                    unsafe {
                        let _ = previous.point.Unadvise(previous.cookie);
                    }
                    drop(previous);
                }
                host.advised = Some(advise_events(&host.control, index, app, generation)?);
            }
            if !super::is_current_generation(generation) {
                return Err("连接请求已被取消".to_string());
            }
            invoke_method(&host.control, "Connect")
                .map_err(|error| format!("Connect() 调用失败: {error}"))
        })
    })
}

/// 创建（如需要）宿主控件并连接到子会话。必须在主线程执行，内部自动投递。
///
/// `generation` 为本次连接的代次：投递超时/被取消后，晚到的主线程闭包会自行放弃，
/// 不会再创建宿主或调用 `Connect()`。
pub fn connect(
    app: &AppHandle,
    credentials: Option<Credentials>,
    options: &CloneOptions,
    chrome_height: f64,
    generation: u64,
) -> Result<(), String> {
    let handle = app.clone();
    let options = options.clone();
    on_main_sync(app, move || {
        connect_on_main(&handle, credentials, &options, chrome_height, generation)
    })?
}

/// 请求控件断开连接（保留子会话）。
///
/// `generation` 为发起操作的连接代次：投递超时后晚到的闭包若发现代次已变（新连接接管了
/// 宿主）就直接放弃，避免断开刚建立的新连接。
pub fn disconnect(app: &AppHandle, generation: u64) -> Result<(), String> {
    let app = app.clone();
    on_main_sync(&app, move || {
        if !super::is_current_generation(generation) {
            return Ok(());
        }
        HOST.with(|slot| {
            let guard = slot.borrow();
            let Some(host) = guard.as_ref() else {
                return Ok(());
            };
            invoke_method(&host.control, "Disconnect")
                .map_err(|error| format!("Disconnect() 调用失败: {error}"))
        })
    })?
}

/// 清理控件内存中的口令（失败、断开、2055、关闭等终止路径统一调用）。
///
/// 与 [`reset_control_password`] 一样延后到当前事件派发结束：事件回调可能发生在
/// `Connect()` 内部，此时宿主正被可变借用，直接访问会重入 panic。
pub fn clear_control_password(app: &AppHandle) {
    let app = app.clone();
    let _ = app.run_on_main_thread(move || {
        HOST.with(|slot| {
            let guard = slot.borrow();
            if let Some(host) = guard.as_ref() {
                let _ = with_typelib(|index| {
                    reset_password(&host.control, index);
                    Ok(())
                });
            }
        });
    });
}

/// 登录完成后尽力清理控件内存中的口令。
pub fn reset_control_password(app: &AppHandle) {
    let app = app.clone();
    // 该调用来自控件事件回调，必须延后到当前事件派发结束，避免重入同一个控件
    let _ = app.run_on_main_thread(move || {
        HOST.with(|slot| {
            let guard = slot.borrow();
            if let Some(host) = guard.as_ref() {
                let _ = with_typelib(|index| {
                    reset_password(&host.control, index);
                    Ok(())
                });
            }
        });
    });
}

fn destroy_on_main() {
    let host = HOST.with(|slot| slot.borrow_mut().take());
    if let Some(host) = host {
        let HostWindow {
            hwnd,
            control,
            advised,
        } = host;
        // 销毁路径同样必须清空控件内存里的口令
        let _ = with_typelib(|index| {
            reset_password(&control, index);
            Ok(())
        });
        if let Some(advised) = advised {
            unsafe {
                let _ = advised.point.Unadvise(advised.cookie);
            };
            drop(advised);
        }
        drop(control);
        unsafe {
            let _ = DestroyWindow(hwnd);
        };
    }
    HOST_PRESENT.store(false, Ordering::SeqCst);
    TYPELIB.with(|slot| {
        let _ = slot.borrow_mut().take();
    });
    release_ole();
}

/// 销毁宿主窗口与全部 COM 引用（幂等）。
///
/// `generation` 校验同 [`disconnect`]：晚到的销毁闭包不能拆掉新连接创建的宿主。
pub fn destroy(app: &AppHandle, generation: u64) {
    let app = app.clone();
    let _ = on_main_sync(&app, move || {
        if super::is_current_generation(generation) {
            destroy_on_main();
        }
    });
}

/// 宿主窗口是否已创建（可在任意线程读取）。
pub fn is_present() -> bool {
    HOST_PRESENT.load(Ordering::SeqCst)
}

/// 应用宿主矩形与可见性：条状 WebView2 模式下宿主占标题栏下方，弹层/未连接时隐藏。
///
/// 显示路径先移动再显示，隐藏路径只隐藏（下次显示时一并重排），避免与 WebView2 重叠一帧。
pub fn apply_layout(app: &AppHandle, rect: HostRect, visible: bool) -> Result<(), String> {
    let app = app.clone();
    on_main_sync(&app, move || {
        HOST.with(|slot| {
            let guard = slot.borrow();
            let Some(host) = guard.as_ref() else {
                return;
            };
            if visible {
                move_host_window(host.hwnd, rect);
                unsafe {
                    let _ = ShowWindow(host.hwnd, SW_SHOW);
                }
                unsafe {
                    let _ = SetWindowPos(
                        host.hwnd,
                        Some(HWND_TOP),
                        0,
                        0,
                        0,
                        0,
                        SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                    );
                }
            } else {
                ensure_host_style(host.hwnd);
                unsafe {
                    let _ = ShowWindow(host.hwnd, SW_HIDE);
                }
            }
        })
    })?;
    Ok(())
}

/// 连接后调整自适应缩放。
pub fn set_smart_sizing(app: &AppHandle, enabled: bool) -> Result<(), String> {
    let app = app.clone();
    on_main_sync(&app, move || {
        HOST.with(|slot| {
            let guard = slot.borrow();
            let Some(host) = guard.as_ref() else {
                return Ok(());
            };
            let Some(advanced) = remember_advanced_settings(&host.control, "AdvancedSettings9")
                .or_else(|| remember_advanced_settings(&host.control, "AdvancedSettings2"))
            else {
                return Err("没有可用的 AdvancedSettings 对象".to_string());
            };
            with_typelib(|index| {
                set_prop(&advanced, index, "SmartSizing", &Value::Bool(enabled)).map(|_| ())
            })
        })
    })?
}

/// 连接中切换相对（游戏）鼠标：属性可即时生效时优先走这里。
pub fn set_relative_mouse_mode(app: &AppHandle, game: bool) -> Result<(), String> {
    let app = app.clone();
    on_main_sync(&app, move || {
        HOST.with(|slot| {
            let guard = slot.borrow();
            let Some(host) = guard.as_ref() else {
                return Ok(());
            };
            with_typelib(|index| {
                // 运行中切到 game 时扩展属性也要补写，否则部分系统只生效一半
                let extended_error = if game {
                    set_extended(
                        &host.control,
                        index,
                        "AllowRelativeMouseMode",
                        &Value::Bool(true),
                    )
                    .err()
                } else {
                    None
                };
                if !apply_relative_mouse_mode(&host.control, index, game) {
                    return Err(match extended_error {
                        Some(error) => {
                            format!("控件不接受 RelativeMouseMode 变更（{error}）")
                        }
                        None => "控件不接受 RelativeMouseMode 变更".to_string(),
                    });
                }
                if let Some(error) = extended_error {
                    eprintln!("[desktop-clone] AllowRelativeMouseMode 不可用（继续）: {error}");
                }
                Ok(())
            })
        })
    })?
}

/// 连接中把系统热键路由指向子会话（`SendInput` 回退路径需要）。
pub fn set_keyboard_hook_mode(app: &AppHandle, remote: bool) -> Result<(), String> {
    on_main_sync(app, move || {
        HOST.with(|slot| {
            let guard = slot.borrow();
            let Some(host) = guard.as_ref() else {
                return Ok(());
            };
            with_typelib(|index| {
                set_keyboard_hook_value(&host.control, index, if remote { 1 } else { 0 })
            })
        })
    })?
}

/// 通过控件的 `SendKeys` 发送扫描码序列（子会话内生效）。
pub fn send_keys(app: &AppHandle, keys: &[(u16, bool)]) -> Result<(), String> {
    let app = app.clone();
    let keys = keys.to_vec();
    on_main_sync(&app, move || {
        HOST.with(|slot| {
            let guard = slot.borrow();
            let Some(host) = guard.as_ref() else {
                return Err("远程桌面控件尚未创建".to_string());
            };
            with_typelib(|index| send_keys_via_control(&host.control, index, &keys))
        })
    })?
}

/// `SendRemoteAction`（如 AppSwitch = Alt+Tab），用于 SendKeys 不可用时。
pub fn send_remote_action(app: &AppHandle, action: i32) -> Result<(), String> {
    let app = app.clone();
    on_main_sync(&app, move || {
        HOST.with(|slot| {
            let guard = slot.borrow();
            let Some(host) = guard.as_ref() else {
                return Err("远程桌面控件尚未创建".to_string());
            };
            with_typelib(|index| send_remote_action_via_control(&host.control, index, action))
        })
    })?
}

/// 宿主子窗口是否确实持有键盘焦点。`SendInput` 会把按键送给前台窗口，
/// 在这里确认焦点仍在宿主上，避免把组合键注入到本机其他程序。
pub fn is_host_focused(app: &AppHandle) -> Result<bool, String> {
    let handle = app.clone();
    on_main_sync(app, move || {
        let parent = super::viewer::parent_hwnd(&handle)?;
        if unsafe { GetForegroundWindow() } != parent {
            return Ok(false);
        }
        let thread = unsafe { GetWindowThreadProcessId(parent, None) };
        let mut info = GUITHREADINFO {
            cbSize: std::mem::size_of::<GUITHREADINFO>() as u32,
            ..Default::default()
        };
        if unsafe { GetGUIThreadInfo(thread, &mut info) }.is_err() {
            return Ok(false);
        }
        let focused = if info.hwndFocus == HWND::default() {
            info.hwndActive
        } else {
            info.hwndFocus
        };
        HOST.with(|slot| {
            let guard = slot.borrow();
            let Some(host) = guard.as_ref() else {
                return Ok(false);
            };
            let inside = unsafe { IsChild(host.hwnd, focused) }.as_bool() || focused == host.hwnd;
            Ok(inside)
        })
    })?
}

/// 把前台与键盘焦点交给宿主子窗口（SendInput 回退路径需要）。
pub fn focus_host(app: &AppHandle) -> Result<(), String> {
    let handle = app.clone();
    on_main_sync(app, move || {
        let parent = super::viewer::parent_hwnd(&handle)?;
        unsafe {
            let _ = SetForegroundWindow(parent);
        }
        HOST.with(|slot| {
            if let Some(host) = slot.borrow().as_ref() {
                let _ = unsafe { SetFocus(Some(host.hwnd)) };
            }
        });
        Ok(())
    })?
}

const VT_BYREF: u16 = 0x4000;
const VT_ARRAY: u16 = 0x2000;
const VT_PTR: u16 = 26;
/// mstscax 的 SendKeys 上限：一次最多 20 个键。
const MAX_SEND_KEYS: usize = 20;

fn base_type(vt: u16) -> u16 {
    vt & 0x0FFF
}

fn is_array_like(vt: u16) -> bool {
    vt & VT_ARRAY != 0
}

/// 参数是否为“指向基础类型的指针”（`short*` / `short&`）。
fn is_pointer_like(vt: u16) -> bool {
    !is_array_like(vt) && (vt & VT_BYREF != 0 || base_type(vt) == VT_PTR)
}

/// 构造一维 SAFEARRAY；`vartype` 为 VT_I2 / VT_BOOL。
fn create_safearray(values: &[i16], vartype: u16) -> Option<*mut SAFEARRAY> {
    if values.is_empty() {
        return None;
    }
    let bound = SAFEARRAYBOUND {
        cElements: values.len() as u32,
        lLbound: 0,
    };
    unsafe {
        let array = SafeArrayCreate(VARENUM(vartype), 1, &bound);
        if array.is_null() {
            return None;
        }
        let mut data: *mut c_void = std::ptr::null_mut();
        if SafeArrayAccessData(array, &mut data).is_err() {
            let _ = SafeArrayDestroy(array);
            return None;
        }
        std::ptr::copy_nonoverlapping(values.as_ptr(), data as *mut i16, values.len());
        if SafeArrayUnaccessData(array).is_err() {
            let _ = SafeArrayDestroy(array);
            return None;
        }
        Some(array)
    }
}

/// 调用控件 `SendKeys`。类型库里该方法的数组参数可能声明为 `SAFEARRAY` 或裸指针，
/// 两种形态都支持；键值一律使用**扫描码**（与本机 SendInput 回退保持一致）。
fn send_keys_via_control(
    control: &IDispatch,
    index: &TypeLibIndex,
    keys: &[(u16, bool)],
) -> Result<(), String> {
    let members = index
        .methods
        .get("SendKeys")
        .ok_or_else(|| "类型库中没有 SendKeys 方法".to_string())?;
    if keys.is_empty() || keys.len() > MAX_SEND_KEYS {
        return Err("按键序列长度不合法".to_string());
    }
    let scan_codes: Vec<i16> = keys.iter().map(|(key, _)| *key as i16).collect();
    let states: Vec<i16> = keys
        .iter()
        .map(|(_, down)| if *down { -1 } else { 0 })
        .collect();

    let unknown: IUnknown = control.cast().map_err(hr)?;
    let mut errors = Vec::new();
    for member in members {
        let signature_ok = member.params.len() == 4
            && matches!(base_type(member.params[0]), VT_I2 | VT_I4 | VT_INT)
            && base_type(member.params[3]) == VT_BOOL
            && !is_array_like(member.params[3]);
        if !signature_ok {
            errors.push("SendKeys 参数形态与预期不符".to_string());
            continue;
        }

        let (keys_vt, states_vt) = (member.params[1], member.params[2]);
        let array_form = is_array_like(keys_vt) && is_array_like(states_vt);
        let pointer_form = is_pointer_like(keys_vt) && is_pointer_like(states_vt);
        if !array_form && !pointer_form {
            errors.push("SendKeys 数组参数形态与预期不符".to_string());
            continue;
        }
        if array_form && (base_type(keys_vt) != VT_I2 || base_type(states_vt) != VT_BOOL) {
            errors.push(format!(
                "SendKeys SAFEARRAY 元素类型不支持（keys={:#06x}, states={:#06x}）",
                keys_vt, states_vt
            ));
            continue;
        }

        let Some(raw) = (unsafe { qi_raw(&unknown, &member.iid) }) else {
            errors.push(format!("QI {:?} 失败", member.iid));
            continue;
        };
        let vtbl = unsafe { *(raw as *const *const usize) };
        let slot = unsafe { *vtbl.add(member.index) };

        let result = if array_form {
            let Some(keys_array) = create_safearray(&scan_codes, VT_I2) else {
                errors.push("创建按键 SAFEARRAY 失败".to_string());
                let _guard = unsafe { IUnknown::from_raw(raw) };
                continue;
            };
            let states_array = create_safearray(&states, VT_BOOL);
            let result = match states_array {
                Some(states_array) => {
                    let function: unsafe extern "system" fn(
                        *mut c_void,
                        i32,
                        *const SAFEARRAY,
                        *const SAFEARRAY,
                        VARIANT_BOOL,
                    ) -> HRESULT = unsafe { std::mem::transmute(slot) };
                    unsafe {
                        function(
                            raw,
                            scan_codes.len() as i32,
                            keys_array,
                            states_array,
                            VARIANT_BOOL(0),
                        )
                    }
                }
                None => {
                    errors.push("创建按键状态 SAFEARRAY 失败".to_string());
                    HRESULT(E_POINTER.0)
                }
            };
            unsafe {
                let _ = SafeArrayDestroy(states_array.unwrap_or(std::ptr::null_mut()));
                let _ = SafeArrayDestroy(keys_array);
            }
            result
        } else {
            let mut keys_buffer = scan_codes.clone();
            let mut states_buffer: Vec<VARIANT_BOOL> = keys
                .iter()
                .map(|(_, down)| VARIANT_BOOL(if *down { -1 } else { 0 }))
                .collect();
            let function: unsafe extern "system" fn(
                *mut c_void,
                i32,
                *mut i16,
                *mut VARIANT_BOOL,
                VARIANT_BOOL,
            ) -> HRESULT = unsafe { std::mem::transmute(slot) };
            unsafe {
                function(
                    raw,
                    keys_buffer.len() as i32,
                    keys_buffer.as_mut_ptr(),
                    states_buffer.as_mut_ptr(),
                    VARIANT_BOOL(0),
                )
            }
        };
        let _guard = unsafe { IUnknown::from_raw(raw) };
        if result.is_ok() {
            return Ok(());
        }
        errors.push(hresult_text(result));
    }
    Err(errors.join(" | "))
}

fn send_remote_action_via_control(
    control: &IDispatch,
    index: &TypeLibIndex,
    action: i32,
) -> Result<(), String> {
    let members = index
        .methods
        .get("SendRemoteAction")
        .ok_or_else(|| "类型库中没有 SendRemoteAction 方法".to_string())?;
    let unknown: IUnknown = control.cast().map_err(hr)?;
    let mut errors = Vec::new();
    for member in members {
        if member.params.len() != 1 || !matches!(member.params[0] & 0x0FFF, VT_I2 | VT_I4 | VT_INT)
        {
            errors.push("SendRemoteAction 参数形态与预期不符".to_string());
            continue;
        }
        let Some(raw) = (unsafe { qi_raw(&unknown, &member.iid) }) else {
            errors.push(format!("QI {:?} 失败", member.iid));
            continue;
        };
        let vtbl = unsafe { *(raw as *const *const usize) };
        let slot = unsafe { *vtbl.add(member.index) };
        let function: unsafe extern "system" fn(*mut c_void, i32) -> HRESULT =
            unsafe { std::mem::transmute(slot) };
        let result = unsafe { function(raw, action) };
        let _guard = unsafe { IUnknown::from_raw(raw) };
        if result.is_ok() {
            return Ok(());
        }
        errors.push(hresult_text(result));
    }
    Err(errors.join(" | "))
}

/// 请求控件走自身的关闭流程（u2 使用；不存在时只记日志）。
#[allow(dead_code)]
pub fn request_close(app: &AppHandle) -> Result<(), String> {
    let app = app.clone();
    on_main_sync(&app, move || {
        HOST.with(|slot| {
            let guard = slot.borrow();
            let Some(host) = guard.as_ref() else {
                return Ok(());
            };
            invoke_method(&host.control, "RequestClose")
                .map_err(|error| format!("RequestClose 调用失败: {error}"))
        })
    })?
}

/// 主线程视角的宿主摘要（诊断用）。
pub fn diagnostics(app: &AppHandle) -> String {
    let app = app.clone();
    let summary = on_main_sync(&app, move || {
        HOST.with(|slot| {
            let guard = slot.borrow();
            match guard.as_ref() {
                Some(host) => format!(
                    "宿主窗口: 已创建 (hwnd=0x{:X})，事件订阅: {}",
                    host.hwnd.0 as isize,
                    if host.advised.is_some() { "是" } else { "否" }
                ),
                None => "宿主窗口: 未创建".to_string(),
            }
        })
    });
    match summary {
        Ok(text) => text,
        Err(error) => format!("宿主窗口: 状态不可用（{error}）"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reused_host_readvises_when_generation_changes() {
        assert!(needs_readvise(None, 7));
        assert!(needs_readvise(Some(6), 7));
        assert!(!needs_readvise(Some(7), 7));
    }

    #[test]
    fn send_keys_parameter_shapes_are_classified() {
        assert!(is_array_like(VT_ARRAY | VT_I2));
        assert!(is_pointer_like(VT_BYREF | VT_I2));
        assert!(is_pointer_like(VT_PTR));
        assert!(!is_pointer_like(VT_I2));
        assert_eq!(base_type(VT_ARRAY | VT_I2), VT_I2);
    }
}
