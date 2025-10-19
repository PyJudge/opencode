#!/usr/bin/env bun

/**
 * Test script to analyze "기록.pdf" image processing
 *
 * This script:
 * 1. Loads the PDF using pdf.js
 * 2. Checks each page for text content (OCR detection)
 * 3. Counts embedded images per page
 * 4. Reports which pages will be processed as images
 */

import { readFileSync } from "fs"
import { resolve } from "path"

const pdfPath = resolve(__dirname, "기록.pdf")

async function analyzePdf() {
  // Import PDF.js
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs")
  const workerUrl = import.meta.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs")
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl.replace("file://", "")
  // @ts-expect-error - verbosity exists but not in types
  pdfjsLib.GlobalWorkerOptions.verbosity = pdfjsLib.VerbosityLevel.ERRORS

  // Load PDF
  const data = new Uint8Array(readFileSync(pdfPath))
  const pdf = await pdfjsLib.getDocument({ data }).promise

  console.log(`📄 PDF Analysis: 기록.pdf`)
  console.log(`   Total pages: ${pdf.numPages}`)
  console.log(`   File size: ${(data.length / 1024).toFixed(2)} KB\n`)

  let totalImagesFromNoText = 0
  let totalEmbeddedImages = 0
  const pageDetails: Array<{
    pageNum: number
    hasText: boolean
    textLength: number
    embeddedImages: number
  }> = []

  // Analyze each page
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)

    // Check for text
    const textContent = await page.getTextContent()
    const text = textContent.items
      .map((item: any) => ("str" in item ? item.str : ""))
      .join("")
      .trim()
    const hasText = text.length > 10

    // Count embedded images
    const ops = await page.getOperatorList()
    let imageCount = 0

    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i]
      if (
        fn === pdfjsLib.OPS.paintImageXObject ||
        fn === pdfjsLib.OPS.paintInlineImageXObject ||
        fn === pdfjsLib.OPS.paintImageMaskXObject
      ) {
        imageCount++
      }
    }

    // Track statistics
    if (!hasText) {
      totalImagesFromNoText++
    }
    totalEmbeddedImages += imageCount

    pageDetails.push({
      pageNum,
      hasText,
      textLength: text.length,
      embeddedImages: imageCount,
    })
  }

  // Print page-by-page analysis
  console.log("📊 Page Analysis:")
  console.log("─".repeat(70))
  console.log("Page │ Has Text │ Text Length │ Embedded Images │ Processing")
  console.log("─".repeat(70))

  for (const detail of pageDetails) {
    const hasTextIcon = detail.hasText ? "✓" : "✗"
    const processing = detail.hasText
      ? `Mixed (text + ${detail.embeddedImages} imgs)`
      : "Full page image (DEBUG: disabled)"

    console.log(
      `${String(detail.pageNum).padStart(4)} │    ${hasTextIcon}     │ ${String(detail.textLength).padStart(11)} │ ${String(detail.embeddedImages).padStart(15)} │ ${processing}`,
    )
  }

  console.log("─".repeat(70))
  console.log(`\n📈 Summary:`)
  console.log(`   Pages with no text (→ full page image): ${totalImagesFromNoText}`)
  console.log(`   Total embedded images in text pages: ${totalEmbeddedImages}`)
  console.log(`   Total images that will be extracted: ${totalImagesFromNoText} (full pages) + ${totalEmbeddedImages} (embedded)`)
  console.log(`\n⚠️  Note: Current code has full-page rendering DISABLED for debugging (pdf.ts:396)`)
  console.log(`   So only embedded images (${totalEmbeddedImages}) will be extracted.`)
}

analyzePdf().catch(console.error)
