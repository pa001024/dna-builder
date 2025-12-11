import { createPubSub } from "graphql-yoga"
import type { msgs, tasks, users } from "../db/schema"
import type { JWTUser } from "../db/yoga"

export interface RoomUserEvent {
    id: string
    end: boolean
    user: JWTUser
}

export interface RtcEvent {
    id: string
    type: string
    from: string
    to: string
    body: string
}

type RoomEvent = {
    newMessage: typeof msgs.$inferSelect
    newReaction: typeof msgs.$inferSelect
    msgEdited: typeof msgs.$inferSelect
    userJoined: typeof users.$inferSelect
    userLeaved: typeof users.$inferSelect
    newTask: typeof tasks.$inferSelect
    updateTask: typeof tasks.$inferSelect & { online?: boolean; paused?: boolean }
    watchTask: typeof tasks.$inferSelect & { online?: boolean; paused?: boolean }
    newRtcEvent: RtcEvent
    newRoomUser: RoomUserEvent
}

// type REvents<T extends Record<string, unknown>, L extends string = keyof T extends string ? keyof T : never> = {
//     [K in `r:${string}:${L}`]: K extends `r:${string}:${infer V extends L}` ? T[V] : never
// }

type REvents<T extends Record<string, unknown>, L extends string = keyof T extends string ? keyof T : never> = {
    [K in L]: K extends infer V extends L ? [id: string, { [k in V]: T[V] }] : never
}

type PubSubEvents = REvents<RoomEvent>

export const pubsub = createPubSub<PubSubEvents>()
