// Copyright 2020 Google Inc. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// @ts-ignore
import { instantiate } from '../node_modules/asyncify-wasm/dist/asyncify.mjs';
import {
  enumer,
  ptr,
  string,
  struct,
  taggedUnion,
  TargetType,
  TypeDesc,
  int8_t,
  uint8_t,
  uint16_t,
  uint32_t,
  uint64_t,
  size_t
} from './type-desc.js';

export enum E {
  SUCCESS = 0,
  ACCES = 2,
  BADF = 8,
  CANCELED = 11,
  EXIST = 20,
  INVAL = 28,
  ISDIR = 31,
  NOENT = 44,
  NOSYS = 52,
  NOTDIR = 54,
  NOTEMPTY = 55,
  NOTCAPABLE = 76
}

export class ExitStatus {
  constructor(public statusCode: number) {}
}

const enum PreOpenType {
  Dir
}
const preopentype_t = enumer<PreOpenType>(int8_t);

const prestat_t = struct({
  type: preopentype_t,
  nameLen: size_t
});
type prestat_t = TargetType<typeof prestat_t>;

export type fd_t = number & { _name: 'fd' };
export const fd_t = uint32_t as TypeDesc<fd_t>;

const iovec_t = struct({
  bufPtr: uint32_t,
  bufLen: size_t
});
type iovec_t = TargetType<typeof iovec_t>;

const enum FileType {
  Unknown,
  BlockDevice,
  CharacterDevice,
  Directory,
  RegularFile,
  SocketDatagram,
  SocketStream,
  SymbolicLink
}
const filetype_t = enumer<FileType>(uint8_t);

const fdflags_t = enumer<FdFlags>(uint16_t);

const rights_t = uint64_t;

const fdstat_t = struct({
  filetype: filetype_t,
  flags: fdflags_t,
  rightsBase: rights_t,
  rightsInheriting: rights_t
});
type fdstat_t = TargetType<typeof fdstat_t>;

const dircookie_t = uint64_t;

const inode_t = uint64_t;

const dirent_t = struct({
  next: dircookie_t,
  ino: inode_t,
  nameLen: uint32_t,
  type: filetype_t
});
type dirent_t = TargetType<typeof dirent_t>;

const device_t = uint64_t;

const linkcount_t = uint64_t;

const filesize_t = uint64_t;

const timestamp_t = uint64_t;

const filestat_t = struct({
  dev: device_t,
  ino: inode_t,
  filetype: filetype_t,
  nlink: linkcount_t,
  size: filesize_t,
  accessTime: timestamp_t,
  modTime: timestamp_t,
  changeTime: timestamp_t
});
type filestat_t = TargetType<typeof filestat_t>;

const enum ClockId {
  Realtime,
  Monotonic,
  ProcessCPUTimeId,
  ThreadCPUTimeId
}
const clockid_t = enumer<ClockId>(uint32_t);

const userdata_t = uint64_t;

const enum EventType {
  Clock,
  FdRead,
  FdWrite
}
const eventtype_t = enumer<EventType>(uint8_t);

const enum SubclockFlags {
  Relative,
  Absolute
}
const subclockflags_t = enumer<SubclockFlags>(uint16_t);

const subscription_clock_t = struct({
  id: clockid_t,
  timeout: timestamp_t,
  precision: timestamp_t,
  flags: subclockflags_t
});

const subscription_fd_readwrite_t = struct({
  fd: fd_t
});

const subscription_union_t = taggedUnion({
  tag: eventtype_t,
  data: {
    [EventType.Clock]: subscription_clock_t,
    [EventType.FdRead]: subscription_fd_readwrite_t,
    [EventType.FdWrite]: subscription_fd_readwrite_t
  }
});

const subscription_t = struct({
  userdata: userdata_t,
  union: subscription_union_t
});
type subscription_t = TargetType<typeof subscription_t>;

const enum EventRwFlags {
  None,
  FdReadWriteHangup
}
const event_rw_flags_t = enumer<EventRwFlags>(uint16_t);

const event_fd_readwrite_t = struct({
  nbytes: filesize_t,
  flags: event_rw_flags_t
});

const event_t = struct({
  userdata: userdata_t,
  error: enumer<E>(uint16_t),
  type: eventtype_t,
  fd_readwrite: event_fd_readwrite_t
});
type event_t = TargetType<typeof event_t>;

export class SystemError extends Error {
  constructor(public readonly code: E, public readonly ignore = false) {
    super(`E${E[code]}`);
  }
}

const enum Whence {
  Current,
  End,
  Set
}

export const enum OpenFlags {
  Create = 1 << 0,
  Directory = 1 << 1,
  Exclusive = 1 << 2,
  Truncate = 1 << 3
}

export const enum FdFlags {
  Append = 1 << 0,
  DSync = 1 << 1,
  NonBlock = 1 << 2,
  RSync = 1 << 3,
  Sync = 1 << 4
}

interface In {
  read(len: number): Uint8Array | Promise<Uint8Array>;
}

interface Out {
  write(data: Uint8Array): void | Promise<void>;
}

export const bufferIn = (buffer: Uint8Array): In => {
  return {
    read: len => {
      let chunk = buffer.subarray(0, len);
      buffer = buffer.subarray(len);
      return chunk;
    }
  };
};

export const stringOut = (writeStr: (chunk: string) => void): Out => {
  let decoder = new TextDecoder();

  return {
    write: data => {
      writeStr(decoder.decode(data, { stream: true }));
    }
  };
};

export const lineOut = (writeLn: (chunk: string) => void): Out => {
  let lineBuf = '';

  return stringOut(chunk => {
    lineBuf += chunk;
    let lines = lineBuf.split('\n');
    lineBuf = lines.pop()!;
    for (let line of lines) {
      writeLn(line);
    }
  });
};

function unimplemented() {
  throw new SystemError(E.NOSYS);
}

class StringCollection {
  private readonly _offsets: Uint32Array;
  private readonly _buffer: string;

  constructor(strings: string[]) {
    this._offsets = new Uint32Array(strings.length);
    this._buffer = '';

    for (let [i, s] of strings.entries()) {
      this._offsets[i] = this._buffer.length;
      this._buffer += `${s}\0`;
    }
  }

  sizes_get(buf: ArrayBuffer, countPtr: ptr<number>, sizePtr: ptr<number>) {
    size_t.set(buf, countPtr, this._offsets.length);
    size_t.set(buf, sizePtr, this._buffer.length);
  }

  get(buf: ArrayBuffer, offsetsPtr: ptr<Uint32Array>, ptr: ptr<string>) {
    new Uint32Array(buf, offsetsPtr, this._offsets.length).set(
      this._offsets.map(offset => ptr + offset)
    );
    string.set(buf, ptr, this._buffer);
  }
}

export default class Bindings {
  private _fs : any;

  private _args: StringCollection;
  private _env: StringCollection;

  private _stdIn: In;
  private _stdOut: Out;
  private _stdErr: Out;

  private _abortSignal: AbortSignal | undefined;

  constructor({
    fs,
    stdin = { read: () => new Uint8Array() },
    stdout = lineOut(console.log),
    stderr = lineOut(console.error),
    args = [],
    env = {},
    abortSignal,
  }: {
    fs: any;
    stdin?: In;
    stdout?: Out;
    stderr?: Out;
    args?: string[];
    env?: Record<string, string>;
    abortSignal?: AbortSignal;
  }) {
    this._fs = fs;
    this._stdIn = stdin;
    this._stdOut = stdout;
    this._stdErr = stderr;
    this._args = new StringCollection(args);
    this._env = new StringCollection(
      Object.entries(env).map(([key, value]) => `${key}=${value}`)
    );
    this._abortSignal = abortSignal;
  }

  memory: WebAssembly.Memory | undefined;

  private _checkAbort() {
    if (this._abortSignal?.aborted) {
      throw new SystemError(E.CANCELED);
    }
  }

  private _wait(ms: number) {
    return new Promise((resolve, reject) => {
      let id = setTimeout(resolve, ms);
      this._abortSignal?.addEventListener('abort', () => {
        clearTimeout(id);
        reject(new SystemError(E.CANCELED));
      });
    });
  }

  private _getBuffer() {
    let { memory } = this;
    if (!memory) {
      throw new Error('Memory not yet initialised.');
    }
    return memory.buffer;
  }

  private _getFileStat(file: File | undefined, filestatPtr: ptr<filestat_t>) {
    let size = 0n;
    let time = 0n;
    if (file) {
      size = BigInt(file.size);
    }
    filestat_t.set(this._getBuffer(), filestatPtr, {
      dev: 0n,
      ino: 0n,
      filetype: file ? FileType.RegularFile : FileType.Directory,
      nlink: 0n,
      size,
      accessTime: time,
      modTime: time,
      changeTime: time
    });
  }

  private _path(fd : any) {
    return fd === 3 ? "/" : this._fs.path(fd);
  }

  getWasiImports() {
    const bindings: Record<string, (...args: any[]) => void | Promise<void>> = {
      fd_prestat_get: (fd: fd_t, prestatPtr: ptr<prestat_t>) => {
        const path = fd === 3 ? "/" : null;
        //console.log("fd_prestat_get:", path);
        if (!path) {
          throw new SystemError(E.BADF, true);
        }
        prestat_t.set(this._getBuffer(), prestatPtr, {
          type: PreOpenType.Dir,
          nameLen: path.length
        });
      },
      fd_prestat_dir_name: (
        fd: fd_t,
        pathPtr: ptr<string>,
        pathLen: number
      ) => {
        const path = fd === 3 ? "/" : null;
        //console.log("fd_prestat_dir_name:", path);
        if (!path) {
          throw new SystemError(E.BADF, true);
        }
        string.set(
          this._getBuffer(),
          pathPtr,
          path,
          pathLen
        );
      },
      environ_sizes_get: (countPtr: ptr<number>, sizePtr: ptr<number>) =>
        this._env.sizes_get(this._getBuffer(), countPtr, sizePtr),
      environ_get: (environPtr: ptr<Uint32Array>, environBufPtr: ptr<string>) =>
        this._env.get(this._getBuffer(), environPtr, environBufPtr),
      args_sizes_get: (argcPtr: ptr<number>, argvBufSizePtr: ptr<number>) =>
        this._args.sizes_get(this._getBuffer(), argcPtr, argvBufSizePtr),
      args_get: (argvPtr: ptr<Uint32Array>, argvBufPtr: ptr<string>) =>
        this._args.get(this._getBuffer(), argvPtr, argvBufPtr),
      proc_exit: (code: number) => {
        throw new ExitStatus(code);
      },
      path_open: async (
        dirFd: fd_t,
        dirFlags: number,
        pathPtr: ptr<string>,
        pathLen: number,
        oFlags: OpenFlags,
        fsRightsBase: bigint,
        fsRightsInheriting: bigint,
        fsFlags: FdFlags,
        fdPtr: ptr<fd_t>
      ) => {
        const name = string.get(this._getBuffer(), pathPtr, pathLen);
        const path = this._path(dirFd) + name;
        const fd = this._fs.open(path);
        //console.log("path_open:", dirFd, dirFlags, name, "=>", fd);
        if (fd === null) {
          throw new Error(`path_open failed; file does not exist ${path}`);
        }
        fd_t.set(
          this._getBuffer(),
          fdPtr,
          fd
        );
      },
      fd_fdstat_set_flags: (fd: fd_t, flags: FdFlags) => unimplemented(),
      fd_close: (fd: fd_t) => this._fs.close(fd),
      fd_read: async (
        fd: fd_t,
        iovsPtr: ptr<iovec_t>,
        iovsLen: number,
        nreadPtr: ptr<number>
      ) => {
        let read = fd === 0 ? this._stdIn.read : (maxLen) => this._fs.read(fd, maxLen);
        await this._forEachIoVec(iovsPtr, iovsLen, nreadPtr, async buf => {
          let chunk = await read(buf.length);
          //console.log("Read chunk", buf.length, chunk.length/*, chunk*/);
          buf.set(chunk);
          return chunk.length;
        });
      },
      fd_write: async (
        fd: fd_t,
        iovsPtr: ptr<iovec_t>,
        iovsLen: number,
        nwrittenPtr: ptr<number>
      ) => {
        let write = null;
        switch (fd) {
          case 1: {
            write = this._stdOut.write;
            break;
          }
          case 2: {
            write = this._stdErr.write;
            break;
          }
          default: {
            unimplemented();
            break;
          }
        }
        await this._forEachIoVec(iovsPtr, iovsLen, nwrittenPtr, async data => {
          await write(data);
          return data.length;
        });
      },
      fd_fdstat_get: async (fd: fd_t, fdstatPtr: ptr<fdstat_t>) => {
        let filetype;
        if (fd < 3) {
          filetype = FileType.CharacterDevice;
        } else if (this._fs.path(fd) !== null) {
          filetype = FileType.RegularFile;
        } else {
          filetype = FileType.Directory;
        }
        fdstat_t.set(this._getBuffer(), fdstatPtr, {
          filetype,
          flags: 0,
          rightsBase: /* anything */ -1n,
          rightsInheriting: /* anything but symlink */ ~(1n << 24n)
        });
      },
      path_filestat_get: (
        dirFd: fd_t,
        flags: any,
        pathPtr: ptr<string>,
        pathLen: number,
        filestatPtr: ptr<filestat_t>
      ) => {
        const name = string.get(this._getBuffer(), pathPtr, pathLen);
        const path = this._path(dirFd) + name;
        //console.log("path_filestat_get:", path);
        const stat = this._fs.stat(path)
        return this._getFileStat(stat, filestatPtr);
      },
      fd_seek: async (
        fd: fd_t,
        offset: bigint,
        whence: Whence,
        filesizePtr: ptr<bigint>
      ) => {
        return unimplemented();
      },
      clock_time_get: (
        id: ClockId,
        precision: bigint,
        resultPtr: ptr<bigint>
      ) => {
        let origin = id === ClockId.Realtime ? Date : performance;
        timestamp_t.set(
          this._getBuffer(),
          resultPtr,
          BigInt(Math.round(origin.now() * 1_000_000))
        );
      },
    };

    return new Proxy(bindings, {
      get: (target, name, receiver) => {
        let value = Reflect.get(target, name, receiver);
        if (typeof name !== 'string' || typeof value !== 'function') {
          //console.log(name, "syscall not intercepted");
          return value;
        }
        return async (...args: any[]) => {
          try {
            //console.log(name, args);
            await value(...args);
            this._checkAbort();
            return E.SUCCESS;
          } catch (err) {
            //console.log("...error");
            return translateError(err);
          }
        };
      }
    });
  }

  async run(module: WebAssembly.Module): Promise<number> {
    let {
      exports: { _start, memory }
    } = await instantiate(module, {
      wasi_snapshot_preview1: this.getWasiImports()
    });
    this.memory = memory;
    try {
      await _start();
      return 0;
    } catch (err) {
      if (err instanceof ExitStatus) {
        return err.statusCode;
      }
      throw err;
    }
  }

  private async _forEachIoVec(
    iovsPtr: ptr<iovec_t>,
    iovsLen: number,
    handledPtr: ptr<number>,
    cb: (buf: Uint8Array) => Promise<number>
  ) {
    let totalHandled = 0;
    for (let i = 0; i < iovsLen; i++) {
      let iovec = iovec_t.get(this._getBuffer(), iovsPtr);
      let buf = new Uint8Array(this._getBuffer(), iovec.bufPtr, iovec.bufLen);
      let handled = await cb(buf);
      this._checkAbort();
      totalHandled += handled;
      if (handled < iovec.bufLen) {
        break;
      }
      iovsPtr = (iovsPtr + iovec_t.size) as ptr<iovec_t>;
    }
    size_t.set(this._getBuffer(), handledPtr, totalHandled);
  }
}

function translateError(err: any): E {
  if (err instanceof SystemError) {
    // Warn about any error except the one we always expect.
    if (!err.ignore) {
      console.warn(err);
    }
    return err.code;
  }
  if (err instanceof DOMException) {
    let code;
    switch (err.name) {
      case 'NotFoundError':
        code = E.NOENT;
        break;
      case 'NotAllowedError':
      case 'DataCloneError':
      case 'SecurityError':
        code = E.ACCES;
        break;
      case 'InvalidModificationError':
        code = E.NOTEMPTY;
        break;
      case 'AbortError':
        code = E.CANCELED;
        break;
    }
    if (code) {
      console.warn(err);
      return code;
    }
  } else if (err instanceof TypeError || err instanceof RangeError) {
    console.warn(err);
    return E.INVAL;
  }
  throw err;
}
