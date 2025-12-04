import { describe, it, expect } from 'vitest';
import { LeveledMod, LeveledBuff, LeveledChar, LeveledWeapon } from './leveled';

// 测试LeveledMod类
describe('LeveledMod类测试', () => {
  // 测试1：创建带等级的MOD
  it('成功创建带等级的MOD', () => {
    const 炽灼3级 = new LeveledMod(11001, 3);
    expect(炽灼3级).toBeTruthy();
    expect(炽灼3级.等级).toBe(3);
  });

  // 测试2：创建不带等级的MOD（默认等级为1）
  it('成功创建默认等级的MOD', () => {
    const 炽灼默认级 = new LeveledMod(11001);
    expect(炽灼默认级).toBeTruthy();
    expect(炽灼默认级.等级).toBe(3);
  });

  // 测试3：设置超出上限的等级（应该被限制在等级上限）
  it('MOD等级被正确限制在等级上限', () => {
    const 雷鸣极昼 = new LeveledMod(51334, 20); // 金品质，等级上限10
    expect(雷鸣极昼.等级).toBe(10);
  });

  // 测试4：设置低于下限的等级（应该被限制在0）
  it('MOD等级被正确限制在0', () => {
    const 炽灼 = new LeveledMod(11001, -1);
    expect(炽灼.等级).toBe(0);
  });

  // 测试5：验证属性计算公式
  it('属性计算公式正确', () => {
    const 炽灼3级 = new LeveledMod(11001, 3);
    const 炽灼1级 = new LeveledMod(11001, 1);
    
    // 白品质，等级上限3，所以属性公式为：满级属性/(3+1)*(等级+1)
    // 3级时应该是：满级属性/4*4 = 满级属性
    // 1级时应该是：满级属性/4*2 = 满级属性/2
    
    // 白品质，等级上限3，所以属性公式为：满级属性/(3+1)*(等级+1)
    // 满级攻击是0.15，3级时：0.15/4*4 = 0.15
    // 1级时：0.15/4*2 = 0.075
    expect(炽灼3级.攻击).toBe(0.15);
    expect(炽灼1级.攻击).toBe(0.075);
  });

  // 测试6：获取完整属性
  it('获取完整属性包含等级和攻击信息', () => {
    const 炽灼3级 = new LeveledMod(11001, 3);
    const fullProps = 炽灼3级.getFullProperties();
    expect(fullProps.等级).toBeDefined();
    expect(fullProps.攻击).toBeDefined();
  });

  // 测试7：测试不存在的MOD ID
  it('测试不存在的MOD ID会抛出错误', () => {
    expect(() => {
      const 不存在的MOD = new LeveledMod(99999);
    }).toThrow(Error);
    
    expect(() => {
      const 不存在的MOD = new LeveledMod(99999);
    }).toThrow('99999');
  });
});

// 测试LeveledBuff类
describe('LeveledBuff类测试', () => {
  // 测试1：创建带等级的Buff
  it('成功创建带等级的Buff', () => {
    const 助战50攻2级 = new LeveledBuff('助战50攻', 2);
    expect(助战50攻2级).toBeTruthy();
    expect(助战50攻2级.等级).toBe(2);
  });

  // 测试2：创建不带等级的Buff（默认使用dx）
  it('成功创建默认等级的Buff', () => {
    const 助战50攻默认级 = new LeveledBuff('助战50攻');
    expect(助战50攻默认级).toBeTruthy();
    expect(助战50攻默认级.等级).toBe(1);
  });

  // 测试3：验证Buff属性计算公式
  it('Buff属性计算公式正确', () => {
    const 助战50攻1级 = new LeveledBuff('助战50攻', 1);
    const 助战50攻2级 = new LeveledBuff('助战50攻', 2);
    
    // 假设该Buff的参数为：a=1, b=1, lx=1, dx=1, mx=2
    // 攻击属性（实际是百分比）：
    // 1级时：0.5/1*(1+1/1*(1-1)) = 0.5*1 = 0.5
    // 2级时：0.5/1*(1+1/1*(2-1)) = 0.5*(1+1) = 1.0
    
    expect(助战50攻1级.攻击).toBe(0.5);
    expect(助战50攻2级.攻击).toBe(1.0);
  });

  // 测试4：设置超出上限的等级（应该被限制在mx）
  it('Buff等级被正确限制在mx', () => {
    const 助战50攻 = new LeveledBuff('助战50攻', 3); // mx=2
    expect(助战50攻.等级).toBe(2);
  });

  // 测试5：获取完整属性
  it('获取Buff完整属性包含等级和攻击信息', () => {
    const 助战50攻2级 = new LeveledBuff('助战50攻', 2);
    const fullProps = 助战50攻2级.getFullProperties();
    expect(fullProps.等级).toBeDefined();
    expect(fullProps.攻击).toBeDefined();
  });

  // 测试6：测试不存在的Buff名称
  it('测试不存在的Buff名称会抛出错误', () => {
    expect(() => {
      const 不存在的Buff = new LeveledBuff('不存在的Buff');
    }).toThrow(Error);
    
    expect(() => {
      const 不存在的Buff = new LeveledBuff('不存在的Buff');
    }).toThrow('不存在的Buff');
  });
});

// LeveledChar 测试套件
describe('LeveledChar', () => {
  it('应该能够创建角色实例', () => {
    const char = new LeveledChar('黎瑟');
    expect(char).toBeDefined();
    expect(char.名称).toBe('黎瑟');
    expect(char.属性).toBe('雷');
  });

  it('应该能够设置和获取角色等级', () => {
    const char = new LeveledChar('黎瑟');
    expect(char.等级).toBeUndefined();
    
    char.等级 = 50;
    expect(char.等级).toBe(50);
  });

  it('等级1时的属性计算正确', () => {
    const char = new LeveledChar('黎瑟', 1);
    expect(char.等级).toBe(1);
    
    // 80级基础攻击 * 0.079666848 = 276.15 * 0.079666848 ≈ 22.00
    expect(char.基础攻击).toBe(22);
    
    // 80级基础生命 * 0.079666848 = 1180 * 0.079666848 ≈ 94.00
    expect(char.基础生命).toBe(94);
    
    // 80级基础护盾 * 0.079666848 = 1180 * 0.079666848 ≈ 94.00
    expect(char.基础护盾).toBe(94);
    
    // 80级基础防御 * 0.079666848 = 276 * 0.079666848 ≈ 22.00
    expect(char.基础防御).toBe(22);
  });

  it('等级80时的属性计算正确（使用原始值）', () => {
    const char = new LeveledChar('黎瑟', 80);
    expect(char.等级).toBe(80);
    
    // 80级时应该使用原始值
    expect(char.基础攻击).toBe(276);
    expect(char.基础生命).toBe(1180);
    expect(char.基础护盾).toBe(1180);
    expect(char.基础防御).toBe(276);
  });

  it('等级50时的属性计算正确', () => {
    const char = new LeveledChar('黎瑟', 50);
    expect(char.等级).toBe(50);
    
    // 80级基础攻击 * 0.682636248 = 276.15 * 0.682636248 ≈ 188.5
    expect(char.基础攻击).toBe(189);
    
    // 80级基础生命 * 0.682636248 = 1180 * 0.682636248 ≈ 805.5
    expect(char.基础生命).toBe(806);
    
    // 80级基础护盾 * 0.682636248 = 1180 * 0.682636248 ≈ 805.5
    expect(char.基础护盾).toBe(806);
    
    // 80级基础防御 * 0.682636248 = 276 * 0.682636248 ≈ 188.4
    expect(char.基础防御).toBe(188);
  });

  it('等级超出范围时应该被限制', () => {
    const char = new LeveledChar('黎瑟', 100);
    expect(char.等级).toBe(80);
    
    char.等级 = 0;
    expect(char.等级).toBe(1);
  });

  it('应该能够获取完整的角色属性', () => {
    const char = new LeveledChar('黎瑟', 50);
    const fullProps = char.getFullProperties();
    
    expect(fullProps.名称).toBe('黎瑟');
    expect(fullProps.等级).toBe(50);
    expect(fullProps.基础攻击).toBe(189);
    expect(fullProps.属性).toBe('雷');
    expect(fullProps.近战).toBe('太刀');
    expect(fullProps.远程).toBe('突击枪');
    expect(fullProps.基础神智).toBe(150); // 神智不受等级影响
  });

  it('创建不存在的角色时应该抛出错误', () => {
    expect(() => {
      new LeveledChar('不存在的角色');
    }).toThrow('角色 "不存在的角色" 未在静态表中找到');
  });

  it('等级未设置时应该保持原始80级属性', () => {
    const char = new LeveledChar('黎瑟');
    expect(char.等级).toBeUndefined();
    
    // 未设置等级时应该使用原始80级值
    expect(char.基础攻击).toBe(276.15);
    expect(char.基础生命).toBe(1180);
    expect(char.基础护盾).toBe(1180);
    expect(char.基础防御).toBe(276);
  });
});

// 测试LeveledWeapon类
describe('LeveledWeapon类测试', () => {
  // 测试1：创建近战武器
  it('成功创建带等级的近战武器', () => {
    // 使用铸铁者的名称
    const 铸铁者5级 = new LeveledWeapon("铸铁者", 3, 5);
    expect(铸铁者5级).toBeTruthy();
    expect(铸铁者5级.名称).toBe("铸铁者");
    expect(铸铁者5级.类型).toBe("近战武器");
    expect(铸铁者5级.类别).toBe("重剑");
    expect(铸铁者5级.精炼).toBe(3);
    expect(铸铁者5级.等级).toBe(5);
  });

  // 测试2：创建远程武器
  it('成功创建带等级的远程武器', () => {
    // 使用烈焰孤沙的名称
    const 烈焰孤沙7级 = new LeveledWeapon("烈焰孤沙", 4, 7);
    expect(烈焰孤沙7级).toBeTruthy();
    expect(烈焰孤沙7级.名称).toBe("烈焰孤沙");
    expect(烈焰孤沙7级.类型).toBe("远程武器");
    expect(烈焰孤沙7级.类别).toBe("弓");
    expect(烈焰孤沙7级.精炼).toBe(4);
    expect(烈焰孤沙7级.等级).toBe(7);
  });

  // 测试3：创建默认等级的武器（默认等级为80，默认精炼为5）
  it('成功创建默认等级的武器', () => {
    const 铸铁者默认级 = new LeveledWeapon("铸铁者");
    expect(铸铁者默认级).toBeTruthy();
    expect(铸铁者默认级.精炼).toBe(5);
    expect(铸铁者默认级.等级).toBe(80);
  });

  // 测试3：设置超过上限的精炼等级（应该被限制在5）
  it('武器精炼等级被正确限制在精炼等级上限5', () => {
    const 铸铁者 = new LeveledWeapon("铸铁者", 15, 80);
    expect(铸铁者.精炼).toBe(5);
  });

  // 测试5：设置低于下限的精炼等级（应该被限制在0）
  it('武器精炼等级被正确限制在0', () => {
    const 铸铁者 = new LeveledWeapon("铸铁者", -1);
    expect(铸铁者.精炼).toBe(0);
  });

  // 测试6：设置超出上限的等级（应该被限制在80）
  it('武器等级被正确限制在等级上限80', () => {
    const 铸铁者 = new LeveledWeapon("铸铁者", 5, 90);
    expect(铸铁者.等级).toBe(80);
  });

  // 测试7：设置低于下限的等级（应该被限制在1）
  it('武器等级被正确限制在1', () => {
    const 铸铁者 = new LeveledWeapon("铸铁者", 5, 0);
    expect(铸铁者.等级).toBe(1);
  });

  // 测试8：验证基础攻击受等级影响
  it('武器基础攻击受等级影响', () => {
    const 铸铁者1级 = new LeveledWeapon("铸铁者", 0, 1);
    const 铸铁者80级 = new LeveledWeapon("铸铁者", 0, 80);
    
    // 1级时基础攻击 = 原始值 * 0.079666848
    // 80级时基础攻击 = 原始值 * 1
    expect(铸铁者1级.基础攻击).toBeCloseTo(225.94 * 0.079666848, 2);
    expect(铸铁者80级.基础攻击).toBe(225.94);
  });

  // 测试9：验证精炼等级影响其他属性
  it('武器精炼等级影响其他属性', () => {
    const 铸铁者精炼0级 = new LeveledWeapon("铸铁者", 0);
    const 铸铁者精炼5级 = new LeveledWeapon("铸铁者", 5);
    
    // 精炼0级时，暴击属性应该是原始值 * (0+1)/(5+1) = 原始值/6
    // 精炼5级时，暴击属性应该是原始值 * (5+1)/(5+1) = 原始值
    expect(铸铁者精炼0级.暴击).toBeCloseTo(1 / 6, 2);
    expect(铸铁者精炼5级.暴击).toBe(1);
  });

  // 测试10：验证精炼等级不影响基础暴击属性
  it('武器精炼等级不影响基础暴击属性', () => {
    const 铸铁者精炼0级 = new LeveledWeapon("铸铁者", 0);
    const 铸铁者精炼5级 = new LeveledWeapon("铸铁者", 5);
    
    // 基础暴击属性应该始终保持原始值0.2，不受精炼等级影响
    expect(铸铁者精炼0级.基础暴击).toBe(0.2);
    expect(铸铁者精炼5级.基础暴击).toBe(0.2);
  });

  // 测试10：获取完整属性
  it('获取武器完整属性包含等级和攻击信息', () => {
    const 铸铁者5级 = new LeveledWeapon("铸铁者", 3, 5);
    const fullProps = 铸铁者5级.getFullProperties();
    expect(fullProps.精炼).toBeDefined();
    expect(fullProps.等级).toBeDefined();
    expect(fullProps.基础攻击).toBeDefined();
    expect(fullProps.类型).toBeDefined();
    expect(fullProps.伤害类型).toBeDefined();
  });

  // 测试11：测试不存在的武器名称
  it('测试不存在的武器名称会抛出错误', () => {
    expect(() => {
      const 不存在的武器 = new LeveledWeapon("不存在的武器");
    }).toThrow(Error);
    
    expect(() => {
      const 不存在的武器 = new LeveledWeapon("不存在的武器");
    }).toThrow(Error);
  });

  // 测试12：测试不同类型的武器属性
  it('测试不同类型武器的特定属性', () => {
    // 近战武器（重剑）
    const 铸铁者 = new LeveledWeapon("铸铁者");
    expect(铸铁者.伤害类型).toBe("切割");
    
    // 远程武器（弓）
    const 裂魂 = new LeveledWeapon("裂魂");
    expect(裂魂.伤害类型).toBe("震荡");
    expect(裂魂.弹道类型).toBe("弹道");
  });
});