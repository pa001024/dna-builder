export type Point = [number, number]
type Cubic = [Point, Point, Point, Point]
type Span = { first: number; last: number; out: Point; incoming: Point }

const CORNER_COSINE = Math.cos(Math.PI / 3)
const STRAIGHT_COSINE = Math.cos(Math.PI / 12)
const CURVE_ERROR = 0.24
const LINE_ERROR = 0.18
const MAX_CORNER_SHIFT = 0.85

const subtract = ([x, y]: Point, [a, b]: Point): Point => [x - a, y - b]
const dot = ([x, y]: Point, [a, b]: Point): number => x * a + y * b
const squaredLength = (point: Point): number => dot(point, point)
const multiply = ([x, y]: Point, scale: number): Point => [x * scale, y * scale]
const add = ([x, y]: Point, [a, b]: Point): Point => [x + a, y + b]
const unit = (point: Point): Point => multiply(point, 1 / (Math.hypot(...point) || 1))
const mix = (a: Point, b: Point, t: number): Point => add(a, multiply(subtract(b, a), t))
const cross = ([x, y]: Point, [a, b]: Point): number => x * b - y * a

function arcDistances(points: Point[]): number[] {
    const distances = [0]
    for (let i = 1; i < points.length; i++) distances.push(distances[i - 1] + Math.hypot(...subtract(points[i], points[i - 1])))
    return distances
}

function fitFlank(samples: Point[]): { center: Point; direction: Point } | undefined {
    const center = multiply(samples.reduce(add), 1 / samples.length)
    let xx = 0
    let xy = 0
    let yy = 0
    for (const point of samples) {
        const [x, y] = subtract(point, center)
        xx += x * x
        xy += x * y
        yy += y * y
    }
    const angle = Math.atan2(2 * xy, xx - yy) / 2
    const direction: Point = [Math.cos(angle), Math.sin(angle)]
    if (samples.some(point => Math.abs(cross(subtract(point, center), direction)) > LINE_ERROR)) return undefined
    return { center, direction }
}

function recoverCorner(point: Point, before: Point[], after: Point[]): Point {
    const a = fitFlank(before)
    const b = fitFlank(after)
    if (!a || !b) return point
    const det = cross(a.direction, b.direction)
    if (Math.abs(det) < 0.35) return point
    const corner = add(a.center, multiply(a.direction, cross(subtract(b.center, a.center), b.direction) / det))
    const shift = squaredLength(subtract(corner, point))
    if (shift < 1e-8 || shift > MAX_CORNER_SHIFT ** 2) return point
    return corner
}

function evaluate([a, b, c, d]: Cubic, t: number): Point {
    const ab = mix(a, b, t)
    const bc = mix(b, c, t)
    const cd = mix(c, d, t)
    return mix(mix(ab, bc, t), mix(bc, cd, t), t)
}

function fitCubic(points: Point[], parameters: number[], { first, last, out, incoming }: Span): Cubic {
    const a = points[first]
    const d = points[last]
    let xx = 0
    let xy = 0
    let yy = 0
    let ax = 0
    let ay = 0
    for (let i = first + 1; i < last; i++) {
        const t = parameters[i - first]
        const s = 1 - t
        const b1 = 3 * s * s * t
        const b2 = 3 * s * t * t
        const b = multiply(out, b1)
        const c = multiply(incoming, b2)
        const residual = subtract(points[i], add(multiply(a, s ** 3 + b1), multiply(d, t ** 3 + b2)))
        xx += dot(b, b)
        xy += dot(b, c)
        yy += dot(c, c)
        ax += dot(residual, b)
        ay += dot(residual, c)
    }
    const determinant = xx * yy - xy * xy
    const chord = Math.hypot(...subtract(d, a))
    let start = determinant > 1e-9 ? (ax * yy - ay * xy) / determinant : 0
    let end = determinant > 1e-9 ? (ay * xx - ax * xy) / determinant : 0
    if (start <= 0 || start > chord * 1.5 || end <= 0 || end > chord * 1.5) start = end = chord / 3
    return [a, add(a, multiply(out, start)), add(d, multiply(incoming, end)), d]
}

function refineParameter([a, b, c, d]: Cubic, point: Point, t: number): number {
    const ab = subtract(b, a)
    const bc = subtract(c, b)
    const cd = subtract(d, c)
    const abbc = mix(ab, bc, t)
    const bccd = mix(bc, cd, t)
    const velocity = multiply(mix(abbc, bccd, t), 3)
    const acceleration = multiply(subtract(bccd, abbc), 6)
    const error = subtract(evaluate([a, b, c, d], t), point)
    const denominator = dot(velocity, velocity) + dot(error, acceleration)
    return denominator > 1e-9 ? t - dot(error, velocity) / denominator : t
}

function fitSpan(points: Point[], distances: number[], span: Span, tolerance: number): Cubic | number {
    const { first, last } = span
    const length = distances[last] - distances[first]
    let parameters = distances.slice(first, last + 1).map(distance => (distance - distances[first]) / length)
    let bestError = Number.POSITIVE_INFINITY
    let split = (first + last) >> 1
    for (let pass = 0; pass < 4; pass++) {
        const curve = fitCubic(points, parameters, span)
        let worst = 0
        let farthest = split
        for (let i = first + 1; i < last; i++) {
            const error = squaredLength(subtract(evaluate(curve, parameters[i - first]), points[i]))
            if (error > worst) {
                worst = error
                farthest = i
            }
        }
        if (worst <= tolerance ** 2) return curve
        if (worst >= bestError) break
        bestError = worst
        split = farthest
        const next = parameters.map((t, i) => (t === 0 || t === 1 ? t : refineParameter(curve, points[first + i], t)))
        if (next.some((value, i) => i > 0 && value <= next[i - 1])) break
        parameters = next
    }
    return split
}

function isStraight(points: Point[], { first, last, out, incoming }: Span): boolean {
    const chord = subtract(points[last], points[first])
    const length = Math.hypot(...chord)
    if (length === 0) return false
    const direction = multiply(chord, 1 / length)
    if (dot(direction, out) < STRAIGHT_COSINE || dot(direction, incoming) > -STRAIGHT_COSINE) return false
    for (let i = first + 1; i < last; i++) {
        const delta = subtract(points[i], points[first])
        const along = dot(delta, direction)
        if (along < 0 || along > length || Math.abs(delta[0] * direction[1] - delta[1] * direction[0]) > LINE_ERROR) return false
    }
    return true
}

/** 用弧长邻域区分尖角与像素锯齿；光滑段用最小二乘拟合，超出误差时分段重拟合。 */
export function fitSvgContour(contour: Point[], svgPoint: (point: Point) => string): string {
    const count = contour.length
    const points = [...contour, ...contour, contour[0]]
    let distances = arcDistances(points)
    const perimeter = distances[count]
    const window = Math.min(3, perimeter / 10)
    const sample = (index: number, offset: number): Point => {
        const target = distances[index] + offset
        let i = index
        while (i > 0 && distances[i] > target) i--
        while (i + 1 < points.length - 1 && distances[i + 1] < target) i++
        return mix(points[i], points[i + 1], (target - distances[i]) / (distances[i + 1] - distances[i]))
    }

    const middle = (index: number): number => (distances[index] < window ? index + count : index)
    const tangent = (index: number): Point => {
        const i = middle(index % count)
        return unit(subtract(sample(i, window), sample(i, -window)))
    }
    const cosine = contour.map((point, index) => {
        const i = middle(index)
        return dot(unit(subtract(point, sample(i, -window))), unit(subtract(sample(i, window), point)))
    })
    const corners = new Set<number>()
    for (const index of cosine.map((_, i) => i).sort((a, b) => cosine[a] - cosine[b])) {
        if (cosine[index] > CORNER_COSINE) break
        if (
            [...corners].every(other => {
                const distance = Math.abs(distances[other] - distances[index])
                return Math.min(distance, perimeter - distance) > window
            })
        )
            corners.add(index)
    }
    const breaks = [...corners]
    if (breaks.length === 0) breaks.push(0)
    if (breaks.length === 1) {
        const half = distances[breaks[0]] + perimeter / 2
        breaks.push(distances.findIndex(distance => distance >= half) % count)
    }
    breaks.sort((a, b) => a - b)

    // 略过抗锯齿圆钝区，只在两侧都接近直线时外推交点。
    const recovered = breaks.map((index, i) => {
        if (!corners.has(index)) return points[index]
        const previous = breaks[i - 1] ?? breaks.at(-1)! - count
        const next = breaks[i + 1] ?? breaks[0] + count
        const arc = (j: number): number => (j < 0 ? distances[j + count] - perimeter : distances[j])
        const extent = Math.min(9, (arc(index) - arc(previous)) * 0.75, (arc(next) - arc(index)) * 0.75)
        if (extent < 5) return points[index]
        const samples = [1.75, 2.75, 3.75, 4.75, extent]
        const at = arc(index) < extent ? index + count : index
        return recoverCorner(
            points[index],
            samples.map(offset => sample(at, -offset)),
            samples.map(offset => sample(at, offset))
        )
    })
    for (let i = 0; i < breaks.length; i++) {
        const index = breaks[i]
        points[index] = points[index + count] = recovered[i]
        if (index === 0) points[2 * count] = recovered[i]
    }
    distances = arcDistances(points)

    const side = (first: number, last: number, isStart: boolean): Point => {
        const index = isStart ? first : last
        if (!corners.has(index % count)) return multiply(tangent(index), isStart ? 1 : -1)
        if (last - first === 1) return unit(subtract(points[isStart ? last : first], points[index]))
        const offset = Math.min(window, (distances[last] - distances[first]) / 2)
        return unit(subtract(sample(index, isStart ? offset : -offset), points[index]))
    }

    const commands = [`M${svgPoint(points[breaks[0]])}`]
    const tolerance = Math.min(CURVE_ERROR, perimeter / 20)
    for (let i = 0; i < breaks.length; i++) {
        const first = breaks[i]
        const last = breaks[i + 1] ?? breaks[0] + count
        const stack = [{ first, last, out: side(first, last, true), incoming: side(first, last, false) }]
        while (stack.length) {
            const span = stack.pop()!
            const { first, last } = span
            if (last - first === 1 || isStraight(points, span)) {
                commands.push(`L${svgPoint(points[last])}`)
                continue
            }
            const fitted = fitSpan(points, distances, span, tolerance)
            if (typeof fitted === "number") {
                const direction = tangent(fitted)
                stack.push({ ...span, first: fitted, out: direction }, { ...span, last: fitted, incoming: multiply(direction, -1) })
            } else {
                commands.push(`C${fitted.slice(1).map(svgPoint).join(" ")}`)
            }
        }
    }
    return `${commands.join("")}Z`
}
