/**
 * Image Scaler - Token-optimized image dimension calculator
 *
 * Extracted from ImageTokenizer scaling logic for reusable, PDF-independent image optimization.
 * Normalizes dimensions to 28-pixel multiples and enforces token limits for LLM efficiency.
 *
 * Based on vision model tokenization rules:
 * - 28×28 pixels = 1 token
 * - Minimum: 4 tokens per image (3,136 pixels)
 * - Maximum: 16,384 tokens per image (12,845,056 pixels)
 */

/**
 * Configuration for image scaling behavior
 */
export interface ScalingConfig {
  /** Minimum tokens per image (default: 4) */
  minTokens: number
  /** Maximum tokens per image (default: 16384) */
  maxTokens: number
  /** Pixels per token (default: 784 = 28×28) */
  pixelsPerToken: number
}

/**
 * Result of dimension calculation with scaling metadata
 */
export interface ScaledDimensions {
  /** Optimized width in pixels */
  width: number
  /** Optimized height in pixels */
  height: number
  /** Whether dimensions were changed from original */
  wasScaled: boolean
  /** Scale factor applied (1.0 = no change, <1.0 = scaled down, >1.0 = scaled up) */
  scaleFactor: number
}

/**
 * Default scaling configuration matching ImageTokenizer behavior
 */
const DEFAULT_CONFIG: ScalingConfig = {
  minTokens: 4,
  maxTokens: 16384,
  pixelsPerToken: 784, // 28×28
}

/**
 * Calculate optimal image dimensions for token efficiency
 *
 * Process:
 * 1. Normalize to 28-pixel multiples (hBar, wBar)
 * 2. Check against min/max pixel boundaries
 * 3. Scale down large images (> maxTokens)
 * 4. Scale up tiny images (< minTokens)
 * 5. Maintain aspect ratio during scaling
 *
 * @param width Original image width in pixels
 * @param height Original image height in pixels
 * @param config Optional scaling configuration (defaults to ImageTokenizer rules)
 * @returns Optimized dimensions with scaling metadata
 *
 * @throws Error if width or height is <= 0
 *
 * @example
 * ```typescript
 * // Large image: scale down
 * const result = calculateOptimalDimensions(3000, 2000)
 * // result.width < 3000, result.wasScaled = true
 *
 * // Tiny image: scale up
 * const result = calculateOptimalDimensions(10, 10)
 * // result.width > 10, result.wasScaled = true
 *
 * // Optimal size: keep as-is
 * const result = calculateOptimalDimensions(560, 364)
 * // result.width = 560, result.wasScaled = false
 * ```
 */
export function calculateOptimalDimensions(
  width: number,
  height: number,
  config: ScalingConfig = DEFAULT_CONFIG,
): ScaledDimensions {
  // Validate inputs
  if (width <= 0 || height <= 0) {
    throw new Error(`Invalid dimensions: ${width}×${height}. Both width and height must be positive.`)
  }

  // Use integers for calculation
  const originalWidth = Math.round(width)
  const originalHeight = Math.round(height)

  // Step 1: Normalize to 28-pixel multiples
  let hBar = Math.round(originalHeight / 28) * 28
  let wBar = Math.round(originalWidth / 28) * 28

  // Ensure minimum 28 pixels (1 token minimum per dimension)
  if (hBar < 28) hBar = 28
  if (wBar < 28) wBar = 28

  // Define pixel boundaries
  const minPixels = config.minTokens * config.pixelsPerToken
  const maxPixels = config.maxTokens * config.pixelsPerToken

  let scaleFactor = 1.0

  // Step 2: Apply scaling if needed
  if (hBar * wBar > maxPixels) {
    // Scale down large images
    const beta = Math.sqrt((originalHeight * originalWidth) / maxPixels)
    hBar = Math.floor(originalHeight / beta / 28) * 28
    wBar = Math.floor(originalWidth / beta / 28) * 28
    scaleFactor = 1.0 / beta
  } else if (hBar * wBar < minPixels) {
    // Scale up small images
    const beta = Math.sqrt(minPixels / (originalHeight * originalWidth))
    hBar = Math.ceil((originalHeight * beta) / 28) * 28
    wBar = Math.ceil((originalWidth * beta) / 28) * 28
    scaleFactor = beta
  }

  // Ensure minimum dimensions after scaling
  if (hBar < 28) hBar = 28
  if (wBar < 28) wBar = 28

  // Determine if scaling occurred
  const wasScaled = hBar !== originalHeight || wBar !== originalWidth

  return {
    width: wBar,
    height: hBar,
    wasScaled,
    scaleFactor,
  }
}

/**
 * Check if an image needs scaling for token optimization
 *
 * An image needs scaling if:
 * - Dimensions are not multiples of 28 (normalization needed)
 * - Total pixels exceed maximum limit (scale down needed)
 * - Total pixels below minimum limit (scale up needed)
 *
 * @param width Original image width in pixels
 * @param height Original image height in pixels
 * @param config Optional scaling configuration
 * @returns True if scaling is needed, false if dimensions are already optimal
 *
 * @example
 * ```typescript
 * shouldScale(100, 100)   // true (not 28-multiple)
 * shouldScale(560, 364)   // false (already optimal)
 * shouldScale(8192, 8192) // true (too large)
 * shouldScale(10, 10)     // true (too small)
 * ```
 */
export function shouldScale(
  width: number,
  height: number,
  config: ScalingConfig = DEFAULT_CONFIG,
): boolean {
  if (width <= 0 || height <= 0) {
    return true // Invalid dimensions always need "scaling" (will error)
  }

  const w = Math.round(width)
  const h = Math.round(height)

  // Check if already normalized to 28-pixel multiples
  const isNormalized = w % 28 === 0 && h % 28 === 0

  if (!isNormalized) {
    return true // Needs normalization
  }

  // Check if within pixel boundaries
  const pixels = w * h
  const minPixels = config.minTokens * config.pixelsPerToken
  const maxPixels = config.maxTokens * config.pixelsPerToken

  if (pixels < minPixels || pixels > maxPixels) {
    return true // Needs scaling
  }

  return false // Already optimal
}
