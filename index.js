// Require SlimIO Dependencies
const Addon = require("@slimio/addon");

const prism = new Addon("prism")
    .lockOn("events");

prism.on("awake", () => {
    prism.ready();
});

module.exports = prism;
