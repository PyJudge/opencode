import { test, expect } from "bun:test"
import { ReadTool } from "../../src/tool/read"
import { MessageV2 } from "../../src/session/message-v2"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { Identifier } from "../../src/id/id"

test("Read batch mode - Python content_parts equivalent", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      // Create test images
      const img1 = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64",
      )
      const img2 = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64",
      )
      await Bun.write(`${dir}/page1.png`, img1)
      await Bun.write(`${dir}/page2.png`, img2)
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const tool = await ReadTool.init()

      // Execute batch read (equivalent to Python's content_parts)
      const result = await tool.execute(
        {
          items: [
            { type: "text", text: "Page 1:" },
            { type: "file", path: `${tmp.path}/page1.png` },
            { type: "text", text: "Page 2:" },
            { type: "file", path: `${tmp.path}/page2.png` },
            { type: "text", text: "Done" },
          ],
        },
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

      // Verify structuredContent is returned
      expect(result.structuredContent).toBeDefined()
      expect(result.structuredContent?.length).toBe(5)

      // Verify order and types (퐁당퐁당 pattern)
      expect(result.structuredContent![0]).toMatchObject({
        type: "text",
        text: "Page 1:",
      })

      expect(result.structuredContent![1].type).toBe("file")
      if (result.structuredContent![1].type === "file") {
        expect(result.structuredContent![1].mime).toBe("image/png")
        expect(result.structuredContent![1].url).toContain("data:image/png;base64,")
      }

      expect(result.structuredContent![2]).toMatchObject({
        type: "text",
        text: "Page 2:",
      })

      expect(result.structuredContent![3].type).toBe("file")
      if (result.structuredContent![3].type === "file") {
        expect(result.structuredContent![3].mime).toBe("image/png")
        expect(result.structuredContent![3].url).toContain("data:image/png;base64,")
      }

      expect(result.structuredContent![4]).toMatchObject({
        type: "text",
        text: "Done",
      })
    },
  })
})

test("Read batch mode -> toModelMessage -> AI format (full pipeline)", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      const img = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64",
      )
      await Bun.write(`${dir}/test.png`, img)
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const sessionID = Identifier.ascending("session")
      const assistantMsgID = Identifier.ascending("message")

      // Simulate tool execution
      const tool = await ReadTool.init()
      const toolResult = await tool.execute(
        {
          items: [
            { type: "text", text: "누구" },
            { type: "file", path: `${tmp.path}/test.png` },
            { type: "text", text: "는 어디에 갔다" },
          ],
        },
        {
          sessionID,
          messageID: assistantMsgID,
          agent: "test",
          abort: new AbortController().signal,
          extra: {
            providerID: "anthropic",
            modelID: "claude-3-5-sonnet-20241022",
          },
          metadata: async () => {},
        },
      )

      // Create assistant message with tool result
      const messages: MessageV2.WithParts[] = [
        {
          info: {
            id: assistantMsgID,
            sessionID,
            role: "assistant",
            mode: "build",
            modelID: "claude-3-5-sonnet-20241022",
            providerID: "anthropic",
            system: [],
            path: { cwd: tmp.path, root: tmp.path },
            cost: 0,
            tokens: {
              input: 0,
              output: 0,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
            time: { created: Date.now() },
          },
          parts: [
            {
              id: Identifier.ascending("part"),
              sessionID,
              messageID: assistantMsgID,
              type: "tool",
              tool: "read",
              callID: "call_123",
              state: {
                status: "completed",
                input: { items: [{}, {}, {}] },
                output: toolResult.output,
                title: toolResult.title,
                metadata: toolResult.metadata,
                time: { start: Date.now(), end: Date.now() },
                structuredContent: toolResult.structuredContent,
              },
            },
          ],
        },
      ]

      // Convert to ModelMessage format
      const modelMessages = MessageV2.toModelMessage(messages)

      // Verify structure
      const userMsg = modelMessages.find((m) => m.role === "user")
      expect(userMsg).toBeDefined()

      if (typeof userMsg!.content === "string") {
        throw new Error("Expected content to be array")
      }

      // Verify 퐁당퐁당 pattern preserved
      expect(userMsg!.content.length).toBe(3)
      expect(userMsg!.content[0].type).toBe("text")
      expect((userMsg!.content[0] as any).text).toBe("누구")

      expect(userMsg!.content[1].type).toBe("file")
      expect((userMsg!.content[1] as any).mediaType).toBe("image/png")

      expect(userMsg!.content[2].type).toBe("text")
      expect((userMsg!.content[2] as any).text).toBe("는 어디에 갔다")
    },
  })
})

test("Read single image - backward compatibility check", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      const img = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64",
      )
      await Bun.write(`${dir}/single.png`, img)
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const tool = await ReadTool.init()
      const result = await tool.execute(
        { filePath: `${tmp.path}/single.png` },
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

      // Single image should use structuredContent
      expect(result.structuredContent).toBeDefined()
      expect(result.structuredContent?.length).toBe(1)
      expect(result.structuredContent![0].type).toBe("file")
    },
  })
})
