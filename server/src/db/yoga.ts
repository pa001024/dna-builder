import { useGraphQlJit } from "@envelop/graphql-jit"
import type { ServerWebSocket } from "bun"
import type Elysia from "elysia"
import { makeHandler as makeWSHandler } from "graphql-ws/use/bun"
import { createSchema, createYoga, type YogaInitialContext } from "graphql-yoga"
import jwt from "jsonwebtoken"
import { machineIdSync } from "node-machine-id"
import { pubsub } from "../rt/pubsub"
import { schemaWith } from "./mod"
export type Context = YogaInitialContext & CustomContext

export type CustomContext = {
    user?: JWTUser
    pubsub: typeof pubsub
    extra?: {
        socket: ServerWebSocket<{
            validator: unknown
            open: (ws: ServerWebSocket) => unknown
            message: (ws: ServerWebSocket) => unknown
            drain: (ws: ServerWebSocket) => unknown
            close: (ws: ServerWebSocket) => unknown
            id: string
            userId: string
        }>
    }
}

export interface JWTUser {
    id: string
    name: string
    qq?: string
    roles?: string[]
}
export const jwtToken = `${machineIdSync()}`

export function yogaPlugin() {
    const raw = schemaWith({})
    const schema = createSchema<CustomContext>(raw)
    return (app: Elysia) => {
        const yoga = createYoga<CustomContext>({
            cors: false,
            schema,
            context: ctx => {
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
            // execute: (args) => args.rootValue.execute(args),
            // subscribe: (args) => args.rootValue.subscribe(args),
            onSubscribe: async (ctx, _id, payload) => {
                // console.log("onSubscribe", ctx, id, payload)
                const token = ctx.connectionParams?.token || (payload.extensions?.headers as any).token
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
                    params: payload,
                })

                const args = {
                    schema,
                    operationName: payload.operationName,
                    document: parse(payload.query),
                    variableValues: payload.variables,
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
