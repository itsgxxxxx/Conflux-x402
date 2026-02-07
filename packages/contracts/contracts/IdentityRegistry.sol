// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IdentityRegistry
 * @notice On-chain registry for domain-based client identities
 * @dev Only the ZK Verifier contract can register identities
 */
contract IdentityRegistry {
    struct Identity {
        bytes32 domainHash;
        uint64 issuedAt;
        uint64 expiresAt;
    }

    /// @notice Mapping from user address to their registered identity
    mapping(address => Identity) public identities;

    /// @notice Address of the ZK Verifier contract (only this can write)
    address public verifier;

    /// @notice Contract owner (can update verifier address)
    address public owner;

    event IdentityRegistered(
        address indexed user,
        bytes32 indexed domainHash,
        uint64 expiresAt
    );

    event VerifierUpdated(
        address indexed oldVerifier,
        address indexed newVerifier
    );

    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );

    error NotVerifier();
    error NotOwner();
    error ZeroAddress();
    error IdentityExpired();

    modifier onlyVerifier() {
        if (msg.sender != verifier) revert NotVerifier();
        _;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /**
     * @notice Set the ZK Verifier contract address
     * @param _verifier Address of the verifier contract
     */
    function setVerifier(address _verifier) external onlyOwner {
        if (_verifier == address(0)) revert ZeroAddress();
        emit VerifierUpdated(verifier, _verifier);
        verifier = _verifier;
    }

    /**
     * @notice Register a new identity (only callable by verifier)
     * @param user Address of the user
     * @param domainHash keccak256 hash of the domain
     * @param expiry Unix timestamp when identity expires
     */
    function register(
        address user,
        bytes32 domainHash,
        uint64 expiry
    ) external onlyVerifier {
        if (user == address(0)) revert ZeroAddress();

        identities[user] = Identity({
            domainHash: domainHash,
            issuedAt: uint64(block.timestamp),
            expiresAt: expiry
        });

        emit IdentityRegistered(user, domainHash, expiry);
    }

    /**
     * @notice Check if a user has a valid (non-expired) identity
     * @param user Address to check
     * @return bool True if user has valid identity
     */
    function isValid(address user) external view returns (bool) {
        Identity memory id = identities[user];
        return id.expiresAt > block.timestamp;
    }

    /**
     * @notice Get identity details for a user
     * @param user Address to query
     * @return domainHash The domain hash
     * @return issuedAt Timestamp when registered
     * @return expiresAt Timestamp when expires
     * @return valid Whether currently valid
     */
    function getIdentity(address user)
        external
        view
        returns (
            bytes32 domainHash,
            uint64 issuedAt,
            uint64 expiresAt,
            bool valid
        )
    {
        Identity memory id = identities[user];
        return (
            id.domainHash,
            id.issuedAt,
            id.expiresAt,
            id.expiresAt > block.timestamp
        );
    }

    /**
     * @notice Transfer ownership to a new address
     * @param newOwner Address of the new owner
     */
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}
