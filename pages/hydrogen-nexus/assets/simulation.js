// Educational dispatch model. All power in kW; H2 in kg; time in hours.
// Fuel energy uses LHV. Efficiencies are explicit scenario assumptions.
export const H2_LHV = 33.33;
export const CAPACITY = 120;
export const defaults = Object.freeze({ solar: 820, wind: 8, temperature: 26, electric: 460, heat: 220, cold: 240, hydrogen: 1.2 });
export const presets = {
  balanced: { ...defaults },
  renewable: { solar: 1000, wind: 12, temperature: 24, electric: 330, heat: 140, cold: 160, hydrogen: 1.2 },
  evening: { solar: 0, wind: 5, temperature: 20, electric: 720, heat: 300, cold: 140, hydrogen: 1.2 },
  peak: { solar: 620, wind: 4, temperature: 38, electric: 1000, heat: 160, cold: 700, hydrogen: 2.5 },
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function simulate(input = defaults, inventory = 72, hours = 1 / 60) {
  const p = { ...defaults, ...input };
  hours = Math.max(1e-8, hours);
  inventory = clamp(inventory, 0, CAPACITY);
  const cellTemperature = p.temperature + p.solar * .025;
  const pv = Math.max(0, 620 * p.solar / 1000 * (1 - .004 * (cellTemperature - 25)));
  const wind = p.wind < 3 || p.wind >= 25 ? 0 : 330 * clamp((p.wind ** 3 - 27) / (12 ** 3 - 27), 0, 1);
  const electricDemand = p.electric;
  const heatDemand = p.heat * clamp(1 + (22 - p.temperature) * .035, .45, 1.9);
  const coldDemand = p.cold * clamp(1 + (p.temperature - 26) * .035, .5, 1.6);
  const absorptionTarget = Math.min(coldDemand * .55 / .72, 250);
  const chpGas = clamp((heatDemand * .65 + absorptionTarget) / .44, 0, 850);
  const chpElectric = chpGas * .36;
  const chpHeat = chpGas * .44;
  const absorptionHeat = Math.min(absorptionTarget, Math.max(0, chpHeat - heatDemand * .65));
  const absorptionCold = absorptionHeat * .72;
  const chillerCold = coldDemand - absorptionCold;
  const cop = clamp(4.2 - (p.temperature - 20) * .055, 2.6, 4.8);
  const chillerElectric = chillerCold / cop;
  const deficit = electricDemand + chillerElectric - pv - wind - chpElectric;
  const reserve = Math.min(p.hydrogen, inventory / hours);
  const fuelcellInput = Math.min(Math.max(0, deficit) / .5, 320, Math.max(0, inventory / hours - reserve) * H2_LHV);
  const fuelcellElectric = fuelcellInput * .5;
  const fuelcellHeat = fuelcellInput * .35;
  const fuelcellHydrogen = fuelcellInput / H2_LHV;
  const surplus = Math.max(0, -deficit);
  // A 2 kWh/kg compressor is included in the electric bus and rejected heat.
  const electrolyzer = Math.min(320, surplus / (1 + .68 * 2 / H2_LHV), Math.max(0, (CAPACITY - inventory) / hours + reserve) * H2_LHV / .68);
  const hydrogenProduction = electrolyzer * .68 / H2_LHV;
  const compression = hydrogenProduction * 2;
  const hydrogenServed = Math.min(p.hydrogen, Math.max(0, inventory / hours + hydrogenProduction - fuelcellHydrogen));
  const storageRate = hydrogenProduction - fuelcellHydrogen - hydrogenServed;
  const storage = clamp(inventory + storageRate * hours, 0, CAPACITY);
  const netElectric = pv + wind + chpElectric + fuelcellElectric - electricDemand - chillerElectric - electrolyzer - compression;
  const gridImport = Math.min(1000, Math.max(0, -netElectric));
  const gridExport = Math.max(0, netElectric);
  const electricServed = electricDemand - Math.max(0, -netElectric - gridImport);
  const remainingHeat = Math.max(0, heatDemand + absorptionHeat - chpHeat - fuelcellHeat);
  const boilerGas = Math.min(600, remainingHeat / .9);
  const boilerHeat = boilerGas * .9;
  const heatServed = Math.min(heatDemand, chpHeat + fuelcellHeat + boilerHeat - absorptionHeat);
  const heatDump = Math.max(0, chpHeat + fuelcellHeat + boilerHeat - absorptionHeat - heatServed);
  const coldServed = absorptionCold + chillerCold;
  const gas = chpGas + boilerGas;
  const conversionLoss = chpGas * .2 + boilerGas * .1 + fuelcellInput * .15 + electrolyzer * .32 + compression;
  const coolingReject = absorptionHeat + absorptionCold + chillerElectric + chillerCold;
  const rejection = conversionLoss + coolingReject + heatDump;
  const storagePower = storageRate * H2_LHV;
  const supply = pv + wind + gridImport + gas + coldServed;
  const use = electricServed + heatServed + hydrogenServed * H2_LHV + gridExport + storagePower + rejection;
  const balance = {
    electric: pv + wind + chpElectric + fuelcellElectric + gridImport - electricServed - chillerElectric - electrolyzer - compression - gridExport,
    heat: chpHeat + fuelcellHeat + boilerHeat - heatServed - absorptionHeat - heatDump,
    cold: absorptionCold + chillerCold - coldServed,
    hydrogen: (hydrogenProduction - fuelcellHydrogen - hydrogenServed - storageRate) * H2_LHV,
    total: supply - use,
  };
  const unmet = { electric: electricDemand - electricServed, heat: heatDemand - heatServed, cold: coldDemand - coldServed, hydrogen: p.hydrogen - hydrogenServed };
  const generation = pv + wind + chpElectric + fuelcellElectric;
  return { ...p, inventory, storage, storageRate, storagePower, cellTemperature, pv, windPower: wind, electricDemand, heatDemand, coldDemand, chpGas, chpElectric, chpHeat, absorptionHeat, absorptionCold, chillerCold, chillerElectric, cop, fuelcellInput, fuelcellElectric, fuelcellHeat, fuelcellHydrogen, electrolyzer, hydrogenProduction, compression, hydrogenServed, gridImport, gridExport, electricServed, boilerGas, boilerHeat, heatServed, heatDump, coldServed, gas, conversionLoss, coolingReject, rejection, supply, use, balance, unmet, generation, renewableShare: (pv + wind) / Math.max(1, generation + gridImport) * 100 };
}

export const equipment = [
  { id: 'solar', name: '光伏阵列', code: 'PV-01', type: 'electric', equation: '太阳辐射 → 电', description: '620 kWp 光伏阵列。辐照度与电池温度共同决定输出，电力优先供给园区，富余电量用于制氢。', metrics: s => [['发电功率', s.pv, 'kW'], ['辐照强度', s.solar, 'W/m²'], ['电池温度', s.cellTemperature, '°C'], ['额定装机', 620, 'kWp']] },
  { id: 'wind', name: '风力发电机', code: 'WT-01', type: 'electric', equation: '风能 → 电', description: '330 kW 风机。3 m/s 切入、12 m/s 达到额定功率、25 m/s 切出；区间内采用立方功率曲线。', metrics: s => [['发电功率', s.windPower, 'kW'], ['实时风速', s.wind, 'm/s'], ['负载率', s.windPower / 330 * 100, '%'], ['额定装机', 330, 'kW']] },
  { id: 'grid', name: '并网变电站', code: 'GR-01', type: 'electric', equation: '电网 ⇄ 电母线', description: '电网补足园区缺口，接收储氢饱和后的余电。购电上限 1,000 kW，超出容量会明确显示未满足负荷。', metrics: s => [['购电功率', s.gridImport, 'kW'], ['上网功率', s.gridExport, 'kW'], ['母线电压（设定）', 10, 'kV'], ['购电容量', 1000, 'kW']] },
  { id: 'electrolyzer', name: 'PEM 电解制氢', code: 'EL-01', type: 'hydrogen', equation: '电 + 水 → 氢 + 氧 + 热', description: '富余电力驱动 PEM 电解槽。电堆 LHV 效率 68%；压缩机耗电 2 kWh/kg 单独计入。储罐满载时自动限功率。', metrics: s => [['电堆功率', s.electrolyzer, 'kW'], ['产氢速率', s.hydrogenProduction, 'kg/h'], ['压缩机功率', s.compression, 'kW'], ['纯水消耗', s.hydrogenProduction * 9, 'kg/h']] },
  { id: 'tank', name: '高压储氢罐', code: 'HS-01', type: 'hydrogen', equation: '制氢 → 储存 → 用氢 / 发电', description: '120 kg 可用容量，按产氢与耗氢质量差积分。压力按固定容积、温度的理想气体近似显示；满罐限产，空罐禁止放氢。', metrics: s => [['储氢质量', s.inventory, 'kg'], ['荷氢状态', s.inventory / 120 * 100, '%'], ['净充放速率', s.storageRate, 'kg/h'], ['估算压力', s.inventory / 120 * 35, 'MPa']] },
  { id: 'fuelcell', name: '氢燃料电池', code: 'FC-01', type: 'hydrogen', equation: '氢 + 氧 → 电 + 低温热 + 水', description: '电力不足时启用，优先保留园区用氢。电效率 50%，低温热回收 35%，其余 15% 为散热。回收热用于供暖，不接高温制冷回路。', metrics: s => [['发电功率', s.fuelcellElectric, 'kW'], ['回收热量', s.fuelcellHeat, 'kW'], ['耗氢速率', s.fuelcellHydrogen, 'kg/h'], ['电效率（设定）', 50, '%']] },
  { id: 'gas', name: '天然气调压站', code: 'NG-01', type: 'gas', equation: '天然气 → 热电联产 / 锅炉', description: '天然气经调压后进入独立燃气管网，以低位热值核算能量。体积流量采用 9.7 kWh/Nm³ 的场景假设换算。', metrics: s => [['燃气输入', s.gas, 'kW LHV'], ['标准体积流量', s.gas / 9.7, 'Nm³/h'], ['联产支路', s.chpGas, 'kW'], ['锅炉支路', s.boilerGas, 'kW']] },
  { id: 'chp', name: '燃气热电联产', code: 'CHP-01', type: 'heat', equation: '天然气 → 电 + 高温热', description: '以热定电的燃气内燃机与余热回收装置。电效率 36%、热回收率 44%，20% 为不可回收损耗；高温余热供暖并驱动吸收制冷。', metrics: s => [['发电功率', s.chpElectric, 'kW'], ['回收热量', s.chpHeat, 'kW'], ['燃气输入', s.chpGas, 'kW LHV'], ['综合效率（设定）', 80, '%']] },
  { id: 'boiler', name: '燃气补热锅炉', code: 'GB-01', type: 'heat', equation: '天然气 → 热', description: '余热和燃料电池回收热不足时补热。热效率 90%，最大燃气输入 600 kW；满负载后不足部分记为供热缺口。', metrics: s => [['供热功率', s.boilerHeat, 'kW'], ['燃气输入', s.boilerGas, 'kW LHV'], ['散热损耗', s.boilerGas * .1, 'kW'], ['热效率（设定）', 90, '%']] },
  { id: 'absorption', name: '溴化锂吸收制冷', code: 'AC-01', type: 'cold', equation: '高温热 + 负荷吸热 → 环境排热', description: '单效吸收式制冷机采用 COP 0.72。由联产高温余热驱动，排热 = 驱动热 + 制冷量；示范模型忽略小型循环泵功耗。', metrics: s => [['制冷功率', s.absorptionCold, 'kW'], ['驱动热量', s.absorptionHeat, 'kW'], ['环境排热', s.absorptionHeat + s.absorptionCold, 'kW'], ['制冷 COP（设定）', .72, '']] },
  { id: 'chiller', name: '电驱压缩式冷机', code: 'EC-01', type: 'cold', equation: '电 + 负荷吸热 → 环境排热', description: '补足吸收制冷以外的冷负荷。COP 随环境温度变化，环境排热同时包含从建筑搬运的热量和压缩机耗电。', metrics: s => [['制冷功率', s.chillerCold, 'kW'], ['耗电功率', s.chillerElectric, 'kW'], ['实时 COP', s.cop, ''], ['环境排热', s.chillerCold + s.chillerElectric, 'kW']] },
  { id: 'load', name: '综合用能园区', code: 'LD-01', type: 'electric', equation: '电 · 热 · 冷 · 氢 → 终端需求', description: '电负荷与用氢量直接设定，供热和制冷基准负荷随环境温度修正。控制面板显示实际需求，供能不足时触发提示。', metrics: s => [['供电功率', s.electricServed, 'kW'], ['供热功率', s.heatServed, 'kW'], ['供冷功率', s.coldServed, 'kW'], ['供氢速率', s.hydrogenServed, 'kg/h']] },
];
