export interface User {
    id: string
    name?: string
    email?: string
    qq?: string
    pic?: string
    uid?: string
    roles?: string
    createdAt?: string
    updateAt?: string
}

export interface UserLoginResult {
    success: boolean
    message: string
    token?: string
    user?: User
}

export interface TinyUser {
    id: string
    name: string
    qq?: string
    roles?: string
}

export interface Todo {
    id: string
    title: string
    description?: string
    startTime?: string
    endTime?: string
    type: string
    userId: string
    createdAt: string
    updateAt: string
    user?: User
    isCompleted?: boolean
}

export interface Timeline {
    id: string
    title: string
    charId: number
    charName: string
    tracks: string
    items: string
    userId: string
    views: number
    likes: number
    isRecommended?: boolean
    isPinned?: boolean
    createdAt: string
    updateAt: string
    user?: User
    isLiked?: boolean
}

export interface Subscription {
    newTask: Task
    updateTask: Task
    watchTask: Task
}

export interface Task {
    id: string
    name: string
    desc?: string
    maxUser: number
    maxAge?: number
    userList?: string[]
    startTime?: string
    endTime?: string
    roomId: string
    userId: string
    createdAt?: string
    updateAt?: string
    online?: boolean
    paused?: boolean
    user: User
}

export interface Script {
    id: string
    title: string
    description?: string
    content: string
    category: string
    userId: string
    views: number
    likes: number
    isRecommended?: boolean
    isPinned?: boolean
    createdAt: string
    updateAt: string
    user?: User
    isLiked?: boolean
}

export interface RtcJoinResult {
    id: string
    end: boolean
    user: TinyUser
    clients?: RtcClient[]
}

export interface RtcClient {
    id: string
    end: boolean
    user: TinyUser
}

export interface RtcEvent {
    id: string
    type: string
    from: string
    to: string
    body: string
}

export interface RoomUserChange {
    id: string
    roomId: string
    userId: string
    end: boolean
    user: TinyUser
}

export interface Room {
    id: string
    name: string
    type?: string
    ownerId: string
    maxUsers?: number
    createdAt?: string
    updateAt?: string
    owner?: User
    msgCount: number
    lastMsg?: Msg
    onlineUsers?: TinyUser[]
}

export interface MissionsIngame {
    id: number
    server: string
    missions?: string[][]
    createdAt?: string
}

export interface Msg {
    id: string
    roomId: string
    userId: string
    content: string
    edited?: number
    createdAt?: string
    updateAt?: string
    replyToMsgId?: string
    replyToUserId?: string
    user?: User
    replyTo?: Msg
    reactions?: Reaction[]
}

export interface Reaction {
    id: string
    msgId: string
    count?: number
    users?: User[]
    createdAt?: string
}

export interface Guide {
    id: string
    title: string
    type: "image" | "text"
    content: string
    images?: string[]
    charId?: number
    userId: string
    buildId?: string
    views: number
    likes: number
    isRecommended?: boolean
    isPinned?: boolean
    createdAt: string
    updateAt: string
    user?: User
    isLiked?: boolean
}

export interface DPS {
    id: string
    charId: number
    buildId?: string
    timelineId?: string
    dpsValue: number
    details?: string
    userId: string
    createdAt: string
    updateAt: string
    user?: User
    build?: Build
    timeline?: Timeline
}

export interface Build {
    id: string
    title: string
    desc?: string
    charId: number
    charSettings: string
    userId: string
    views: number
    likes: number
    isRecommended?: boolean
    isPinned?: boolean
    createdAt: string
    updateAt: string
    user?: User
    isLiked?: boolean
}

export interface AdminStats {
    totalUsers: number
    totalGuides: number
    totalRooms: number
    totalMessages: number
    totalBuilds: number
    totalTimelines: number
}

export interface RecentActivity {
    id: string
    user: string
    action: string
    target: string
    time: string
}

export interface Activity {
    id: number
    server: string
    postId?: string
    startTime: number
    endTime: number
    name: string
    icon: string
    desc: string
    createdAt?: string
    updateAt?: string
}

export interface UsersUpdateInput {
    name?: string
    qq?: string
}

export interface TodoInput {
    title: string
    description?: string
    startTime?: string
    endTime?: string
}

export interface TimelineInput {
    title: string
    charId: number
    charName: string
    tracks: string
    items: string
}

export interface ScriptInput {
    title: string
    description?: string
    content: string
    category: string
}

export interface RoomInput {
    name: string
    type?: string
    maxUsers?: number
}

export interface GuideInput {
    title: string
    type: string
    content: string
    images: string[]
    charId?: number
    buildId?: string
}

export interface DPSInput {
    charId: number
    buildId?: string
    timelineId?: string
    dpsValue: number
    details?: string
}

export interface BuildInput {
    title: string
    desc?: string
    charId: number
    charSettings: string
}

export interface ActivityInput {
    id: number
    postId?: string
    startTime: number
    endTime: number
    name: string
    icon: string
    desc: string
}

export interface ActivityUpdateInput {
    postId?: string
    startTime: number
    endTime: number
    name: string
    icon: string
    desc: string
}
