use std::env;
use std::fs;
use std::path::Path;
use std::process::ExitCode;

/// 命令行参数解析结果。
struct CliArgs {
    script_path: String,
    script_config: Option<serde_json::Value>,
    script_config_file_path: Option<String>,
}

/// `--config` 参数解析结果（值 + 可选来源文件路径）。
struct ParsedScriptConfigArg {
    value: serde_json::Value,
    file_path: Option<String>,
}

/// 规范化命令名（去掉路径与可执行后缀），用于帮助文案展示。
fn normalize_command_name(program_name: &str) -> String {
    let path = Path::new(program_name);
    if let Some(stem) = path.file_stem() {
        let normalized = stem.to_string_lossy().trim().to_string();
        if !normalized.is_empty() {
            return normalized;
        }
    }
    "dob-script".to_string()
}

/// 打印命令行帮助信息。
fn print_help(command_name: &str) {
    eprintln!("用法:");
    eprintln!("  {command_name} <script.js> [--config <json|config.json>]");
    eprintln!();
    eprintln!("选项:");
    eprintln!("  -h, --help          显示帮助信息");
    eprintln!("  --config <value>    传入 readConfig 使用的配置（JSON 字符串或 JSON 文件路径）");
    eprintln!();
    eprintln!("示例:");
    eprintln!("  {command_name} ./demo.js");
    eprintln!("  {command_name} ./demo.js --config '{{\"speed\": 2}}'");
    eprintln!("  {command_name} ./demo.js --config ./config.json");
}

/// 解析 `--config` 参数（支持 JSON 字符串或 JSON 文件路径）。
fn parse_script_config_arg(raw_config: &str) -> Result<ParsedScriptConfigArg, String> {
    let normalized = raw_config.trim();
    if normalized.is_empty() {
        return Err("config 参数不能为空。".to_string());
    }

    let config_path = Path::new(normalized);
    if config_path.exists() {
        if !config_path.is_file() {
            return Err(format!("config 路径不是文件: {normalized}"));
        }
        let content = fs::read_to_string(config_path)
            .map_err(|e| format!("读取 config 文件失败: {normalized}，错误: {e}"))?;
        let value = serde_json::from_str::<serde_json::Value>(content.as_str())
            .map_err(|e| format!("解析 config 文件 JSON 失败: {normalized}，错误: {e}"))?;
        return Ok(ParsedScriptConfigArg {
            value,
            file_path: Some(normalized.to_string()),
        });
    }

    let value = serde_json::from_str::<serde_json::Value>(normalized)
        .map_err(|e| format!("config 不是有效 JSON，且文件不存在: {normalized}，错误: {e}"))?;
    Ok(ParsedScriptConfigArg {
        value,
        file_path: None,
    })
}

/// 解析命令行参数并返回脚本路径与可选配置。
fn parse_cli_args() -> Result<CliArgs, ExitCode> {
    let mut args = env::args();
    let program_name = args.next().unwrap_or_else(|| "dob-script".to_string());
    let command_name = normalize_command_name(program_name.as_str());
    let mut script_path: Option<String> = None;
    let mut script_config: Option<serde_json::Value> = None;
    let mut script_config_file_path: Option<String> = None;

    while let Some(arg) = args.next() {
        if arg == "-h" || arg == "--help" {
            print_help(command_name.as_str());
            return Err(ExitCode::SUCCESS);
        }

        if arg == "--config" {
            let Some(raw_config) = args.next() else {
                eprintln!("--config 需要传入 JSON 字符串或 JSON 文件路径。");
                print_help(command_name.as_str());
                return Err(ExitCode::from(2));
            };
            if script_config.is_some() {
                eprintln!("--config 仅允许传入一次。");
                print_help(command_name.as_str());
                return Err(ExitCode::from(2));
            }
            match parse_script_config_arg(raw_config.as_str()) {
                Ok(parsed) => {
                    script_config = Some(parsed.value);
                    script_config_file_path = parsed.file_path;
                    continue;
                }
                Err(error) => {
                    eprintln!("{error}");
                    print_help(command_name.as_str());
                    return Err(ExitCode::from(2));
                }
            }
        }

        if let Some(raw_config) = arg.strip_prefix("--config=") {
            if script_config.is_some() {
                eprintln!("--config 仅允许传入一次。");
                print_help(command_name.as_str());
                return Err(ExitCode::from(2));
            }
            match parse_script_config_arg(raw_config) {
                Ok(parsed) => {
                    script_config = Some(parsed.value);
                    script_config_file_path = parsed.file_path;
                    continue;
                }
                Err(error) => {
                    eprintln!("{error}");
                    print_help(command_name.as_str());
                    return Err(ExitCode::from(2));
                }
            }
        }

        if arg.starts_with('-') {
            eprintln!("未知参数: {arg}");
            print_help(command_name.as_str());
            return Err(ExitCode::from(2));
        }

        if script_path.is_some() {
            eprintln!("仅支持传入一个脚本文件路径。");
            print_help(command_name.as_str());
            return Err(ExitCode::from(2));
        }
        script_path = Some(arg);
    }

    let Some(script_path) = script_path else {
        print_help(command_name.as_str());
        return Err(ExitCode::from(2));
    };

    Ok(CliArgs {
        script_path,
        script_config,
        script_config_file_path,
    })
}

/// CLI 主入口：执行脚本并透传退出码。
#[tokio::main]
async fn main() -> ExitCode {
    let cli_args = match parse_cli_args() {
        Ok(args) => args,
        Err(code) => return code,
    };

    match dna_builder_lib::run_script_cli(
        cli_args.script_path,
        cli_args.script_config,
        cli_args.script_config_file_path,
    )
    .await
    {
        Ok(result) => {
            if !result.trim().is_empty() {
                println!("{result}");
            }
            ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("{error}");
            ExitCode::from(1)
        }
    }
}
