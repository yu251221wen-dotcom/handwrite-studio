from pathlib import Path
import unittest

from server.modules.document_parser import parse_docx


class DocxParserTests(unittest.TestCase):
    def test_extracts_reference_template(self) -> None:
        fixture = Path(__file__).parent / "fixtures" / "tcm-inpatient-reference.docx"
        if not fixture.exists():
            self.skipTest("private reference fixture is not included in hosted source repositories")
        document = parse_docx(fixture.read_bytes(), fixture.name)
        text = "\n".join(block.get("sourceText", "") for block in document["blocks"])
        self.assertIn("中医住院病历格式与书写要求", text)
        self.assertIn("主诉", text)
        self.assertAlmostEqual(document["page"]["widthMm"], 210, delta=1)

    def test_two_patient_documents_remain_isolated_without_field_mapping(self) -> None:
        fixture_dir = Path(__file__).parent / "fixtures" / "v2"
        first = parse_docx((fixture_dir / "patient-a.docx").read_bytes(), "patient-a.docx")
        second = parse_docx((fixture_dir / "patient-b.docx").read_bytes(), "patient-b.docx")
        first_text = "".join(block["sourceText"] for block in first["blocks"])
        second_text = "".join(block["sourceText"] for block in second["blocks"])
        self.assertIn("林晓", first_text); self.assertIn("A-1001", first_text); self.assertNotIn("B-2002", first_text)
        self.assertIn("周远", second_text); self.assertIn("B-2002", second_text); self.assertNotIn("A-1001", second_text)
        self.assertNotIn("张宁", first_text + second_text)

    def test_long_docx_keeps_all_3000_body_characters(self) -> None:
        path = Path(__file__).parent / "fixtures" / "v2" / "long-3000.docx"
        document = parse_docx(path.read_bytes(), path.name)
        text = "".join(block["sourceText"] for block in document["blocks"])
        self.assertIn("现病史", text)
        self.assertGreaterEqual(document["rawCharacterCount"], 3000)

    def test_cardiology_golden_fixture_preserves_required_structure(self) -> None:
        path = Path(__file__).parent / "fixtures" / "cardiology-inpatient-record.docx"
        if not path.exists():
            self.skipTest("private Golden fixture is not included in hosted source repositories")
        document = parse_docx(path.read_bytes(), path.name)
        text = "\n".join(block["sourceText"] for block in document["blocks"])
        required = [
            "入院记录", "姓名", "性别", "年龄", "职业", "民族", "婚姻", "出生地", "入院日期",
            "记录日期", "发病节气", "病史陈述者", "可靠程度", "主诉", "现病史", "刻下症", "既往史",
            "过敏史", "个人史", "婚育史", "家族史", "中医望", "体格检查", "专科检查", "辅助检查",
            "拟诊讨论", "中医辨病辨证依据", "中医鉴别诊断", "西医诊断依据", "西医鉴别诊断",
            "初步诊断", "诊疗计划", "带教老师", "规培医师",
        ]
        for label in required:
            self.assertIn(label, text)
        kinds = {block["type"] for block in document["blocks"]}
        self.assertTrue({"heading", "paragraph", "key-value", "table", "prescription", "signature"}.issubset(kinds))
        table = next(block for block in document["blocks"] if block["type"] == "table")
        self.assertEqual((len(table["rows"]), table["columns"]), (5, 3))
        header = [cell.replace("（", "(").replace("）", ")") for cell in table["rows"][0]]
        self.assertEqual(header, ["右(cm)", "肋间", "左(cm)"])
        expected = sum(len("".join(block["sourceText"].split())) for block in document["blocks"])
        self.assertEqual(document["rawCharacterCount"], expected)
        self.assertEqual(document["recognizedCharacterCount"], expected)
        self.assertGreaterEqual(len(document["blocks"]), 70)


if __name__ == "__main__":
    unittest.main()
