"""Generate synthetic, privacy-safe OCR Lite acceptance fixtures."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / ".tmp" / "v4.3-ocr-acceptance"
FONT_CANDIDATES = (
    Path("C:/Windows/Fonts/msyh.ttc"),
    Path("C:/Windows/Fonts/simhei.ttf"),
    Path("C:/Windows/Fonts/simsun.ttc"),
)
LINES = (
    "测试病历记录",
    "姓名：测试甲    性别：男    年龄：35岁",
    "I 现病史",
    "患者因胸闷三天入院，精神尚可。",
    "II 既往史",
    "否认高血压及糖尿病史。",
    "1. 完善相关检查",
    "2. 继续观察生命体征",
)


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    font_path = next((path for path in FONT_CANDIDATES if path.exists()), None)
    if font_path is None:
        raise RuntimeError("No redistributable system CJK font is available for fixture generation")
    title_font = ImageFont.truetype(str(font_path), 72)
    body_font = ImageFont.truetype(str(font_path), 48)
    image = Image.new("RGB", (1654, 2339), "white")
    draw = ImageDraw.Draw(image)
    y = 160
    for index, line in enumerate(LINES):
        font = title_font if index == 0 else body_font
        draw.text((150, y), line, font=font, fill=(20, 20, 20))
        y += 145 if index == 0 else 112
    png_path = OUTPUT / "ocr-lite-synthetic.png"
    jpg_path = OUTPUT / "ocr-lite-synthetic.jpg"
    pdf_path = OUTPUT / "ocr-lite-scanned.pdf"
    image.save(png_path, "PNG")
    image.save(jpg_path, "JPEG", quality=94)
    pdf = canvas.Canvas(str(pdf_path), pagesize=A4, pageCompression=1)
    pdf.drawImage(str(png_path), 0, 0, width=A4[0], height=A4[1])
    pdf.showPage()
    pdf.save()
    print(f"generated={OUTPUT}")


if __name__ == "__main__":
    main()
