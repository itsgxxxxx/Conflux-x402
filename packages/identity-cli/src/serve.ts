import { createServer } from "http";
import { parse } from "url";
import chalk from "chalk";

interface ServeOptions {
  challenge: string;
  port: string;
}

export async function serve(options: ServeOptions) {
  const port = parseInt(options.port, 10);

  console.log(chalk.bold("\n🌐 Starting verification endpoint server\n"));
  console.log(chalk.cyan("Challenge:"), options.challenge);
  console.log(chalk.cyan("Port:"), port);
  console.log();

  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url || "", true);

    // Log the request
    console.log(
      chalk.gray(`[${new Date().toISOString()}]`),
      chalk.cyan(req.method),
      parsedUrl.pathname,
      parsedUrl.search ? chalk.gray(parsedUrl.search) : ""
    );

    // Only respond to /verify endpoint
    if (parsedUrl.pathname === "/verify") {
      res.writeHead(200, {
        "Content-Type": "text/plain",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(options.challenge);
      console.log(chalk.green("  ✓ Responded with challenge"));
    } else {
      res.writeHead(404);
      res.end("Not Found");
      console.log(chalk.red("  ✗ Not Found"));
    }
  });

  server.listen(port, () => {
    console.log(chalk.green.bold(`✅ Server running at http://localhost:${port}\n`));
    console.log(chalk.yellow("Verification endpoint:"));
    console.log(chalk.bold(`  http://localhost:${port}/verify?address=<ADDRESS>\n`));
    console.log(chalk.gray("Press Ctrl+C to stop"));
  });

  // Handle shutdown
  process.on("SIGINT", () => {
    console.log(chalk.yellow("\n\n⏹️  Shutting down server..."));
    server.close(() => {
      console.log(chalk.gray("Server stopped"));
      process.exit(0);
    });
  });
}
