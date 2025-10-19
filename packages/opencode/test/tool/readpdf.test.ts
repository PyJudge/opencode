import { test, expect } from "bun:test"
import * as path from "path"
import { Instance } from "../../src/project/instance"
import { Identifier } from "../../src/id/id"

// Import will fail until ReadPdfTool is implemented (RED phase)
import { ReadPdfTool } from "../../src/tool/readpdf"

const testPdfPath = path.join(process.cwd(), "test-pdfs", "[1교] 2025 정기세미나 자료집-페이지.pdf")

test("readpdf - read entire PDF (pages not specified = all pages)", async () => {
  await Instance.provide({
    directory: process.cwd(),
    fn: async () => {
      const tool = await ReadPdfTool.init()
      const result = await tool.execute(
        { filePath: testPdfPath },
        {
          sessionID: Identifier.ascending("session"),
          messageID: Identifier.ascending("message"),
          agent: "test",
          abort: new AbortController().signal,
          extra: {
            supportsPdf: true,
          },
          metadata: async () => {},
        },
      )

      expect(result.structuredContent).toBeDefined()
      expect(result.metadata.pageCount).toBeGreaterThan(0)
      expect(result.metadata.requestedPages.length).toBe(result.metadata.pageCount)
    },
  })
}, 30000) // 타임아웃 30초로 증가

test("readpdf - read single page", async () => {
  await Instance.provide({
    directory: process.cwd(),
    fn: async () => {
      const tool = await ReadPdfTool.init()
      const result = await tool.execute(
        { filePath: testPdfPath, pages: 1 },
        {
          sessionID: Identifier.ascending("session"),
          messageID: Identifier.ascending("message"),
          agent: "test",
          abort: new AbortController().signal,
          extra: {
            supportsPdf: true,
          },
          metadata: async () => {},
        },
      )

      expect(result.metadata.requestedPages).toEqual([1])
      expect(result.title).toContain("page 1")
    },
  })
})

test("readpdf - read page range (hyphen)", async () => {
  await Instance.provide({
    directory: process.cwd(),
    fn: async () => {
      const tool = await ReadPdfTool.init()
      const result = await tool.execute(
        { filePath: testPdfPath, pages: "1-2" },
        {
          sessionID: Identifier.ascending("session"),
          messageID: Identifier.ascending("message"),
          agent: "test",
          abort: new AbortController().signal,
          extra: {
            supportsPdf: true,
          },
          metadata: async () => {},
        },
      )

      expect(result.metadata.requestedPages).toEqual([1, 2])
    },
  })
})

test("readpdf - read page list (comma)", async () => {
  await Instance.provide({
    directory: process.cwd(),
    fn: async () => {
      const tool = await ReadPdfTool.init()
      const result = await tool.execute(
        { filePath: testPdfPath, pages: "1,2" },
        {
          sessionID: Identifier.ascending("session"),
          messageID: Identifier.ascending("message"),
          agent: "test",
          abort: new AbortController().signal,
          extra: {
            supportsPdf: true,
          },
          metadata: async () => {},
        },
      )

      expect(result.metadata.requestedPages).toEqual([1, 2])
    },
  })
})

test("readpdf - read mixed pages", async () => {
  await Instance.provide({
    directory: process.cwd(),
    fn: async () => {
      const tool = await ReadPdfTool.init()
      const result = await tool.execute(
        { filePath: testPdfPath, pages: "1-2,1" },
        {
          sessionID: Identifier.ascending("session"),
          messageID: Identifier.ascending("message"),
          agent: "test",
          abort: new AbortController().signal,
          extra: {
            supportsPdf: true,
          },
          metadata: async () => {},
        },
      )

      expect(result.metadata.requestedPages).toEqual([1, 2, 1])
    },
  })
}, 30000) // 타임아웃 30초

test("readpdf - page exceeds total pages error", async () => {
  await Instance.provide({
    directory: process.cwd(),
    fn: async () => {
      const tool = await ReadPdfTool.init()

      expect(async () => {
        await tool.execute(
          { filePath: testPdfPath, pages: "999" },
          {
            sessionID: Identifier.ascending("session"),
            messageID: Identifier.ascending("message"),
            agent: "test",
            abort: new AbortController().signal,
            extra: {
              supportsPdf: true,
            },
            metadata: async () => {},
          },
        )
      }).toThrow("exceeds total pages")
    },
  })
})

test("readpdf - invalid page format error", async () => {
  await Instance.provide({
    directory: process.cwd(),
    fn: async () => {
      const tool = await ReadPdfTool.init()

      expect(async () => {
        await tool.execute(
          { filePath: testPdfPath, pages: "abc" },
          {
            sessionID: Identifier.ascending("session"),
            messageID: Identifier.ascending("message"),
            agent: "test",
            abort: new AbortController().signal,
            extra: {
              supportsPdf: true,
            },
            metadata: async () => {},
          },
        )
      }).toThrow("Invalid page format")
    },
  })
})

test("readpdf - excludeMargins option", async () => {
  await Instance.provide({
    directory: process.cwd(),
    fn: async () => {
      const tool = await ReadPdfTool.init()
      const result = await tool.execute(
        { filePath: testPdfPath, excludeMargins: false },
        {
          sessionID: Identifier.ascending("session"),
          messageID: Identifier.ascending("message"),
          agent: "test",
          abort: new AbortController().signal,
          extra: {
            supportsPdf: true,
          },
          metadata: async () => {},
        },
      )

      expect(result.structuredContent).toBeDefined()
    },
  })
}, 30000) // 타임아웃 30초

test("readpdf - image not supported by model error", async () => {
  await Instance.provide({
    directory: process.cwd(),
    fn: async () => {
      const tool = await ReadPdfTool.init()

      expect(async () => {
        await tool.execute(
          { filePath: testPdfPath },
          {
            sessionID: Identifier.ascending("session"),
            messageID: Identifier.ascending("message"),
            agent: "test",
            abort: new AbortController().signal,
            extra: {
              supportsPdf: false, // bypasses image check in readpdf
            },
            metadata: async () => {},
          },
        )
      }).toThrow("only supports Vision llm models")
    },
  })
})

test("readpdf - output format", async () => {
  await Instance.provide({
    directory: process.cwd(),
    fn: async () => {
      const tool = await ReadPdfTool.init()
      const result = await tool.execute(
        { filePath: testPdfPath },
        {
          sessionID: Identifier.ascending("session"),
          messageID: Identifier.ascending("message"),
          agent: "test",
          abort: new AbortController().signal,
          extra: {
            supportsPdf: true,
          },
          metadata: async () => {},
        },
      )

      // Output should contain page count info
      expect(result.output).toContain("📄 PDF:")
      expect(result.output).toContain("pages total")
      expect(result.structuredContent).toBeDefined()
      expect(result.metadata.preview).toBeDefined()
    },
  })
})

test("readpdf - max 10 pages limit", async () => {
  await Instance.provide({
    directory: process.cwd(),
    fn: async () => {
      const tool = await ReadPdfTool.init()

      // Attempt to read 11 pages (using duplicate pages if needed)
      expect(async () => {
        await tool.execute(
          { filePath: testPdfPath, pages: "1,1,1,1,1,1,1,1,1,1,1" },
          {
            sessionID: Identifier.ascending("session"),
            messageID: Identifier.ascending("message"),
            agent: "test",
            abort: new AbortController().signal,
            extra: {
              supportsPdf: true,
            },
            metadata: async () => {},
          },
        )
      }).toThrow("Too many pages to read")
    },
  })
})

test("readpdf - range exceeds total pages (clips and warns)", async () => {
  await Instance.provide({
    directory: process.cwd(),
    fn: async () => {
      const tool = await ReadPdfTool.init()

      // Request pages 1-999, but PDF has fewer pages
      // Should clip to available pages and return warning
      const result = await tool.execute(
        { filePath: testPdfPath, pages: "1-999" },
        {
          sessionID: Identifier.ascending("session"),
          messageID: Identifier.ascending("message"),
          agent: "test",
          abort: new AbortController().signal,
          extra: {
            supportsPdf: true,
          },
          metadata: async () => {},
        },
      )

      // Should have warning in output
      expect(result.output).toContain("⚠️")
      expect(result.output).toContain("Requested pages")
      expect(result.output).toContain("but PDF has only")

      // Should read available pages
      expect(result.metadata.requestedPages.length).toBeGreaterThan(0)
      expect(result.metadata.requestedPages.length).toBeLessThanOrEqual(10) // Still subject to 10-page limit
    },
  })
}, 30000)

test("readpdf - all requested pages out of bounds (error)", async () => {
  await Instance.provide({
    directory: process.cwd(),
    fn: async () => {
      const tool = await ReadPdfTool.init()

      // Request pages that don't exist at all
      expect(async () => {
        await tool.execute(
          { filePath: testPdfPath, pages: "9999-10000" },
          {
            sessionID: Identifier.ascending("session"),
            messageID: Identifier.ascending("message"),
            agent: "test",
            abort: new AbortController().signal,
            extra: {
              supportsPdf: true,
            },
            metadata: async () => {},
          },
        )
      }).toThrow("completely out of bounds")
    },
  })
})
