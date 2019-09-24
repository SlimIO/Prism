# Prism
![version](https://img.shields.io/badge/version-0.1.0-blue.svg)
[![Maintenance](https://img.shields.io/badge/Maintained%3F-yes-green.svg)](https://github.com/SlimIO/is/commit-activity)
![MIT](https://img.shields.io/github/license/mashape/apistatus.svg)

SlimIO Prism Addon. This addon has been designed to be a Distribution Server (it manage archive of Addons).

<p align="center">
<img src="https://i.imgur.com/JgBzmuT.png">
</p>

## Getting Started
This package is available in the SlimIO Package Registry and can be easily installed with [SlimIO CLI](https://github.com/SlimIO/CLI).

```bash
$ slimio --add prism
# or
$ slimio --add https://github.com/SlimIO/Prism
```

## Tcp-Sdk code to transfert archives

```js
// Require Node.js Dependencies
const { createReadStream } = require("fs");
const { resolve } = require("path");

// Require Third-party Dependencies
const TcpSdk = require("@slimio/tcp-sdk");

async function sendArchive(client, name) {
    const id = await client.sendOne("prism.start_bundle", name);

    const readStream = createReadStream(resolve("archives", name));
    try {
        for await (const chunk of readStream) {
            await client.sendOne("prism.send_bundle", [id, chunk.toJSON()]);
        }
        await client.sendOne("prism.end_bundle", id);
    }
    catch (error) {
        readStream.close();
    }
}

async function main() {
    const client = new TcpSdk({ host: "localhost", port: 1337 });
    client.catch((err) => console.error(err));
    await client.once("connect", 1000);

    try {
        await sendArchive(client, "Addon-aggregator-0.1.0.tar");
        
        // Send install callback (depending on your need).
        await client.sendOne("prism.install_archive", ["aggregator", "0.1.0"]);
    }
    finally {
        client.close();
    }
}
main().catch(console.error);

```

## Dependencies

|Name|Refactoring|Security Risk|Usage|
|---|---|---|---|
|[@slimio/addon](https://github.com/SlimIO/Addon)|Minor|Low|Addon container|

## License
MIT
