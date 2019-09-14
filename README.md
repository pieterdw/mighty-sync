# mighty-sync

CLI to sync files between folders, with a watch and exclude option.
Originally based on [sync-files](https://github.com/byteclubfr/node-sync-files).

## Install

```sh
yarn global add mighty-sync
```

## Usage

### Command

```sh
mighty-sync [options] <source> <target>
        source is a file or folder which content will be mirrored to target
```

### Options

```sh
--watch, -w
        Watch changes in source and keep target in sync

--exclude=<string>, -e=<string>
        Exclude certain files or folders from sync by using glob patterns

--depth=<number>, -d=<number>
        Maximum depth if you have performance issues

--nodelete
        Prevent deleting extraneous files from target

--verbose, -v
        More output

--version
        Show version

--help, -h
        Show help
```

## Examples

```sh
mighty-sync --watch 'C:\Some folder\Source' 'C:\Some folder\Target'
```

```sh
mighty-sync --watch --exclude='somefile.png' --exclude='*.gif' --watch 'C:\Some folder\Source' 'C:\Some folder\Target'
```
