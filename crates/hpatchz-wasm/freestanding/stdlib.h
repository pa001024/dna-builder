// wasm32-unknown-unknown 裸机缺标准头文件。提供编译所需的最小声明。
#pragma once

typedef unsigned long size_t;

#define NULL ((void *)0)

void *malloc(size_t n);
void free(void *p);
void *calloc(size_t n, size_t sz);
void *realloc(void *p, size_t n);
void abort(void);

typedef int (*__compar_fn_t)(const void *, const void *);
void qsort(void *base, size_t nmemb, size_t size, __compar_fn_t compar);
