import { createWalletClient, createPublicClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { confluxESpace } from "@{{PROJECT_NAME}}/chain-config";
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

interface SubmitOptions {
  signature: string;
  domainHash: string;
  expiry: string;
  address?: string;
  verifier?: string;
  rpc: string;
}

export async function submit(options: SubmitOptions) {
  console.log(chalk.bold("\n📤 Submit Identity Proof\n"));

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

    if (!options.verifier) {
      console.error(chalk.red("❌ ZK_VERIFIER_ADDRESS not set"));
      console.log(chalk.yellow("\nUse --verifier flag or set ZK_VERIFIER_ADDRESS in .env"));
      process.exit(1);
    }

    console.log(chalk.cyan("User Address:"), userAddress);
    console.log(chalk.cyan("Domain Hash:"), options.domainHash);
    console.log(chalk.cyan("Expiry:"), new Date(parseInt(options.expiry) * 1000).toISOString());
    console.log(chalk.cyan("Verifier:"), options.verifier);
    console.log();

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
        options.domainHash as Hex,
        BigInt(options.expiry),
        options.signature as Hex,
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
    console.log(chalk.bold(`  ${new Date(parseInt(options.expiry) * 1000).toISOString()}`));
    console.log();
  } catch (error) {
    spinner.fail(chalk.red("Submission failed"));
    console.error(error);
    process.exit(1);
  }
}
