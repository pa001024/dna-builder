// wasm32-unknown-unknown 裸机缺标准头文件。提供编译所需的最小声明。
// stderr/fprintf 仅在错误日志路径被引用，实际不执行。
#pragma once

typedef struct _FILE FILE;
extern FILE *stderr;
extern FILE *stdout;

int fprintf(FILE *f, const char *fmt, ...);
int printf(const char *fmt, ...);
