"""Deprecated V2 field mapping implementation, retained only for legacy tooling."""

from __future__ import annotations

import re

FIELD_ALIASES = {
    "name": ("患者姓名", "姓名"), "sex": ("性别",), "age": ("年龄",),
    "occupation": ("职业",), "admission_time": ("入院时间", "入院日期"),
    "medical_record_number": ("病案号", "住院号"),
    "ethnicity": ("民族",), "marital_status": ("婚姻状况", "婚姻"),
    "birthplace": ("出生地",), "record_date": ("记录日期",),
    "solar_term": ("发病节气",), "history_narrator": ("病史陈述者",),
    "reliability": ("可靠程度",),
    "chief_complaint": ("主诉",), "present_illness": ("现病史", "现病情况"),
    "current_symptoms": ("刻下症",),
    "past_history": ("既往史",), "personal_history": ("个人史",),
    "allergy_history": ("过敏史", "药物过敏史"), "marital_history": ("婚育史", "婚姻史"),
    "family_history": ("家族史",), "physical_exam": ("体格检查", "查体"),
    "specialty_exam": ("专科检查",), "laboratory_exam": ("实验室检查", "辅助检查"),
    "admission_diagnosis": ("入院诊断",), "tcm_evidence": ("辨病辨证依据",),
    "tcm_differential": ("中医鉴别诊断",), "western_evidence": ("西医诊断依据",),
    "western_differential": ("西医鉴别诊断",), "discussion": ("拟诊讨论",),
    "treatment_plan": ("诊疗计划",), "external_treatment": ("中医外治",),
    "teaching_physician": ("带教老师",), "resident_trainee": ("规培医师",),
}
PATIENT_FIELDS = {
    "name", "sex", "age", "occupation", "admission_time", "medical_record_number", "ethnicity",
    "marital_status", "birthplace", "record_date", "solar_term", "history_narrator", "reliability",
}


def _paragraphs(document: dict) -> list[tuple[str, str, str]]:
    result = []
    for block in document.get("blocks", []):
        block_id = block.get("blockId") or block.get("id", "")
        if block.get("type") == "table":
            result.extend((block_id, "  ".join(cell for cell in row if cell).strip(), "table") for row in block.get("rows", []))
        else:
            result.append((block_id, block.get("sourceText") or block.get("text", "").strip(), block.get("type", "paragraph")))
    return [(block_id, text, kind) for block_id, text, kind in result if text]


def _alias_pattern() -> re.Pattern[str]:
    aliases = sorted(((field_id, alias) for field_id, values in FIELD_ALIASES.items() for alias in values), key=lambda item: len(item[1]), reverse=True)
    alternatives = "|".join(re.escape(alias) for _, alias in aliases)
    return re.compile(rf"({alternatives})\s*[：:]?")


ALIAS_PATTERN = _alias_pattern()
ALIAS_TO_ID = {alias: field_id for field_id, aliases in FIELD_ALIASES.items() for alias in aliases}


def _inline_matches(text: str, block_id: str) -> list[dict]:
    compact = re.sub(r"\s+", "", text)
    hits = list(ALIAS_PATTERN.finditer(compact))
    # Body labels only introduce a field at the start of a paragraph. Mentions
    # such as '既往史' inside a diagnostic discussion remain ordinary content.
    if hits and hits[0].start() != 0:
        return []
    if hits and ALIAS_TO_ID[hits[0].group(1)] not in PATIENT_FIELDS:
        hits = hits[:1]
    else:
        hits = [hit for hit in hits if ALIAS_TO_ID[hit.group(1)] in PATIENT_FIELDS]
    values = []
    for index, hit in enumerate(hits):
        end = hits[index + 1].start() if index + 1 < len(hits) else len(compact)
        value = compact[hit.end():end].strip(" ：:\t")
        field_id = ALIAS_TO_ID[hit.group(1)]
        values.append({"id": field_id, "label": hit.group(1), "value": value,
                       "sourceText": text, "confidence": 0.98, "confirmed": False,
                       "role": "patient" if field_id in PATIENT_FIELDS else "body",
                       "sourceBlockIds": [block_id] if block_id else []})
    return values


def map_fields(document: dict) -> list[dict]:
    paragraphs = _paragraphs(document)
    matches: list[dict] = []
    by_id: dict[str, dict] = {}
    active: dict | None = None
    for block_id, paragraph, block_type in paragraphs:
        if block_type == "heading":
            active = None
            continue
        inline = _inline_matches(paragraph, block_id)
        if inline:
            for item in inline:
                existing = by_id.get(item["id"])
                if existing and item["value"]:
                    existing["value"] = f'{existing["value"]}\n{item["value"]}'.strip()
                    existing["sourceText"] = f'{existing["sourceText"]}\n{paragraph}'.strip()
                    if block_id and block_id not in existing["sourceBlockIds"]:
                        existing["sourceBlockIds"].append(block_id)
                elif not existing:
                    by_id[item["id"]] = item
                    matches.append(item)
            body_hits = [item for item in inline if item["role"] == "body"]
            active = by_id[body_hits[-1]["id"]] if body_hits else None
        elif active and not re.match(r"^[（(]?\d+[）)]", paragraph):
            active["value"] = f'{active["value"]}\n{paragraph}'.strip()
            active["sourceText"] = f'{active["sourceText"]}\n{paragraph}'.strip()
            if block_id and block_id not in active["sourceBlockIds"]:
                active["sourceBlockIds"].append(block_id)

    if not matches and paragraphs:
        text = "\n".join(item[1] for item in paragraphs)
        matches.append({"id": "body", "label": "正文", "value": text,
                        "sourceText": text, "confidence": 0.5, "confirmed": False,
                        "role": "body", "sourceBlockIds": [item[0] for item in paragraphs if item[0]]})
    return matches
