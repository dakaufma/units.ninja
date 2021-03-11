import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import Bindings from './bindings.js';
import { MemoryFS } from './fs.js';

import "../node_modules/xterm/css/xterm.css";

(async () => {
  let term = new Terminal();

  // Init terminal
  let fitAddon = new FitAddon();
  term.loadAddon(fitAddon);

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


  // Write ninja to terminal
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

  // Set up units wasm
  const module = WebAssembly.compileStreaming(fetch('./units.wasm'));
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
        let onData: any;
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
      );
    }
  };

  // Load required files
  const preloadFile = async (name : string) => {
    const data = await (await fetch(name)).text();
    fs.writeFile(`/${name}`, data);
  };
  await preloadFile('definitions.units');
  await preloadFile('currency.units');

  // Tutorial animation
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

  term.writeln('Type "help" or see https://www.gnu.org/software/units/manual/units.html for more information');
  term.writeln('');

  // Launch units.wasm
  while (true) {
    term.writeln('');
    try {
      let statusCode = await new Bindings({
        fs,
        stdin,
        stdout: stdout,
        stderr: stdout,
        args: ['units'],
      }).run(await module);
    } catch (err) {
      term.writeln(err.message);
    }
  }
})();
