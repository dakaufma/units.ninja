'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const path = require("path");
const getDataView = (() => {
    const cache = new WeakMap();
    return (buf) => {
        let dataView = cache.get(buf);
        if (!dataView) {
            dataView = new DataView(buf);
            cache.set(buf, dataView);
        }
        return dataView;
    };
})();
function std(name, size) {
    let get = DataView.prototype[`get${name}`];
    let set = DataView.prototype[`set${name}`];
    return {
        size,
        align: size,
        get(buf, ptr) {
            return get.call(getDataView(buf), ptr, true);
        },
        set(buf, ptr, value) {
            return set.call(getDataView(buf), ptr, value, true);
        }
    };
}
const string = (() => {
    const textEncoder = new TextEncoder();
    const textDecoder = new TextDecoder();
    return {
        get(buf, ptr, len) {
            return textDecoder.decode(new Uint8Array(buf, ptr, len));
        },
        set(buf, ptr, value, len = value.length) {
            let { read } = textEncoder.encodeInto(value, new Uint8Array(buf, ptr, len));
            if (read < value.length) {
                throw new Error(`Insufficient space.`);
            }
        }
    };
})();
function alignTo(ptr, align) {
    let mismatch = ptr % align;
    if (mismatch) {
        ptr += align - mismatch;
    }
    return ptr;
}
function struct(desc) {
    class Ctor {
        constructor(_buf, _ptr) {
            this._buf = _buf;
            this._ptr = _ptr;
        }
    }
    let offset = 0;
    let structAlign = 0;
    for (let name in desc) {
        let type = desc[name];
        let fieldAlign = type.align;
        structAlign = Math.max(structAlign, fieldAlign);
        offset = alignTo(offset, fieldAlign);
        const fieldOffset = offset;
        Object.defineProperty(Ctor.prototype, name, {
            get() {
                return type.get(this._buf, this._ptr + fieldOffset);
            },
            set(value) {
                type.set(this._buf, this._ptr + fieldOffset, value);
            }
        });
        offset += type.size;
    }
    offset = alignTo(offset, structAlign);
    return {
        size: offset,
        align: structAlign,
        get(buf, ptr) {
            return new Ctor(buf, ptr);
        }
    };
}
function enumer(desc) {
    return {
        size: desc.base.size,
        align: desc.base.align,
        get(buf, ptr) {
            let id = desc.base.get(buf, ptr);
            let name = desc.variants[id];
            if (name === undefined) {
                throw new TypeError(`Invalid ID ${id}.`);
            }
            return name;
        },
        set(buf, ptr, value) {
            let id = desc.variants.indexOf(value);
            if (id === -1) {
                throw new TypeError(`Invalid variant ${value}.`);
            }
            desc.base.set(buf, ptr, id);
        }
    };
}
const int8_t = std('Int8', 1);
const uint8_t = std('Uint8', 1);
const int16_t = std('Int16', 2);
const uint16_t = std('Uint16', 2);
const int32_t = std('Int32', 4);
const uint32_t = std('Uint32', 4);
const int64_t = std('bigint64', 8);
const uint64_t = std('BigUint64', 8);
const size_t = uint32_t;
const preopentype_t = enumer({
    base: int8_t,
    variants: ['dir']
});
const prestat_t = struct({
    type: preopentype_t,
    nameLen: size_t
});
const fd_t = uint32_t;
const iovec_t = struct({
    bufPtr: uint32_t,
    bufLen: size_t
});
const filetype_t = enumer({
    base: uint8_t,
    variants: [
        'unknown',
        'blockDevice',
        'charDevice',
        'directory',
        'regularFile',
        'socketDgram',
        'socketStream',
        'symbolicLink'
    ]
});
const fdflags_t = uint16_t;
const rights_t = uint64_t;
const fdstat_t = struct({
    filetype: filetype_t,
    flags: fdflags_t,
    rightsBase: rights_t,
    rightsInheriting: rights_t
});
const dircookie_t = uint64_t;
const inode_t = uint64_t;
const dirent_t = struct({
    next: dircookie_t,
    ino: inode_t,
    nameLen: uint32_t,
    type: filetype_t
});
const device_t = uint64_t;
const linkcount_t = uint32_t;
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
const PREOPEN = '/sandbox';
const PREOPEN_FD = 3;
module.exports = ({ memory, env, args }) => {
    const openFiles = (() => {
        let nextFd = PREOPEN_FD;
        let openFiles = new Map([
            [
                0,
                {
                    realFd: 0,
                    get path() {
                        throw new Error('Tried to resolve path relatively to stdin.');
                    }
                }
            ],
            [
                1,
                {
                    realFd: 1,
                    get path() {
                        throw new Error('Tried to resolve path relatively to stdout.');
                    }
                }
            ],
            [
                2,
                {
                    realFd: 2,
                    get path() {
                        throw new Error('Tried to resolve path relatively to stderr.');
                    }
                }
            ]
        ]);
        function open(path) {
            openFiles.set(nextFd, {
                path,
                realFd: fs.openSync(path, 0)
            });
            return nextFd++;
        }
        open('.');
        return {
            open,
            get(fd) {
                let file = openFiles.get(fd);
                if (!file) {
                    throw new Error('Tried to retrieve a non-existing file.');
                }
                return file;
            },
            close(fd) {
                if (!openFiles.delete(fd)) {
                    throw new Error('Tried to close a non-existing file.');
                }
            }
        };
    })();
    function resolvePath(dirFd, pathPtr, pathLen) {
        return path.resolve(openFiles.get(dirFd).path, string.get(memory.buffer, pathPtr, pathLen));
    }
    function forEachIoVec(fd, iovsPtr, iovsLen, handledPtr, cb) {
        let { realFd } = openFiles.get(fd);
        let totalHandled = 0;
        for (let i = 0; i < iovsLen; i++) {
            let iovec = iovec_t.get(memory.buffer, iovsPtr);
            let buf = new Uint8Array(memory.buffer, iovec.bufPtr, iovec.bufLen);
            let handled = cb(realFd, buf, 0, buf.length, null);
            totalHandled += handled;
            if (handled < iovec.bufLen) {
                break;
            }
            iovsPtr += iovec_t.size;
        }
        size_t.set(memory.buffer, handledPtr, totalHandled);
    }
    let envOffsets = [];
    let envBuf = '';
    for (let key in env) {
        envOffsets.push(envBuf.length);
        envBuf += `${key}=${env[key]}\0`;
    }
    let argOffsets = [];
    let argBuf = '';
    for (let arg of args) {
        argOffsets.push(argBuf.length);
        argBuf += `${arg}\0`;
    }
    return {
        fd_prestat_get(fd, prestatPtr) {
            if (fd !== PREOPEN_FD) {
                return 8 /* BADF */;
            }
            let prestat = prestat_t.get(memory.buffer, prestatPtr);
            prestat.type = 'dir';
            prestat.nameLen = PREOPEN.length;
        },
        fd_prestat_dir_name(fd, pathPtr, pathLen) {
            if (fd != PREOPEN_FD) {
                return 8 /* BADF */;
            }
            string.set(memory.buffer, pathPtr, PREOPEN, pathLen);
        },
        environ_sizes_get(countPtr, sizePtr) {
            size_t.set(memory.buffer, countPtr, envOffsets.length);
            size_t.set(memory.buffer, sizePtr, envBuf.length);
        },
        environ_get(environPtr, environBufPtr) {
            new Uint32Array(memory.buffer, environPtr, envOffsets.length).set(envOffsets.map(offset => environBufPtr + offset));
            string.set(memory.buffer, environBufPtr, envBuf);
        },
        args_sizes_get(argcPtr, argvBufSizePtr) {
            size_t.set(memory.buffer, argcPtr, argOffsets.length);
            size_t.set(memory.buffer, argvBufSizePtr, argBuf.length);
        },
        args_get(argvPtr, argvBufPtr) {
            new Uint32Array(memory.buffer, argvPtr, argOffsets.length).set(argOffsets.map(offset => argvBufPtr + offset));
            string.set(memory.buffer, argvBufPtr, argBuf);
        },
        proc_exit(code) {
            process.exit(code);
        },
        random_get(bufPtr, bufLen) {
            require('crypto').randomFillSync(new Uint8Array(memory.buffer, bufPtr, bufLen));
        },
        path_open(dirFd, dirFlags, pathPtr, pathLen, oFlags, fsRightsBase, fsRightsInheriting, fsFlags, fdPtr) {
            fd_t.set(memory.buffer, fdPtr, openFiles.open(resolvePath(dirFd, pathPtr, pathLen)));
        },
        fd_close(fd) {
            openFiles.close(fd);
        },
        fd_read(fd, iovsPtr, iovsLen, nreadPtr) {
            forEachIoVec(fd, iovsPtr, iovsLen, nreadPtr, fs.readSync);
        },
        fd_write(fd, iovsPtr, iovsLen, nwrittenPtr) {
            forEachIoVec(fd, iovsPtr, iovsLen, nwrittenPtr, fs.writeSync);
        },
        fd_fdstat_get(fd, fdstatPtr) {
            let fdstat = fdstat_t.get(memory.buffer, fdstatPtr);
            fdstat.filetype = fs.fstatSync(openFiles.get(fd).realFd).isDirectory()
                ? 'directory'
                : 'regularFile';
            fdstat.flags = 0;
            fdstat.rightsBase = -1n;
            fdstat.rightsInheriting = -1n;
        },
        path_create_directory(dirFd, pathPtr, pathLen) {
            fs.mkdirSync(resolvePath(dirFd, pathPtr, pathLen));
        },
        path_rename(oldDirFd, oldPathPtr, oldPathLen, newDirFd, newPathPtr, newPathLen) {
            fs.renameSync(resolvePath(oldDirFd, oldPathPtr, oldPathLen), resolvePath(newDirFd, newPathPtr, newPathLen));
        },
        path_remove_directory(dirFd, pathPtr, pathLen) {
            fs.rmdirSync(resolvePath(dirFd, pathPtr, pathLen));
        },
        fd_readdir(fd, bufPtr, bufLen, cookie, bufUsedPtr) {
            const initialBufPtr = bufPtr;
            let items = fs
                .readdirSync(openFiles.get(fd).path, { withFileTypes: true })
                .slice(Number(cookie));
            for (let item of items) {
                let itemSize = dirent_t.size + item.name.length;
                if (bufLen < itemSize) {
                    bufPtr += bufLen;
                    break;
                }
                let dirent = dirent_t.get(memory.buffer, bufPtr);
                dirent.next = ++cookie;
                dirent.ino = 0n; // TODO
                dirent.nameLen = item.name.length;
                dirent.type = item.isDirectory() ? 'directory' : 'regularFile';
                string.set(memory.buffer, bufPtr + dirent_t.size, item.name);
                bufPtr += itemSize;
                bufLen -= itemSize;
            }
            size_t.set(memory.buffer, bufUsedPtr, bufPtr - initialBufPtr);
        },
        path_readlink(dirFd, pathPtr, pathLen, bufPtr, bufLen, bufUsedPtr) { },
        path_filestat_get(dirFd, flags, pathPtr, pathLen, filestatPtr) {
            let path = resolvePath(dirFd, pathPtr, pathLen);
            let info = fs.statSync(path, { bigint: true });
            let filestat = filestat_t.get(memory.buffer, filestatPtr);
            filestat.dev = 0n;
            filestat.ino = 0n; // TODO
            filestat.filetype = info.isDirectory() ? 'directory' : 'regularFile';
            filestat.nlink = 0;
            // https://github.com/DefinitelyTyped/DefinitelyTyped/issues/30471#issuecomment-480900510
            filestat.size = info.size;
            filestat.accessTime = info.atimeNs;
            filestat.modTime = info.mtimeNs;
            filestat.changeTime = info.ctimeNs;
        },
        fd_seek(fd, offset, whence, filesizePtr) { }
    };
};
