import { Client, fetchExchange } from "@urql/vue"
import { env } from "../env"
import { useSettingStore } from "../store/setting"
// import schema from "../../schema.json"

export const gqClient = (function () {
    const url = `${env.endpoint}/graphql`

    return new Client({
        url,
        exchanges: [fetchExchange],
        fetchOptions: () => {
            const token = useSettingStore().jwtToken
            return {
                headers: { token },
            }
        },
    })
})()
