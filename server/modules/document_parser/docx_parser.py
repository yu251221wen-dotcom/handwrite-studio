from __future__ import annotations

from hashlib import sha1
from io import BytesIO
import re
from zipfile import BadZipFile, ZipFile
import xml.etree.ElementTree as ET

WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"w": WORD_NS}

HEADING_NAMES = {
    "入院记录", "中医望、闻、切诊", "中医望闻切诊", "体格检查", "专科检查", "辅助检查",
    "拟诊讨论", "初步诊断", "诊疗计划", "中医辨病辨证依据", "中医鉴别诊断",
    "西医诊断依据", "西医鉴别诊断", "中药处方", "中医外治",
}
PARAGRAPH_LABELS = (
    "主诉", "现病史", "刻下症", "既往史", "过敏史", "个人史", "婚育史", "家族史",
    "体格检查", "专科检查", "辅助检查", "拟诊讨论", "中医辨病辨证依据", "中医鉴别诊断",
    "西医诊断依据", "西医鉴别诊断", "初步诊断", "诊疗计划", "中医外治",
)
KEY_LABELS = (
    "姓名", "职业", "性别", "入院日期", "入院时间", "年龄", "记录日期", "民族", "发病节气",
    "婚姻状况", "婚姻", "病史陈述者", "出生地", "可靠程度", "病案号", "住院号",
)
SIGNATURE_ROLES = ("带教老师", "规培医师", "实习医师", "住院医师", "主治医师", "教师", "学生")


class DocxParseError(ValueError):
    pass


def _text(element: ET.Element) -> str:
    return "".join(node.text or "" for node in element.findall(".//w:t", NS)).strip()


def _attribute(name: str) -> str:
    return f"{{{WORD_NS}}}{name}"


def _page_settings(root: ET.Element) -> dict[str, float]:
    section = root.find(".//w:sectPr", NS)
    size = section.find("w:pgSz", NS) if section is not None else None
    margins = section.find("w:pgMar", NS) if section is not None else None
    twips = lambda value, fallback: round(int(value or fallback) / 1440 * 25.4, 2)
    return {
        "widthMm": twips(size.get(_attribute("w")) if size is not None else None, 11906),
        "heightMm": twips(size.get(_attribute("h")) if size is not None else None, 16838),
        "marginTopMm": twips(margins.get(_attribute("top")) if margins is not None else None, 1440),
        "marginRightMm": twips(margins.get(_attribute("right")) if margins is not None else None, 1800),
        "marginBottomMm": twips(margins.get(_attribute("bottom")) if margins is not None else None, 1440),
        "marginLeftMm": twips(margins.get(_attribute("left")) if margins is not None else None, 1800),
    }


def _paragraph_metadata(element: ET.Element) -> dict:
    properties = element.find("w:pPr", NS)
    style = properties.find("w:pStyle", NS) if properties is not None else None
    alignment = properties.find("w:jc", NS) if properties is not None else None
    numbered = properties.find("w:numPr", NS) is not None if properties is not None else False
    indentation = properties.find("w:ind", NS) if properties is not None else None
    first_line = 0
    if indentation is not None:
        value = indentation.get(_attribute("firstLine")) or indentation.get(_attribute("firstLineChars"))
        if value:
            first_line = max(0, round(int(value) / 20))
    return {
        "style": style.get(_attribute("val"), "") if style is not None else "",
        "alignment": alignment.get(_attribute("val"), "left") if alignment is not None else "left",
        "numbered": numbered,
        "firstLineIndent": first_line,
    }


def _split_label(text: str) -> tuple[str, str]:
    compact = text.strip()
    for label in PARAGRAPH_LABELS:
        match = re.match(rf"^{re.escape(label)}\s*[：:]?\s*", compact)
        if match:
            return label, compact[match.end():]
    return "", compact


def _key_value_items(text: str) -> list[dict[str, str]]:
    alternatives = "|".join(sorted((re.escape(label) for label in KEY_LABELS), key=len, reverse=True))
    hits = list(re.finditer(rf"({alternatives})\s*[：:]\s*", text))
    if not hits:
        return []
    items: list[dict[str, str]] = []
    for index, hit in enumerate(hits):
        end = hits[index + 1].start() if index + 1 < len(hits) else len(text)
        raw = text[hit.start():end].strip()
        items.append({"key": hit.group(1), "value": text[hit.end():end].strip(), "raw": raw})
    return items


def _prescription_items(text: str) -> list[dict[str, str]]:
    pieces = [piece.strip(" ，,；;、\t") for piece in re.split(r"\s{2,}|[；;、]", text) if piece.strip()]
    items: list[dict[str, str]] = []
    for piece in pieces:
        match = re.match(r"^(.*?)(\d+(?:\.\d+)?\s*(?:g|克|mg|ml|枚|片|付|剂)\b.*)$", piece, re.IGNORECASE)
        if match and match.group(1).strip():
            items.append({"name": match.group(1).strip(), "dose": match.group(2).strip(), "raw": piece})
    # Classify only complete dose rows; a partial match must not hide prose.
    complete = re.sub(r"\s+", "", "".join(item["raw"] for item in items)) == re.sub(r"\s+", "", text)
    return items if len(items) >= 2 and complete else []


def _signature_entries(text: str) -> list[dict[str, str]]:
    entries = []
    for role in SIGNATURE_ROLES:
        match = re.search(rf"{re.escape(role)}\s*[：:]?\s*([^\s，,；;]*)", text)
        if match:
            entries.append({"role": role, "name": match.group(1).strip(), "raw": match.group(0).strip()})
    return entries


def _looks_like_heading(text: str, metadata: dict) -> bool:
    compact = re.sub(r"\s+", "", text).strip("：:")
    if compact in {re.sub(r"\s+", "", value) for value in HEADING_NAMES}:
        return True
    style = metadata.get("style", "").lower()
    return ("heading" in style or "title" in style or "标题" in style) and len(compact) <= 40


def _block_id(kind: str, order: int, source_text: str) -> str:
    digest = sha1(source_text.encode("utf-8")).hexdigest()[:10]
    return f"block-{order:04d}-{kind}-{digest}"


def _make_block(kind: str, order: int, source_text: str, cursor: int, **values: object) -> dict:
    return {
        "blockId": _block_id(kind, order, source_text), "type": kind, "sourceOrder": order,
        "sourceStart": cursor, "sourceEnd": cursor + len(source_text), "sourceText": source_text,
        **values,
    }


def _paragraph_block(element: ET.Element, order: int, cursor: int, prescription_context: bool) -> dict | None:
    text = _text(element)
    if not text:
        return None
    metadata = _paragraph_metadata(element)
    signatures = _signature_entries(text)
    if signatures:
        return _make_block("signature", order, text, cursor, entries=signatures, alignment="two-column", keepWithNext=False, allowSplit=False)
    if _looks_like_heading(text, metadata):
        alignment = metadata["alignment"] if metadata["alignment"] in {"left", "center", "right"} else "left"
        return _make_block("heading", order, text, cursor, text=text, level=1 if "入院记录" in text else 2,
                           alignment=alignment, fontSize=24 if "入院记录" in text else 21, fontWeight=600,
                           spacingBefore=14, spacingAfter=9, keepWithNext=True, minLinesAfterHeading=2, allowSplit=False)
    key_values = _key_value_items(text)
    if key_values:
        return _make_block("key-value", order, text, cursor, items=key_values, columns="auto", keepWithNext=False, allowSplit=True)
    prescription = _prescription_items(text) if prescription_context or re.search(r"\d+\s*(?:g|克|mg|ml)", text, re.IGNORECASE) else []
    if prescription:
        return _make_block("prescription", order, text, cursor, items=prescription, columns="auto", keepWithNext=False, allowSplit=True)
    list_match = re.match(r"^([（(]?\d+[）).、]|[一二三四五六七八九十]+[、.])\s*(.*)$", text)
    if metadata["numbered"] or list_match:
        marker = list_match.group(1) if list_match else "•"
        item_text = list_match.group(2) if list_match else text
        return _make_block("list", order, text, cursor, items=[{"marker": marker, "text": item_text, "raw": text}], keepWithNext=False, allowSplit=True)
    label, content = _split_label(text)
    return _make_block("paragraph", order, text, cursor, label=label or None, content=content,
                       firstLineIndent=metadata["firstLineIndent"] or (0 if label else 34), lineHeight=34,
                       paragraphSpacing=8, keepWithNext=False, allowSplit=True)


def _table_block(element: ET.Element, order: int, cursor: int) -> dict | None:
    rows = [[_text(cell) for cell in row.findall("w:tc", NS)] for row in element.findall("w:tr", NS)]
    rows = [row for row in rows if any(row)]
    if not rows:
        return None
    source_text = "\n".join("\t".join(row) for row in rows)
    columns = max(len(row) for row in rows)
    return _make_block("table", order, source_text, cursor, rows=rows, columns=columns,
                       columnWidths=[1 / columns for _ in range(columns)], alignment="center",
                       borderStyle="subtle", keepWithNext=False, allowSplit=True)


def _normalized_length(text: str) -> int:
    return len(re.sub(r"\s+", "", text))


def parse_docx(content: bytes, filename: str = "document.docx") -> dict:
    if not content:
        raise DocxParseError("文件为空")
    try:
        with ZipFile(BytesIO(content)) as archive:
            if archive.getinfo("word/document.xml").file_size > 16 * 1024 * 1024:
                raise DocxParseError("DOCX 正文解压后超过 16 MB 限制")
            document_xml = archive.read("word/document.xml")
    except (BadZipFile, KeyError) as error:
        raise DocxParseError("文件不是有效的 DOCX") from error

    try:
        root = ET.fromstring(document_xml)
    except ET.ParseError as error:
        raise DocxParseError("DOCX 正文 XML 无效") from error
    body = root.find("w:body", NS)
    if body is None:
        raise DocxParseError("DOCX 缺少正文")

    blocks: list[dict] = []
    cursor = 0
    prescription_context = False
    for child in body:
        order = len(blocks)
        block = None
        if child.tag == f"{{{WORD_NS}}}p":
            block = _paragraph_block(child, order, cursor, prescription_context)
        elif child.tag == f"{{{WORD_NS}}}tbl":
            block = _table_block(child, order, cursor)
        if block:
            blocks.append(block)
            cursor = block["sourceEnd"] + 1
            if block["type"] == "heading":
                prescription_context = "处方" in block["sourceText"]
            elif block["type"] not in {"prescription", "paragraph"}:
                prescription_context = False

    raw_character_count = sum(_normalized_length(block["sourceText"]) for block in blocks)
    counts: dict[str, int] = {}
    for block in blocks:
        counts[block["type"]] = counts.get(block["type"], 0) + 1
    return {
        "source": {"filename": filename, "mediaType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"},
        "page": _page_settings(root), "blocks": blocks, "rawCharacterCount": raw_character_count,
        "recognizedCharacterCount": raw_character_count, "blockCounts": counts,
        "warnings": [] if blocks else ["文档中没有可提取的正文"],
    }
