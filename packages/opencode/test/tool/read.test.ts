import { test, expect } from "bun:test"
import { ReadTool } from "../../src/tool/read"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { Identifier } from "../../src/id/id"

test("read text file - returns output with line numbers", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(`${dir}/test.txt`, "line 1\nline 2\nline 3")
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const tool = await ReadTool.init()
      const result = await tool.execute(
        { filePath: `${tmp.path}/test.txt` },
        {
          sessionID: Identifier.ascending("session"),
          messageID: Identifier.ascending("message"),
          agent: "test",
          abort: new AbortController().signal,
          metadata: async () => {},
        },
      )

      expect(result.output).toContain("00001| line 1")
      expect(result.output).toContain("00002| line 2")
      expect(result.output).toContain("00003| line 3")
      expect(result.output).toContain("<file>")
      expect(result.output).toContain("</file>")
    },
  })
})

test("read text file with offset and limit", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(`${dir}/test.txt`, "line 1\nline 2\nline 3\nline 4\nline 5")
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const tool = await ReadTool.init()
      const result = await tool.execute(
        {
          filePath: `${tmp.path}/test.txt`,
          offset: 1,
          limit: 2,
        },
        {
          sessionID: Identifier.ascending("session"),
          messageID: Identifier.ascending("message"),
          agent: "test",
          abort: new AbortController().signal,
          metadata: async () => {},
        },
      )

      expect(result.output).toContain("00002| line 2")
      expect(result.output).toContain("00003| line 3")
      expect(result.output).not.toContain("line 1")
      expect(result.output).not.toContain("line 4")
    },
  })
})

test("read image file - returns structuredContent (new behavior)", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      // Create a minimal PNG (1x1 transparent pixel)
      const pngBytes = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64",
      )
      await Bun.write(`${dir}/test.png`, pngBytes)
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const tool = await ReadTool.init()
      const result = await tool.execute(
        { filePath: `${tmp.path}/test.png` },
        {
          sessionID: Identifier.ascending("session"),
          messageID: Identifier.ascending("message"),
          agent: "test",
          abort: new AbortController().signal,
          extra: {
            providerID: "anthropic",
            modelID: "claude-3-5-sonnet-20241022",
          },
          metadata: async () => {},
        },
      )

      // New behavior: returns structuredContent
      expect(result.structuredContent).toBeDefined()
      expect(result.structuredContent?.length).toBe(1)
      expect(result.structuredContent![0].type).toBe("file")
      if (result.structuredContent![0].type === "file") {
        expect(result.structuredContent![0].mime).toBe("image/png")
        expect(result.structuredContent![0].url).toContain("data:image/png;base64,")
      }
      expect(result.output).toBe("")
    },
  })
})

test("read image without model support - throws error", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      const pngBytes = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64",
      )
      await Bun.write(`${dir}/test.png`, pngBytes)
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const tool = await ReadTool.init()

      expect(async () => {
        await tool.execute(
          { filePath: `${tmp.path}/test.png` },
          {
            sessionID: Identifier.ascending("session"),
            messageID: Identifier.ascending("message"),
            agent: "test",
            abort: new AbortController().signal,
            extra: {
              providerID: "test",
              modelID: "text-only-model",
            },
            metadata: async () => {},
          },
        )
      }).toThrow("model may not be able to read images")
    },
  })
})

test("read binary file - throws error", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      // Create a binary file
      await Bun.write(`${dir}/test.bin`, new Uint8Array([0x00, 0x01, 0x02, 0x03]))
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const tool = await ReadTool.init()

      expect(async () => {
        await tool.execute(
          { filePath: `${tmp.path}/test.bin` },
          {
            sessionID: Identifier.ascending("session"),
            messageID: Identifier.ascending("message"),
            agent: "test",
            abort: new AbortController().signal,
            metadata: async () => {},
          },
        )
      }).toThrow("Cannot read binary file")
    },
  })
})

test("read non-existent file - throws error with suggestions", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(`${dir}/actual-file.txt`, "content")
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const tool = await ReadTool.init()

      expect(async () => {
        await tool.execute(
          { filePath: `${tmp.path}/actual-fil.txt` },
          {
            sessionID: Identifier.ascending("session"),
            messageID: Identifier.ascending("message"),
            agent: "test",
            abort: new AbortController().signal,
            metadata: async () => {},
          },
        )
      }).toThrow("File not found")
    },
  })
})

test("read file outside working directory - throws error", async () => {
  await using tmp = await tmpdir({})

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const tool = await ReadTool.init()

      expect(async () => {
        await tool.execute(
          { filePath: "/etc/passwd" },
          {
            sessionID: Identifier.ascending("session"),
            messageID: Identifier.ascending("message"),
            agent: "test",
            abort: new AbortController().signal,
            metadata: async () => {},
          },
        )
      }).toThrow("not in the current working directory")
    },
  })
})

test("read file with very long lines - truncates", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      const longLine = "x".repeat(3000)
      await Bun.write(`${dir}/long.txt`, longLine)
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const tool = await ReadTool.init()
      const result = await tool.execute(
        { filePath: `${tmp.path}/long.txt` },
        {
          sessionID: Identifier.ascending("session"),
          messageID: Identifier.ascending("message"),
          agent: "test",
          abort: new AbortController().signal,
          metadata: async () => {},
        },
      )

      // Lines longer than 2000 chars are truncated with "..."
      expect(result.output).toContain("...")
      expect(result.output.length).toBeLessThan(3000)
    },
  })
})

test("read large file - shows pagination message", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      const lines = Array.from({ length: 3000 }, (_, i) => `line ${i + 1}`).join("\n")
      await Bun.write(`${dir}/large.txt`, lines)
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const tool = await ReadTool.init()
      const result = await tool.execute(
        { filePath: `${tmp.path}/large.txt` },
        {
          sessionID: Identifier.ascending("session"),
          messageID: Identifier.ascending("message"),
          agent: "test",
          abort: new AbortController().signal,
          metadata: async () => {},
        },
      )

      // Default limit is 2000 lines
      expect(result.output).toContain("File has more lines")
      expect(result.output).toContain("Use 'offset' parameter")
    },
  })
})

test("read different image formats", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      const pngBytes = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64",
      )
      await Bun.write(`${dir}/test.jpg`, pngBytes)
      await Bun.write(`${dir}/test.jpeg`, pngBytes)
      await Bun.write(`${dir}/test.gif`, pngBytes)
      await Bun.write(`${dir}/test.webp`, pngBytes)
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const tool = await ReadTool.init()
      const formats = ["jpg", "jpeg", "gif", "webp"]

      for (const format of formats) {
        const result = await tool.execute(
          { filePath: `${tmp.path}/test.${format}` },
          {
            sessionID: Identifier.ascending("session"),
            messageID: Identifier.ascending("message"),
            agent: "test",
            abort: new AbortController().signal,
            extra: {
              providerID: "anthropic",
              modelID: "claude-3-5-sonnet-20241022",
            },
            metadata: async () => {},
          },
        )

        expect(result.structuredContent).toBeDefined()
        expect(result.structuredContent?.length).toBe(1)
        expect(result.structuredContent![0].type).toBe("file")
      }
    },
  })
})
