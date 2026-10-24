import { DavinciSDK } from "@vocdoni/davinci-sdk"
import { Wallet } from "ethers"
const sdk = new DavinciSDK({ signer: Wallet.createRandom(), sequencerUrls: ["https://sequencer2.davinci.vote"] })
await sdk.init()
console.log("nodeChecks", JSON.stringify(sdk.nodeChecks))
console.log("on-chain processCount", (await sdk.registry.getProcessCount()).toString())
console.log("graceParams", JSON.stringify(await sdk.registry.getGraceParams(), (k,v)=>typeof v==="bigint"?v.toString():v))
process.exit(0)
