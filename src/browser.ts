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

import { IDisposable } from 'xterm';
import Bindings, { OpenFlags, stringOut } from './bindings.js';
import { MemoryFS } from './fs.js';

declare const Terminal: typeof import('xterm').Terminal;
declare const FitAddon: typeof import('xterm-addon-fit');
declare const WebLinksAddon: typeof import('xterm-addon-web-links');

(async () => {
  let term = new Terminal();

  let fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);

  // {
  //   let storedHistory = localStorage.getItem('command-history');
  //   if (storedHistory) {
  //     localEcho.history.entries = storedHistory.split('\n');
  //     localEcho.history.rewind();
  //   }
  // }
  term.loadAddon(new WebLinksAddon.WebLinksAddon());

  term.open(document.body);
  term.attachCustomKeyEventHandler((e) => {
    if (e.code === "F5") {
      return false;
    } else if (e.ctrlKey) {
      if (["KeyC", "KeyR"].indexOf(e.code) !== -1) {
        return false;
      }
    }
    return true;
  });
  term.focus();
  fitAddon.fit();
  onresize = () => fitAddon.fit();

  const ANSI_GRAY = '\x1B[38;5;251m';
  const ANSI_BLUE = '\x1B[34;1m';
  const ANSI_RESET = '\x1B[0m';

  function writeIndented(s: string) {
    term.write(
      s
        .trimStart()
        .replace(/\n +/g, '\r\n')
        .replace(/https:\S+/g, ANSI_BLUE + '$&' + ANSI_RESET)
        .replace(/^#.*$/gm, ANSI_GRAY + '$&' + ANSI_RESET)
    );
  }

  term.writeln("                     ,¡▄▄▄▄▄µ");
  term.writeln("                 ▄▄█████████████▄▄");
  term.writeln("              ,▄███████████████████▄");
  term.writeln("       ▀██▄  ▄███████████████████████▄");
  term.writeln("        ▀██████████████[7mUNITS[0m███████████");
  term.writeln(",▄▄████████████████████████████████████▌");
  term.writeln(" \"▀▀▀████▀▀██▌  ¿\"└▀▀▀▀▀▀▀▀▀▀▀▀▀└└└  ▐██");
  term.writeln("           ███  ▀██▄▄▄▄▄  .▄▄▄▄▄██▀  ███");
  term.writeln("           ████▄  ▀▀▀▀▀     ▀▀▀▀▀  ▄████");
  term.writeln("           \"██████▄▄,         ,▄▄██████\"");
  term.writeln("            \"█████████████████████████└");
  term.writeln("              ▀█████████████████████▀");
  term.writeln("                ▀█████████████████▀");
  term.writeln("                   \"▀▀▀█████▀▀▀└");

  const module = WebAssembly.compileStreaming(fetch('./units.wasm'));

  // This is just for the autocomplete, so spawn the task and ignore any errors.
  const fs = new MemoryFS();

  const textEncoder = new TextEncoder();
  const textDecoder = new TextDecoder();

  let bufferedInput = "";
  const stdin = {
    async read(maxLen : number) {
      let line = '';
      if (bufferedInput.length > 0) {
        line = bufferedInput.substring(0, maxLen);
        bufferedInput = bufferedInput.substring(maxLen);
      } else {
        let onData: IDisposable;
        try {
          await new Promise<void>(resolve => {
            onData = term.onData(s => {
              // Ctrl+D
              if (s === '\x04') {
                term.writeln('^D');
                return resolve();
              }
              line = s.substring(0, maxLen);
              bufferedInput = s.substring(maxLen);
              return resolve();
              // Enter
              if (s === '\r') {
                term.writeln('');
                line += '\n';
                return resolve();
              }
              // Ignore other functional keys
              if (s.charCodeAt(0) < 32) {
                return;
              }
              // Backspace
              if (s === '\x7F') {
                term.write('\b \b');
                line = line.slice(0, -1);
                return;
              }
              term.write(s);
              line += s;
            });
          });
        } finally {
          onData!.dispose();
        }
      }
      return textEncoder.encode(line);
    }
  };

  const stdout = {
    write(data: Uint8Array) {
      let str = textDecoder.decode(data, { stream: true });
      term.write(
        str.replaceAll('\n', '\r\n')
        //data
      );
    }
  };

  const cmdParser = /(?:'(.*?)'|"(.*?)"|(\S+))\s*/gsuy;

  const preloadFile = async (name : string) => {
    const data = await (await fetch(name)).text();
    fs.writeFile(`/${name}`, data);
  };

  await preloadFile('definitions.units');
  await preloadFile('currency.units');

  let animateNext = () => {};
  let timeoutHandle = 0;
  let animateTimeScale = .7;
  const onData = term.onData(s => {
    animateTimeScale = 0;
    clearTimeout(timeoutHandle);
    timeoutHandle = 0;
    animateNext();
  });
  let animateInputs = [
    {init: "You have: ",                         text: "",           textDelay:  0, chunkDelay: 1000},
    {init: "You have: ",                         text: "500 miles",  textDelay: 70, chunkDelay: 0, endLine: true},
    {init: "You want: ",                         text: "",           textDelay:  0, chunkDelay: 1000},
    {init: "You want: ",                         text: "millilig",   textDelay: 70, chunkDelay: 500},
    {init: "You want: millilightyears    <TAB>", text: "",           textDelay:  0, chunkDelay: 800},
    {init: "You want: millilightyears         ", text: "",           textDelay:  0, chunkDelay: 400},
    {init: "You want: millilightseconds  <TAB>", text: "",           textDelay:  0, chunkDelay: 800},
    {init: "You want: millilightseconds       ", text: "",           textDelay:  0, chunkDelay: 400, endLine: true},
    {init: "        * 2.6840969",                text: "",           textDelay:  0, chunkDelay:   0, endLine: true},
    {init: "        / 0.37256479",               text: "",           textDelay:  0, chunkDelay:   0, endLine: true},
    {init: "",                                   text: "",           textDelay:  0, chunkDelay:   0, endLine: true},
  ];
  await new Promise<void>(resolve => {
    const render = (iline, i) => {
      if (iline >= animateInputs.length) {
        animateNext = () => {};
        resolve();
        return;
      }
      const {init, text, textDelay, chunkDelay, endLine} = animateInputs[iline];
      term.write("\b\b\b\b\b\b\b       \r" + init + text.substring(0, i));
      if (i > text.length) {
        if (endLine) {
          term.writeln("");
        }
        animateNext = () => render(iline + 1, 0);
        if (animateTimeScale) {
          timeoutHandle = setTimeout(animateNext, chunkDelay * animateTimeScale);
        } else {
          animateNext();
        }
      } else {
        animateNext = () => render(iline, i + 1);
        if (animateTimeScale) {
          timeoutHandle = setTimeout(animateNext, textDelay * animateTimeScale);
        } else {
          animateNext();
        }
      }
    };
    render(0, 0);
  });
  onData.dispose();

  while (true) {
    term.writeln('');
    // localStorage.setItem(
    //   'command-history',
    //   localEcho.history.entries.join('\n')
    // );
    try {
      let statusCode = await new Bindings({
        fs,
        stdin,
        stdout: stdout,
        stderr: stdout,
        args: ['units'],
      }).run(await module);
      if (statusCode !== 0) {
        term.writeln(`Exit code: ${statusCode}`);
      }
    } catch (err) {
      term.writeln(err.message);
    }
  }
})();
