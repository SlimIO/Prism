// Require Node.js Dependencies
const { access, mkdir } = require("fs").promises;
const { join } = require("path");

// CONSTANTS
const ARCHIVES_DIR = join(__dirname, "..", "..", "archives");

// Require SlimIO Dependencies
const Addon = require("@slimio/addon");

const Prism = new Addon("prism")
    .lockOn("events");

Prism.on("awake", () => {
    prism.ready();
});

async function createArchivesDir() {
    try {
        await access(ARCHIVES_DIR);
    }
    catch ({ code }) {
        if (code === "ENOENT") {
            await mkdir(ARCHIVES_DIRà);
        }
    }
}

async function receiveBundle(readableStream, name) {
    await createArchivesDir();
    readableStream.pipe(join(ARCHIVES_DIR, name));
}


Prism.registerCallback("receive_bundle", receiveBundle);

module.exports = Prism;
