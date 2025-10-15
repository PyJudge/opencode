import z from "zod/v4"
import * as fs from "fs"
import * as path from "path"
import { Tool } from "./tool"
import { LSP } from "../lsp"
import { FileTime } from "../file/time"
import DESCRIPTION from "./read.txt"
import { Filesystem } from "../util/filesystem"
import { Instance } from "../project/instance"
import { Provider } from "../provider/provider"
import { Identifier } from "../id/id"
import { isPdfFile, processPdfFile } from "./pdf"

const DEFAULT_READ_LIMIT = 2000
const MAX_LINE_LENGTH = 2000

export const ReadTool = Tool.define("read", {
  description: DESCRIPTION,
  parameters: z.object({
    filePath: z.string().describe("The path to the file to read").optional(),
    offset: z.coerce.number().describe("The line number to start reading from (0-based)").optional(),
    limit: z.coerce.number().describe("The number of lines to read (defaults to 2000)").optional(),
    items: z
      .array(
        z.discriminatedUnion("type", [
          z.object({
            type: z.literal("text"),
            text: z.string().describe("Text content to include"),
          }),
          z.object({
            type: z.literal("file"),
            path: z.string().describe("Path to the file to read"),
          }),
        ]),
      )
      .describe("Array of text and file items to read in order. Use this for interleaved text and images.")
      .optional(),
  }),
  async execute(params, ctx) {
    // Validate: must have either filePath or items
    if (!params.filePath && !params.items) {
      throw new Error("Either filePath or items must be provided")
    }
    if (params.filePath && params.items) {
      throw new Error("Cannot use both filePath and items")
    }

    // Convert single file mode to batch mode for unified processing
    const items = params.filePath
      ? [{ type: "file" as const, path: params.filePath, offset: params.offset, limit: params.limit }]
      : params.items!

    const structuredContent: Array<
      | { type: "text"; text: string }
      | { id: string; sessionID: string; messageID: string; type: "file"; mime: string; url: string; filename?: string }
    > = []
    let hasImages = false

    // Process each item
    for (const item of items) {
      if (item.type === "text") {
        structuredContent.push({
          type: "text",
          text: item.text,
        })
        continue
      }

      // Process file item
      let filepath = item.path
      if (!path.isAbsolute(filepath)) {
        filepath = path.join(process.cwd(), filepath)
      }

      if (!ctx.extra?.["bypassCwdCheck"] && !Filesystem.contains(Instance.directory, filepath)) {
        throw new Error(`File ${filepath} is not in the current working directory`)
      }

      const file = Bun.file(filepath)
      if (!(await file.exists())) {
        const dir = path.dirname(filepath)
        const base = path.basename(filepath)

        const dirEntries = fs.readdirSync(dir)
        const suggestions = dirEntries
          .filter(
            (entry) =>
              entry.toLowerCase().includes(base.toLowerCase()) || base.toLowerCase().includes(entry.toLowerCase()),
          )
          .map((entry) => path.join(dir, entry))
          .slice(0, 3)

        if (suggestions.length > 0) {
          throw new Error(`File not found: ${filepath}\n\nDid you mean one of these?\n${suggestions.join("\n")}`)
        }

        throw new Error(`File not found: ${filepath}`)
      }

      const isImage = isImageFile(filepath)
      const isPdf = isPdfFile(filepath)
      const supportsImages = await (async () => {
        // Allow bypassing model check for testing
        if (ctx.extra?.["supportsImages"] !== undefined) {
          return ctx.extra["supportsImages"] as boolean
        }
        if (!ctx.extra?.["providerID"] || !ctx.extra?.["modelID"]) return false
        const providerID = ctx.extra["providerID"] as string
        const modelID = ctx.extra["modelID"] as string
        const model = await Provider.getModel(providerID, modelID).catch(() => undefined)
        if (!model) return false
        return model.info.modalities?.input?.includes("image") ?? false
      })()

      const supportsPdf = await (async () => {
        // Allow bypassing model check for testing
        if (ctx.extra?.["supportsPdf"] !== undefined) {
          return ctx.extra["supportsPdf"] as boolean
        }
        if (!ctx.extra?.["providerID"] || !ctx.extra?.["modelID"]) return false
        const providerID = ctx.extra["providerID"] as string
        const modelID = ctx.extra["modelID"] as string
        const model = await Provider.getModel(providerID, modelID).catch(() => undefined)
        if (!model) return false
        return model.info.modalities?.input?.includes("pdf") ?? false
      })()

      if (isPdf) {
        if (!supportsPdf) {
          throw new Error(`Failed to read PDF: ${filepath}, model may not be able to read PDF files`)
        }
        hasImages = true
        const pdfContent = await processPdfFile(filepath, ctx)
        structuredContent.push(...pdfContent)
        continue
      }

      if (isImage) {
        if (!supportsImages) {
          throw new Error(`Failed to read image: ${filepath}, model may not be able to read images`)
        }
        hasImages = true
        const mime = file.type
        structuredContent.push({
          id: Identifier.ascending("part"),
          sessionID: ctx.sessionID,
          messageID: ctx.messageID,
          type: "file",
          mime,
          url: `data:${mime};base64,${Buffer.from(await file.bytes()).toString("base64")}`,
          filename: path.basename(filepath),
        })
        continue
      }

      // Text file processing
      const isBinary = await isBinaryFile(filepath, file)
      if (isBinary) throw new Error(`Cannot read binary file: ${filepath}`)

      const limit = ("limit" in item ? item.limit : undefined) ?? DEFAULT_READ_LIMIT
      const offset = ("offset" in item ? item.offset : undefined) || 0
      const lines = await file.text().then((text) => text.split("\n"))
      const raw = lines.slice(offset, offset + limit).map((line) => {
        return line.length > MAX_LINE_LENGTH ? line.substring(0, MAX_LINE_LENGTH) + "..." : line
      })
      const content = raw.map((line, index) => {
        return `${(index + offset + 1).toString().padStart(5, "0")}| ${line}`
      })

      let textOutput = "<file>\n"
      textOutput += content.join("\n")

      if (lines.length > offset + content.length) {
        textOutput += `\n\n(File has more lines. Use 'offset' parameter to read beyond line ${offset + content.length})`
      }
      textOutput += "\n</file>"

      structuredContent.push({
        type: "text",
        text: textOutput,
      })

      // Warm the lsp client
      LSP.touchFile(filepath, false)
      FileTime.read(ctx.sessionID, filepath)
    }

    // Determine return format
    const title = params.filePath
      ? (() => {
          const fp = params.filePath!
          try {
            return path.relative(Instance.worktree, fp.startsWith("/") ? fp : path.join(process.cwd(), fp))
          } catch {
            // Fallback for testing without Instance context
            return path.basename(fp)
          }
        })()
      : `${items.length} item(s)`

    const preview = structuredContent
      .filter((p) => p.type === "text")
      .map((p) => p.text)
      .join("\n")
      .slice(0, 100)

    // If has images or multiple items, use structuredContent
    if (hasImages || items.length > 1) {
      return {
        title,
        output: "",
        metadata: { preview },
        structuredContent,
      }
    }

    // Single text file: use legacy output format
    return {
      title,
      output: structuredContent[0].type === "text" ? structuredContent[0].text : "",
      metadata: { preview },
    }
  },
})

function isImageFile(filePath: string): string | false {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "JPEG"
    case ".png":
      return "PNG"
    case ".gif":
      return "GIF"
    case ".bmp":
      return "BMP"
    case ".webp":
      return "WebP"
    default:
      return false
  }
}

async function isBinaryFile(filepath: string, file: Bun.BunFile): Promise<boolean> {
  const ext = path.extname(filepath).toLowerCase()
  // binary check for common non-text extensions
  switch (ext) {
    case ".zip":
    case ".tar":
    case ".gz":
    case ".exe":
    case ".dll":
    case ".so":
    case ".class":
    case ".jar":
    case ".war":
    case ".7z":
    case ".doc":
    case ".docx":
    case ".xls":
    case ".xlsx":
    case ".ppt":
    case ".pptx":
    case ".odt":
    case ".ods":
    case ".odp":
    case ".bin":
    case ".dat":
    case ".obj":
    case ".o":
    case ".a":
    case ".lib":
    case ".wasm":
    case ".pyc":
    case ".pyo":
      return true
    default:
      break
  }

  const stat = await file.stat()
  const fileSize = stat.size
  if (fileSize === 0) return false

  const bufferSize = Math.min(4096, fileSize)
  const buffer = await file.arrayBuffer()
  if (buffer.byteLength === 0) return false
  const bytes = new Uint8Array(buffer.slice(0, bufferSize))

  let nonPrintableCount = 0
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0) return true
    if (bytes[i] < 9 || (bytes[i] > 13 && bytes[i] < 32)) {
      nonPrintableCount++
    }
  }
  // If >30% non-printable characters, consider it binary
  return nonPrintableCount / bytes.length > 0.3
}
