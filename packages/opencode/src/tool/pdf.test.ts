import { describe, it, expect } from "bun:test"
// pdf.ts에서 export 될 함수들 (아직 구현 안 됨 - RED 상태)
import { multiplyMatrices, getDisplaySize } from "./pdf"

/**
 * CTM (Current Transformation Matrix) 계산 유닛 테스트
 *
 * PDF 이미지 리사이징을 위한 CTM 추적 로직 검증
 * - 매트릭스 곱셈
 * - Display 크기 계산
 * - CTM 스택 관리
 */

describe("PDF CTM (Current Transformation Matrix) 계산", () => {
  describe("Identity Matrix", () => {
    it("should be [1, 0, 0, 1, 0, 0]", () => {
      const identity = [1, 0, 0, 1, 0, 0]
      expect(identity).toEqual([1, 0, 0, 1, 0, 0])
    })

    it("should not change when multiplied with identity", () => {
      const m = [2, 0, 0, 3, 10, 20]
      const identity = [1, 0, 0, 1, 0, 0]
      const result = multiplyMatrices(m, identity)
      expect(result).toEqual(m)
    })
  })

  describe("매트릭스 곱셈", () => {
    it("should multiply two scaling matrices correctly", () => {
      // Scale 2x in X, 3x in Y
      const m1 = [2, 0, 0, 3, 0, 0]
      // Scale 4x in X, 5x in Y
      const m2 = [4, 0, 0, 5, 0, 0]

      const result = multiplyMatrices(m1, m2)

      // Expected: 2*4=8 in X, 3*5=15 in Y
      expect(result).toEqual([8, 0, 0, 15, 0, 0])
    })

    it("should multiply translation matrices correctly", () => {
      // Translate by (10, 20)
      const m1 = [1, 0, 0, 1, 10, 20]
      // Translate by (5, 7)
      const m2 = [1, 0, 0, 1, 5, 7]

      const result = multiplyMatrices(m1, m2)

      // Expected: translate by (15, 27)
      expect(result).toEqual([1, 0, 0, 1, 15, 27])
    })

    it("should handle rotation matrix", () => {
      // 90도 회전: [0, 1, -1, 0, 0, 0]
      const rotate90 = [0, 1, -1, 0, 0, 0]
      const identity = [1, 0, 0, 1, 0, 0]

      const result = multiplyMatrices(identity, rotate90)

      expect(result).toEqual([0, 1, -1, 0, 0, 0])
    })

    it("should combine scale and translation", () => {
      // Scale 2x
      const scale = [2, 0, 0, 2, 0, 0]
      // Translate (10, 20)
      const translate = [1, 0, 0, 1, 10, 20]

      const result = multiplyMatrices(scale, translate)

      // Expected: scale 2x, translate (10, 20) - translation NOT scaled (applied after scale in CTM order)
      // CTM multiplication: scale × translate = apply translate in scaled space
      expect(result).toEqual([2, 0, 0, 2, 10, 20])
    })
  })

  describe("Display 크기 계산", () => {
    it("should calculate display size from simple scale matrix", () => {
      // Scale 300x in X, 200x in Y
      const ctm = [300, 0, 0, 200, 0, 0]

      const size = getDisplaySize(ctm)

      expect(size.width).toBe(300)
      expect(size.height).toBe(200)
    })

    it("should calculate display size from identity matrix", () => {
      const identity = [1, 0, 0, 1, 0, 0]

      const size = getDisplaySize(identity)

      expect(size.width).toBe(1)
      expect(size.height).toBe(1)
    })

    it("should calculate display size with rotation (90 degrees)", () => {
      // 90도 회전 후 scale 300x200
      // 원본: 1×1 이미지를 300×200으로 스케일링하고 90도 회전
      // 회전 후: width와 height가 뒤바뀜
      const ctm = [0, 200, -300, 0, 0, 0]

      const size = getDisplaySize(ctm)

      // width = sqrt(0² + 200²) = 200
      // height = sqrt(300² + 0²) = 300
      expect(size.width).toBe(200)
      expect(size.height).toBe(300)
    })

    it("should calculate display size with 45 degree rotation", () => {
      // 45도 회전: cos(45°) ≈ 0.707, sin(45°) ≈ 0.707
      // Scale 100x100, then rotate 45°
      const cos45 = Math.cos(Math.PI / 4)
      const sin45 = Math.sin(Math.PI / 4)
      const scale = 100

      const ctm = [
        scale * cos45,
        scale * sin45,
        -scale * sin45,
        scale * cos45,
        0,
        0,
      ]

      const size = getDisplaySize(ctm)

      // width = sqrt((100*cos45)² + (100*sin45)²) = 100
      // height = sqrt((100*sin45)² + (100*cos45)²) = 100
      expect(size.width).toBe(100)
      expect(size.height).toBe(100)
    })

    it("should round display size to integer", () => {
      // Scale 300.7 × 200.3
      const ctm = [300.7, 0, 0, 200.3, 0, 0]

      const size = getDisplaySize(ctm)

      expect(size.width).toBe(301)
      expect(size.height).toBe(200)
    })

    it("should handle non-uniform scaling with rotation", () => {
      // Different X and Y scales with rotation
      const ctm = [100, 50, -75, 150, 0, 0]

      const size = getDisplaySize(ctm)

      // width = sqrt(100² + 50²) = sqrt(12500) ≈ 111.8 → 112
      // height = sqrt(75² + 150²) = sqrt(28125) ≈ 167.7 → 168
      expect(size.width).toBe(112)
      expect(size.height).toBe(168)
    })
  })

  describe("CTM 스택 관리", () => {
    it("should maintain stack with save/restore", () => {
      const stack: number[][] = []
      const identity = [1, 0, 0, 1, 0, 0]

      // Initial state
      stack.push([...identity])
      expect(stack.length).toBe(1)

      // Save
      const current = stack[stack.length - 1]
      stack.push([...current])
      expect(stack.length).toBe(2)

      // Modify top
      stack[stack.length - 1] = [2, 0, 0, 2, 0, 0]
      expect(stack[stack.length - 1]).toEqual([2, 0, 0, 2, 0, 0])
      expect(stack[0]).toEqual(identity) // Original unchanged

      // Restore
      stack.pop()
      expect(stack.length).toBe(1)
      expect(stack[0]).toEqual(identity)
    })

    it("should handle nested save/restore", () => {
      const stack: number[][] = []
      stack.push([1, 0, 0, 1, 0, 0])

      // Save 1
      stack.push([...stack[stack.length - 1]])
      stack[stack.length - 1] = [2, 0, 0, 2, 0, 0]

      // Save 2
      stack.push([...stack[stack.length - 1]])
      stack[stack.length - 1] = [3, 0, 0, 3, 0, 0]

      expect(stack.length).toBe(3)
      expect(stack[stack.length - 1]).toEqual([3, 0, 0, 3, 0, 0])

      // Restore 2
      stack.pop()
      expect(stack.length).toBe(2)
      expect(stack[stack.length - 1]).toEqual([2, 0, 0, 2, 0, 0])

      // Restore 1
      stack.pop()
      expect(stack.length).toBe(1)
      expect(stack[stack.length - 1]).toEqual([1, 0, 0, 1, 0, 0])
    })

    it("should apply transform to current CTM", () => {
      const stack: number[][] = []
      stack.push([1, 0, 0, 1, 0, 0]) // Identity

      // Apply scale 2x
      const transform = [2, 0, 0, 2, 0, 0]
      const current = stack[stack.length - 1]
      stack[stack.length - 1] = multiplyMatrices(current, transform)

      expect(stack[stack.length - 1]).toEqual([2, 0, 0, 2, 0, 0])

      // Apply another scale 3x
      const transform2 = [3, 0, 0, 3, 0, 0]
      const current2 = stack[stack.length - 1]
      stack[stack.length - 1] = multiplyMatrices(current2, transform2)

      // Result: 2 × 3 = 6x scale
      expect(stack[stack.length - 1]).toEqual([6, 0, 0, 6, 0, 0])
    })
  })

  describe("실전 PDF 케이스", () => {
    it("should handle typical PDF image placement", () => {
      // 전형적인 경우: 이미지를 300×200 포인트 크기로 배치
      const stack: number[][] = []
      stack.push([1, 0, 0, 1, 0, 0])

      // PDF는 보통 이미지를 1×1 unit space에 그린 후 CTM으로 변환
      // 300×200 크기로 스케일링
      const imageTransform = [300, 0, 0, 200, 50, 100] // 50, 100에 배치
      const current = stack[stack.length - 1]
      const finalCTM = multiplyMatrices(current, imageTransform)

      const size = getDisplaySize(finalCTM)

      expect(size.width).toBe(300)
      expect(size.height).toBe(200)
    })

    it("should handle image with page rotation", () => {
      // 페이지 전체가 90도 회전된 경우
      const stack: number[][] = []
      stack.push([1, 0, 0, 1, 0, 0])

      // 페이지 회전
      stack.push([...stack[stack.length - 1]])
      const pageRotation = [0, 1, -1, 0, 0, 0] // 90도
      stack[stack.length - 1] = multiplyMatrices(stack[stack.length - 1], pageRotation)

      // 이미지 배치 (200×300)
      const imageTransform = [200, 0, 0, 300, 0, 0]
      const finalCTM = multiplyMatrices(stack[stack.length - 1], imageTransform)

      const size = getDisplaySize(finalCTM)

      // 회전으로 width와 height가 바뀜
      expect(size.width).toBe(300)
      expect(size.height).toBe(200)
    })

    it("should handle image with intentional distortion", () => {
      // 원본 정사각형을 직사각형으로 왜곡 (의도적)
      const stack: number[][] = []
      stack.push([1, 0, 0, 1, 0, 0])

      // 원본 1×1을 500×250으로 (2:1 비율, 가로로 늘림)
      const imageTransform = [500, 0, 0, 250, 0, 0]
      const finalCTM = multiplyMatrices(stack[stack.length - 1], imageTransform)

      const size = getDisplaySize(finalCTM)

      expect(size.width).toBe(500)
      expect(size.height).toBe(250)
      // 비율 왜곡 허용 (PDF 의도대로)
    })
  })
})
