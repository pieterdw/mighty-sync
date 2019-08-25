#!/usr/bin/env node

import "babel-polyfill";
import chalk from "chalk";
import fs from "fs";
import minimist from "minimist";
import path from "path";
import updateNotifier from "update-notifier";
import sync from "./sync";

let pkg;
if (fs.existsSync("../package.json")) {
  pkg = require("../package.json");
} else {
  pkg = require("./package.json");
}

var opts: minimist.Opts = {
  boolean: ["help", "delete", "watch", "version", "verbose", "notify-update"],
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
    delete: true,
    verbose: false,
    "notify-update": true,
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

var helpInfo = {
  help: "Show help and exit",
  delete: "Delete extraneous files from target",
  watch: "Watch changes in source and keep target in sync",
  version: "Show version and exit",
  verbose: "Moar output",
  "notify-update": "Enable update notification",
  exclude:
    "Exclude certain files or folders from sync, you can use glob patterns",
  depth:
    "Maximum depth if you have performance issues (not everywhere yet: only on existing mirrors and watch scenario)"
};

var typeInfo = {
  depth: "number"
};

var notifyPriority = {
  error: "high",
  copy: "normal",
  remove: "normal",
  watch: "normal",
  "max-depth": "low",
  "no-delete": "low"
};

function help() {
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
  var keys = (opts.boolean as string[])
    .map(function(opt) {
      var key = chalk.blue("--[no-]" + opt);
      if (Array.isArray(opts.alias[opt]) && opts.alias[opt].length > 0) {
        key +=
          ", " +
          (opts.alias[opt] as string[])
            .map(function(a) {
              return chalk.blue("[--no]-" + a);
            })
            .join(", ");
      } else if (opts.alias[opt]) {
        key += ", " + chalk.blue("[--no]-" + opts.alias[opt]);
      }
      return { opt: opt, key: key };
    })
    .concat(
      (opts.string as string[]).map(function(opt) {
        var arg = "<" + (typeInfo[opt] || "value") + ">";
        var key = chalk.blue("--" + opt) + "=" + arg;
        if (Array.isArray(opts.alias[opt]) && opts.alias[opt].length > 0) {
          key +=
            ", " +
            (opts.alias[opt] as string[])
              .map(function(a) {
                return chalk.blue("-" + a) + "=" + arg;
              })
              .join(", ");
        } else if (opts.alias[opt]) {
          key += ", " + chalk.blue("-" + opts.alias[opt]) + "=" + arg;
        }
        return { opt: opt, key: key };
      })
    );
  keys.forEach(function(k) {
    console.log(k.key);
    if (helpInfo[k.opt]) {
      console.log("\t%s", helpInfo[k.opt]);
    }
    if (opts.default[k.opt] !== undefined) {
      console.log("\t" + chalk.dim("Default: " + opts.default[k.opt]));
    }
    console.log("");
  });
}

var argv = minimist(process.argv.slice(2), opts);

const source = path.resolve(argv._[0]);
const target = path.resolve(argv._[1]);

const exclude: string[] = Array.isArray(argv.exclude)
  ? argv.exclude
  : [argv.exclude];

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

if (argv["notify-update"]) {
  updateNotifier({ pkg: pkg }).notify();
}

var root = process.cwd();

sync(
  source,
  target,
  {
    watch: argv.watch,
    delete: argv.delete,
    depth: Number(argv.depth),
    exclude: exclude
  },
  (event, data) => {
    var priority = notifyPriority[event] || "low";

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

      case "no-delete":
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
