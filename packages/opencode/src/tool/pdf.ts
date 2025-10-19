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
import { calculateOptimalDimensions } from "./image-scaler"

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
 * Identity Matrix for CTM
 * [a, b, c, d, e, f] where a=d=1, b=c=e=f=0
 */
const IDENTITY_MATRIX = [1, 0, 0, 1, 0, 0]

/**
 * Multiply two transformation matrices
 * [a1, b1, c1, d1, e1, f1] × [a2, b2, c2, d2, e2, f2]
 *
 * Matrix multiplication formula:
 * result = [
 *   a1*a2 + b1*c2,
 *   a1*b2 + b1*d2,
 *   c1*a2 + d1*c2,
 *   c1*b2 + d1*d2,
 *   e1*a2 + f1*c2 + e2,
 *   e1*b2 + f1*d2 + f2
 * ]
 */
export function multiplyMatrices(m1: number[], m2: number[]): number[] {
  const [a1, b1, c1, d1, e1, f1] = m1
  const [a2, b2, c2, d2, e2, f2] = m2

  return [
    a1 * a2 + b1 * c2,
    a1 * b2 + b1 * d2,
    c1 * a2 + d1 * c2,
    c1 * b2 + d1 * d2,
    e1 * a2 + f1 * c2 + e2,
    e1 * b2 + f1 * d2 + f2,
  ]
}

/**
 * Get display size from CTM (Current Transformation Matrix)
 *
 * CTM = [a, b, c, d, e, f]
 * Display width = sqrt(a² + b²)  - accounts for rotation/skew
 * Display height = sqrt(c² + d²) - accounts for rotation/skew
 *
 * This handles all transformations including:
 * - Simple scaling: [scaleX, 0, 0, scaleY, 0, 0]
 * - Rotation: non-zero b, c values
 * - Combined transforms: rotation + scale
 */
export function getDisplaySize(ctm: number[]): { width: number; height: number } {
  const [a, b, c, d] = ctm

  // Calculate actual display dimensions
  const width = Math.sqrt(a * a + b * b)
  const height = Math.sqrt(c * c + d * d)

  // Round to integer pixels, minimum 1px
  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  }
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

  // CTM (Current Transformation Matrix) 스택 초기화
  // PDF는 Graphics State Stack을 유지하며, save/restore로 관리
  const ctmStack: number[][] = [[...IDENTITY_MATRIX]]

  // PDF 오퍼레이터를 순서대로 순회 (PDF 스트림 순서 = 렌더링 순서)
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i]
    const args = ops.argsArray[i]

    // Graphics State 저장 (CTM 스택 push)
    if (fn === pdfjsLib.OPS.save) {
      const current = ctmStack[ctmStack.length - 1]
      if (current) {
        ctmStack.push([...current]) // 현재 CTM 복사해서 스택에 추가
      }
      continue
    }

    // Graphics State 복원 (CTM 스택 pop)
    if (fn === pdfjsLib.OPS.restore) {
      if (ctmStack.length > 1) {
        ctmStack.pop() // 마지막 CTM 제거 (최소 1개는 유지)
      }
      continue
    }

    // CTM 변환 적용 (transform matrix 곱셈)
    if (fn === pdfjsLib.OPS.transform) {
      // args = [a, b, c, d, e, f]
      const transformMatrix = args as number[]
      if (transformMatrix.length === 6) {
        const current = ctmStack[ctmStack.length - 1]
        if (current) {
          ctmStack[ctmStack.length - 1] = multiplyMatrices(current, transformMatrix)
        }
      }
      continue
    }

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

          // Get display size from current CTM
          // PDF images are drawn in 1×1 unit space, then transformed by CTM
          const currentCTM = ctmStack[ctmStack.length - 1]
          if (!currentCTM) {
            // Fallback: no CTM available, use original size
            console.warn(`No CTM available for image ${imgName}, using original size`)
            continue
          }

          const displaySize = getDisplaySize(currentCTM)

          // Sanity check: display size should be reasonable
          // Prevent extreme sizes that could cause memory issues
          const MAX_DIMENSION = 10000 // 10,000 pixels max
          if (displaySize.width > MAX_DIMENSION || displaySize.height > MAX_DIMENSION) {
            console.warn(
              `Display size too large for image ${imgName}: ${displaySize.width}×${displaySize.height}, using original size`,
            )
            // Fall back to original size
            displaySize.width = imgData.width
            displaySize.height = imgData.height
          }

          // Apply 2nd-stage token optimization scaling
          // Stage 1 (above): CTM-based display size (PDF author's intent)
          // Stage 2 (here): Token-optimized size (LLM efficiency)
          const optimalSize = calculateOptimalDimensions(displaySize.width, displaySize.height)

          // Sharp pipeline
          let sharpPipeline = sharp(Buffer.from(imgData.data), {
            raw: {
              width: imgData.width,
              height: imgData.height,
              channels: channels,
            },
          })

          // Resize to optimal size
          // Performance: Skip if already at optimal size (wasScaled = false) AND matches original
          const needsResize =
            optimalSize.wasScaled || optimalSize.width !== imgData.width || optimalSize.height !== imgData.height

          if (needsResize) {
            sharpPipeline = sharpPipeline.resize(optimalSize.width, optimalSize.height, {
              fit: "fill", // PDF 의도대로 정확히 맞춤 (비율 왜곡 허용)
              kernel: "lanczos3", // 고품질 리샘플링
            })
          }

          const buffer = await sharpPipeline.png().toBuffer()

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
