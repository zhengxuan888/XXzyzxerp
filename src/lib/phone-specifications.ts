export type PhoneSpecification = { colors: string[]; capacities: string[] };

export const PHONE_SPECIFICATIONS: Record<string, PhoneSpecification> = {
  samsungs23ultra: { colors: ["黑色", "绿色", "奶油色", "紫色", "石墨色", "青柠色", "红色", "天蓝色"], capacities: ["256GB", "512GB", "1TB"] },
  samsungs24ultra: { colors: ["钛灰色", "钛黑色", "钛紫色", "钛黄色", "钛蓝色", "钛绿色", "钛橙色"], capacities: ["256GB", "512GB", "1TB"] },
  iphone13: { colors: ["红色", "星光色", "午夜色", "蓝色", "粉色", "绿色"], capacities: ["128GB", "256GB", "512GB"] },
  iphone13pro: { colors: ["石墨色", "金色", "银色", "远峰蓝色", "苍岭绿色"], capacities: ["128GB", "256GB", "512GB", "1TB"] },
  iphone13promax: { colors: ["石墨色", "金色", "银色", "远峰蓝色", "苍岭绿色"], capacities: ["128GB", "256GB", "512GB", "1TB"] },
  iphone14: { colors: ["午夜色", "蓝色", "星光色", "紫色", "红色", "黄色"], capacities: ["128GB", "256GB", "512GB"] },
  iphone14plus: { colors: ["午夜色", "蓝色", "星光色", "紫色", "红色", "黄色"], capacities: ["128GB", "256GB", "512GB"] },
  iphone14pro: { colors: ["深空黑色", "银色", "金色", "暗紫色"], capacities: ["128GB", "256GB", "512GB", "1TB"] },
  iphone14promax: { colors: ["深空黑色", "银色", "金色", "暗紫色"], capacities: ["128GB", "256GB", "512GB", "1TB"] },
  iphone15: { colors: ["黑色", "蓝色", "绿色", "黄色", "粉色"], capacities: ["128GB", "256GB", "512GB"] },
  iphone15plus: { colors: ["黑色", "蓝色", "绿色", "黄色", "粉色"], capacities: ["128GB", "256GB", "512GB"] },
  iphone15pro: { colors: ["黑色钛金属", "白色钛金属", "蓝色钛金属", "原色钛金属"], capacities: ["128GB", "256GB", "512GB", "1TB"] },
  iphone15promax: { colors: ["黑色钛金属", "白色钛金属", "蓝色钛金属", "原色钛金属"], capacities: ["256GB", "512GB", "1TB"] },
  iphone16: { colors: ["黑色", "白色", "粉色", "深青色", "群青色"], capacities: ["128GB", "256GB", "512GB"] },
  iphone16plus: { colors: ["黑色", "白色", "粉色", "深青色", "群青色"], capacities: ["128GB", "256GB", "512GB"] },
  iphone16pro: { colors: ["黑色钛金属", "白色钛金属", "原色钛金属", "沙漠色钛金属"], capacities: ["128GB", "256GB", "512GB", "1TB"] },
  iphone16promax: { colors: ["黑色钛金属", "白色钛金属", "原色钛金属", "沙漠色钛金属"], capacities: ["256GB", "512GB", "1TB"] },
};

export function normalizePhoneModel(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function phoneVariantNames(modelName: string) {
  const specification = PHONE_SPECIFICATIONS[normalizePhoneModel(modelName)];
  if (!specification) return [];
  return specification.colors.flatMap((color) =>
    specification.capacities.map((capacity) => ({ color, capacity, name: `${modelName} ${color} ${capacity}` })),
  );
}
