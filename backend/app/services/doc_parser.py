import io
import re
import openpyxl
from pypdf import PdfReader
from docx import Document as DocxDocument

class DocumentParser:
    @staticmethod
    def extract_text_from_pdf(file_content: bytes) -> str:
        """Extract text from a PDF file using pypdf."""
        try:
            reader = PdfReader(io.BytesIO(file_content))
            text = []
            for page in reader.pages:
                page_text = page.extract_text()
                if page_text:
                    text.append(page_text)
            return "\n".join(text)
        except Exception as e:
            print(f"Error parsing PDF: {e}")
            raise ValueError(f"Failed to parse PDF document: {str(e)}")

    @staticmethod
    def extract_text_and_data_from_excel(file_content: bytes) -> tuple[dict, str]:
        """
        Extract text and structure from Excel using openpyxl.
        Searches cells for operational KPI keywords.
        """
        try:
            wb = openpyxl.load_workbook(io.BytesIO(file_content), data_only=True)
            text_lines = []
            extracted_metrics = {}
            
            # Simple keyword mappings
            sales_patterns = [r"sales", r"revenue", r"collection", r"turnover"]
            attendance_patterns = [r"attendance", r"staff", r"employees", r"headcount", r"present"]
            target_patterns = [r"target", r"achievement", r"percentage", r"target%"]
            
            for sheet_name in wb.sheetnames:
                sheet = wb[sheet_name]
                text_lines.append(f"--- Sheet: {sheet_name} ---")
                for row_idx, row in enumerate(sheet.iter_rows(values_only=True), start=1):
                    row_vals = [str(val) if val is not None else "" for val in row]
                    row_str = " | ".join(row_vals).strip()
                    if row_str.replace("|", "").strip():
                        text_lines.append(row_str)
                    
                    # Try to extract metrics from cell adjacencies (e.g., A1: "Sales", B1: 450000)
                    for col_idx, val in enumerate(row):
                        if isinstance(val, str):
                            val_lower = val.lower()
                            # Check Sales
                            if any(re.search(pat, val_lower) for pat in sales_patterns):
                                # Look in next cell
                                if col_idx + 1 < len(row) and isinstance(row[col_idx + 1], (int, float)):
                                    extracted_metrics["sales_amount"] = float(row[col_idx + 1])
                            # Check Attendance
                            if any(re.search(pat, val_lower) for pat in attendance_patterns):
                                if col_idx + 1 < len(row) and isinstance(row[col_idx + 1], int):
                                    extracted_metrics["attendance_count"] = int(row[col_idx + 1])
                            # Check Target Achievement
                            if any(re.search(pat, val_lower) for pat in target_patterns):
                                if col_idx + 1 < len(row) and isinstance(row[col_idx + 1], (int, float)):
                                    ach = row[col_idx + 1]
                                    # Normalize percentage (e.g., 0.85 -> 85.0 or 85 -> 85.0)
                                    if ach <= 1.0:
                                        ach *= 100
                                    extracted_metrics["target_achievement"] = float(ach)
            
            full_text = "\n".join(text_lines)
            return extracted_metrics, full_text
        except Exception as e:
            print(f"Error parsing Excel: {e}")
            raise ValueError(f"Failed to parse Excel document: {str(e)}")

    @staticmethod
    def extract_text_from_docx(file_content: bytes) -> str:
        """Extract text from Word Document using python-docx."""
        try:
            doc = DocxDocument(io.BytesIO(file_content))
            text = []
            for paragraph in doc.paragraphs:
                if paragraph.text:
                    text.append(paragraph.text)
            
            # Extract table contents too
            for table in doc.tables:
                for row in table.rows:
                    row_text = [cell.text.strip() for cell in row.cells if cell.text]
                    if row_text:
                        text.append(" | ".join(row_text))
            
            return "\n".join(text)
        except Exception as e:
            print(f"Error parsing Word Document: {e}")
            raise ValueError(f"Failed to parse Word Document: {str(e)}")

    @classmethod
    def parse_document(cls, file_content: bytes, file_name: str) -> tuple[dict, str]:
        """
        Main routing method to parse a document based on its extension.
        Returns a tuple (extracted_metrics, full_text_content).
        """
        ext = file_name.split(".")[-1].lower()
        full_text = ""
        extracted_metrics = {}

        if ext == "pdf":
            full_text = cls.extract_text_from_pdf(file_content)
        elif ext in ["xlsx", "xls"]:
            extracted_metrics, full_text = cls.extract_text_and_data_from_excel(file_content)
        elif ext in ["docx", "doc"]:
            full_text = cls.extract_text_from_docx(file_content)
        else:
            raise ValueError(f"Unsupported file format: {ext}")

        # Run heuristic regex parses on PDF/Word text if structured data is not yet found
        if "sales_amount" not in extracted_metrics:
            sales_match = re.search(r"(?:sales|revenue|collection)[:\s]*Rs\.?\s*([\d,]+(?:\.\d{2})?)", full_text, re.IGNORECASE)
            if sales_match:
                extracted_metrics["sales_amount"] = float(sales_match.group(1).replace(",", ""))
        
        if "attendance_count" not in extracted_metrics:
            att_match = re.search(r"(?:attendance|staff present|headcount)[:\s]*(\d+)", full_text, re.IGNORECASE)
            if att_match:
                extracted_metrics["attendance_count"] = int(att_match.group(1))

        if "target_achievement" not in extracted_metrics:
            target_match = re.search(r"(?:target achievement|achievement|target)[:\s]*(\d+(?:\.\d+)?)\s*%", full_text, re.IGNORECASE)
            if target_match:
                extracted_metrics["target_achievement"] = float(target_match.group(1))

        # Scan for remarks / issues
        remarks_match = re.search(r"(?:remarks|notes|comments)[:\s]*(.*)", full_text, re.IGNORECASE)
        if remarks_match:
            extracted_metrics["remarks"] = remarks_match.group(1).strip()[:1000]

        issues_match = re.search(r"(?:issues|complaints|problems|incidents)[:\s]*(.*)", full_text, re.IGNORECASE)
        if issues_match:
            extracted_metrics["issues"] = issues_match.group(1).strip()[:1000]

        return extracted_metrics, full_text

document_parser = DocumentParser()
