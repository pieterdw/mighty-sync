import chokidar from "chokidar";
import fs from "fs-extra";
import { defaults } from "lodash";
import minimatch from "minimatch";
import path from "path";

interface SyncOptions {
  watch: boolean;
  delete: boolean;
  depth: number;
  exclude: string[];
}

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
  var mirrored = mirror(source, target, opts, notify, 0);

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

function watcherCopy(source, target, opts, notify) {
  return function(f, stats) {
    copy(f, path.join(target, path.relative(source, f)), notify);
  };
}

function watcherDestroy(source, target, opts, notify) {
  return function(f) {
    deleteExtra(path.join(target, path.relative(source, f)), opts, notify);
  };
}

function watcherError(opts, notify) {
  return function(err) {
    notify("error", err);
  };
}

function mirror(
  source: string,
  target: string,
  opts: SyncOptions,
  notify: NotifyEvent,
  depth: number
) {
  if (opts.exclude.some(excl => minimatch(source, excl))) {
    // exclude path
    return true;
  }

  // Specifc case where the very source is gone
  var sourceStat;
  try {
    sourceStat = fs.statSync(source);
  } catch (e) {
    // Source not found: destroy target?
    if (fs.existsSync(target)) {
      return deleteExtra(target, opts, notify);
    }
  }

  var targetStat;
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
    var copied = fs.readdirSync(source).every(function(f) {
      return mirror(
        path.join(source, f),
        path.join(target, f),
        opts,
        notify,
        depth + 1
      );
    });

    // check for extraneous
    var deletedExtra = fs.readdirSync(target).every(function(f) {
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
}

function deleteExtra(fileordir, opts, notify) {
  if (opts.delete) {
    return destroy(fileordir, notify);
  } else {
    notify("no-delete", fileordir);
    return true;
  }
}

function copy(source, target, notify) {
  notify("copy", [source, target]);
  try {
    fs.copySync(source, target);
    return true;
  } catch (e) {
    notify("error", e);
    return false;
  }
}

function destroy(fileordir, notify) {
  notify("remove", fileordir);
  try {
    fs.remove(fileordir);
    return true;
  } catch (e) {
    notify("error", e);
    return false;
  }
}

export default sync;
