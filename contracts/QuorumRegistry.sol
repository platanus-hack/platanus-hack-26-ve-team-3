// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title QuorumRegistry
/// @notice Registro mínimo de Quórum en Base Sepolia.
///  - `cast` registra un compromiso opaco de boleta (hash de la entrada del ledger o nullifier Semaphore),
///    NUNCA la opción en claro. Un mismo compromiso no puede registrarse dos veces por elección.
///  - `anchor` fija, una sola vez y solo por el organizador, el hash final del ledger de una elección;
///    después de anclar no se aceptan más `cast` para esa elección.
/// @dev Advertencia de privacidad: el remitente de la transacción (EOA o smart account) es público.
///  Si `commitment` puede relacionarse con la opción en el ledger público, enviar `cast` desde la wallet
///  ligada a la identidad del votante enlaza wallet -> boleta. Ver docs/WALLETS.md.
///  Este contrato no verifica pruebas ni elegibilidad: eso lo hace el verificador off-chain (ADR-001).
contract QuorumRegistry {
    address public immutable organizer;

    /// electionId => commitment => registrado
    mapping(bytes32 => mapping(bytes32 => bool)) public isCast;
    /// electionId => número de compromisos registrados
    mapping(bytes32 => uint256) public castCount;
    /// electionId => hash final anclado (0 si no se ha anclado)
    mapping(bytes32 => bytes32) public finalHashOf;

    event Cast(bytes32 indexed electionId, bytes32 commitment);
    event Anchored(bytes32 indexed electionId, bytes32 finalHash, uint256 castCount);

    error ZeroValue();
    error AlreadyCast(bytes32 electionId, bytes32 commitment);
    error AlreadyAnchored(bytes32 electionId);
    error NotOrganizer();

    constructor() {
        organizer = msg.sender;
    }

    function cast(bytes32 electionId, bytes32 commitment) external {
        if (electionId == bytes32(0) || commitment == bytes32(0)) revert ZeroValue();
        if (finalHashOf[electionId] != bytes32(0)) revert AlreadyAnchored(electionId);
        if (isCast[electionId][commitment]) revert AlreadyCast(electionId, commitment);
        isCast[electionId][commitment] = true;
        unchecked {
            castCount[electionId] += 1;
        }
        emit Cast(electionId, commitment);
    }

    function anchor(bytes32 electionId, bytes32 finalHash) external {
        if (msg.sender != organizer) revert NotOrganizer();
        if (electionId == bytes32(0) || finalHash == bytes32(0)) revert ZeroValue();
        if (finalHashOf[electionId] != bytes32(0)) revert AlreadyAnchored(electionId);
        finalHashOf[electionId] = finalHash;
        emit Anchored(electionId, finalHash, castCount[electionId]);
    }
}
