// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IdentityRegistry.sol";

/**
 * @title ZKVerifier
 * @notice Simplified verifier for PoC - verifies attestor signatures directly
 * @dev In production, this would verify ZK proofs generated from circom-ecdsa circuit
 *
 * Current implementation: Direct ECDSA signature verification
 * Future implementation: Groth16/Plonk proof verification using circom-ecdsa
 */
contract ZKVerifier {
    IdentityRegistry public registry;
    address public attestorPublicKey;
    address public owner;

    event ProofVerified(
        address indexed user,
        bytes32 indexed domainHash,
        uint64 expiry
    );

    event AttestorUpdated(
        address indexed oldAttestor,
        address indexed newAttestor
    );

    error InvalidSignature();
    error NotOwner();
    error ZeroAddress();
    error ExpiredClaim();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address _registry, address _attestorPublicKey) {
        if (_registry == address(0) || _attestorPublicKey == address(0)) {
            revert ZeroAddress();
        }
        registry = IdentityRegistry(_registry);
        attestorPublicKey = _attestorPublicKey;
        owner = msg.sender;
    }

    /**
     * @notice Update attestor public key
     * @param _attestorPublicKey New attestor address
     */
    function setAttestor(address _attestorPublicKey) external onlyOwner {
        if (_attestorPublicKey == address(0)) revert ZeroAddress();
        emit AttestorUpdated(attestorPublicKey, _attestorPublicKey);
        attestorPublicKey = _attestorPublicKey;
    }

    /**
     * @notice Verify attestation and register identity (simplified for PoC)
     * @param userAddress Address claiming the identity
     * @param domainHash keccak256 of the domain
     * @param expiry Expiration timestamp
     * @param signature Attestor's ECDSA signature
     *
     * @dev In production, this would accept ZK proof instead of raw signature
     */
    function verifyAndRegister(
        address userAddress,
        bytes32 domainHash,
        uint64 expiry,
        bytes calldata signature
    ) external {
        // Check expiry
        if (expiry <= block.timestamp) revert ExpiredClaim();

        // Construct message hash (EIP-191 format)
        bytes32 messageHash = getMessageHash(userAddress, domainHash, expiry);
        bytes32 ethSignedMessageHash = getEthSignedMessageHash(messageHash);

        // Recover signer from signature
        address recoveredSigner = recoverSigner(ethSignedMessageHash, signature);

        // Verify signature is from attestor
        if (recoveredSigner != attestorPublicKey) revert InvalidSignature();

        // Register identity in registry
        registry.register(userAddress, domainHash, expiry);

        emit ProofVerified(userAddress, domainHash, expiry);
    }

    /**
     * @notice Get message hash for signing
     * @param userAddress User's address
     * @param domainHash Domain hash
     * @param expiry Expiration timestamp
     * @return bytes32 Message hash
     */
    function getMessageHash(
        address userAddress,
        bytes32 domainHash,
        uint64 expiry
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(userAddress, domainHash, expiry));
    }

    /**
     * @notice Get Ethereum signed message hash
     * @param messageHash Original message hash
     * @return bytes32 Ethereum signed message hash
     */
    function getEthSignedMessageHash(bytes32 messageHash)
        public
        pure
        returns (bytes32)
    {
        return keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)
        );
    }

    /**
     * @notice Recover signer address from signature
     * @param ethSignedMessageHash The hash to verify
     * @param signature The signature bytes
     * @return address The recovered signer address
     */
    function recoverSigner(
        bytes32 ethSignedMessageHash,
        bytes memory signature
    ) public pure returns (address) {
        require(signature.length == 65, "Invalid signature length");

        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }

        return ecrecover(ethSignedMessageHash, v, r, s);
    }

    /**
     * @notice Transfer ownership to a new address
     * @param newOwner Address of the new owner
     */
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        owner = newOwner;
    }
}
