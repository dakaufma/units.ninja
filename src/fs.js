export class MemoryFS {
  constructor(minFd) {
    this.nextFd = minFd || 4;
    this.fds = {}; // num -> {path, pos}
    this.files = {}; // path -> contents
  }

  path(fd) {
    return this.fds.hasOwnProperty(fd) ? this.fds[fd].path : null;
  }

  stat(path) {
    return this.files.hasOwnProperty(path) ? {
      size: this.files[path].length,
    } : null;
  }

  open(path, create) {
    if (!create && !this.files.hasOwnProperty(path)) {
      return -1;
    }

    const fd = this.nextFd++;
    this.fds[fd] = {path: path, pos: 0};
    return fd;
  }

  close(fd) {
    delete this.fds[fd];
  }

  read(fd, maxLen) {
    const finfo = this.fds[fd];
    const result = this.files[finfo.path].subarray(finfo.pos, finfo.pos + maxLen);
    finfo.pos += result.length;
    return result;
  }

  writeFile(path, contents) {
    this.files[path] = new TextEncoder().encode(contents);
  }
}
