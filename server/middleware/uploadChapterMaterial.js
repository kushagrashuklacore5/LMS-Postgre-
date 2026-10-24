const { createUpload } = require("./uploadPolicy");

// Chapter attachments (see uploadPolicy.js for the rules)
module.exports = createUpload("chapter");
