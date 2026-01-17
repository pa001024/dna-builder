import {
    buildsCountQuery,
    buildsQuery,
    guidesCountQuery,
    guidesQuery,
    roomsCountQuery,
    roomsQuery,
    timelinesCountQuery,
    timelinesQuery,
    todosCountQuery,
    todosQuery,
    usersCountQuery,
    usersQuery,
} from "../graphql"
import { combinedQuery } from "../query"

export const buildsWithCountQuery = combinedQuery(buildsQuery, buildsCountQuery)
export const usersWithCountQuery = combinedQuery(usersQuery, usersCountQuery)
export const todosWithCountQuery = combinedQuery(todosQuery, todosCountQuery)
export const timelinesWithCountQuery = combinedQuery(timelinesQuery, timelinesCountQuery)
export const roomsWithCountQuery = combinedQuery(roomsQuery, roomsCountQuery)
export const guidesWithCountQuery = combinedQuery(guidesQuery, guidesCountQuery)
