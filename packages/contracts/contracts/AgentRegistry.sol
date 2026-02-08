// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title AgentRegistry
 * @notice On-chain registry for x402 service agents
 * @dev Discovery is event-driven; no on-chain capability index arrays.
 *      Agents subscribe to events and maintain their own local index.
 */
contract AgentRegistry {
    struct Agent {
        address owner;
        address wallet;
        address asset;
        string endpoint;
        uint256 price;
        bool active;
    }

    mapping(uint256 => Agent) internal _agents;
    mapping(uint256 => mapping(bytes32 => bool)) public hasCapability;
    uint256 public nextAgentId;

    event AgentRegistered(
        uint256 indexed agentId,
        address indexed wallet,
        address asset,
        string endpoint,
        uint256 price
    );

    event AgentCapabilitySet(
        uint256 indexed agentId,
        bytes32 indexed capabilityId,
        bool enabled
    );

    event AgentDeactivated(uint256 indexed agentId);

    error NotAgentOwner();
    error EndpointEmpty();
    error EndpointTooLong();

    modifier onlyAgentOwner(uint256 agentId) {
        if (_agents[agentId].owner != msg.sender) revert NotAgentOwner();
        _;
    }

    /**
     * @notice Register a new agent
     * @param endpoint HTTPS endpoint URL (max 200 bytes)
     * @param asset Payment token contract address
     * @param price Price in raw token units
     * @param initialCaps Initial capability IDs
     * @return agentId The assigned agent ID
     */
    function registerAgent(
        string calldata endpoint,
        address asset,
        uint256 price,
        bytes32[] calldata initialCaps
    ) external returns (uint256 agentId) {
        if (bytes(endpoint).length == 0) revert EndpointEmpty();
        if (bytes(endpoint).length > 200) revert EndpointTooLong();

        agentId = nextAgentId++;

        _agents[agentId] = Agent({
            owner: msg.sender,
            wallet: msg.sender,
            asset: asset,
            endpoint: endpoint,
            price: price,
            active: true
        });

        emit AgentRegistered(agentId, msg.sender, asset, endpoint, price);

        for (uint256 i = 0; i < initialCaps.length; i++) {
            hasCapability[agentId][initialCaps[i]] = true;
            emit AgentCapabilitySet(agentId, initialCaps[i], true);
        }
    }

    /**
     * @notice Enable capabilities for an agent
     * @param agentId The agent to modify
     * @param caps Capability IDs to enable
     */
    function enableCapabilities(
        uint256 agentId,
        bytes32[] calldata caps
    ) external onlyAgentOwner(agentId) {
        for (uint256 i = 0; i < caps.length; i++) {
            if (!hasCapability[agentId][caps[i]]) {
                hasCapability[agentId][caps[i]] = true;
                emit AgentCapabilitySet(agentId, caps[i], true);
            }
        }
    }

    /**
     * @notice Disable capabilities for an agent
     * @param agentId The agent to modify
     * @param caps Capability IDs to disable
     */
    function disableCapabilities(
        uint256 agentId,
        bytes32[] calldata caps
    ) external onlyAgentOwner(agentId) {
        for (uint256 i = 0; i < caps.length; i++) {
            if (hasCapability[agentId][caps[i]]) {
                hasCapability[agentId][caps[i]] = false;
                emit AgentCapabilitySet(agentId, caps[i], false);
            }
        }
    }

    /**
     * @notice Deactivate an agent
     * @param agentId The agent to deactivate
     */
    function deactivate(uint256 agentId) external onlyAgentOwner(agentId) {
        _agents[agentId].active = false;
        emit AgentDeactivated(agentId);
    }

    /**
     * @notice Get agent details
     * @param agentId The agent to query
     */
    function getAgent(uint256 agentId)
        external
        view
        returns (
            address owner,
            address wallet,
            address asset,
            string memory endpoint,
            uint256 price,
            bool active
        )
    {
        Agent storage a = _agents[agentId];
        return (a.owner, a.wallet, a.asset, a.endpoint, a.price, a.active);
    }

    /**
     * @notice Check if an agent has a specific capability
     * @param agentId The agent to check
     * @param capabilityId The capability to check
     */
    function isCapable(
        uint256 agentId,
        bytes32 capabilityId
    ) external view returns (bool) {
        return hasCapability[agentId][capabilityId];
    }
}
