import { jsPDF } from "jspdf";
import { extractPdfText } from "./pdf-text";

describe("extractPdfText", () => {
  test("extracts text from a modern PDF with an xref table", async () => {
    const document = new jsPDF();
    document.text("AI Product Manager Resume", 20, 20);
    document.text("Led an AI workflow pilot and defined evaluation cases.", 20, 30);

    const text = await extractPdfText(document.output("arraybuffer"));

    expect(text).toContain("AI Product Manager Resume");
    expect(text).toContain("defined evaluation cases");
  });
});
