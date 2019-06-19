// Require Node.js Dependencies
const { access, mkdir } = require("fs").promises;
const { join } = require("path");

// CONSTANTS
const ARCHIVES_DIR = join(__dirname, "..", "..", "archives");

// Require SlimIO Dependencies
const Addon = require("@slimio/addon");

const Prism = new Addon("prism")
    .lockOn("events")
    .lockOn("socket");

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

Prism.on("start", async() => {
    await createArchivesDir();
});

async function receiveBundle(header, readableStream, name) {
    readableStream.pipe(join(ARCHIVES_DIR, name));
}


Prism.registerCallback("receive_bundle", receiveBundle);

module.exports = Prism;
