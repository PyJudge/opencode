import { describe, it, expect } from "bun:test"
// image-scaler.ts에서 export 될 함수들 (아직 구현 안 됨 - RED 상태)
import { calculateOptimalDimensions, shouldScale, type ScalingConfig } from "./image-scaler"

/**
 * Image Scaler 유닛 테스트
 *
 * ImageTokenizer의 스케일링 로직을 기반으로 한 범용 이미지 크기 최적화
 * - 28픽셀 배수로 정규화
 * - 최소/최대 토큰 범위로 제한
 * - 비율 유지 스케일링
 */

describe("Image Scaler - Token Optimization", () => {
  const defaultConfig: ScalingConfig = {
    minTokens: 4,
    maxTokens: 16384,
    pixelsPerToken: 784, // 28×28
  }

  describe("calculateOptimalDimensions", () => {
    it("should normalize to 28-pixel multiples", () => {
      // 100×100 → 98×98 (가장 가까운 28의 배수)
      const result = calculateOptimalDimensions(100, 100, defaultConfig)

      expect(result.width % 28).toBe(0)
      expect(result.height % 28).toBe(0)
      expect(result.wasScaled).toBe(true)
    })

    it("should keep already-normalized dimensions if in range", () => {
      // 56×56 = 3,136 pixels (정확히 4 tokens, 최소 범위)
      const result = calculateOptimalDimensions(56, 56, defaultConfig)

      expect(result.width).toBe(56)
      expect(result.height).toBe(56)
      expect(result.wasScaled).toBe(false)
    })

    it("should scale down large images (> maxTokens)", () => {
      // 8192×8192 = 67,108,864 pixels (16384 tokens 초과)
      const result = calculateOptimalDimensions(8192, 8192, defaultConfig)

      const maxPixels = defaultConfig.maxTokens * defaultConfig.pixelsPerToken
      const resultPixels = result.width * result.height

      expect(resultPixels).toBeLessThanOrEqual(maxPixels)
      expect(result.wasScaled).toBe(true)
      expect(result.scaleFactor).toBeLessThan(1.0) // 축소됨
    })

    it("should scale up tiny images (< minTokens)", () => {
      // 10×10 = 100 pixels (4 tokens 미만)
      const result = calculateOptimalDimensions(10, 10, defaultConfig)

      const minPixels = defaultConfig.minTokens * defaultConfig.pixelsPerToken
      const resultPixels = result.width * result.height

      expect(resultPixels).toBeGreaterThanOrEqual(minPixels)
      expect(result.wasScaled).toBe(true)
      expect(result.scaleFactor).toBeGreaterThan(1.0) // 확대됨
    })

    it("should maintain aspect ratio when scaling", () => {
      // 1000×500 (2:1 ratio)
      const result = calculateOptimalDimensions(1000, 500, defaultConfig)

      const originalRatio = 1000 / 500 // 2.0
      const resultRatio = result.width / result.height

      // 반올림 오차 허용 (±5%)
      expect(Math.abs(resultRatio - originalRatio)).toBeLessThan(originalRatio * 0.05)
    })

    it("should return identity for optimal-sized images", () => {
      // 560×364 = 203,840 pixels (260 tokens, 최소~최대 범위 내)
      const result = calculateOptimalDimensions(560, 364, defaultConfig)

      expect(result.width).toBe(560)
      expect(result.height).toBe(364)
      expect(result.wasScaled).toBe(false)
      expect(result.scaleFactor).toBe(1.0)
    })

    it("should handle extreme aspect ratios", () => {
      // 4000×100 (40:1 ratio)
      const result = calculateOptimalDimensions(4000, 100, defaultConfig)

      expect(result.width % 28).toBe(0)
      expect(result.height % 28).toBe(0)
      expect(result.wasScaled).toBe(true)

      // 비율 대략 유지 확인 (극단적 비율이라 오차 허용 15%)
      const originalRatio = 4000 / 100
      const resultRatio = result.width / result.height
      expect(Math.abs(resultRatio - originalRatio)).toBeLessThan(originalRatio * 0.15)
    })

    it("should use custom config", () => {
      const customConfig: ScalingConfig = {
        minTokens: 10,
        maxTokens: 1000,
        pixelsPerToken: 100,
      }

      // 50×50 = 2,500 pixels (25 tokens, 커스텀 최소 미만)
      const result = calculateOptimalDimensions(50, 50, customConfig)

      const minPixels = customConfig.minTokens * customConfig.pixelsPerToken // 1,000
      const resultPixels = result.width * result.height

      expect(resultPixels).toBeGreaterThanOrEqual(minPixels)
      expect(result.wasScaled).toBe(true)
    })
  })

  describe("shouldScale", () => {
    it("should return true for images needing scale down", () => {
      // 8192×8192 (너무 큼)
      const result = shouldScale(8192, 8192, defaultConfig)

      expect(result).toBe(true)
    })

    it("should return true for images needing scale up", () => {
      // 10×10 (너무 작음)
      const result = shouldScale(10, 10, defaultConfig)

      expect(result).toBe(true)
    })

    it("should return true for non-normalized dimensions", () => {
      // 100×100 (28의 배수 아님)
      const result = shouldScale(100, 100, defaultConfig)

      expect(result).toBe(true)
    })

    it("should return false for optimal-sized images", () => {
      // 560×364 (28의 배수, 범위 내)
      const result = shouldScale(560, 364, defaultConfig)

      expect(result).toBe(false)
    })

    it("should return false for images at boundaries", () => {
      // 최소 크기: 56×56 (4 tokens × 784px = 3,136px)
      const minDim = Math.ceil(Math.sqrt(defaultConfig.minTokens * defaultConfig.pixelsPerToken))
      const normalizedMin = Math.ceil(minDim / 28) * 28

      const result = shouldScale(normalizedMin, normalizedMin, defaultConfig)

      expect(result).toBe(false)
    })
  })

  describe("Real-world PDF scenarios", () => {
    it("should optimize typical PDF image (600×400)", () => {
      // PDF에서 추출한 전형적인 이미지
      const result = calculateOptimalDimensions(600, 400, defaultConfig)

      // 28의 배수로 정규화되어야 함
      expect(result.width % 28).toBe(0)
      expect(result.height % 28).toBe(0)

      // 크기가 크게 변하지 않아야 함 (이미 적절한 크기)
      expect(result.width).toBeGreaterThan(550)
      expect(result.width).toBeLessThan(650)
      expect(result.height).toBeGreaterThan(350)
      expect(result.height).toBeLessThan(450)
    })

    it("should handle high-res screenshot (1920×1080)", () => {
      const result = calculateOptimalDimensions(1920, 1080, defaultConfig)

      // 정규화되고 적절히 축소되어야 함
      expect(result.width % 28).toBe(0)
      expect(result.height % 28).toBe(0)
      expect(result.wasScaled).toBe(true)

      // 16:9 비율 대략 유지
      const resultRatio = result.width / result.height
      expect(Math.abs(resultRatio - (16 / 9))).toBeLessThan(0.2)
    })

    it("should handle tiny icon (32×32)", () => {
      const result = calculateOptimalDimensions(32, 32, defaultConfig)

      // 최소 크기로 upscale되어야 함
      const minPixels = defaultConfig.minTokens * defaultConfig.pixelsPerToken
      const resultPixels = result.width * result.height

      expect(resultPixels).toBeGreaterThanOrEqual(minPixels)
      expect(result.wasScaled).toBe(true)
      expect(result.scaleFactor).toBeGreaterThan(1.0)
    })

    it("should handle print-quality image (3000×2000)", () => {
      const result = calculateOptimalDimensions(3000, 2000, defaultConfig)

      // 적절히 축소되어야 함
      expect(result.width).toBeLessThan(3000)
      expect(result.height).toBeLessThan(2000)
      expect(result.wasScaled).toBe(true)

      // 3:2 비율 유지
      const resultRatio = result.width / result.height
      expect(Math.abs(resultRatio - 1.5)).toBeLessThan(0.1)
    })
  })

  describe("Edge cases", () => {
    it("should handle 1×1 image", () => {
      const result = calculateOptimalDimensions(1, 1, defaultConfig)

      expect(result.width).toBeGreaterThan(1)
      expect(result.height).toBeGreaterThan(1)
      expect(result.wasScaled).toBe(true)
    })

    it("should handle zero dimensions gracefully", () => {
      expect(() => {
        calculateOptimalDimensions(0, 100, defaultConfig)
      }).toThrow()

      expect(() => {
        calculateOptimalDimensions(100, 0, defaultConfig)
      }).toThrow()
    })

    it("should handle negative dimensions gracefully", () => {
      expect(() => {
        calculateOptimalDimensions(-100, 100, defaultConfig)
      }).toThrow()
    })

    it("should handle non-integer dimensions", () => {
      const result = calculateOptimalDimensions(100.7, 50.3, defaultConfig)

      expect(result.width % 28).toBe(0)
      expect(result.height % 28).toBe(0)
      expect(Number.isInteger(result.width)).toBe(true)
      expect(Number.isInteger(result.height)).toBe(true)
    })
  })
})
