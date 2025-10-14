import { test, expect } from "bun:test"
import { MessageV2 } from "../../src/session/message-v2"
import { Identifier } from "../../src/id/id"

test("toModelMessage - basic user message with text", () => {
  const sessionID = Identifier.ascending("session")
  const messageID = Identifier.ascending("message")

  const messages: MessageV2.WithParts[] = [
    {
      info: {
        id: messageID,
        sessionID,
        role: "user",
        time: { created: Date.now() },
      },
      parts: [
        {
          id: Identifier.ascending("part"),
          sessionID,
          messageID,
          type: "text",
          text: "Hello world",
        },
      ],
    },
  ]

  const modelMessages = MessageV2.toModelMessage(messages)

  expect(modelMessages.length).toBe(1)
  expect(modelMessages[0].role).toBe("user")

  if (typeof modelMessages[0].content === "string") {
    throw new Error("Expected content to be array, got string")
  }

  expect(Array.isArray(modelMessages[0].content)).toBe(true)
  expect(modelMessages[0].content[0].type).toBe("text")
  expect((modelMessages[0].content[0] as any).text).toBe("Hello world")
})

test("toModelMessage - assistant message with tool result and attachments", () => {
  const sessionID = Identifier.ascending("session")
  const messageID = Identifier.ascending("message")

  const messages: MessageV2.WithParts[] = [
    {
      info: {
        id: messageID,
        sessionID,
        role: "assistant",
        mode: "build",
        modelID: "claude-3-5-sonnet-20241022",
        providerID: "anthropic",
        system: [],
        path: { cwd: "/test", root: "/test" },
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
          messageID,
          type: "tool",
          tool: "read",
          callID: "call_123",
          state: {
            status: "completed",
            input: { filePath: "test.png" },
            output: "Image read successfully",
            title: "test.png",
            metadata: {},
            time: { start: Date.now(), end: Date.now() },
            attachments: [
              {
                id: Identifier.ascending("part"),
                sessionID,
                messageID,
                type: "file",
                mime: "image/png",
                url: "data:image/png;base64,iVBORw0KGg==",
                filename: "test.png",
              },
            ],
          },
        },
      ],
    },
  ]

  const modelMessages = MessageV2.toModelMessage(messages)

  // convertToModelMessages creates: user (attachment) -> assistant (tool-call) -> tool (result)
  expect(modelMessages.length).toBe(3)

  // First: user message with attachment
  expect(modelMessages[0].role).toBe("user")

  if (typeof modelMessages[0].content === "string" || typeof modelMessages[1].content === "string" || typeof modelMessages[2].content === "string") {
    throw new Error("Expected content to be array")
  }

  expect(Array.isArray(modelMessages[0].content)).toBe(true)
  expect(modelMessages[0].content[0].type).toBe("text")
  expect((modelMessages[0].content[0] as any).text).toContain("Tool read returned an attachment")
  expect(modelMessages[0].content[1].type).toBe("file")
  expect((modelMessages[0].content[1] as any).mediaType).toBe("image/png")
  expect((modelMessages[0].content[1] as any).data).toBe("data:image/png;base64,iVBORw0KGg==")

  // Second: assistant with tool-call
  expect(modelMessages[1].role).toBe("assistant")
  expect(modelMessages[1].content[0].type).toBe("tool-call")
  expect((modelMessages[1].content[0] as any).toolName).toBe("read")

  // Third: tool result
  expect(modelMessages[2].role).toBe("tool")
  expect(modelMessages[2].content[0].type).toBe("tool-result")
  expect((modelMessages[2].content[0] as any).toolCallId).toBe("call_123")
})

test("toModelMessage - filters out text/plain file parts", () => {
  const sessionID = Identifier.ascending("session")
  const messageID = Identifier.ascending("message")

  const messages: MessageV2.WithParts[] = [
    {
      info: {
        id: messageID,
        sessionID,
        role: "user",
        time: { created: Date.now() },
      },
      parts: [
        {
          id: Identifier.ascending("part"),
          sessionID,
          messageID,
          type: "text",
          text: "Before",
        },
        {
          id: Identifier.ascending("part"),
          sessionID,
          messageID,
          type: "file",
          mime: "text/plain",
          url: "data:text/plain;base64,SGVsbG8=",
          filename: "text.txt",
        },
        {
          id: Identifier.ascending("part"),
          sessionID,
          messageID,
          type: "text",
          text: "After",
        },
      ],
    },
  ]

  const modelMessages = MessageV2.toModelMessage(messages)

  expect(modelMessages.length).toBe(1)

  if (typeof modelMessages[0].content === "string") {
    throw new Error("Expected content to be array")
  }

  expect(modelMessages[0].content.length).toBe(2)
  expect((modelMessages[0].content[0] as any).text).toBe("Before")
  expect((modelMessages[0].content[1] as any).text).toBe("After")
})

test("toModelMessage - filters out directory file parts", () => {
  const sessionID = Identifier.ascending("session")
  const messageID = Identifier.ascending("message")

  const messages: MessageV2.WithParts[] = [
    {
      info: {
        id: messageID,
        sessionID,
        role: "user",
        time: { created: Date.now() },
      },
      parts: [
        {
          id: Identifier.ascending("part"),
          sessionID,
          messageID,
          type: "text",
          text: "Check this",
        },
        {
          id: Identifier.ascending("part"),
          sessionID,
          messageID,
          type: "file",
          mime: "application/x-directory",
          url: "file:///test/dir",
          filename: "dir",
        },
        {
          id: Identifier.ascending("part"),
          sessionID,
          messageID,
          type: "text",
          text: "Done",
        },
      ],
    },
  ]

  const modelMessages = MessageV2.toModelMessage(messages)

  expect(modelMessages.length).toBe(1)

  if (typeof modelMessages[0].content === "string") {
    throw new Error("Expected content to be array")
  }

  expect(modelMessages[0].content.length).toBe(2)
  expect((modelMessages[0].content[0] as any).text).toBe("Check this")
  expect((modelMessages[0].content[1] as any).text).toBe("Done")
})

test("toModelMessage - multiple messages", () => {
  const sessionID = Identifier.ascending("session")
  const message1ID = Identifier.ascending("message")
  const message2ID = Identifier.ascending("message")

  const messages: MessageV2.WithParts[] = [
    {
      info: {
        id: message1ID,
        sessionID,
        role: "user",
        time: { created: Date.now() },
      },
      parts: [
        {
          id: Identifier.ascending("part"),
          sessionID,
          messageID: message1ID,
          type: "text",
          text: "First message",
        },
      ],
    },
    {
      info: {
        id: message2ID,
        sessionID,
        role: "user",
        time: { created: Date.now() },
      },
      parts: [
        {
          id: Identifier.ascending("part"),
          sessionID,
          messageID: message2ID,
          type: "text",
          text: "Second message",
        },
      ],
    },
  ]

  const modelMessages = MessageV2.toModelMessage(messages)

  expect(modelMessages.length).toBe(2)

  if (typeof modelMessages[0].content === "string" || typeof modelMessages[1].content === "string") {
    throw new Error("Expected content to be array")
  }

  expect((modelMessages[0].content[0] as any).text).toBe("First message")
  expect((modelMessages[1].content[0] as any).text).toBe("Second message")
})

test("toModelMessage - skips messages with no parts", () => {
  const sessionID = Identifier.ascending("session")
  const message1ID = Identifier.ascending("message")
  const message2ID = Identifier.ascending("message")

  const messages: MessageV2.WithParts[] = [
    {
      info: {
        id: message1ID,
        sessionID,
        role: "user",
        time: { created: Date.now() },
      },
      parts: [],
    },
    {
      info: {
        id: message2ID,
        sessionID,
        role: "user",
        time: { created: Date.now() },
      },
      parts: [
        {
          id: Identifier.ascending("part"),
          sessionID,
          messageID: message2ID,
          type: "text",
          text: "Has content",
        },
      ],
    },
  ]

  const modelMessages = MessageV2.toModelMessage(messages)

  expect(modelMessages.length).toBe(1)

  if (typeof modelMessages[0].content === "string") {
    throw new Error("Expected content to be array")
  }

  expect((modelMessages[0].content[0] as any).text).toBe("Has content")
})

test("toModelMessage - assistant reasoning part", () => {
  const sessionID = Identifier.ascending("session")
  const messageID = Identifier.ascending("message")

  const messages: MessageV2.WithParts[] = [
    {
      info: {
        id: messageID,
        sessionID,
        role: "assistant",
        mode: "build",
        modelID: "o3-mini",
        providerID: "openai",
        system: [],
        path: { cwd: "/test", root: "/test" },
        cost: 0,
        tokens: {
          input: 0,
          output: 0,
          reasoning: 100,
          cache: { read: 0, write: 0 },
        },
        time: { created: Date.now() },
      },
      parts: [
        {
          id: Identifier.ascending("part"),
          sessionID,
          messageID,
          type: "reasoning",
          text: "Let me think about this...",
          time: { start: Date.now(), end: Date.now() },
        },
        {
          id: Identifier.ascending("part"),
          sessionID,
          messageID,
          type: "text",
          text: "The answer is 42",
        },
      ],
    },
  ]

  const modelMessages = MessageV2.toModelMessage(messages)

  expect(modelMessages.length).toBe(1)
  expect(modelMessages[0].role).toBe("assistant")

  if (typeof modelMessages[0].content === "string") {
    throw new Error("Expected content to be array")
  }

  expect(modelMessages[0].content.length).toBe(2)
  expect(modelMessages[0].content[0].type).toBe("reasoning")
  expect((modelMessages[0].content[0] as any).text).toBe("Let me think about this...")
  expect(modelMessages[0].content[1].type).toBe("text")
  expect((modelMessages[0].content[1] as any).text).toBe("The answer is 42")
})

test("toModelMessage - tool error state", () => {
  const sessionID = Identifier.ascending("session")
  const messageID = Identifier.ascending("message")

  const messages: MessageV2.WithParts[] = [
    {
      info: {
        id: messageID,
        sessionID,
        role: "assistant",
        mode: "build",
        modelID: "claude-3-5-sonnet-20241022",
        providerID: "anthropic",
        system: [],
        path: { cwd: "/test", root: "/test" },
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
          messageID,
          type: "tool",
          tool: "bash",
          callID: "call_123",
          state: {
            status: "error",
            input: { command: "rm -rf /" },
            error: "Permission denied",
            time: { start: Date.now(), end: Date.now() },
          },
        },
      ],
    },
  ]

  const modelMessages = MessageV2.toModelMessage(messages)

  // convertToModelMessages creates: assistant (tool-call) -> tool (result with error)
  expect(modelMessages.length).toBe(2)

  // First: assistant with tool-call
  expect(modelMessages[0].role).toBe("assistant")

  if (typeof modelMessages[0].content === "string" || typeof modelMessages[1].content === "string") {
    throw new Error("Expected content to be array")
  }

  expect(modelMessages[0].content[0].type).toBe("tool-call")
  expect((modelMessages[0].content[0] as any).toolName).toBe("bash")

  // Second: tool result with error
  expect(modelMessages[1].role).toBe("tool")
  expect(modelMessages[1].content[0].type).toBe("tool-result")
  expect((modelMessages[1].content[0] as any).output.type).toBe("error-text")
  expect((modelMessages[1].content[0] as any).output.value).toBe("Permission denied")
})
