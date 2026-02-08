import { expect } from "chai";
import { ethers } from "hardhat";
import { AgentRegistry } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("AgentRegistry", function () {
  let registry: AgentRegistry;
  let owner: SignerWithAddress;
  let other: SignerWithAddress;

  const USDT0 = "0xaf37E8B6C9ED7f6318979f56Fc287d76c30847ff";
  const CHART_CAP = ethers.keccak256(ethers.toUtf8Bytes("chart-generation"));
  const TRANSLATE_CAP = ethers.keccak256(ethers.toUtf8Bytes("translation"));

  beforeEach(async function () {
    [owner, other] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("AgentRegistry");
    registry = await Factory.deploy();
    await registry.waitForDeployment();
  });

  describe("Registration", function () {
    it("Should register an agent and emit events", async function () {
      const tx = await registry.registerAgent(
        "https://chart-agent.example.com",
        USDT0,
        1000,
        [CHART_CAP]
      );

      await expect(tx)
        .to.emit(registry, "AgentRegistered")
        .withArgs(0, owner.address, USDT0, "https://chart-agent.example.com", 1000);

      await expect(tx)
        .to.emit(registry, "AgentCapabilitySet")
        .withArgs(0, CHART_CAP, true);

      expect(await registry.nextAgentId()).to.equal(1);
    });

    it("Should return correct agent details via getAgent", async function () {
      await registry.registerAgent("https://example.com", USDT0, 2000, [CHART_CAP]);

      const [agentOwner, wallet, asset, endpoint, price, active] = await registry.getAgent(0);
      expect(agentOwner).to.equal(owner.address);
      expect(wallet).to.equal(owner.address);
      expect(asset).to.equal(USDT0);
      expect(endpoint).to.equal("https://example.com");
      expect(price).to.equal(2000);
      expect(active).to.be.true;
    });

    it("Should set initial capabilities", async function () {
      await registry.registerAgent("https://example.com", USDT0, 1000, [CHART_CAP, TRANSLATE_CAP]);

      expect(await registry.isCapable(0, CHART_CAP)).to.be.true;
      expect(await registry.isCapable(0, TRANSLATE_CAP)).to.be.true;
    });

    it("Should auto-increment agentId", async function () {
      await registry.registerAgent("https://a.com", USDT0, 100, []);
      await registry.registerAgent("https://b.com", USDT0, 200, []);

      const [, , , endpointA] = await registry.getAgent(0);
      const [, , , endpointB] = await registry.getAgent(1);
      expect(endpointA).to.equal("https://a.com");
      expect(endpointB).to.equal("https://b.com");
      expect(await registry.nextAgentId()).to.equal(2);
    });

    it("Should reject empty endpoint", async function () {
      await expect(
        registry.registerAgent("", USDT0, 1000, [])
      ).to.be.revertedWithCustomError(registry, "EndpointEmpty");
    });

    it("Should reject endpoint longer than 200 bytes", async function () {
      const longEndpoint = "https://" + "a".repeat(200);
      await expect(
        registry.registerAgent(longEndpoint, USDT0, 1000, [])
      ).to.be.revertedWithCustomError(registry, "EndpointTooLong");
    });
  });

  describe("Capabilities", function () {
    beforeEach(async function () {
      await registry.registerAgent("https://example.com", USDT0, 1000, [CHART_CAP]);
    });

    it("Should enable new capabilities", async function () {
      expect(await registry.isCapable(0, TRANSLATE_CAP)).to.be.false;

      const tx = await registry.enableCapabilities(0, [TRANSLATE_CAP]);
      await expect(tx)
        .to.emit(registry, "AgentCapabilitySet")
        .withArgs(0, TRANSLATE_CAP, true);

      expect(await registry.isCapable(0, TRANSLATE_CAP)).to.be.true;
    });

    it("Should not re-emit event for already enabled capability", async function () {
      const tx = await registry.enableCapabilities(0, [CHART_CAP]);
      await expect(tx).to.not.emit(registry, "AgentCapabilitySet");
    });

    it("Should disable capabilities", async function () {
      const tx = await registry.disableCapabilities(0, [CHART_CAP]);
      await expect(tx)
        .to.emit(registry, "AgentCapabilitySet")
        .withArgs(0, CHART_CAP, false);

      expect(await registry.isCapable(0, CHART_CAP)).to.be.false;
    });

    it("Should not re-emit event for already disabled capability", async function () {
      const tx = await registry.disableCapabilities(0, [TRANSLATE_CAP]);
      await expect(tx).to.not.emit(registry, "AgentCapabilitySet");
    });

    it("Should reject non-owner enable", async function () {
      await expect(
        registry.connect(other).enableCapabilities(0, [TRANSLATE_CAP])
      ).to.be.revertedWithCustomError(registry, "NotAgentOwner");
    });

    it("Should reject non-owner disable", async function () {
      await expect(
        registry.connect(other).disableCapabilities(0, [CHART_CAP])
      ).to.be.revertedWithCustomError(registry, "NotAgentOwner");
    });
  });

  describe("Deactivation", function () {
    beforeEach(async function () {
      await registry.registerAgent("https://example.com", USDT0, 1000, [CHART_CAP]);
    });

    it("Should deactivate an agent", async function () {
      const tx = await registry.deactivate(0);
      await expect(tx).to.emit(registry, "AgentDeactivated").withArgs(0);

      const [, , , , , active] = await registry.getAgent(0);
      expect(active).to.be.false;
    });

    it("Should reject non-owner deactivation", async function () {
      await expect(
        registry.connect(other).deactivate(0)
      ).to.be.revertedWithCustomError(registry, "NotAgentOwner");
    });
  });
});
