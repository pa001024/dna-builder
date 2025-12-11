import Elysia from "elysia"
import jwt from "jsonwebtoken"
import { createSchema, createYoga, type YogaInitialContext } from "graphql-yoga"
import { machineIdSync } from "node-machine-id"
import { useGraphQlJit } from "@envelop/graphql-jit"
import { schemaWith } from "./mod"
import { makeHandler as makeWSHandler } from "graphql-ws/use/bun"
import { pubsub } from "../rt/pubsub"
import type { ServerWebSocket } from "bun"

export const genSchema = () => {
    const { typeDefs, resolvers } = schemaWith({})

    return {
        typeDefs,
        resolvers,
    }
}

export type Context = YogaInitialContext & CustomContext

export type CustomContext = {
    user?: JWTUser
    pubsub: typeof pubsub
    extra?: {
        socket: ServerWebSocket<{
            validator: any
            open: (ws: ServerWebSocket) => any
            message: (ws: ServerWebSocket) => any
            drain: (ws: ServerWebSocket) => any
            close: (ws: ServerWebSocket) => any
            id: string
            userId: string
        }>
    }
}

export interface JWTUser {
    id: string
    name: string
    qq?: string
}
export const jwtToken = `${machineIdSync()}`

export function yogaPlugin() {
    const schema = createSchema({
        ...genSchema(),
    })
    return (app: Elysia) => {
        const yoga = createYoga<CustomContext>({
            cors: false,
            schema: schema as any,
            context: (ctx) => {
                const token = ctx.request.headers?.get("token")
                let user: JWTUser | undefined = void 0
                if (token) {
                    try {
                        user = jwt.verify(token, jwtToken) as JWTUser
                    } catch {}
                }
                return { user, pubsub }
            },
            plugins: [useGraphQlJit()],
            graphiql: {
                subscriptionsProtocol: "WS", // use WebSockets instead of SSE
            },
        })

        const path = "/graphql"

        const handler = makeWSHandler({
            schema,
            execute: (args: any) => args.rootValue.execute(args),
            subscribe: (args: any) => args.rootValue.subscribe(args),
            onSubscribe: async (ctx: any, msg: any) => {
                // console.log("onSubscribe", ctx, msg)
                const token = ctx.connectionParams?.token || (msg.payload.extensions?.headers as any).token
                const { schema, execute, subscribe, contextFactory, parse, validate } = yoga.getEnveloped({
                    ...ctx,
                    request: {
                        headers: {
                            get() {
                                return token
                            },
                        },
                    },
                    socket: ctx.extra.socket,
                    params: msg.payload,
                })

                const args = {
                    schema,
                    operationName: msg.payload.operationName,
                    document: parse(msg.payload.query),
                    variableValues: msg.payload.variables,
                    contextValue: await contextFactory(),
                    rootValue: {
                        execute,
                        subscribe,
                    },
                }

                const errors = validate(args.schema, args.document)
                if (errors.length) return errors
                return args
            },
        })

        // const sofa = useSofa({
        //     basePath: "/rest",
        //     schema,
        //     swaggerUI: {
        //         spec: {
        //             info: {
        //                 title: "WeYS API",
        //                 // version: pkg.version,
        //             },
        //         },
        //         endpoint: "/swagger",
        //     },
        // })

        const result = app
            .get(path, async ({ request }) => yoga.fetch(request))
            .post(path, async ({ request }) => yoga.fetch(request), {
                // type: "none",
            })
            .ws(path, {
                open(ws) {
                    handler.open!(ws.raw as any)
                },
                close(ws, code, reason) {
                    handler.close!(ws.raw as any, code, reason)
                },
                message(ws, message) {
                    handler.message!(ws.raw as any, JSON.stringify(message))
                },
            })

        return result
    }
}
