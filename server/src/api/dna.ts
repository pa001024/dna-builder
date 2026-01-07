import { fetch } from "bun"
import { DNAAPI } from "dna-api"

export const getDNAAPI = () => {
    const dnaAPI = new DNAAPI(process.env.DEV_CODE!, process.env.USER_TOKEN, { fetchFn: fetch })
    return dnaAPI
}
