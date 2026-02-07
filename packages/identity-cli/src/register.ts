import { createWalletClient, createPublicClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { confluxESpace } from "@conflux-x402/chain-config";
import ora from "ora";
import chalk from "chalk";

const ZK_VERIFIER_ABI = [
  {
    inputs: [
      { internalType: "address", name: "userAddress", type: "address" },
      { internalType: "bytes32", name: "domainHash", type: "bytes32" },
      { internalType: "uint64", name: "expiry", type: "uint64" },
      { internalType: "bytes", name: "signature", type: "bytes" },
    ],
    name: "verifyAndRegister",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

interface RegisterOptions {
  domain: string;
  address?: string;
  attestor: string;
  rpc: string;
  registry?: string;
  verifier?: string;
}

export async function register(options: RegisterOptions) {
  console.log(chalk.bold("\n🎫 x402 Identity Registration\n"));

  const spinner = ora();

  try {
    // Get user address
    let userAddress: string;
    if (options.address) {
      userAddress = options.address;
    } else {
      const privateKey = process.env.CLIENT_PRIVATE_KEY as Hex;
      if (!privateKey) {
        console.error(chalk.red("❌ CLIENT_PRIVATE_KEY not set in environment"));
        process.exit(1);
      }
      const account = privateKeyToAccount(privateKey);
      userAddress = account.address;
    }

    console.log(chalk.cyan("Domain:"), options.domain);
    console.log(chalk.cyan("Address:"), userAddress);
    console.log(chalk.cyan("Attestor:"), options.attestor);
    console.log();

    // Step 1: Get challenge from attestor
    spinner.start("Requesting challenge from attestor...");
    const challengeRes = await fetch(`${options.attestor}/challenge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: userAddress,
        domain: options.domain,
      }),
    });

    if (!challengeRes.ok) {
      const error = await challengeRes.text();
      spinner.fail(chalk.red("Failed to get challenge"));
      console.error(error);
      process.exit(1);
    }

    const challengeData = await challengeRes.json();
    spinner.succeed(chalk.green("Challenge received"));

    console.log();
    console.log(chalk.yellow("📝 Setup Instructions:"));
    console.log();
    console.log(`  1. Set up your domain to respond to verification requests:`);
    console.log(`     ${chalk.bold(challengeData.instructions)}`);
    console.log();
    console.log(`  2. The endpoint should return exactly:`);
    console.log(`     ${chalk.bold(challengeData.challenge)}`);
    console.log();
    console.log(`  3. You can use the 'serve' command to test:`);
    console.log(
      `     ${chalk.gray(`x402-identity serve --challenge "${challengeData.challenge}" --port 8080`)}`
    );
    console.log();
    console.log(chalk.yellow(`⏰ Challenge expires in: ${challengeData.expiresIn}`));
    console.log();

    // Ask user to confirm
    const readline = await import("readline");
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const proceed = await new Promise<boolean>((resolve) => {
      rl.question(
        chalk.cyan("Have you set up the endpoint? (yes/no): "),
        (answer) => {
          rl.close();
          resolve(answer.toLowerCase() === "yes" || answer.toLowerCase() === "y");
        }
      );
    });

    if (!proceed) {
      console.log(chalk.yellow("\n⏸️  Registration cancelled"));
      process.exit(0);
    }

    // Step 2: Request attestation (which will verify the endpoint)
    spinner.start("Verifying domain ownership...");
    const attestRes = await fetch(`${options.attestor}/attest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: userAddress,
        domain: options.domain,
      }),
    });

    if (!attestRes.ok) {
      const error = await attestRes.json();
      spinner.fail(chalk.red("Domain verification failed"));
      console.error(chalk.red(error.message || error.error));
      if (error.challenge) {
        console.log(chalk.yellow(`\nYour challenge code: ${error.challenge}`));
      }
      process.exit(1);
    }

    const attestation = await attestRes.json();
    spinner.succeed(chalk.green("Domain verified"));

    console.log(chalk.gray(`  Domain Hash: ${attestation.domainHash}`));
    console.log(
      chalk.gray(`  Expiry: ${new Date(attestation.expiry * 1000).toISOString()}`)
    );

    // Step 3: Submit proof to on-chain verifier
    if (!options.verifier) {
      console.log();
      console.log(chalk.yellow("⚠️  ZK_VERIFIER_ADDRESS not set"));
      console.log(chalk.gray("Attestation received but not submitted on-chain"));
      console.log();
      console.log(chalk.cyan("Attestation details:"));
      console.log(JSON.stringify(attestation, null, 2));
      return;
    }

    spinner.start("Submitting proof to blockchain...");

    const privateKey = process.env.CLIENT_PRIVATE_KEY as Hex;
    if (!privateKey) {
      spinner.fail(chalk.red("CLIENT_PRIVATE_KEY required for on-chain submission"));
      process.exit(1);
    }

    const account = privateKeyToAccount(privateKey);
    const client = createWalletClient({
      account,
      chain: confluxESpace,
      transport: http(options.rpc),
    });

    const publicClient = createPublicClient({
      chain: confluxESpace,
      transport: http(options.rpc),
    });

    const hash = await client.writeContract({
      address: options.verifier as Hex,
      abi: ZK_VERIFIER_ABI,
      functionName: "verifyAndRegister",
      args: [
        userAddress as Hex,
        attestation.domainHash as Hex,
        BigInt(attestation.expiry),
        attestation.signature as Hex,
      ],
    });

    spinner.text = `Transaction submitted: ${hash}`;

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status === "success") {
      spinner.succeed(chalk.green("Identity registered on-chain!"));
      console.log(chalk.gray(`  Transaction: ${hash}`));
      console.log(chalk.gray(`  Block: ${receipt.blockNumber}`));
    } else {
      spinner.fail(chalk.red("Transaction failed"));
      console.log(chalk.gray(`  Transaction: ${hash}`));
      process.exit(1);
    }

    console.log();
    console.log(chalk.green.bold("✨ Registration complete!"));
    console.log();
    console.log(chalk.cyan("Your identity is now registered and valid until:"));
    console.log(chalk.bold(`  ${new Date(attestation.expiry * 1000).toISOString()}`));
    console.log();
  } catch (error) {
    spinner.fail(chalk.red("Registration failed"));
    console.error(error);
    process.exit(1);
  }
}
