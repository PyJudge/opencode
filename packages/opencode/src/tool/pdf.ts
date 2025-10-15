/**
 * PDF Processing Utilities for ReadTool
 *
 * This module handles PDF file reading with support for:
 * - OCR detection (text layer existence check)
 * - Mixed content extraction (text + images in order)
 * - Margin filtering (header, footer, left, right)
 * - Structured content output for LLM consumption
 */

import { Identifier } from "../id/id"
import type { Tool } from "./tool"

type StructuredContentItem =
  | { type: "text"; text: string }
  | { id: string; sessionID: string; messageID: string; type: "file"; mime: string; url: string; filename?: string }

// PDF.js worker singleton
let pdfWorkerPromise: Promise<any> | null = null

async function getPdfWorker() {
  if (!pdfWorkerPromise) {
    pdfWorkerPromise = (async () => {
      const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs")
      const workerUrl = import.meta.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs")
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl.replace("file://", "")

      return pdfjsLib
    })()
  }
  return pdfWorkerPromise
}

/**
 * Check if a file is a PDF based on extension
 */
export function isPdfFile(filePath: string): boolean {
  const ext = filePath.toLowerCase().split(".").pop()
  return ext === "pdf"
}

/**
 * Check if a point (x, y) is in margin area
 */
function isInMargin(
  x: number,
  y: number,
  viewport: { width: number; height: number },
  thresholds: { top: number; bottom: number; left: number; right: number },
): boolean {
  const { width, height } = viewport

  // 상단 헤더 (경계 포함)
  if (y >= height * (1 - thresholds.top)) return true

  // 하단 푸터 (경계 포함)
  if (y <= height * thresholds.bottom) return true

  // 좌측 마진 (경계 포함)
  if (x <= width * thresholds.left) return true

  // 우측 마진 (경계 포함)
  if (x >= width * (1 - thresholds.right)) return true

  return false
}

/**
 * Check if a PDF page has extractable text (OCR detection)
 */
async function pageHasText(page: any): Promise<boolean> {
  const textContent = await page.getTextContent()
  const text = textContent.items
    .map((item: any) => ("str" in item ? item.str : ""))
    .join("")
    .trim()
  // Consider OCR'd if there's at least 10 characters of meaningful text
  return text.length > 10
}

/**
 * Extract mixed content (text + images) in order from a PDF page
 *
 * This function:
 * 1. Iterates through PDF operators in stream order (preserves rendering order)
 * 2. Maps text operators to textContent items
 * 3. Extracts images from page.objs/commonObjs
 * 4. Filters out margin content (header/footer/sides)
 * 5. Returns structured content array with preserved order
 */
async function extractMixedContent(
  page: any,
  pageNum: number,
  ctx: Tool.Context,
  excludeMargins: boolean = true,
): Promise<StructuredContentItem[]> {
  const pdfjsLib = await getPdfWorker()
  const ops = await page.getOperatorList()
  const textContent = await page.getTextContent()
  const viewport = page.getViewport({ scale: 1.0 })

  const marginThresholds = {
    top: 0.08, // 상단 8%
    bottom: 0.08, // 하단 8%
    left: 0.08, // 좌측 8%
    right: 0.08, // 우측 8%
  }

  const result: StructuredContentItem[] = []
  result.push({ type: "text", text: `<page number="${pageNum}">` })

  let textIdx = 0
  let currentTextBlock = ""

  // PDF 오퍼레이터를 순서대로 순회 (PDF 스트림 순서 = 렌더링 순서)
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i]
    const args = ops.argsArray[i]

    // 텍스트 오퍼레이터 (Tj, TJ, ', " 등)
    if (
      fn === pdfjsLib.OPS.showText ||
      fn === pdfjsLib.OPS.showSpacedText ||
      fn === pdfjsLib.OPS.nextLineShowText ||
      fn === pdfjsLib.OPS.nextLineSetSpacingShowText
    ) {
      if (textIdx < textContent.items.length) {
        const item = textContent.items[textIdx]

        // 마진 필터링
        if (excludeMargins && item.transform) {
          const x = item.transform[4]
          const y = item.transform[5]

          if (isInMargin(x, y, viewport, marginThresholds)) {
            textIdx++
            continue // 마진 영역 텍스트는 스킵
          }
        }

        if (item.str && item.str.trim()) {
          currentTextBlock += item.str + " "
        }
        textIdx++
      }
    }

    // 이미지 오퍼레이터 (Do)
    else if (
      fn === pdfjsLib.OPS.paintImageXObject ||
      fn === pdfjsLib.OPS.paintJpegXObject ||
      fn === pdfjsLib.OPS.paintInlineImageXObject ||
      fn === pdfjsLib.OPS.paintImageMaskXObject
    ) {
      // 이미지 앞에 모인 텍스트를 먼저 추가
      if (currentTextBlock.trim()) {
        result.push({
          type: "text",
          text: currentTextBlock.trim() + "\n",
        })
        currentTextBlock = ""
      }

      // 이미지 추출
      const imgName = args[0]
      try {
        let imgData = null

        // page.objs에서 시도
        try {
          imgData = await page.objs.get(imgName)
        } catch {
          // commonObjs에서 시도 (글로벌 이미지)
          if (imgName && typeof imgName === "string" && imgName.startsWith("g_")) {
            imgData = await page.commonObjs.get(imgName)
          }
        }

        if (imgData && imgData.data && imgData.width && imgData.height) {
          // Use Sharp for reliable image conversion
          const { default: sharp } = await import("sharp")

          // Determine channels based on imgData.kind
          // 1 = GRAYSCALE_1BPP, 2 = RGB_24BPP, 3 = RGBA_32BPP
          const channels = imgData.kind === 1 ? 1 : imgData.kind === 2 ? 3 : 4

          const buffer = await sharp(Buffer.from(imgData.data), {
            raw: {
              width: imgData.width,
              height: imgData.height,
              channels: channels,
            },
          })
            .png()
            .toBuffer()

          result.push({
            id: Identifier.ascending("part"),
            sessionID: ctx.sessionID,
            messageID: ctx.messageID,
            type: "file",
            mime: "image/png",
            url: `data:image/png;base64,${buffer.toString("base64")}`,
            filename: `page${pageNum}-${imgName}.png`,
          })
        }
      } catch (err) {
        // 이미지 추출 실패는 무시 (일부 이미지는 추출 불가능할 수 있음)
        console.warn(`Failed to extract image ${imgName}:`, err)
      }
    }
  }

  // 남은 텍스트 추가
  if (currentTextBlock.trim()) {
    result.push({
      type: "text",
      text: currentTextBlock.trim() + "\n",
    })
  }

  result.push({ type: "text", text: `</page>` })

  return result
}

/**
 * Process a PDF file and extract text/images in order
 *
 * Strategy:
 * 1. Check each page for text layer (OCR detection)
 * 2. If no text: render entire page as image
 * 3. If has text: extract mixed content (text + images) in stream order
 * 4. Apply margin filtering to remove headers/footers/side margins
 */
export async function processPdfFile(
  filepath: string,
  ctx: Tool.Context,
  excludeMargins: boolean = true,
  pages?: number[], // Optional: specific pages to process. If undefined, processes all pages.
): Promise<StructuredContentItem[]> {
  const pdfjsLib = await getPdfWorker()
  const data = new Uint8Array(await Bun.file(filepath).arrayBuffer())
  const pdf = await pdfjsLib.getDocument({ data }).promise

  const structuredContent: StructuredContentItem[] = []

  // Determine which pages to process
  const targetPages = pages ?? Array.from({ length: pdf.numPages }, (_, i) => i + 1)

  // Process each page
  for (const pageNum of targetPages) {
    const page = await pdf.getPage(pageNum)
    const hasText = await pageHasText(page)

    if (!hasText) {
      // No text layer - render entire page as image
      // For page rendering, we still need canvas since Sharp can't render PDF pages
      const { createCanvas } = await import("@napi-rs/canvas")
      const viewport = page.getViewport({ scale: 1.5 })
      const canvas = createCanvas(viewport.width, viewport.height)
      const context = canvas.getContext("2d")

      await page.render({
        canvasContext: context as any,
        viewport: viewport,
      }).promise

      const imageBuffer = canvas.toBuffer("image/png")

      structuredContent.push(
        { type: "text", text: `<page number="${pageNum}">` },
        {
          id: Identifier.ascending("part"),
          sessionID: ctx.sessionID,
          messageID: ctx.messageID,
          type: "file",
          mime: "image/png",
          url: `data:image/png;base64,${imageBuffer.toString("base64")}`,
          filename: `page${pageNum}.png`,
        },
        { type: "text", text: `</page>` },
      )
    } else {
      // Has text - extract mixed content (text + images) in order
      const mixedContent = await extractMixedContent(page, pageNum, ctx, excludeMargins)
      structuredContent.push(...mixedContent)
    }
  }

  return structuredContent
}
