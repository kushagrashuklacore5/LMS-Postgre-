const { createUpload } = require("./uploadPolicy");

// Course materials: videos, documents and images (see uploadPolicy.js for the rules)
module.exports = createUpload("material");
