// Require Node.js Dependencies
const {
    createWriteStream,
    promises: { access, mkdir }
} = require("fs");
const { join } = require("path");

// Require Third-party Dependencies
const uuid = require("uuid/v4");

// Require SlimIO Dependencies
const TimeMap = require("@slimio/timemap");
const Addon = require("@slimio/addon");

// CONSTANTS
const ARCHIVES_DIR = join(__dirname, "..", "..", "archives");
const STREAM_ID = new TimeMap(30000);


const Prism = new Addon("prism")
    .lockOn("events")
    .lockOn("socket");

Prism.on("awake", () => {
    Prism.ready();
});

async function createArchivesDir() {
    try {
        await access(ARCHIVES_DIR);
    }
    catch ({ code }) {
        if (code === "ENOENT") {
            await mkdir(ARCHIVES_DIR);
        }
    }
}
STREAM_ID.on("expiration", (key, value) => {
    console.log(`STREAM_ID key ${key} has expired!`);
});

Prism.on("start", async() => {
    await createArchivesDir();
});

function brotliDecompress(filename) {
    
}

async function startBundle(header, name) {
    const writeStream = createWriteStream(join(ARCHIVES_DIR, name));
    const id = uuid();
    STREAM_ID.set(id, writeStream);

    return id;
}

async function sendBundle(header, id, chunk) {
    if (!STREAM_ID.has(id)) {
        throw new Error(`Write stream doesn't exist for id ${id}`);
    }
    const writeStream = STREAM_ID.get(id);
    writeStream.write(chunk);
}

async function endBundle(header, id) {
    try {
        const stream = STREAM_ID.get(id);
        stream.destroy();
        STREAM_ID.delete(id);

        return true;
    }
    catch (err) {
        return false;
    }
}

Prism.registerCallback("start_bundle", startBundle);
Prism.registerCallback("send_bundle", sendBundle);
Prism.registerCallback("end_bundle", endBundle);

module.exports = Prism;
