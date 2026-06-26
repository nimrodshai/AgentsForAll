#!/usr/bin/env python3
"""Render a client scope spec JSON file into a PDF document."""

from __future__ import annotations

import argparse
import json
import re
from html import escape
from pathlib import Path
from typing import Any

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import HRFlowable, KeepTogether, Paragraph, SimpleDocTemplate, Spacer


REPO_ROOT = Path(__file__).resolve().parents[1]
LOGO_PATH = REPO_ROOT / "assets" / "AssistycaLogoTitle.png"
MANROPE_REGULAR_PATH = REPO_ROOT / "assets" / "manrope-regular.ttf"
MANROPE_SEMIBOLD_PATH = REPO_ROOT / "assets" / "manrope-semibold.ttf"
MANROPE_MEDIUM_PATH = REPO_ROOT / "assets" / "manrope-medium.ttf"
BODY_FONT_NAME = "ManropeRegular"
BOLD_FONT_NAME = "ManropeSemibold"
TAGLINE_TEXT = "AI AGENTS FOR BUSINESS OWNERS"
TAGLINE_FONT_NAME = "ManropeMedium"
TAGLINE_X_OFFSET = 12  # ~16px at 96dpi
TAGLINE_CHAR_SPACE = 1.45

HEADER_BG = colors.HexColor("#f7fbfd")
HEADER_STRIPE = colors.HexColor("#4e9a95")
HEADER_BORDER = colors.HexColor("#d8e1e8")
BRAND_NAVY = colors.HexColor("#10263d")
ACCENT = colors.HexColor("#4e9a95")
TEXT = colors.HexColor("#253244")
MUTED = colors.HexColor("#6b7280")
HEADER_HEIGHT = 29 * mm
HEADER_STRIPE_HEIGHT = 1.6 * mm
LOGO_MAX_WIDTH = 60 * mm
LOGO_MAX_HEIGHT = 18 * mm
TOOL_LABEL_RE = re.compile(r"^Tool\s*(\d+)$", re.IGNORECASE)


def register_body_font(rtl: bool) -> tuple[str, str]:
    """Register a system font when possible and return body/bold font names."""
    if not rtl:
        if MANROPE_REGULAR_PATH.exists() and MANROPE_SEMIBOLD_PATH.exists():
            pdfmetrics.registerFont(TTFont(BODY_FONT_NAME, str(MANROPE_REGULAR_PATH)))
            pdfmetrics.registerFont(TTFont(BOLD_FONT_NAME, str(MANROPE_SEMIBOLD_PATH)))
            return BODY_FONT_NAME, BOLD_FONT_NAME
        return "Helvetica", "Helvetica-Bold"

    candidates = [
        Path("/System/Library/Fonts/SFHebrew.ttf"),
        Path("/System/Library/Fonts/Supplemental/Arial Unicode.ttf"),
    ]
    for font_path in candidates:
        if font_path.exists():
            pdfmetrics.registerFont(TTFont("ProjectBody", str(font_path)))
            return "ProjectBody", "ProjectBody"
    return "Helvetica", "Helvetica-Bold"


def register_brand_font() -> str:
    """Register the brand tagline font and return its font name."""
    if MANROPE_MEDIUM_PATH.exists():
        pdfmetrics.registerFont(TTFont(TAGLINE_FONT_NAME, str(MANROPE_MEDIUM_PATH)))
        return TAGLINE_FONT_NAME
    return "Helvetica-Bold"


def is_rtl(spec: dict[str, Any]) -> bool:
    meta = spec.get("meta", {})
    language = str(meta.get("language", "en")).lower()
    direction = str(meta.get("direction", "")).lower()
    return language.startswith("he") or direction == "rtl"


def transform_text(text: Any, rtl: bool) -> str:
    value = "" if text is None else str(text)
    if not rtl:
        return value
    return "\n".join(line[::-1] for line in value.splitlines())


def paragraph_text(text: Any, rtl: bool) -> str:
    return escape(transform_text(text, rtl)).replace("\n", "<br/>")


def build_styles(body_font: str, bold_font: str, rtl: bool) -> dict[str, ParagraphStyle]:
    alignment = TA_RIGHT if rtl else TA_LEFT
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="SpecTitle",
            parent=styles["Title"],
            fontName=bold_font,
            fontSize=27,
            leading=31,
            textColor=BRAND_NAVY,
            alignment=alignment,
            spaceAfter=4,
        )
    )
    styles.add(
        ParagraphStyle(
            name="SectionTitle",
            parent=styles["Heading2"],
            fontName=bold_font,
            fontSize=12.5,
            leading=15,
            textColor=BRAND_NAVY,
            alignment=alignment,
            spaceBefore=12,
            spaceAfter=4,
        )
    )
    styles.add(
        ParagraphStyle(
            name="BodyTextSpec",
            parent=styles["BodyText"],
            fontName=body_font,
            fontSize=10.8,
            leading=15.5,
            textColor=TEXT,
            alignment=alignment,
            spaceAfter=4,
        )
    )
    styles.add(
        ParagraphStyle(
            name="BulletTextSpec",
            parent=styles["BodyText"],
            fontName=body_font,
            fontSize=10.8,
            leading=15.5,
            textColor=TEXT,
            alignment=alignment,
            leftIndent=11,
            firstLineIndent=-11,
            spaceAfter=4,
        )
    )
    styles.add(
        ParagraphStyle(
            name="ToolGroupTitle",
            parent=styles["Heading3"],
            fontName=bold_font,
            fontSize=11.2,
            leading=13.5,
            textColor=ACCENT,
            alignment=alignment,
            spaceBefore=3,
            spaceAfter=2,
            keepWithNext=True,
        )
    )
    return styles


def bullet_paragraph(style: ParagraphStyle, text: Any, rtl: bool) -> Paragraph:
    content = f"- {paragraph_text(text, rtl)}"
    return Paragraph(content, style)


def render_list(story: list[Any], style: ParagraphStyle, items: list[Any], rtl: bool) -> None:
    for item in items:
        story.append(bullet_paragraph(style, item, rtl))


def render_numbered_list(story: list[Any], style: ParagraphStyle, items: list[Any], rtl: bool) -> None:
    for index, item in enumerate(items, start=1):
        content = f"{index}. {paragraph_text(item, rtl)}"
        story.append(Paragraph(content, style))


def split_tool_groups(items: list[Any]) -> list[tuple[str, list[str]]] | None:
    groups: list[tuple[str, list[str]]] = []
    current_label: str | None = None
    current_items: list[str] = []
    saw_grouped_prefix = False

    for item in items:
        text = "" if item is None else str(item)
        prefix, separator, remainder = text.partition(":")
        label_match = TOOL_LABEL_RE.match(prefix.strip()) if separator else None

        if label_match:
            saw_grouped_prefix = True
            label = f"Tool {label_match.group(1)}"
            if current_label != label and current_items:
                groups.append((current_label or label, current_items))
                current_items = []
            current_label = label
            if remainder.strip():
                current_items.append(remainder.strip())
            continue

        if saw_grouped_prefix:
            current_items.append(text)
            continue

        return None

    if not saw_grouped_prefix or current_label is None:
        return None

    groups.append((current_label, current_items))
    return groups


def render_grouped_bullets(
    story: list[Any], title: str, content: list[str], styles: dict[str, ParagraphStyle], rtl: bool
) -> None:
    groups = split_tool_groups(content)
    if not groups:
        render_section(story, title, content, styles, rtl)
        return

    story.append(Paragraph(paragraph_text(title, rtl), styles["SectionTitle"]))
    story.append(HRFlowable(width="100%", thickness=1.1, color=ACCENT, spaceBefore=0, spaceAfter=6))

    for group_title, group_items in groups:
        block: list[Any] = [Paragraph(paragraph_text(group_title, rtl), styles["ToolGroupTitle"])]
        for item in group_items:
            block.append(bullet_paragraph(styles["BulletTextSpec"], item, rtl))
        story.append(KeepTogether(block))

    story.append(Spacer(1, 5))


def render_grouped_numbered(
    story: list[Any], title: str, content: list[str], styles: dict[str, ParagraphStyle], rtl: bool
) -> None:
    groups = split_tool_groups(content)
    if not groups:
        if not content:
            return
        story.append(Paragraph(paragraph_text(title, rtl), styles["SectionTitle"]))
        story.append(HRFlowable(width="100%", thickness=1.1, color=ACCENT, spaceBefore=0, spaceAfter=6))
        render_numbered_list(story, styles["BodyTextSpec"], content, rtl)
        story.append(Spacer(1, 5))
        return

    story.append(Paragraph(paragraph_text(title, rtl), styles["SectionTitle"]))
    story.append(HRFlowable(width="100%", thickness=1.1, color=ACCENT, spaceBefore=0, spaceAfter=6))

    for group_title, group_items in groups:
        block: list[Any] = [Paragraph(paragraph_text(group_title, rtl), styles["ToolGroupTitle"])]
        for item_index, item in enumerate(group_items, start=1):
            block.append(Paragraph(f"{item_index}. {paragraph_text(item, rtl)}", styles["BodyTextSpec"]))
        story.append(KeepTogether(block))

    story.append(Spacer(1, 5))


def render_section(story: list[Any], title: str, content: list[str], styles: dict[str, ParagraphStyle], rtl: bool) -> None:
    if not content:
        return
    story.append(Paragraph(paragraph_text(title, rtl), styles["SectionTitle"]))
    story.append(HRFlowable(width="100%", thickness=1.1, color=ACCENT, spaceBefore=0, spaceAfter=6))
    render_list(story, styles["BulletTextSpec"], content, rtl)
    story.append(Spacer(1, 5))


def render_text_block(story: list[Any], title: str, text: str, styles: dict[str, ParagraphStyle], rtl: bool) -> None:
    if not text:
        return
    story.append(Paragraph(paragraph_text(title, rtl), styles["SectionTitle"]))
    story.append(HRFlowable(width="100%", thickness=1.1, color=ACCENT, spaceBefore=0, spaceAfter=6))
    story.append(Paragraph(paragraph_text(text, rtl), styles["BodyTextSpec"]))
    story.append(Spacer(1, 5))


def draw_header(canvas: Any, doc: SimpleDocTemplate, rtl: bool, logo_path: Path, tagline_font: str) -> None:
    canvas.saveState()
    page_width, page_height = A4
    header_bottom = page_height - HEADER_HEIGHT

    canvas.setFillColor(HEADER_BG)
    canvas.rect(0, header_bottom, page_width, HEADER_HEIGHT, stroke=0, fill=1)

    canvas.setFillColor(HEADER_STRIPE)
    canvas.rect(0, page_height - HEADER_STRIPE_HEIGHT, page_width, HEADER_STRIPE_HEIGHT, stroke=0, fill=1)

    canvas.setStrokeColor(HEADER_BORDER)
    canvas.setLineWidth(0.8)
    canvas.line(doc.leftMargin, header_bottom, page_width - doc.rightMargin, header_bottom)

    if logo_path.exists():
        image = ImageReader(str(logo_path))
        image_width, image_height = image.getSize()
        scale = min(LOGO_MAX_WIDTH / image_width, LOGO_MAX_HEIGHT / image_height)
        logo_width = image_width * scale
        logo_height = image_height * scale
        logo_x = doc.leftMargin if not rtl else page_width - doc.rightMargin - logo_width
        logo_y = header_bottom + 8.3 * mm
        canvas.drawImage(image, logo_x, logo_y, width=logo_width, height=logo_height, mask="auto")
        tagline = canvas.beginText()
        tagline.setTextOrigin(logo_x + TAGLINE_X_OFFSET, header_bottom + 4.2 * mm)
        tagline.setFont(tagline_font, 7.9)
        tagline.setFillColor(BRAND_NAVY)
        tagline.setCharSpace(TAGLINE_CHAR_SPACE)
        tagline.textOut(TAGLINE_TEXT)
        canvas.drawText(tagline)

    canvas.restoreState()


def draw_footer(canvas: Any, doc: SimpleDocTemplate, body_font: str) -> None:
    canvas.saveState()
    canvas.setStrokeColor(HEADER_BORDER)
    canvas.setLineWidth(0.75)
    canvas.line(doc.leftMargin, 14 * mm, A4[0] - doc.rightMargin, 14 * mm)
    canvas.setFont(body_font, 8)
    canvas.setFillColor(MUTED)
    canvas.drawRightString(A4[0] - doc.rightMargin, 8 * mm, f"Page {canvas.getPageNumber()}")
    canvas.restoreState()


def build_story(spec: dict[str, Any], styles: dict[str, ParagraphStyle], rtl: bool) -> list[Any]:
    meta = spec.get("meta", {})
    overview = spec.get("overview", {})
    sections = spec.get("sections", {})
    approval = spec.get("approval", {})

    story: list[Any] = []

    title = meta.get("title") or meta.get("project_name") or "Project Scope Spec"

    story.append(Paragraph(paragraph_text(title, rtl), styles["SpecTitle"]))
    story.append(Spacer(1, 10))

    render_text_block(story, "Client request", overview.get("client_request", ""), styles, rtl)

    deliverables = sections.get("deliverables", [])
    if deliverables:
        render_grouped_bullets(story, "Client deliverables", deliverables, styles, rtl)
    else:
        render_section(story, "In scope", sections.get("in_scope", []), styles, rtl)

    workflow = sections.get("workflow", [])
    if workflow:
        render_grouped_numbered(story, "Workflow", workflow, styles, rtl)

    render_section(story, "Assumptions", sections.get("assumptions", []), styles, rtl)
    render_section(story, "Open questions", sections.get("open_questions", []), styles, rtl)
    render_section(story, "Acceptance criteria", sections.get("acceptance_criteria", []), styles, rtl)
    render_section(story, "Optional future ideas", sections.get("future_ideas", []), styles, rtl)

    if approval:
        story.append(Paragraph(paragraph_text("Approval", rtl), styles["SectionTitle"]))
        story.append(HRFlowable(width="100%", thickness=1.1, color=ACCENT, spaceBefore=0, spaceAfter=6))
        review_items = approval.get("review_items", [])
        if review_items:
            render_list(story, styles["BulletTextSpec"], review_items, rtl)
        signoff = approval.get("signoff_label", "Client approval")
        story.append(Spacer(1, 4))
        story.append(Paragraph(paragraph_text(signoff, rtl), styles["BodyTextSpec"]))
        story.append(Spacer(1, 18))
        signature_lines = [
            f"{approval.get('name_label', 'Name')}: ________________________",
            f"{approval.get('date_label', 'Date')}: ________________________",
        ]
        for line in signature_lines:
            story.append(Paragraph(paragraph_text(line, rtl), styles["BodyTextSpec"]))

    return story


def load_spec(spec_path: Path) -> dict[str, Any]:
    with spec_path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def main() -> int:
    parser = argparse.ArgumentParser(description="Render a client scope spec JSON file into a PDF.")
    parser.add_argument("spec", type=Path, help="Path to the spec JSON file.")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        help="Output PDF path. Defaults to the input file name with a .pdf extension.",
    )
    args = parser.parse_args()

    spec_path = args.spec.expanduser().resolve()
    if not spec_path.exists():
        raise SystemExit(f"Spec file not found: {spec_path}")

    spec = load_spec(spec_path)
    rtl = is_rtl(spec)
    body_font, bold_font = register_body_font(rtl)
    tagline_font = register_brand_font()
    styles = build_styles(body_font, bold_font, rtl)

    output_path = args.output.expanduser().resolve() if args.output else spec_path.with_suffix(".pdf")
    output_path.parent.mkdir(parents=True, exist_ok=True)

    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=A4,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=35 * mm,
        bottomMargin=20 * mm,
        title=str(spec.get("meta", {}).get("title", "Project Scope Spec")),
        author=str(spec.get("meta", {}).get("prepared_by", "Codex")),
        subject=str(spec.get("meta", {}).get("project_name", "Project scope")),
    )

    story = build_story(spec, styles, rtl)

    def draw_page(canvas: Any, document: SimpleDocTemplate) -> None:
        draw_header(canvas, document, rtl, LOGO_PATH, tagline_font)
        draw_footer(canvas, document, body_font)

    doc.build(
        story,
        onFirstPage=draw_page,
        onLaterPages=draw_page,
    )

    print(f"Wrote {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
