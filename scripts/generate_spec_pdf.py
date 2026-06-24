#!/usr/bin/env python3
"""Render a client scope spec JSON file into a PDF document."""

from __future__ import annotations

import argparse
import json
from html import escape
from pathlib import Path
from typing import Any

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer


ACCENT = colors.HexColor("#0f4c5c")
TEXT = colors.HexColor("#1f2937")
MUTED = colors.HexColor("#6b7280")
BORDER = colors.HexColor("#d7dde5")


def register_body_font(rtl: bool) -> tuple[str, str]:
    """Register a system font when possible and return body/bold font names."""
    if not rtl:
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
            fontSize=24,
            leading=28,
            textColor=ACCENT,
            alignment=alignment,
            spaceAfter=6,
        )
    )
    styles.add(
        ParagraphStyle(
            name="SectionTitle",
            parent=styles["Heading2"],
            fontName=bold_font,
            fontSize=14,
            leading=18,
            textColor=ACCENT,
            alignment=alignment,
            spaceBefore=8,
            spaceAfter=6,
        )
    )
    styles.add(
        ParagraphStyle(
            name="BodyTextSpec",
            parent=styles["BodyText"],
            fontName=body_font,
            fontSize=10.5,
            leading=15,
            textColor=TEXT,
            alignment=alignment,
            spaceAfter=3,
        )
    )
    styles.add(
        ParagraphStyle(
            name="BulletTextSpec",
            parent=styles["BodyText"],
            fontName=body_font,
            fontSize=10.5,
            leading=15,
            textColor=TEXT,
            alignment=alignment,
            leftIndent=10,
            firstLineIndent=-10,
            spaceAfter=2,
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


def render_section(story: list[Any], title: str, content: list[str], styles: dict[str, ParagraphStyle], rtl: bool) -> None:
    if not content:
        return
    story.append(Paragraph(paragraph_text(title, rtl), styles["SectionTitle"]))
    story.append(HRFlowable(width="100%", thickness=1, color=BORDER, spaceBefore=0, spaceAfter=6))
    render_list(story, styles["BulletTextSpec"], content, rtl)
    story.append(Spacer(1, 5))


def render_text_block(story: list[Any], title: str, text: str, styles: dict[str, ParagraphStyle], rtl: bool) -> None:
    if not text:
        return
    story.append(Paragraph(paragraph_text(title, rtl), styles["SectionTitle"]))
    story.append(HRFlowable(width="100%", thickness=1, color=BORDER, spaceBefore=0, spaceAfter=6))
    story.append(Paragraph(paragraph_text(text, rtl), styles["BodyTextSpec"]))
    story.append(Spacer(1, 5))


def draw_footer(canvas: Any, doc: SimpleDocTemplate, source_name: str, body_font: str) -> None:
    canvas.saveState()
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.75)
    canvas.line(doc.leftMargin, 14 * mm, A4[0] - doc.rightMargin, 14 * mm)
    canvas.setFont(body_font, 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(doc.leftMargin, 8 * mm, f"Source: {source_name}")
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
        render_section(story, "Client deliverables", deliverables, styles, rtl)
    else:
        render_section(story, "In scope", sections.get("in_scope", []), styles, rtl)

    workflow = sections.get("workflow", [])
    if workflow:
        story.append(Paragraph(paragraph_text("Workflow", rtl), styles["SectionTitle"]))
        story.append(HRFlowable(width="100%", thickness=1, color=BORDER, spaceBefore=0, spaceAfter=6))
        render_numbered_list(story, styles["BodyTextSpec"], workflow, rtl)
        story.append(Spacer(1, 5))

    render_section(story, "Assumptions", sections.get("assumptions", []), styles, rtl)
    render_section(story, "Open questions", sections.get("open_questions", []), styles, rtl)
    render_section(story, "Acceptance criteria", sections.get("acceptance_criteria", []), styles, rtl)
    render_section(story, "Optional future ideas", sections.get("future_ideas", []), styles, rtl)

    if approval:
        story.append(Paragraph(paragraph_text("Approval", rtl), styles["SectionTitle"]))
        story.append(HRFlowable(width="100%", thickness=1, color=BORDER, spaceBefore=0, spaceAfter=6))
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
    styles = build_styles(body_font, bold_font, rtl)

    output_path = args.output.expanduser().resolve() if args.output else spec_path.with_suffix(".pdf")
    output_path.parent.mkdir(parents=True, exist_ok=True)

    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=A4,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=18 * mm,
        bottomMargin=20 * mm,
        title=str(spec.get("meta", {}).get("title", "Project Scope Spec")),
        author=str(spec.get("meta", {}).get("prepared_by", "Codex")),
        subject=str(spec.get("meta", {}).get("project_name", "Project scope")),
    )

    try:
        source_name = str(spec_path.relative_to(Path.cwd()))
    except ValueError:
        source_name = spec_path.name

    story = build_story(spec, styles, rtl)
    doc.build(
        story,
        onFirstPage=lambda canvas, document: draw_footer(canvas, document, source_name, body_font),
        onLaterPages=lambda canvas, document: draw_footer(canvas, document, source_name, body_font),
    )

    print(f"Wrote {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
