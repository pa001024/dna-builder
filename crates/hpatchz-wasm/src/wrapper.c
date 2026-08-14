// 薄封装：把 HDiffPatch 的整块内存补丁应用暴露给 Rust FFI。
// 所有输入输出都位于 wasm 线性内存中，通过 mem 流完成，无文件系统依赖。
#include "patch.h"

// 解析差分头部的目标新文件大小；失败返回 0。
unsigned long long hpatchz_new_size(const unsigned char* diff, unsigned long long diffLen) {
    hpatch_TStreamInput diffStream;
    hpatch_compressedDiffInfo diffInfo;
    mem_as_hStreamInput(&diffStream, diff, diff + diffLen);
    if (!getCompressedDiffInfo(&diffInfo, &diffStream)) return 0;
    return diffInfo.newDataSize;
}

// 应用差分：old + diff -> out。返回 1 成功，0 差分头部无效，
// -2 含压缩段(需 zlib，暂不支持)，-3 应用失败。
int hpatchz_apply_c(const unsigned char* old, unsigned long long oldLen,
                    const unsigned char* diff, unsigned long long diffLen,
                    unsigned char* out, unsigned long long outLen) {
    hpatch_TStreamInput oldStream, diffStream;
    hpatch_TStreamOutput outStream;
    hpatch_compressedDiffInfo diffInfo;
    mem_as_hStreamInput(&oldStream, old, old + oldLen);
    mem_as_hStreamInput(&diffStream, diff, diff + diffLen);
    mem_as_hStreamOutput(&outStream, out, out + outLen);
    if (!getCompressedDiffInfo(&diffInfo, &diffStream)) return 0;
    // uncompressed HDiff (服务端 hdiffz 默认输出 compressType=="") 无需解压插件。
    // 含压缩段时返回 -2，由前端回退整包下载。
    if (diffInfo.compressedCount != 0) return -2;
    // 临时缓存：patch.c 在此划分子缓存。64KB 对数据包 zip 足够。
    static unsigned char s_temp_cache[hpatch_kStreamCacheSize * 16];
    if (!patch_decompress_with_cache(&outStream, &oldStream, &diffStream, 0,
                                     s_temp_cache, s_temp_cache + sizeof(s_temp_cache))) {
        return -3;
    }
    return 1;
}
