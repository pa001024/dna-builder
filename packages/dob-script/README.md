# dob-script

用于在命令行执行 DNA Builder 脚本文件的工具。

## 安装

```bash
npm i -g dob-script
```

## 使用

```bash
dob-script ./example.js
```

也可以直接执行 HTTP(S) 远程脚本（远程脚本中的相对 ESM `import` 会按脚本地址解析）：

```bash
dob-script https://example.com/example.js
```

## 平台

当前仅提供 Windows 可执行文件（`dob-script.exe`）。
