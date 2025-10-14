import { test, expect } from "bun:test"
import { MessageV2 } from "../../src/session/message-v2"
import { Identifier } from "../../src/id/id"

test("MessageV2.toModelMessage preserves parts array order", () => {
  const sessionID = Identifier.ascending("session")
  const messageID = Identifier.ascending("message")

  // Create parts: text -> file -> text (퐁당퐁당 pattern)
  const parts: MessageV2.Part[] = [
    {
      id: Identifier.ascending("part"),
      sessionID,
      messageID,
      type: "text",
      text: "누구",
    },
    {
      id: Identifier.ascending("part"),
      sessionID,
      messageID,
      type: "file",
      mime: "image/png",
      url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      filename: "person.png",
    },
    {
      id: Identifier.ascending("part"),
      sessionID,
      messageID,
      type: "text",
      text: "는 어디",
    },
    {
      id: Identifier.ascending("part"),
      sessionID,
      messageID,
      type: "file",
      mime: "image/jpeg",
      url: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlbaWmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==",
      filename: "place.jpg",
    },
    {
      id: Identifier.ascending("part"),
      sessionID,
      messageID,
      type: "text",
      text: "에 갔다",
    },
  ]

  const messages: MessageV2.WithParts[] = [
    {
      info: {
        id: messageID,
        sessionID,
        role: "user",
        time: {
          created: Date.now(),
        },
      },
      parts,
    },
  ]

  const modelMessages = MessageV2.toModelMessage(messages)

  // Should have one user message
  expect(modelMessages.length).toBe(1)
  const userMessage = modelMessages[0]
  expect(userMessage.role).toBe("user")

  // ModelMessage.content can be string or array
  // Check if content is array of parts
  if (Array.isArray(userMessage.content)) {
    expect(userMessage.content.length).toBe(5)

    // Verify order preservation: text -> file -> text -> file -> text
    expect(userMessage.content[0].type).toBe("text")
    expect((userMessage.content[0] as any).text).toBe("누구")

    expect(userMessage.content[1].type).toBe("file")
    expect((userMessage.content[1] as any).mediaType).toBe("image/png")
    expect((userMessage.content[1] as any).data).toContain("data:image/png;base64")

    expect(userMessage.content[2].type).toBe("text")
    expect((userMessage.content[2] as any).text).toBe("는 어디")

    expect(userMessage.content[3].type).toBe("file")
    expect((userMessage.content[3] as any).mediaType).toBe("image/jpeg")
    expect((userMessage.content[3] as any).data).toContain("data:image/jpeg;base64")

    expect(userMessage.content[4].type).toBe("text")
    expect((userMessage.content[4] as any).text).toBe("에 갔다")
  } else {
    throw new Error("Expected content to be an array of parts, but got: " + typeof userMessage.content)
  }
})

test("MessageV2.toModelMessage preserves complex interleaved parts", () => {
  const sessionID = Identifier.ascending("session")
  const messageID = Identifier.ascending("message")

  // More complex pattern: multiple text and files
  const parts: MessageV2.Part[] = [
    {
      id: Identifier.ascending("part"),
      sessionID,
      messageID,
      type: "text",
      text: "Page 1:",
    },
    {
      id: Identifier.ascending("part"),
      sessionID,
      messageID,
      type: "file",
      mime: "image/png",
      url: "data:image/png;base64,iVBORw0KGg=",
      filename: "page1.png",
    },
    {
      id: Identifier.ascending("part"),
      sessionID,
      messageID,
      type: "text",
      text: "Page 2:",
    },
    {
      id: Identifier.ascending("part"),
      sessionID,
      messageID,
      type: "file",
      mime: "image/png",
      url: "data:image/png;base64,iVBORw0KGg=",
      filename: "page2.png",
    },
    {
      id: Identifier.ascending("part"),
      sessionID,
      messageID,
      type: "text",
      text: "Page 3:",
    },
    {
      id: Identifier.ascending("part"),
      sessionID,
      messageID,
      type: "file",
      mime: "image/png",
      url: "data:image/png;base64,iVBORw0KGg=",
      filename: "page3.png",
    },
  ]

  const messages: MessageV2.WithParts[] = [
    {
      info: {
        id: messageID,
        sessionID,
        role: "user",
        time: {
          created: Date.now(),
        },
      },
      parts,
    },
  ]

  const modelMessages = MessageV2.toModelMessage(messages)

  expect(modelMessages.length).toBe(1)

  if (!Array.isArray(modelMessages[0].content)) {
    throw new Error("Expected content to be an array")
  }

  expect(modelMessages[0].content.length).toBe(6)

  // Verify alternating pattern
  for (let i = 0; i < 3; i++) {
    const textIndex = i * 2
    const fileIndex = i * 2 + 1

    expect(modelMessages[0].content[textIndex].type).toBe("text")
    expect((modelMessages[0].content[textIndex] as any).text).toBe(`Page ${i + 1}:`)

    expect(modelMessages[0].content[fileIndex].type).toBe("file")
    expect((modelMessages[0].content[fileIndex] as any).mediaType).toBe("image/png")
  }
})

test("MessageV2.toModelMessage filters out non-image/text parts correctly", () => {
  const sessionID = Identifier.ascending("session")
  const messageID = Identifier.ascending("message")

  const parts: MessageV2.Part[] = [
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
      mime: "text/plain", // Should be filtered out
      url: "data:text/plain;base64,SGVsbG8=",
      filename: "text.txt",
    },
    {
      id: Identifier.ascending("part"),
      sessionID,
      messageID,
      type: "file",
      mime: "image/png", // Should be included
      url: "data:image/png;base64,iVBORw0KGg=",
      filename: "image.png",
    },
    {
      id: Identifier.ascending("part"),
      sessionID,
      messageID,
      type: "text",
      text: "After",
    },
  ]

  const messages: MessageV2.WithParts[] = [
    {
      info: {
        id: messageID,
        sessionID,
        role: "user",
        time: {
          created: Date.now(),
        },
      },
      parts,
    },
  ]

  const modelMessages = MessageV2.toModelMessage(messages)

  if (!Array.isArray(modelMessages[0].content)) {
    throw new Error("Expected content to be an array")
  }

  // text/plain should be filtered, so only 3 parts remain
  expect(modelMessages[0].content.length).toBe(3)
  expect(modelMessages[0].content[0].type).toBe("text")
  expect(modelMessages[0].content[1].type).toBe("file")
  if (modelMessages[0].content[1].type === "file") {
    expect((modelMessages[0].content[1] as any).mediaType).toBe("image/png")
  }
  expect(modelMessages[0].content[2].type).toBe("text")
})
