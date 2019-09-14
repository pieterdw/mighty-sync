#!/usr/bin/env node

import "babel-polyfill";
import chalk from "chalk";
import minimist from "minimist";
import path from "path";
import updateNotifier from "update-notifier";
import sync from "./sync";
import { HelpInfo } from "./types/HelpInfo";

const pkg = require("../package.json");

const opts: minimist.Opts = {
  boolean: ["watch", "nodelete", "verbose", "version", "help"],
  string: ["depth", "exclude"],
  alias: {
    help: "h",
    watch: "w",
    verbose: "v",
    depth: "d",
    exclude: "e"
  },
  default: {
    help: false,
    watch: false,
    nodelete: false,
    verbose: false,
    depth: Infinity,
    exclude: null
  },
  stopEarly: true,
  unknown: (option: string) => {
    // this function is triggered on first argument, we want to exclude this case
    if (option[0] !== "-") {
      return;
    }

    console.error(chalk.bold.red("Unknown option '" + option + "'"));
    help();
    process.exit(1);
    return false;
  }
};

const helpInfos: HelpInfo[] = [
  {
    key: "watch",
    description: "Watch changes in source and keep target in sync"
  },
  {
    key: "exclude",
    description:
      "Exclude certain files or folders from sync by using glob patterns",
    type: "string"
  },
  {
    key: "depth",
    description: "Maximum depth if you have performance issues",
    type: "number"
  },
  {
    key: "nodelete",
    description: "Prevent deleting extraneous files from target"
  },
  {
    key: "verbose",
    description: "More output"
  },
  {
    key: "version",
    description: "Show version"
  },
  {
    key: "help",
    description: "Show help"
  }
];

const notifyPriority = {
  error: "high",
  copy: "normal",
  remove: "normal",
  watch: "normal",
  "max-depth": "low",
  nodelete: "low"
};

const help = () => {
  console.log("%s %s", chalk.bold(pkg.name), chalk.cyan(pkg.version));
  console.log(pkg.description);
  console.log("");
  console.log(
    "Usage:\t" +
      chalk.bold(pkg.name) +
      " [" +
      chalk.blue("options") +
      "] <" +
      chalk.yellow("source") +
      "> <" +
      chalk.yellow("target") +
      ">"
  );
  console.log(
    "\t%s is a file or folder which content will be mirrored to %s",
    chalk.yellow("source"),
    chalk.yellow("target")
  );
  console.log("");
  helpInfos.forEach(helpInfo => {
    let typeInfo = helpInfo.type ? "=<" + helpInfo.type + ">" : "";
    let key = chalk.blue("--" + helpInfo.key) + typeInfo;
    const aliases = opts.alias[helpInfo.key];
    if (aliases) {
      const aliasArray = Array.isArray(aliases) ? aliases : [aliases];
      key += aliasArray.map(a => ", " + chalk.blue("-" + a) + typeInfo).join();
    }
    console.log(key);
    console.log("\t%s", helpInfo.description);
    console.log("");
  });
};

const argv = minimist(process.argv.slice(2), opts);

if (argv.help) {
  help();
  process.exit(0);
}

if (argv.version) {
  console.log(pkg.version);
  process.exit(0);
}

if (argv._.length !== 2) {
  console.error(
    chalk.bold.red(
      "Expects exactly two arguments, received " +
        argv._.length +
        ". Make sure to place all optional arguments before the source and target."
    )
  );
  help();
  process.exit(1);
}

updateNotifier({ pkg: pkg }).notify();

const root = process.cwd();

const source = path.resolve(argv._[0]);
const target = path.resolve(argv._[1]);

const exclude: string[] = Array.isArray(argv.exclude)
  ? argv.exclude
  : [argv.exclude];

sync(
  source,
  target,
  {
    watch: argv.watch,
    delete: !argv.nodelete,
    depth: Number(argv.depth),
    exclude: exclude
  },
  (event, data) => {
    const priority = notifyPriority[event] || "low";

    if (!argv.verbose && priority === "low") {
      return;
    }

    switch (event) {
      case "error":
        console.error(chalk.bold.red(data.message || data));
        process.exit(data.code || 2);
        break;

      case "copy":
        console.log(
          "%s %s to %s",
          chalk.bold("COPY"),
          chalk.yellow(path.relative(root, data[0])),
          chalk.yellow(path.relative(root, data[1]))
        );
        break;

      case "remove":
        console.log(
          "%s %s",
          chalk.bold("DELETE"),
          chalk.yellow(path.relative(root, data))
        );
        break;

      case "watch":
        console.log(
          "%s %s",
          chalk.bold("WATCHING"),
          chalk.yellow(path.relative(root, data))
        );
        break;

      case "max-depth":
        console.log(
          "%s: %s too deep",
          chalk.bold.dim("MAX-DEPTH"),
          chalk.yellow(path.relative(root, data))
        );
        break;

      case "nodelete":
        console.log(
          "%s: %s extraneous but not deleted (use %s)",
          chalk.bold.dim("IGNORED"),
          chalk.yellow(path.relative(root, data)),
          chalk.blue("--delete")
        );
        break;

      // Fallback: forgotten logs, displayed only in verbose mode
      default:
        if (argv.verbose) {
          console.log(event, data);
        }
    }
  }
);
