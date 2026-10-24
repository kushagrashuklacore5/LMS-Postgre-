const { createUpload } = require("./uploadPolicy");

// Images only (see uploadPolicy.js for the rules)
module.exports = createUpload("image");
