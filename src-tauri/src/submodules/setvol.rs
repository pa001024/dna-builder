use widestring::U16CString;
use windows::Win32::Media::Audio::{
    EDataFlow, ERole, IAudioSessionControl2, IAudioSessionManager2, ISimpleAudioVolume,
};
use windows::Win32::Media::Audio::{IMMDeviceEnumerator, MMDeviceEnumerator};
use windows::Win32::System::Com::{
    CLSCTX_ALL, CoCreateInstance, CoInitialize, CoTaskMemFree, CoUninitialize,
};
use windows::core::{Interface, Result};

const ERENDER: EDataFlow = EDataFlow(0); // eRender
const ECONSOLE: ERole = ERole(0); // eConsole

// 从会话标识符中提取文件名的辅助函数
#[inline]
fn extract_file_name_from_identifier(identifier: &str) -> Option<String> {
    // 尝试从标识符中提取文件名（通常包含进程名称）
    // 例如: "chrome.exe"
    if let Some(pos) = identifier.rfind('\\') {
        // 包含路径的情况
        identifier[pos + 1..].to_string().into()
    } else if let Some(pos) = identifier.rfind('/') {
        // Linux风格路径
        identifier[pos + 1..].to_string().into()
    } else {
        // 已经是文件名
        identifier.to_string().into()
    }
}

// 设置程序音量函数
pub fn set_program_volume(program_name: String, volume: f32) -> i32 {
    // 验证音量范围
    if volume < 0.0 || volume > 1.0 {
        return -1; // 参数无效
    }

    // 初始化COM
    if unsafe { CoInitialize(None).is_err() } {
        println!("COM初始化失败");
        return -1;
    }

    // 用于记录是否成功设置了任何程序的音量
    let mut found = false;

    // 在unsafe块中执行所有COM操作
    unsafe {
        // 创建MMDeviceEnumerator实例
        let enumerator: Result<IMMDeviceEnumerator> =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL);

        if let Ok(enumerator) = enumerator {
            // 获取默认音频渲染设备
            let device = enumerator.GetDefaultAudioEndpoint(ERENDER, ECONSOLE);

            if let Ok(device) = device {
                // 获取音频会话管理器
                let manager = device.Activate::<IAudioSessionManager2>(CLSCTX_ALL, None);

                if let Ok(manager) = manager {
                    // 获取IAudioSessionEnumerator接口来枚举所有会话
                    let session_enumerator = manager.GetSessionEnumerator();

                    if let Ok(session_enumerator) = session_enumerator {
                        // 获取会话数量
                        let count = session_enumerator.GetCount();

                        if let Ok(count) = count {
                            // 遍历所有会话
                            for i in 0..count {
                                // 获取当前会话
                                let session_control = session_enumerator.GetSession(i);

                                if let Ok(session_control) = session_control {
                                    // 查询IAudioSessionControl2接口
                                    let session_control2: Result<IAudioSessionControl2> =
                                        session_control.cast();

                                    if let Ok(session_control2) = session_control2 {
                                        // 获取会话标识符（通常包含进程名称）
                                        match session_control2.GetSessionIdentifier() {
                                            Ok(name_ptr) => {
                                                // 获取PWSTR的原始指针
                                                let raw_ptr = name_ptr.as_ptr();

                                                if !raw_ptr.is_null() {
                                                    // 转换标识符为Rust字符串
                                                    let str_obj = U16CString::from_ptr_str(raw_ptr);
                                                    let identifier = str_obj.to_string_lossy();

                                                    // 提取文件名并与目标程序名比较
                                                    if let Some(file_name) =
                                                        extract_file_name_from_identifier(
                                                            &identifier,
                                                        )
                                                    {
                                                        // println!("找到会话: {}", file_name);

                                                        // 忽略大小写进行比较
                                                        if file_name
                                                            .to_lowercase()
                                                            .contains(&program_name.to_lowercase())
                                                        {
                                                            // 获取ISimpleAudioVolume接口
                                                            match session_control
                                                                .cast::<ISimpleAudioVolume>()
                                                            {
                                                                Ok(simple_volume) => {
                                                                    // 设置音量
                                                                    if simple_volume
                                                                        .SetMasterVolume(
                                                                            volume as f32,
                                                                            std::ptr::null(),
                                                                        )
                                                                        .is_ok()
                                                                    {
                                                                        // println!(
                                                                        //     "成功设置程序 '{}' 的音量为 {}",
                                                                        //     file_name, volume
                                                                        // );
                                                                        found = true;
                                                                    }
                                                                }
                                                                Err(e) => println!(
                                                                    "获取音量控制接口失败: {:?}",
                                                                    e
                                                                ),
                                                            }
                                                        }
                                                    }
                                                }
                                                // 手动调用CoTaskMemFree释放PWSTR内存
                                                CoTaskMemFree(Some(raw_ptr as *mut _))
                                            }
                                            Err(e) => println!("获取会话标识符失败: {:?}", e),
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // 清理COM资源
    unsafe {
        CoUninitialize();
    }

    // 如果找到并设置了音量，返回0；否则返回1表示未找到匹配的程序
    if found {
        0
    } else {
        1 // 未找到匹配的程序
    }
}
