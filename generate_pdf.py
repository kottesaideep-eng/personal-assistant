"""Convert BUILD_LOG.md to a styled PDF using fpdf2."""
import re
from pathlib import Path
from fpdf import FPDF

# ── Colours ──────────────────────────────────────────────────────────────────
C_BG        = (255, 255, 255)
C_H1_FG     = (15,  23,  42)
C_H1_RULE   = (37,  99, 235)
C_H2_FG     = (30,  64, 175)
C_H2_RULE   = (191, 219, 254)
C_H3_FG     = (30,  41,  59)
C_H4_FG     = (71, 85, 105)
C_BODY      = (30,  41,  59)
C_CODE_BG   = (15,  23,  42)
C_CODE_FG   = (226, 232, 240)
C_INLINE_BG = (241, 245, 249)
C_INLINE_FG = (15,  23,  42)
C_TH_BG     = (30,  64, 175)
C_TH_FG     = (255, 255, 255)
C_TD_ALT    = (248, 250, 252)
C_RULE      = (226, 232, 240)
C_HEADER_FG = (148, 163, 184)
C_LINK      = (37,  99, 235)
C_BULLET    = (37,  99, 235)

MARGIN_L = 18
MARGIN_R = 18
MARGIN_T = 18
MARGIN_B = 18
PAGE_W   = 210

USABLE_W = PAGE_W - MARGIN_L - MARGIN_R


class BuildLogPDF(FPDF):
    def header(self):
        if self.page_no() == 1:
            return
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(*C_HEADER_FG)
        self.set_y(8)
        self.cell(0, 5, "Personal Assistant -- Build Log", align="C", new_x="LMARGIN", new_y="NEXT")
        self.set_draw_color(*C_RULE)
        self.line(MARGIN_L, 14, PAGE_W - MARGIN_R, 14)
        self.set_y(MARGIN_T)

    def footer(self):
        self.set_y(-13)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(*C_HEADER_FG)
        self.cell(0, 5, f"Page {self.page_no()}", align="R")

    def blue_rule(self, h=0.8):
        x = self.get_x()
        y = self.get_y()
        self.set_draw_color(*C_H1_RULE)
        self.set_line_width(h)
        self.line(MARGIN_L, y, PAGE_W - MARGIN_R, y)
        self.set_line_width(0.2)
        self.ln(2)

    def light_rule(self):
        y = self.get_y()
        self.set_draw_color(*C_RULE)
        self.set_line_width(0.2)
        self.line(MARGIN_L, y, PAGE_W - MARGIN_R, y)
        self.ln(3)

    # ── Text helpers ──────────────────────────────────────────────────────────
    def write_h1(self, text):
        self.ln(2)
        self.set_font("Helvetica", "B", 18)
        self.set_text_color(*C_H1_FG)
        self.multi_cell(0, 9, text, new_x="LMARGIN", new_y="NEXT")
        self.blue_rule(0.8)
        self.ln(2)

    def write_h2(self, text):
        self.ln(4)
        self.set_font("Helvetica", "B", 13)
        self.set_text_color(*C_H2_FG)
        self.multi_cell(0, 7, text, new_x="LMARGIN", new_y="NEXT")
        y = self.get_y()
        self.set_draw_color(*C_H2_RULE)
        self.set_line_width(0.4)
        self.line(MARGIN_L, y, PAGE_W - MARGIN_R, y)
        self.set_line_width(0.2)
        self.ln(3)

    def write_h3(self, text):
        self.ln(3)
        self.set_font("Helvetica", "B", 11)
        self.set_text_color(*C_H3_FG)
        self.multi_cell(0, 6, text, new_x="LMARGIN", new_y="NEXT")
        self.ln(1)

    def write_h4(self, text):
        self.ln(2)
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(*C_H4_FG)
        self.multi_cell(0, 5.5, text, new_x="LMARGIN", new_y="NEXT")
        self.ln(1)

    def write_body(self, text):
        self.set_font("Helvetica", "", 10)
        self.set_text_color(*C_BODY)
        self.multi_cell(0, 5.5, text, new_x="LMARGIN", new_y="NEXT")
        self.ln(1)

    def write_bullet(self, text, level=0):
        indent = 6 + level * 5
        bullet_x = MARGIN_L + indent
        text_x   = bullet_x + 5
        text_w   = USABLE_W - indent - 5
        y = self.get_y()
        # bullet dot
        self.set_fill_color(*C_BULLET)
        self.ellipse(bullet_x + 0.5, y + 2.2, 2, 2, "F")
        # text
        self.set_xy(text_x, y)
        self.set_font("Helvetica", "", 9.5)
        self.set_text_color(*C_BODY)
        self.multi_cell(text_w, 5, text, new_x="LMARGIN", new_y="NEXT")

    def write_ordered(self, text, number):
        indent = 6
        num_x  = MARGIN_L + indent
        text_x = num_x + 7
        text_w = USABLE_W - indent - 7
        y = self.get_y()
        self.set_xy(num_x, y)
        self.set_font("Helvetica", "B", 9.5)
        self.set_text_color(*C_BULLET)
        self.cell(7, 5, f"{number}.", new_x="RIGHT", new_y="TOP")
        self.set_xy(text_x, y)
        self.set_font("Helvetica", "", 9.5)
        self.set_text_color(*C_BODY)
        self.multi_cell(text_w, 5, text, new_x="LMARGIN", new_y="NEXT")

    def write_code_block(self, lines):
        pad = 4
        line_h = 4.5
        block_h = len(lines) * line_h + pad * 2
        # check page break
        if self.get_y() + block_h > (self.h - MARGIN_B - 10):
            self.add_page()
        x = MARGIN_L
        y = self.get_y()
        w = USABLE_W
        # background
        self.set_fill_color(*C_CODE_BG)
        self.rect(x, y, w, block_h, "F")
        # left accent bar
        self.set_fill_color(*C_H1_RULE)
        self.rect(x, y, 3, block_h, "F")
        # text
        self.set_font("Courier", "", 8)
        self.set_text_color(*C_CODE_FG)
        self.set_xy(x + 6, y + pad)
        for line in lines:
            self.set_x(x + 6)
            self.cell(w - 8, line_h, clean(line)[:110], new_x="LMARGIN", new_y="NEXT")
        self.ln(3)

    def write_table(self, header_row, rows):
        col_count = len(header_row)
        col_w = USABLE_W / col_count
        row_h = 6

        # header
        self.set_fill_color(*C_TH_BG)
        self.set_text_color(*C_TH_FG)
        self.set_font("Helvetica", "B", 8.5)
        for cell in header_row:
            self.cell(col_w, row_h, cell[:40], border=0, fill=True, new_x="RIGHT", new_y="TOP")
        self.ln(row_h)

        # rows
        self.set_font("Helvetica", "", 8.5)
        for i, row in enumerate(rows):
            fill = i % 2 == 1
            self.set_fill_color(*C_TD_ALT)
            self.set_text_color(*C_BODY)
            max_lines = 1
            row_texts = []
            for cell in row:
                txt = cell[:80]
                row_texts.append(txt)
                lines = max(1, len(txt) // 35 + 1)
                max_lines = max(max_lines, lines)
            cell_h = row_h * max_lines
            for cell in row_texts:
                self.multi_cell(col_w, row_h, cell, border=0,
                                fill=fill, new_x="RIGHT", new_y="TOP",
                                max_line_height=row_h)
            self.ln(cell_h)
        self.ln(3)

    def write_hr(self):
        self.ln(3)
        self.light_rule()

    def write_blockquote(self, text):
        x = MARGIN_L + 4
        y = self.get_y()
        # accent bar
        text_w = USABLE_W - 12
        self.set_font("Helvetica", "I", 9.5)
        # measure height
        nb = self.multi_cell(text_w, 5, text, dry_run=True, output="LINES")
        bh = len(nb) * 5 + 6
        self.set_fill_color(239, 246, 255)
        self.rect(MARGIN_L, y, USABLE_W, bh, "F")
        self.set_fill_color(*C_H1_RULE)
        self.rect(MARGIN_L, y, 3, bh, "F")
        self.set_xy(x + 4, y + 3)
        self.set_text_color(30, 64, 175)
        self.multi_cell(text_w, 5, text, new_x="LMARGIN", new_y="NEXT")
        self.ln(3)


# ── Parser ────────────────────────────────────────────────────────────────────
_UNICODE_MAP = {
    '\u2014': '--',   '\u2013': '-',    '\u2018': "'",   '\u2019': "'",
    '\u201c': '"',    '\u201d': '"',    '\u2026': '...', '\u2022': '-',
    '\u2192': '->',   '\u2190': '<-',   '\u00a0': ' ',   '\u2713': 'ok',
    '\u2714': 'ok',   '\u2715': 'x',    '\u2716': 'x',   '\u00e2': 'a',
    '\u2012': '-',    '\u2010': '-',    '\u2011': '-',    '\u25ba': '>',
    '\u2764': '<3',   '\u2665': '<3',   '\u00b0': 'deg', '\u00b7': '.',
}

def clean(text):
    """Sanitise text to latin-1 safe for fpdf built-in fonts."""
    for src, dst in _UNICODE_MAP.items():
        text = text.replace(src, dst)
    return text.encode('latin-1', errors='replace').decode('latin-1')


def strip_inline(text):
    """Remove markdown inline syntax then sanitise."""
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
    text = re.sub(r'\*(.+?)\*',     r'\1', text)
    text = re.sub(r'`(.+?)`',       r'\1', text)
    text = re.sub(r'\[(.+?)\]\(.+?\)', r'\1', text)
    return clean(text)


def render(pdf, md_text):
    lines = md_text.splitlines()
    i = 0
    in_code = False
    code_lines = []
    table_header = None
    table_rows = []
    in_table = False
    ol_counter = 0

    while i < len(lines):
        raw = lines[i]
        line = raw.rstrip()

        # ── Fenced code block ──────────────────────────────────────────────
        if line.startswith("```"):
            if not in_code:
                in_code = True
                code_lines = []
                i += 1
                continue
            else:
                in_code = False
                pdf.write_code_block(code_lines)
                code_lines = []
                i += 1
                continue

        if in_code:
            code_lines.append(line)
            i += 1
            continue

        # ── Table ──────────────────────────────────────────────────────────
        if line.startswith("|"):
            cells = [c.strip() for c in line.strip("|").split("|")]
            if table_header is None:
                table_header = cells
            elif all(re.match(r'^[-:]+$', c.replace(" ", "")) for c in cells):
                pass  # separator row
            else:
                table_rows.append(cells)
            i += 1
            # flush when next line is not a table row
            if i >= len(lines) or not lines[i].startswith("|"):
                if table_header:
                    pdf.write_table(table_header, table_rows)
                table_header = None
                table_rows = []
            continue

        # ── Headings ───────────────────────────────────────────────────────
        if line.startswith("#### "):
            pdf.write_h4(strip_inline(line[5:]))
            ol_counter = 0
        elif line.startswith("### "):
            pdf.write_h3(strip_inline(line[4:]))
            ol_counter = 0
        elif line.startswith("## "):
            pdf.write_h2(strip_inline(line[3:]))
            ol_counter = 0
        elif line.startswith("# "):
            pdf.write_h1(strip_inline(line[2:]))
            ol_counter = 0

        # ── Horizontal rule ────────────────────────────────────────────────
        elif re.match(r'^-{3,}$', line) or re.match(r'^\*{3,}$', line):
            pdf.write_hr()
            ol_counter = 0

        # ── Ordered list ───────────────────────────────────────────────────
        elif re.match(r'^\d+\. ', line):
            ol_counter += 1
            text = re.sub(r'^\d+\. ', '', line)
            pdf.write_ordered(strip_inline(text), ol_counter)

        # ── Unordered list ─────────────────────────────────────────────────
        elif re.match(r'^(\s*)[-*+] ', line):
            level = (len(line) - len(line.lstrip())) // 2
            text = re.sub(r'^(\s*)[-*+] ', '', line)
            pdf.write_bullet(strip_inline(text), level)
            ol_counter = 0

        # ── Blockquote ─────────────────────────────────────────────────────
        elif line.startswith("> "):
            # collect multi-line blockquote
            bq_lines = [line[2:]]
            while i + 1 < len(lines) and lines[i+1].startswith("> "):
                i += 1
                bq_lines.append(lines[i][2:])
            pdf.write_blockquote(strip_inline(" ".join(bq_lines)))
            ol_counter = 0

        # ── Blank line ─────────────────────────────────────────────────────
        elif line == "":
            pdf.ln(1.5)
            ol_counter = 0

        # ── Normal paragraph ───────────────────────────────────────────────
        else:
            pdf.write_body(strip_inline(line))
            ol_counter = 0

        i += 1


def main():
    md_path  = Path(__file__).parent / "BUILD_LOG.md"
    pdf_path = Path(__file__).parent / "BUILD_LOG.pdf"

    pdf = BuildLogPDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=MARGIN_B)
    pdf.set_margins(MARGIN_L, MARGIN_T, MARGIN_R)
    pdf.add_page()

    render(pdf, clean(md_path.read_text()))

    pdf.output(str(pdf_path))
    print(f"✅  PDF saved → {pdf_path}")


if __name__ == "__main__":
    main()
