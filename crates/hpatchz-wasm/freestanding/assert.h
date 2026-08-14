// wasm32-unknown-unknown 裸机缺标准头文件。断言编译为空实现。
#pragma once

#define assert(x) ((void)0)
