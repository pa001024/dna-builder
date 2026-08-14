// wasm32-unknown-unknown 裸机缺少标准 C 库。这里提供 HDiffPatch patch.c
// 引用的最小 libc 子集。qsort 用插入排序实现，适用于差分头部的少量元素。

typedef unsigned long size_t;

void *memcpy(void *dst, const void *src, size_t n) {
    unsigned char *d = (unsigned char *)dst;
    const unsigned char *s = (const unsigned char *)src;
    while (n--) *d++ = *s++;
    return dst;
}

void *memmove(void *dst, const void *src, size_t n) {
    unsigned char *d = (unsigned char *)dst;
    const unsigned char *s = (const unsigned char *)src;
    if (d < s) {
        while (n--) *d++ = *s++;
    } else {
        d += n;
        s += n;
        while (n--) *--d = *--s;
    }
    return dst;
}

void *memset(void *dst, int c, size_t n) {
    unsigned char *d = (unsigned char *)dst;
    while (n--) *d++ = (unsigned char)c;
    return dst;
}

int memcmp(const void *a, const void *b, size_t n) {
    const unsigned char *x = (const unsigned char *)a;
    const unsigned char *y = (const unsigned char *)b;
    while (n--) {
        if (*x != *y) return (int)*x - (int)*y;
        ++x;
        ++y;
    }
    return 0;
}

int strcmp(const char *a, const char *b) {
    while (*a && *a == *b) {
        ++a;
        ++b;
    }
    return (unsigned char)*a - (unsigned char)*b;
}

size_t strlen(const char *s) {
    const char *p = s;
    while (*p) ++p;
    return (size_t)(p - s);
}

typedef int (*__compar_fn_t)(const void *, const void *);

void qsort(void *base, size_t nmemb, size_t size, __compar_fn_t compar) {
    if (nmemb < 2 || size == 0) return;
    unsigned char *b = (unsigned char *)base;
    // 插入排序：差分头部元素数量很少，避免额外的栈内存分配。
    for (size_t i = 1; i < nmemb; ++i) {
        for (size_t j = i; j > 0; --j) {
            unsigned char *cur = b + j * size;
            unsigned char *prev = cur - size;
            if (compar(prev, cur) <= 0) break;
            // 交换 cur <-> prev
            for (size_t k = 0; k < size; ++k) {
                unsigned char t = cur[k];
                cur[k] = prev[k];
                prev[k] = t;
            }
        }
    }
}
