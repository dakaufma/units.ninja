# units.ninja

Live at [https://units.ninja](https://units.ninja)

![ninja](favicon.webp)

GNU Units in the browser, for all those poor people who don't have it installed 
locally. Implementation (WASI + WASM) was sufficiently painful that 
I'm not going to brag about it or recommend similar projects. But hey, it works!

# References

WASM/WASI framework was forked (and very heavily modified) from 
[wasi-fs-access][1].

units.wasm comes from [units-wasm][2], a fork of units (2.21) modified to 
compile for WebAssembly.

Units is built with [linenoise][3], slightly modified to compile for 
WebAssembly, instead of readline.

[1]: https://github.com/GoogleChromeLabs/wasi-fs-access.git
[2]: https://github.com/dakaufma/units-wasm
[3]: https://github.com/dakaufma/linenoise
