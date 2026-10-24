/* Generado por packages/wallet/scripts/compile-contracts.ts — NO editar a mano. */
/* Fuente: contracts/QuorumRegistry.sol · solc 0.8.38+commit.1835d247.Emscripten.clang · optimizer 200 runs · evm cancun */
export const registryAbi = [
  {
    "inputs": [],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "electionId",
        "type": "bytes32"
      }
    ],
    "name": "AlreadyAnchored",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "electionId",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "commitment",
        "type": "bytes32"
      }
    ],
    "name": "AlreadyCast",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotOrganizer",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ZeroValue",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "electionId",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "finalHash",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "castCount",
        "type": "uint256"
      }
    ],
    "name": "Anchored",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "electionId",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "commitment",
        "type": "bytes32"
      }
    ],
    "name": "Cast",
    "type": "event"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "electionId",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "finalHash",
        "type": "bytes32"
      }
    ],
    "name": "anchor",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "electionId",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "commitment",
        "type": "bytes32"
      }
    ],
    "name": "cast",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "name": "castCount",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "name": "finalHashOf",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "name": "isCast",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "organizer",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

export const registryBytecode = "0x60a0604052348015600e575f5ffd5b50336080526080516103be6100315f395f818160d4015261016001526103be5ff3fe608060405234801561000f575f5ffd5b506004361061005f575f3560e01c8062e410361461006357806334e455f9146100a257806361203265146100cf578063a21f3c6a1461010e578063ca43878014610123578063d322a52114610136575b5f5ffd5b61008d610071366004610351565b5f60208181529281526040808220909352908152205460ff1681565b60405190151581526020015b60405180910390f35b6100c16100b0366004610371565b60016020525f908152604090205481565b604051908152602001610099565b6100f67f000000000000000000000000000000000000000000000000000000000000000081565b6040516001600160a01b039091168152602001610099565b61012161011c366004610351565b610155565b005b610121610131366004610351565b610252565b6100c1610144366004610371565b60026020525f908152604090205481565b336001600160a01b037f0000000000000000000000000000000000000000000000000000000000000000161461019e576040516323d03a7160e21b815260040160405180910390fd5b8115806101a9575080155b156101c757604051637c946ed760e01b815260040160405180910390fd5b5f82815260026020526040902054156101fb576040516330d2381360e01b8152600481018390526024015b60405180910390fd5b5f82815260026020908152604080832084905560018252918290205482518481529182015283917f59848f28dc002d29725176b135eb44ae5a7b3512bf265f2056efd6780d5c4bfd91015b60405180910390a25050565b81158061025d575080155b1561027b57604051637c946ed760e01b815260040160405180910390fd5b5f82815260026020526040902054156102aa576040516330d2381360e01b8152600481018390526024016101f2565b5f8281526020818152604080832084845290915290205460ff16156102ec5760405163ac9b219760e01b815260048101839052602481018290526044016101f2565b5f828152602081815260408083208484528252808320805460ff19166001908117909155858452808352928190208054909301909255905182815283917f46adc4912184d61bbcd0939b961e9388a3fa9122b827b48b36fdf552759f3e7d9101610246565b5f5f60408385031215610362575f5ffd5b50508035926020909101359150565b5f60208284031215610381575f5ffd5b503591905056fea2646970667358221220d085ae947664c190d1cf6b1dbaf6dee8c7ab32c7eeb13fdc2dd9fe4d7c7abab664736f6c63430008260033" as const;

export const registrySourceSha256 = "5a8c135b552d171bc8085125e3b03d838f4e19ceba8c12c62c0dccc6780025c2" as const;
