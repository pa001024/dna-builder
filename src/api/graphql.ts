import { Client, fetchExchange } from "@urql/vue"
import { env } from "../env"
// import schema from "../../schema.json"

export const gqClient = (function () {
    const url = `${env.endpoint}/graphql`

    return new Client({
        url,
        exchanges: [fetchExchange],
        fetchOptions: () => {
            // const token = useUserStore().token
            // return {
            //     headers: { token },
            // }
            return {}
        },
    })
})()
