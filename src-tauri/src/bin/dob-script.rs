use std::env;
use std::process::ExitCode;

/// 打印命令行帮助信息。
fn print_help(program_name: &str) {
    eprintln!("用法:");
    eprintln!("  {program_name} <script.js>");
    eprintln!();
    eprintln!("示例:");
    eprintln!("  {program_name} ./demo.js");
}

/// 解析命令行参数并返回脚本路径。
fn parse_script_path() -> Result<String, ExitCode> {
    let mut args = env::args();
    let program_name = args.next().unwrap_or_else(|| "dob-script".to_string());
    let Some(first_arg) = args.next() else {
        print_help(program_name.as_str());
        return Err(ExitCode::from(2));
    };

    if first_arg == "-h" || first_arg == "--help" {
        print_help(program_name.as_str());
        return Err(ExitCode::SUCCESS);
    }

    if args.next().is_some() {
        eprintln!("仅支持传入一个脚本文件路径。");
        print_help(program_name.as_str());
        return Err(ExitCode::from(2));
    }

    Ok(first_arg)
}

/// CLI 主入口：执行脚本并透传退出码。
#[tokio::main]
async fn main() -> ExitCode {
    let script_path = match parse_script_path() {
        Ok(path) => path,
        Err(code) => return code,
    };

    match dna_builder_lib::run_script_cli(script_path).await {
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
