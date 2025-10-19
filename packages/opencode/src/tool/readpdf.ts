import z from "zod/v4"
import * as path from "path"
import { Tool } from "./tool"
import { FileTime } from "../file/time"
import DESCRIPTION from "./readpdf.txt"
import { Filesystem } from "../util/filesystem"
import { Instance } from "../project/instance"
import { Provider } from "../provider/provider"
import { isPdfFile, processPdfFile } from "./pdf"

/**
 * Parse pages parameter into array of page numbers
 * Supports:
 * - Single number: 3 → [3]
 * - Range: "1-5" → [1,2,3,4,5]
 * - List: "1,3,5" → [1,3,5]
 * - Mixed: "1-3,7,9-10" → [1,2,3,7,9,10]
 *
 * Returns: { pages: number[], warnings: string[] }
 * - If range exceeds PDF pages, clips to available range and returns warning
 * - If all requested pages are out of range, throws error
 */
function parsePages(input: number | string, totalPages: number): { pages: number[]; warnings: string[] } {
  const warnings: string[] = []

  // Single number
  if (typeof input === "number") {
    if (input < 1 || input > totalPages) {
      throw new Error(`Page ${input} exceeds total pages (${totalPages})`)
    }
    return { pages: [input], warnings }
  }

  // String format
  const result: number[] = []
  const parts = input.split(",").map((s) => s.trim())

  for (const part of parts) {
    if (part.includes("-")) {
      // Range: "1-5"
      const [startStr, endStr] = part.split("-").map((s) => s.trim())
      const start = parseInt(startStr, 10)
      const end = parseInt(endStr, 10)

      if (isNaN(start) || isNaN(end)) {
        throw new Error(`Invalid page format: "${part}"`)
      }

      if (start > end) {
        throw new Error(`Invalid page range: ${start}-${end} (start > end)`)
      }

      // Check if entire range is out of bounds
      if (start > totalPages) {
        throw new Error(
          `Requested page range ${start}-${end} is completely out of bounds.\n` +
            `PDF has only ${totalPages} pages. Please request pages between 1-${totalPages}.`,
        )
      }

      // Clip end to totalPages if it exceeds
      let actualEnd = end
      if (end > totalPages) {
        actualEnd = totalPages
        warnings.push(
          `⚠️  Requested pages ${start}-${end}, but PDF has only ${totalPages} pages. Reading pages ${start}-${actualEnd} instead.`,
        )
      }

      for (let i = start; i <= actualEnd; i++) {
        result.push(i)
      }
    } else {
      // Single number
      const pageNum = parseInt(part, 10)

      if (isNaN(pageNum)) {
        throw new Error(`Invalid page format: "${part}"`)
      }

      if (pageNum < 1 || pageNum > totalPages) {
        throw new Error(`Page ${pageNum} exceeds total pages (${totalPages})`)
      }

      result.push(pageNum)
    }
  }

  return { pages: result, warnings }
}

export const ReadPdfTool = Tool.define("readpdf", {
  description: DESCRIPTION,
  parameters: z.object({
    filePath: z.string().describe("The absolute path to the PDF file to read (must be absolute, not relative)"),
    pages: z
      .union([z.number(), z.string()])
      .optional()
      .describe(
        'Page selection: single page (15), range ("1-5"), list ("1,3,5"), or mixed ("1-3,7,9-10"). Omit to read all pages (max 10 pages can be read per call).',
      ),
    excludeMargins: z.boolean().optional().describe("Whether to exclude headers/footers/margins (default: true)"),
  }),
  async execute(params, ctx) {
    // Resolve absolute path
    let filepath = path.isAbsolute(params.filePath) ? params.filePath : path.join(Instance.directory, params.filePath)

    // Check if file is in working directory
    if (!ctx.extra?.["bypassCwdCheck"] && !Filesystem.contains(Instance.directory, filepath)) {
      throw new Error(`File ${filepath} is not in the current working directory`)
    }

    // Check if file exists
    const file = Bun.file(filepath)
    if (!(await file.exists())) {
      throw new Error(`File not found: ${filepath}`)
    }

    // Check if it's a PDF
    if (!isPdfFile(filepath)) {
      throw new Error(`File is not a PDF: ${filepath}`)
    }

    // Check if model supports images (PDF content is converted to images)
    const supportsImages = await (async () => {
      // Allow bypassing model check for testing
      if (ctx.extra?.["supportsPdf"] !== undefined) {
        return ctx.extra["supportsPdf"] as boolean
      }
      if (!ctx.extra?.["providerID"] || !ctx.extra?.["modelID"]) return false
      const providerID = ctx.extra["providerID"] as string
      const modelID = ctx.extra["modelID"] as string
      const model = await Provider.getModel(providerID, modelID).catch(() => undefined)
      if (!model) return false
      return model.info.modalities?.input?.includes("image") ?? false
    })()

    if (!supportsImages) {
      throw new Error(`ERROR: Comclerk-cli only supports Vision llm models`)
    }

    // Get PDF metadata to determine total pages
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs")
    const workerUrl = import.meta.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs")
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl.replace("file://", "")

    const data = new Uint8Array(await file.arrayBuffer())
    const pdf = await pdfjsLib.getDocument({ data }).promise
    const totalPages = pdf.numPages

    // Parse pages parameter (undefined means all pages)
    const parseResult = params.pages !== undefined ? parsePages(params.pages, totalPages) : undefined
    const requestedPages = parseResult?.pages
    const warnings = parseResult?.warnings ?? []

    // Validate page count (max 10 pages per call)
    const pagesToRead = requestedPages ?? Array.from({ length: totalPages }, (_, i) => i + 1)
    if (pagesToRead.length > 10) {
      throw new Error(
        `Too many pages to read: ${pagesToRead.length} pages requested (max: 10 pages per call).\n` +
          `Please read fewer pages:\n` +
          `  1. Read in chunks: pages: "1-10", then pages: "11-20", etc.\n` +
          `  2. Read only specific relevant pages: pages: "5,12,25"`,
      )
    }

    // Process PDF
    const excludeMargins = params.excludeMargins ?? true
    const structuredContent = await processPdfFile(filepath, ctx, excludeMargins, requestedPages)

    // Generate title
    const filename = path.basename(filepath)
    const pageInfo = requestedPages
      ? requestedPages.length === 1
        ? ` (page ${requestedPages[0]})`
        : ` (pages ${requestedPages.join(",")})`
      : ` (all ${totalPages} pages)`
    const title = filename + pageInfo

    // Generate preview
    const preview = structuredContent
      .filter((p) => p.type === "text")
      .map((p) => p.text)
      .join("\n")
      .slice(0, 100)

    // Track file access
    FileTime.read(ctx.sessionID, filepath)

    // Prepare output with page count info and warnings
    const outputLines: string[] = []
    outputLines.push(`📄 PDF: ${totalPages} pages total`)
    if (warnings.length > 0) {
      outputLines.push(...warnings)
    }
    const output = outputLines.join("\n")

    return {
      title,
      output,
      metadata: {
        preview,
        pageCount: totalPages,
        requestedPages: requestedPages ?? Array.from({ length: totalPages }, (_, i) => i + 1),
      },
      structuredContent,
    }
  },
})
