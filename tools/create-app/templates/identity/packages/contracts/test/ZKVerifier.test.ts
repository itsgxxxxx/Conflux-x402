import { expect } from "chai";
import { ethers } from "hardhat";
import { ZKVerifier, IdentityRegistry } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("ZKVerifier", function () {
  let identityRegistry: IdentityRegistry;
  let zkVerifier: ZKVerifier;
  let owner: SignerWithAddress;
  let attestor: SignerWithAddress;
  let user: SignerWithAddress;
  let other: SignerWithAddress;

  beforeEach(async function () {
    [owner, attestor, user, other] = await ethers.getSigners();

    // Deploy IdentityRegistry
    const IdentityRegistryFactory = await ethers.getContractFactory("IdentityRegistry");
    identityRegistry = await IdentityRegistryFactory.deploy();
    await identityRegistry.waitForDeployment();

    // Deploy ZKVerifier
    const ZKVerifierFactory = await ethers.getContractFactory("ZKVerifier");
    zkVerifier = await ZKVerifierFactory.deploy(
      await identityRegistry.getAddress(),
      attestor.address
    );
    await zkVerifier.waitForDeployment();

    // Set verifier in registry
    await identityRegistry.setVerifier(await zkVerifier.getAddress());
  });

  describe("Deployment", function () {
    it("Should set the right registry", async function () {
      expect(await zkVerifier.registry()).to.equal(await identityRegistry.getAddress());
    });

    it("Should set the right attestor", async function () {
      expect(await zkVerifier.attestorPublicKey()).to.equal(attestor.address);
    });

    it("Should set the right owner", async function () {
      expect(await zkVerifier.owner()).to.equal(owner.address);
    });

    it("Should reject zero address registry", async function () {
      const ZKVerifierFactory = await ethers.getContractFactory("ZKVerifier");
      await expect(
        ZKVerifierFactory.deploy(ethers.ZeroAddress, attestor.address)
      ).to.be.revertedWithCustomError(zkVerifier, "ZeroAddress");
    });

    it("Should reject zero address attestor", async function () {
      const ZKVerifierFactory = await ethers.getContractFactory("ZKVerifier");
      await expect(
        ZKVerifierFactory.deploy(await identityRegistry.getAddress(), ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(zkVerifier, "ZeroAddress");
    });
  });

  describe("Attestor Management", function () {
    it("Should allow owner to update attestor", async function () {
      await expect(zkVerifier.setAttestor(other.address))
        .to.emit(zkVerifier, "AttestorUpdated")
        .withArgs(attestor.address, other.address);

      expect(await zkVerifier.attestorPublicKey()).to.equal(other.address);
    });

    it("Should reject zero address attestor", async function () {
      await expect(
        zkVerifier.setAttestor(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(zkVerifier, "ZeroAddress");
    });

    it("Should reject non-owner updating attestor", async function () {
      await expect(
        zkVerifier.connect(other).setAttestor(other.address)
      ).to.be.revertedWithCustomError(zkVerifier, "NotOwner");
    });
  });

  describe("Verify and Register", function () {
    const domain = "example.com";
    let domainHash: string;
    let expiry: number;

    beforeEach(async function () {
      domainHash = ethers.keccak256(ethers.toUtf8Bytes(domain));
      expiry = (await time.latest()) + 86400; // 1 day from now
    });

    async function signAttestation(
      signer: SignerWithAddress,
      userAddress: string,
      domainHash: string,
      expiry: number
    ): Promise<string> {
      // Get message hash
      const messageHash = ethers.solidityPackedKeccak256(
        ["address", "bytes32", "uint64"],
        [userAddress, domainHash, expiry]
      );

      // Sign with EIP-191 prefix
      const signature = await signer.signMessage(ethers.getBytes(messageHash));
      return signature;
    }

    it("Should verify valid attestation and register identity", async function () {
      const signature = await signAttestation(attestor, user.address, domainHash, expiry);

      await expect(
        zkVerifier.verifyAndRegister(user.address, domainHash, expiry, signature)
      )
        .to.emit(zkVerifier, "ProofVerified")
        .withArgs(user.address, domainHash, expiry)
        .and.to.emit(identityRegistry, "IdentityRegistered")
        .withArgs(user.address, domainHash, expiry);

      // Check identity was registered
      expect(await identityRegistry.isValid(user.address)).to.be.true;
      const [storedDomainHash, , storedExpiry] = await identityRegistry.getIdentity(user.address);
      expect(storedDomainHash).to.equal(domainHash);
      expect(storedExpiry).to.equal(expiry);
    });

    it("Should reject invalid signature", async function () {
      // Sign with wrong signer
      const signature = await signAttestation(other, user.address, domainHash, expiry);

      await expect(
        zkVerifier.verifyAndRegister(user.address, domainHash, expiry, signature)
      ).to.be.revertedWithCustomError(zkVerifier, "InvalidSignature");
    });

    it("Should reject expired claim", async function () {
      const pastExpiry = (await time.latest()) - 100;
      const signature = await signAttestation(attestor, user.address, domainHash, pastExpiry);

      await expect(
        zkVerifier.verifyAndRegister(user.address, domainHash, pastExpiry, signature)
      ).to.be.revertedWithCustomError(zkVerifier, "ExpiredClaim");
    });

    it("Should reject signature for wrong user", async function () {
      // Sign for user but submit for other
      const signature = await signAttestation(attestor, user.address, domainHash, expiry);

      await expect(
        zkVerifier.verifyAndRegister(other.address, domainHash, expiry, signature)
      ).to.be.revertedWithCustomError(zkVerifier, "InvalidSignature");
    });

    it("Should reject signature for wrong domain", async function () {
      const signature = await signAttestation(attestor, user.address, domainHash, expiry);
      const wrongDomainHash = ethers.keccak256(ethers.toUtf8Bytes("wrong.com"));

      await expect(
        zkVerifier.verifyAndRegister(user.address, wrongDomainHash, expiry, signature)
      ).to.be.revertedWithCustomError(zkVerifier, "InvalidSignature");
    });

    it("Should reject signature for wrong expiry", async function () {
      const signature = await signAttestation(attestor, user.address, domainHash, expiry);
      const wrongExpiry = expiry + 1000;

      await expect(
        zkVerifier.verifyAndRegister(user.address, domainHash, wrongExpiry, signature)
      ).to.be.revertedWithCustomError(zkVerifier, "InvalidSignature");
    });

    it("Should handle multiple registrations for same user", async function () {
      // First registration
      const signature1 = await signAttestation(attestor, user.address, domainHash, expiry);
      await zkVerifier.verifyAndRegister(user.address, domainHash, expiry, signature1);

      // Second registration with different domain
      const newDomainHash = ethers.keccak256(ethers.toUtf8Bytes("newdomain.com"));
      const newExpiry = expiry + 86400;
      const signature2 = await signAttestation(attestor, user.address, newDomainHash, newExpiry);

      await expect(
        zkVerifier.verifyAndRegister(user.address, newDomainHash, newExpiry, signature2)
      ).to.not.be.reverted;

      // Check updated identity
      const [storedDomainHash] = await identityRegistry.getIdentity(user.address);
      expect(storedDomainHash).to.equal(newDomainHash);
    });
  });

  describe("Helper Functions", function () {
    it("Should compute correct message hash", async function () {
      const domainHash = ethers.keccak256(ethers.toUtf8Bytes("example.com"));
      const expiry = 1740000000;

      const messageHash = await zkVerifier.getMessageHash(user.address, domainHash, expiry);
      const expectedHash = ethers.solidityPackedKeccak256(
        ["address", "bytes32", "uint64"],
        [user.address, domainHash, expiry]
      );

      expect(messageHash).to.equal(expectedHash);
    });

    it("Should compute correct Ethereum signed message hash", async function () {
      const messageHash = ethers.keccak256(ethers.toUtf8Bytes("test message"));
      const ethSignedHash = await zkVerifier.getEthSignedMessageHash(messageHash);

      const expectedHash = ethers.solidityPackedKeccak256(
        ["string", "bytes32"],
        ["\x19Ethereum Signed Message:\n32", messageHash]
      );

      expect(ethSignedHash).to.equal(expectedHash);
    });

    it("Should recover correct signer", async function () {
      const domainHash = ethers.keccak256(ethers.toUtf8Bytes("example.com"));
      const expiry = (await time.latest()) + 86400;

      const messageHash = ethers.solidityPackedKeccak256(
        ["address", "bytes32", "uint64"],
        [user.address, domainHash, expiry]
      );

      const signature = await attestor.signMessage(ethers.getBytes(messageHash));
      const ethSignedHash = await zkVerifier.getEthSignedMessageHash(messageHash);
      const recovered = await zkVerifier.recoverSigner(ethSignedHash, signature);

      expect(recovered).to.equal(attestor.address);
    });
  });

  describe("Ownership Transfer", function () {
    it("Should allow owner to transfer ownership", async function () {
      await zkVerifier.transferOwnership(other.address);
      expect(await zkVerifier.owner()).to.equal(other.address);
    });

    it("Should reject zero address", async function () {
      await expect(
        zkVerifier.transferOwnership(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(zkVerifier, "ZeroAddress");
    });

    it("Should reject non-owner transfer", async function () {
      await expect(
        zkVerifier.connect(other).transferOwnership(other.address)
      ).to.be.revertedWithCustomError(zkVerifier, "NotOwner");
    });
  });
});
