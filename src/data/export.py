# 从data.xlsx中导出JSON数据
import pandas as pd
import json

def read_excel(sheet_name):
    # 使用正确的相对路径读取data.xlsx文件
    df = pd.read_excel('src/data/data.xlsx', sheet_name=sheet_name)

    # 读取数据
    data = df.to_dict(orient='records')

    # 处理数据：去除NaN值并将整数形式的浮点数转换为整数
    for item in data:
        # 遍历字典的副本以避免在迭代过程中修改字典大小
        for key, value in list(item.items()):
            if pd.isna(value):
                del item[key]
            elif isinstance(value, float) and value.is_integer():
                # 将整数形式的浮点数转换为整数
                item[key] = int(value)

    return data

# 读取不同工作表的数据
ch = read_excel('角色')
ct = read_excel('代码')
mod1 = read_excel('角色MOD')
mod2 = read_excel('武器MOD')
wp = read_excel('武器')
mlb = read_excel('近战倍率')
rgb = read_excel('远程倍率')
swb = read_excel('同律倍率')
skl = read_excel('技能')
buff = read_excel('BUFF')
mob = read_excel('怪物')

# 处理mod1：将属性长度大于1的项目拆分
# 创建新数组存储处理后的角色MOD
new_mod1 = []

for item in mod1:
    # 检查是否有属性字段且属性长度大于1
    if '属性' in item and len(item['属性']) > 1:
        # 遍历属性字符串的每个字符
        for attr in item['属性']:
            # 创建新项，复制原项的所有属性
            new_item = item.copy()
            # 设置新的单个属性
            new_item['属性'] = attr
            # 添加到新数组
            new_mod1.append(new_item)
    else:
        # 没有属性字段或属性长度为1，直接添加
        new_mod1.append(item)

# 替换原mod1数组
mod1 = new_mod1

# 为每一项添加类型"角色"
for item in mod1:
    item['类型'] = '角色'

# 将mod2和ct数组中的项目类型中的武器替换为空字符串
for item in mod2:
    item['类型'] = item['类型'].replace('武器', '')
for item in wp:
    item['类型'] = item['类型'].replace('武器', '')
for item in ct:
    if '类型' in item:
        item['类型'] = item['类型'].replace('武器', '')


# 合并mod1和mod2为一个数组mod
mod = mod1 + mod2

# 为了提高匹配效率，将ct数据转换为字典
# 对于有属性的项，使用"名称+品质+类型+属性"作为键；对于无属性的项，使用"名称+品质+类型"作为键
ct_dict = {}
for item in ct:
    # 确保所有必要的字段都存在
    if '名称' in item and '品质' in item and '类型' in item and '序号' in item:
        if '属性' in item and item['属性'] is not None:
            key = f"{item['名称']}_{item['品质']}_{item['类型']}_{item['属性']}"
        else:
            key = f"{item['名称']}_{item['品质']}_{item['类型']}"
        ct_dict[key] = item['序号']

# 处理mod数据：根据名称、品质、类型和属性（如果有）匹配ct中的数据，并添加id字段
for item in mod:
    # 确保所有必要的字段都存在
    if '名称' in item and '品质' in item and '类型' in item:
        if '属性' in item and item['属性'] is not None:
            key = f"{item['名称']}_{item['品质']}_{item['类型']}_{item['属性']}"
        else:
            key = f"{item['名称']}_{item['品质']}_{item['类型']}"
        # 如果找到匹配的项，将序号作为id添加
        if key in ct_dict:
            item['id'] = ct_dict[key]
        else:
            # 没有匹配到id，输出警告
            if '属性' in item and item['属性'] is not None:
                print(f"警告: {item['名称']} {item['类型']} {item['品质']} {item['属性']}  mod未匹配到id")
            else:
                print(f"警告: {item['名称']} {item['类型']} {item['品质']}  mod未匹配到id")
    else:
        # 缺少必要字段，输出警告
        print(f"警告: {item.get('名称', '未知名称')}  mod缺少必要字段，无法匹配id")

# 创建以名称为键、序号为值的字典，用于ct、ml、rg的id匹配
name_id_dict = {}
for item in ct:
    if '名称' in item and '序号' in item:
        name = item['名称']
        # 如果名称已经存在，保留第一个出现的序号
        if name not in name_id_dict:
            name_id_dict[name] = item['序号']

# 为wp（武器）中的每一项添加id字段（根据名称匹配）
for item in wp:
    if '名称' in item and item['名称'] in name_id_dict:
        item['id'] = name_id_dict[item['名称']]
    else:
        print(f"警告: {item['名称']}  武器未匹配到id")

# 为ch（角色）中的每一项添加id字段（根据名称匹配）
for item in ch:
    if '名称' in item and item['名称'] in name_id_dict:
        item['id'] = name_id_dict[item['名称']]
    else:
        print(f"警告: {item['名称']}  角色未匹配到id")

# 将数据导出为JSON文件到src/data目录
with open('src/data/data.json', 'w', encoding='utf-8') as f:
    json.dump({
        'char': ch,
        'mod': mod,  # 添加合并后的mod数组
        'weapon': wp,  # 添加武器数组
        'meleeBase': mlb,  # 添加近战倍率数组
        'rangedBase': rgb,  # 添加远程倍率数组
        'skillWeaponBase': swb,  # 添加同律倍率数组
        'skill': skl,  # 添加技能数组
        'buff': buff,  # 添加BUFF数组
        'mob': mob  # 添加怪物数组
    }, f, ensure_ascii=False, indent=2)

# with open('src/data/code.json', 'w', encoding='utf-8') as f:
#     json.dump(ct, f, ensure_ascii=False, indent=2)

# LET(n,I95,
# MID("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ", MOD(n/POWER(36,3), 36) + 1, 1)&
# MID("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ", MOD(n/POWER(36,2), 36) + 1, 1)&
# MID("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ", MOD(n/POWER(36,1), 36) + 1, 1)&
# MID("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ", MOD(n, 36) + 1, 1)
# )