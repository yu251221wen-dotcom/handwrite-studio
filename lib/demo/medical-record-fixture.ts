import type { FieldMapping } from "../handwriting/types.ts";

/** Demonstration-only content shown before the user imports a document. */
export const DEMO_DOCUMENT_NAME = "demo-medical-record.docx";

export const DEMO_INITIAL_FIELDS: FieldMapping[] = [
  { id: "name", label: "姓名", value: "测试患者A", sourceText: "姓名：测试患者A", confidence: 1, confirmed: true, role: "patient" },
  { id: "sex", label: "性别", value: "男", sourceText: "性别：男", confidence: 1, confirmed: true, role: "patient" },
  { id: "age", label: "年龄", value: "45岁", sourceText: "年龄：45岁", confidence: 1, confirmed: true, role: "patient" },
  { id: "occupation", label: "职业", value: "测试职业", sourceText: "职业：测试职业", confidence: 1, confirmed: true, role: "patient" },
  { id: "admission_time", label: "入院时间", value: "2026-01-01", sourceText: "入院时间：2026-01-01", confidence: 1, confirmed: true, role: "patient" },
  { id: "medical_record_number", label: "病案号", value: "DEMO-001", sourceText: "病案号：DEMO-001", confidence: 1, confirmed: true, role: "patient" },
  { id: "chief_complaint", label: "主诉", value: "反复咳嗽、咳痰3天，加重伴发热1天。", sourceText: "主诉：反复咳嗽、咳痰3天，加重伴发热1天。", confidence: 1, confirmed: true, role: "body" },
  { id: "present_illness", label: "现病史", value: "患者三日前受凉后出现咳嗽，咳少量白色黏痰，未予特殊处理。昨日起体温升高，最高38.6℃，伴乏力，无胸痛及呼吸困难，现为进一步诊治入院。", sourceText: "现病史示例", confidence: 1, confirmed: true, role: "body" },
  { id: "past_history", label: "既往史", value: "既往体健，否认高血压、糖尿病及药物过敏史。", sourceText: "既往史示例", confidence: 1, confirmed: true, role: "body" },
];

export const DEMO_PATIENT_FIELDS = Object.fromEntries(
  DEMO_INITIAL_FIELDS.filter((field) => field.role === "patient").map((field) => [field.id, field.value]),
) as Record<string, string>;

export const DEMO_BODY_FIELDS = DEMO_INITIAL_FIELDS.filter((field) => field.role === "body");
