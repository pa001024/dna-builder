// wasm32-unknown-unknown 裸机缺标准头文件。这里提供 HDiffPatch 补丁侧编译
// 所需的最小声明。所有函数在 wasm_libc.c 中实现。
#pragma once

typedef unsigned long size_t;
typedef unsigned int uint32_t;
typedef unsigned long long uint64_t;

void *memcpy(void *dst, const void *src, size_t n);
void *memmove(void *dst, const void *src, size_t n);
void *memset(void *dst, int c, size_t n);
int memcmp(const void *a, const void *b, size_t n);
int strcmp(const char *a, const char *b);
size_t strlen(const char *s);
