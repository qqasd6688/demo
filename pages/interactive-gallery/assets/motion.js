import { MathUtils, Matrix4 } from './vendor/three/build/three.module.min.js'

// 六席保持固定相对角度；前景是位置，不绑定业务入口。
export const SEAT_ANGLES = [-30, 30, -90, 90, -150, 150]
export const CARD_WIDTH = 2.9
export const CARD_HEIGHT = 4.45
export const ORBIT_SECONDS = 90
export const ORBIT_DEPTH = 3.8
export const ORBIT_RADIUS = 9.2
export const ENTRANCE_DURATION = 4

// 入场共用场景时钟：星球先浮起，六席从后向前落位，全部落稳后才允许环绕。
export function getEntranceState(elapsed) {
  const rise = MathUtils.clamp((elapsed - 0.15) / 2.3, 0, 1)
  const globe = 1 - (1 - rise) ** 3
  const order = [4, 5, 2, 3, 0, 1]
  return {
    globe,
    rings: MathUtils.smoothstep(globe, 0.65, 1),
    label: MathUtils.smoothstep(globe, 0.7, 1),
    cards: SEAT_ANGLES.map((_, index) => {
      const start = 1.45 + order.indexOf(index) * 0.13
      const progress = MathUtils.clamp((elapsed - start) / 1.45, 0, 1)
      const fall = Math.min(progress / 0.8, 1)
      const eased = fall < 0.5 ? 4 * fall ** 3 : 1 - (-2 * fall + 2) ** 3 / 2
      const settle = Math.max(0, (progress - 0.8) / 0.2)
      return {
        visible: elapsed >= start,
        // 主下降段首尾速度归零；轻微回弹不穿入台面，也不改变底座位置。
        offset:
          progress === 1
            ? 0
            : 12 * (1 - eased) + 0.12 * Math.sin(settle * Math.PI) ** 2 * (1 - settle),
      }
    }),
  }
}

export function getOrbitPosition(index, phase) {
  const angle = (SEAT_ANGLES[index] * Math.PI) / 180 + phase
  // 六席等角间隔共享椭圆相位。倾角连续经过零点，两侧保留可阅读的正面。
  return {
    x: Math.sin(angle) * ORBIT_RADIUS,
    z: Math.cos(angle) * ORBIT_DEPTH,
    yaw: -Math.atan2(Math.sin(angle) * ORBIT_DEPTH, ORBIT_RADIUS * 0.5),
  }
}

// 将同一块三维面板的齐次坐标转换为 CSS 投影，保证可点击文字与 WebGL 面板精确对齐。
export function getCardProjection(camera, worldMatrix, viewportWidth, viewportHeight) {
  const local = new Matrix4()
    .makeTranslation(-CARD_WIDTH / 2, CARD_HEIGHT / 2, 0.025)
    .multiply(new Matrix4().makeScale(CARD_WIDTH / 320, -CARD_HEIGHT / 476, 1))
  const m = new Matrix4()
    .multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    .multiply(worldMatrix)
    .multiply(local).elements
  const css = []
  for (let column = 0; column < 4; column++) {
    const offset = column * 4
    css.push(
      ((m[offset] + m[offset + 3]) * viewportWidth) / 2,
      ((-m[offset + 1] + m[offset + 3]) * viewportHeight) / 2,
      column === 2 ? 1 : 0,
      m[offset + 3],
    )
  }
  return css
}
