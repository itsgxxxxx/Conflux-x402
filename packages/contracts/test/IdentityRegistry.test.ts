import { expect } from "chai";
import { ethers } from "hardhat";
import { IdentityRegistry } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("IdentityRegistry", function () {
  let identityRegistry: IdentityRegistry;
  let owner: SignerWithAddress;
  let verifier: SignerWithAddress;
  let user: SignerWithAddress;
  let other: SignerWithAddress;

  beforeEach(async function () {
    [owner, verifier, user, other] = await ethers.getSigners();

    const IdentityRegistryFactory = await ethers.getContractFactory("IdentityRegistry");
    identityRegistry = await IdentityRegistryFactory.deploy();
    await identityRegistry.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await identityRegistry.owner()).to.equal(owner.address);
    });

    it("Should not have a verifier set initially", async function () {
      expect(await identityRegistry.verifier()).to.equal(ethers.ZeroAddress);
    });
  });

  describe("Verifier Management", function () {
    it("Should allow owner to set verifier", async function () {
      await expect(identityRegistry.setVerifier(verifier.address))
        .to.emit(identityRegistry, "VerifierUpdated")
        .withArgs(ethers.ZeroAddress, verifier.address);

      expect(await identityRegistry.verifier()).to.equal(verifier.address);
    });

    it("Should reject zero address as verifier", async function () {
      await expect(
        identityRegistry.setVerifier(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(identityRegistry, "ZeroAddress");
    });

    it("Should reject non-owner setting verifier", async function () {
      await expect(
        identityRegistry.connect(other).setVerifier(verifier.address)
      ).to.be.revertedWithCustomError(identityRegistry, "NotOwner");
    });
  });

  describe("Identity Registration", function () {
    const domainHash = ethers.keccak256(ethers.toUtf8Bytes("example.com"));
    let expiry: number;

    beforeEach(async function () {
      await identityRegistry.setVerifier(verifier.address);
      expiry = (await time.latest()) + 86400; // 1 day from now
    });

    it("Should allow verifier to register identity", async function () {
      await expect(
        identityRegistry.connect(verifier).register(user.address, domainHash, expiry)
      )
        .to.emit(identityRegistry, "IdentityRegistered")
        .withArgs(user.address, domainHash, expiry);

      const identity = await identityRegistry.identities(user.address);
      expect(identity.domainHash).to.equal(domainHash);
      expect(identity.expiresAt).to.equal(expiry);
    });

    it("Should reject zero address user", async function () {
      await expect(
        identityRegistry.connect(verifier).register(ethers.ZeroAddress, domainHash, expiry)
      ).to.be.revertedWithCustomError(identityRegistry, "ZeroAddress");
    });

    it("Should reject non-verifier registration", async function () {
      await expect(
        identityRegistry.connect(other).register(user.address, domainHash, expiry)
      ).to.be.revertedWithCustomError(identityRegistry, "NotVerifier");
    });

    it("Should allow updating existing identity", async function () {
      // Register first time
      await identityRegistry.connect(verifier).register(user.address, domainHash, expiry);

      // Update with new domain
      const newDomainHash = ethers.keccak256(ethers.toUtf8Bytes("newdomain.com"));
      const newExpiry = expiry + 86400;

      await identityRegistry.connect(verifier).register(user.address, newDomainHash, newExpiry);

      const identity = await identityRegistry.identities(user.address);
      expect(identity.domainHash).to.equal(newDomainHash);
      expect(identity.expiresAt).to.equal(newExpiry);
    });
  });

  describe("Identity Validation", function () {
    const domainHash = ethers.keccak256(ethers.toUtf8Bytes("example.com"));

    beforeEach(async function () {
      await identityRegistry.setVerifier(verifier.address);
    });

    it("Should return true for valid non-expired identity", async function () {
      const expiry = (await time.latest()) + 86400;
      await identityRegistry.connect(verifier).register(user.address, domainHash, expiry);

      expect(await identityRegistry.isValid(user.address)).to.be.true;
    });

    it("Should return false for expired identity", async function () {
      const expiry = (await time.latest()) + 100; // 100 seconds
      await identityRegistry.connect(verifier).register(user.address, domainHash, expiry);

      // Fast forward time
      await time.increase(101);

      expect(await identityRegistry.isValid(user.address)).to.be.false;
    });

    it("Should return false for unregistered address", async function () {
      expect(await identityRegistry.isValid(other.address)).to.be.false;
    });
  });

  describe("Get Identity", function () {
    const domainHash = ethers.keccak256(ethers.toUtf8Bytes("example.com"));

    beforeEach(async function () {
      await identityRegistry.setVerifier(verifier.address);
    });

    it("Should return complete identity details", async function () {
      const expiry = (await time.latest()) + 86400;
      await identityRegistry.connect(verifier).register(user.address, domainHash, expiry);

      const [returnedDomainHash, issuedAt, returnedExpiry, valid] =
        await identityRegistry.getIdentity(user.address);

      expect(returnedDomainHash).to.equal(domainHash);
      expect(returnedExpiry).to.equal(expiry);
      expect(valid).to.be.true;
      expect(issuedAt).to.be.greaterThan(0);
    });

    it("Should return invalid status for expired identity", async function () {
      const expiry = (await time.latest()) + 100;
      await identityRegistry.connect(verifier).register(user.address, domainHash, expiry);

      await time.increase(101);

      const [, , , valid] = await identityRegistry.getIdentity(user.address);
      expect(valid).to.be.false;
    });
  });

  describe("Ownership Transfer", function () {
    it("Should allow owner to transfer ownership", async function () {
      await expect(identityRegistry.transferOwnership(other.address))
        .to.emit(identityRegistry, "OwnershipTransferred")
        .withArgs(owner.address, other.address);

      expect(await identityRegistry.owner()).to.equal(other.address);
    });

    it("Should reject zero address", async function () {
      await expect(
        identityRegistry.transferOwnership(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(identityRegistry, "ZeroAddress");
    });

    it("Should reject non-owner transfer", async function () {
      await expect(
        identityRegistry.connect(other).transferOwnership(other.address)
      ).to.be.revertedWithCustomError(identityRegistry, "NotOwner");
    });

    it("New owner should be able to set verifier", async function () {
      await identityRegistry.transferOwnership(other.address);
      await expect(
        identityRegistry.connect(other).setVerifier(verifier.address)
      ).to.not.be.reverted;
    });
  });
});
