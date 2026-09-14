import type { DocumentBlock, FieldMapping } from "../handwriting/types.ts";

const paragraph = "患者因活动后胸闷就诊，休息后可缓解，无晕厥。为验证长文分页，现病经过、伴随症状、检查结果与诊疗计划均使用完全合成内容，不对应任何真实患者。";

export const V3_SHOWCASE_BLOCKS: DocumentBlock[] = [
  { blockId: "demo-heading-1", type: "heading", sourceOrder: 0, sourceStart: 0, sourceEnd: 4, sourceText: "入院记录", text: "入院记录", level: 1, alignment: "center", fontSize: 24, fontWeight: 600, spacingBefore: 8, spacingAfter: 10, keepWithNext: true, minLinesAfterHeading: 2, allowSplit: false },
  { blockId: "demo-kv", type: "key-value", sourceOrder: 1, sourceStart: 5, sourceEnd: 80, sourceText: "姓名：测试患者A\t病案号：DEMO-001\t性别：男\t年龄：45岁\t职业：测试职业\t出生地：测试地区", items: [
    { key: "姓名", value: "测试患者A", raw: "姓名：测试患者A" }, { key: "病案号", value: "DEMO-001", raw: "病案号：DEMO-001" },
    { key: "性别", value: "男", raw: "性别：男" }, { key: "年龄", value: "45岁", raw: "年龄：45岁" },
    { key: "职业", value: "测试职业", raw: "职业：测试职业" }, { key: "出生地", value: "测试地区", raw: "出生地：测试地区" },
  ], columns: "auto", allowSplit: true },
  { blockId: "demo-chief", type: "paragraph", sourceOrder: 2, sourceStart: 81, sourceEnd: 110, sourceText: "主诉：活动后胸闷三个月。", label: "主诉", content: "活动后胸闷三个月。", firstLineIndent: 0, lineHeight: 34, paragraphSpacing: 8, allowSplit: true },
  { blockId: "demo-present", type: "paragraph", sourceOrder: 3, sourceStart: 111, sourceEnd: 1600, sourceText: `现病史：${paragraph.repeat(16)}`, label: "现病史", content: paragraph.repeat(16), firstLineIndent: 0, lineHeight: 34, paragraphSpacing: 8, allowSplit: true },
  { blockId: "demo-heading-table", type: "heading", sourceOrder: 4, sourceStart: 1601, sourceEnd: 1610, sourceText: "心脏相对浊音界", text: "心脏相对浊音界", level: 2, alignment: "left", fontSize: 21, fontWeight: 600, spacingBefore: 14, spacingAfter: 9, keepWithNext: true, minLinesAfterHeading: 2, allowSplit: false },
  { blockId: "demo-table", type: "table", sourceOrder: 5, sourceStart: 1611, sourceEnd: 1680, sourceText: "右(cm)\t肋间\t左(cm)\n2\tⅡ\t3\n3\tⅢ\t5\n3\tⅣ\t7\n\tⅤ\t8", rows: [["右(cm)", "肋间", "左(cm)"], ["2", "Ⅱ", "3"], ["3", "Ⅲ", "5"], ["3", "Ⅳ", "7"], ["", "Ⅴ", "8"]], columns: 3, columnWidths: [0.33, 0.34, 0.33], alignment: "center", borderStyle: "subtle", allowSplit: true },
  { blockId: "demo-prescription", type: "prescription", sourceOrder: 6, sourceStart: 1681, sourceEnd: 1770, sourceText: "党参15g\t黄芪15g\t茯苓12g\t白术10g\t丹参15g\t川芎10g\t炙甘草6g\t桂枝9g\t生姜6g", items: ["党参15g", "黄芪15g", "茯苓12g", "白术10g", "丹参15g", "川芎10g", "炙甘草6g", "桂枝9g", "生姜6g"].map((raw) => ({ name: raw.replace(/[\d.]+g$/, ""), dose: raw.match(/[\d.]+g$/)?.[0] ?? "", raw })), columns: "auto", allowSplit: true },
  { blockId: "demo-signature", type: "signature", sourceOrder: 7, sourceStart: 1771, sourceEnd: 1810, sourceText: "带教老师：测试教师\t规培医师：测试医师", entries: [{ role: "带教老师", name: "测试教师", raw: "带教老师：测试教师" }, { role: "规培医师", name: "测试医师", raw: "规培医师：测试医师" }], alignment: "two-column", allowSplit: false },
];

export const V3_SHOWCASE_FIELDS: FieldMapping[] = [
  { id: "name", label: "姓名", value: "测试患者A", sourceText: "姓名：测试患者A", confidence: 1, confirmed: true, role: "patient", sourceBlockIds: ["demo-kv"] },
  { id: "medical_record_number", label: "病案号", value: "DEMO-001", sourceText: "病案号：DEMO-001", confidence: 1, confirmed: true, role: "patient", sourceBlockIds: ["demo-kv"] },
  { id: "chief_complaint", label: "主诉", value: "活动后胸闷三个月。", sourceText: "主诉：活动后胸闷三个月。", confidence: 1, confirmed: true, role: "body", sourceBlockIds: ["demo-chief"] },
  { id: "present_illness", label: "现病史", value: paragraph.repeat(16), sourceText: `现病史：${paragraph.repeat(16)}`, confidence: 1, confirmed: true, role: "body", sourceBlockIds: ["demo-present"] },
];
