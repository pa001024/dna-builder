import { gql, type AnyVariables, type OperationContext } from "@urql/vue"
import { gqClient } from "./graphql"

function extractType<T extends string>(gqlQuery: T) {
    const match = gqlQuery.match(/query[\s\S]*?\s(\w+?)\s*\(/m)
    if (match) {
        return match[1]
    }
    return ""
}

function namedQuery<R = { id: string }, G extends string = string>(gqlQuery: G) {
    const name = extractType(gqlQuery)
    const query = gql(gqlQuery)
    return async (variables?: AnyVariables, context?: Partial<OperationContext> | undefined) => {
        const raw = await gqClient.query(query, variables, context).toPromise()
        return raw?.data?.[name] as R | undefined
    }
}

export const missionsIngameQuery = namedQuery<{
    missions: string[][]
    createdAt: string
}>(/* GraphQL */ `
    query {
        missionsIngame(server: "cn") {
            missions
            createdAt
        }
    }
`)
