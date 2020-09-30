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

import Bindings, { OpenFlags } from './bindings.js';
import { FileOrDir, OpenFiles } from './fileSystem.js';

declare const Terminal: typeof import('xterm').Terminal;
declare const LocalEchoController: any;
declare const FitAddon: any;

(async () => {
  const module = WebAssembly.compileStreaming(fetch('./uutils.async.wasm'));

  let term = new Terminal();
  let fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  let localEcho = new LocalEchoController();
  term.loadAddon(localEcho);

  const stdout = {
    async write(data: Uint8Array) {
      let startIndex = 0;
      let newLine: number;
      while ((newLine = data.indexOf(10, startIndex)) !== -1) {
        await new Promise(resolve =>
          term.writeln(data.subarray(startIndex, newLine), resolve)
        );
        startIndex = newLine + 1;
      }
      await new Promise(resolve =>
        term.write(data.subarray(startIndex), resolve)
      );
    }
  };

  const cmdParser = /(?:'(.*?)'|"(.*?)"|(\S+))\s*/gsuy;

  let preOpen: Record<string, FileSystemDirectoryHandle> = {};
  preOpen['/sandbox'] = await FileSystemDirectoryHandle.getSystemDirectory({
    type: 'sandbox'
  });

  term.open(document.body);

  term.writeln('Welcome to a shell powered by WebAssembly, WASI and File System Access API!');
  term.writeln('');
  term.writeln('Right now you have /sandbox mounted to a persistent sandbox filesystem.');
  term.writeln('To mount a real directory, type "mount /some/path".');
  term.writeln('To view a list of commands, type "help".');
  term.writeln('');
  term.writeln('Happy hacking!');

  fitAddon.fit();
  onresize = () => fitAddon.fit();

  while (true) {
    let line = await localEcho.read('$ ');
    let args = Array.from(
      line.matchAll(cmdParser),
      ([, s1, s2, s3]) => s1 ?? s2 ?? s3
    );
    try {
      if (!args.length) {
        continue;
      }
      if (args[0] === 'help') {
        args[0] = '--help';
      }
      if (args[0] === 'mount') {
        preOpen[args[1]] = await chooseFileSystemEntries({
          type: 'open-directory'
        });
        continue;
      }
      let openFiles = new OpenFiles(preOpen);
      let redirectedStdout;
      if (args[args.length - 2] === '>') {
        let path = args.pop();
        let { preOpen, relativePath } = openFiles.findRelPath(path);
        args.pop(); // '>'
        let handle = await preOpen.getFileOrDir(
          relativePath,
          FileOrDir.File,
          OpenFlags.Create
        );
        redirectedStdout = await handle.createWritable();
      }
      let statusCode = await new Bindings({
        openFiles,
        stdout: redirectedStdout ?? stdout,
        stderr: stdout,
        args,
        env: {
          RUST_BACKTRACE: '1'
        }
      }).run(await module);
      if (redirectedStdout) {
        await redirectedStdout.close();
      }
      if (statusCode !== 0) {
        term.writeln(`Exit code: ${statusCode}`);
      }
    } catch (err) {
      term.writeln(err.message);
    }
  }
})();
