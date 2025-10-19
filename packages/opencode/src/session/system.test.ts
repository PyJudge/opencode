import { describe, it, expect } from "bun:test"
import { SystemPrompt } from "./system"
import type { Config } from "../config/config"

describe("SystemPrompt.header()", () => {
  describe("with custom systemPrompt", () => {
    it("should return custom header when systemPrompt is a string", async () => {
      const config: Config.Info = {
        systemPrompt: "당신은 20년차 전문 개발자입니다.",
      }

      const result = await SystemPrompt.header("anthropic", config)

      expect(result).toEqual(["당신은 20년차 전문 개발자입니다."])
    })

    it("should return empty array when systemPrompt is false", async () => {
      const config: Config.Info = {
        systemPrompt: false,
      }

      const result = await SystemPrompt.header("anthropic", config)

      expect(result).toEqual([])
    })

    it("should apply custom header to all providers", async () => {
      const config: Config.Info = {
        systemPrompt: "공통 헤더",
      }

      const anthropic = await SystemPrompt.header("anthropic", config)
      const openai = await SystemPrompt.header("openai", config)
      const google = await SystemPrompt.header("google", config)

      expect(anthropic).toEqual(["공통 헤더"])
      expect(openai).toEqual(["공통 헤더"])
      expect(google).toEqual(["공통 헤더"])
    })

    it("should disable headers for all providers when false", async () => {
      const config: Config.Info = {
        systemPrompt: false,
      }

      const anthropic = await SystemPrompt.header("anthropic", config)
      const openai = await SystemPrompt.header("openai", config)

      expect(anthropic).toEqual([])
      expect(openai).toEqual([])
    })
  })

  describe("without custom systemPrompt (default behavior)", () => {
    it("should return default PROMPT_ANTHROPIC_SPOOF for anthropic provider", async () => {
      const config: Config.Info = {}

      const result = await SystemPrompt.header("anthropic", config)

      expect(result).toHaveLength(1)
      expect(result[0]).toContain("You are Claude Code") // PROMPT_ANTHROPIC_SPOOF 내용 일부
    })

    it("should return empty array for non-anthropic providers", async () => {
      const config: Config.Info = {}

      const openai = await SystemPrompt.header("openai", config)
      const google = await SystemPrompt.header("google", config)

      expect(openai).toEqual([])
      expect(google).toEqual([])
    })
  })
})

describe("SystemPrompt.summarize()", () => {
  it("should include custom header when systemPrompt is set", async () => {
    const config: Config.Info = {
      systemPrompt: "커스텀 헤더",
    }

    const result = await SystemPrompt.summarize("anthropic", config)

    expect(result[0]).toBe("커스텀 헤더")
    expect(result).toHaveLength(2) // header + PROMPT_SUMMARIZE
  })

  it("should not include header when systemPrompt is false", async () => {
    const config: Config.Info = {
      systemPrompt: false,
    }

    const result = await SystemPrompt.summarize("anthropic", config)

    expect(result).toHaveLength(1) // PROMPT_SUMMARIZE만
  })
})

describe("SystemPrompt.title()", () => {
  it("should include custom header when systemPrompt is set", async () => {
    const config: Config.Info = {
      systemPrompt: "커스텀 헤더",
    }

    const result = await SystemPrompt.title("anthropic", config)

    expect(result[0]).toBe("커스텀 헤더")
    expect(result).toHaveLength(2) // header + PROMPT_TITLE
  })

  it("should not include header when systemPrompt is false", async () => {
    const config: Config.Info = {
      systemPrompt: false,
    }

    const result = await SystemPrompt.title("anthropic", config)

    expect(result).toHaveLength(1) // PROMPT_TITLE만
  })
})
