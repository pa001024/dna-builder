import {
    appendBinary,
    type GlbDocument,
    type GltfChannel,
    type GltfJson,
    type GltfNode,
    type GltfTexture,
    repackBinary,
    walkTextureRefs,
} from "./skin-model-glb"

/**
 * 系列皮肤是「公共体型 + 角色头发/脸」拼出来的，同一个体型会被几十个皮肤复用；
 * 若每个皮肤各存一份完整模型，公共体型的几何与贴图会被重复打包几十次。
 * 这里按网格名切出独立 GLB，运行期再用 `mergeGlbs` 按 `PartModelsId` 拼回去。
 */

export interface PartSplit {
    /** 部件名（网格节点名，例如 `QNF00_TP01_SM`） */
    name: string
    /** 独立 GLB */
    glb: GlbDocument
}

/**
 * 列出网格名：导出器的名字放在 `meshes[i].name` 上；贴片全被剔除的空网格跳过，否则会发布空部件。
 */
export function meshNames(document: GlbDocument): string[] {
    const json = document.json
    return (json.nodes ?? [])
        .filter(node => node.mesh !== undefined)
        .map(node => node.mesh!)
        .filter(meshIndex => (json.meshes[meshIndex]?.primitives ?? []).length > 0)
        .map(meshIndex => meshName(json, meshIndex))
        .filter((name): name is string => typeof name === "string")
}

/** 取网格节点对应的网格名：优先节点名，其次网格名。 */
function meshName(json: GltfJson, meshIndex: number): string | undefined {
    return json.meshes?.[meshIndex]?.name
}

/** 按网格名切出独立 GLB：保留该网格的节点、蒙皮、材质、贴图与它引用的骨架。 */
export function splitMesh(document: GlbDocument, name: string): GlbDocument | undefined {
    const json = document.json
    const nodes = json.nodes ?? []
    const target = nodes.find(node => node.mesh !== undefined && meshName(json, node.mesh) === name)
    if (!target) return undefined

    // 需要保留的节点：网格节点本身 + 它的骨架关节 + 关节的父链
    const keep = new Set<number>()
    const queue = [nodes.indexOf(target)]
    while (queue.length) {
        const index = queue.pop()!
        if (keep.has(index)) continue
        keep.add(index)
        for (const child of nodes[index].children ?? []) queue.push(child)
    }
    // 蒙皮关节及其父链。父链必须一路保留到根：骨骼树要挂在场景根下，
    // 否则节点存在但不在场景里，动画按名字找不到骨骼、蒙皮也不会更新。
    const skin = target.skin !== undefined ? json.skins[target.skin] : undefined
    const roots = new Set<number>()
    if (skin) {
        for (const joint of skin.joints) {
            let cursor: number | undefined = joint
            while (cursor !== undefined) {
                keep.add(cursor)
                const parent = parentOf(nodes, cursor)
                if (parent === undefined) roots.add(cursor)
                cursor = parent
            }
        }
    }
    // 场景根：网格节点所在的最顶层祖先
    let top: number | undefined = nodes.indexOf(target)
    while (true) {
        const parent = parentOf(nodes, top)
        if (parent === undefined) break
        top = parent
    }
    if (top !== undefined) {
        keep.add(top)
        roots.add(top)
    }
    return extractNodes(document, keep, roots.size ? roots : new Set([nodes.indexOf(target)]))
}

/** 保留指定节点集合并重建索引表，用于部件拆分与运行期合并前的裁剪。 */
export function extractNodes(document: GlbDocument, keep: Set<number>, roots: Set<number>): GlbDocument {
    const source = structuredClone(document.json)
    const nodes = source.nodes ?? []
    const order = [...keep].sort((a, b) => a - b)
    const nodeRemap = new Map<number, number>()
    order.forEach((index, position) => nodeRemap.set(index, position))

    const meshes = new Set<number>()
    const skins = new Set<number>()
    const materials = new Set<number>()
    for (const index of order) {
        const node = nodes[index]
        if (node.mesh !== undefined) meshes.add(node.mesh)
        if (node.skin !== undefined) skins.add(node.skin)
    }
    for (const meshIndex of meshes) {
        for (const primitive of source.meshes[meshIndex]?.primitives ?? []) {
            if (primitive.material !== undefined) materials.add(primitive.material)
        }
    }

    const accessors = new Set<number>()
    const images = new Set<number>()
    for (const meshIndex of meshes) {
        for (const primitive of source.meshes[meshIndex]?.primitives ?? []) {
            for (const key of Object.keys(primitive.attributes ?? {})) accessors.add(primitive.attributes[key])
            if (primitive.indices !== undefined) accessors.add(primitive.indices)
            for (const target of primitive.targets ?? []) for (const key of Object.keys(target)) accessors.add(target[key])
        }
    }
    for (const skinIndex of skins) {
        const skin = source.skins[skinIndex]
        if (skin.inverseBindMatrices !== undefined) accessors.add(skin.inverseBindMatrices)
    }
    for (const materialIndex of materials) {
        const material = source.materials[materialIndex]
        walkTextureRefs(material, ref => {
            const image = source.textures[ref.index]?.source
            if (image !== undefined) images.add(image)
        })
        // 染色着色器要用的贴图（混合/丝绸混合/法线…）只登记在 dnaColorize.textures 里，
        // glTF 材质字段只引用底图；不把这些一起带上，拆分后着色器会缺贴图。
        for (const textureIndex of Object.values(material.extras?.dnaColorize?.textures ?? {})) {
            if (typeof textureIndex !== "number") continue
            const image = source.textures[textureIndex]?.source
            if (image !== undefined) images.add(image)
        }
    }

    const accessorRemap = remap(accessors)
    const meshRemap = remap(meshes)
    const skinRemap = remap(skins)
    const materialRemap = remap(materials)
    const imageRemap = remap(images)
    const textureRemap = new Map<number, number>()
    const keptTextures: GltfTexture[] = []
    for (const [textureIndex, texture] of (source.textures ?? []).entries()) {
        if (texture.source === undefined || !imageRemap.has(texture.source)) continue
        textureRemap.set(textureIndex, keptTextures.length)
        keptTextures.push({ ...texture, source: imageRemap.get(texture.source) })
    }

    // 视图：几何/逆绑定矩阵的 accessor 视图 + 保留贴图的视图
    const views = new Set<number>()
    for (const accessorIndex of accessorRemap.keys()) {
        const view = source.accessors[accessorIndex]?.bufferView
        if (view !== undefined) views.add(view)
    }
    for (const imageIndex of imageRemap.keys()) {
        const view = source.images[imageIndex]?.bufferView
        if (view !== undefined) views.add(view)
    }
    const viewRemap = remap(views)

    const keptAccessors = [...accessorRemap.keys()].map(index => {
        const accessor = structuredClone(source.accessors[index])
        if (accessor.bufferView !== undefined) accessor.bufferView = viewRemap.get(accessor.bufferView)!
        return accessor
    })
    const keptNodes = order.map(index => {
        const node = structuredClone(nodes[index])
        if (node.mesh !== undefined) node.mesh = meshRemap.get(node.mesh)!
        if (node.skin !== undefined) node.skin = skinRemap.get(node.skin)!
        if (node.children) node.children = node.children.filter(child => nodeRemap.has(child)).map(child => nodeRemap.get(child)!)
        return node
    })
    const keptMeshes = [...meshRemap.keys()].map(index => {
        const mesh = structuredClone(source.meshes[index])
        for (const primitive of mesh.primitives) {
            for (const key of Object.keys(primitive.attributes)) primitive.attributes[key] = accessorRemap.get(primitive.attributes[key])!
            if (primitive.indices !== undefined) primitive.indices = accessorRemap.get(primitive.indices)!
            if (primitive.material !== undefined) primitive.material = materialRemap.get(primitive.material)!
        }
        return mesh
    })
    const keptSkins = [...skinRemap.keys()].map(index => {
        const skin = structuredClone(source.skins[index])
        skin.joints = skin.joints.map(joint => nodeRemap.get(joint)!)
        if (skin.skeleton !== undefined) skin.skeleton = nodeRemap.get(skin.skeleton)!
        if (skin.inverseBindMatrices !== undefined) skin.inverseBindMatrices = accessorRemap.get(skin.inverseBindMatrices)!
        return skin
    })
    const keptMaterials = [...materialRemap.keys()].map(index => {
        const material = structuredClone(source.materials[index])
        walkTextureRefs(material, (ref, remove) => {
            const next = textureRemap.get(ref.index)
            if (next === undefined) remove()
            else ref.index = next
        })
        // 染色元数据里的贴图槽是数字索引，拆分后贴图表被重排，必须一起改；
        // 被裁掉的贴图槽直接删掉，否则前端会去取不存在的纹理。
        remapDyeTextureSlots(material.extras?.dnaColorize?.textures, textureIndex => textureRemap.get(textureIndex))
        return material
    })

    const { views: keptViews, binary } = repackBinary(document, viewRemap.keys())

    const out: GltfJson = {
        ...source,
        scenes: [{ nodes: [...roots].map(index => nodeRemap.get(index)!) }],
        scene: 0,
        nodes: keptNodes,
        meshes: keptMeshes,
        skins: keptSkins,
        materials: keptMaterials,
        accessors: keptAccessors,
        textures: keptTextures,
        images: [...imageRemap.keys()].map(index => ({
            ...source.images[index],
            // 贴图必带 bufferView（收集阶段只认了有视图的）；外来文档缺失时与之前一致直接抛错。
            bufferView: viewRemap.get(source.images[index].bufferView!)!,
        })),
        bufferViews: keptViews,
        buffers: [{ byteLength: binary.length }],
        // 动画不属于单个部件，拆分时不带走
        animations: [],
        samplers: [],
    }
    return { json: out, binary }
}

/** 节点索引 → 父节点索引 */
function parentOf(nodes: GltfNode[], index: number): number | undefined {
    for (let parent = 0; parent < nodes.length; parent++) {
        if ((nodes[parent].children ?? []).includes(index)) return parent
    }
    return undefined
}

/** 把集合重排成 0..n-1 的映射 */
function remap(indices: Set<number>): Map<number, number> {
    const result = new Map<number, number>()
    for (const index of [...indices].sort((a, b) => a - b)) result.set(index, result.size)
    return result
}

/** 重写 `dnaColorize.textures` 里的贴图索引（槽名 → 数字索引）。 */
export function remapDyeTextureSlots(slots: Record<string, number> | undefined, map: (index: number) => number | undefined): void {
    if (!slots) return
    for (const [name, index] of Object.entries(slots)) {
        const next = map(index)
        if (next === undefined) delete slots[name]
        else slots[name] = next
    }
}

/**
 * 从完整皮肤 GLB 里抽出展示动画：通道按节点索引指向骨骼，部件拆分后索引会变，
 * 所以动画单独抽出、在运行期合并完成后再按名字重新绑定。
 */
export function extractAnimation(document: GlbDocument): GlbDocument | undefined {
    const json = document.json
    if (!json.animations?.length) return undefined
    const nodes = json.nodes ?? []

    // 收集动画引用到的 accessor，其余几何数据不带
    const accessors = new Set<number>()
    for (const animation of json.animations) {
        for (const sampler of animation.samplers ?? []) {
            if (sampler.input !== undefined) accessors.add(sampler.input)
            if (sampler.output !== undefined) accessors.add(sampler.output)
        }
    }
    const accessorRemap = remap(accessors)
    const views = new Set<number>()
    for (const index of accessorRemap.keys()) {
        const view = json.accessors[index]?.bufferView
        if (view !== undefined) views.add(view)
    }
    const viewRemap = remap(views)
    const { views: keptViews, binary } = repackBinary(document, viewRemap.keys())

    const keptAccessors = [...accessorRemap.keys()].map(index => {
        const accessor = structuredClone(json.accessors[index])
        if (accessor.bufferView !== undefined) accessor.bufferView = viewRemap.get(accessor.bufferView)!
        return accessor
    })
    const keptAnimations = json.animations.map(animation => ({
        name: animation.name,
        samplers: (animation.samplers ?? []).map(sampler => ({
            input: accessorRemap.get(sampler.input)!,
            output: accessorRemap.get(sampler.output)!,
            interpolation: sampler.interpolation,
        })),
        // 通道仍按「骨骼名」记，运行期合并后按名字找节点重新绑定
        channels: (animation.channels ?? []).map(channel => ({
            sampler: channel.sampler,
            target: {
                nodeName: channel.target?.node === undefined ? undefined : nodes[channel.target.node]?.name,
                path: channel.target?.path,
            },
        })),
    }))
    return {
        json: {
            asset: { version: "2.0", generator: "dna-builder flora exporter" },
            scenes: [{ nodes: [] }],
            scene: 0,
            nodes: [],
            meshes: [],
            skins: [],
            materials: [],
            textures: [],
            images: [],
            samplers: [],
            accessors: keptAccessors,
            bufferViews: keptViews,
            buffers: [{ byteLength: binary.length }],
            animations: keptAnimations,
        },
        binary,
    }
}

/** 把按骨骼名记录的动画通道重新绑定到合并后模型的节点索引上。 */
export function rebindAnimation(document: GlbDocument, animation: GlbDocument): void {
    const json = document.json
    const nodes = json.nodes ?? []
    const byName = new Map<string, number>()
    for (const [index, node] of nodes.entries()) {
        if (typeof node.name === "string" && !byName.has(node.name)) byName.set(node.name, index)
    }
    // 动画的 accessor 并进模型
    const accessorOffset = json.accessors.length
    const viewOffset = json.bufferViews.length
    const binOffset = appendBinary(document, animation.binary)
    for (const view of animation.json.bufferViews ?? [])
        json.bufferViews.push({ ...view, buffer: 0, byteOffset: (view.byteOffset ?? 0) + binOffset })
    for (const accessor of animation.json.accessors ?? []) {
        json.accessors.push(accessor.bufferView === undefined ? accessor : { ...accessor, bufferView: accessor.bufferView + viewOffset })
    }
    json.animations = json.animations ?? []
    for (const source of animation.json.animations ?? []) {
        const channels = source.channels
            .map((channel): GltfChannel | undefined => {
                const nodeName = channel.target.nodeName
                const node = nodeName === undefined ? undefined : byName.get(nodeName)
                if (node === undefined) return undefined
                return { sampler: channel.sampler, target: { node, path: channel.target.path } }
            })
            .filter((channel): channel is GltfChannel => channel !== undefined)
        if (!channels.length) continue
        json.animations.push({
            name: source.name,
            samplers: source.samplers.map(sampler => ({
                input: sampler.input + accessorOffset,
                output: sampler.output + accessorOffset,
                ...(sampler.interpolation ? { interpolation: sampler.interpolation } : {}),
            })),
            channels,
        })
    }
}

export type { GlbDocument }
