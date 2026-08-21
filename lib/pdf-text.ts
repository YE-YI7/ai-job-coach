import { getData } from "pdf-parse/worker";
import { PDFParse } from "pdf-parse";

PDFParse.setWorker(getData());

/**
 * Extract selectable text from a PDF using the current PDF.js based parser.
 * A fresh byte array avoids transferring or detaching the caller's Buffer.
 */
export async function extractPdfText(input: Buffer | Uint8Array | ArrayBuffer) {
  const bytes = input instanceof ArrayBuffer
    ? new Uint8Array(input.slice(0))
    : new Uint8Array(input);
  const parser = new PDFParse({ data: bytes });

  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}
