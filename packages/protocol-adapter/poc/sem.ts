import { Identity, Group, generateProof, verifyProof } from "@semaphore-protocol/core"
const t0 = Date.now()
const ids = [new Identity(), new Identity(), new Identity()]
const group = new Group(ids.map(i => i.commitment))
const scope = "quorum-election-1"
const proof = await generateProof(ids[0], group, "opcion-2", scope)
console.log("proof gen ms", Date.now() - t0, "depth", proof.merkleTreeDepth)
console.log("root", proof.merkleTreeRoot, "nullifier", proof.nullifier)
console.log("verify", await verifyProof(proof))
const p2 = await generateProof(ids[0], group, "opcion-1", scope)
console.log("same nullifier on double vote:", p2.nullifier === proof.nullifier)
const tampered = { ...proof, message: (BigInt(proof.message) + 1n).toString() }
console.log("tampered verify", await verifyProof(tampered as any))

process.exit(0)
