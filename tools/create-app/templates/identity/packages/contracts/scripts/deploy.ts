import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("🚀 Deploying Identity Gating Contracts...\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "CFX\n");

  // Get attestor address from environment
  const attestorPrivateKey = process.env.ATTESTOR_PRIVATE_KEY;
  if (!attestorPrivateKey) {
    throw new Error("ATTESTOR_PRIVATE_KEY not set in environment");
  }

  const attestorWallet = new ethers.Wallet(attestorPrivateKey);
  const attestorAddress = attestorWallet.address;
  console.log("Attestor address:", attestorAddress, "\n");

  // Deploy IdentityRegistry
  console.log("📝 Deploying IdentityRegistry...");
  const IdentityRegistryFactory = await ethers.getContractFactory("IdentityRegistry");
  const identityRegistry = await IdentityRegistryFactory.deploy();
  await identityRegistry.waitForDeployment();
  const registryAddress = await identityRegistry.getAddress();
  console.log("✅ IdentityRegistry deployed to:", registryAddress);

  // Deploy ZKVerifier
  console.log("\n📝 Deploying ZKVerifier...");
  const ZKVerifierFactory = await ethers.getContractFactory("ZKVerifier");
  const zkVerifier = await ZKVerifierFactory.deploy(registryAddress, attestorAddress);
  await zkVerifier.waitForDeployment();
  const verifierAddress = await zkVerifier.getAddress();
  console.log("✅ ZKVerifier deployed to:", verifierAddress);

  // Link contracts
  console.log("\n🔗 Linking contracts...");
  const setVerifierTx = await identityRegistry.setVerifier(verifierAddress);
  await setVerifierTx.wait();
  console.log("✅ ZKVerifier set as verifier in IdentityRegistry");

  // Verify configuration
  console.log("\n🔍 Verifying deployment...");
  const registryOwner = await identityRegistry.owner();
  const registryVerifier = await identityRegistry.verifier();
  const verifierAttestor = await zkVerifier.attestorPublicKey();
  const verifierRegistry = await zkVerifier.registry();

  console.log("\nIdentityRegistry:");
  console.log("  - Address:", registryAddress);
  console.log("  - Owner:", registryOwner);
  console.log("  - Verifier:", registryVerifier);

  console.log("\nZKVerifier:");
  console.log("  - Address:", verifierAddress);
  console.log("  - Registry:", verifierRegistry);
  console.log("  - Attestor:", verifierAttestor);

  // Save deployment info
  const deploymentInfo = {
    network: (await ethers.provider.getNetwork()).name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      identityRegistry: {
        address: registryAddress,
        owner: registryOwner,
        verifier: registryVerifier,
      },
      zkVerifier: {
        address: verifierAddress,
        registry: verifierRegistry,
        attestor: verifierAttestor,
      },
    },
  };

  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const filename = `deployment-${Date.now()}.json`;
  const filepath = path.join(deploymentsDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(deploymentInfo, null, 2));

  // Also save as latest
  const latestPath = path.join(deploymentsDir, "latest.json");
  fs.writeFileSync(latestPath, JSON.stringify(deploymentInfo, null, 2));

  console.log("\n💾 Deployment info saved to:");
  console.log("  -", filepath);
  console.log("  -", latestPath);

  console.log("\n✨ Deployment complete!\n");

  console.log("📋 Environment variables for facilitator:");
  console.log(`IDENTITY_REGISTRY_ADDRESS=${registryAddress}`);
  console.log(`REQUIRE_IDENTITY=true`);

  console.log("\n📋 Attestor service configuration:");
  console.log(`ATTESTOR_PRIVATE_KEY=${attestorPrivateKey}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
