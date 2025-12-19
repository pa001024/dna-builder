import { typeDefs as userSchema, resolvers as userResolvers } from "./user"
import { typeDefs as messageSchema, resolvers as messageResolvers } from "./message"
import { typeDefs as roomSchema, resolvers as roomResolvers } from "./room"
import { typeDefs as taskSchema, resolvers as taskResolvers } from "./task"
import { typeDefs as rtcSchema, resolvers as rtcResolvers } from "./rtc"
import { typeDefs as missionsIngameSchema, resolvers as missionsIngameResolvers } from "./missionsIngame"
import { FieldNode, Kind, type GraphQLResolveInfo } from "graphql"

export function schemaWith(ctx: any) {
    const typeDefs = [userSchema, messageSchema, roomSchema, taskSchema, rtcSchema, missionsIngameSchema]
    const resolvers = mergeResolvers(userResolvers, messageResolvers, roomResolvers, taskResolvers, rtcResolvers, missionsIngameResolvers)

    function mergeResolvers(...items: any[]) {
        const resolvers = {
            Query: {} as any,
            Mutation: {} as any,
            Subscription: {} as any,
        }
        items.forEach((item) => {
            if (typeof item === "function") {
                item = item(ctx)
            }
            if (typeof item === "object") {
                Object.keys(item).forEach((key: string) => {
                    if (key === "Query" || key === "Mutation") {
                        Object.assign(resolvers[key], item[key])
                    } else if (key === "Subscription") {
                        for (const subKey in item[key]) {
                            resolvers[key][subKey] = { subscribe: item[key][subKey] }
                        }
                    }
                })
            }
        })
        return resolvers
    }
    return { typeDefs, resolvers }
}

// util
export const getSubSelection = (info: GraphQLResolveInfo, subKey: string = "msgs") => {
    function getSub(p: FieldNode, key: string) {
        if (p.selectionSet) {
            for (const selection of p.selectionSet.selections) {
                if (selection.kind === Kind.FIELD && selection.name.value === key) {
                    return selection
                }
            }
        }
    }
    const subarray = subKey.split(".")
    if (subarray.length === 0) return
    let field = info.fieldNodes[0]
    for (const key of subarray) {
        const sub = getSub(field, key)
        if (!sub) return
        field = sub
    }
    return new SubSelection(field)
}

export class SubSelection {
    constructor(public selection: FieldNode) {}

    hasArg(name: string) {
        return this.selection.arguments?.some((arg: any) => arg.name.value === name)
    }

    getArg(name: string) {
        const arg = this.selection.arguments?.find((arg: any) => arg.name.value === name)
        return arg ? (arg.value as any).value : null
    }

    args() {
        return this.selection.arguments?.reduce((acc: any, arg: any) => {
            acc[arg.name.value] = arg.value.value
            return acc
        }, {})
    }
}
