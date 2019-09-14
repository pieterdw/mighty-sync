import chokidar from "chokidar";
import fs from "fs-extra";
import { defaults } from "lodash";
import minimatch from "minimatch";
import path from "path";
import { SyncOptions } from "./types/SyncOptions";

type NotifyEvent = (event: string, data: any) => void;

const sync = (
  source: string,
  target: string,
  opts: SyncOptions,
  notify: NotifyEvent
) => {
  opts = defaults(opts || {}, {
    watch: false,
    delete: false,
    depth: Infinity,
    exclude: []
  });

  if (typeof opts.depth !== "number" || isNaN(opts.depth)) {
    notify("error", "Expected valid number for option 'depth'");
    return false;
  }

  // Initial mirror
  const mirrored = mirror(source, source, target, opts, notify, 0);

  if (!mirrored) {
    return false;
  }

  if (opts.watch) {
    // Watcher to keep in sync from that
    chokidar
      .watch(source, {
        persistent: true,
        depth: opts.depth,
        ignoreInitial: true,
        ignored: opts.exclude
      })
      //.on("raw", console.log.bind(console, "raw"))
      .on("ready", notify.bind(undefined, "watch", source))
      .on("add", watcherCopy(source, target, opts, notify))
      .on("addDir", watcherCopy(source, target, opts, notify))
      .on("change", watcherCopy(source, target, opts, notify))
      .on("unlink", watcherDestroy(source, target, opts, notify))
      .on("unlinkDir", watcherDestroy(source, target, opts, notify))
      .on("error", watcherError(opts, notify));
  }
};

const checkExclude = (exclude: string[], path: string) => {
  return (
    exclude &&
    exclude.some(x => !!x) &&
    exclude.some(excl => minimatch(path, excl))
  );
};

const watcherCopy = (
  source: string,
  target: string,
  opts: SyncOptions,
  notify: NotifyEvent
) => {
  return (f, stats) => {
    const relative = path.relative(source, f);
    if (!checkExclude(opts.exclude, relative)) {
      copy(f, path.join(target, relative), notify);
    }
  };
};

const watcherDestroy = (
  source: string,
  target: string,
  opts: SyncOptions,
  notify: NotifyEvent
) => {
  return f => {
    const relative = path.relative(source, f);
    if (!checkExclude(opts.exclude, relative)) {
      deleteExtra(path.join(target, relative), opts, notify);
    }
  };
};

const watcherError = (opts: SyncOptions, notify: NotifyEvent) => {
  return (err: any) => {
    notify("error", err);
  };
};

const mirror = (
  root: string,
  source: string,
  target: string,
  opts: SyncOptions,
  notify: NotifyEvent,
  depth: number
) => {
  if (checkExclude(opts.exclude, source)) {
    // exclude path
    return true;
  }
  if (root !== source) {
    const relative = path.relative(root, source);
    if (checkExclude(opts.exclude, relative)) {
      // exclude path
      return true;
    }
  }

  // Specifc case where the very source is gone
  let sourceStat;
  try {
    sourceStat = fs.statSync(source);
  } catch (e) {
    // Source not found: destroy target?
    if (fs.existsSync(target)) {
      return deleteExtra(target, opts, notify);
    }
  }

  let targetStat;
  try {
    targetStat = fs.statSync(target);
  } catch (e) {
    // Target not found? good, direct copy
    return copy(source, target, notify);
  }

  if (sourceStat.isDirectory() && targetStat.isDirectory()) {
    if (depth === opts.depth) {
      notify("max-depth", source);
      return true;
    }

    // copy from source to target
    const copied = fs.readdirSync(source).every(f => {
      return mirror(
        root,
        path.join(source, f),
        path.join(target, f),
        opts,
        notify,
        depth + 1
      );
    });

    // check for extraneous
    const deletedExtra = fs.readdirSync(target).every(f => {
      return (
        fs.existsSync(path.join(source, f)) ||
        deleteExtra(path.join(target, f), opts, notify)
      );
    });

    return copied && deletedExtra;
  } else if (sourceStat.isFile() && targetStat.isFile()) {
    // compare update-time before overwriting
    if (sourceStat.mtime > targetStat.mtime) {
      return copy(source, target, notify);
    } else {
      return true;
    }
  } else if (opts.delete) {
    // incompatible types: destroy target and copy
    return destroy(target, notify) && copy(source, target, notify);
  } else if (sourceStat.isFile() && targetStat.isDirectory()) {
    // incompatible types
    notify(
      "error",
      "Cannot copy file '" + source + "' to '" + target + "' as existing folder"
    );
    return false;
  } else if (sourceStat.isDirectory() && targetStat.isFile()) {
    // incompatible types
    notify(
      "error",
      "Cannot copy folder '" + source + "' to '" + target + "' as existing file"
    );
    return false;
  } else {
    throw new Error("Unexpected case: WTF?");
  }
};

const deleteExtra = (fileordir, opts: SyncOptions, notify: NotifyEvent) => {
  if (opts.delete) {
    return destroy(fileordir, notify);
  } else {
    notify("nodelete", fileordir);
    return true;
  }
};

const copy = (source: string, target: string, notify: NotifyEvent) => {
  notify("copy", [source, target]);
  try {
    fs.copySync(source, target);
    return true;
  } catch (e) {
    notify("error", e);
    return false;
  }
};

const destroy = (fileordir: string, notify: NotifyEvent) => {
  notify("remove", fileordir);
  try {
    fs.remove(fileordir);
    return true;
  } catch (e) {
    notify("error", e);
    return false;
  }
};

export default sync;
