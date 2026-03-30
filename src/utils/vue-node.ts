import type { DisplayObjectConfig, HTMLStyleProps as GHTMLStyleProps } from "@antv/g"
import type { BaseNodeStyleProps, HTMLStyleProps } from "@antv/g6"
import { HTML } from "@antv/g6"
import type { VNode } from "vue"
import { renderVueNode } from "@/main"

export interface VueNodeStyleProps extends BaseNodeStyleProps {
    /**
     * <zh/> Vue 虚拟节点
     *
     * <en/> Vue VNode
     */
    component: VNode
}

export class VueNode extends HTML {
    protected getKeyStyle(attributes: Required<HTMLStyleProps>): GHTMLStyleProps {
        return { ...super.getKeyStyle(attributes) }
    }

    constructor(options: DisplayObjectConfig<VueNodeStyleProps>) {
        super(options as any)
    }

    public update(attr?: Partial<VueNodeStyleProps> | undefined): void {
        super.update(attr)
    }

    _instance: any = null
    public async connectedCallback() {
        super.connectedCallback()
        const { component } = this.attributes as unknown as VueNodeStyleProps
        // component 是通过 style.component 的回调返回来的VNode
        this._instance?.unmount()
        this._instance = renderVueNode(component, this.getDomElement())
    }

    public async attributeChangedCallback(name: any, oldValue: any, newValue: any) {
        super.attributeChangedCallback(name, oldValue, newValue)
        if (name === "component" && oldValue !== newValue) {
            this._instance?.unmount()
            this._instance = renderVueNode((this.attributes as unknown as VueNodeStyleProps).component, this.getDomElement())
        }
    }

    public destroy(): void {
        this._instance.unmount()
        super.destroy()
    }
}
