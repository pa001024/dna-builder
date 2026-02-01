import { type FieldNode, type GraphQLResolveInfo, Kind } from "graphql"
import { resolvers as adminResolvers, typeDefs as adminSchema } from "./admin"
import { resolvers as buildResolvers, typeDefs as buildSchema } from "./build"
import { resolvers as dpsResolvers, typeDefs as dpsSchema } from "./dps"
import { resolvers as guideResolvers, typeDefs as guideSchema } from "./guide"
import { resolvers as messageResolvers, typeDefs as messageSchema } from "./message"
import { resolvers as missionsIngameResolvers, typeDefs as missionsIngameSchema } from "./missionsIngame"
import { resolvers as roomResolvers, typeDefs as roomSchema } from "./room"
import { resolvers as rtcResolvers, typeDefs as rtcSchema } from "./rtc"
import { resolvers as scriptResolvers, typeDefs as scriptSchema } from "./script"
import { resolvers as taskResolvers, typeDefs as taskSchema } from "./task"
import { resolvers as timelineResolvers, typeDefs as timelineSchema } from "./timeline"
import { resolvers as todoResolvers, typeDefs as todoSchema } from "./todo"
import { resolvers as userResolvers, typeDefs as userSchema } from "./user"

export function schemaWith(ctx: any) {
    const typeDefs = [
        userSchema,
        messageSchema,
        roomSchema,
        taskSchema,
        rtcSchema,
        missionsIngameSchema,
        guideSchema,
        adminSchema,
        todoSchema,
        buildSchema,
        timelineSchema,
        dpsSchema,
        scriptSchema,
    ]
    const resolvers = mergeResolvers(
        userResolvers,
        messageResolvers,
        roomResolvers,
        taskResolvers,
        rtcResolvers,
        missionsIngameResolvers,
        guideResolvers,
        adminResolvers,
        todoResolvers,
        buildResolvers,
        timelineResolvers,
        dpsResolvers,
        scriptResolvers
    )

    function mergeResolvers(...items: any[]) {
        const resolvers = {
            Query: {} as any,
            Mutation: {} as any,
            Subscription: {} as any,
        }
        items.forEach(item => {
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
