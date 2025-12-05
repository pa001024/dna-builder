# 从data.xlsx中导出JSON数据
from numpy.f2py.auxfuncs import throw_error
import pandas as pd
import json
from pandas._config.config import is_int
import requests
from bs4 import BeautifulSoup
import re


def read_excel(sheet_name):
    # 使用正确的相对路径读取data.xlsx文件
    df = pd.read_excel("src/data/data.xlsx", sheet_name=sheet_name)

    # 读取数据
    data = df.to_dict(orient="records")

    # 处理数据：去除NaN值并将整数形式的浮点数转换为整数
    for item in data:
        # 遍历字典的副本以避免在迭代过程中修改字典大小
        for key, value in list(item.items()):
            if pd.isna(value):
                del item[key]
            elif isinstance(value, float):
                if value.is_integer():
                    # 将整数形式的浮点数转换为整数
                    item[key] = int(value)
                else:
                    item[key] = round(value, 3)

    return data


# 读取不同工作表的数据
# ch = read_excel("角色")
ct = read_excel("代码") + [
    {
        "序号": 101,
        "名称": "决断·冥想(没出)",
        "系列": "牧神",
        "品质": "紫",
        "类型": "角色",
    },
    {
        "序号": 102,
        "名称": "决断·刹那(没出)",
        "系列": "牧神",
        "品质": "紫",
        "类型": "角色",
    },
]
mod1 = read_excel("角色MOD")
mod2 = read_excel("武器MOD")
wp = read_excel("武器")
mlb = read_excel("近战倍率")
rgb = read_excel("远程倍率")
swb = read_excel("同律倍率")
# skl = read_excel('技能')
buff = read_excel("BUFF")
mob = read_excel("怪物")

# 处理mod1：将属性长度大于1的项目拆分
# 创建新数组存储处理后的角色MOD
new_mod1 = []

for item in mod1:
    # 检查是否有属性字段且属性长度大于1
    if "属性" in item and len(item["属性"]) > 1:
        # 遍历属性字符串的每个字符
        for attr in item["属性"]:
            # 创建新项，复制原项的所有属性
            new_item = item.copy()
            # 设置新的单个属性
            new_item["属性"] = attr
            # 添加到新数组
            new_mod1.append(new_item)
    else:
        # 没有属性字段或属性长度为1，直接添加
        new_mod1.append(item)

# 替换原mod1数组
mod1 = new_mod1

# 为每一项添加类型"角色"
for item in mod1:
    item["类型"] = "角色"

# 将mod2和ct数组中的项目类型中的武器替换为空字符串
for item in mod2:
    item["类型"] = item["类型"].replace("武器", "")
for item in wp:
    item["类型"] = item["类型"].replace("武器", "")
for item in ct:
    if "类型" in item:
        item["类型"] = item["类型"].replace("武器", "")


# 合并mod1和mod2为一个数组mod
mod = mod1 + mod2

# 为了提高匹配效率，将ct数据转换为字典
# 对于有属性的项，使用"名称+品质+类型+属性"作为键；对于无属性的项，使用"名称+品质+类型"作为键
ct_dict = {}
for item in ct:
    # 确保所有必要的字段都存在
    if "名称" in item and "品质" in item and "类型" in item and "序号" in item:
        if "属性" in item and item["属性"] is not None:
            key = f"{item['名称']}_{item['品质']}_{item['类型']}_{item['属性']}"
        else:
            key = f"{item['名称']}_{item['品质']}_{item['类型']}"
        ct_dict[key] = item["序号"]

# 处理mod数据：根据名称、品质、类型和属性（如果有）匹配ct中的数据，并添加id字段
for item in mod:
    # 确保所有必要的字段都存在
    if "名称" in item and "品质" in item and "类型" in item:
        if "属性" in item and item["属性"] is not None:
            key = f"{item['名称']}_{item['品质']}_{item['类型']}_{item['属性']}"
        else:
            key = f"{item['名称']}_{item['品质']}_{item['类型']}"
        # 如果找到匹配的项，将序号作为id添加
        if key in ct_dict:
            # 重新构建字典，确保id在首位
            new_item = {"id": ct_dict[key], **item}
            item.clear()
            item.update(new_item)
        else:
            # 没有匹配到id，输出警告
            if "属性" in item and item["属性"] is not None:
                print(
                    f"警告: {item['名称']} {item['类型']} {item['品质']} {item['属性']}  mod未匹配到id"
                )
            else:
                print(
                    f"警告: {item['名称']} {item['类型']} {item['品质']}  mod未匹配到id"
                )
    else:
        # 缺少必要字段，输出警告
        print(f"警告: {item.get('名称', '未知名称')}  mod缺少必要字段，无法匹配id")

# 创建以名称为键、序号为值的字典，用于ct、ml、rg的id匹配
name_id_dict = {}
for item in ct:
    if "名称" in item and "序号" in item:
        name = item["名称"]
        # 如果名称已经存在，保留第一个出现的序号
        if name not in name_id_dict:
            name_id_dict[name] = item["序号"]

# 为wp（武器）中的每一项添加id字段（根据名称匹配）
for item in wp:
    if "名称" in item and item["名称"] in name_id_dict:
        # 重新构建字典，确保id在首位
        new_item = {"id": name_id_dict[item["名称"]], **item}
        item.clear()
        item.update(new_item)
    else:
        print(f"警告: {item['名称']}  武器未匹配到id")


charurls = {
    "菲娜": "https://dnabbs.yingxiong.com/pc/wiki/wikidetail/704194920704902544",
    "莉兹贝尔": "https://dnabbs.yingxiong.com/pc/wiki/wikidetail/756260789056179459",
    "妮弗尔夫人": "https://dnabbs.yingxiong.com/pc/wiki/wikidetail/704206454025881246",
    "赛琪": "https://dnabbs.yingxiong.com/pc/wiki/wikidetail/704212532172162945",
    "松露与榛子": "https://dnabbs.yingxiong.com/pc/wiki/wikidetail/704202657115410298",
    "丽蓓卡": "https://dnabbs.yingxiong.com/pc/wiki/wikidetail/704217615819607502",
    "琳恩": "https://dnabbs.yingxiong.com/pc/wiki/wikidetail/707866885789582655",
    "西比尔": "https://dnabbs.yingxiong.com/pc/wiki/wikidetail/704243153535766333",
    "幻景": "https://dnabbs.yingxiong.com/pc/wiki/wikidetail/704243898230246694",
    "塔比瑟": "https://dnabbs.yingxiong.com/pc/wiki/wikidetail/704244202933849387",
    "玛尔洁": "https://dnabbs.yingxiong.com/pc/wiki/wikidetail/704244363542136806",
    "海尔法": "https://dnabbs.yingxiong.com/pc/wiki/wikidetail/704244532887162708",
    "耶尔与奥利弗": "https://dnabbs.yingxiong.com/pc/wiki/wikidetail/704244628429209695",
    "奥特赛德": "https://dnabbs.yingxiong.com/pc/wiki/wikidetail/704244809937717730",
    "达芙涅": "https://dnabbs.yingxiong.com/pc/wiki/wikidetail/704244757672495752",
    "黎瑟": "https://dnabbs.yingxiong.com/pc/wiki/wikidetail/704244933610963858",
    "兰迪": "https://dnabbs.yingxiong.com/pc/wiki/wikidetail/704244876945916952",
    "贝蕾妮卡": "https://dnabbs.yingxiong.com/pc/wiki/wikidetail/690751013614781031",
    "狩月人": "https://dnabbs.yingxiong.com/pc/wiki/wikidetail/763696473488493172",
    "扶疏": "https://dnabbs.yingxiong.com/pc/wiki/wikidetail/704205070094305381",
    "止流": "https://dnabbs.yingxiong.com/pc/wiki/wikidetail/704243362521156832",
    "煜明": "https://dnabbs.yingxiong.com/pc/wiki/wikidetail/704242990134067975",
    "刻舟": "https://dnabbs.yingxiong.com/pc/wiki/wikidetail/708719280178332161",
    "希尔妲": "https://dnabbs.yingxiong.com/pc/wiki/wikidetail/704241713169828849",
}


def getCharSkills(name, url, download=False, retry=3):
    info = {}
    if name_id_dict.get(name):
        info["id"] = name_id_dict.get(name)
    else:
        print(f"警告: {name}  角色未匹配到id")

    if retry <= 0:
        print(f"{url} 超出重试上限")
        exit(1)
    try:
        # 发送HTTP请求获取页面内容
        response = requests.get(url, timeout=10)
        response.raise_for_status()  # 检查请求是否成功

        # 使用BeautifulSoup解析HTML
        soup = BeautifulSoup(response.text, "html.parser")

        def onetext(s):
            el = soup.select_one(s)
            if el and el.get_text(strip=True):
                return el.get_text(strip=True)
            # print(f"警告: {url}: {s} 未匹配到文本")
            # 保存response.text到文件debug.html
            with open("debug.html", "w", encoding="utf-8") as debug_file:
                debug_file.write(response.text)
            raise Exception(f"{url}: {s} 未匹配到文本")

        def texts(s):
            return [element.get_text(strip=True) for element in soup.select(s)]

        # 获取角色名称
        info["名称"] = 名称 = name
        banners = [img.get("src") for img in soup.select(".role-img-wrapper > img")]
        bannerNames = ["角色立绘", "皮肤立绘", "皮肤立绘2", "皮肤立绘3"]

        # 获取角色属性
        info["属性"] = 属性 = onetext(
            ".first-is-role-compo .label-box:nth-child(6)"
        ).replace("角色属性：", "")

        def getCharStats(y, x):
            return soup.select_one(
                f".body-full-height.body > div:nth-child(2) > div.tab-content-box:nth-child(9) > div > div.tab-content-body > div > article > div > table > tbody > tr:nth-child({y}) > td:nth-child({x})"
            ).get_text(strip=True)

        def parseValue(s):
            s = s.replace("％", "%").replace("＋", "+")
            p = s.split("+")
            prop = re.search(r"生命|防御|神智|护盾", p[0])
            # 正确提取百分数：保留百分号并转为小数
            percent_match = re.search(r"([-+]?\d*\.?\d+)%", s)
            if percent_match:
                s = round(float(percent_match.group(1)) / 100, 3)
            else:
                # 非百分数则提取普通数字
                numeric_part = re.search(r"[-+]?\d*\.?\d+", s)
                if numeric_part:
                    s = float(numeric_part.group())
            if type(s) is float and s.is_integer():
                s = int(s)
            return s, prop, int(p[1]) if len(p) > 1 else None

        # 获取角色攻击(80级)
        info["基础攻击"] = float(getCharStats(3, 2))
        info["基础生命"] = int(getCharStats(3, 4))
        info["基础护盾"] = int(getCharStats(4, 2))
        info["基础防御"] = int(getCharStats(4, 4))
        info["基础神智"] = int(getCharStats(5, 4))
        武器精通 = getCharStats(5, 2).split("/")
        if len(武器精通) < 2:
            info["近战"] = "全部类型"
            info["远程"] = "全部类型"
        else:
            info["近战"] = 武器精通[0]
            info["远程"] = 武器精通[1]
        hasSW = onetext(".module-page-item:nth-child(2) .pre-item-name") == "同律武器"
        if hasSW:
            info["同律武器"] = onetext(
                ".module-page-item:nth-child(2) .module-child-content > div:nth-child(2) tr:first-child > td:nth-child(2)"
            )
        base = (
            hasSW
            and ".module-page-item:nth-child(3)"
            or ".module-page-item:nth-child(2)"
        )

        # 获取技能名
        skill_name = texts(
            f"{base} .body-content-pre:nth-child(3) .table-scroll-wrapper:nth-child(1) tbody tr:nth-child(1) td:nth-child(1)"
        )
        # 获取技能类型
        skill_type = texts(f"{base} .tab-item")
        if len(skill_name) != len(skill_type):
            raise Exception(
                f"{url} {info} 获取skill_type失败: {skill_name}{skill_type}"
            )

        # 使用 map.call 方式抓取被动技能相关文本
        passive_cells = soup.select(
            ".tab-content-box:nth-child(6) article > div:nth-child(2) > table > tbody > tr:nth-child(3) > td:nth-child(1),"
            ".tab-content-box:nth-child(6) article > div:nth-child(2) > table > tbody > tr:nth-child(3) > td:nth-child(2),"
            ".tab-content-box:nth-child(7) article > div:nth-child(2) > table > tbody > tr:nth-child(3) > td:nth-child(1),"
            ".tab-content-box:nth-child(7) article > div:nth-child(2) > table > tbody > tr:nth-child(3) > td:nth-child(2)"
        )
        passive_texts = [cell.get_text(strip=True) for cell in passive_cells]

        keyMap = {
            "攻击力": "攻击",
            "武器暴击率": "暴击",
            "武器暴击伤害": "暴伤",
            "武器多重射击": "多重",
            "技能威力": "威力",
            "技能范围": "范围",
            "技能耐久": "耐久",
            "技能效益": "效益",
        }
        # 将被动文本按“+”拆成两段，分别作为“被动效果1”“被动效果2”写入info
        for index, passive_text in enumerate(passive_texts):
            passive_text = passive_text.replace("＋", "+")
            if len(passive_text.split("+")) < 2:
                print(f"警告: {名称} {url}: 被动技能 {passive_text} 格式错误")
                exit(1)
            key, value = passive_text.split("+")
            mappedKey = keyMap.get(key, key)
            val, _, _ = parseValue(value)
            if mappedKey not in info:
                info[mappedKey] = val
            else:
                info[mappedKey] += val

        # 技能表格
        target_elements = soup.select(
            ".body-full-height.body > div:nth-child(2) > div.tab-content-box > div > div.tab-content-body > div > article > div:nth-child(3) > table > tbody"
        )
        # 解析TABLE

        skills = [
            {"名称": name, "类型": skill_type[index]}
            for index, name in enumerate(skill_name)
        ]
        # print(info, skills)
        for index, skill in enumerate(skills):
            rows = target_elements[index].find_all("tr")

            row0 = rows[0].find_all("td")[2:]
            for row_index, row in enumerate(rows[1:]):
                cells = row.find_all("td")
                row_name = cells[0].get_text(strip=True)
                if row_name == "升级素材":
                    continue
                属性影响_list = re.findall(
                    r"威力|效益|耐久|范围", cells[1].get_text(strip=True)
                )
                属性影响_list.sort()
                属性影响 = ",".join(属性影响_list)
                skills[index][row_name] = {}
                if 属性影响:
                    skills[index][row_name]["属性影响"] = 属性影响
                if len(cells) >= 2:
                    for cell_index, cell in enumerate(cells[2:]):
                        skill_value = cell.get_text(strip=True)
                        if skill_value == "/":
                            continue
                        skill_value, prop, extra = parseValue(skill_value)
                        title = row0[cell_index].get_text(strip=True)
                        if title.startswith("LV"):
                            if prop:
                                skills[index][row_name]["参数"] = prop
                            # level = title[2:]
                            if "值" not in skills[index][row_name]:
                                skills[index][row_name]["值"] = []
                            skills[index][row_name]["值"].append(skill_value)
                            if extra:
                                if "额外" not in skills[index][row_name]:
                                    skills[index][row_name]["额外"] = []
                                skills[index][row_name]["额外"].append(extra)
                        else:
                            skills[index][row_name][title] = skill_value
                        # 检查所有等级下的数值是否相同，如果相同则将数组替换为数字
                if all(
                    v == skills[index][row_name]["值"][0]
                    for v in skills[index][row_name]["值"]
                ):
                    skills[index][row_name]["值"] = skills[index][row_name]["值"][0]

        info["技能"] = skills
        # 下载 banner 到 /public/imgs/ 目录，储存为“角色名+full.png”
        if download:
            for index, banner in enumerate(banners):
                banner_url = banner
                banner_path = f"public/imgs/{名称}{bannerNames[index]}.png"
                try:
                    banner_resp = requests.get(banner_url, timeout=10)
                    banner_resp.raise_for_status()
                    with open(banner_path, "wb") as img_file:
                        img_file.write(banner_resp.content)
                except Exception as e:
                    print(f"下载 {名称} 的 banner 失败: {e}")
    except requests.RequestException as e:
        print(f"请求{url}时出错: {e}")
    except Exception as e:
        print(f"处理{url}, {info} 时出错: {e}")
        return getCharSkills(name, url, download, retry - 1)
    return info


# 为ch（角色）中的每一项添加id字段（根据名称匹配）
# for item in ch:
#     if "名称" in item and item["名称"] in name_id_dict:
#         # 重新构建字典，确保id在首位
#         new_item = {"id": name_id_dict[item["名称"]], **item}
#         item.clear()
#         item.update(new_item)
#     else:
#         print(f"警告: {item['名称']}  角色未匹配到id")
ch = [getCharSkills(v, charurls[v], False) for v in charurls]

# 对最终输出的各数组按id升序排序
ch.sort(key=lambda x: x.get("id", 0))
mod.sort(key=lambda x: x.get("id", 0))
wp.sort(key=lambda x: x.get("id", 0))

# 合并mlb、rgb为一个数组base
base = mlb + rgb + swb


# 将数据导出为JSON文件到src/data目录
with open("src/data/data.json", "w", encoding="utf-8") as f:
    json.dump(
        {
            # "code": ct,
            "char": ch,
            "mod": [
                {
                    "id": 100,
                    "名称": "裂罅MOD",
                    "系列": "裂罅",
                    "品质": "金",
                    "极性": "V",
                    "耐受": 24,
                    "类型": "角色",
                },
            ]
            + mod,  # 添加合并后的mod数组
            "weapon": wp,  # 添加武器数组
            "base": base,  # 合并后的倍率数组
            # "skill": skl,  # 添加技能数组
            "buff": buff,  # 添加BUFF数组
            "mob": mob,  # 添加怪物数组
        },
        f,
        ensure_ascii=False,
        indent=4,
    )


# with open('src/data/code.json', 'w', encoding='utf-8') as f:
#     json.dump(ct, f, ensure_ascii=False, indent=2)

# LET(n,I95,
# MID("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ", MOD(n/POWER(36,3), 36) + 1, 1)&
# MID("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ", MOD(n/POWER(36,2), 36) + 1, 1)&
# MID("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ", MOD(n/POWER(36,1), 36) + 1, 1)&
# MID("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ", MOD(n, 36) + 1, 1)
# )
