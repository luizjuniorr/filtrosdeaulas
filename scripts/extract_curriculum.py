from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import json
import re
from typing import Any

from pypdf import PdfReader

BASE_DIR = Path(__file__).resolve().parents[1]
PDF_DIR = BASE_DIR / "pdfs"
DATA_DIR = BASE_DIR / "data"
OUTPUT_FILE = DATA_DIR / "disciplinas.js"

COURSE_TITLES = {
    "antropologiacrista": "Antropologia Cristã",
    "calculo1": "Cálculo I",
    "Construcaodealgoritimoseprogramacao": "Construção de Algoritmos e Programação",
    "interacaohumanocomputador": "Interação Humano-Computador",
    "LeituraeProducaodeTexto": "Leitura e Produção de Texto",
}

DATE_RE = re.compile(r"\b(?P<date>\d{2}/\d{2}/\d{2,4})\b")
WEIGHT_RE = re.compile(r"(?P<weight>\d+(?:[.,]\d+)?%)\s*$")
REFERENCE_RE = re.compile(r"\b(?:[ABC]\d(?:,[ABC]\d)*)\b")
TIME_RE = re.compile(r"\b\d{2}:\d{2}\b")

STOP_SUMMARY_PATTERNS = [
    re.compile(r"^Aula expositiva", re.I),
    re.compile(r"^Aula dialogada", re.I),
    re.compile(r"^Aula prática", re.I),
    re.compile(r"^Laborat[óo]rio\b", re.I),
    re.compile(r"^Atividades?\b", re.I),
    re.compile(r"^Discuss[ãa]o\b", re.I),
    re.compile(r"^Simula[cç][aã]o\b", re.I),
    re.compile(r"^Avalia[cç][aã]o\b", re.I),
    re.compile(r"^Prova\b", re.I),
    re.compile(r"^Revis[ãa]o\b", re.I),
    re.compile(r"^Lançamento\b", re.I),
    re.compile(r"^Orienta[cç][õo]es?\b", re.I),
]

SECTION_MARKERS = (
    "INSTRUMENTOS, CRITÉRIOS E CALENDÁRIO DE AVALIAÇÕES",
    "DESCRIÇÃO DA INTERDISCIPLINARIDADE",
    "BIBLIOGRAFIA BÁSICA",
    "BIBLIOGRAFIA COMPLEMENTAR",
    "INTEGRAÇÃO COM A FILOSOFIA INSTITUCIONAL",
    "TOTAL GERAL",
)


def normalize_text(text: str) -> str:
    text = text.replace("\r", "\n")
    lines = [line.strip() for line in text.splitlines()]
    return "\n".join(line for line in lines if line)


def course_title_from_stem(stem: str) -> str:
    if stem in COURSE_TITLES:
        return COURSE_TITLES[stem]
    cleaned = re.sub(r"([a-z])([A-Z])", r"\1 \2", stem)
    cleaned = cleaned.replace("_", " ").replace("-", " ")
    return " ".join(word.capitalize() for word in cleaned.split())


def tidy_summary(text: str) -> str:
    text = text.replace("\n", " ")
    text = re.sub(r"^\s*\d+(?:,\d+)*\s*\d*\s*", "", text)
    text = REFERENCE_RE.sub("", text)
    text = TIME_RE.sub("", text)
    text = re.sub(r"\s{2,}", " ", text)
    return text.strip(" -;,")


def build_summary(lines: list[str]) -> str:
    content_parts: list[str] = []
    for line in lines:
        if not line:
            continue
        if any(pattern.search(line) for pattern in STOP_SUMMARY_PATTERNS):
            break
        if line.upper().startswith("PÁGINA "):
            break
        if DATE_RE.search(line):
            continue
        content_parts.append(line)
    summary = tidy_summary(" ".join(content_parts))
    if len(summary) > 220:
        summary = summary[:217].rsplit(" ", 1)[0] + "..."
    return summary


def extract_schedule_rows(page_text: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    lines = normalize_text(page_text).split("\n")
    collecting: list[str] = []
    current_date: str | None = None

    def flush() -> None:
        nonlocal collecting, current_date
        if not current_date or not collecting:
            collecting = []
            current_date = None
            return
        raw = "\n".join(collecting).strip()
        row_lines = collecting[:]
        first_line = row_lines[0]
        match = DATE_RE.search(first_line)
        if not match:
            collecting = []
            current_date = None
            return
        after_date = first_line[match.end():].strip()
        remaining = [after_date] if after_date else []
        remaining.extend(row_lines[1:])
        summary = build_summary(remaining)
        rows.append(
            {
                "date": current_date,
                "summary": summary,
                "raw": raw,
            }
        )
        collecting = []
        current_date = None

    for line in lines:
        upper = line.upper()
        if upper.startswith("TOTAL") and current_date:
            flush()
            break
        if any(marker in upper for marker in SECTION_MARKERS):
            flush()
            break
        match = DATE_RE.search(line)
        if match:
            flush()
            current_date = match.group("date")
            collecting = [line]
            continue
        if current_date:
            collecting.append(line)
    flush()
    return rows


def extract_evaluations(page_text: str) -> list[dict[str, Any]]:
    text = normalize_text(page_text)
    start = text.upper().find("INSTRUMENTOS, CRITÉRIOS E CALENDÁRIO DE AVALIAÇÕES")
    if start == -1:
        return []
    end = len(text)
    for marker in ("DESCRIÇÃO DA INTERDISCIPLINARIDADE", "BIBLIOGRAFIA", "INTEGRAÇÃO COM A FILOSOFIA INSTITUCIONAL"):
        idx = text.upper().find(marker, start)
        if idx != -1:
            end = min(end, idx)
    section = text[start:end]
    rows: list[dict[str, Any]] = []
    pattern = re.compile(r"(?P<date>\d{2}/\d{2}/\d{4})\s+(?P<body>.*?)(?=\n\d{2}/\d{2}/\d{4}|$)", re.S)
    for match in pattern.finditer(section):
        date = match.group("date")
        body = " ".join(part.strip() for part in match.group("body").splitlines() if part.strip())
        weight_match = WEIGHT_RE.search(body)
        weight = weight_match.group("weight") if weight_match else ""
        label = body[: weight_match.start()].strip() if weight_match else body.strip()
        rows.append(
            {
                "date": date,
                "label": label,
                "weight": weight,
                "raw": body,
            }
        )
    return rows


def main() -> None:
    DATA_DIR.mkdir(exist_ok=True)
    disciplines: list[dict[str, Any]] = []

    for pdf_path in sorted(PDF_DIR.glob("*.pdf")):
        reader = PdfReader(str(pdf_path))
        schedule: list[dict[str, Any]] = []
        evaluations: list[dict[str, Any]] = []
        for page in reader.pages:
            page_text = page.extract_text() or ""
            if not page_text.strip():
                continue
            upper = page_text.upper()
            if DATE_RE.search(page_text) and "INSTRUMENTOS, CRITÉRIOS E CALENDÁRIO DE AVALIAÇÕES" not in upper:
                schedule.extend(extract_schedule_rows(page_text))
            if "INSTRUMENTOS, CRITÉRIOS E CALENDÁRIO DE AVALIAÇÕES" in upper:
                evaluations.extend(extract_evaluations(page_text))

        disciplines.append(
            {
                "slug": pdf_path.stem,
                "title": course_title_from_stem(pdf_path.stem),
                "pdf": f"pdfs/{pdf_path.name}",
                "schedule": schedule,
                "evaluations": evaluations,
            }
        )

    payload = {
        "generatedAt": "2026-08-12",
        "disciplines": disciplines,
    }

    OUTPUT_FILE.write_text(
        "window.WEBAULAS_DATA = " + json.dumps(payload, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8",
    )
    print(f"Wrote {OUTPUT_FILE}")
    for discipline in disciplines:
        print(
            discipline["title"],
            "schedule",
            len(discipline["schedule"]),
            "evaluations",
            len(discipline["evaluations"]),
        )


if __name__ == "__main__":
    main()
